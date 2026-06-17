import { authFetch, API_BASE } from "./auth";

export interface Role {
  id: number;
  company_id: number;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  is_active: boolean;
  is_system: boolean;
}

export interface ListRolesParams {
  company_id?: number;
  is_active?: boolean;
}

export interface CreateRolePayload {
  company_id: number;
  name: string;
  slug?: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  is_active?: boolean;
  is_system?: boolean;
}

export type UpdateRolePayload = Partial<CreateRolePayload>;

function parseApiError(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;

  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail === "string" && detail.trim()) return detail;

  if (Array.isArray(detail) && detail.length > 0) {
    const messages = detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          const msg = (item as { msg?: unknown }).msg;
          if (typeof msg === "string" && msg.trim()) return msg;
        }
        return null;
      })
      .filter((msg): msg is string => !!msg);
    if (messages.length > 0) return messages.join("; ");
  }

  const message = (body as { message?: unknown }).message;
  if (typeof message === "string" && message.trim()) return message;

  const error = (body as { error?: unknown }).error;
  if (typeof error === "string" && error.trim()) return error;

  return fallback;
}

export async function listRolesApi(params: ListRolesParams = {}): Promise<Role[]> {
  const query = new URLSearchParams();
  if (params.company_id != null) {
    // Send both snake_case and camelCase for backend compatibility.
    query.set("company_id", String(params.company_id));
    query.set("companyId", String(params.company_id));
  }
  if (params.is_active != null) query.set("is_active", String(params.is_active));
  const qs = query.toString();
  const url = `${API_BASE}/api/v1/roles${qs ? `?${qs}` : ""}`;

  const res = await authFetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Impossibile recuperare i ruoli")}`);
  }
  const data = (await res.json()) as Role[];

  const filteredByCompany = params.company_id == null
    ? data
    : data.filter((role) => role.company_id === params.company_id);

  // Defensive dedupe: some backends may return duplicated rows after joins.
  const uniqueById = new Map<number, Role>();
  for (const role of filteredByCompany) {
    if (!uniqueById.has(role.id)) uniqueById.set(role.id, role);
  }
  return Array.from(uniqueById.values());
}

export async function createRoleApi(payload: CreateRolePayload): Promise<Role> {
  const res = await authFetch(`${API_BASE}/api/v1/roles`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Errore nella creazione ruolo")}`);
  }
  return res.json();
}

export async function updateRoleApi(id: number, payload: UpdateRolePayload): Promise<Role> {
  const res = await authFetch(`${API_BASE}/api/v1/roles/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Errore nell'aggiornamento ruolo")}`);
  }
  return res.json();
}

export async function deleteRoleApi(id: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/api/v1/roles/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Errore nell'eliminazione ruolo")}`);
  }
}
