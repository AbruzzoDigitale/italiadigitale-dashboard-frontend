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
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string })?.detail ?? "Errore imprevisto");
  }
  return res.json() as Promise<T>;
}

export async function getGoogleStatusApi(): Promise<GoogleStatus> {
  return jsonOrThrow(await authFetch(`${BASE}/status`));
}

/** Ritorna l'URL di consenso Google; al ritorno il backend reindirizza a `returnUrl`. */
export async function googleAuthorizeApi(returnUrl: string): Promise<{ authorize_url: string }> {
  return jsonOrThrow(await authFetch(`${BASE}/authorize?return_url=${encodeURIComponent(returnUrl)}`));
}

export async function disconnectGoogleApi(): Promise<void> {
  const res = await authFetch(`${BASE}/disconnect`, { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string })?.detail ?? "Impossibile disconnettere Google");
  }
}
