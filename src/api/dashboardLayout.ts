import { authFetch, API_BASE } from "./auth";

/** Istanza di un widget nella dashboard. `config` è specifico del tipo. */
export interface DashboardWidget {
  id: string;
  type: string;
  config: Record<string, unknown>;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DashboardLayout {
  widgets: DashboardWidget[];
  settings: Record<string, unknown>;
}

/** Piattaforma del layout: desktop e mobile hanno layout indipendenti. */
export type DashboardPlatform = "desktop" | "mobile";

export interface UpdateDashboardLayoutPayload extends DashboardLayout {
  company_id: number;
  platform?: DashboardPlatform;
}

function parseApiError(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail === "string" && detail.trim()) return detail;
  }
  return fallback;
}

export async function getDashboardLayoutApi(
  companyId: number,
  platform: DashboardPlatform = "desktop",
): Promise<DashboardLayout> {
  const res = await authFetch(
    `${API_BASE}/api/v1/me/dashboard-layout?company_id=${companyId}&platform=${platform}`,
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Impossibile recuperare la dashboard")}`);
  }
  return res.json();
}

export async function updateDashboardLayoutApi(
  payload: UpdateDashboardLayoutPayload,
): Promise<DashboardLayout> {
  const res = await authFetch(`${API_BASE}/api/v1/me/dashboard-layout`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Impossibile salvare la dashboard")}`);
  }
  return res.json();
}
