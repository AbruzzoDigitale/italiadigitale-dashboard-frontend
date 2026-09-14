import { authFetch, API_BASE } from "./auth";

// ─────────────────────────────────────────────────────────────────────────────
// Piattaforme social CUSTOM per azienda (es. Threads, Pinterest): estendono
// le 5 di serie. I profili social referenziano lo slug; l'icona lato UI è un
// badge con iniziale + colore. Vedi app/api/v1/endpoints/social_platforms.py.
// ─────────────────────────────────────────────────────────────────────────────

const BASE = `${API_BASE}/api/v1/social-platforms`;

export interface CustomSocialPlatform {
  id: number;
  company_id: number;
  name: string;
  slug: string;
  color: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface SocialPlatformCreatePayload {
  company_id: number;
  name: string;
  slug?: string | null;
  color?: string | null;
}

export interface SocialPlatformUpdatePayload {
  name?: string;
  slug?: string | null;
  color?: string | null;
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string })?.detail ?? "Errore imprevisto");
  }
  return res.json() as Promise<T>;
}

export async function listSocialPlatformsApi(companyId?: number | null): Promise<CustomSocialPlatform[]> {
  const qs = companyId != null ? `?company_id=${companyId}` : "";
  return jsonOrThrow(await authFetch(`${BASE}${qs}`));
}

export async function createSocialPlatformApi(body: SocialPlatformCreatePayload): Promise<CustomSocialPlatform> {
  const res = await authFetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return jsonOrThrow(res);
}

export async function updateSocialPlatformApi(
  id: number,
  body: SocialPlatformUpdatePayload
): Promise<CustomSocialPlatform> {
  const res = await authFetch(`${BASE}/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return jsonOrThrow(res);
}

export async function deleteSocialPlatformApi(id: number): Promise<void> {
  const res = await authFetch(`${BASE}/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string })?.detail ?? "Errore eliminazione piattaforma");
  }
}
