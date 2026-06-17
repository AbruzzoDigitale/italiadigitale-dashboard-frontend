import { authFetch, API_BASE } from "./auth";

function parseFicError(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  const message = (body as { message?: unknown }).message;
  if (typeof message === "string" && message.trim()) return message;
  return fallback;
}

export interface FicSyncClientsResult {
  status: string;
  fic_company_id: number;
  total_fic: number;
  created: number;
  updated: number;
}

export async function syncFicClientsApi(): Promise<FicSyncClientsResult> {
  const res = await authFetch(`${API_BASE}/api/v1/fic/sync/clients`, {
    method: "POST",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseFicError(body, "Errore sincronizzazione clienti FIC"));
  }
  return res.json();
}

export interface FicSyncQuotesPayload {
  dry_run?: boolean;
  sync_mode?: "upsert" | string;
  only_from_date?: string;
  per_page?: number;
  max_pages?: number;
  status_on_import?: string;
  kind_on_import?: string;
}

export interface FicSyncQuotesResult {
  status: string;
  mode?: string;
  dry_run: boolean;
  total_fic_quotes: number;
  created: number;
  updated: number;
  skipped: number;
  errors: Array<string | Record<string, unknown>>;
  preview?: Record<string, unknown> | null;
}

export async function syncFicQuotesApi(payload: FicSyncQuotesPayload): Promise<FicSyncQuotesResult> {
  const res = await authFetch(`${API_BASE}/api/v1/fic/sync/quotes`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseFicError(body, "Errore sincronizzazione preventivi FIC"));
  }
  return res.json();
}

export interface PushQuoteToFicResult {
  status: string;
  fic_document_id: number | null;
  fic_company_id: number;
  local_quote_id: number;
  fic_document_url: string | null;
}

export async function pushQuoteToFicApi(quoteId: number): Promise<PushQuoteToFicResult> {
  const res = await authFetch(`${API_BASE}/api/v1/fic/push/quote/${quoteId}`, {
    method: "POST",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseFicError(body, "Errore durante l'invio a FIC"));
  }
  return res.json();
}

export interface FicQuoteSearchParams {
  fic_company_id?: number;
  page?: number;
  per_page?: number;
  q?: string;
  from_date?: string;
  to_date?: string;
  only_not_imported?: boolean;
}

export interface FicQuoteSearchItem {
  fic_document_id: number;
  number: number | null;
  numeration: string | null;
  date: string | null;
  subject: string | null;
  status: string | null;
  amount_net: number | null;
  amount_gross: number | null;
  entity: {
    id: number | null;
    name: string | null;
    email: string | null;
    vat_number: string | null;
  };
  local_quote_id: number | null;
  already_imported: boolean;
}

export interface FicQuoteSearchResponse {
  status: "ok";
  fic_company_id: number;
  page: number;
  last_page: number;
  per_page: number;
  total: number;
  filters: {
    q: string | null;
    from_date: string | null;
    to_date: string | null;
    only_not_imported: boolean;
  };
  data: FicQuoteSearchItem[];
}

export interface FicImportQuoteRequest {
  fic_document_id: number;
  fic_company_id?: number;
  status_on_import?: string;
  kind_on_import?: "preventivo" | "richiesta";
  overwrite_if_exists?: boolean;
  dry_run?: boolean;
}

export interface FicImportQuoteDryRunResponse {
  status: "dry_run";
  action: "create" | "update";
  fic_company_id: number;
  fic_document_id: number;
  local_quote_id: number | null;
  payload_preview: {
    title: string | null;
    date: string | null;
    status: string | null;
    kind: "preventivo" | "richiesta" | string;
    client_id: number | null;
    lines_count: number;
    [key: string]: unknown;
  };
}

export interface FicImportQuoteCommitResponse {
  status: "ok";
  action: "created" | "updated";
  fic_company_id: number;
  fic_document_id: number;
  local_quote_id: number;
}

export type FicImportQuoteResponse = FicImportQuoteDryRunResponse | FicImportQuoteCommitResponse;

export interface FicApplyQuoteToExistingRequest {
  fic_company_id?: number;
  status_on_apply?: string | null;
  update_header?: boolean;
  update_client?: boolean;
  replace_lines?: boolean;
  dry_run?: boolean;
}

export interface FicApplyQuoteToExistingDryRunResponse {
  status: "dry_run";
  fic_company_id: number;
  fic_document_id: number;
  local_quote_id: number;
  changes_preview: {
    title: string | null;
    date: string | null;
    notes: string | null;
    discount_pct: number | null;
    discount_eur: number | null;
    lines_count: number;
    client_id: number | null;
    status_on_apply: string | null;
    [key: string]: unknown;
  };
}

export interface FicApplyQuoteToExistingCommitResponse {
  status: "ok";
  fic_company_id: number;
  fic_document_id: number;
  local_quote_id: number;
  applied: {
    update_header: boolean;
    update_client: boolean;
    replace_lines: boolean;
    status_on_apply: string | null;
    [key: string]: unknown;
  };
}

export type FicApplyQuoteToExistingResponse =
  | FicApplyQuoteToExistingDryRunResponse
  | FicApplyQuoteToExistingCommitResponse;

export async function searchFicQuotesApi(params: FicQuoteSearchParams = {}): Promise<FicQuoteSearchResponse> {
  const qs = new URLSearchParams();
  if (params.fic_company_id != null) qs.set("fic_company_id", String(params.fic_company_id));
  if (params.page != null) qs.set("page", String(params.page));
  if (params.per_page != null) qs.set("per_page", String(params.per_page));
  if (params.q) qs.set("q", params.q);
  if (params.from_date) qs.set("from_date", params.from_date);
  if (params.to_date) qs.set("to_date", params.to_date);
  if (params.only_not_imported != null) qs.set("only_not_imported", String(params.only_not_imported));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";

  const res = await authFetch(`${API_BASE}/api/v1/fic/quotes/search${suffix}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseFicError(body, "Errore ricerca preventivi FIC"));
  }
  return res.json();
}

export async function importFicQuoteApi(payload: FicImportQuoteRequest): Promise<FicImportQuoteResponse> {
  const res = await authFetch(`${API_BASE}/api/v1/fic/quotes/import`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseFicError(body, "Errore import preventivo FIC"));
  }
  return res.json();
}

export async function applyFicQuoteToExistingApi(
  ficDocumentId: number,
  quoteId: number,
  payload: FicApplyQuoteToExistingRequest
): Promise<FicApplyQuoteToExistingResponse> {
  const res = await authFetch(`${API_BASE}/api/v1/fic/quotes/${ficDocumentId}/apply-to/${quoteId}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseFicError(body, "Errore applicazione preventivo FIC"));
  }
  return res.json();
}

// ── FiC Clients ───────────────────────────────────────────────────────────────

export interface FicClientSearchParams {
  fic_company_id?: number;
  page?: number;
  per_page?: number;
  q?: string;
  only_not_imported?: boolean;
}

export interface FicClientSearchItem {
  fic_client_id: number;
  name: string | null;
  email: string | null;
  vat: string | null;
  cf: string | null;
  type: string | null;
  local_client_id: number | null;
  already_imported: boolean;
}

export interface FicClientSearchResponse {
  status: "ok";
  fic_company_id: number;
  page: number;
  last_page: number;
  per_page: number;
  total: number;
  data: FicClientSearchItem[];
}

type FicClientSearchRawItem = {
  fic_client_id: number;
  name: string | null;
  email: string | null;
  vat?: string | null;
  vat_number?: string | null;
  cf?: string | null;
  tax_code?: string | null;
  type: string | null;
  local_client_id: number | null;
  already_imported: boolean;
};

type FicClientSearchRawResponse = Omit<FicClientSearchResponse, "data"> & {
  data: FicClientSearchRawItem[];
};

export interface FicImportClientRequest {
  fic_client_id: number;
  fic_company_id?: number;
  overwrite_if_exists?: boolean;
  dry_run?: boolean;
}

export interface FicImportClientDryRunResponse {
  status: "dry_run";
  action: "create" | "update";
  fic_company_id: number;
  fic_client_id: number;
  local_client_id: number | null;
  payload_preview: {
    name: string | null;
    email: string | null;
    vat: string | null;
    cf: string | null;
    type: string | null;
  };
}

export interface FicImportClientCommitResponse {
  status: "ok";
  action: "created" | "updated";
  fic_company_id: number;
  fic_client_id: number;
  local_client_id: number;
}

export type FicImportClientResponse = FicImportClientDryRunResponse | FicImportClientCommitResponse;

export interface FicApplyClientToExistingRequest {
  fic_company_id?: number;
  dry_run?: boolean;
}

export interface FicApplyClientDryRunResponse {
  status: "dry_run";
  fic_company_id: number;
  fic_client_id: number;
  local_client_id: number;
  changes_preview: {
    name: string | null;
    email: string | null;
    vat: string | null;
    cf: string | null;
    fic_id_before: number | null;
  };
}

export interface FicApplyClientCommitResponse {
  status: "ok";
  fic_company_id: number;
  fic_client_id: number;
  local_client_id: number;
}

export type FicApplyClientResponse = FicApplyClientDryRunResponse | FicApplyClientCommitResponse;

export interface FicPushClientResponse {
  status: "ok";
  action: "created" | "updated";
  fic_company_id: number;
  fic_client_id: number | null;
  local_client_id: number;
}

export async function searchFicClientsApi(params: FicClientSearchParams = {}): Promise<FicClientSearchResponse> {
  const qs = new URLSearchParams();
  if (params.fic_company_id != null) qs.set("fic_company_id", String(params.fic_company_id));
  if (params.page != null) qs.set("page", String(params.page));
  if (params.per_page != null) qs.set("per_page", String(params.per_page));
  if (params.q) qs.set("q", params.q);
  if (params.only_not_imported != null) qs.set("only_not_imported", String(params.only_not_imported));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";

  const res = await authFetch(`${API_BASE}/api/v1/fic/clients/search${suffix}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseFicError(body, "Errore ricerca clienti FIC"));
  }
  const raw = (await res.json()) as FicClientSearchRawResponse;
  return {
    ...raw,
    data: (raw.data ?? []).map((item) => ({
      fic_client_id: item.fic_client_id,
      name: item.name ?? null,
      email: item.email ?? null,
      vat: item.vat ?? item.vat_number ?? null,
      cf: item.cf ?? item.tax_code ?? null,
      type: item.type ?? null,
      local_client_id: item.local_client_id ?? null,
      already_imported: !!item.already_imported,
    })),
  };
}

export async function importFicClientApi(payload: FicImportClientRequest): Promise<FicImportClientResponse> {
  const res = await authFetch(`${API_BASE}/api/v1/fic/clients/import`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseFicError(body, "Errore import cliente FIC"));
  }
  return res.json();
}

export async function applyFicClientToExistingApi(
  ficClientId: number,
  clientId: number,
  payload: FicApplyClientToExistingRequest = {}
): Promise<FicApplyClientResponse> {
  const res = await authFetch(`${API_BASE}/api/v1/fic/clients/${ficClientId}/apply-to/${clientId}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseFicError(body, "Errore applicazione cliente FIC"));
  }
  return res.json();
}

export async function pushClientToFicApi(clientId: number): Promise<FicPushClientResponse> {
  const res = await authFetch(`${API_BASE}/api/v1/fic/push/client/${clientId}`, {
    method: "POST",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseFicError(body, "Errore push cliente su FIC"));
  }
  return res.json();
}
