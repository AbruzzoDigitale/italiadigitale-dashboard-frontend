import { authFetch, API_BASE } from "./auth";

// Ordinamento delle card in una colonna della board lavorazioni.
export type BoardSortMode = "deadline_asc" | "deadline_desc" | "urgency" | "custom";

export interface ColumnSort {
  mode: BoardSortMode;
  /** Lista ordinata di work_item id, valorizzata solo per mode="custom". */
  order: number[];
}

export interface WorkboardPreferences {
  /** Config di ordinamento per status di colonna, es. { planned: {...}, in_progress: {...} }. */
  column_sort: Record<string, ColumnSort>;
}

export interface UpdateWorkboardPreferencesPayload extends WorkboardPreferences {
  company_id: number;
}

function parseApiError(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail === "string" && detail.trim()) return detail;
  }
  return fallback;
}

export async function getWorkboardPreferencesApi(companyId: number): Promise<WorkboardPreferences> {
  const res = await authFetch(`${API_BASE}/api/v1/me/workboard-preferences?company_id=${companyId}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Impossibile recuperare le preferenze board")}`);
  }
  return res.json();
}

export async function updateWorkboardPreferencesApi(
  payload: UpdateWorkboardPreferencesPayload,
): Promise<WorkboardPreferences> {
  const res = await authFetch(`${API_BASE}/api/v1/me/workboard-preferences`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Impossibile salvare le preferenze board")}`);
  }
  return res.json();
}
