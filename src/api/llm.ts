import { API_BASE, authFetch } from "./auth";

function parseApiError(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;

  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail === "string" && detail.trim()) return detail;

  if (Array.isArray(detail) && detail.length > 0) {
    const detailText = detail
      .map((entry) => {
        if (typeof entry === "string") return entry;
        if (entry && typeof entry === "object") {
          const msg = (entry as { msg?: unknown }).msg;
          if (typeof msg === "string" && msg.trim()) return msg;
        }
        return null;
      })
      .filter((entry): entry is string => !!entry)
      .join("; ");
    if (detailText) return detailText;
  }

  const message = (body as { message?: unknown }).message;
  if (typeof message === "string" && message.trim()) return message;

  return fallback;
}

function ensureOkStatus(res: Response, body: unknown, fallback: string): never {
  throw new Error(`[${res.status}] ${parseApiError(body, fallback)}`);
}

export interface LlmProfile {
  id: number;
  company_id: number;
  slug: string;
  provider: string;
  model_name: string;
  api_base_url: string | null;
  api_key: string | null;
  has_api_key: boolean;
  default_params: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UpsertLlmProfilePayload {
  provider: string;
  model_name: string;
  api_base_url?: string | null;
  api_key?: string | null;
  default_params?: Record<string, unknown> | null;
  is_active: boolean;
}

export interface LlmOperationBinding {
  id: number;
  company_id: number;
  operation_code: string;
  profile_slug: string;
  provider: string;
  model_name: string;
  created_at: string;
  updated_at: string;
}

export interface UpsertLlmOperationBindingPayload {
  profile_slug: string;
}

export function normalizeLlmSlug(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidLlmCode(value: string): boolean {
  return /^[a-z0-9-]+$/.test(value);
}

export async function listCompanyLlmProfilesApi(
  companyId: number,
  options: { include_secret_values?: boolean } = {}
): Promise<LlmProfile[]> {
  const query = new URLSearchParams();
  if (options.include_secret_values) query.set("include_secret_values", "true");

  const url = `${API_BASE}/api/v1/companies/${companyId}/llm-profiles${query.toString() ? `?${query.toString()}` : ""}`;
  const res = await authFetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    ensureOkStatus(res, body, "Impossibile recuperare i profili LLM");
  }
  return res.json();
}

export async function upsertCompanyLlmProfileApi(
  companyId: number,
  slug: string,
  payload: UpsertLlmProfilePayload
): Promise<LlmProfile> {
  const normalizedSlug = normalizeLlmSlug(slug);
  const res = await authFetch(`${API_BASE}/api/v1/companies/${companyId}/llm-profiles/${encodeURIComponent(normalizedSlug)}`, {
    method: "PUT",
    body: JSON.stringify({
      provider: payload.provider.trim(),
      model_name: payload.model_name.trim(),
      api_base_url: payload.api_base_url?.trim() || null,
      ...(payload.api_key !== undefined ? { api_key: payload.api_key?.trim() || null } : {}),
      default_params: payload.default_params ?? null,
      is_active: payload.is_active,
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    ensureOkStatus(res, body, "Impossibile salvare il profilo LLM");
  }
  return res.json();
}

export async function deleteCompanyLlmProfileApi(companyId: number, slug: string): Promise<void> {
  const normalizedSlug = normalizeLlmSlug(slug);
  const res = await authFetch(`${API_BASE}/api/v1/companies/${companyId}/llm-profiles/${encodeURIComponent(normalizedSlug)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    ensureOkStatus(res, body, "Impossibile eliminare il profilo LLM");
  }
}

export async function listCompanyLlmOperationBindingsApi(companyId: number): Promise<LlmOperationBinding[]> {
  const res = await authFetch(`${API_BASE}/api/v1/companies/${companyId}/llm-operation-bindings`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    ensureOkStatus(res, body, "Impossibile recuperare i binding operazioni LLM");
  }
  return res.json();
}

export async function upsertCompanyLlmOperationBindingApi(
  companyId: number,
  operationCode: string,
  payload: UpsertLlmOperationBindingPayload
): Promise<LlmOperationBinding> {
  const normalizedOperationCode = normalizeLlmSlug(operationCode);
  const res = await authFetch(`${API_BASE}/api/v1/companies/${companyId}/llm-operation-bindings/${encodeURIComponent(normalizedOperationCode)}`, {
    method: "PUT",
    body: JSON.stringify({
      profile_slug: normalizeLlmSlug(payload.profile_slug),
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    ensureOkStatus(res, body, "Impossibile salvare il binding LLM");
  }
  return res.json();
}

export async function deleteCompanyLlmOperationBindingApi(companyId: number, operationCode: string): Promise<void> {
  const normalizedOperationCode = normalizeLlmSlug(operationCode);
  const res = await authFetch(`${API_BASE}/api/v1/companies/${companyId}/llm-operation-bindings/${encodeURIComponent(normalizedOperationCode)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    ensureOkStatus(res, body, "Impossibile eliminare il binding LLM");
  }
}
