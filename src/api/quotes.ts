import { authFetch, API_BASE } from "./auth";
import type { BulkDeleteResponse } from "./bulk";
import type {
  ContractCommercialStage,
  ContractDetailResponse,
  ContractEngagementType,
  ContractPricingMode,
} from "./contracts";

// ── Types ─────────────────────────────────────────────────────────────────────

export type QuoteStatus =
  | "bozza"
  | "da_approvare"
  | "in_revisione"
  | "inviato"
  | "in_trattativa"
  | "accettato"
  | "perso"
  | "rifiutato";

export type QuoteSortBy = "date" | "created_at" | "updated_at" | "number" | "title" | "status" | "client";
export type QuoteSortDir = "asc" | "desc";

export interface QuoteLineItem {
  productId?: number | null;
  ficProductId?: number | null;
  area?: string | null;
  boxId?: string | null;
  name: string;
  category?: string | null;
  desc?: string | null;
  net: number;
  vat?: number;
  udm?: string | null;
  quantity?: number;
  discountPct?: number;
  period?: "monthly" | "oneoff" | "yearly" | null;
  lineKind?: "line" | "bundle" | "option";
  autoAdded?: boolean;
  included?: boolean;
}

export interface QuoteTotals {
  subtotal: number;
  global_discount: number;
  net: number;
  vat_amount: number;
  total: number;
  monthly: number;
  one_time: number;
}

export interface QuoteEventResponse {
  id: number;
  actor_user_id: number | null;
  entity_type: string;
  entity_id: number | null;
  event_type: string;
  field_name: string | null;
  from_value: string | number | boolean | Record<string, unknown> | unknown[] | null;
  to_value: string | number | boolean | Record<string, unknown> | unknown[] | null;
  notes: string | null;
  metadata_json: string | number | boolean | Record<string, unknown> | unknown[] | null;
  created_at: string;
}

export interface Quote {
  id: number;
  number: string;
  title: string;
  date: string;
  tag: string | null;
  kind: "preventivo" | "richiesta";
  lines: QuoteLineItem[] | null;
  configurator?: Record<string, unknown> | null;
  notes: string | null;
  appunti_commerciali: string | null;
  brief_operativo: string | null;
  discount_pct: number;
  discount_eur: number;
  status: QuoteStatus;
  fic_id: string | null;
  fic_company_id: number | null;
  fic_document_url: string | null;
  fic_pushed_at: string | null;
  duplicated_from: string | null;
  is_active: boolean;
  client_id: number | null;
  /** Nome / nome commerciale del cliente (arricchiti dalla lista preventivi). */
  client_name?: string | null;
  client_commercial_name?: string | null;
  company_id: number | null;
  company_ids: number[] | null;
  created_by: number | null;
  requested_by: number | null;
  created_at: string;
  updated_at: string;
  totals: QuoteTotals | null;
  history: QuoteEventResponse[];
}

export interface CreateQuotePayload {
  date?: string | null;
  title?: string | null;
  tag?: string | null;
  client_id?: number | null;
  company_id?: number | null;
  company_ids?: number[] | null;
  lines?: QuoteLineItem[] | null;
  configurator?: Record<string, unknown> | null;
  notes?: string | null;
  appunti_commerciali?: string | null;
  brief_operativo?: string | null;
  discount_pct?: number;
  discount_eur?: number;
  fic_id?: string | null;
  duplicated_from?: string | null;
  kind?: "preventivo" | "richiesta";
}

export interface QuotePreviewResponse {
  date: string | null;
  title: string | null;
  tag: string | null;
  notes: string | null;
  appunti_commerciali: string | null;
  brief_operativo: string | null;
  discount_pct: number;
  discount_eur: number;
  client_id: number | null;
  company_id: number | null;
  company_ids: number[] | null;
  fic_id: string | null;
  configurator: Record<string, unknown> | null;
  lines: QuoteLineItem[];
  totals: QuoteTotals | null;
}

export interface QuoteLinkedContractResponse {
  contract_id: number;
  company_id: number;
  client_id: number | null;
  title: string;
  contract_type: "commercial" | "execution";
  commercial_stage:
    | "bozza"
    | "inviato"
    | "in_trattativa"
    | "accettato"
    | "contratto_inviato"
    | "firmato"
    | "in_produzione"
    | "completato"
    | "perso";
  execution_stage?: string | null;
  pricing_view_mode: "aggregated" | "single_quote";
  is_active: boolean;
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
  link_id: number;
  include_in_total: boolean;
  is_primary: boolean;
  display_order: number;
  label?: string | null;
}

export interface QuoteContractAutomationPayload {
  title?: string | null;
  company_id?: number | null;
  client_id?: number | null;
  engagement_type?: ContractEngagementType | null;
  pricing_view_mode?: ContractPricingMode | null;
  commercial_stage?: ContractCommercialStage | null;
  tag_ids?: number[] | null;
  work_area_ids?: number[] | null;
  include_quote_in_total?: boolean;
  is_primary_quote?: boolean;
  display_order?: number;
  label?: string | null;
}

export interface QuoteContractAutomationDryRunResponse {
  dry_run: true;
  quote: {
    id: number;
    number: string;
    status: string;
    [key: string]: unknown;
  };
  contract_payload: Record<string, unknown>;
  warnings: string[];
}

export interface QuotesListResponse {
  data: Quote[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export interface ListQuotesParams {
  q?: string;
  status?: QuoteStatus;
  company_id?: number;
  client_id?: number;
  page?: number;
  per_page?: number;
  sort_by?: QuoteSortBy;
  sort_dir?: QuoteSortDir;
}

export type UpdateQuotePayload = Omit<CreateQuotePayload, "duplicated_from">;

// ── Status helpers ────────────────────────────────────────────────────────────

export const STATUS_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  bozza: ["da_approvare", "inviato"],
  da_approvare: ["in_revisione", "inviato", "bozza"],
  in_revisione: ["da_approvare", "inviato", "bozza"],
  inviato: ["in_trattativa", "accettato", "perso", "rifiutato", "bozza"],
  in_trattativa: ["accettato", "perso", "inviato", "bozza"],
  accettato: ["bozza"],
  perso: ["bozza"],
  rifiutato: ["bozza"],
};

/** Status buttons available per role */
export function getAllowedTransitions(
  status: QuoteStatus,
  isAdmin: boolean
): QuoteStatus[] {
  const all = STATUS_TRANSITIONS[status] ?? [];
  if (isAdmin) return all;
  // Operatore: solo bozza <-> da_approvare
  return all.filter((s) => s === "bozza" || s === "da_approvare");
}

export const STATUS_LABELS: Record<QuoteStatus, string> = {
  bozza: "Bozza",
  da_approvare: "Da approvare",
  in_revisione: "In revisione",
  inviato: "Inviato",
  in_trattativa: "In trattativa",
  accettato: "Accettato",
  perso: "Perso",
  rifiutato: "Rifiutato",
};

export const STATUS_ACTIONS: Record<QuoteStatus, string> = {
  bozza: "Rimetti bozza",
  da_approvare: "Invia approvazione",
  in_revisione: "Prendi in revisione",
  inviato: "Invia al cliente",
  in_trattativa: "Segna in trattativa",
  accettato: "Segna accettato",
  perso: "Segna perso",
  rifiutato: "Segna rifiutato",
};

// Badge colour key (used in UI)
export const STATUS_VARIANT: Record<QuoteStatus, "default" | "info" | "warning" | "success" | "danger"> = {
  bozza: "default",
  da_approvare: "warning",
  in_revisione: "info",
  inviato: "info",
  in_trattativa: "warning",
  accettato: "success",
  perso: "danger",
  rifiutato: "danger",
};

export function getQuoteHistoryLabel(event: QuoteEventResponse): string {
  if (event.event_type === "status_changed" && event.field_name === "status") {
    return `Stato cambiato da ${event.from_value ?? "-"} a ${event.to_value ?? "-"}`;
  }
  return event.event_type;
}

// ── API calls ─────────────────────────────────────────────────────────────────

export async function getQuotesApi(params?: ListQuotesParams): Promise<QuotesListResponse> {
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  if (params?.status) qs.set("status", params.status);
  if (params?.company_id != null) qs.set("company_id", String(params.company_id));
  if (params?.client_id != null) qs.set("client_id", String(params.client_id));
  if (params?.page != null) qs.set("page", String(params.page));
  if (params?.per_page != null) qs.set("per_page", String(params.per_page));
  if (params?.sort_by) qs.set("sort_by", params.sort_by);
  if (params?.sort_dir) qs.set("sort_dir", params.sort_dir);
  const suffix = qs.toString() ? `?${qs}` : "";
  const res = await authFetch(`${API_BASE}/api/v1/quotes${suffix}`);
  if (!res.ok) {
    if (res.status === 403) throw new Error("[403] Accesso negato alla lista preventivi");
    throw new Error("Impossibile recuperare la lista preventivi");
  }
  return res.json();
}

/** Scarica il CSV di tutti i preventivi che rispettano i filtri correnti (endpoint backend). */
export async function exportQuotesCsvApi(params?: ListQuotesParams): Promise<void> {
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  if (params?.status) qs.set("status", params.status);
  if (params?.company_id != null) qs.set("company_id", String(params.company_id));
  if (params?.client_id != null) qs.set("client_id", String(params.client_id));
  const suffix = qs.toString() ? `?${qs}` : "";
  const res = await authFetch(`${API_BASE}/api/v1/quotes/export${suffix}`);
  if (!res.ok) throw new Error("Impossibile esportare i preventivi");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "preventivi.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function getQuoteApi(id: number): Promise<Quote> {
  const res = await authFetch(`${API_BASE}/api/v1/quotes/${id}`);
  if (!res.ok) {
    if (res.status === 403) throw new Error("[403] Accesso negato al preventivo");
    throw new Error("Preventivo non trovato");
  }
  return res.json();
}

export async function createQuoteApi(payload: CreateQuotePayload): Promise<Quote> {
  const res = await authFetch(`${API_BASE}/api/v1/quotes`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? "Errore nella creazione preventivo");
  }
  return res.json();
}

export async function createQuoteFromConfiguratorApi(payload: CreateQuotePayload): Promise<Quote> {
  const res = await authFetch(`${API_BASE}/api/v1/quotes/from-configurator`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? "Errore nella creazione preventivo da configuratore");
  }
  return res.json();
}

export async function createQuoteFromConfiguratorPreviewApi(payload: CreateQuotePayload): Promise<QuotePreviewResponse> {
  const res = await authFetch(`${API_BASE}/api/v1/quotes/from-configurator/preview`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? "Errore nel calcolo preview configuratore");
  }
  return res.json();
}

export async function updateQuoteApi(id: number, payload: UpdateQuotePayload): Promise<Quote> {
  const res = await authFetch(`${API_BASE}/api/v1/quotes/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? "Errore nella modifica preventivo");
  }
  return res.json();
}

export async function updateQuoteStatusApi(id: number, status: QuoteStatus, notes?: string | null): Promise<Quote> {
  const res = await authFetch(`${API_BASE}/api/v1/quotes/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status, notes: notes?.trim() ? notes.trim() : null }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? "Transizione non valida");
  }
  return res.json();
}

export async function acceptAndContractDryRunApi(
  quoteId: number,
  payload?: QuoteContractAutomationPayload
): Promise<QuoteContractAutomationDryRunResponse> {
  const res = await authFetch(`${API_BASE}/api/v1/quotes/${quoteId}/accept-and-contract-dry-run`, {
    method: "POST",
    body: JSON.stringify(payload ?? {}),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? "Impossibile preparare la creazione contratto dal preventivo");
  }
  return res.json();
}

export async function contractAutomationDryRunApi(
  quoteId: number,
  payload?: QuoteContractAutomationPayload
): Promise<QuoteContractAutomationDryRunResponse> {
  const res = await authFetch(`${API_BASE}/api/v1/quotes/${quoteId}/contract-automation/dry-run`, {
    method: "POST",
    body: JSON.stringify(payload ?? {}),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? "Impossibile preparare la creazione contratto dal preventivo");
  }
  return res.json();
}

export async function confirmQuoteContractAutomationApi(
  quoteId: number,
  payload?: QuoteContractAutomationPayload
): Promise<ContractDetailResponse> {
  const res = await authFetch(`${API_BASE}/api/v1/quotes/${quoteId}/contract-automation/confirm`, {
    method: "POST",
    body: JSON.stringify(payload ?? {}),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? "Impossibile creare il contratto dal preventivo");
  }
  return res.json();
}

export async function duplicateQuoteApi(id: number): Promise<Quote> {
  const res = await authFetch(`${API_BASE}/api/v1/quotes/${id}/duplicate`, {
    method: "POST",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? "Errore nella duplicazione");
  }
  return res.json();
}

export async function deleteQuoteApi(id: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/api/v1/quotes/${id}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 204) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? "Errore nell'eliminazione preventivo");
  }
}

export async function bulkDeleteQuotesApi(ids: number[]): Promise<BulkDeleteResponse> {
  const res = await authFetch(`${API_BASE}/api/v1/quotes/bulk-delete`, {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? "Errore nell'eliminazione bulk preventivi");
  }
  return res.json();
}

export async function getQuoteLinkedContractsApi(
  quoteId: number,
  params?: { include_inactive?: boolean; include_deleted?: boolean }
): Promise<QuoteLinkedContractResponse[]> {
  const qs = new URLSearchParams();
  if (params?.include_inactive != null) qs.set("include_inactive", String(params.include_inactive));
  if (params?.include_deleted != null) qs.set("include_deleted", String(params.include_deleted));
  const suffix = qs.toString() ? `?${qs}` : "";
  const res = await authFetch(`${API_BASE}/api/v1/quotes/${quoteId}/contracts${suffix}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? "Impossibile recuperare i contratti collegati al preventivo");
  }
  return res.json();
}

// ── Formatting helpers ────────────────────────────────────────────────────────

export function formatEur(n: number): string {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
}
