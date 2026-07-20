import { authFetch, API_BASE } from "./auth";

export interface SidebarPreferences {
  /** Path (item.to) messi nei Preferiti. */
  favorites: string[];
  /** Ordine personalizzato dei path per gruppo, es. { commercial: ["/clients-situation","/clients"] }. */
  item_order: Record<string, string[]>;
  /** Ordine personalizzato delle categorie, es. ["operations","commercial",...]. */
  group_order: string[];
}

export interface UpdateSidebarPreferencesPayload extends SidebarPreferences {
  company_id: number;
}

function parseApiError(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail === "string" && detail.trim()) return detail;
  }
  return fallback;
}

export async function getSidebarPreferencesApi(companyId: number): Promise<SidebarPreferences> {
  const res = await authFetch(`${API_BASE}/api/v1/me/sidebar-preferences?company_id=${companyId}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Impossibile recuperare le preferenze sidebar")}`);
  }
  return res.json();
}

export async function updateSidebarPreferencesApi(
  payload: UpdateSidebarPreferencesPayload,
): Promise<SidebarPreferences> {
  const res = await authFetch(`${API_BASE}/api/v1/me/sidebar-preferences`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Impossibile salvare le preferenze sidebar")}`);
  }
  return res.json();
}
