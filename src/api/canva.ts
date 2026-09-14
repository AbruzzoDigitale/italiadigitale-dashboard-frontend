import { authFetch, API_BASE } from "./auth";

// ─────────────────────────────────────────────────────────────────────────────
// Integrazione Canva (Connect API) per-utente: collegamento OAuth + ricerca design.
// Il client OAuth (client_id/secret) è nel DB (company_settings, canva_oauth.*).
// Vedi app/api/v1/endpoints/canva.py sul backend.
// ─────────────────────────────────────────────────────────────────────────────

const BASE = `${API_BASE}/api/v1/canva`;

export interface CanvaStatus {
  connected: boolean;
  display_name: string | null;
  /** true se il client OAuth Canva è configurato sul server. */
  configured: boolean;
}

export interface CanvaDesign {
  id: string;
  title: string;
  url: string;
  thumbnail_url: string | null;
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string })?.detail ?? "Errore imprevisto");
  }
  return res.json() as Promise<T>;
}

export async function getCanvaStatusApi(): Promise<CanvaStatus> {
  return jsonOrThrow(await authFetch(`${BASE}/status`));
}

/** Ritorna l'URL di consenso Canva; al ritorno il backend reindirizza a `returnUrl`. */
export async function canvaAuthorizeApi(returnUrl: string): Promise<{ authorize_url: string }> {
  return jsonOrThrow(await authFetch(`${BASE}/authorize?return_url=${encodeURIComponent(returnUrl)}`));
}

export async function disconnectCanvaApi(): Promise<void> {
  const res = await authFetch(`${BASE}/disconnect`, { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string })?.detail ?? "Impossibile disconnettere Canva");
  }
}

/** Cerca i design dell'utente su Canva (richiede account collegato). */
export async function searchCanvaDesignsApi(q?: string): Promise<CanvaDesign[]> {
  const suffix = q ? `?q=${encodeURIComponent(q)}` : "";
  const data = await jsonOrThrow<{ designs: CanvaDesign[] }>(await authFetch(`${BASE}/designs${suffix}`));
  return data.designs;
}
