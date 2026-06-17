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

export function normalizeCompanySettingKey(key: string) {
  return key.trim().toLowerCase();
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface Company {
  id: number;
  name: string;
  slug: string;
  parent_id: number | null;
  is_active?: boolean;
  created_at?: string;
  primary_color: string | null;
  login_title: string | null;
  logo_dark: string | null;
  logo_light: string | null;
  logo_horizontal_dark: string | null;
  logo_horizontal_light: string | null;
  logo_vertical_dark: string | null;
  logo_vertical_light: string | null;
  logo_hero: string | null;
  children: Company[];
}

export interface CompanyBrand {
  id: number;
  name: string;
  slug: string;
  login_title: string | null;
  login_subtitle: string | null;
  login_tagline: string | null;
  app_name: string | null;
  app_short_name: string | null;
  primary_color: string | null;
  bg_color: string | null;
  theme_color: string | null;
  logo_dark: string | null;
  logo_light: string | null;
  logo_horizontal_dark: string | null;
  logo_horizontal_light: string | null;
  logo_vertical_dark: string | null;
  logo_vertical_light: string | null;
  logo_hero: string | null;
  notif_sound: string | null;
  notif_sound_enabled: boolean | null;
  dashboard_kpis: string[] | null;
}

export interface CreateCompanyPayload {
  name: string;
  slug: string;
  parent_id?: number | null;
}

export interface SwitchActiveCompanyRequest {
  company_id: number;
}

export interface SwitchActiveCompanyResponse {
  status: "ok";
  active_company_id: number;
}

export interface UpdateCompanyBrandPayload {
  login_title?: string | null;
  login_subtitle?: string | null;
  login_tagline?: string | null;
  app_name?: string | null;
  app_short_name?: string | null;
  primary_color?: string | null;
  bg_color?: string | null;
  theme_color?: string | null;
  notif_sound_enabled?: boolean | null;
  dashboard_kpis?: string[] | null;
}

export interface CompanySettingResponse {
  id: number;
  company_id: number;
  key: string;
  value: string | null;
  provider: string | null;
  label: string | null;
  is_secret: boolean;
  is_active: boolean;
  has_value: boolean;
  created_at: string;
  updated_at: string;
}

export interface CompanySettingUpsertPayload {
  value: string;
  provider?: string | null;
  label?: string | null;
  is_secret?: boolean;
  is_active?: boolean;
}

export interface CompanySettingsQueryParams {
  include_secret_values?: boolean;
}

export type CompanyScheduleWindowKind = "break" | "holiday" | "day_off" | "remote";

export interface CompanyScheduleWindow {
  id: number;
  company_id: number;
  kind: CompanyScheduleWindowKind;
  title: string;
  emoji: string | null;
  color: string | null;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  start_date: string | null;
  end_date: string | null;
  weekdays: number[];
  is_all_day: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CompanyScheduleWindowPayload {
  kind: CompanyScheduleWindowKind;
  title: string;
  emoji?: string | null;
  color?: string | null;
  description?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  weekdays?: number[];
  is_all_day?: boolean;
  is_active?: boolean;
}

export type UpdateCompanyScheduleWindowPayload = Partial<CompanyScheduleWindowPayload>;

export type CompanyHolidaySyncAction = "created" | "updated" | "skipped";

export interface CompanyHolidaySyncItem {
  date: string;
  title: string;
  action: CompanyHolidaySyncAction;
}

export interface CompanyHolidaySyncResponse {
  company_id: number;
  year: number;
  created: number;
  updated: number;
  skipped: number;
  total: number;
  items: CompanyHolidaySyncItem[];
}

export interface CompanyWorkloadPolicy {
  id: number;
  company_id: number;
  name: string;
  strategy: string;
  strategy_version: string | null;
  default_is_fractionable: boolean;
  daily_capacity_hours: number | null;
  settings_json: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CompanyWorkloadPolicyCreate {
  name: string;
  strategy: string;
  strategy_version?: string | null;
  default_is_fractionable?: boolean;
  daily_capacity_hours?: number | null;
  settings_json?: Record<string, unknown> | null;
  is_active?: boolean;
}

export type CompanyWorkloadPolicyUpdate = Partial<CompanyWorkloadPolicyCreate>;

/** Campi upload asset brand */
export type CompanyAssetField =
  | "logo_dark"
  | "logo_light"
  | "logo_horizontal_dark"
  | "logo_horizontal_light"
  | "logo_vertical_dark"
  | "logo_vertical_light"
  | "logo_hero"
  | "notif_sound";

// ── API calls ────────────────────────────────────────────────────────────────

/** Admin: albero completo — Utente: solo la propria company root con children */
export async function getCompaniesApi(): Promise<Company[]> {
  const res = await authFetch(`${API_BASE}/api/v1/companies`);
  if (!res.ok) throw new Error("Impossibile recuperare le aziende");
  return res.json();
}

export async function createCompanyApi(
  payload: CreateCompanyPayload
): Promise<Company> {
  const res = await authFetch(`${API_BASE}/api/v1/companies`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? "Errore nella creazione azienda");
  }
  return res.json();
}

/** Aziende assegnate all'utente corrente */
export async function getMyCompaniesApi(): Promise<Company[]> {
  const res = await authFetch(`${API_BASE}/api/v1/companies/me`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Impossibile recuperare le aziende assegnate"));
  }
  return res.json();
}

export async function switchActiveCompanyApi(
  payload: SwitchActiveCompanyRequest
): Promise<SwitchActiveCompanyResponse> {
  const res = await authFetch(`${API_BASE}/api/v1/companies/switch-active`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Errore nel cambio azienda attiva")}`);
  }
  return res.json();
}

export async function getCompanyBrandApi(id: number): Promise<CompanyBrand> {
  const res = await authFetch(`${API_BASE}/api/v1/companies/${id}/brand`);
  if (!res.ok) throw new Error("Impossibile recuperare il brand aziendale");
  return res.json();
}

export async function updateCompanyBrandApi(
  id: number,
  payload: UpdateCompanyBrandPayload
): Promise<CompanyBrand> {
  const res = await authFetch(`${API_BASE}/api/v1/companies/${id}/brand`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? "Errore nell'aggiornamento brand");
  }
  return res.json();
}

export async function uploadCompanyAssetApi(
  id: number,
  field: CompanyAssetField,
  file: File
): Promise<CompanyBrand> {
  const token = localStorage.getItem("id_token");
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(
    `${API_BASE}/api/v1/companies/${id}/brand/upload/${field}`,
    {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? "Errore nel caricamento asset");
  }
  return res.json();
}

export async function deleteCompanyApi(id: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/api/v1/companies/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Errore nell'eliminazione azienda"));
  }
}

export async function listCompanySettingsApi(
  companyId: number,
  params: CompanySettingsQueryParams = {}
): Promise<CompanySettingResponse[]> {
  const query = new URLSearchParams();
  if (params.include_secret_values) {
    query.set("include_secret_values", "true");
  }
  const url = `${API_BASE}/api/v1/companies/${companyId}/settings${query.toString() ? `?${query.toString()}` : ""}`;
  const res = await authFetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Impossibile recuperare i settings aziendali"));
  }
  return res.json();
}

export async function upsertCompanySettingApi(
  companyId: number,
  key: string,
  payload: CompanySettingUpsertPayload
): Promise<CompanySettingResponse> {
  const normalizedKey = normalizeCompanySettingKey(key);
  const res = await authFetch(`${API_BASE}/api/v1/companies/${companyId}/settings/${encodeURIComponent(normalizedKey)}`, {
    method: "PUT",
    body: JSON.stringify({
      ...payload,
      provider: payload.provider?.trim() || null,
      label: payload.label?.trim() || null,
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Errore nel salvataggio del setting"));
  }
  return res.json();
}

export async function deleteCompanySettingApi(
  companyId: number,
  key: string
): Promise<void> {
  const normalizedKey = normalizeCompanySettingKey(key);
  const res = await authFetch(`${API_BASE}/api/v1/companies/${companyId}/settings/${encodeURIComponent(normalizedKey)}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 204) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Errore nell'eliminazione del setting"));
  }
}

export async function listCompanyScheduleWindowsApi(companyId: number): Promise<CompanyScheduleWindow[]> {
  const res = await authFetch(`${API_BASE}/api/v1/companies/${companyId}/schedule-windows`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Impossibile recuperare le regole operative"));
  }
  return res.json();
}

export async function createCompanyScheduleWindowApi(
  companyId: number,
  payload: CompanyScheduleWindowPayload
): Promise<CompanyScheduleWindow> {
  const res = await authFetch(`${API_BASE}/api/v1/companies/${companyId}/schedule-windows`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Errore nella creazione della regola operativa"));
  }
  return res.json();
}

export async function getCompanyScheduleWindowApi(
  companyId: number,
  windowId: number
): Promise<CompanyScheduleWindow> {
  const res = await authFetch(`${API_BASE}/api/v1/companies/${companyId}/schedule-windows/${windowId}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Regola operativa non trovata"));
  }
  return res.json();
}

export async function updateCompanyScheduleWindowApi(
  companyId: number,
  windowId: number,
  payload: UpdateCompanyScheduleWindowPayload
): Promise<CompanyScheduleWindow> {
  const res = await authFetch(`${API_BASE}/api/v1/companies/${companyId}/schedule-windows/${windowId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Errore nell'aggiornamento della regola operativa"));
  }
  return res.json();
}

export async function deleteCompanyScheduleWindowApi(
  companyId: number,
  windowId: number
): Promise<void> {
  const res = await authFetch(`${API_BASE}/api/v1/companies/${companyId}/schedule-windows/${windowId}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 204) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Errore nell'eliminazione della regola operativa"));
  }
}

export async function syncCompanyItalianHolidaysApi(
  companyId: number,
  year?: number
): Promise<CompanyHolidaySyncResponse> {
  const query = new URLSearchParams();
  if (typeof year === "number" && Number.isFinite(year)) {
    query.set("year", String(Math.trunc(year)));
  }

  const url = `${API_BASE}/api/v1/companies/${companyId}/schedule-windows/sync-italian-holidays${query.toString() ? `?${query.toString()}` : ""}`;
  const res = await authFetch(url, { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Errore nella sincronizzazione festivita italiane"));
  }
  return res.json();
}

export async function listCompanyWorkloadPoliciesApi(companyId: number): Promise<CompanyWorkloadPolicy[]> {
  const res = await authFetch(`${API_BASE}/api/v1/companies/${companyId}/workload-policies`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Impossibile recuperare le workload policies"));
  }
  return res.json();
}

export async function getCompanyWorkloadPolicyApi(
  companyId: number,
  policyId: number
): Promise<CompanyWorkloadPolicy> {
  const res = await authFetch(`${API_BASE}/api/v1/companies/${companyId}/workload-policies/${policyId}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Workload policy non trovata"));
  }
  return res.json();
}

export async function createCompanyWorkloadPolicyApi(
  companyId: number,
  payload: CompanyWorkloadPolicyCreate
): Promise<CompanyWorkloadPolicy> {
  const res = await authFetch(`${API_BASE}/api/v1/companies/${companyId}/workload-policies`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Errore creazione workload policy")}`);
  }
  return res.json();
}

export async function updateCompanyWorkloadPolicyApi(
  companyId: number,
  policyId: number,
  payload: CompanyWorkloadPolicyUpdate
): Promise<CompanyWorkloadPolicy> {
  const res = await authFetch(`${API_BASE}/api/v1/companies/${companyId}/workload-policies/${policyId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Errore aggiornamento workload policy")}`);
  }
  return res.json();
}

export async function deleteCompanyWorkloadPolicyApi(
  companyId: number,
  policyId: number
): Promise<void> {
  const res = await authFetch(`${API_BASE}/api/v1/companies/${companyId}/workload-policies/${policyId}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 204) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Errore eliminazione workload policy")}`);
  }
}
