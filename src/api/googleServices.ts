import { authFetch, API_BASE } from "./auth";

// ─────────────────────────────────────────────────────────────────────────────
// Collegamento account Google per-utente (OAuth): Drive, Calendar, Docs.
// Riusa il client OAuth Google del DB (company_settings, google_oauth.*).
// Vedi app/api/v1/endpoints/google_services.py sul backend.
// ─────────────────────────────────────────────────────────────────────────────

const BASE = `${API_BASE}/api/v1/google`;

export interface GoogleStatus {
  connected: boolean;
  email: string | null;
  display_name: string | null;
  /** true se il client OAuth Google è configurato sul server. */
  configured: boolean;
  /** Solo per l'account aziendale: ultimo errore di refresh, se c'è. */
  error?: string | null;
}

/**
 * "mine" = account personale dell'utente; "company" = account aziendale con cui
 * girano le automazioni (sincronizzazione del foglio rimborsi, archivio Drive).
 * Collegare e scollegare quello aziendale è riservato agli admin.
 */
export type GoogleScope = "mine" | "company";

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string })?.detail ?? "Errore imprevisto");
  }
  return res.json() as Promise<T>;
}

export async function getGoogleStatusApi(
  scope: GoogleScope = "mine",
  companyId?: number | null
): Promise<GoogleStatus> {
  const params = new URLSearchParams({ scope });
  if (companyId) params.set("company_id", String(companyId));
  return jsonOrThrow(await authFetch(`${BASE}/status?${params}`));
}

/** Ritorna l'URL di consenso Google; al ritorno il backend reindirizza a `returnUrl`. */
export async function googleAuthorizeApi(
  returnUrl: string,
  scope: GoogleScope = "mine"
): Promise<{ authorize_url: string }> {
  const params = new URLSearchParams({ return_url: returnUrl, scope });
  return jsonOrThrow(await authFetch(`${BASE}/authorize?${params}`));
}

export async function disconnectGoogleApi(
  scope: GoogleScope = "mine",
  companyId?: number | null
): Promise<void> {
  const params = new URLSearchParams({ scope });
  if (companyId) params.set("company_id", String(companyId));
  const res = await authFetch(`${BASE}/disconnect?${params}`, { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string })?.detail ?? "Impossibile disconnettere Google");
  }
}
