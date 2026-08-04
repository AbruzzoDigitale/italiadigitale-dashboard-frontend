import { authFetch, API_BASE } from "./auth";

// ─────────────────────────────────────────────────────────────────────────────
// Profili social gestiti dall'azienda (pagine/account dei clienti).
// Ogni profilo ha piattaforma (icona automatica lato UI), URL, note e può
// essere collegato a UN cliente; da lì è selezionabile nelle task e nei
// contratti di quel cliente. Vedi app/api/v1/endpoints/social_profiles.py.
// ─────────────────────────────────────────────────────────────────────────────

const BASE = `${API_BASE}/api/v1/social-profiles`;

/** Slug piattaforma: una di serie (loghi brand) oppure custom aziendale. */
export type SocialPlatform = string;

export const BUILTIN_SOCIAL_PLATFORMS = [
  "facebook",
  "instagram",
  "tiktok",
  "linkedin",
  "youtube",
] as const;

export const SOCIAL_PLATFORM_LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  youtube: "YouTube",
};

/** Etichetta compatta di un profilo: nome scelto, altrimenti l'URL ripulita. */
export function socialProfileLabel(p: { name: string; url: string }): string {
  if (p.name.trim()) return p.name.trim();
  return p.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
}

export interface SocialProfile {
  id: number;
  company_id: number;
  client_id: number | null;
  client_name: string | null;
  platform: SocialPlatform;
  /** Etichetta risolta dal backend (di serie o dalla piattaforma custom). */
  platform_label: string;
  platform_color: string | null;
  name: string;
  url: string;
  notes: string | null;
  /** Raggiungibilità Meta: valorizzata dall'endpoint di verifica. */
  meta_verified_at: string | null;
  meta_page_id: string | null;
  meta_ig_business_id: string | null;
  meta_verify_error: string | null;
  created_by: number | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface SocialProfileCreate {
  company_id: number;
  client_id?: number | null;
  platform: SocialPlatform;
  name?: string;
  url: string;
  notes?: string | null;
}

export interface SocialProfileUpdate {
  client_id?: number | null;
  platform?: SocialPlatform;
  name?: string;
  url?: string;
  notes?: string | null;
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string })?.detail ?? "Errore imprevisto");
  }
  return res.json() as Promise<T>;
}

export async function listSocialProfilesApi(params?: {
  companyId?: number | null;
  clientId?: number | null;
  platform?: SocialPlatform;
}): Promise<SocialProfile[]> {
  const qs = new URLSearchParams();
  if (params?.companyId != null) qs.set("company_id", String(params.companyId));
  if (params?.clientId != null) qs.set("client_id", String(params.clientId));
  if (params?.platform) qs.set("platform", params.platform);
  const query = qs.toString();
  return jsonOrThrow(await authFetch(`${BASE}${query ? `?${query}` : ""}`));
}

export async function createSocialProfileApi(body: SocialProfileCreate): Promise<SocialProfile> {
  const res = await authFetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return jsonOrThrow(res);
}

export async function updateSocialProfileApi(id: number, body: SocialProfileUpdate): Promise<SocialProfile> {
  const res = await authFetch(`${BASE}/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return jsonOrThrow(res);
}

/** Verifica se il profilo IG/FB è raggiungibile via API Meta (portfolio Business). */
export async function verifySocialProfileMetaApi(id: number): Promise<SocialProfile> {
  const res = await authFetch(`${BASE}/${id}/verify`, { method: "POST" });
  return jsonOrThrow(res);
}

export interface FeedChild {
  media_url: string | null;
  media_type: string | null;
  thumbnail_url: string | null;
}

export interface FeedPost {
  external_post_id: string | null;
  content_type: string;
  posted_at: string | null;
  permalink: string | null;
  caption: string | null;
  media_type: string | null;
  thumbnail_url: string | null;
  media_url: string | null;
  children: FeedChild[];
  like_count: number | null;
  comments_count: number | null;
}

export interface SocialProfileFeed {
  supported: boolean;
  error: string | null;
  posts: FeedPost[];
  stories: FeedPost[];
}

/** Anteprima live degli ultimi post di un profilo (IG/FB). Panoramica cliente. */
export async function getSocialProfileFeedApi(id: number, limit = 12): Promise<SocialProfileFeed> {
  return jsonOrThrow(await authFetch(`${BASE}/${id}/feed?limit=${limit}`));
}

/** Verifica in blocco più profili IG/FB. Ritorna i profili aggiornati. */
export async function verifySocialProfilesBulkApi(ids: number[]): Promise<SocialProfile[]> {
  const res = await authFetch(`${BASE}/verify-bulk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  return jsonOrThrow(res);
}

export async function deleteSocialProfileApi(id: number): Promise<void> {
  const res = await authFetch(`${BASE}/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string })?.detail ?? "Errore eliminazione profilo");
  }
}
