import { authFetch, API_BASE } from "./auth";

// ─────────────────────────────────────────────────────────────────────────────
// Template firma email a livello azienda (admin) + compilazione utente.
//   Admin: definisce un template HTML con segnaposto {{...}} e per ogni campo
//          decide etichetta/tipo/editabilità/default.
//   Utente: compila SOLO i campi editabili → la firma viene renderizzata.
// Vedi app/api/v1/endpoints/signature_templates.py e email_signatures.py.
// ─────────────────────────────────────────────────────────────────────────────

const TPL_BASE = `${API_BASE}/api/v1/company-signature-templates`;
const USER_BASE = `${API_BASE}/api/v1/email-signatures/company-template`;

export type SignatureFieldType = "text" | "email" | "tel" | "url" | "image";

export interface SignatureFieldDef {
  key: string;
  label?: string | null;
  type: SignatureFieldType;
  editable: boolean;
  default?: string | null;
}

export interface CompanyTemplate {
  id: number;
  company_id: number;
  name: string;
  html: string | null;
  config: Record<string, unknown> | null;
  fields: SignatureFieldDef[];
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface CompanyTemplateSave {
  name?: string | null;
  html?: string | null;
  config?: Record<string, unknown> | null;
  fields?: SignatureFieldDef[] | null;
  is_default?: boolean | null;
}

export interface UserTemplateFill {
  template_id: number | null;
  template_name: string | null;
  fields: SignatureFieldDef[];
  values: Record<string, string>;
  /** Chiavi dei campi che l'utente ha scelto di non mostrare (il blocco sparisce). */
  hidden: string[];
  rendered_html: string | null;
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string })?.detail ?? "Errore imprevisto");
  }
  return res.json() as Promise<T>;
}

// ── Admin ──────────────────────────────────────────────────────────────────
export async function listTemplatesApi(companyId: number): Promise<CompanyTemplate[]> {
  return jsonOrThrow(await authFetch(`${TPL_BASE}?company_id=${companyId}`));
}

export async function createTemplateApi(companyId: number, body: CompanyTemplateSave): Promise<CompanyTemplate> {
  return jsonOrThrow(
    await authFetch(`${TPL_BASE}?company_id=${companyId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

export async function updateTemplateApi(id: number, body: CompanyTemplateSave): Promise<CompanyTemplate> {
  return jsonOrThrow(
    await authFetch(`${TPL_BASE}/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

export async function deleteTemplateApi(id: number): Promise<void> {
  const res = await authFetch(`${TPL_BASE}/${id}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) throw new Error("Impossibile eliminare il template");
}

export async function previewTemplateApi(id: number, values: Record<string, string>): Promise<{ html: string }> {
  return jsonOrThrow(
    await authFetch(`${TPL_BASE}/${id}/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values }),
    })
  );
}

// ── Utente ─────────────────────────────────────────────────────────────────
export async function getMyTemplateFillApi(companyId: number): Promise<UserTemplateFill> {
  return jsonOrThrow(await authFetch(`${USER_BASE}?company_id=${companyId}`));
}

export async function previewMyTemplateApi(
  companyId: number,
  values: Record<string, string>,
  hidden: string[] = []
): Promise<UserTemplateFill> {
  return jsonOrThrow(
    await authFetch(`${USER_BASE}/preview?company_id=${companyId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values, hidden }),
    })
  );
}

export async function saveMyTemplateFillApi(
  companyId: number,
  values: Record<string, string>,
  hidden: string[] = []
): Promise<UserTemplateFill> {
  return jsonOrThrow(
    await authFetch(`${USER_BASE}?company_id=${companyId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values, hidden }),
    })
  );
}
