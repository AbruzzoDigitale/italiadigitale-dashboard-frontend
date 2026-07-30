import { authFetch, API_BASE } from "./auth";

function parseApiError(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const detail = (body as { detail?: unknown }).detail;
    const message = (body as { message?: unknown }).message;
    const error = (body as { error?: unknown }).error;
    const detailMessage = detail && typeof detail === "object" ? (detail as { message?: unknown }).message : null;
    return (
      (typeof detail === "string" && detail) ||
      (typeof detailMessage === "string" && detailMessage) ||
      (typeof message === "string" && message) ||
      (typeof error === "string" && error) ||
      fallback
    );
  }
  return fallback;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type WorkItemStatus = "planned" | "in_progress" | "review" | "completed" | "blocked" | "cancelled";
export type UrgencyLevel = "low" | "normal" | "high" | "critical";

const STATUS_STAGE: Record<string, number> = {
  planned: 0,
  in_progress: 1,
  review: 2,
  completed: 3,
  done: 3,
};

/** True se è un "rimando indietro": da revisione/completato a uno stadio precedente. */
export function isReviewSendBack(oldStatus: string, newStatus: string): boolean {
  const from = STATUS_STAGE[oldStatus] ?? 0;
  const to = STATUS_STAGE[newStatus] ?? 0;
  return (oldStatus === "review" || oldStatus === "completed" || oldStatus === "done") && to < from;
}
export type WorkItemTaskType = "standard" | "quick";
export type LeftBehindReason = "operator_responsibility" | "client_protection" | "justified_delay" | "other";
export type WorkItemRecurrenceType = "daily_interval" | "monthly_day";
export type WorkItemScheduleDelayCode = "carried_over" | "carried_forward" | "non_deferrable_overdue" | null;

export interface WorkItemOverlapConflict {
  work_item_id: number;
  title: string;
  start_time: string | null;
  end_time: string | null;
  overlap_start_time: string;
  overlap_end_time: string;
  overlap_minutes: number;
  assignee_ids: number[];
}

/** Slot libero suggerito dal backend per riprogrammare la task in conflitto. */
export interface WorkItemSuggestedSlot {
  date: string;             // "YYYY-MM-DD"
  start_time: string;       // "HH:MM"
  end_time: string;         // "HH:MM" (start + durata)
  duration_minutes: number;
  available_until: string;  // "HH:MM" fine del buco libero
}

export interface WorkItemOverlapApiError extends Error {
  status: 409;
  backendMessage: string;
  conflicts: WorkItemOverlapConflict[];
  /** Slot liberi consigliati per la riprogrammazione (può essere vuoto). */
  suggestedSlots: WorkItemSuggestedSlot[];
}

export function isWorkItemOverlapApiError(error: unknown): error is WorkItemOverlapApiError {
  return error instanceof Error && (error as Partial<WorkItemOverlapApiError>).status === 409 && Array.isArray((error as Partial<WorkItemOverlapApiError>).conflicts);
}

function buildApiError(res: Response, body: unknown, fallback: string): Error {
  const message = parseApiError(body, fallback);
  const detail = body && typeof body === "object" ? (body as { detail?: unknown }).detail : null;
  const conflicts = detail && typeof detail === "object" ? (detail as { conflicts?: unknown }).conflicts : null;
  if (res.status === 409 && Array.isArray(conflicts)) {
    const suggested = detail && typeof detail === "object" ? (detail as { suggested_slots?: unknown }).suggested_slots : null;
    const error = new Error(`[${res.status}] ${message}`) as WorkItemOverlapApiError;
    error.status = 409;
    error.backendMessage = message;
    error.conflicts = conflicts as WorkItemOverlapConflict[];
    error.suggestedSlots = Array.isArray(suggested) ? (suggested as WorkItemSuggestedSlot[]) : [];
    return error;
  }
  return new Error(`[${res.status}] ${message}`);
}

export interface WorkItemScheduleState {
  is_overdue: boolean;
  overdue_days: number;
  is_left_behind: boolean;
  is_severe_delay: boolean;
  effective_work_date: string | null;
  effective_load_weight_factor: number;
  effective_load_hours: number;
  delay_code: WorkItemScheduleDelayCode;
  should_force_today: boolean;
  schedule_date: string;
}

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

export interface WorkItemResource {
  id: number;
  type: string;
  title: string;
  url: string;
  position: number;
  created_at: string;
  updated_at: string;
}

/** Payload risorsa in creazione/aggiornamento (l'ordine dell'array = ordine mostrato). */
export interface WorkItemResourceInput {
  type: string;
  title: string;
  url: string;
}

/** File allegato alla task (salvato su cloud storage, scaricabile via URL firmato). */
export interface WorkItemAttachment {
  id: number;
  original_filename: string;
  /** Nome mostrato scelto dall'utente; se assente si usa original_filename. */
  label?: string | null;
  content_type: string;
  size_bytes: number;
  uploaded_by: number | null;
  uploaded_by_name?: string | null;
  created_at: string;
}

/** Nome da mostrare per un allegato: etichetta scelta o nome file. */
export function attachmentDisplayName(a: Pick<WorkItemAttachment, "label" | "original_filename">): string {
  return a.label?.trim() || a.original_filename;
}

export interface WorkItemHistoryEvent {
  id: number;
  actor_user_id: number | null;
  actor_name: string | null;
  event_type: string;
  field_name: string | null;
  from_value: unknown;
  to_value: unknown;
  notes: string | null;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
}

export type TrelloSyncDirection = "push" | "pull";
/** "push" = comanda il gestionale (→ Trello); "pull" = comanda Trello (→ gestionale). */
export interface TrelloSyncSettings {
  enabled?: boolean;
  direction?: TrelloSyncDirection | null;
}
export interface WorkItemSettings {
  trello_sync?: TrelloSyncSettings;
  [key: string]: unknown;
}

export interface WorkItem {
  id: number;
  company_id: number;
  client_id: number | null;
  contract_ids?: number[];
  /** Profili social collegati (id dal registro profili social dell'azienda). */
  social_profile_ids?: number[];
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
  /** Timbrati alla transizione di stato; base della metrica di ciclo. */
  in_progress_entered_at?: string | null;
  review_entered_at?: string | null;
  estimated_hours: number | null;
  is_fractionable: boolean;
  is_deadline_locked: boolean;
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
  schedule_state?: WorkItemScheduleState | null;
  reviewer_user_id?: number | null;
  reviewer_name?: string | null;
  // Scheda Revisione
  review_stage?: "interna" | "approvata_interna" | "cliente" | "approvata_cliente" | null;
  rework_count?: number;
  rework_interna?: number;
  last_review_source?: "interna" | "cliente" | null;
  delivered_to_client_at?: string | null;
  /** "In pubblicazione": approvata/pronta ma non ancora pubblicata (badge + peso ridotto). */
  client_approved_at?: string | null;
  // Collegamento Trello
  trello_card_id?: string | null;
  trello_card_url?: string | null;
  trello_board_id?: string | null;
  // Impostazioni per-task (contenitore generico, estensibile)
  settings?: WorkItemSettings | null;
  assignee_ids?: number[];
  work_area_ids?: number[];
  tag_ids?: number[];
  time_slots: TimeSlot[];
  checklists?: Checklist[];
  resources?: WorkItemResource[];
  attachments?: WorkItemAttachment[];
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
  /** null = task attiva · valorizzato = archiviata (soft-delete) */
  deleted_at?: string | null;
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
  is_deadline_locked?: boolean;
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
  is_fractionable?: boolean;
  is_deadline_locked?: boolean;
  affects_daily_load?: boolean;
  load_weight_factor?: number;
  is_left_behind?: boolean;
  left_behind_reason?: LeftBehindReason | null;
  left_behind_note?: string | null;
  actual_hours_spent?: number | null;
  urgency_level?: UrgencyLevel | null;
  is_priority?: boolean;
  assignee_ids?: number[];
  work_area_ids?: number[];
  tag_ids?: number[];
  /** Profili social del cliente da collegare alla task (sostituisce l'insieme). */
  social_profile_ids?: number[];
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
  resources?: WorkItemResourceInput[];
}

export type UpdateWorkItemPayload = Partial<CreateWorkItemPayload> & {
  /** Commento opzionale del cambio stato, salvato come nota nella timeline. */
  status_comment?: string | null;
  /** Revisore nominato (solo PM/Admin). null per rimuovere. */
  reviewer_user_id?: number | null;
  /** Contratti collegati alla lavorazione (sostituisce l'insieme corrente). */
  contract_ids?: number[] | null;
};

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
  is_fractionable?: boolean;
  is_deadline_locked?: boolean;
  affects_daily_load?: boolean;
  load_weight_factor?: number;
  is_left_behind?: boolean;
  left_behind_reason?: LeftBehindReason | null;
  left_behind_note?: string | null;
  actual_hours_spent?: number | null;
  urgency_level?: UrgencyLevel | null;
  is_priority?: boolean;
  assignee_ids?: number[];
  work_area_ids?: number[];
  tag_ids?: number[];
  /** Profili social del cliente da collegare alla task (sostituisce l'insieme). */
  social_profile_ids?: number[];
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
  resources?: WorkItemResourceInput[];
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
  if (params.is_deadline_locked != null) query.set("is_deadline_locked", String(params.is_deadline_locked));
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
    throw buildApiError(res, body, "Errore nella creazione lavorazione");
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
    throw buildApiError(res, body, "Errore nell'aggiornamento lavorazione");
  }
  return res.json();
}

/** Spunta "In pubblicazione": approvata/pronta ma non pubblicata → torna in corso a peso
 *  ridotto (~10%) e resta visibile finché non esce. `on=false` rimuove la spunta. */
export async function setAwaitingPublishApi(
  id: number,
  on: boolean,
  loadWeightFactor?: number,
): Promise<WorkItem> {
  const res = await authFetch(`${API_BASE}/api/v1/work-items/${id}/awaiting-publish`, {
    method: "POST",
    body: JSON.stringify({ on, load_weight_factor: loadWeightFactor ?? null }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw buildApiError(res, body, "Errore nell'aggiornamento 'In pubblicazione'");
  }
  return res.json();
}

// ── Allegati (file su cloud storage) ─────────────────────────────────────────

export interface WorkItemAttachmentDownload {
  url: string;
  filename: string;
  expires_at: string;
}

/** Carica un file e lo allega alla task. Multipart: fetch raw (authFetch forza JSON). */
export async function uploadWorkItemAttachmentApi(
  workItemId: number,
  file: File
): Promise<WorkItemAttachment> {
  const token = localStorage.getItem("id_token");
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/api/v1/work-items/${workItemId}/attachments`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Errore nel caricamento dell'allegato"));
  }
  return res.json();
}

export async function getWorkItemAttachmentDownloadUrlApi(
  workItemId: number,
  attachmentId: number
): Promise<WorkItemAttachmentDownload> {
  const res = await authFetch(
    `${API_BASE}/api/v1/work-items/${workItemId}/attachments/${attachmentId}/download`
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Impossibile scaricare l'allegato"));
  }
  return res.json();
}

export async function updateWorkItemAttachmentApi(
  workItemId: number,
  attachmentId: number,
  body: { label: string | null }
): Promise<WorkItemAttachment> {
  const res = await authFetch(
    `${API_BASE}/api/v1/work-items/${workItemId}/attachments/${attachmentId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Impossibile rinominare l'allegato"));
  }
  return res.json();
}

export async function deleteWorkItemAttachmentApi(
  workItemId: number,
  attachmentId: number
): Promise<void> {
  const res = await authFetch(
    `${API_BASE}/api/v1/work-items/${workItemId}/attachments/${attachmentId}`,
    { method: "DELETE" }
  );
  if (!res.ok && res.status !== 204) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Impossibile eliminare l'allegato"));
  }
}

/** Merge (shallow) delle impostazioni per-task, es. { trello_sync: { enabled, direction } }. */
export async function saveWorkItemSettingsApi(id: number, patch: Partial<WorkItemSettings>): Promise<WorkItem> {
  const res = await authFetch(`${API_BASE}/api/v1/work-items/${id}/settings`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw buildApiError(res, body, "Errore nel salvataggio impostazioni");
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

// ── Archivio / ripristino (soft-delete) ──────────────────────────────────────────

export interface BulkRestoreResponse {
  requested: number;
  restored_ids: number[];
  errors: { id: number; detail: string }[];
}

/** Archivio aziendale delle task soft-deleted. Rotta dedicata: solo admin/PM (403 per operatori). */
export async function listArchivedWorkItemsApi(
  params: { company_id?: number; client_id?: number; q?: string } = {}
): Promise<WorkItem[]> {
  const query = new URLSearchParams();
  if (params.company_id != null) query.set("company_id", String(params.company_id));
  if (params.client_id != null) query.set("client_id", String(params.client_id));
  if (params.q) query.set("q", params.q);
  const qs = query.toString();
  const res = await authFetch(`${API_BASE}/api/v1/work-items/archived${qs ? `?${qs}` : ""}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Impossibile recuperare l'archivio")}`);
  }
  return res.json();
}

export async function restoreWorkItemApi(id: number): Promise<WorkItem> {
  const res = await authFetch(`${API_BASE}/api/v1/work-items/${id}/restore`, { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Impossibile ripristinare la task")}`);
  }
  return res.json();
}

export async function bulkRestoreWorkItemsApi(ids: number[]): Promise<BulkRestoreResponse> {
  const res = await authFetch(`${API_BASE}/api/v1/work-items/bulk-restore`, {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Impossibile ripristinare le task")}`);
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

export interface RescheduleNextAvailablePayload {
  from_date: string;
  slot_minutes?: number;
}

export async function moveWorkItemApi(id: number, payload: MoveWorkItemPayload): Promise<WorkItem> {
  const res = await authFetch(`${API_BASE}/api/v1/work-items/${id}/move`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw buildApiError(res, body, "Errore nello spostamento lavorazione");
  }
  return res.json();
}

export async function rescheduleNextAvailableWorkItemApi(
  id: number,
  payload: RescheduleNextAvailablePayload
): Promise<WorkItem> {
  const res = await authFetch(`${API_BASE}/api/v1/work-items/${id}/reschedule-next-available`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw buildApiError(res, body, "Errore nella riprogrammazione automatica");
  }
  return res.json();
}

// ── Swap posizioni (drag-and-drop di scambio) ────────────────────────────────────

export type SwapBlockerReason = "overlap" | "out_of_working_hours";

export interface WorkItemSwapPosition {
  work_item_id: number;
  title: string;
  old_start_time: string | null; // "HH:MM"
  new_start_time: string;        // "HH:MM"
  new_end_time: string;          // "HH:MM"
}

export interface WorkItemSwapConflict {
  work_item_id: number;
  reason: SwapBlockerReason;
  conflicts: Array<Record<string, unknown>>;
}

export interface WorkItemSwapPreviewResponse {
  can_swap: boolean;
  work_date: string | null;
  user_id: number | null;
  positions: WorkItemSwapPosition[];
  blockers: WorkItemSwapConflict[];
}

/** Posizione MOSTRATA (reflow) di una task nel calendario, inviata allo swap. */
export interface WorkItemSwapEffectivePosition {
  work_item_id: number;
  work_date: string;     // "YYYY-MM-DD"
  start_minutes: number; // minuti dalla mezzanotte
}

export interface WorkItemSwapRequest {
  source_work_item_ids: number[];
  target_work_item_ids: number[];
  /** Conferma esplicita dello scambio (bypassa il warning di conferma). */
  confirm?: boolean;
  /** Posizioni mostrate nel calendario delle task coinvolte (per swap coerente delle trascinate). */
  effective_positions?: WorkItemSwapEffectivePosition[];
}

/** 409 con detail.code === "confirmation_required": serve conferma utente. */
export class SwapConfirmationRequiredError extends Error {
  preview: WorkItemSwapPreviewResponse;
  constructor(preview: WorkItemSwapPreviewResponse, message?: string) {
    super(message || "Conferma richiesta per applicare lo scambio");
    this.name = "SwapConfirmationRequiredError";
    this.preview = preview;
  }
}

export function isSwapConfirmationRequiredError(err: unknown): err is SwapConfirmationRequiredError {
  return err instanceof SwapConfirmationRequiredError;
}

export async function swapWorkItemsPreviewApi(
  body: WorkItemSwapRequest
): Promise<WorkItemSwapPreviewResponse> {
  const res = await authFetch(`${API_BASE}/api/v1/work-items/swap-preview`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(e, "Impossibile verificare lo scambio")}`);
  }
  return res.json();
}

export async function swapWorkItemsApi(
  body: WorkItemSwapRequest
): Promise<WorkItemSwapPreviewResponse> {
  const res = await authFetch(`${API_BASE}/api/v1/work-items/swap`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    const detail = (e as { detail?: unknown }).detail;
    // 409 con code=confirmation_required → serve conferma (con piano preview).
    if (
      res.status === 409 &&
      detail &&
      typeof detail === "object" &&
      (detail as { code?: string }).code === "confirmation_required"
    ) {
      const d = detail as { message?: string; preview: WorkItemSwapPreviewResponse };
      throw new SwapConfirmationRequiredError(d.preview, d.message);
    }
    // 409 con blockers (senza code) → blocco reale.
    throw new Error(`[${res.status}] ${parseApiError(e, "Scambio non possibile")}`);
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
