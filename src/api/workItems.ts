import { authFetch, API_BASE } from "./auth";

function parseApiError(body: unknown, fallback: string): string {
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

// ── Types ─────────────────────────────────────────────────────────────────────

export type WorkItemStatus = "planned" | "in_progress" | "review" | "completed";
export type UrgencyLevel = "low" | "normal" | "high" | "critical";
export type WorkItemTaskType = "standard" | "quick";
export type LeftBehindReason = "operator_responsibility" | "client_protection" | "justified_delay" | "other";
export type WorkItemRecurrenceType = "daily_interval" | "monthly_day";

export interface TimeSlot {
  id: number;
  work_item_id: number;
  starts_at: string;
  ends_at: string;
  description: string | null;
  is_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChecklistItemTimeSlot {
  id: number;
  starts_at: string;
  ends_at: string;
  description: string | null;
  is_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChecklistItem {
  id: number;
  title: string;
  description: string | null;
  is_completed: boolean;
  due_at: string | null;
  assignee_ids: number[];
  time_slots: ChecklistItemTimeSlot[];
  created_at: string;
  updated_at: string;
}

export interface Checklist {
  id: number;
  title: string;
  items: ChecklistItem[];
  created_at: string;
  updated_at: string;
}

export interface ChecklistItemTimeSlotInput {
  starts_at: string;
  ends_at: string;
  description: string | null;
  is_completed: boolean;
}

export interface ChecklistItemInput {
  title: string;
  description?: string | null;
  is_completed?: boolean;
  due_at?: string | null;
  assignee_ids?: number[] | null;
  time_slots?: ChecklistItemTimeSlotInput[];
}

export interface ChecklistInput {
  title: string;
  items?: ChecklistItemInput[];
}

export interface WorkItemHistoryEvent {
  id: number;
  actor_user_id: number | null;
  event_type: string;
  field_name: string | null;
  from_value: unknown;
  to_value: unknown;
  notes: string | null;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
}

export interface WorkItem {
  id: number;
  company_id: number;
  client_id: number | null;
  contract_ids?: number[];
  is_template?: boolean;
  template_source_id?: number | null;
  is_ai_generated?: boolean;
  ai_generation_job_id?: string | null;
  ai_generation_job_item_id?: string | null;
  ai_source_contract_id?: number | null;
  ai_generation_source_type?: string | null;
  title: string;
  description: string | null;
  work_date: string | null;
  start_time: string | null;
  deadline_date: string | null;
  due_time_label: string | null;
  status: WorkItemStatus;
  progress_percent: number;
  is_completed: boolean;
  estimated_hours: number | null;
  workload_strategy: string | null;
  workload_strategy_version: string | null;
  is_fractionable: boolean;
  force_today: boolean;
  affects_daily_load: boolean;
  load_weight_factor: number;
  effective_load_hours: number;
  is_left_behind: boolean;
  left_behind_reason: LeftBehindReason | null;
  left_behind_note: string | null;
  actual_hours_spent: number | null;
  urgency_level: UrgencyLevel | null;
  task_type?: WorkItemTaskType;
  is_priority: boolean;
  workload_conflict_code?: string | null;
  workload_overload_hours?: number | null;
  workload_result_json?: Record<string, unknown> | null;
  assignee_ids?: number[];
  work_area_ids?: number[];
  tag_ids?: number[];
  time_slots: TimeSlot[];
  checklists?: Checklist[];
  history?: WorkItemHistoryEvent[];
  is_PED?: boolean;
  ped_configuration_id?: number | null;
  ped_configuration?: {
    monthly_publications_total: number;
    tone_of_voice?: string | null;
    photo_posts_per_month: number;
    carousels_per_month: number;
    reels_per_month: number;
    stories_per_month: number;
  } | null;
  is_recurring: boolean;
  recurrence_type: WorkItemRecurrenceType | null;
  recurrence_interval_days: number | null;
  recurrence_day_of_month: number | null;
  recurrence_until: string | null;
  recurrence_parent_id: number | null;
  created_at: string;
  updated_at: string;
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

export interface BulkDeleteWorkItemsResponse {
  deleted: number[];
  errors: Array<{ id: number; detail: string }>;
}

// ── Work Items ─────────────────────────────────────────────────────────────────

export interface ListWorkItemsParams {
  company_id?: number;
  assignee_id?: number;
  from_date?: string;
  to_date?: string;
  status?: WorkItemStatus;
  is_completed?: boolean;
  task_type?: WorkItemTaskType;
  affects_daily_load?: boolean;
  is_left_behind?: boolean;
  left_behind_reason?: LeftBehindReason;
  include_templates?: boolean;
  only_templates?: boolean;
}

export interface CreateQuickTaskPayload {
  detail: string;
  client_id: number;
  deadline_date: string;
  company_id?: number;
  urgency_level?: UrgencyLevel;
  is_priority?: boolean;
  assignee_ids?: number[];
}

export interface CreateQuickTaskResponse {
  item: WorkItem;
  auto_assigned_user_id: number | null;
}

export interface QuickTaskValidationDetail {
  message?: string;
  missing_fields?: string[];
}

export interface QuickTaskApiError extends Error {
  status: number;
  missingFields?: string[];
  backendMessage?: string;
}

export interface CreateWorkItemPayload {
  company_id: number;
  is_template?: boolean;
  client_id?: number | null;
  title: string;
  description?: string | null;
  work_date?: string | null;
  start_time?: string | null;
  deadline_date?: string | null;
  due_time_label?: string | null;
  status?: WorkItemStatus;
  progress_percent?: number;
  is_completed?: boolean;
  estimated_hours?: number | null;
  workload_strategy?: string | null;
  workload_strategy_version?: string | null;
  is_fractionable?: boolean;
  force_today?: boolean;
  affects_daily_load?: boolean;
  load_weight_factor?: number;
  is_left_behind?: boolean;
  left_behind_reason?: LeftBehindReason | null;
  left_behind_note?: string | null;
  actual_hours_spent?: number | null;
  urgency_level?: UrgencyLevel | null;
  is_priority?: boolean;
  workload_conflict_code?: string | null;
  workload_overload_hours?: number | null;
  workload_result_json?: Record<string, unknown> | null;
  assignee_ids?: number[];
  work_area_ids?: number[];
  tag_ids?: number[];
  is_PED?: boolean;
  ped_configuration_id?: number | null;
  ped_configuration?: {
    monthly_publications_total: number;
    tone_of_voice?: string | null;
    photo_posts_per_month: number;
    carousels_per_month: number;
    reels_per_month: number;
    stories_per_month: number;
  };
  is_recurring?: boolean;
  recurrence_type?: WorkItemRecurrenceType | null;
  recurrence_interval_days?: number | null;
  recurrence_day_of_month?: number | null;
  recurrence_until?: string | null;
  generate_recurrences?: boolean;
  generation_end_date?: string | null;
  checklists?: ChecklistInput[];
}

export type UpdateWorkItemPayload = Partial<CreateWorkItemPayload>;

export interface InstantiateTemplatePayload {
  client_id?: number | null;
  title?: string;
  description?: string | null;
  work_date?: string | null;
  start_time?: string | null;
  deadline_date?: string | null;
  due_time_label?: string | null;
  status?: WorkItemStatus;
  progress_percent?: number;
  is_completed?: boolean;
  estimated_hours?: number | null;
  workload_strategy?: string | null;
  workload_strategy_version?: string | null;
  is_fractionable?: boolean;
  force_today?: boolean;
  affects_daily_load?: boolean;
  load_weight_factor?: number;
  is_left_behind?: boolean;
  left_behind_reason?: LeftBehindReason | null;
  left_behind_note?: string | null;
  actual_hours_spent?: number | null;
  urgency_level?: UrgencyLevel | null;
  is_priority?: boolean;
  workload_conflict_code?: string | null;
  workload_overload_hours?: number | null;
  workload_result_json?: Record<string, unknown> | null;
  assignee_ids?: number[];
  work_area_ids?: number[];
  tag_ids?: number[];
  is_PED?: boolean;
  ped_configuration_id?: number | null;
  ped_configuration?: {
    monthly_publications_total: number;
    tone_of_voice?: string | null;
    photo_posts_per_month: number;
    carousels_per_month: number;
    reels_per_month: number;
    stories_per_month: number;
  };
  is_recurring?: boolean;
  recurrence_type?: WorkItemRecurrenceType | null;
  recurrence_interval_days?: number | null;
  recurrence_day_of_month?: number | null;
  recurrence_until?: string | null;
  generate_recurrences?: boolean;
  generation_end_date?: string | null;
  checklists?: ChecklistInput[];
}

export interface GenerateWorkItemRecurrencesPayload {
  generation_end_date?: string | null;
}

export interface GenerateWorkItemRecurrencesResponse {
  source_work_item_id: number;
  generated_count: number;
  generated_ids: number[];
}

export async function listWorkItemsApi(params: ListWorkItemsParams = {}): Promise<WorkItem[]> {
  const query = new URLSearchParams();
  if (params.company_id != null) query.set("company_id", String(params.company_id));
  if (params.assignee_id != null) query.set("assignee_id", String(params.assignee_id));
  if (params.from_date) query.set("from_date", params.from_date);
  if (params.to_date) query.set("to_date", params.to_date);
  if (params.status) query.set("status", params.status);
  if (params.is_completed != null) query.set("is_completed", String(params.is_completed));
  if (params.task_type) query.set("task_type", params.task_type);
  if (params.affects_daily_load != null) query.set("affects_daily_load", String(params.affects_daily_load));
  if (params.is_left_behind != null) query.set("is_left_behind", String(params.is_left_behind));
  if (params.left_behind_reason) query.set("left_behind_reason", params.left_behind_reason);
  if (params.include_templates != null) query.set("include_templates", String(params.include_templates));
  if (params.only_templates != null) query.set("only_templates", String(params.only_templates));
  const qs = query.toString();
  const url = `${API_BASE}/api/v1/work-items${qs ? `?${qs}` : ""}`;
  const res = await authFetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Impossibile recuperare le lavorazioni"));
  }
  return res.json();
}

export async function getWorkItemApi(id: number): Promise<WorkItem> {
  const res = await authFetch(`${API_BASE}/api/v1/work-items/${id}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Lavorazione non trovata")}`);
  }
  return res.json();
}

export async function createWorkItemApi(payload: CreateWorkItemPayload): Promise<WorkItem> {
  const res = await authFetch(`${API_BASE}/api/v1/work-items`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Errore nella creazione lavorazione")}`);
  }
  return res.json();
}

export async function updateWorkItemApi(id: number, payload: UpdateWorkItemPayload): Promise<WorkItem> {
  const res = await authFetch(`${API_BASE}/api/v1/work-items/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Errore nell'aggiornamento lavorazione")}`);
  }
  return res.json();
}

export async function instantiateWorkItemTemplateApi(
  templateId: number,
  payload: InstantiateTemplatePayload
): Promise<WorkItem> {
  const res = await authFetch(`${API_BASE}/api/v1/work-items/${templateId}/instantiate`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Errore nella creazione da modello")}`);
  }
  return res.json();
}

export async function generateWorkItemRecurrencesApi(
  id: number,
  payload: GenerateWorkItemRecurrencesPayload = {}
): Promise<GenerateWorkItemRecurrencesResponse> {
  const res = await authFetch(`${API_BASE}/api/v1/work-items/${id}/generate-recurrences`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Errore nella generazione ricorrenze")}`);
  }
  return res.json();
}

export async function deleteWorkItemApi(id: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/api/v1/work-items/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Errore nell'eliminazione lavorazione")}`);
  }
}

export async function bulkDeleteWorkItemsApi(ids: number[]): Promise<BulkDeleteWorkItemsResponse> {
  const res = await authFetch(`${API_BASE}/api/v1/work-items/bulk-delete`, {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Errore nell'eliminazione bulk lavorazioni"));
  }
  return res.json();
}

export interface MoveWorkItemPayload {
  assignee_id?: number | null;
  assignee_ids?: number[];
  work_area_id?: number | null;
  work_area_ids?: number[];
  work_date?: string | null;
  start_time?: string | null;
}

export async function moveWorkItemApi(id: number, payload: MoveWorkItemPayload): Promise<WorkItem> {
  const res = await authFetch(`${API_BASE}/api/v1/work-items/${id}/move`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Errore nello spostamento lavorazione")}`);
  }
  return res.json();
}

export async function createQuickTaskApi(payload: CreateQuickTaskPayload): Promise<CreateQuickTaskResponse> {
  const res = await authFetch(`${API_BASE}/api/v1/work-items/quick-task`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = (body as { detail?: unknown }).detail;
    const structuredDetail = detail && typeof detail === "object" ? (detail as QuickTaskValidationDetail) : null;

    const backendMessage =
      (structuredDetail?.message && structuredDetail.message.trim()) ||
      parseApiError(body, "Errore nella creazione della quick task");

    const error = new Error(`[${res.status}] ${backendMessage}`) as QuickTaskApiError;
    error.status = res.status;
    error.backendMessage = backendMessage;
    if (structuredDetail?.missing_fields?.length) {
      error.missingFields = structuredDetail.missing_fields;
    }

    throw error;
  }

  return res.json();
}

// ── Work Tags ──────────────────────────────────────────────────────────────────

export interface CreateWorkTagPayload {
  company_id: number;
  name: string;
  slug?: string;
  color?: string | null;
}

export async function listWorkTagsApi(company_id?: number): Promise<WorkTag[]> {
  const url = company_id
    ? `${API_BASE}/api/v1/work-tags?company_id=${company_id}`
    : `${API_BASE}/api/v1/work-tags`;
  const res = await authFetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Impossibile recuperare i tag"));
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

export async function updateWorkTagApi(id: number, payload: Partial<CreateWorkTagPayload>): Promise<WorkTag> {
  const res = await authFetch(`${API_BASE}/api/v1/work-tags/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Errore nell'aggiornamento tag")}`);
  }
  return res.json();
}

export async function deleteWorkTagApi(id: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/api/v1/work-tags/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Errore nell'eliminazione tag")}`);
  }
}

// ── Time Slots ─────────────────────────────────────────────────────────────────

export interface CreateTimeSlotPayload {
  starts_at: string;
  ends_at: string;
  description?: string | null;
  is_completed?: boolean;
}

export type UpdateTimeSlotPayload = Partial<CreateTimeSlotPayload>;

export async function listTimeSlotsApi(workItemId: number): Promise<TimeSlot[]> {
  const res = await authFetch(`${API_BASE}/api/v1/work-items/${workItemId}/time-slots`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Impossibile recuperare gli slot orari"));
  }
  return res.json();
}

export async function createTimeSlotApi(workItemId: number, payload: CreateTimeSlotPayload): Promise<TimeSlot> {
  const res = await authFetch(`${API_BASE}/api/v1/work-items/${workItemId}/time-slots`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Errore nella creazione slot")}`);
  }
  return res.json();
}

export async function updateTimeSlotApi(slotId: number, payload: UpdateTimeSlotPayload): Promise<TimeSlot> {
  const res = await authFetch(`${API_BASE}/api/v1/work-items/time-slots/${slotId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Errore nell'aggiornamento slot")}`);
  }
  return res.json();
}

export async function deleteTimeSlotApi(slotId: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/api/v1/work-items/time-slots/${slotId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Errore nell'eliminazione slot")}`);
  }
}
