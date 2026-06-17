import { authFetch, API_BASE } from "./auth";

function parseApiError(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const detail = (body as { detail?: unknown }).detail;
    const message = (body as { message?: unknown }).message;
    const error = (body as { error?: unknown }).error;
    return (
      (typeof detail === "string" && detail) ||
      (typeof message === "string" && message) ||
      (typeof error === "string" && error) ||
      fallback
    );
  }
  return fallback;
}

export interface PedConfiguration {
  id: number;
  company_id: number;
  name?: string | null;
  monthly_publications_total: number;
  tone_of_voice?: string | null;
  photo_posts_per_month: number;
  carousels_per_month: number;
  reels_per_month: number;
  stories_per_month: number;
  created_at: string;
  updated_at: string;
}

export interface PedConfigurationInline {
  monthly_publications_total: number;
  tone_of_voice?: string | null;
  photo_posts_per_month: number;
  carousels_per_month: number;
  reels_per_month: number;
  stories_per_month: number;
}

export async function listPedConfigurationsApi(companyId: number): Promise<PedConfiguration[]> {
  const res = await authFetch(`${API_BASE}/api/v1/ped-configurations?company_id=${companyId}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Impossibile recuperare le configurazioni PED"));
  }
  return res.json();
}
