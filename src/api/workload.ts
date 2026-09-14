import { authFetch, API_BASE } from "./auth";
import type { LeftBehindReason, WorkItem, WorkItemScheduleState } from "./workItems";

export type WorkloadAvailabilityStatus =
  | "active"
  | "vacation"
  | "sick"
  | "unavailable"
  | "part_time";

export type WorkloadComputedStatus =
  | "ok"
  | "warning"
  | "overload"
  | "active"
  | "vacation"
  | "sick"
  | "unavailable"
  | "part_time"
  | "empty";

export interface WorkloadProfile {
  id: number;
  company_id: number;
  user_id: number;
  max_capacity_hours_day: number;
  max_capacity_hours_week: number | null;
  availability_status: WorkloadAvailabilityStatus;
  utilization_warn_pct: number;
  utilization_over_pct: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface WorkloadUserSummary {
  user_id: number;
  username: string;
  full_name: string | null;
  company_id: number;
  from_date: string;
  to_date: string;
  max_capacity_hours_day: number;
  max_capacity_hours_week: number | null;
  capacity_hours_in_range: number;
  occupied_capacity_hours: number;
  assigned_tasks_count: number;
  utilization_percent: number;
  workload_status: WorkloadComputedStatus;
  availability_status: WorkloadAvailabilityStatus;
  tasks?: WorkloadTaskSummary[];
}

export interface WorkloadTaskWorkArea {
  id: number;
  name: string;
  slug: string;
  icon: string | null;
  color: string | null;
}

export interface WorkloadTaskSummary {
  work_item_id: number;
  title: string;
  client_name: string | null;
  work_date: string | null;
  start_time: string | null;
  status: string;
  estimated_hours: number | null;
  affects_daily_load: boolean;
  load_weight_factor: number;
  effective_load_hours: number;
  is_left_behind: boolean;
  left_behind_reason: LeftBehindReason | null;
  left_behind_note: string | null;
  /** "In pubblicazione": approvata/pronta ma non ancora pubblicata (badge). */
  client_approved_at?: string | null;
  /** "Al cliente": consegnata e in attesa (status "review", stage "cliente") → colore ciano come in Lavorazioni. */
  delivered_to_client_at?: string | null;
  schedule_state?: WorkItemScheduleState | null;
  work_areas: WorkloadTaskWorkArea[];
}

export interface WorkloadAreaGroup {
  area_id: number | null;
  area_name: string;
  area_slug: string | null;
  area_icon: string | null;
  area_color: string | null;
  users: WorkloadUserSummary[];
  total_users: number;
  total_occupied_capacity_hours: number;
  total_assigned_tasks_count: number;
}

export interface UnassignedWorkloadDayCell {
  date: string;
  estimated_hours: number;
  tasks_count: number;
}

export interface UnassignedWorkloadBlock {
  total_tasks_count: number;
  total_estimated_hours: number;
  tasks: WorkloadTaskSummary[];
  days: UnassignedWorkloadDayCell[];
}

export interface WorkloadGroupedByAreaResponse {
  from_date: string;
  to_date: string;
  total_users: number;
  groups: WorkloadAreaGroup[];
  unassigned_tasks: UnassignedWorkloadBlock;
  unassigned_area_tasks: UnassignedWorkloadBlock;
  undistributed_tasks: UnassignedWorkloadBlock;
}

export interface WorkloadUserDayCell {
  date: string;
  occupied_capacity_hours: number;
  assigned_tasks_count: number;
  utilization_percent: number;
  workload_status: WorkloadComputedStatus;
  tasks: WorkloadTaskSummary[];
}

export interface WorkloadRole {
  id: number;
  name: string;
  slug: string;
  icon: string | null;
  color: string | null;
}

export interface WorkloadCalendarDay {
  date: string;
  is_selected: boolean;
  tasks_count: number;
  schedule_windows_count: number;
}

export type WorkloadTimelineKind = "task" | "break" | "holiday" | "day_off" | "remote";

export interface WorkloadTimelineArea {
  id: number;
  name: string;
  slug?: string;
  icon?: string;
  color?: string;
}

export interface WorkloadTimelineItem {
  kind: WorkloadTimelineKind;
  /** Giorno (YYYY-MM-DD) cui appartiene l'item nelle risposte range/settimana. */
  date?: string | null;
  source_id: number | null;
  title: string;
  start_time: string | null;
  end_time: string | null;
  is_all_day: boolean;
  color: string | null;
  emoji: string | null;
  description: string | null;
  work_item_id?: number | null;
  client_name?: string | null;
  status?: string | null;
  estimated_hours?: number | null;
  affects_daily_load?: boolean;
  load_weight_factor?: number;
  effective_load_hours?: number;
  is_left_behind?: boolean;
  left_behind_reason?: LeftBehindReason | null;
  left_behind_note?: string | null;
  schedule_state?: WorkItemScheduleState | null;
  work_areas?: WorkloadTimelineArea[];
  task?: WorkItem | null;
  /** Traccia sbiadita sul giorno d'assegnazione originale di una task spostata a oggi. */
  is_ghost?: boolean;
  /** Task in revisione: grafica dedicata (peso per-utente già in schedule_state). */
  is_review?: boolean;
  /** Giorno collegato: sull'item reale = giorno d'origine ("↪ dal …"); sul ghost = dov'è ora. */
  origin_date?: string | null;
}

export interface WorkloadCalendarOverCapacityTask {
  work_item_id: number;
  title: string;
  client_name: string | null;
  start_time: string | null;
  end_time: string | null;
  estimated_hours: number | null;
  effective_load_hours: number;
  overflow_hours: number;
  status: string | null;
  work_areas: WorkloadTimelineArea[];
  task: WorkItem | null;
}

export interface WorkloadCalendarOverCapacity {
  capacity_hours: number;
  planned_hours: number;
  overload_hours: number;
  overflow_tasks_effective_hours: number;
  total_tasks_count: number;
  tasks: WorkloadCalendarOverCapacityTask[];
}

export type WorkloadCalendarConflictType = "overlap" | "over_capacity" | "behind_task" | "severe_delay";
export type WorkloadCalendarConflictSeverity = "info" | "warning" | "danger";

export interface WorkloadCalendarConflict {
  conflict_type: WorkloadCalendarConflictType;
  severity: WorkloadCalendarConflictSeverity;
  title: string;
  message: string;
  work_item_ids: number[];
  start_time: string | null;
  end_time: string | null;
  overlap_minutes: number | null;
  overload_hours: number | null;
  effective_load_hours: number | null;
  tasks: WorkItem[];
  metadata: Record<string, unknown> | null;
}

export interface WorkloadUserCalendarDayResponse {
  range_mode: "day" | "week" | "month" | "custom";
  from_date: string;
  to_date: string;
  selected_date: string;
  user_id: number;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  roles: WorkloadRole[];
  company_id: number | null;
  days: WorkloadCalendarDay[];
  timeline: WorkloadTimelineItem[];
  over_capacity: WorkloadCalendarOverCapacity | null;
  conflicts: WorkloadCalendarConflict[];
}

export interface WorkloadUserByDay {
  user_id: number;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  company_id: number;
  availability_status: WorkloadAvailabilityStatus;
  max_capacity_hours_day: number;
  max_capacity_hours_week: number | null;
  roles: WorkloadRole[];
  days: WorkloadUserDayCell[];
}

export interface WorkloadAreaByDayGroup {
  area_id: number | null;
  area_name: string;
  area_slug: string | null;
  area_icon: string | null;
  area_color: string | null;
  users: WorkloadUserByDay[];
}

export interface WorkloadGroupedByAreaAndDayResponse {
  from_date: string;
  to_date: string;
  days: string[];
  groups: WorkloadAreaByDayGroup[];
  unassigned_tasks: UnassignedWorkloadBlock;
  unassigned_area_tasks: UnassignedWorkloadBlock;
  undistributed_tasks: UnassignedWorkloadBlock;
}

export interface ListWorkloadProfilesParams {
  company_id?: number;
  user_id?: number;
}

export interface ListWorkloadUsersParams {
  range_mode?: "day" | "week" | "month" | "custom";
  anchor_date?: string;
  week_offset?: number;
  from_date?: string;
  to_date?: string;
  company_id?: number;
  user_id?: number;
  q?: string;
  sort_by?: "name" | "load" | "utilization" | "tasks";
  sort_dir?: "asc" | "desc";
  include_tasks?: boolean;
  include_task_details?: boolean;
}

export interface GetWorkloadUserCalendarDayParams {
  range_mode?: "day" | "week" | "month" | "custom";
  selected_date?: string;
  anchor_date?: string;
  from_date?: string;
  to_date?: string;
  week_offset?: number;
  company_id?: number;
  include_completed?: boolean;
}

export type ListWorkloadGroupedParams = ListWorkloadUsersParams;

export interface CreateWorkloadProfilePayload {
  company_id: number;
  user_id: number;
  max_capacity_hours_day: number;
  max_capacity_hours_week?: number | null;
  availability_status?: WorkloadAvailabilityStatus;
  utilization_warn_pct?: number;
  utilization_over_pct?: number;
  is_active?: boolean;
}

export type UpdateWorkloadProfilePayload = Partial<
  Omit<CreateWorkloadProfilePayload, "company_id" | "user_id">
>;

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
      .filter((message): message is string => !!message);

    if (messages.length > 0) return messages.join("; ");
  }

  const message = (body as { message?: unknown }).message;
  if (typeof message === "string" && message.trim()) return message;

  const error = (body as { error?: unknown }).error;
  if (typeof error === "string" && error.trim()) return error;

  return fallback;
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value == null || value === "") return;
    query.set(key, String(value));
  });
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

export async function listWorkloadProfilesApi(
  params: ListWorkloadProfilesParams = {}
): Promise<WorkloadProfile[]> {
  const qs = buildQuery({ company_id: params.company_id, user_id: params.user_id });
  const res = await authFetch(`${API_BASE}/api/v1/workload/profiles${qs}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Impossibile recuperare i profili workload")}`);
  }
  return res.json();
}

export async function createWorkloadProfileApi(
  payload: CreateWorkloadProfilePayload
): Promise<WorkloadProfile> {
  const res = await authFetch(`${API_BASE}/api/v1/workload/profiles`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Errore nella creazione del profilo workload")}`);
  }
  return res.json();
}

export async function updateWorkloadProfileApi(
  profileId: number,
  payload: UpdateWorkloadProfilePayload
): Promise<WorkloadProfile> {
  const res = await authFetch(`${API_BASE}/api/v1/workload/profiles/${profileId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Errore nell'aggiornamento del profilo workload")}`);
  }
  return res.json();
}

export async function deleteWorkloadProfileApi(profileId: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/api/v1/workload/profiles/${profileId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Errore nell'eliminazione del profilo workload")}`);
  }
}

export async function listWorkloadUsersApi(
  params: ListWorkloadUsersParams
): Promise<WorkloadUserSummary[]> {
  const qs = buildQuery({
    range_mode: params.range_mode,
    anchor_date: params.anchor_date,
    week_offset: params.week_offset,
    from_date: params.from_date,
    to_date: params.to_date,
    company_id: params.company_id,
    user_id: params.user_id,
    q: params.q,
    sort_by: params.sort_by,
    sort_dir: params.sort_dir,
    include_tasks: params.include_tasks == null ? undefined : Number(params.include_tasks),
  });

  const res = await authFetch(`${API_BASE}/api/v1/workload/users${qs}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Impossibile recuperare il riepilogo workload utenti")}`);
  }
  return res.json();
}

export async function listWorkloadUsersGroupedByAreaApi(
  params: ListWorkloadGroupedParams
): Promise<WorkloadGroupedByAreaResponse> {
  const qs = buildQuery({
    range_mode: params.range_mode,
    anchor_date: params.anchor_date,
    week_offset: params.week_offset,
    from_date: params.from_date,
    to_date: params.to_date,
    company_id: params.company_id,
    user_id: params.user_id,
    q: params.q,
    sort_by: params.sort_by,
    sort_dir: params.sort_dir,
    include_tasks: params.include_tasks == null ? undefined : Number(params.include_tasks),
  });

  const res = await authFetch(`${API_BASE}/api/v1/workload/users/grouped-by-area${qs}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Impossibile recuperare il workload per area")}`);
  }
  return res.json();
}

export async function listWorkloadUsersGroupedByAreaAndDayApi(
  params: ListWorkloadGroupedParams
): Promise<WorkloadGroupedByAreaAndDayResponse> {
  const qs = buildQuery({
    range_mode: params.range_mode,
    anchor_date: params.anchor_date,
    week_offset: params.week_offset,
    from_date: params.from_date,
    to_date: params.to_date,
    company_id: params.company_id,
    user_id: params.user_id,
    q: params.q,
    sort_by: params.sort_by,
    sort_dir: params.sort_dir,
    include_tasks: params.include_tasks == null ? undefined : Number(params.include_tasks),
    include_task_details: params.include_task_details == null ? undefined : Number(params.include_task_details),
  });

  const res = await authFetch(`${API_BASE}/api/v1/workload/users/grouped-by-area-and-day${qs}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Impossibile recuperare la heatmap workload")}`);
  }
  return res.json();
}

export async function getWorkloadUserCalendarDayApi(
  userId: number,
  params: GetWorkloadUserCalendarDayParams
): Promise<WorkloadUserCalendarDayResponse> {
  const qs = buildQuery({
    range_mode: params.range_mode,
    selected_date: params.selected_date,
    anchor_date: params.anchor_date,
    from_date: params.from_date,
    to_date: params.to_date,
    week_offset: params.week_offset,
    company_id: params.company_id,
    include_completed: params.include_completed == null ? undefined : Number(params.include_completed),
  });

  const res = await authFetch(`${API_BASE}/api/v1/workload/users/${userId}/calendar-day${qs}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Impossibile recuperare il calendario giornaliero operatore")}`);
  }
  return res.json();
}

/* Daily Tasks API Types & Functions */

export interface WorkloadDailyTaskDetail extends WorkloadTaskSummary {
  is_completed: boolean;
  progress_percent: number;
  is_priority: boolean;
  actual_hours_spent: number;
  /** Numero di rimandi da revisione (1 → giallo, 2+ → rosso nelle card). */
  rework_count?: number;
}

export interface WorkloadDailyKPI {
  tasks_total: number;
  tasks_completed: number;
  tasks_pending: number;
  completion_rate_percent: number;
  load_percent: number;
  estimated_hours_total: number;
  effective_load_hours_total?: number;
  actual_hours_total: number;
}

export interface WorkloadDayRecap {
  date: string;
  // Liste complete (ogni item è un WorkloadDailyTaskDetail)
  in_progress: WorkloadDailyTaskDetail[];
  todo: WorkloadDailyTaskDetail[];
  done: WorkloadDailyTaskDetail[];
  overdue: WorkloadDailyTaskDetail[];
  // Conteggi
  in_progress_count: number;
  todo_count: number;
  done_count: number;
  overdue_count: number;
  today_total: number;
  open_total: number;
  // Ore (effective_load_hours, ore-peso)
  estimated_hours_today: number;
  actual_hours_today: number;
  overdue_hours: number;
  capacity_hours: number;
}

export interface WorkloadDailySelfResponse extends WorkloadDailyKPI {
  date: string;
  user_id: number;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  company_id: number;
  next_task: WorkloadDailyTaskDetail | null;
  tasks: WorkloadDailyTaskDetail[];
  /** Recap giornaliero (può mancare se il backend non è ancora aggiornato). */
  recap?: WorkloadDayRecap;
}

export interface WorkloadDailyAdminAccordionUserRow extends WorkloadDailyKPI {
  user_id: number;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  tasks: WorkloadDailyTaskDetail[];
}

export interface WorkloadDailyAdminAccordionResponse {
  date: string;
  company_id: number | null;
  total_users: number;
  total_tasks_all: number;
  total_tasks_completed: number;
  avg_completion_rate_percent: number;
  avg_load_percent: number;
  users: WorkloadDailyAdminAccordionUserRow[];
}

export interface GetDailyTasksParams {
  target_date?: string;
  company_id?: number;
  q?: string;
}

export async function getDailyTasksSelfApi(
  params: GetDailyTasksParams = {}
): Promise<WorkloadDailySelfResponse> {
  const qs = buildQuery({
    target_date: params.target_date,
    company_id: params.company_id,
  });

  const res = await authFetch(`${API_BASE}/api/v1/workload/day/me${qs}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Impossibile recuperare le attività del giorno")}`);
  }
  return res.json();
}

export async function getDailyTasksAdminAccordionApi(
  params: GetDailyTasksParams = {}
): Promise<WorkloadDailyAdminAccordionResponse> {
  const qs = buildQuery({
    target_date: params.target_date,
    company_id: params.company_id,
    q: params.q,
  });

  const res = await authFetch(`${API_BASE}/api/v1/workload/day/admin-accordion${qs}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Impossibile recuperare le attività del team")}`);
  }
  return res.json();
}

// ── Overdue tasks (arretrati a livello azienda, incluse le non derogabili) ────

export type WorkItemDelayCode = "non_deferrable_overdue" | "carried_over" | null;

export interface OverdueTaskItem {
  work_item_id: number;
  title: string;
  client_id: number | null;
  client_name: string | null;
  work_date: string | null;
  deadline_date: string | null;
  is_deadline_locked: boolean;
  days_overdue: number;
  days_behind_work_date: number | null;
  estimated_hours: number | null;
  effective_load_hours: number;
  delay_code: WorkItemDelayCode;
  is_overdue: boolean;
  is_severe_delay: boolean;
  status: string | null;
  assignee_ids: number[];
  work_areas: WorkloadTaskWorkArea[];
  task: WorkItem | null;
}

export interface ListOverdueTasksResponse {
  company_id: number;
  from_date: string;
  to_date: string;
  window_days: number;
  filter_user_id: number | null;
  filter_work_area_id: number | null;
  filter_client_id: number | null;
  total_tasks_count: number;
  non_deferrable_count: number;
  deferrable_count: number;
  total_effective_load_hours: number;
  tasks: OverdueTaskItem[];
}

export interface ListOverdueTasksParams {
  company_id?: number;
  days?: number;
  user_id?: number;
  work_area_id?: number;
  client_id?: number;
}

export async function listOverdueTasksApi(
  params: ListOverdueTasksParams = {}
): Promise<ListOverdueTasksResponse> {
  const qs = buildQuery({
    company_id: params.company_id,
    days: params.days,
    user_id: params.user_id,
    work_area_id: params.work_area_id,
    client_id: params.client_id,
  });
  const res = await authFetch(`${API_BASE}/api/v1/workload/overdue-tasks${qs}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      `[${res.status}] ${parseApiError(body, "Impossibile recuperare le attività in ritardo")}`
    );
  }
  return res.json();
}

// ── Overbooking check (alternativi liberi della stessa area dopo creazione task) ─

export interface OverbookingOperatorOption {
  user_id: number;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  availability_status: string;
  capacity_hours: number;
  occupied_hours: number;
  remaining_hours: number;
  projected_hours: number;
  fits: boolean;
  shared_work_area_ids: number[];
}

export interface OverbookingCheckResponse {
  work_item_id: number;
  company_id: number;
  work_date: string | null;
  task_effective_hours: number;
  work_area_ids: number[];
  target_user_id: number;
  target_capacity_hours: number;
  target_occupied_hours: number;
  target_overflow_hours: number;
  is_overbooking: boolean;
  suggested_user_id: number | null;
  alternatives: OverbookingOperatorOption[];
}

export interface CheckOverbookingParams {
  company_id?: number;
  user_id?: number;
}

export async function checkWorkItemOverbookingApi(
  workItemId: number,
  params: CheckOverbookingParams = {}
): Promise<OverbookingCheckResponse> {
  const qs = buildQuery({ company_id: params.company_id, user_id: params.user_id });
  const res = await authFetch(
    `${API_BASE}/api/v1/workload/work-items/${workItemId}/overbooking-check${qs}`
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      `[${res.status}] ${parseApiError(body, "Impossibile verificare l'overbooking")}`
    );
  }
  return res.json();
}

// ── "Da pianificare" a livello azienda, raggruppato per operatore ─────────────────
export interface WorkloadToPlanReassignTask {
  work_item_id: number;
  title: string;
  client_name: string | null;
  start_time: string | null;
  end_time: string | null;
  estimated_hours: number | null;
  effective_load_hours: number;
  overflow_hours: number;
  status: string | null;
  work_areas: WorkloadTaskWorkArea[];
}

export interface WorkloadToPlanUnscheduledTask {
  work_item_id: number;
  title: string;
  client_name: string | null;
  estimated_hours: number | null;
  effective_load_hours: number;
  start_time: string | null;
  is_all_day: boolean;
  status: string | null;
  work_areas: WorkloadTaskWorkArea[];
}

export interface WorkloadToPlanOperator {
  user_id: number;
  full_name: string | null;
  username: string;
  avatar_url: string | null;
  roles: WorkloadRole[];
  reassign: WorkloadToPlanReassignTask[];
  unscheduled: WorkloadToPlanUnscheduledTask[];
  review: WorkloadToPlanUnscheduledTask[];
  reassign_count: number;
  unscheduled_count: number;
  review_count: number;
}

export interface WorkloadToPlanResponse {
  from_date: string;
  to_date: string;
  operators: WorkloadToPlanOperator[];
  totals: { reassign: number; unscheduled: number; review?: number };
}

export interface GetWorkloadToPlanParams {
  company_id: number;
  range_mode?: "day" | "week" | "month" | "custom";
  anchor_date?: string;
  week_offset?: number;
  from_date?: string;
  to_date?: string;
  q?: string;
}

export async function getWorkloadToPlanApi(params: GetWorkloadToPlanParams): Promise<WorkloadToPlanResponse> {
  const qs = buildQuery({
    company_id: params.company_id,
    range_mode: params.range_mode,
    anchor_date: params.anchor_date,
    week_offset: params.week_offset,
    from_date: params.from_date,
    to_date: params.to_date,
    q: params.q,
  });
  const res = await authFetch(`${API_BASE}/api/v1/workload/to-plan${qs}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Impossibile recuperare le task da pianificare")}`);
  }
  return res.json();
}
