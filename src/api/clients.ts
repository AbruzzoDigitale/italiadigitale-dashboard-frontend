import { authFetch, API_BASE } from "./auth";
import type { BulkDeleteResponse } from "./bulk";

export type ClientType = "person" | "company";

export interface ClientTagRef {
  id: number;
  name: string;
  slug: string;
  color?: string | null;
}

export interface ClientWorkAreaRef {
  id: number;
  name: string;
  slug: string;
  color?: string | null;
}

export interface ClientTrelloBoard {
  id: number;
  trello_board_id: string;
  name: string;
  url: string;
  created_at: string;
  updated_at: string;
}

export interface Client {
  id: number;

  // FIC sync
  fic_id: number | null;
  code: string | null;

  // Anagrafica
  name: string;
  commercial_name: string | null;
  type: ClientType | null;
  first_name: string | null;
  last_name: string | null;
  contact: string | null;
  email: string | null;
  phone: string | null;
  fax: string | null;

  // Dati fiscali
  vat: string | null;
  cf: string | null;
  sdi: string | null;
  pec: string | null;
  e_invoice: boolean;

  // Indirizzo
  addr: string | null;
  address_extra: string | null;
  city: string | null;
  zip: string | null;
  prov: string | null;
  country: string | null;
  shipping_address: unknown | null;

  // Banca
  bank_iban: string | null;
  bank_name: string | null;
  bank_swift_code: string | null;

  // Pagamento / fatturazione
  default_payment_terms: number | null;
  default_payment_terms_type: string | null;
  default_discount: number | null;
  default_vat: { id: number; value: number; description: string; is_disabled: boolean } | null;
  default_payment_method: { id: number; name: string } | null;
  price_list_id: number | null;

  // Dichiarazione d'intento
  has_intent_declaration: boolean;
  intent_declaration_protocol_number: string | null;
  intent_declaration_protocol_date: string | null;
  discount_highlight: boolean;

  // Note e stato
  notes: string | null;
  is_active: boolean;
  /** Lead: cliente appuntato al volo, in attesa di conversione in preventivo. */
  is_lead?: boolean;
  /** Data della richiesta/contatto (default: giorno di creazione). */
  lead_date?: string | null;
  assigned_user_ids?: number[] | null;
  /** Numero di contratti attivi del cliente (calcolato dalla lista clienti). */
  active_contract_count?: number;

  // Metadati
  company_id: number;
  company_ids: number[] | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  tags?: ClientTagRef[];
  work_areas?: ClientWorkAreaRef[];
  trello_boards?: ClientTrelloBoard[];
}

export interface CreateClientPayload {
  name: string;
  commercial_name?: string | null;
  type?: ClientType | null;
  first_name?: string | null;
  last_name?: string | null;
  contact?: string | null;
  code?: string | null;
  email?: string | null;
  phone?: string | null;
  fax?: string | null;
  vat?: string | null;
  cf?: string | null;
  sdi?: string | null;
  pec?: string | null;
  e_invoice?: boolean;
  addr?: string | null;
  address_extra?: string | null;
  city?: string | null;
  zip?: string | null;
  prov?: string | null;
  country?: string | null;
  bank_iban?: string | null;
  bank_name?: string | null;
  bank_swift_code?: string | null;
  default_payment_terms?: number | null;
  default_payment_terms_type?: string | null;
  default_discount?: number | null;
  has_intent_declaration?: boolean;
  discount_highlight?: boolean;
  notes?: string | null;
  company_id?: number | null;
  company_ids?: number[] | null;
  tag_ids?: number[];
  work_area_ids?: number[];
  assigned_user_ids?: number[] | null;
  trello_board_ids?: number[];
}

export type UpdateClientPayload = Partial<CreateClientPayload> & {
  is_active?: boolean;
};

function parseApiError(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  const message = (body as { message?: unknown }).message;
  if (typeof message === "string" && message.trim()) return message;
  const error = (body as { error?: unknown }).error;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

// ── API calls ─────────────────────────────────────────────────────────────────

export interface GetClientsParams {
  page?: number;
  per_page?: number;
  q?: string;
  company_id?: number;
  type?: "person" | "company";
  city?: string;
  prov?: string;
  country?: string;
  e_invoice?: boolean;
  has_intent_declaration?: boolean;
  /** true = solo i lead (card della colonna Bozza); false = solo i clienti "veri". */
  is_lead?: boolean;
  sort_by?: string;
  sort_dir?: "asc" | "desc";
}

export interface ClientsListResponse {
  data: Client[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export interface SituationBucket {
  id: number;
  name: string;
  slug?: string;
  color?: string | null;
  count: number;
}

export interface SituationContractStatus {
  key?: string;
  commercial_stage?: string;
  label?: string | null;
  count: number;
}

export interface ClientSituationContract {
  id: number;
  title: string;
  commercial_stage: string;
  execution_stage?: string | null;
  engagement_type?: "one_time" | "ongoing" | null;
  signed_at?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  payment_type?: string | null;
  payment_type_label?: string | null;
  monthly_amount?: number | null;
  one_time_amount?: number | null;
  total_amount?: number | null;
  tags?: ClientTagRef[];
  work_areas?: ClientWorkAreaRef[];
  tasks_completion?: {
    total_tasks: number;
    completed_tasks: number;
    completion_rate: number;
    items?: Array<{
      id: number;
      title: string;
      status: string;
      completion_state: string;
      is_completed: boolean;
      progress_percent: number;
      work_date?: string | null;
      deadline_date?: string | null;
      assignee_ids?: number[];
      updated_at?: string | null;
    }>;
  };
}

export interface ClientSituationQuote {
  id: number;
  number: string | null;
  title: string;
  tag?: string | null;
  status: string | null;
  kind?: string | null;
  client_id?: number | null;
  company_id?: number | null;
  monthly_amount?: number | null;
  one_time_amount?: number | null;
  total_amount?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface ClientSituationItem {
  id: number;
  name: string;
  contact?: string | null;
  email?: string | null;
  phone?: string | null;
  vat?: string | null;
  city?: string | null;
  prov?: string | null;
  company_id?: number | null;
  /** true se la situazione cliente è archiviata (nascosta di default dalla pagina). */
  is_archived?: boolean;
  tags?: ClientTagRef[];
  work_areas?: ClientWorkAreaRef[];
  active_contract_count: number;
  formalized_contract_count: number;
  contract_status_summary?: Record<string, number> | SituationContractStatus[];
  quote_status_summary?: Record<string, number> | SituationContractStatus[];
  payment_type?: string | null;
  payment_type_label?: string | null;
  monthly_amount?: number | null;
  one_time_amount?: number | null;
  total_amount?: number | null;
  first_signed_at?: string | null;
  first_start_date?: string | null;
  last_signed_at?: string | null;
  last_start_date?: string | null;
  tasks_completion?: {
    total_tasks: number;
    completed_tasks: number;
    completion_rate: number;
    items?: Array<{
      id: number;
      title: string;
      status: string;
      completion_state: string;
      is_completed: boolean;
      progress_percent: number;
      work_date?: string | null;
      deadline_date?: string | null;
      assignee_ids?: number[];
      updated_at?: string | null;
    }>;
  };
  contracts: ClientSituationContract[];
  quotes?: ClientSituationQuote[];
}

export interface ClientsSituationStats {
  clients_count: number;
  quotes_count: number;
  contracts_count: number;
  active_contracts_count?: number;
  recurring_monthly_total: number;
  one_time_total?: number;
  work_areas?: SituationBucket[];
  tags?: SituationBucket[];
  quote_statuses?: SituationContractStatus[];
  contract_statuses?: SituationContractStatus[];
}

export interface ClientsSituationResponse {
  data: ClientSituationItem[];
  stats: ClientsSituationStats;
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

export interface GetClientsSituationParams {
  page?: number;
  per_page?: number;
  q?: string;
  company_id?: number;
  tag_ids?: number[];
  work_area_ids?: number[];
  engagement_types?: Array<"one_time" | "ongoing">;
  commercial_stages?: ClientSituationCommercialStage[];
  include_archived?: boolean;
}

export type ClientSituationEngagementType = "one_time" | "ongoing";

export type ClientSituationCommercialStage =
  | "bozza"
  | "inviato"
  | "in_trattativa"
  | "accettato"
  | "contratto_inviato"
  | "firmato"
  | "in_produzione"
  | "completato"
  | "perso";

export interface ClientSituationCountEntry {
  id?: number | null;
  name: string;
  slug?: string;
  color?: string | null;
  count: number;
}

export type ClientSituationContractRef = ClientSituationContract;
export type ClientSituationQuoteRef = ClientSituationQuote;
export type ClientPostSalesSituationItem = ClientSituationItem;

export interface ClientPostSalesSituationStats {
  clients_count: number;
  quotes_count: number;
  contracts_count: number;
  active_contracts_count: number;
  recurring_monthly_total: number;
  one_time_total: number;
  work_areas: ClientSituationCountEntry[];
  tags: ClientSituationCountEntry[];
  quote_statuses: ClientSituationCountEntry[];
  contract_statuses: ClientSituationCountEntry[];
}

export interface GetPostSalesSituationParams {
  page?: number;
  per_page?: number;
  q?: string;
  company_id?: number;
  tag_ids?: number[];
  work_area_ids?: number[];
  engagement_types?: ClientSituationEngagementType[];
  commercial_stages?: ClientSituationCommercialStage[];
  include_archived?: boolean;
}

export interface ClientPostSalesSituationResponse {
  data: ClientPostSalesSituationItem[];
  stats: ClientPostSalesSituationStats;
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

export async function getClientApi(id: number): Promise<Client> {
  const res = await authFetch(`${API_BASE}/api/v1/clients/${id}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Impossibile recuperare il cliente")}`);
  }
  return res.json();
}

export async function getClientsApi(params?: GetClientsParams): Promise<ClientsListResponse> {
  const qs = new URLSearchParams();
  if (params?.page != null) qs.set("page", String(params.page));
  if (params?.per_page != null) qs.set("per_page", String(params.per_page));
  if (params?.q) qs.set("q", params.q);
  if (params?.company_id != null) qs.set("company_id", String(params.company_id));
  if (params?.type) qs.set("type", params.type);
  if (params?.city) qs.set("city", params.city);
  if (params?.prov) qs.set("prov", params.prov);
  if (params?.country) qs.set("country", params.country);
  if (params?.e_invoice != null) qs.set("e_invoice", String(params.e_invoice));
  if (params?.has_intent_declaration != null) qs.set("has_intent_declaration", String(params.has_intent_declaration));
  if (params?.is_lead != null) qs.set("is_lead", String(params.is_lead));
  if (params?.sort_by) qs.set("sort_by", params.sort_by);
  if (params?.sort_dir) qs.set("sort_dir", params.sort_dir);
  const suffix = qs.toString() ? `?${qs}` : "";
  const res = await authFetch(`${API_BASE}/api/v1/clients${suffix}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Impossibile recuperare la lista clienti")}`);
  }
  return res.json();
}

/** Scarica il CSV di tutti i clienti che rispettano i filtri correnti (endpoint backend). */
export async function exportClientsCsvApi(params?: GetClientsParams): Promise<void> {
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  if (params?.company_id != null) qs.set("company_id", String(params.company_id));
  if (params?.type) qs.set("type", params.type);
  if (params?.city) qs.set("city", params.city);
  if (params?.prov) qs.set("prov", params.prov);
  if (params?.country) qs.set("country", params.country);
  if (params?.e_invoice != null) qs.set("e_invoice", String(params.e_invoice));
  if (params?.has_intent_declaration != null) qs.set("has_intent_declaration", String(params.has_intent_declaration));
  const suffix = qs.toString() ? `?${qs}` : "";
  const res = await authFetch(`${API_BASE}/api/v1/clients/export${suffix}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Impossibile esportare i clienti")}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "clienti.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function createClientApi(payload: CreateClientPayload): Promise<Client> {
  const res = await authFetch(`${API_BASE}/api/v1/clients`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Errore nella creazione cliente")}`);
  }
  return res.json();
}

/** Payload del lead: cliente minimale appuntato al volo (nome libero + note). */
export interface CreateLeadPayload {
  name: string;
  commercial_name?: string | null;
  notes?: string | null;
  /** Data richiesta; se omessa il backend usa oggi. */
  lead_date?: string | null;
  company_id?: number | null;
}

/** Crea un LEAD: entra in anagrafica con `is_lead=true` e compare in colonna Bozza. */
export async function createLeadApi(payload: CreateLeadPayload): Promise<Client> {
  const res = await authFetch(`${API_BASE}/api/v1/clients/lead`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Errore nella creazione del lead")}`);
  }
  return res.json();
}

export async function updateClientApi(
  id: number,
  payload: UpdateClientPayload
): Promise<Client> {
  const res = await authFetch(`${API_BASE}/api/v1/clients/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Errore nella modifica cliente")}`);
  }
  return res.json();
}

export async function deleteClientApi(id: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/api/v1/clients/${id}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 204) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Errore nell'eliminazione cliente")}`);
  }
}

export async function bulkDeleteClientsApi(ids: number[]): Promise<BulkDeleteResponse> {
  const res = await authFetch(`${API_BASE}/api/v1/clients/bulk-delete`, {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Errore eliminazione bulk clienti")}`);
  }
  return res.json();
}

export async function replaceClientAssignedUsersApi(clientId: number, userIds: number[]): Promise<Client> {
  const res = await authFetch(`${API_BASE}/api/v1/clients/${clientId}/assigned-users`, {
    method: "PUT",
    body: JSON.stringify({ user_ids: userIds }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Errore nell'aggiornamento utenti assegnati")}`);
  }
  return res.json();
}

export async function addClientAssignedUserApi(clientId: number, userId: number): Promise<Client> {
  const res = await authFetch(`${API_BASE}/api/v1/clients/${clientId}/assigned-users/${userId}`, {
    method: "POST",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Errore nell'assegnazione utente")}`);
  }
  return res.json();
}

export async function removeClientAssignedUserApi(clientId: number, userId: number): Promise<Client> {
  const res = await authFetch(`${API_BASE}/api/v1/clients/${clientId}/assigned-users/${userId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Errore nella rimozione utente assegnato")}`);
  }
  return res.json();
}

export async function getClientsSituationApi(
  params: GetClientsSituationParams = {}
): Promise<ClientsSituationResponse> {
  const qs = new URLSearchParams();
  if (params.page != null) qs.set("page", String(params.page));
  if (params.per_page != null) qs.set("per_page", String(params.per_page));
  if (params.q) qs.set("q", params.q);
  if (params.company_id != null) qs.set("company_id", String(params.company_id));
  params.tag_ids?.forEach((id) => qs.append("tag_ids", String(id)));
  params.work_area_ids?.forEach((id) => qs.append("work_area_ids", String(id)));
  params.engagement_types?.forEach((value) => qs.append("engagement_types", value));
  params.commercial_stages?.forEach((value) => qs.append("commercial_stages", value));
  if (params.include_archived) qs.set("include_archived", "true");

  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const res = await authFetch(`${API_BASE}/api/v1/clients/post-sales/situation${suffix}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Impossibile recuperare la situazione clienti")}`);
  }
  return res.json();
}

export async function getPostSalesSituationApi(
  params: GetPostSalesSituationParams = {}
): Promise<ClientPostSalesSituationResponse> {
  const response = await getClientsSituationApi(params);

  const toCountEntry = (entry: SituationBucket): ClientSituationCountEntry => ({
    id: entry.id,
    name: entry.name,
    slug: entry.slug,
    color: entry.color,
    count: entry.count,
  });

  const normalizedStats: ClientPostSalesSituationStats = {
    clients_count: response.stats.clients_count,
    quotes_count: response.stats.quotes_count ?? 0,
    contracts_count: response.stats.contracts_count,
    active_contracts_count: response.stats.active_contracts_count ?? 0,
    recurring_monthly_total: response.stats.recurring_monthly_total,
    one_time_total: response.stats.one_time_total ?? 0,
    work_areas: (response.stats.work_areas ?? []).map(toCountEntry),
    tags: (response.stats.tags ?? []).map(toCountEntry),
    quote_statuses: (response.stats.quote_statuses ?? []).map((item) => ({
      name: item.label || item.commercial_stage || item.key || "n/d",
      count: item.count,
    })),
    contract_statuses: (response.stats.contract_statuses ?? []).map((item) => ({
      name: item.label || item.commercial_stage || item.key || "n/d",
      count: item.count,
    })),
  };

  return {
    data: response.data,
    stats: normalizedStats,
    page: response.page,
    per_page: response.per_page,
    total: response.total,
    total_pages: response.total_pages,
  };
}

export async function archiveClientSituationApi(clientId: number): Promise<Client> {
  const res = await authFetch(`${API_BASE}/api/v1/clients/${clientId}/post-sales/archive`, {
    method: "POST",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Errore archiviazione situazione cliente"));
  }
  return res.json();
}

export async function unarchiveClientSituationApi(clientId: number): Promise<Client> {
  const res = await authFetch(`${API_BASE}/api/v1/clients/${clientId}/post-sales/unarchive`, {
    method: "POST",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Errore ripristino situazione cliente"));
  }
  return res.json();
}
