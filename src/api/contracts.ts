import { authFetch, API_BASE } from "./auth";
import type { BulkDeleteResponse } from "./bulk";
import type { LeftBehindReason, UrgencyLevel, WorkItemTaskType } from "./workItems";
import type { PedConfigurationInline } from "./pedConfigurations";

export type ContractType = "commercial" | "execution";

export type ContractEngagementType = "one_time" | "ongoing";

export type ContractPricingMode = "aggregated" | "single_quote";

export type ContractCommercialStage =
  | "bozza"
  | "inviato"
  | "in_trattativa"
  | "accettato"
  | "contratto_inviato"
  | "firmato"
  | "in_produzione"
  | "completato"
  | "perso";

export type PipelineEntityType = "contract" | "quote";

export type PipelineEntityFilter = "all" | PipelineEntityType;

export interface PipelinePricingSummary {
  mode: "aggregated" | "single_quote";
  aggregated_total: number;
  aggregated_monthly: number;
  aggregated_one_time: number;
  single_quote_total: number | null;
  single_quote_monthly: number | null;
  single_quote_one_time: number | null;
  selected_total: number;
  selected_monthly: number;
  selected_one_time: number;
}

export interface PipelineTagRef {
  id: number;
  name: string;
  slug: string;
  color: string | null;
}

export interface PipelineWorkAreaRef {
  id: number;
  name: string;
  slug: string;
  color: string | null;
}

export interface CommercialPipelineItem {
  entity_type: PipelineEntityType;
  id: number;
  company_id: number | null;
  client_id: number | null;
  title: string;
  contract_type: ContractType;
  engagement_type: ContractEngagementType;
  commercial_stage: ContractCommercialStage;
  execution_stage: string | null;
  signed_at: string | null;
  start_date: string | null;
  end_date: string | null;
  pricing_view_mode: ContractPricingMode;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  tags: PipelineTagRef[];
  work_areas: PipelineWorkAreaRef[];
  pricing: PipelinePricingSummary;
  source_status: string | null;
  source_kind: string | null;
  source_number: string | null;
  /** Accorpamento pipeline: preventivi con lo stesso group_id si muovono insieme. */
  group_id: number | null;
}

export interface ListCommercialPipelineParams {
  company_id?: number;
  client_id?: number;
  commercial_stage?: ContractCommercialStage;
  entity_type?: PipelineEntityFilter;
  include_inactive?: boolean;
  include_deleted?: boolean;
}

export const CONTRACT_STAGE_ORDER: ContractCommercialStage[] = [
  "bozza",
  "inviato",
  "in_trattativa",
  "accettato",
  "contratto_inviato",
  "firmato",
  "in_produzione",
  "completato",
  "perso",
];

export const CONTRACT_STAGE_LABELS: Record<ContractCommercialStage, string> = {
  bozza: "Bozza",
  inviato: "Inviato",
  in_trattativa: "In trattativa",
  accettato: "Accettato",
  contratto_inviato: "Contratto inviato",
  firmato: "Firmato",
  in_produzione: "In produzione",
  completato: "Completato",
  perso: "Perso",
};

export interface ContractPricingSummary {
  mode: ContractPricingMode;
  aggregated_total: number;
  aggregated_monthly?: number | null;
  aggregated_one_time?: number | null;
  single_quote_total?: number | null;
  single_quote_monthly?: number | null;
  single_quote_one_time?: number | null;
  selected_total: number;
  selected_monthly?: number | null;
  selected_one_time?: number | null;
}

export interface ContractQuoteLinkTotals {
  total: number;
  monthly?: number | null;
  one_time?: number | null;
}

export interface ContractQuoteLink {
  quote_id: number;
  include_in_total: boolean;
  is_primary: boolean;
  display_order: number;
  label?: string | null;
  totals?: ContractQuoteLinkTotals | null;
}

export interface ContractTagRef {
  id: number;
  name: string;
  slug: string;
  color?: string | null;
}

export interface ContractWorkAreaRef {
  id: number;
  name: string;
  slug: string;
  color?: string | null;
}

export interface ContractHistoryEvent {
  id?: number;
  event_type:
    | "contract_created"
    | "field_updated"
    | "note_updated"
    | "quote_links_updated"
    | "stage_changed"
    | "stage_advanced"
    | "stage_regressed"
    | "contract_deleted"
    | string;
  field_name?: string | null;
  from_value?: string | null;
  to_value?: string | null;
  notes?: string | null;
  actor_user_id?: number | null;
  created_at: string;
}

export interface ContractListItemResponse {
  id: number;
  company_id: number;
  client_id: number | null;
  client_name?: string | null;
  title: string;
  contract_type: ContractType;
  engagement_type?: ContractEngagementType | null;
  commercial_stage: ContractCommercialStage;
  execution_stage?: string | null;
  commercial_notes?: string | null;
  operational_brief?: string | null;
  lost_notes?: string | null;
  pricing_view_mode: ContractPricingMode;
  featured_quote_id?: number | null;
  pricing: ContractPricingSummary;
  is_active: boolean;
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
  stage_sent_at?: string | null;
  stage_negotiation_at?: string | null;
  stage_accepted_at?: string | null;
  contract_sent_at?: string | null;
  signed_at?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  in_production_at?: string | null;
  completed_at?: string | null;
  lost_at?: string | null;
  tags?: ContractTagRef[];
  work_areas?: ContractWorkAreaRef[];
}

export interface ContractDetailResponse extends ContractListItemResponse {
  quote_links: ContractQuoteLink[];
  history: ContractHistoryEvent[];
}

export type ContractWorkItemCompletionState = "not_started" | "in_progress" | "completed";

export interface ContractWorkItemCompletionItem {
  id: number;
  title: string;
  status: string;
  completion_state: ContractWorkItemCompletionState;
  is_completed: boolean;
  progress_percent: number;
  work_date: string | null;
  deadline_date: string | null;
  assignee_ids: number[];
  updated_at: string;
}

export interface ContractWorkItemsCompletionResponse {
  contract_id: number;
  total_tasks: number;
  completed_tasks: number;
  completion_rate: number;
  items: ContractWorkItemCompletionItem[];
}

export interface ListContractsParams {
  company_id?: number;
  client_id?: number;
  commercial_stage?: ContractCommercialStage;
  include_inactive?: boolean;
  include_deleted?: boolean;
}

export interface CreateContractPayload {
  company_id: number;
  client_id: number | null;
  title: string;
  contract_type: ContractType;
  engagement_type?: ContractEngagementType | null;
  execution_stage?: string | null;
  stage_sent_at?: string | null;
  stage_negotiation_at?: string | null;
  stage_accepted_at?: string | null;
  contract_sent_at?: string | null;
  signed_at?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  in_production_at?: string | null;
  completed_at?: string | null;
  lost_at?: string | null;
  commercial_stage: ContractCommercialStage;
  commercial_notes?: string | null;
  operational_brief?: string | null;
  pricing_view_mode: ContractPricingMode;
  /** "situation" se creato dalla pagina Situazione clienti → escluso dalla pipeline commerciale. */
  created_from?: string | null;
  featured_quote_id?: number | null;
  quote_links?: ContractQuoteLink[];
  tag_ids?: number[];
  work_area_ids?: number[];
}

export type UpdateContractPayload = Partial<
  Omit<CreateContractPayload, "company_id" | "client_id"> & {
    client_id: number | null;
    lost_notes: string | null;
    quote_links: ContractQuoteLink[];
  }
>;

export interface ContractFromQuoteRequest {
  quote_id: number;
  company_id?: number | null;
  client_id?: number | null;
  owner_user_id?: number | null;
  featured_quote_id?: number | null;
  contract_type?: ContractType | null;
  engagement_type?: ContractEngagementType | null;
  title?: string | null;
  commercial_notes?: string | null;
  operational_brief?: string | null;
  commercial_stage?: ContractCommercialStage | null;
  execution_stage?: string | null;
  stage_sent_at?: string | null;
  stage_negotiation_at?: string | null;
  stage_accepted_at?: string | null;
  contract_sent_at?: string | null;
  signed_at?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  in_production_at?: string | null;
  completed_at?: string | null;
  lost_at?: string | null;
  pricing_view_mode?: ContractPricingMode | null;
  include_quote_in_total?: boolean;
  is_primary_quote?: boolean;
  display_order?: number;
  label?: string | null;
  tag_ids?: number[] | null;
  work_area_ids?: number[] | null;
}

export interface ContractFromQuoteDryRunResponse {
  dry_run: true;
  quote: {
    id: number;
    number: string;
    date: string;
    title: string | null;
    tag: string | null;
    status: string;
    kind: string;
    company_id: number | null;
    client_id: number | null;
  };
  contract_payload: Record<string, unknown>;
  warnings: string[];
}

export type ContractAiGenerationSourceType = "contract" | string;
export type ContractManualGenerationSourceType = "contract" | string;

export type ContractAiEditableStatus = "planned" | "in_progress" | "review" | "completed" | "done" | "cancelled" | "blocked";
export type ContractAiEditableRecurrenceType = "daily_interval" | "monthly_day";

export interface ContractAiDraftTimeSlotInput {
  starts_at: string;
  ends_at: string;
  description: string | null;
  is_completed: boolean;
}

export interface ContractAiChecklistItemInput {
  title: string;
  description: string | null;
  is_completed: boolean;
  due_at: string | null;
  assignee_ids: number[] | null;
  time_slots: ContractAiDraftTimeSlotInput[];
}

export interface ContractAiChecklistInput {
  title: string;
  items: ContractAiChecklistItemInput[];
}

export interface ContractAiGenerateWorkItemsPreviewPayload {
  operation_code?: string;
  max_items?: number;
}

export interface ContractManualGenerateWorkItemsPreviewPayload {
  count?: number;
}

export interface ContractAiWorkItemGeneratedDraft {
  draft_id: string;
  title: string;
  description: string | null;
  is_ped: boolean;
  suggested_assignee_ids: number[];
  suggested_work_area_ids: number[];
  suggested_tag_ids: number[];
  rationale: string | null;
}

export interface ContractAiGenerateWorkItemsResponse {
  contract_id: number;
  company_id: number;
  client_id: number | null;
  operation_code: string;
  llm_profile_slug: string;
  llm_provider: string;
  llm_model_name: string;
  generated_items: ContractAiWorkItemGeneratedDraft[];
}

export interface ContractManualGenerateWorkItemsResponse {
  contract_id: number;
  company_id: number;
  client_id: number | null;
  operation_code: string;
  manual_generation_job_id: string;
  generated_items: ContractAiWorkItemGeneratedDraft[];
}

/** Snapshot della voce di preventivo sorgente, congelato sulla lavorazione (fatturazione per-voce). */
export interface WorkItemBillingSourceInput {
  quote_id?: number | null;
  line_key?: string | null;
  label?: string | null;
  description?: string | null;
  billing_period?: string | null;
  unit_net?: number | null;
  quantity?: number | null;
  discount_pct?: number | null;
  vat?: number | null;
  area_id?: number | null;
  area_name?: string | null;
}

export interface ContractAiWorkItemDraftUpsert {
  draft_id: string;
  title: string;
  description: string | null;
  ped_configuration_id: number | null;
  ped_configuration: PedConfigurationInline | null;
  work_date: string | null;
  estimated_hours: number | null;
  start_time: string | null;
  deadline_date: string | null;
  status: ContractAiEditableStatus;
  task_type: WorkItemTaskType;
  is_ped: boolean;
  assignee_ids: number[];
  work_area_ids: number[];
  tag_ids: number[];
  is_recurring: boolean;
  recurrence_type: ContractAiEditableRecurrenceType | null;
  recurrence_interval_days: number | null;
  recurrence_day_of_month: number | null;
  recurrence_until: string | null;
  generate_recurrences: boolean;
  generation_end_date: string | null;
  progress_percent: number;
  is_completed: boolean;
  actual_hours_spent: number | null;
  affects_daily_load: boolean | null;
  load_weight_factor: number | null;
  is_left_behind: boolean;
  left_behind_reason: LeftBehindReason | null;
  left_behind_note: string | null;
  urgency_level: UrgencyLevel | null;
  is_priority: boolean;
  contract_ids: number[];
  time_slots: ContractAiDraftTimeSlotInput[];
  checklists: ContractAiChecklistInput[];
  billing_source?: WorkItemBillingSourceInput | null;
}

export interface ContractAiSaveOneWorkItemPayload {
  ai_generation_job_id: string;
  ai_generation_job_item_id: string;
  draft: ContractAiWorkItemDraftUpsert;
  ai_generation_source_type: ContractAiGenerationSourceType;
}

export interface ContractAiSaveOneWorkItemResponse {
  work_item_id: number;
  draft_id: string;
  title: string;
  ai_generation_job_id: string;
  ai_generation_job_item_id: string;
}

export interface ContractAiSaveBulkDraftPayload {
  ai_generation_job_id: string;
  ai_generation_job_item_id: string;
  draft: ContractAiWorkItemDraftUpsert;
  ai_generation_source_type: ContractAiGenerationSourceType;
}

export interface ContractAiSaveBulkWorkItemsPayload {
  ai_generation_job_id: string;
  ai_generation_source_type: ContractAiGenerationSourceType;
  drafts: ContractAiSaveBulkDraftPayload[];
}

export interface ContractAiSaveBulkError {
  draft_id: string;
  error: string;
}

export interface ContractAiSaveBulkWorkItemsResponse {
  contract_id: number;
  created_work_items: ContractAiSaveOneWorkItemResponse[];
  errors: ContractAiSaveBulkError[];
}

export interface ContractManualSaveOneWorkItemPayload {
  manual_generation_job_id: string;
  manual_generation_job_item_id: string;
  draft: ContractAiWorkItemDraftUpsert;
  generation_source_type: ContractManualGenerationSourceType;
}

export interface ContractManualSaveOneWorkItemResponse {
  work_item_id: number;
  draft_id: string;
  title: string;
  manual_generation_job_id: string;
  manual_generation_job_item_id: string;
}

export interface ContractManualSaveBulkDraftPayload {
  manual_generation_job_id: string;
  manual_generation_job_item_id: string;
  draft: ContractAiWorkItemDraftUpsert;
  generation_source_type: ContractManualGenerationSourceType;
}

export interface ContractManualSaveBulkWorkItemsPayload {
  manual_generation_job_id: string;
  generation_source_type: ContractManualGenerationSourceType;
  drafts: ContractManualSaveBulkDraftPayload[];
}

export interface ContractManualSaveBulkError {
  draft_id: string;
  error: string;
}

export interface ContractManualSaveBulkWorkItemsResponse {
  contract_id: number;
  created_work_items: ContractManualSaveOneWorkItemResponse[];
  errors: ContractManualSaveBulkError[];
}

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

export async function listContractsApi(params?: ListContractsParams): Promise<ContractListItemResponse[]> {
  const qs = new URLSearchParams();
  if (params?.company_id != null) qs.set("company_id", String(params.company_id));
  if (params?.client_id != null) qs.set("client_id", String(params.client_id));
  if (params?.commercial_stage) qs.set("commercial_stage", params.commercial_stage);
  if (params?.include_inactive != null) qs.set("include_inactive", String(params.include_inactive));
  if (params?.include_deleted != null) qs.set("include_deleted", String(params.include_deleted));
  const suffix = qs.toString() ? `?${qs}` : "";
  const res = await authFetch(`${API_BASE}/api/v1/contracts${suffix}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Impossibile recuperare la pipeline contratti"));
  }
  return res.json();
}

export async function listCommercialPipelineApi(
  params?: ListCommercialPipelineParams
): Promise<CommercialPipelineItem[]> {
  const qs = new URLSearchParams();
  if (params?.company_id != null) qs.set("company_id", String(params.company_id));
  if (params?.client_id != null) qs.set("client_id", String(params.client_id));
  if (params?.commercial_stage) qs.set("commercial_stage", params.commercial_stage);
  if (params?.entity_type) qs.set("entity_type", params.entity_type);
  qs.set("include_inactive", String(params?.include_inactive ?? false));
  qs.set("include_deleted", String(params?.include_deleted ?? false));
  const suffix = qs.toString() ? `?${qs}` : "";
  const res = await authFetch(`${API_BASE}/api/v1/contracts/pipeline/commercial${suffix}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Impossibile recuperare la pipeline commerciale"));
  }
  return res.json();
}

export async function getContractApi(contractId: number): Promise<ContractDetailResponse> {
  const res = await authFetch(`${API_BASE}/api/v1/contracts/${contractId}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Impossibile recuperare il dettaglio contratto"));
  }
  return res.json();
}

export async function getContractWorkItemsCompletionApi(
  contractId: number
): Promise<ContractWorkItemsCompletionResponse> {
  const res = await authFetch(`${API_BASE}/api/v1/contracts/${contractId}/work-items/completion`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Impossibile recuperare stato lavorazioni contratto"));
  }
  return res.json();
}

export async function createContractApi(payload: CreateContractPayload): Promise<ContractDetailResponse> {
  const res = await authFetch(`${API_BASE}/api/v1/contracts`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Errore nella creazione contratto"));
  }
  return res.json();
}

export async function contractFromQuoteDryRunApi(
  payload: ContractFromQuoteRequest
): Promise<ContractFromQuoteDryRunResponse> {
  const res = await authFetch(`${API_BASE}/api/v1/contracts/from-quote/dry-run`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Errore dry-run creazione contratto da preventivo"));
  }
  return res.json();
}

export async function createContractFromQuoteApi(
  payload: ContractFromQuoteRequest
): Promise<ContractDetailResponse> {
  const res = await authFetch(`${API_BASE}/api/v1/contracts/from-quote`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Errore creazione contratto da preventivo"));
  }
  return res.json();
}

export async function updateContractApi(contractId: number, payload: UpdateContractPayload): Promise<ContractDetailResponse> {
  const res = await authFetch(`${API_BASE}/api/v1/contracts/${contractId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Errore aggiornamento contratto"));
  }
  return res.json();
}

export async function deleteContractApi(contractId: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/api/v1/contracts/${contractId}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 204) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Errore eliminazione contratto"));
  }
}

export async function bulkDeleteContractsApi(ids: number[]): Promise<BulkDeleteResponse> {
  const res = await authFetch(`${API_BASE}/api/v1/contracts/bulk-delete`, {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Errore eliminazione bulk contratti"));
  }
  return res.json();
}

export async function moveContractStageApi(
  contractId: number,
  payload: { to_stage: ContractCommercialStage; notes?: string | null }
): Promise<ContractDetailResponse> {
  const res = await authFetch(`${API_BASE}/api/v1/contracts/${contractId}/stage/move`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Impossibile spostare lo stage"));
  }
  return res.json();
}

export async function advanceContractStageApi(
  contractId: number,
  payload?: { notes?: string | null }
): Promise<ContractDetailResponse> {
  const res = await authFetch(`${API_BASE}/api/v1/contracts/${contractId}/stage/advance`, {
    method: "PATCH",
    body: JSON.stringify(payload ?? {}),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Impossibile avanzare lo stage"));
  }
  return res.json();
}

export async function regressContractStageApi(
  contractId: number,
  payload?: { notes?: string | null }
): Promise<ContractDetailResponse> {
  const res = await authFetch(`${API_BASE}/api/v1/contracts/${contractId}/stage/regress`, {
    method: "PATCH",
    body: JSON.stringify(payload ?? {}),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Impossibile retrocedere lo stage"));
  }
  return res.json();
}

// ── Piano di fatturazione a percentuali (scadenzario) ───────────────────────

export type BillingTriggerType = "manual" | "stage" | "date";

/** Tranche in ingresso (upsert del piano). */
export interface BillingInstallmentInput {
  id?: number | null;
  label: string;
  percent?: number | null;
  amount_net?: number | null;
  trigger_type: BillingTriggerType;
  trigger_stage?: string | null;
  trigger_date?: string | null;
  due_offset_days?: number | null;
  sort_order?: number;
}

export interface BillingInstallment {
  id: number;
  label: string;
  percent: number | null;
  amount_net_input: number | null;
  trigger_type: BillingTriggerType;
  trigger_stage: string | null;
  trigger_date: string | null;
  due_offset_days: number | null;
  sort_order: number;
  state: "pending" | "released";
  released_at: string | null;
  releasable: boolean;
  amount_net: number;
  amount_vat: number;
  amount_gross: number;
  billing_item_id: number | null;
  billing_state: "da_fatturare" | "fatturato" | null;
  invoice_number: string | null;
}

export interface BillingPlan {
  contract_id: number;
  billing_mode: "per_lavorazione" | "piano";
  base_net: number;
  base_net_default: number;
  vat_rate: number;
  base_gross: number;
  installments: BillingInstallment[];
  allocated_percent: number;
  allocated_net: number;
  remaining_percent: number;
  remaining_net: number;
}

export interface BillingPlanUpdatePayload {
  billing_mode: "per_lavorazione" | "piano";
  base_net?: number | null;
  vat_rate?: number | null;
  installments: BillingInstallmentInput[];
}

export async function getContractBillingPlanApi(contractId: number): Promise<BillingPlan> {
  const res = await authFetch(`${API_BASE}/api/v1/contracts/${contractId}/billing-plan`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Impossibile recuperare il piano di fatturazione"));
  }
  return res.json();
}

export async function updateContractBillingPlanApi(
  contractId: number,
  payload: BillingPlanUpdatePayload
): Promise<BillingPlan> {
  const res = await authFetch(`${API_BASE}/api/v1/contracts/${contractId}/billing-plan`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Impossibile salvare il piano di fatturazione"));
  }
  return res.json();
}

export async function releaseInstallmentApi(
  contractId: number,
  installmentId: number
): Promise<BillingPlan> {
  const res = await authFetch(
    `${API_BASE}/api/v1/contracts/${contractId}/billing-plan/installments/${installmentId}/release`,
    { method: "POST" }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Impossibile inviare la tranche in fatturazione"));
  }
  return res.json();
}

export async function unreleaseInstallmentApi(
  contractId: number,
  installmentId: number
): Promise<BillingPlan> {
  const res = await authFetch(
    `${API_BASE}/api/v1/contracts/${contractId}/billing-plan/installments/${installmentId}/unrelease`,
    { method: "POST" }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Impossibile annullare il rilascio della tranche"));
  }
  return res.json();
}

export async function previewContractAiWorkItemsApi(
  contractId: number,
  payload: ContractAiGenerateWorkItemsPreviewPayload
): Promise<ContractAiGenerateWorkItemsResponse> {
  const res = await authFetch(`${API_BASE}/api/v1/contracts/${contractId}/ai/work-items/preview`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Errore generazione anteprima lavorazioni AI"));
  }
  return res.json();
}

export async function saveOneContractAiWorkItemApi(
  contractId: number,
  payload: ContractAiSaveOneWorkItemPayload
): Promise<ContractAiSaveOneWorkItemResponse> {
  const res = await authFetch(`${API_BASE}/api/v1/contracts/${contractId}/ai/work-items/save-one`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Errore salvataggio singola lavorazione AI"));
  }
  return res.json();
}

export async function saveBulkContractAiWorkItemsApi(
  contractId: number,
  payload: ContractAiSaveBulkWorkItemsPayload
): Promise<ContractAiSaveBulkWorkItemsResponse> {
  const res = await authFetch(`${API_BASE}/api/v1/contracts/${contractId}/ai/work-items/save-bulk`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Errore salvataggio massivo lavorazioni AI"));
  }
  return res.json();
}

export async function previewContractManualWorkItemsApi(
  contractId: number,
  payload: ContractManualGenerateWorkItemsPreviewPayload
): Promise<ContractManualGenerateWorkItemsResponse> {
  const res = await authFetch(`${API_BASE}/api/v1/contracts/${contractId}/manual/work-items/preview`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Errore generazione anteprima lavorazioni manuali"));
  }
  return res.json();
}

export async function saveOneContractManualWorkItemApi(
  contractId: number,
  payload: ContractManualSaveOneWorkItemPayload
): Promise<ContractManualSaveOneWorkItemResponse> {
  const res = await authFetch(`${API_BASE}/api/v1/contracts/${contractId}/manual/work-items/save-one`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Errore salvataggio singola lavorazione manuale"));
  }
  return res.json();
}

export async function saveBulkContractManualWorkItemsApi(
  contractId: number,
  payload: ContractManualSaveBulkWorkItemsPayload
): Promise<ContractManualSaveBulkWorkItemsResponse> {
  const res = await authFetch(`${API_BASE}/api/v1/contracts/${contractId}/manual/work-items/save-bulk`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Errore salvataggio massivo lavorazioni manuali"));
  }
  return res.json();
}
