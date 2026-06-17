import { authFetch, API_BASE } from "./auth";

function parseApiError(body: unknown, fallback: string) {
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

export interface WorkArea {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateWorkAreaPayload {
  company_id: number;
  name: string;
  slug?: string | null;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  is_active?: boolean;
}

export type UpdateWorkAreaPayload = Partial<CreateWorkAreaPayload>;

export interface ListWorkAreasParams {
  include_inactive?: boolean;
  company_id?: number;
}

export async function listWorkAreasApi(
  params: ListWorkAreasParams = {}
): Promise<WorkArea[]> {
  const query = new URLSearchParams();
  if (params.include_inactive) {
    query.set("include_inactive", "true");
  }
  if (params.company_id != null) {
    query.set("company_id", String(params.company_id));
  }
  const url = `${API_BASE}/api/v1/work-areas${query.toString() ? `?${query.toString()}` : ""}`;
  const res = await authFetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Impossibile recuperare le aree di lavoro"));
  }
  return res.json();
}

export async function createWorkAreaApi(
  payload: CreateWorkAreaPayload
): Promise<WorkArea> {
  const res = await authFetch(`${API_BASE}/api/v1/work-areas`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Errore nella creazione area")}`);
  }
  return res.json();
}

export async function updateWorkAreaApi(
  id: number,
  payload: UpdateWorkAreaPayload
): Promise<WorkArea> {
  const res = await authFetch(`${API_BASE}/api/v1/work-areas/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Errore nell'aggiornamento area")}`);
  }
  return res.json();
}

export async function deleteWorkAreaApi(id: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/api/v1/work-areas/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Errore nell'eliminazione area")}`);
  }
}