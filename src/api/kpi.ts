import { authFetch, API_BASE } from "./auth";

/** Unità di misura di una KPI: guida la formattazione lato UI. */
export type KpiUnit = "count" | "eur" | "pct" | "hours" | "days" | "ratio";
export type KpiKind = "stock" | "flow";

export interface KpiValue {
  id: string;
  label: string;
  unit: KpiUnit;
  category: string;
  kind: KpiKind;
  value: number | null;
  breakdown: Record<string, unknown> | null;
}

export interface KpiLiveResponse {
  company_id: number | null;
  period_month: string;
  period_start: string;
  period_end: string;
  as_of: string;
  kpis: KpiValue[];
}

export interface KpiCatalogItem {
  id: string;
  label: string;
  unit: KpiUnit;
  category: string;
  kind: KpiKind;
  description: string;
}

export interface KpiHistoryPoint {
  period_key: string;
  as_of: string;
  value: number | null;
  /** Ripartizione per operatore/area/cliente (solo admin/PM) per i grafici multi-linea. */
  breakdown?: Record<string, Record<string, number>> | null;
}

export interface KpiHistoryResponse {
  kpi_id: string;
  company_id: number;
  period_type: string;
  points: KpiHistoryPoint[];
}

function parseApiError(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail === "string" && detail.trim()) return detail;
  }
  return fallback;
}

async function unwrap<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, fallback)}`);
  }
  return res.json();
}

/** Valori KPI live (calcolo a richiesta) per un mese, un'azienda e filtri opzionali. */
export async function getKpiLiveApi(params: {
  companyId?: number | null;
  month?: string;
  ids?: string[];
  operatorIds?: number[];
  workAreaIds?: number[];
  clientIds?: number[];
} = {}): Promise<KpiLiveResponse> {
  const q = new URLSearchParams();
  if (params.companyId != null) q.set("company_id", String(params.companyId));
  if (params.month) q.set("month", params.month);
  if (params.ids && params.ids.length) q.set("ids", params.ids.join(","));
  if (params.operatorIds && params.operatorIds.length) q.set("operator_ids", params.operatorIds.join(","));
  if (params.workAreaIds && params.workAreaIds.length) q.set("work_area_ids", params.workAreaIds.join(","));
  if (params.clientIds && params.clientIds.length) q.set("client_ids", params.clientIds.join(","));
  const qs = q.toString();
  const res = await authFetch(`${API_BASE}/api/v1/kpi${qs ? `?${qs}` : ""}`);
  return unwrap<KpiLiveResponse>(res, "Impossibile recuperare le KPI");
}

/** Catalogo delle KPI disponibili (metadati). */
export async function getKpiCatalogApi(): Promise<KpiCatalogItem[]> {
  const res = await authFetch(`${API_BASE}/api/v1/kpi/catalog`);
  return unwrap<KpiCatalogItem[]>(res, "Impossibile recuperare il catalogo KPI");
}

/** Serie storica di una KPI dagli snapshot salvati. */
export async function getKpiHistoryApi(params: {
  kpiId: string;
  companyId?: number | null;
  periodType?: "day" | "month" | "point";
  limit?: number;
}): Promise<KpiHistoryResponse> {
  const q = new URLSearchParams();
  q.set("kpi_id", params.kpiId);
  if (params.companyId != null) q.set("company_id", String(params.companyId));
  q.set("period_type", params.periodType ?? "day");
  if (params.limit) q.set("limit", String(params.limit));
  const res = await authFetch(`${API_BASE}/api/v1/kpi/history?${q.toString()}`);
  return unwrap<KpiHistoryResponse>(res, "Impossibile recuperare lo storico KPI");
}
