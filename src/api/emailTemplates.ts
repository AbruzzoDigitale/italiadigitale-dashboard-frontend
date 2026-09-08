import { authFetch, API_BASE } from "./auth";

// ─────────────────────────────────────────────────────────────────────────────
// Modelli email riutilizzabili (aziendali/condivisi + personali).
//   scope="company"  → modello condiviso dell'organizzazione (CRUD solo admin);
//   scope="personal" → modello personale dell'utente.
// Il corpo NON include mai la firma: viene aggiunta in coda in anteprima/uso e
// non è rimovibile. Supporta segnaposto {{token}} (azienda.*/operatore.*/cliente.*).
// Vedi app/api/v1/endpoints/email_templates.py.
// ─────────────────────────────────────────────────────────────────────────────

const BASE = `${API_BASE}/api/v1/email-templates`;

export type EmailTemplateScope = "company" | "personal";
/** Filtro dell'elenco: "all" = modelli aziendali + i personali di chi chiede. */
export type EmailTemplateListScope = EmailTemplateScope | "all";

export interface EmailTemplate {
  id: number;
  company_id: number;
  user_id: number | null;
  scope: EmailTemplateScope;
  name: string;
  subject: string | null;
  body_html: string | null;
  config: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface EmailTemplateSave {
  name?: string | null;
  subject?: string | null;
  body_html?: string | null;
  config?: Record<string, unknown> | null;
  is_active?: boolean | null;
}

export interface EmailTemplateVariable {
  token: string;
  label: string;
  sample: string;
  group: string;
}

export interface EmailTemplatePreview {
  subject: string;
  /** Corpo con i token risolti (senza firma). */
  body_html: string;
  /** Firma del mittente (sempre presente, bloccata). */
  signature_html: string;
  /** Corpo + firma uniti = ciò che verrà inviato. */
  full_html: string;
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string })?.detail ?? "Errore imprevisto");
  }
  return res.json() as Promise<T>;
}

export async function listEmailTemplatesApi(
  companyId: number,
  scope: EmailTemplateListScope = "personal",
): Promise<EmailTemplate[]> {
  return jsonOrThrow(await authFetch(`${BASE}?company_id=${companyId}&scope=${scope}`));
}

export async function createEmailTemplateApi(
  companyId: number,
  scope: EmailTemplateScope,
  body: EmailTemplateSave,
): Promise<EmailTemplate> {
  return jsonOrThrow(
    await authFetch(`${BASE}?company_id=${companyId}&scope=${scope}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

export async function updateEmailTemplateApi(id: number, body: EmailTemplateSave): Promise<EmailTemplate> {
  return jsonOrThrow(
    await authFetch(`${BASE}/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

export async function deleteEmailTemplateApi(id: number): Promise<void> {
  const res = await authFetch(`${BASE}/${id}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) throw new Error("Impossibile eliminare il modello");
}

export async function listEmailTemplateVariablesApi(): Promise<EmailTemplateVariable[]> {
  return jsonOrThrow(await authFetch(`${BASE}/variables`));
}

export async function previewEmailTemplateApi(
  companyId: number,
  subject: string,
  bodyHtml: string,
): Promise<EmailTemplatePreview> {
  return jsonOrThrow(
    await authFetch(`${BASE}/preview?company_id=${companyId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, body_html: bodyHtml }),
    }),
  );
}
