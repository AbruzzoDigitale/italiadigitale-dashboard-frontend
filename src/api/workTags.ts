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

export interface WorkTag {
  id: number;
  company_id: number;
  name: string;
  slug: string;
  color: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateWorkTagPayload {
  company_id: number;
  name: string;
  slug?: string | null;
  color?: string | null;
}

export type UpdateWorkTagPayload = Partial<{
  name: string;
  slug: string | null;
  color: string | null;
}>;

export interface ListWorkTagsParams {
  company_id?: number;
}

export async function listWorkTagsApi(params: ListWorkTagsParams = {}): Promise<WorkTag[]> {
  const qs = new URLSearchParams();
  if (params.company_id != null) qs.set("company_id", String(params.company_id));
  const suffix = qs.toString() ? `?${qs}` : "";
  const res = await authFetch(`${API_BASE}/api/v1/work-tags${suffix}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Impossibile recuperare i tag")}`);
  }
  return res.json();
}

export async function createWorkTagApi(payload: CreateWorkTagPayload): Promise<WorkTag> {
  const res = await authFetch(`${API_BASE}/api/v1/work-tags`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Errore nella creazione tag")}`);
  }
  return res.json();
}

export async function updateWorkTagApi(tagId: number, payload: UpdateWorkTagPayload): Promise<WorkTag> {
  const res = await authFetch(`${API_BASE}/api/v1/work-tags/${tagId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Errore aggiornamento tag")}`);
  }
  return res.json();
}

export async function deleteWorkTagApi(tagId: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/api/v1/work-tags/${tagId}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 204) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Errore eliminazione tag")}`);
  }
}
