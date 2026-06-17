import { authFetch, API_BASE } from "./auth";
import type { LeftBehindReason } from "./workItems";

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
  work_areas?: WorkloadTimelineArea[];
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

export interface WorkloadDailySelfResponse extends WorkloadDailyKPI {
  date: string;
  user_id: number;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  company_id: number;
  next_task: WorkloadDailyTaskDetail | null;
  tasks: WorkloadDailyTaskDetail[];
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

// ── Workload Engine Types ────────────────────────────────────────────────────

export interface WorkloadEngineRunRequest {
  company_id: number;
  task_ids?: number[] | null;
  planning_start_date?: string | null;
  planning_end_date?: string | null;
}

export interface WorkloadEngineAllocationDetail {
  allocation_date: string;
  planned_hours: number;
  overload_hours: number;
}

export interface WorkloadEngineTaskAllocation {
  task_id: number;
  title: string;
  start_date: string;
  end_date: string;
  estimated_hours: number;
  effective_hours: number;
  is_fractionable: boolean;
  conflict_code: string | null;
  overload_hours: number;
  allocations: WorkloadEngineAllocationDetail[];
}

export interface WorkloadEngineRunResponse {
  run_id: string;
  company_id: number;
  strategy: string;
  strategy_version: string | null;
  daily_capacity_hours: number;
  total_tasks: number;
  allocated_tasks: number;
  unallocated_tasks: number;
  total_effective_hours: number;
  total_overload_hours: number;
  applied: boolean;
  tasks: WorkloadEngineTaskAllocation[];
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

// ── Workload Engine ─────────────────────────────────────────────────────────

export async function previewWorkloadEngineRunApi(
  payload: WorkloadEngineRunRequest
): Promise<WorkloadEngineRunResponse> {
  const res = await authFetch(`${API_BASE}/api/v1/workload/engine/preview`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      `[${res.status}] ${parseApiError(body, "Errore nella preview workload engine")}`
    );
  }
  return res.json();
}

export async function applyWorkloadEngineRunApi(
  payload: WorkloadEngineRunRequest
): Promise<WorkloadEngineRunResponse> {
  const res = await authFetch(`${API_BASE}/api/v1/workload/engine/apply`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      `[${res.status}] ${parseApiError(body, "Errore nell'apply workload engine")}`
    );
  }
  return res.json();
}

// ── Allocation Grid ──────────────────────────────────────────────────────────

export type WorkloadAllocationStatus = "ok" | "at_limit" | "overload";
export type WorkloadDayStatus = "ok" | "warning" | "overload" | "empty";

export interface WorkloadAllocationTask {
  work_item_id: number;
  title: string;
  client_name: string | null;
  deadline_date: string | null;
  is_fractionable: boolean;
  planned_hours: number;
  overload_hours: number;
  conflict_code: string | null;
  allocation_status: WorkloadAllocationStatus;
}

export interface WorkloadAllocationDay {
  date: string;
  daily_capacity_hours: number;
  total_planned_hours: number;
  total_overload_hours: number;
  utilization_percent: number;
  day_status: WorkloadDayStatus;
  allocations: WorkloadAllocationTask[];
}

export interface WorkloadAllocationOperator {
  user_id: number;
  username: string;
  full_name: string | null;
  total_planned_hours: number;
  total_overload_hours: number;
  utilization_percent: number;
  days: WorkloadAllocationDay[];
}

export interface WorkloadAllocationWorkArea {
  area_id: number;
  area_name: string;
  area_slug: string | null;
  area_icon: string | null;
  area_color: string | null;
  total_planned_hours: number;
  total_overload_hours: number;
  utilization_percent: number;
  days: WorkloadAllocationDay[];
}

export interface WorkloadAllocationGrid {
  from_date: string;
  to_date: string;
  daily_capacity_hours: number;
  strategy: string;
  last_run_id: string | null;
  total_tasks: number;
  total_overload_hours: number;
  days: WorkloadAllocationDay[];
  operators: WorkloadAllocationOperator[];
  work_areas: WorkloadAllocationWorkArea[];
}

export interface GetWorkloadAllocationGridParams {
  company_id: number;
  from_date: string;
  to_date: string;
  run_id?: string | null;
}

export async function getWorkloadAllocationGridApi(
  params: GetWorkloadAllocationGridParams
): Promise<WorkloadAllocationGrid> {
  const qs = buildQuery({
    company_id: params.company_id,
    from_date: params.from_date,
    to_date: params.to_date,
    ...(params.run_id ? { run_id: params.run_id } : {}),
  });
  const res = await authFetch(`${API_BASE}/api/v1/workload/allocation-grid${qs}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      `[${res.status}] ${parseApiError(body, "Impossibile recuperare la griglia allocazioni")}`
    );
  }
  return res.json();
}
