import { authFetch, API_BASE } from "./auth";

// ─────────────────────────────────────────────────────────────────────────────
// Firme email con editor a blocchi Unlayer (react-email-editor).
//   config = design Unlayer (JSON) per ri-editare
//   html   = HTML esportato da Unlayer (email-safe) per l'invio
// Vedi app/api/v1/endpoints/email_signatures.py sul backend.
// ─────────────────────────────────────────────────────────────────────────────

const BASE = `${API_BASE}/api/v1/email-signatures`;

/** Design Unlayer (struttura opaca gestita dall'editor). */
export type SignatureDesign = Record<string, unknown>;

export interface EmailSignature {
  id: number;
  company_id: number;
  name: string;
  config: SignatureDesign | null;
  html: string | null;
  is_default: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export interface SignatureSavePayload {
  name?: string;
  config?: SignatureDesign;
  html?: string;
  is_default?: boolean;
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string })?.detail ?? "Errore imprevisto");
  }
  return res.json() as Promise<T>;
}

export async function listSignaturesApi(companyId?: number): Promise<EmailSignature[]> {
  const suffix = companyId != null ? `?company_id=${companyId}` : "";
  return jsonOrThrow(await authFetch(`${BASE}${suffix}`));
}

export async function createSignatureApi(companyId: number, body: SignatureSavePayload): Promise<EmailSignature> {
  const res = await authFetch(`${BASE}?company_id=${companyId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return jsonOrThrow(res);
}

export async function updateSignatureApi(id: number, body: SignatureSavePayload): Promise<EmailSignature> {
  const res = await authFetch(`${BASE}/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return jsonOrThrow(res);
}

export async function deleteSignatureApi(id: number): Promise<void> {
  const res = await authFetch(`${BASE}/${id}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string })?.detail ?? "Impossibile eliminare");
  }
}

export async function setDefaultSignatureApi(id: number): Promise<EmailSignature> {
  return jsonOrThrow(await authFetch(`${BASE}/${id}/set-default`, { method: "POST" }));
}

/** Upload di un'immagine su GCS (usato dal callback immagini di Unlayer). Ritorna la URL pubblica. */
export async function uploadSignatureMediaApi(file: File): Promise<{ url: string }> {
  const fd = new FormData();
  fd.append("file", file);
  const token = localStorage.getItem("id_token");
  const res = await fetch(`${BASE}/media`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  return jsonOrThrow(res);
}
