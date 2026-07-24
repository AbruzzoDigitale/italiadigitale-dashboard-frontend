import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { getUsersApi, updateMeApi, type User } from "../api/users";
import { listRolesApi, type Role } from "../api/roles";
import {
  getWorkItemApi,
  isSwapConfirmationRequiredError,
  isWorkItemOverlapApiError,
  moveWorkItemApi,
  rescheduleNextAvailableWorkItemApi,
  swapWorkItemsApi,
  updateWorkItemApi,
  type WorkItemSwapPreviewResponse,
  type WorkItemSwapEffectivePosition,
  type MoveWorkItemPayload,
  type WorkItem,
  type WorkItemOverlapConflict,
  type WorkItemSuggestedSlot,
  type WorkItemScheduleState,
} from "../api/workItems";
import { getCompanyApi } from "../api/companies";
import { WorkItemFormModal } from "../components/work-items/WorkItemFormModal";
import { TaskConflictModal } from "../components/work-items/TaskConflictModal";
import { WorkloadTeamModal } from "../components/workload/WorkloadTeamModal";
import { MultiOperatorCalendar, type MultiOperatorMeta } from "../components/workload/MultiOperatorCalendar";
import { WorkloadCalendar, type WorkloadCalendarDensity, type WorkloadCalendarHandle } from "../components/workload/WorkloadCalendar";
import { WorkloadDateNav } from "../components/workload/WorkloadDateNav";
import { WorkloadTray, type WorkloadTrayLayout, type WorkloadTrayTab, type WorkloadTrayGroup, type WorkloadTrayItem } from "../components/workload/WorkloadTray";
import { WorkloadMonthGrid } from "../components/workload/WorkloadMonthGrid";
import { SwapConfirmModal } from "../components/workload/SwapConfirmModal";
import {
  getWorkloadUserCalendarDayApi,
  getWorkloadToPlanApi,
  listWorkloadUsersApi,
  listWorkloadUsersGroupedByAreaAndDayApi,
  type WorkloadToPlanResponse,
  type WorkloadComputedStatus,
  type WorkloadGroupedByAreaAndDayResponse,
  type WorkloadTaskSummary,
  type WorkloadTimelineItem,
  type WorkloadCalendarConflict,
  type WorkloadUserByDay,
  type WorkloadUserCalendarDayResponse,
  type WorkloadUserSummary,
} from "../api/workload";
import { Button } from "../components/ui/Button";
import { SegmentedSwitch } from "../components/ui/SegmentedSwitch";
import { Icon, type IconName } from "../components/ui/Icon";
import { Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { MultiSelect } from "../components/ui/MultiSelect";
import { Spinner } from "../components/ui/Spinner";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../hooks/useAuth";
import { useOverdueTasks } from "../hooks/useOverdueTasks";
import { useSelectedCompanyId } from "../hooks/useSelectedCompanyId";
import "./workload-page.css";

type RangeMode = "day" | "week" | "month" | "custom";
type ViewMode = "accordion" | "complete" | "heatmap" | "calendar";

// ── Persistenza stato calendario nella URL (sopravvive al refresh) ──
const RANGE_MODES: RangeMode[] = ["day", "week", "month", "custom"];
const VIEW_MODES: ViewMode[] = ["accordion", "complete", "heatmap", "calendar"];
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseRangeParam(value: string | null, fallback: RangeMode): RangeMode {
  return RANGE_MODES.includes(value as RangeMode) ? (value as RangeMode) : fallback;
}
function parseViewParam(value: string | null, fallback: ViewMode): ViewMode {
  return VIEW_MODES.includes(value as ViewMode) ? (value as ViewMode) : fallback;
}
function parseIsoDateParam(value: string | null, fallback: string): string {
  return value && ISO_DATE_RE.test(value) ? value : fallback;
}
function parseIntParam(value: string | null, fallback: number): number {
  const n = Number(value);
  return value != null && Number.isInteger(n) ? n : fallback;
}
function parseOpsParam(value: string | null): number[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => Number(part))
    .filter((n) => Number.isInteger(n) && n > 0);
}
type CalendarCreatePreview = { startMinutes: number; endMinutes: number; isDragging: boolean };
type CalendarResizeState = {
  workItemId: number;
  startMinutes: number;
  originalEndMinutes: number;
  currentEndMinutes: number;
  minEndMinutes: number;
  maxEndMinutes: number;
  startClientY: number;
};

const RANGE_MODE_OPTIONS: Array<{ value: Exclude<RangeMode, "custom">; label: string }> = [
  { value: "day", label: "Giorno" },
  { value: "week", label: "Settimana" },
  { value: "month", label: "Mese" },
];

const VIEW_MODE_OPTIONS: Array<{ value: ViewMode; label: string; icon: IconName }> = [
  { value: "accordion", label: "Accordion", icon: "list" },
  { value: "complete", label: "Vista completa", icon: "document-text" },
  { value: "heatmap", label: "Heatmap", icon: "activity" },
  { value: "calendar", label: "Calendario", icon: "annotation" },
];

const CALENDAR_SLOT_MINUTES = 30;
const CALENDAR_CREATE_SLOT_MINUTES = 15;
const CALENDAR_HOUR_HEIGHT_PX = 64;
const CALENDAR_INITIAL_SCROLL_OFFSET_PX = 16;

function dateFromIso(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function isoFromDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTodayDate(): string {
  return isoFromDate(new Date());
}

function shiftIsoByDays(iso: string, days: number): string {
  const date = dateFromIso(iso);
  date.setDate(date.getDate() + days);
  return isoFromDate(date);
}

function shiftIsoByMonths(iso: string, months: number): string {
  const date = dateFromIso(iso);
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  const targetMonth = date.getMonth();
  const originalDay = dateFromIso(iso).getDate();
  date.setDate(originalDay);
  if (date.getMonth() !== targetMonth) {
    date.setDate(0);
  }
  return isoFromDate(date);
}

function startOfIsoWeek(iso: string): string {
  const date = dateFromIso(iso);
  const day = date.getDay();
  const delta = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + delta);
  return isoFromDate(date);
}

function getVisibleDays(rangeMode: RangeMode, anchorDate: string, weekOffset: number): string[] {
  if (rangeMode === "custom") return [anchorDate];
  if (rangeMode === "day") return [anchorDate];

  if (rangeMode === "week") {
    const shiftedAnchor = shiftIsoByDays(anchorDate, weekOffset * 7);
    const weekStart = startOfIsoWeek(shiftedAnchor);
    return Array.from({ length: 7 }, (_, index) => shiftIsoByDays(weekStart, index));
  }

  const date = dateFromIso(anchorDate);
  const year = date.getFullYear();
  const month = date.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, index) => isoFromDate(new Date(year, month, index + 1)));
}

function formatDayChip(iso: string): { weekday: string; day: string; month: string } {
  const date = dateFromIso(iso);
  return {
    weekday: date.toLocaleDateString("it-IT", { weekday: "short" }).replace(".", ""),
    day: String(date.getDate()).padStart(2, "0"),
    month: date.toLocaleDateString("it-IT", { month: "short" }).replace(".", ""),
  };
}

// Intestazione giorno nelle lane dell'accordion (es. "mercoledì 24 giugno"); il CSS la rende maiuscola.
function formatAccDayLabel(iso: string): string {
  return dateFromIso(iso).toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "long" });
}

/** Raggruppa una lista di giorni (ISO) in settimane (lun→dom), per la vista "mese" della vista completa. */
function groupDaysIntoWeeks(days: string[]): { key: string; days: string[]; label: string }[] {
  const groups: { key: string; days: string[] }[] = [];
  for (const day of days) {
    const date = dateFromIso(day);
    const dow = (date.getDay() + 6) % 7; // 0 = lunedì
    const monday = shiftIsoByDays(day, -dow);
    const last = groups[groups.length - 1];
    if (last && last.key === monday) last.days.push(day);
    else groups.push({ key: monday, days: [day] });
  }
  return groups.map((g) => {
    const first = dateFromIso(g.days[0]);
    const lastD = dateFromIso(g.days[g.days.length - 1]);
    const month = lastD.toLocaleDateString("it-IT", { month: "short" }).replace(".", "");
    return { key: g.key, days: g.days, label: `${first.getDate()}–${lastD.getDate()} ${month}` };
  });
}

function formatRangeLabel(fromIso: string, toIso: string): string {
  const from = dateFromIso(fromIso);
  const to = dateFromIso(toIso);
  const sameMonth = from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear();
  if (sameMonth) {
    return `${from.getDate()} - ${to.getDate()} ${to.toLocaleDateString("it-IT", { month: "short", year: "numeric" })}`;
  }
  return `${from.toLocaleDateString("it-IT", { day: "2-digit", month: "short" })} - ${to.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })}`;
}

function formatHours(value: number) {
  const totalMinutes = Math.round((value || 0) * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

type TaskHoursFields = Pick<
  WorkloadTaskSummary,
  "affects_daily_load" | "effective_load_hours" | "estimated_hours" | "schedule_state"
>;

// Stesso ordine di risoluzione del calendario (resolveTimelineEffectiveHours): lo
// schedule_state ha la precedenza, perché porta già il peso delle arretrate (×0,5) e
// della revisione (0 all'operatore, 0,25 al revisore).
function taskEffectiveHours(task: TaskHoursFields): number {
  if (typeof task.schedule_state?.effective_load_hours === "number") return task.schedule_state.effective_load_hours;
  if (!task.affects_daily_load) return 0;
  if (typeof task.effective_load_hours === "number") return task.effective_load_hours;
  return task.estimated_hours ?? 0;
}

function taskHoursLabel(task: TaskHoursFields): string {
  const effective = taskEffectiveHours(task);
  if (task.estimated_hours == null) return `${formatHours(effective)} eff`;
  return `${formatHours(effective)} eff · ${formatHours(task.estimated_hours)} st`;
}

function statusLabel(status: WorkloadComputedStatus) {
  switch (status) {
    case "overload":
      return "Overload";
    case "warning":
      return "Warning";
    case "ok":
      return "OK";
    case "active":
      return "Attivo";
    case "vacation":
      return "Ferie";
    case "sick":
      return "Malattia";
    case "unavailable":
      return "Non disp.";
    case "part_time":
      return "Part-time";
    case "empty":
      return "Vuoto";
    default:
      return status;
  }
}

// Badge stato lane accordion in stile prototipo (.acc-badge): pill senza bordo, tinta piena.
function accBadgeClass(status: WorkloadComputedStatus): string {
  const base = "inline-flex items-center h-[26px] px-3 rounded-pill text-[11px] font-bold uppercase tracking-[0.04em] whitespace-nowrap";
  if (status === "overload") return `${base} bg-[#ef3a65] text-white`;
  if (status === "warning") return `${base} bg-[#f5b800]/20 text-[#b07d00] dark:text-[#f5c64a]`;
  return `${base} bg-[#16eb96]/20 text-[#0c8a57] dark:text-[#3fe9a0]`;
}

function getTaskDay(task: WorkloadTaskSummary): string {
  // Stesso criterio del calendario: la task vive nel suo giorno EFFETTIVO. Le arretrate
  // e le trascinate compaiono nel giorno di recupero (oggi), non in quello originale.
  return (task.schedule_state?.effective_work_date ?? task.work_date ?? "").slice(0, 10);
}

function getTaskStartMinutes(task: WorkloadTaskSummary): number {
  return hhmmToMinutes(task.start_time) ?? Number.POSITIVE_INFINITY;
}

function sortTasksByStartTime(tasks: WorkloadTaskSummary[]): WorkloadTaskSummary[] {
  return [...tasks].sort((left, right) => {
    const diff = getTaskStartMinutes(left) - getTaskStartMinutes(right);
    if (diff !== 0) return diff;
    return left.work_item_id - right.work_item_id;
  });
}

// Stati task: etichetta in italiano + colore. Stessa palette della board Lavorazioni,
// così lo stesso stato ha lo stesso colore in tutta l'app.
const TASK_STATUS_META: Record<string, { label: string; color: string }> = {
  in_progress: { label: "In corso", color: "#378ADD" },
  planned: { label: "Da fare", color: "#888780" },
  review: { label: "In revisione", color: "#EF9F27" },
  completed: { label: "Completata", color: "#639922" },
  done: { label: "Completata", color: "#639922" },
  blocked: { label: "Bloccata", color: "#E24B4A" },
  cancelled: { label: "Annullata", color: "#8c8d87" },
};

function taskStatusMeta(status: string): { label: string; color: string } {
  return TASK_STATUS_META[status] ?? { label: status, color: "#8c8d87" };
}

// Ordine di default nelle lane: prima le in corso, poi le da fare, infine le in revisione.
const TASK_STATUS_ORDER = ["in_progress", "planned", "review"];

function taskStatusRank(status: string): number {
  const index = TASK_STATUS_ORDER.indexOf(status);
  return index === -1 ? TASK_STATUS_ORDER.length : index;
}

function sortTasksByStatusThenTime(tasks: WorkloadTaskSummary[]): WorkloadTaskSummary[] {
  return [...tasks].sort((left, right) => {
    const byStatus = taskStatusRank(left.status) - taskStatusRank(right.status);
    if (byStatus !== 0) return byStatus;
    const byTime = getTaskStartMinutes(left) - getTaskStartMinutes(right);
    if (byTime !== 0) return byTime;
    return left.work_item_id - right.work_item_id;
  });
}

function formatTaskStartTime(value: string | null): string | null {
  if (!value) return null;
  const minutes = hhmmToMinutes(value);
  if (minutes == null) return null;
  return minutesToHHMM(minutes);
}

function hhmmToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const [h, m] = value.split(":").slice(0, 2).map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function minutesToHHMM(totalMinutes: number): string {
  const safe = Math.max(0, Math.min((24 * 60) - 1, totalMinutes));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function resolveTimelineTask(item: WorkloadTimelineItem) {
  return (item as { task?: (WorkItem & { client?: { commercial_name?: string | null; name?: string | null } | null }) | null }).task ?? null;
}

function resolveTimelineScheduleState(item: WorkloadTimelineItem): WorkItemScheduleState | null {
  return resolveTimelineTask(item)?.schedule_state ?? item.schedule_state ?? null;
}

function resolveTimelineEffectiveHours(item: WorkloadTimelineItem) {
  const state = resolveTimelineScheduleState(item);
  if (typeof state?.effective_load_hours === "number") return state.effective_load_hours;
  if (item.affects_daily_load === false) return 0;
  return item.effective_load_hours ?? item.estimated_hours ?? 0;
}

function calendarConflictClass(conflict: WorkloadCalendarConflict) {
  if (conflict.severity === "danger") return "border-danger/35 bg-danger/10 text-danger";
  if (conflict.severity === "warning") return "border-warning/35 bg-warning/10 text-warning";
  return "border-info/30 bg-info/10 text-info";
}

function calendarConflictIcon(conflict: WorkloadCalendarConflict) {
  if (conflict.severity === "danger") return "alert-triangle" as const;
  if (conflict.severity === "warning") return "alert-triangle" as const;
  return "info" as const;
}

function extractCalendarOperators(groups: WorkloadGroupedByAreaAndDayResponse | null): WorkloadUserByDay[] {
  if (!groups) return [];
  const map = new Map<number, WorkloadUserByDay>();
  groups.groups.forEach((group) => {
    group.users.forEach((operator) => {
      if (!map.has(operator.user_id)) {
        map.set(operator.user_id, operator);
      }
    });
  });
  return [...map.values()];
}

export function WorkloadPage() {
  const toast = useToast();
  const { user, permissions, refreshSession } = useAuth();
  const { selectedCompanyId } = useSelectedCompanyId(user?.company_id ?? null);
  const toastRef = useRef(toast);

  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  // Stato calendario persistito nella URL: ripristinato al primo render (sopravvive al refresh).
  const [searchParams, setSearchParams] = useSearchParams();

  const [rangeMode, setRangeMode] = useState<RangeMode>(() => parseRangeParam(searchParams.get("range"), "week"));
  const [calendarDensity, setCalendarDensity] = useState<WorkloadCalendarDensity>("comfortable");
  // Mostra/nascondi le task in revisione sul calendario.
  const [showReviewTasks, setShowReviewTasks] = useState(true);
  // Legenda collassabile: di default chiusa per dare più spazio al calendario.
  const [legendOpen, setLegendOpen] = useState(false);
  // Tray "Da pianificare" condivisa da tutte le view: layout (sidebar/dock) + stato pannello dock + tab.
  const [trayLayout, setTrayLayout] = useState<WorkloadTrayLayout>("sidebar");
  const [trayDockOpen, setTrayDockOpen] = useState(false);
  const [trayTab, setTrayTab] = useState<WorkloadTrayTab>("reassign");
  const [trayOnlyMine, setTrayOnlyMine] = useState(false);
  // Admin/PM: mostra nella tray le task di TUTTI gli operatori, ignorando la
  // selezione operatori del calendario (vale per ogni scheda).
  const [trayAllOperators, setTrayAllOperators] = useState(false);
  // Handle al calendario: la tray (a livello pagina) avvia il drag pointer-based del calendario.
  const calendarRef = useRef<WorkloadCalendarHandle>(null);
  const [anchorDate, setAnchorDate] = useState(() => parseIsoDateParam(searchParams.get("anchor"), getTodayDate()));
  const [weekOffset, setWeekOffset] = useState(() => parseIntParam(searchParams.get("woff"), 0));
  const [customFromDate, setCustomFromDate] = useState(getTodayDate());
  const [customToDate, setCustomToDate] = useState(getTodayDate());

  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "load" | "utilization" | "tasks">("load");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [viewMode, setViewMode] = useState<ViewMode>(() => parseViewParam(searchParams.get("view"), "accordion"));
  const [selectedDay, setSelectedDay] = useState(() => parseIsoDateParam(searchParams.get("day"), getTodayDate()));

  const [summary, setSummary] = useState<WorkloadUserSummary[]>([]);
  const [heatmap, setHeatmap] = useState<WorkloadGroupedByAreaAndDayResponse | null>(null);
  const [companyUsers, setCompanyUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [expandedUsers, setExpandedUsers] = useState<Record<number, boolean>>({});

  const [teamModalOpen, setTeamModalOpen] = useState(false);

  const [newWorkModalOpen, setNewWorkModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<WorkItem | null>(null);
  const [quickAdd, setQuickAdd] = useState<{ day: string; userId: number; startTime?: string; estimatedHours?: number } | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<number | null>(null);
  const [dragSourceAssigneeId, setDragSourceAssigneeId] = useState<number | null | undefined>(undefined);
  // Traccia la task in fase di spostamento (per evitare drag concorrenti); il feedback visivo
  // ora è un toast unificato (non più un riquadro dedicato).
  const [, setMovingTaskId] = useState<number | null>(null);
  const [activeDropTarget, setActiveDropTarget] = useState<string | null>(null);
  const [hotDropTarget, setHotDropTarget] = useState<string | null>(null);
  const moveInFlightRef = useRef(false);
  const completeScrollRef = useRef<HTMLDivElement | null>(null);
  const dropHoverRef = useRef<{ key: string | null; sinceMs: number }>({ key: null, sinceMs: 0 });
  const calendarScrollRef = useRef<HTMLDivElement | null>(null);
  const calendarInitialScrollKeyRef = useRef<string | null>(null);
  const [unassignedOpen, setUnassignedOpen] = useState(false);
  // Operatori selezionati nel calendario: 1 → vista singola (com'era), >1 → colonne affiancate.
  const [calendarOperatorIds, setCalendarOperatorIds] = useState<number[]>(() => parseOpsParam(searchParams.get("ops")));
  // Operatori ripristinati da URL ancora da validare contro la lista caricata (heatmap async).
  const initialUrlOps = parseOpsParam(searchParams.get("ops"));
  const pendingUrlOpsRef = useRef<number[] | null>(initialUrlOps.length > 0 ? initialUrlOps : null);
  const calendarOperatorId = calendarOperatorIds[0] ?? null; // operatore primario (vista singola)
  // Bump per forzare il refetch del calendario multi-operatore dopo modifiche esterne (es. nuova task).
  const [multiReloadToken, setMultiReloadToken] = useState(0);
  const [calendarData, setCalendarData] = useState<WorkloadUserCalendarDayResponse | null>(null);
  // Dati tray "Da pianificare" per le view non-calendario (operatore selezionato/preferito).
  const [toPlanData, setToPlanData] = useState<WorkloadToPlanResponse | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [, setCalendarDropPreviewMinutes] = useState<number | null>(null);
  const [, setCalendarCreatePreview] = useState<CalendarCreatePreview | null>(null);
  const [, setCalendarResizeState] = useState<CalendarResizeState | null>(null);
  const [, setCalendarTaskUiState] = useState<Record<number, "saving" | "exiting">>({});
  const [calendarConflictModal, setCalendarConflictModal] = useState<{
    message: string;
    conflicts: WorkItemOverlapConflict[];
    suggestedSlots: WorkItemSuggestedSlot[];
    /** Data richiesta in origine: distingue gli slot "stesso giorno" dai rimandi. */
    requestedDate: string | null;
    /** Riprogramma la task allo slot scelto (varia in base all'operazione: creazione o spostamento). */
    onPickSlot?: (slot: WorkItemSuggestedSlot) => void;
  } | null>(null);
  const [conflictRetrySlot, setConflictRetrySlot] = useState<string | null>(null);
  const [calendarConflictsModalOpen, setCalendarConflictsModalOpen] = useState(false);
  const [conflictsModalTab, setConflictsModalTab] = useState<"conflitti" | "arretrate">("conflitti");
  const [reschedulingTaskId, setReschedulingTaskId] = useState<number | null>(null);
  const calendarRequestSeqRef = useRef(0);
  const calendarCreateDragStartRef = useRef<number | null>(null);
  // ── Swap preview state (residuo del drag-and-drop swap, mantenuto per il reset al drag-end) ──
  const [, setSwapPreview] = useState<{ targetIds: number[]; canSwap: boolean | null } | null>(null);
  const swapPreviewSeqRef = useRef(0);
  const swapHoverKeyRef = useRef<string | null>(null);
  // Spring-open: trascinando una task sopra un box-giorno della strip, dopo una breve attesa
  // il calendario apre quel giorno così la si può rilasciare in uno slot orario (stile AD4).
  const daySpringTimerRef = useRef<number | null>(null);
  const daySpringDayRef = useRef<string | null>(null);
  const [companyOpeningTime, setCompanyOpeningTime] = useState<string | null>(null);
  const [companyClosingTime, setCompanyClosingTime] = useState<string | null>(null);
  // Minuti dall'inizio del giorno per la linea "ora corrente"; aggiornato ogni minuto.
  const [nowMinutes, setNowMinutes] = useState(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  });

  // ── Arretrati (overdue tasks) per l'operatore selezionato in calendario ──────
  const {
    data: overdueData,
    isLoading: overdueLoading,
    error: overdueError,
  } = useOverdueTasks(
    {
      company_id: selectedCompanyId ?? undefined,
      user_id: calendarOperatorId ?? undefined,
      days: 7,
    },
    { enabled: calendarConflictsModalOpen && !!selectedCompanyId && !!calendarOperatorId }
  );

  const canManageProfiles = !!permissions?.is_admin;
  // Vista ristretta (solo calendario, solo se stessi) per i soli operatori.
  // Admin e Project Manager vedono/gestiscono tutti gli operatori e tutte le viste.
  const isOperatorView = permissions != null && !permissions.is_admin && !permissions.is_project_manager;
  // Per l'operatore la sidebar tiene in primo piano Scadute e In revisione: all'apertura
  // apriamo direttamente "Scadute" (una sola volta, senza sovrascrivere scelte successive).
  const operatorTabDefaulted = useRef(false);
  useEffect(() => {
    if (isOperatorView && !operatorTabDefaulted.current) {
      operatorTabDefaulted.current = true;
      setTrayTab("overdue");
    }
  }, [isOperatorView]);
  // Tutte le view sono a tutta altezza: la pagina non scrolla (header/toolbar fissi),
  // scrolla solo la sezione contenuto sotto. Niente sottotitolo né barra giorni.
  const isFillView = true;

  const visibleDays = useMemo(() => getVisibleDays(rangeMode, anchorDate, weekOffset), [anchorDate, rangeMode, weekOffset]);
  const calendarOperators = useMemo(() => extractCalendarOperators(heatmap), [heatmap]);

  // ── Scadute (overdue) per la sidebar: admin/PM vedono tutti gli operatori, l'operatore
  //    solo le proprie. Caricate a livello pagina (non gated al modal), raggruppate per operatore.
  const { data: sidebarOverdueData } = useOverdueTasks(
    {
      company_id: selectedCompanyId ?? undefined,
      user_id: isOperatorView && user?.id != null ? user.id : undefined,
      days: 60,
    },
    { enabled: !!selectedCompanyId }
  );

  // Lookup nome/avatar operatore (per gli operatori presenti solo tra le scadute).
  const operatorMeta = useMemo(() => {
    const meta = new Map<number, { name: string; avatarUrl: string | null }>();
    calendarOperators.forEach((op) => meta.set(op.user_id, { name: op.full_name || op.username, avatarUrl: op.avatar_url }));
    (toPlanData?.operators ?? []).forEach((op) => {
      if (!meta.has(op.user_id)) meta.set(op.user_id, { name: op.full_name || op.username, avatarUrl: op.avatar_url });
    });
    return meta;
  }, [calendarOperators, toPlanData]);

  // Scadute raggruppate per operatore (una task con più assegnatari compare per ciascuno).
  const overdueByUser = useMemo(() => {
    const map = new Map<number, WorkloadTrayItem[]>();
    const onlySelf = isOperatorView && user?.id != null ? user.id : null;
    (sidebarOverdueData?.tasks ?? []).forEach((t) => {
      const item: WorkloadTrayItem = {
        id: t.work_item_id,
        client: t.client_name || "Senza cliente",
        type: t.title,
        durationMinutes: Math.max(15, Math.round((t.effective_load_hours || 0.5) * 60)),
        areaColor: t.work_areas?.find((a) => a.color)?.color ?? null,
        isOverdue: true,
        daysOverdue: t.days_overdue,
        nonDeferrable: t.delay_code === "non_deferrable_overdue",
      };
      const assignees = t.assignee_ids?.length ? t.assignee_ids : [];
      assignees.forEach((uid) => {
        if (onlySelf != null && uid !== onlySelf) return;
        const arr = map.get(uid) ?? [];
        arr.push(item);
        map.set(uid, arr);
      });
    });
    return map;
  }, [sidebarOverdueData, isOperatorView, user?.id]);

  // Tray "Da pianificare" a livello azienda, raggruppata per operatore (admin/PM vedono tutti;
  // l'operatore vede solo se stesso). I bucket: "reassign" (oltre capacità), "unscheduled" (senza
  // orario) e "overdue" (oltre la scadenza).
  const trayGroups = useMemo<WorkloadTrayGroup[]>(() => {
    const toItem = (t: {
      work_item_id: number;
      client_name: string | null;
      title: string;
      effective_load_hours: number;
      work_areas: { color: string | null }[];
      overflow_hours?: number;
    }): WorkloadTrayItem => ({
      id: t.work_item_id,
      client: t.client_name || "Senza cliente",
      type: t.title,
      durationMinutes: Math.max(15, Math.round((t.effective_load_hours || 0.5) * 60)),
      areaColor: t.work_areas?.find((a) => a.color)?.color ?? null,
      overflowHours: t.overflow_hours,
    });
    const byUser = new Map<number, WorkloadTrayGroup>();
    (toPlanData?.operators ?? []).forEach((op) => {
      byUser.set(op.user_id, {
        userId: op.user_id,
        name: op.full_name || op.username,
        avatarUrl: op.avatar_url,
        reassign: op.reassign.map(toItem),
        unscheduled: op.unscheduled.map(toItem),
        overdue: overdueByUser.get(op.user_id) ?? [],
        review: op.review.map((t) => ({ ...toItem(t), isReview: true })),
      });
    });
    // Operatori presenti SOLO tra le scadute (nessuna task da pianificare).
    overdueByUser.forEach((items, uid) => {
      if (byUser.has(uid)) return;
      const meta = operatorMeta.get(uid);
      byUser.set(uid, {
        userId: uid,
        name: meta?.name ?? `Operatore #${uid}`,
        avatarUrl: meta?.avatarUrl ?? null,
        reassign: [],
        unscheduled: [],
        overdue: items,
        review: [],
      });
    });
    return [...byUser.values()];
  }, [toPlanData, overdueByUser, operatorMeta]);
  // Scheda "Da assegnare": task senza alcun operatore (dalla heatmap), lista piatta.
  const trayUnassignedItems = useMemo<WorkloadTrayItem[]>(
    () =>
      (heatmap?.unassigned_tasks.tasks ?? []).map((t) => ({
        id: t.work_item_id,
        client: t.client_name || "Senza cliente",
        type: t.title,
        durationMinutes: Math.max(15, Math.round((t.effective_load_hours || 0.5) * 60)),
        areaColor: t.work_areas?.find((a) => a.color)?.color ?? null,
      })),
    [heatmap],
  );
  // Filtri della tray: se sono selezionati uno o più operatori in calendario, la tray
  // (Scadute / Senza orario / Da riprogrammare) mostra solo i loro gruppi. Il toggle
  // "Solo le mie" restringe ulteriormente ai soli gruppi dell'utente loggato.
  const displayTrayGroups = useMemo(() => {
    let groups = trayGroups;
    // Con "tutti gli operatori" attivo (admin/PM) si ignora la selezione del calendario.
    if (!trayAllOperators && calendarOperatorIds.length > 0) {
      const selected = new Set(calendarOperatorIds);
      groups = groups.filter((g) => selected.has(g.userId));
    }
    if (trayOnlyMine && user?.id != null) {
      groups = groups.filter((g) => g.userId === user.id);
    }
    return groups;
  }, [trayGroups, calendarOperatorIds, trayOnlyMine, trayAllOperators, user?.id]);

  useEffect(() => {
    if (!selectedCompanyId) {
      setToPlanData(null);
      return;
    }
    let cancelled = false;
    getWorkloadToPlanApi({
      company_id: selectedCompanyId,
      range_mode: rangeMode,
      anchor_date: anchorDate,
      from_date: rangeMode === "custom" ? customFromDate : undefined,
      to_date: rangeMode === "custom" ? customToDate : undefined,
      week_offset: rangeMode === "week" ? weekOffset : undefined,
      q: searchQuery || undefined,
    })
      .then((data) => { if (!cancelled) setToPlanData(data); })
      .catch(() => { if (!cancelled) setToPlanData(null); });
    return () => { cancelled = true; };
  }, [selectedCompanyId, rangeMode, anchorDate, customFromDate, customToDate, weekOffset, searchQuery, multiReloadToken]);
  // Aree di lavoro presenti (per la legenda): dedup dai gruppi della heatmap.
  const legendAreas = useMemo(() => {
    const map = new Map<number, { id: number; name: string; color: string }>();
    for (const group of heatmap?.groups ?? []) {
      if (group.area_id == null || !group.area_color) continue;
      if (!map.has(group.area_id)) {
        map.set(group.area_id, { id: group.area_id, name: group.area_name, color: group.area_color });
      }
    }
    return Array.from(map.values());
  }, [heatmap]);
  const summaryByUserId = useMemo(() => new Map(summary.map((item) => [item.user_id, item])), [summary]);
  // Statistiche per-giorno (ore, n. task, arretrate) dell'operatore del calendario, ricavate dalla
  // heatmap raggruppata già caricata: ogni task porta schedule_state.delay_code → "arretrata".
  const calendarDayStats = useMemo(() => {
    const map = new Map<string, { hours: number; tasks: number; overdue: number; dots: string[] }>();
    if (!heatmap || calendarOperatorId == null) return map;
    const seenByDate = new Map<string, Set<number>>();
    for (const group of heatmap.groups) {
      for (const operator of group.users) {
        if (operator.user_id !== calendarOperatorId) continue;
        for (const cell of operator.days) {
          let entry = map.get(cell.date);
          if (!entry) {
            entry = { hours: 0, tasks: 0, overdue: 0, dots: [] };
            map.set(cell.date, entry);
          }
          let seen = seenByDate.get(cell.date);
          if (!seen) {
            seen = new Set<number>();
            seenByDate.set(cell.date, seen);
          }
          for (const task of cell.tasks ?? []) {
            if (seen.has(task.work_item_id)) continue;
            seen.add(task.work_item_id);
            entry.tasks += 1;
            entry.hours += task.effective_load_hours ?? 0;
            if (task.schedule_state?.delay_code) entry.overdue += 1;
            const areaColor = task.work_areas?.find((a) => a.color)?.color;
            if (areaColor && entry.dots.length < 6) entry.dots.push(areaColor);
          }
        }
      }
    }
    return map;
  }, [heatmap, calendarOperatorId]);
  const calendarBounds = useMemo(() => {
    const openingMinutes = hhmmToMinutes(companyOpeningTime);
    const closingMinutes = hhmmToMinutes(companyClosingTime);
    // Mostra sempre l'intera giornata (00:00–24:00); l'orario azienda resta
    // evidenziato dalle fasce di apertura/chiusura.
    const dayStartMinutes = 0;
    const dayEndMinutes = 24 * 60;
    const totalMinutes = Math.max(60, dayEndMinutes - dayStartMinutes);
    const hourSlots = Math.ceil(totalMinutes / 60);
    const halfSlots = Math.ceil(totalMinutes / CALENDAR_SLOT_MINUTES);
    return {
      dayStartMinutes,
      dayEndMinutes,
      totalMinutes,
      hourSlots,
      halfSlots,
      openingMinutes,
      closingMinutes,
    };
  }, [companyClosingTime, companyOpeningTime]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Aggiorna la posizione della linea "ora corrente" ogni minuto.
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setNowMinutes(now.getHours() * 60 + now.getMinutes());
    };
    const timer = setInterval(tick, 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (visibleDays.length === 0) return;
    if (!visibleDays.includes(selectedDay)) {
      setSelectedDay(visibleDays[0]);
    }
  }, [visibleDays, selectedDay]);

  useEffect(() => {
    if (rangeMode !== "week") {
      setWeekOffset(0);
    }
  }, [rangeMode]);

  // L'operatore può vedere solo il calendario: forza la vista e blocca gli altri tab.
  useEffect(() => {
    if (isOperatorView && viewMode !== "calendar") {
      setViewMode("calendar");
    }
  }, [isOperatorView, viewMode]);

  useEffect(() => {
    if (viewMode !== "calendar") return;
    if (!calendarData?.selected_date) return;
    setSelectedDay((current) => (current === calendarData.selected_date ? current : calendarData.selected_date));
  }, [calendarData?.selected_date, viewMode]);

  useEffect(() => {
    if (viewMode !== "calendar") return;

    // Operatore: vista bloccata su se stesso, indipendentemente dagli operatori in heatmap.
    if (isOperatorView) {
      pendingUrlOpsRef.current = null;
      if (user?.id != null && (calendarOperatorIds.length !== 1 || calendarOperatorIds[0] !== user.id)) {
        setCalendarOperatorIds([user.id]);
      }
      return;
    }

    if (calendarOperators.length === 0) {
      // Non azzerare l'operatore ripristinato da URL finché la lista non è caricata.
      if (pendingUrlOpsRef.current) return;
      if (calendarOperatorIds.length > 0) setCalendarOperatorIds([]);
      setCalendarData(null);
      return;
    }

    // Lista operatori disponibile: la validazione qui sotto sostituisce il ripristino da URL.
    pendingUrlOpsRef.current = null;

    // Mantieni solo gli operatori ancora presenti; se nessuno valido, parti da quello preferito.
    const valid = calendarOperatorIds.filter((id) => calendarOperators.some((op) => op.user_id === id));
    if (valid.length === 0) {
      const preferred = user?.id != null
        ? calendarOperators.find((op) => op.user_id === user.id)
        : null;
      setCalendarOperatorIds([(preferred ?? calendarOperators[0]).user_id]);
    } else if (valid.length !== calendarOperatorIds.length) {
      setCalendarOperatorIds(valid);
    }
  }, [calendarOperatorIds, calendarOperators, isOperatorView, user?.id, viewMode]);

  // Riflette lo stato del calendario nella URL così da ripristinarlo dopo un refresh.
  useEffect(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("view", viewMode);
      next.set("range", rangeMode);
      next.set("day", selectedDay);
      next.set("anchor", anchorDate);
      if (rangeMode === "week" && weekOffset !== 0) next.set("woff", String(weekOffset));
      else next.delete("woff");
      if (calendarOperatorIds.length > 0) next.set("ops", calendarOperatorIds.join(","));
      else next.delete("ops");
      return next;
    }, { replace: true });
  }, [viewMode, rangeMode, selectedDay, anchorDate, weekOffset, calendarOperatorIds, setSearchParams]);

  const reloadCalendar = useCallback(async () => {
    if (viewMode !== "calendar") return;
    if (!selectedCompanyId || !calendarOperatorId) return;

    const requestSeq = ++calendarRequestSeqRef.current;
    setCalendarLoading(true);
    setCalendarError(null);

    try {
      const data = await getWorkloadUserCalendarDayApi(calendarOperatorId, {
        range_mode: rangeMode,
        selected_date: selectedDay,
        anchor_date: anchorDate,
        from_date: rangeMode === "custom" ? customFromDate : undefined,
        to_date: rangeMode === "custom" ? customToDate : undefined,
        week_offset: rangeMode === "week" ? weekOffset : undefined,
        company_id: selectedCompanyId,
        // Backend support can expose completed tasks in timeline without UI changes.
        include_completed: true,
      });

      if (requestSeq !== calendarRequestSeqRef.current) return;
      setCalendarData(data);
    } catch (err) {
      if (requestSeq !== calendarRequestSeqRef.current) return;
      const message = err instanceof Error ? err.message : "Errore caricamento calendario operatore";
      setCalendarData(null);
      setCalendarError(message);
    } finally {
      if (requestSeq !== calendarRequestSeqRef.current) return;
      setCalendarLoading(false);
    }
  }, [anchorDate, calendarOperatorId, customFromDate, customToDate, rangeMode, selectedCompanyId, selectedDay, viewMode, weekOffset]);

  const patchCalendarTaskLocally = useCallback((taskId: number, payload: MoveWorkItemPayload) => {
    if (viewMode !== "calendar") return;

    setCalendarData((current) => {
      if (!current) return current;

      const startTime = payload.start_time ?? null;
      const nextTimeline = current.timeline.map((item) => {
        if (item.kind !== "task" || item.work_item_id !== taskId) return item;

        if (startTime == null) {
          return {
            ...item,
            is_all_day: true,
            start_time: null,
            end_time: null,
          };
        }

        const startMinutes = hhmmToMinutes(startTime) ?? 0;
        const weightedHours = resolveTimelineEffectiveHours(item);
        const estimatedMinutes = Math.max(CALENDAR_SLOT_MINUTES, Math.round(weightedHours * 60));
        const endMinutes = Math.min((24 * 60) - 1, startMinutes + estimatedMinutes);

        return {
          ...item,
          is_all_day: false,
          start_time: minutesToHHMM(startMinutes),
          end_time: minutesToHHMM(endMinutes),
        };
      });

      return {
        ...current,
        timeline: nextTimeline,
      };
    });
  }, [viewMode]);

  useEffect(() => {
    if (viewMode !== "calendar") return;
    if (!selectedCompanyId || !calendarOperatorId) {
      calendarRequestSeqRef.current += 1;
      setCalendarData(null);
      setCalendarError(null);
      return;
    }

    void reloadCalendar();
  }, [
    anchorDate,
    calendarOperatorId,
    customFromDate,
    customToDate,
    rangeMode,
    selectedCompanyId,
    selectedDay,
    viewMode,
    weekOffset,
    reloadCalendar,
  ]);

  useEffect(() => {
    if (viewMode !== "calendar") return;
    if (!calendarData) return;
    const container = calendarScrollRef.current;
    if (!container) return;

    const dayKey = `${calendarData.user_id}-${calendarData.selected_date}`;
    if (calendarInitialScrollKeyRef.current === dayKey) return;

    const now = new Date();
    const totalMinutes = now.getHours() * 60 + now.getMinutes();
    const roundedDownMinutes = Math.floor(totalMinutes / CALENDAR_SLOT_MINUTES) * CALENDAR_SLOT_MINUTES;
    const boundedMinutes = Math.max(
      calendarBounds.dayStartMinutes,
      Math.min(calendarBounds.dayEndMinutes - CALENDAR_SLOT_MINUTES, roundedDownMinutes)
    );
    const targetTop = ((boundedMinutes - calendarBounds.dayStartMinutes) / 60) * CALENDAR_HOUR_HEIGHT_PX;
    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);

    container.scrollTop = Math.max(0, Math.min(maxScrollTop, targetTop - CALENDAR_INITIAL_SCROLL_OFFSET_PX));
    calendarInitialScrollKeyRef.current = dayKey;
  }, [calendarBounds.dayEndMinutes, calendarBounds.dayStartMinutes, calendarData, viewMode]);

  const loadMain = useCallback(async (options?: { silent?: boolean }) => {
    const silent = !!options?.silent;
    if (!selectedCompanyId) {
      setSummary([]);
      setHeatmap(null);
      if (!silent) setLoading(false);
      return;
    }

    if (!silent) setLoading(true);
    setError(null);

    const baseParams = {
      company_id: selectedCompanyId,
      q: searchQuery || undefined,
      sort_by: sortBy,
      sort_dir: sortDir,
      range_mode: rangeMode,
      anchor_date: rangeMode === "custom" ? undefined : anchorDate,
      week_offset: rangeMode === "week" ? weekOffset : undefined,
      from_date: rangeMode === "custom" ? customFromDate : undefined,
      to_date: rangeMode === "custom" ? customToDate : undefined,
    } as const;

    try {
      const [summaryData, heatmapData] = await Promise.all([
        listWorkloadUsersApi({
          ...baseParams,
          include_tasks: viewMode === "accordion",
        }),
        viewMode === "complete" || viewMode === "heatmap" || viewMode === "calendar" || viewMode === "accordion"
          ? listWorkloadUsersGroupedByAreaAndDayApi({
            ...baseParams,
            include_tasks: false,
            include_task_details: true,
          })
          : Promise.resolve(null),
      ]);

      setSummary(summaryData);
      setHeatmap(heatmapData);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Errore nel caricamento workload";
      setError(message);
      toastRef.current.error(message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [
    anchorDate,
    customFromDate,
    customToDate,
    rangeMode,
    searchQuery,
    selectedCompanyId,
    sortBy,
    sortDir,
    viewMode,
    weekOffset,
  ]);

  const loadProfiles = useCallback(async () => {
    if (!selectedCompanyId) {
      setCompanyUsers([]);
      setRoles([]);
      return;
    }

    try {
      const [usersData, rolesData] = await Promise.all([
        getUsersApi(selectedCompanyId),
        listRolesApi({ company_id: selectedCompanyId }),
      ]);
      setCompanyUsers(usersData);
      setRoles(rolesData);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Errore nel caricamento profili";
      toastRef.current.error(message);
    }
  }, [selectedCompanyId]);

  useEffect(() => {
    loadMain();
  }, [loadMain]);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  useEffect(() => {
    if (!selectedCompanyId) {
      setCompanyOpeningTime(null);
      setCompanyClosingTime(null);
      return;
    }

    getCompanyApi(selectedCompanyId)
      .then((company) => {
        setCompanyOpeningTime(company.opening_time ?? null);
        setCompanyClosingTime(company.closing_time ?? null);
      })
      .catch(() => {
        setCompanyOpeningTime(null);
        setCompanyClosingTime(null);
      });
  }, [selectedCompanyId]);

  const currentRangeLabel = useMemo(() => {
    if (rangeMode === "custom") {
      return formatRangeLabel(customFromDate, customToDate);
    }
    if (viewMode === "calendar" && calendarData) {
      return formatRangeLabel(calendarData.from_date, calendarData.to_date);
    }
    if (summary.length > 0) {
      return formatRangeLabel(summary[0].from_date, summary[0].to_date);
    }
    if (heatmap) {
      return formatRangeLabel(heatmap.from_date, heatmap.to_date);
    }
    if (visibleDays.length === 1) {
      const date = dateFromIso(visibleDays[0]);
      return date.toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });
    }
    return formatRangeLabel(visibleDays[0], visibleDays[visibleDays.length - 1]);
  }, [calendarData, customFromDate, customToDate, heatmap, rangeMode, summary, viewMode, visibleDays]);

  const onShiftPeriod = (direction: -1 | 1) => {
    if (rangeMode === "day") {
      setAnchorDate((current) => shiftIsoByDays(current, direction));
      return;
    }
    if (rangeMode === "week") {
      setWeekOffset((current) => current + direction);
      return;
    }
    if (rangeMode === "month") {
      setAnchorDate((current) => shiftIsoByMonths(current, direction));
      return;
    }
    const delta = direction * 7;
    setCustomFromDate((current) => shiftIsoByDays(current, delta));
    setCustomToDate((current) => shiftIsoByDays(current, delta));
  };

  const onToggleSortByLoad = () => {
    setSortBy("load");
    setSortDir((current) => (current === "desc" ? "asc" : "desc"));
  };

  const onGoToday = () => {
    const today = getTodayDate();
    setAnchorDate(today);
    setSelectedDay(today);
    setWeekOffset(0);
    if (rangeMode === "custom") {
      setCustomFromDate(today);
      setCustomToDate(today);
    }
  };

  const openNewWorkModal = () => {
    if (!selectedCompanyId) {
      toast.error("Seleziona una company");
      return;
    }
    setEditingItem(null);
    setNewWorkModalOpen(true);
  };

  const openEditWorkItemModal = async (workItemId: number) => {
    if (!selectedCompanyId) {
      toast.error("Seleziona una company");
      return;
    }
    try {
      toast.info("Apertura lavorazione…");
      const item = await getWorkItemApi(workItemId);
      setQuickAdd(null);
      setEditingItem(item);
      setNewWorkModalOpen(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Impossibile aprire la lavorazione";
      toast.error(message);
    }
  };

  const toggleCalendarTaskCompleted = useCallback(async (item: WorkloadTimelineItem) => {
    if (item.kind !== "task" || !item.work_item_id) return;

    const workItemId = item.work_item_id;
    const isDone = item.status === "completed" || item.status === "done";
    const nextStatus = isDone ? "planned" : "completed";

    setCalendarTaskUiState((current) => ({ ...current, [workItemId]: "saving" }));

    try {
      await updateWorkItemApi(workItemId, {
        status: nextStatus,
        is_completed: !isDone,
      });

      if (!isDone) {
        setCalendarTaskUiState((current) => ({ ...current, [workItemId]: "exiting" }));
        // Backend calendar currently filters completed tasks: animate out then remove locally with a single timeline mutation.
        window.setTimeout(() => {
          setCalendarData((current) => {
            if (!current) return current;
            return {
              ...current,
              timeline: current.timeline.filter((timelineItem) => !(timelineItem.kind === "task" && timelineItem.work_item_id === workItemId)),
            };
          });
          setCalendarTaskUiState((current) => {
            const next = { ...current };
            delete next[workItemId];
            return next;
          });
        }, 320);
      } else {
        setCalendarData((current) => {
          if (!current) return current;
          return {
            ...current,
            timeline: current.timeline.map((timelineItem) => {
              if (timelineItem.kind !== "task" || timelineItem.work_item_id !== workItemId) return timelineItem;
              return { ...timelineItem, status: nextStatus };
            }),
          };
        });
        setCalendarTaskUiState((current) => {
          const next = { ...current };
          delete next[workItemId];
          return next;
        });
      }

      toast.success(isDone ? "Task riaperta" : "Task completata");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Impossibile aggiornare la task";
      toast.error(message);
      setCalendarTaskUiState((current) => {
        const next = { ...current };
        delete next[workItemId];
        return next;
      });
    }
  }, [toast]);

  const handleOverlapApiError = useCallback((
    err: unknown,
    fallbackMessage: string,
    options?: { requestedDate?: string | null; onPickSlot?: (slot: WorkItemSuggestedSlot) => void },
  ) => {
    if (isWorkItemOverlapApiError(err)) {
      setConflictRetrySlot(null);
      setCalendarConflictModal({
        message: err.backendMessage,
        conflicts: err.conflicts,
        suggestedSlots: err.suggestedSlots,
        requestedDate: options?.requestedDate ?? null,
        onPickSlot: options?.onPickSlot,
      });
      toast.error(err.backendMessage);
      return true;
    }
    toast.error(err instanceof Error ? err.message : fallbackMessage);
    return false;
  }, [toast]);

  // Riprogramma (sposta) la task allo slot scelto dal modal conflitti. Se anche il
  // nuovo slot risulta occupato (409), riapre il modal con gli slot aggiornati.
  const retryMoveToSlotRef = useRef<((taskId: number, payload: MoveWorkItemPayload) => void) | null>(null);
  const retryMoveToSlot = useCallback(async (taskId: number, payload: MoveWorkItemPayload) => {
    const slotKey = `${payload.work_date ?? ""}T${payload.start_time ?? ""}`;
    setConflictRetrySlot(slotKey);
    try {
      await moveWorkItemApi(taskId, payload);
      await loadMain({ silent: true });
      await reloadCalendar();
      setMultiReloadToken((t) => t + 1);
      setCalendarConflictModal(null);
      toast.success("Task riprogrammata allo slot scelto");
    } catch (err) {
      handleOverlapApiError(err, "Impossibile riprogrammare la task", {
        requestedDate: payload.work_date ?? null,
        onPickSlot: (slot) =>
          retryMoveToSlotRef.current?.(taskId, { ...payload, work_date: slot.date, start_time: slot.start_time }),
      });
    } finally {
      setConflictRetrySlot(null);
    }
  }, [loadMain, reloadCalendar, handleOverlapApiError, toast]);
  useEffect(() => { retryMoveToSlotRef.current = retryMoveToSlot; }, [retryMoveToSlot]);

  const rescheduleTaskToNextAvailable = useCallback(async (workItemId: number) => {
    const candidateTask =
      calendarData?.timeline.find((item) => item.kind === "task" && item.work_item_id === workItemId)?.task ??
      calendarData?.over_capacity?.tasks.find((task) => task.work_item_id === workItemId)?.task ??
      calendarData?.conflicts?.flatMap((conflict) => conflict.tasks).find((task) => task.id === workItemId) ??
      null;

    if (!candidateTask?.deadline_date) {
      toast.error("Serve una scadenza per riprogrammare automaticamente la task");
      return;
    }

    setReschedulingTaskId(workItemId);
    try {
      await rescheduleNextAvailableWorkItemApi(workItemId, {
        from_date: calendarData?.selected_date ?? selectedDay,
        slot_minutes: CALENDAR_CREATE_SLOT_MINUTES,
      });
      await loadMain({ silent: true });
      await reloadCalendar();
      toast.success("Task riprogrammata al primo slot libero");
    } catch (err) {
      handleOverlapApiError(err, "Impossibile riprogrammare la task", {
        requestedDate: calendarData?.selected_date ?? selectedDay,
        onPickSlot: (slot) =>
          retryMoveToSlotRef.current?.(workItemId, { work_date: slot.date, start_time: slot.start_time }),
      });
    } finally {
      setReschedulingTaskId(null);
    }
  }, [calendarData, handleOverlapApiError, loadMain, reloadCalendar, selectedDay, toast]);

  // Adapter per il calendario settimanale (WorkloadCalendar): sposta una task in un
  // giorno+slot espliciti (diverso da moveCalendarTaskToSlot che usa il giorno selezionato).
  const moveCalendarTaskToDaySlot = useCallback(async (taskId: number, day: string, startTime: string) => {
    if (moveInFlightRef.current) return;
    const payload: MoveWorkItemPayload = {
      assignee_id: calendarOperatorId ?? undefined,
      work_date: day,
      start_time: startTime,
    };
    try {
      moveInFlightRef.current = true;
      setMovingTaskId(taskId);
      await moveWorkItemApi(taskId, payload);
      await loadMain({ silent: true });
      await reloadCalendar();
      setMultiReloadToken((t) => t + 1);
      toast.success("Task spostata");
    } catch (err) {
      // Lo spostamento è fallito: ripristina la posizione originale annullando l'anteprima
      // ottimistica (refetch del calendario settimanale via reloadToken) oltre al reload parent.
      await reloadCalendar();
      setMultiReloadToken((t) => t + 1);
      handleOverlapApiError(err, "Impossibile spostare la task", {
        requestedDate: day,
        onPickSlot: (slot) => void retryMoveToSlot(taskId, {
          assignee_id: calendarOperatorId ?? undefined,
          work_date: slot.date,
          start_time: slot.start_time,
        }),
      });
    } finally {
      moveInFlightRef.current = false;
      setMovingTaskId(null);
    }
  }, [calendarOperatorId, loadMain, reloadCalendar, handleOverlapApiError, retryMoveToSlot, toast]);

  // Swap di due task dello stesso operatore (drop di una task su un'altra).
  // Avviso di conferma scambio (mostrato finché l'utente non lo disattiva).
  const [swapConfirm, setSwapConfirm] = useState<
    { sourceId: number; targetId: number; positions?: WorkItemSwapEffectivePosition[]; preview: WorkItemSwapPreviewResponse } | null
  >(null);
  const [swapConfirmSubmitting, setSwapConfirmSubmitting] = useState(false);

  const performSwap = useCallback(async (sourceId: number, targetId: number, confirm: boolean, positions?: WorkItemSwapEffectivePosition[]) => {
    try {
      moveInFlightRef.current = true;
      setMovingTaskId(sourceId);
      const res = await swapWorkItemsApi({ source_work_item_ids: [sourceId], target_work_item_ids: [targetId], confirm, effective_positions: positions });
      if (res?.can_swap) {
        await loadMain({ silent: true });
        await reloadCalendar();
        toast.success("Posizioni scambiate");
      } else {
        toast.error("Scambio non possibile");
      }
      setMultiReloadToken((t) => t + 1);
    } catch (err) {
      // 409 confirmation_required → apri il warning SENZA riconciliare (mantiene l'anteprima).
      if (isSwapConfirmationRequiredError(err)) {
        setSwapConfirm({ sourceId, targetId, positions, preview: err.preview });
        return;
      }
      await reloadCalendar();
      handleOverlapApiError(err, "Scambio non possibile");
      setMultiReloadToken((t) => t + 1);
    } finally {
      moveInFlightRef.current = false;
      setMovingTaskId(null);
    }
  }, [loadMain, reloadCalendar, handleOverlapApiError, toast]);

  const swapCalendarTasks = useCallback(async (sourceId: number, targetId: number, positions?: WorkItemSwapEffectivePosition[]) => {
    if (moveInFlightRef.current || sourceId === targetId) return;
    await performSwap(sourceId, targetId, false, positions);
  }, [performSwap]);

  const confirmSwap = useCallback(async (dontShowAgain: boolean) => {
    if (!swapConfirm) return;
    const { sourceId, targetId, positions } = swapConfirm;
    setSwapConfirmSubmitting(true);
    try {
      if (dontShowAgain) {
        // Disattiva il warning per le prossime volte (self-service).
        try { await updateMeApi({ swap_confirmation_disabled: true }); await refreshSession(); } catch { /* la preferenza non blocca lo swap */ }
      }
      setSwapConfirm(null);
      await performSwap(sourceId, targetId, true, positions);
    } finally {
      setSwapConfirmSubmitting(false);
    }
  }, [swapConfirm, performSwap, refreshSession]);

  const cancelSwap = useCallback(() => {
    setSwapConfirm(null);
    // Ripristina l'anteprima ottimistica allo stato reale del server.
    setMultiReloadToken((t) => t + 1);
  }, []);

  const onTaskDragStart = (event: DragEvent<HTMLElement>, workItemId: number, sourceAssigneeId?: number | null) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(workItemId));
    calendarCreateDragStartRef.current = null;
    setCalendarCreatePreview(null);
    setCalendarResizeState(null);
    setDraggingTaskId(workItemId);
    setDragSourceAssigneeId(sourceAssigneeId);
  };

  const clearDaySpring = () => {
    if (daySpringTimerRef.current != null) {
      window.clearTimeout(daySpringTimerRef.current);
      daySpringTimerRef.current = null;
    }
    daySpringDayRef.current = null;
  };

  const onTaskDragEnd = () => {
    setDraggingTaskId(null);
    setDragSourceAssigneeId(undefined);
    setActiveDropTarget(null);
    setHotDropTarget(null);
    setCalendarDropPreviewMinutes(null);
    calendarCreateDragStartRef.current = null;
    setCalendarCreatePreview(null);
    setCalendarResizeState(null);
    dropHoverRef.current = { key: null, sinceMs: 0 };
    clearSwapPreview();
    clearDaySpring();
  };

  const autoScrollCompleteCalendar = (clientX: number) => {
    if (draggingTaskId == null) return;
    const container = completeScrollRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const edge = 72;
    const maxSpeed = 28;

    if (clientX < rect.left + edge) {
      const ratio = Math.min(1, (rect.left + edge - clientX) / edge);
      container.scrollLeft -= Math.ceil(maxSpeed * ratio);
      return;
    }
    if (clientX > rect.right - edge) {
      const ratio = Math.min(1, (clientX - (rect.right - edge)) / edge);
      container.scrollLeft += Math.ceil(maxSpeed * ratio);
    }
  };

  const onCompleteDropHover = (event: DragEvent<HTMLElement>, targetKey: string) => {
    event.preventDefault();
    autoScrollCompleteCalendar(event.clientX);

    const now = Date.now();
    const previous = dropHoverRef.current;
    if (previous.key !== targetKey) {
      dropHoverRef.current = { key: targetKey, sinceMs: now };
      setActiveDropTarget(targetKey);
      setHotDropTarget(null);
      return;
    }

    setActiveDropTarget(targetKey);
    if (now - previous.sinceMs >= 260) {
      setHotDropTarget(targetKey);
    }
  };

  const resolveDraggedTaskId = (event: DragEvent<HTMLElement>): number | null => {
    const raw = event.dataTransfer.getData("text/plain");
    const parsed = Number(raw);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
    return draggingTaskId;
  };

  const moveTaskByDrop = useCallback(async (event: DragEvent<HTMLElement>, payload: MoveWorkItemPayload, dropTargetKey: string) => {
    event.preventDefault();
    event.stopPropagation();

    if (moveInFlightRef.current) return;

    const taskId = resolveDraggedTaskId(event);
    setActiveDropTarget(null);
    setHotDropTarget(null);
    setCalendarDropPreviewMinutes(null);
    dropHoverRef.current = { key: null, sinceMs: 0 };
    if (!taskId) return;
    const draggedCalendarItem = calendarData?.timeline.find((item) => item.kind === "task" && item.work_item_id === taskId) ?? null;
    const draggedTask = draggedCalendarItem ? resolveTimelineTask(draggedCalendarItem) : null;
    if (
      draggedTask?.is_deadline_locked &&
      payload.work_date &&
      draggedTask.deadline_date &&
      payload.work_date > draggedTask.deadline_date
    ) {
      toast.error("Task non derogabile: non puoi spostarla oltre la scadenza");
      setDraggingTaskId(null);
      setDragSourceAssigneeId(undefined);
      return;
    }
    if (
      payload.assignee_id == null &&
      payload.assignee_ids == null &&
      payload.work_area_id == null &&
      payload.work_area_ids == null &&
      payload.work_date == null &&
      payload.start_time == null
    ) {
      return;
    }

    const previousCalendarData = calendarData;
    try {
      moveInFlightRef.current = true;
      setMovingTaskId(taskId);
      patchCalendarTaskLocally(taskId, payload);
      await moveWorkItemApi(taskId, payload);
      await loadMain({ silent: true });
      await reloadCalendar();
      toast.success("Task spostata");
    } catch (err) {
      setCalendarData(previousCalendarData);
      await reloadCalendar();
      handleOverlapApiError(err, "Impossibile spostare la task", {
        requestedDate: payload.work_date ?? null,
        onPickSlot: (slot) =>
          retryMoveToSlotRef.current?.(taskId, { ...payload, work_date: slot.date, start_time: slot.start_time }),
      });
    } finally {
      moveInFlightRef.current = false;
      setMovingTaskId(null);
      setDraggingTaskId(null);
      setDragSourceAssigneeId(undefined);
      setActiveDropTarget((current) => (current === dropTargetKey ? null : current));
    }
  }, [calendarData, handleOverlapApiError, loadMain, patchCalendarTaskLocally, reloadCalendar, toast]);

  const clearSwapPreview = useCallback(() => {
    swapPreviewSeqRef.current += 1;
    swapHoverKeyRef.current = null;
    setSwapPreview(null);
  }, []);

  const buildAccordionDayMovePayload = (day: string): MoveWorkItemPayload => {
    if (dragSourceAssigneeId === null) {
      return { assignee_ids: [], work_date: day };
    }
    if (typeof dragSourceAssigneeId === "number") {
      return { assignee_id: dragSourceAssigneeId, work_date: day };
    }
    return { work_date: day };
  };

  const renderAccordionView = () => {
    const hasUnassigned = heatmap != null && heatmap.unassigned_tasks.total_tasks_count > 0;
    if (summary.length === 0 && !hasUnassigned) {
      return (
        <div className="rounded-md border border-dashed border-line dark:border-line-dark px-4 py-8 text-sm text-muted dark:text-muted-dark">
          Nessun operatore trovato nel range selezionato.
        </div>
      );
    }

    const barClass = (status: WorkloadComputedStatus) => {
      if (status === "overload") return "wl-acc-bar--overload";
      if (status === "warning") return "wl-acc-bar--warning";
      if (status === "empty") return "wl-acc-bar--empty";
      return "wl-acc-bar--ok";
    };

    const loadClass = (status: WorkloadComputedStatus) => {
      if (status === "overload") return "wl-acc-load--overload";
      if (status === "warning") return "wl-acc-load--warning";
      if (status === "empty") return "wl-acc-load--empty";
      return "wl-acc-load--ok";
    };

    // colore area della task: prima dal colore direttamente sulla work_area, poi dalla heatmap.
    const areaColorById = new Map<number, string>();
    (heatmap?.groups ?? []).forEach((g) => {
      if (g.area_id != null && g.area_color) areaColorById.set(g.area_id, g.area_color);
    });
    const realAreaColor = (task: WorkloadTaskSummary): string | null => {
      const direct = task.work_areas?.find((a) => a.color)?.color;
      if (direct) return direct;
      const aid = task.work_areas?.[0]?.id;
      return (aid != null ? areaColorById.get(aid) : undefined) ?? null;
    };
    // Per la task: colore reale o grigio neutro (così badge orario e barra laterale restano VISIBILI).
    const taskAreaColor = (task: WorkloadTaskSummary): string => realAreaColor(task) ?? "#8c8d87";
    // Per la lane: colore reale o trasparente (spina invisibile se l'operatore non ha un'area dominante).
    const laneAreaColor = (tasks: WorkloadTaskSummary[]): string => {
      for (const t of tasks) {
        const c = realAreaColor(t);
        if (c) return c;
      }
      return "transparent";
    };

    const renderTaskCard = (
      task: WorkloadTaskSummary,
      sourceAssigneeId: number | null,
      unassigned = false
    ) => {
      const status = taskStatusMeta(task.status);
      return (
        <button
          key={task.work_item_id}
          type="button"
          draggable
          style={{ ["--wl-area" as string]: unassigned ? "#f5b800" : taskAreaColor(task) }}
          onDragStart={(event) => onTaskDragStart(event, task.work_item_id, sourceAssigneeId)}
          onDragEnd={onTaskDragEnd}
          onClick={() => void openEditWorkItemModal(task.work_item_id)}
          className={`wl-acc-task${unassigned ? " wl-acc-task--unassigned" : ""}${
            draggingTaskId === task.work_item_id ? " is-dragging" : ""
          }`}
        >
          <div className="wl-acc-task__main">
            <span className="wl-acc-task__title">{task.title}</span>
            <span className="wl-acc-task__hours">{taskHoursLabel(task)}</span>
          </div>
          <div className="wl-acc-task__meta">
            {formatTaskStartTime(task.start_time) && (
              <span className="wl-acc-task__time">{formatTaskStartTime(task.start_time)}</span>
            )}
            <span className="wl-acc-task__client">{task.client_name || "Senza cliente"}</span>
            <span
              className="rounded-pill px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider leading-none"
              style={{ color: status.color, backgroundColor: `${status.color}22` }}
            >
              {status.label}
            </span>
          </div>
        </button>
      );
    };

    return (
      <div className={`wlfull-shell${calendarDensity === "compact" ? " wlfull-shell--compact" : ""}`}>
        <div className="wlfull-sub">
          <span className="wlfull-sub-title">Workload team per operatore</span>
          <span className="wlfull-sub-hint">Carico nel periodo selezionato</span>
          <button type="button" className="wl-acc-sort ml-auto self-center" onClick={onToggleSortByLoad}>
            <Icon name="list" className="w-3.5 h-3.5" />
            Ordina per carico {sortDir === "desc" ? "↓" : "↑"}
          </button>
        </div>
        {renderWorkloadLegend()}
      <div
        className="wl-acc-scroll flex-1 min-h-0 overflow-y-auto"
        onDragOverCapture={(event) => {
          if (draggingTaskId == null) return;
          event.preventDefault();
          const hit = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
          const lane = hit?.closest<HTMLElement>("[data-acc-drop-key]");
          const key = lane?.dataset.accDropKey ?? null;
          if (activeDropTarget !== key) setActiveDropTarget(key);
        }}
      >
        <div className={`wl-acc-list${calendarDensity === "compact" ? " wl-acc-list--compact" : ""}`}>
        {summary.map((item) => {
          const isOpen = !!expandedUsers[item.user_id];
          const isOperatorDropTarget = activeDropTarget === `acc-user-${item.user_id}`;
          // Tutte le task del periodo (giorno/settimana/mese), raggruppate per giorno.
          const tasks = item.tasks ?? [];
          const tasksByDay = new Map<string, WorkloadTaskSummary[]>();
          for (const task of tasks) {
            const day = getTaskDay(task);
            if (!day) continue;
            const bucket = tasksByDay.get(day);
            if (bucket) bucket.push(task);
            else tasksByDay.set(day, [task]);
          }
          const taskDays = [...tasksByDay.keys()].sort();
          const userDetail = companyUsers.find((u) => u.id === item.user_id);
          const avatarUrl = userDetail?.avatar_url ?? null;
          const userRoleIds = userDetail?.role_ids ?? [];
          const roleNames = userRoleIds
            .map((id) => roles.find((r) => r.id === id)?.name)
            .filter((n): n is string => !!n)
            .join(", ");
          const roleLabel = roleNames || userDetail?.role_label || null;
          const displayName = item.full_name || item.username;
          const initials = displayName
            .split(" ")
            .slice(0, 2)
            .map((w) => w[0]?.toUpperCase() ?? "")
            .join("");
          const fillPct = Math.min(item.utilization_percent, 100);

          return (
            <div
              key={item.user_id}
              data-acc-drop-key={`acc-user-${item.user_id}`}
              style={{ ["--wl-area" as string]: laneAreaColor(tasks) }}
              className={`wl-acc-lane${isOpen ? " is-expanded" : ""} ${
                isOperatorDropTarget ? "!border-amber-500 !border-2" : ""
              }`}
              onDragOver={(event) => {
                event.preventDefault();
              }}
              onDrop={(event) => void moveTaskByDrop(event, { assignee_id: item.user_id }, `acc-user-${item.user_id}`)}
            >
              <div
                className="wl-acc-lane__row"
                role="button"
                tabIndex={0}
                onClick={() => setExpandedUsers((current) => ({ ...current, [item.user_id]: !isOpen }))}
                onKeyDown={(e) => e.key === "Enter" && setExpandedUsers((current) => ({ ...current, [item.user_id]: !isOpen }))}
              >
                {/* Operatore */}
                <div className="wl-acc-lane__op">
                  {avatarUrl ? (
                    <div className="wl-acc-avatar wl-acc-avatar--photo">
                      <img src={avatarUrl} alt={displayName} />
                    </div>
                  ) : (
                    <div className="wl-acc-avatar">{initials}</div>
                  )}
                  <div className="min-w-0">
                    <div className="wl-acc-lane__name">{displayName}</div>
                    {roleLabel && <div className="wl-acc-lane__role" title={roleLabel}>{roleLabel}</div>}
                  </div>
                </div>

                {/* Progress bar */}
                <div className="wl-acc-lane__bar-wrap">
                  <div className="wl-acc-lane__bar-head">
                    <span className="wl-acc-lane__bar-label">
                      <strong>{formatHours(item.occupied_capacity_hours)}</strong> / {formatHours(item.capacity_hours_in_range)} · {item.assigned_tasks_count} task
                    </span>
                    <span className={`wl-acc-load ${loadClass(item.workload_status)}`}>{item.utilization_percent.toFixed(0)}%</span>
                  </div>
                  <div className="wl-acc-bar-track">
                    <div className={`wl-acc-bar ${barClass(item.workload_status)}`} style={{ width: `${fillPct}%` }} />
                  </div>
                </div>

                {/* Badge */}
                <div className="wl-acc-lane__badge">
                  <span className={accBadgeClass(item.workload_status)}>{statusLabel(item.workload_status)}</span>
                </div>

                {/* Caret */}
                <button
                  type="button"
                  className="wl-acc-lane__toggle"
                  onClick={(e) => { e.stopPropagation(); setExpandedUsers((current) => ({ ...current, [item.user_id]: !isOpen })); }}
                  aria-label="espandi"
                >
                  <Icon name="chevron-down" className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>
              </div>

              {isOpen && (
                <>
                  {taskDays.length === 0 ? (
                    <div className="wl-acc-empty">Nessuna task nel periodo selezionato.</div>
                  ) : (
                    taskDays.map((day) => (
                      <Fragment key={day}>
                        <div className="wl-acc-day-label">{formatAccDayLabel(day)}</div>
                        <div className="wl-acc-tasks">
                          {sortTasksByStatusThenTime(tasksByDay.get(day) ?? []).map((task) => renderTaskCard(task, item.user_id))}
                        </div>
                      </Fragment>
                    ))
                  )}
                </>
              )}
            </div>
          );
        })}

        {/* Sezione task non assegnate — sempre presente come nel prototipo */}
        {heatmap && (() => {
          const unassigned = heatmap.unassigned_tasks;
          const isUnassignedDropTarget = activeDropTarget === "acc-unassigned";
          // Task non assegnate del periodo, raggruppate per giorno.
          const unassignedByDay = new Map<string, WorkloadTaskSummary[]>();
          for (const t of unassigned.tasks) {
            const day = getTaskDay(t);
            if (!day) continue;
            const bucket = unassignedByDay.get(day);
            if (bucket) bucket.push(t);
            else unassignedByDay.set(day, [t]);
          }
          const unassignedDays = [...unassignedByDay.keys()].sort();
          return (
            <div
              data-acc-drop-key="acc-unassigned"
              style={{ ["--wl-area" as string]: "#f5b800" }}
              className={`wl-acc-lane wl-acc-lane--unassigned${unassignedOpen ? " is-expanded" : ""} ${isUnassignedDropTarget ? "!border-amber-500 !border-2" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
              }}
              onDrop={(event) => void moveTaskByDrop(event, { assignee_ids: [] }, "acc-unassigned")}
            >
              <div
                className="wl-acc-lane__row"
                role="button"
                tabIndex={0}
                onClick={() => setUnassignedOpen((v) => !v)}
                onKeyDown={(e) => e.key === "Enter" && setUnassignedOpen((v) => !v)}
              >
                <div className="wl-acc-lane__op">
                  <div className="wl-acc-avatar wl-acc-avatar--un">
                    <Icon name="alert-triangle" className="w-[15px] h-[15px]" />
                  </div>
                  <div className="min-w-0">
                    <div className="wl-acc-lane__name">Non assegnate</div>
                    <div className="wl-acc-lane__role">Da distribuire</div>
                  </div>
                </div>
                <div className="wl-acc-lane__bar-wrap">
                  <div className="wl-acc-lane__bar-head">
                    <span className="wl-acc-lane__bar-label">{unassigned.total_tasks_count} task · {formatHours(unassigned.total_estimated_hours)} stimate (peso pieno)</span>
                  </div>
                  <div className="wl-acc-bar-track">
                    <div className="wl-acc-bar wl-acc-bar--warning" style={{ width: unassigned.total_tasks_count > 0 ? "100%" : "0%" }} />
                  </div>
                </div>
                <div className="wl-acc-lane__badge">
                  <span className={accBadgeClass("warning")}>{unassigned.total_tasks_count}</span>
                </div>
                <button
                  type="button"
                  className="wl-acc-lane__toggle"
                  onClick={(e) => { e.stopPropagation(); setUnassignedOpen((v) => !v); }}
                  aria-label="espandi"
                >
                  <Icon name="chevron-down" className={`w-4 h-4 transition-transform ${unassignedOpen ? "rotate-180" : ""}`} />
                </button>
              </div>
              {unassignedOpen && (
                <>
                  {unassignedDays.length === 0 ? (
                    <div className="wl-acc-empty">Nessuna task non assegnata nel periodo.</div>
                  ) : (
                    unassignedDays.map((day) => (
                      <Fragment key={day}>
                        <div className="wl-acc-day-label">{formatAccDayLabel(day)}</div>
                        <div className="wl-acc-tasks">
                          {sortTasksByStatusThenTime(unassignedByDay.get(day) ?? []).map((task) => renderTaskCard(task, null, true))}
                        </div>
                      </Fragment>
                    ))
                  )}
                </>
              )}
            </div>
          );
        })()}
        </div>
      </div>
      </div>
    );
  };

  const renderCompleteView = () => {
    if (!heatmap || (heatmap.groups.length === 0 && heatmap.unassigned_tasks.total_tasks_count === 0)) {
      return (
        <div className="rounded-md border border-dashed border-line dark:border-line-dark px-4 py-8 text-sm text-muted dark:text-muted-dark">
          Nessun dato disponibile con i filtri correnti.
        </div>
      );
    }

    const today = getTodayDate();
    const loadClass = (pct: number) => (pct >= 100 ? "is-over" : pct >= 80 ? "is-warn" : "is-ok");
    const cellState = (key: string) =>
      `wlfull-cell${activeDropTarget === key ? " is-drop" : ""}${hotDropTarget === key ? " is-drop-hot" : ""}`;

    // Chip task (stile prototipo): colore = area, titolo + eventuale orario + durata.
    const renderChip = (
      task: WorkloadTaskSummary,
      areaColor: string | null,
      opts?: { unassigned?: boolean }
    ) => {
      const time = formatTaskStartTime(task.start_time);
      return (
        <button
          key={task.work_item_id}
          type="button"
          draggable
          onDragStart={(event) => onTaskDragStart(event, task.work_item_id)}
          onDragEnd={onTaskDragEnd}
          onClick={() => void openEditWorkItemModal(task.work_item_id)}
          className={`wlfull-chip${opts?.unassigned ? " is-unassigned" : ""}${draggingTaskId === task.work_item_id ? " is-dragging" : ""}`}
          style={!opts?.unassigned && areaColor ? ({ "--area": areaColor } as CSSProperties) : undefined}
          title={task.title}
        >
          <span className="wlfull-chip-main">
            <span className="wlfull-chip-t">{task.title}</span>
            {time && <span className="wlfull-chip-time">{time}</span>}
          </span>
          <span className="wlfull-chip-h">{taskHoursLabel(task)}</span>
        </button>
      );
    };

    // In "mese": una colonna per settimana (carico aggregato), come nel prototipo. Altrimenti per giorno.
    const isMonth = rangeMode === "month";
    const columns = isMonth
      ? groupDaysIntoWeeks(heatmap.days).map((w) => ({ key: w.key, days: w.days, label: w.label, single: false, dropDay: w.days[0] }))
      : heatmap.days.map((d) => ({ key: d, days: [d], label: "", single: true, dropDay: d }));
    const colSpanCount = columns.length;

    return (
      <div className={`wlfull-shell${calendarDensity === "compact" ? " wlfull-shell--compact" : ""}`}>
        <div className="wlfull-sub">
          <span className="wlfull-sub-title">Vista completa per area</span>
          <span className="wlfull-sub-hint">
            Carico per operatore · {isMonth ? `${columns.length} settimane` : `${heatmap.days.length} giorni`}
          </span>
        </div>
        {renderWorkloadLegend()}
        <div
          ref={completeScrollRef}
          className="wlfull"
          onDragOver={(event) => autoScrollCompleteCalendar(event.clientX)}
          onDrop={() => {
            setActiveDropTarget(null);
            setHotDropTarget(null);
            dropHoverRef.current = { key: null, sinceMs: 0 };
          }}
        >
          <table className="wlfull-tbl">
            <thead>
              <tr>
                <th className="wlfull-corner">Operatore</th>
                {columns.map((col) => {
                  const isToday = col.days.includes(today);
                  if (col.single) {
                    const chip = formatDayChip(col.days[0]);
                    return (
                      <th key={col.key} className={`wlfull-dh${isToday ? " is-today" : ""}`}>
                        <span className="dow">{chip.weekday}</span>
                        <span className="num">{chip.day}</span>
                      </th>
                    );
                  }
                  return (
                    <th key={col.key} className={`wlfull-dh${isToday ? " is-today" : ""}`}>
                      <span className="dow">Sett.</span>
                      <span className="num" style={{ fontSize: 13 }}>{col.label}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {/* Task senza area – riga globale "Da distribuire" */}
              {(() => {
                const noAreaTasks = heatmap.unassigned_tasks.tasks.filter((t) => !t.work_areas || t.work_areas.length === 0);
                if (noAreaTasks.length === 0) return null;
                const tasksByDay = new Map<string, typeof noAreaTasks>();
                noAreaTasks.forEach((t) => {
                  const d = (t.work_date ?? "").slice(0, 10);
                  if (!tasksByDay.has(d)) tasksByDay.set(d, []);
                  tasksByDay.get(d)!.push(t);
                });
                return (
                  <tr>
                    <td
                      className={`wlfull-op${activeDropTarget === "complete-no-area" ? " is-drop" : ""}`}
                      onDragOver={(event) => event.preventDefault()}
                      onDragEnter={() => setActiveDropTarget("complete-no-area")}
                      onDragLeave={() => setActiveDropTarget((current) => (current === "complete-no-area" ? null : current))}
                      onDrop={(event) => void moveTaskByDrop(event, { work_area_ids: [] }, "complete-no-area")}
                    >
                      <div className="wlfull-op-in">
                        <span className="wlfull-area-dot" style={{ background: "#f59e0b" }} />
                        <span className="wlfull-op-info">
                          <b>Da distribuire</b>
                          <span>Senza area · {noAreaTasks.length} task</span>
                        </span>
                      </div>
                    </td>
                    {columns.map((col) => {
                      const tasks = sortTasksByStartTime(col.days.flatMap((d) => tasksByDay.get(d) ?? []));
                      const key = `complete-no-area-${col.key}`;
                      const isToday = col.days.includes(today);
                      return (
                        <td
                          key={col.key}
                          className={`${cellState(key)}${isToday ? " is-today" : ""}`}
                          onDragOver={(event) => onCompleteDropHover(event, key)}
                          onDrop={(event) => void moveTaskByDrop(event, { work_area_ids: [], work_date: col.dropDay }, key)}
                        >
                          <div className="wlfull-cellbox">
                            {tasks.length > 0 && (
                              <div className="wlfull-chips">
                                {tasks.map((task) => renderChip(task, null, { unassigned: true }))}
                              </div>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })()}
              {heatmap.groups.map((group, gIndex) => {
                const areaKey = String(group.area_id ?? `none-${gIndex}`);
                const areaColor = group.area_color;
                const areaUnassigned = heatmap.unassigned_tasks.tasks.filter(
                  (t) => t.work_areas && t.work_areas.some((a) => a.id === group.area_id)
                );
                const areaUnassignedByDay = new Map<string, typeof areaUnassigned>();
                areaUnassigned.forEach((t) => {
                  const d = (t.work_date ?? "").slice(0, 10);
                  if (!areaUnassignedByDay.has(d)) areaUnassignedByDay.set(d, []);
                  areaUnassignedByDay.get(d)!.push(t);
                });
                const areaStyle = areaColor ? ({ "--area": areaColor } as CSSProperties) : undefined;
                return (
                  <Fragment key={`area-${areaKey}`}>
                    {/* Banda area */}
                    <tr>
                      <td
                        className={`wlfull-area${activeDropTarget === `complete-area-${areaKey}` ? " is-drop" : ""}`}
                        style={areaStyle}
                        onDragOver={(event) => event.preventDefault()}
                        onDragEnter={() => setActiveDropTarget(`complete-area-${areaKey}`)}
                        onDragLeave={() => setActiveDropTarget((current) => (current === `complete-area-${areaKey}` ? null : current))}
                        onDrop={(event) => void moveTaskByDrop(event, group.area_id != null ? { work_area_id: group.area_id } : { work_area_ids: [] }, `complete-area-${areaKey}`)}
                      >
                        <div className="wlfull-area-in">
                          <span className="wlfull-area-dot" />
                          <span className="wlfull-area-name">{group.area_name || "Non assegnato"}</span>
                          <span className="wlfull-area-count">{group.users.length}</span>
                        </div>
                      </td>
                      <td
                        colSpan={colSpanCount}
                        className="wlfull-area-fill"
                        style={areaStyle}
                        onDragOver={(event) => event.preventDefault()}
                        onDragEnter={() => setActiveDropTarget(`complete-area-${areaKey}-fill`)}
                        onDragLeave={() => setActiveDropTarget((current) => (current === `complete-area-${areaKey}-fill` ? null : current))}
                        onDrop={(event) => void moveTaskByDrop(event, group.area_id != null ? { work_area_id: group.area_id } : { work_area_ids: [] }, `complete-area-${areaKey}-fill`)}
                      />
                    </tr>
                    {/* Task non assegnate dell'area */}
                    {areaUnassigned.length > 0 && (
                      <tr>
                        <td
                          className={`wlfull-op${activeDropTarget === `complete-area-unassigned-${areaKey}` ? " is-drop" : ""}`}
                          onDragOver={(event) => event.preventDefault()}
                          onDragEnter={() => setActiveDropTarget(`complete-area-unassigned-${areaKey}`)}
                          onDragLeave={() => setActiveDropTarget((current) => (current === `complete-area-unassigned-${areaKey}` ? null : current))}
                          onDrop={(event) => void moveTaskByDrop(event, group.area_id != null ? { assignee_ids: [], work_area_id: group.area_id } : { assignee_ids: [], work_area_ids: [] }, `complete-area-unassigned-${areaKey}`)}
                        >
                          <div className="wlfull-op-in">
                            <span className="wlfull-area-dot" style={{ background: "#f59e0b" }} />
                            <span className="wlfull-op-info">
                              <b>Da distribuire</b>
                              <span>{areaUnassigned.length} task</span>
                            </span>
                          </div>
                        </td>
                        {columns.map((col) => {
                          const tasks = sortTasksByStartTime(col.days.flatMap((d) => areaUnassignedByDay.get(d) ?? []));
                          const key = `complete-area-unassigned-${areaKey}-${col.key}`;
                          const isToday = col.days.includes(today);
                          return (
                            <td
                              key={col.key}
                              className={`${cellState(key)}${isToday ? " is-today" : ""}`}
                              onDragOver={(event) => onCompleteDropHover(event, key)}
                              onDrop={(event) => void moveTaskByDrop(event, group.area_id != null ? { assignee_ids: [], work_area_id: group.area_id, work_date: col.dropDay } : { assignee_ids: [], work_area_ids: [], work_date: col.dropDay }, key)}
                            >
                              <div className="wlfull-cellbox">
                                {tasks.length > 0 && (
                                  <div className="wlfull-chips">
                                    {tasks.map((task) => renderChip(task, null, { unassigned: true }))}
                                  </div>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    )}
                    {/* Righe operatori */}
                    {group.users.map((operator) => {
                      const byDate = new Map(operator.days.map((d) => [d.date, d]));
                      const avatarUrl = operator.avatar_url;
                      const initials = (operator.full_name || operator.username)
                        .split(" ")
                        .slice(0, 2)
                        .map((w) => w[0]?.toUpperCase() ?? "")
                        .join("");
                      const roleLabel = operator.roles?.map((r) => r.name).join(", ") || null;
                      const weekHours = operator.days.reduce((s, d) => s + (d.occupied_capacity_hours ?? 0), 0);
                      const userKey = `complete-user-${operator.user_id}-${areaKey}`;
                      return (
                        <tr key={`${areaKey}-${operator.user_id}`}>
                          {/* Cella operatore */}
                          <td
                            className={`wlfull-op${activeDropTarget === userKey ? " is-drop" : ""}`}
                            style={areaStyle}
                            onDragOver={(event) => event.preventDefault()}
                            onDragEnter={() => setActiveDropTarget(userKey)}
                            onDragLeave={() => setActiveDropTarget((current) => (current === userKey ? null : current))}
                            onDrop={(event) => void moveTaskByDrop(event, group.area_id != null ? { assignee_id: operator.user_id, work_area_id: group.area_id } : { assignee_id: operator.user_id, work_area_ids: [] }, userKey)}
                          >
                            <div className="wlfull-op-in">
                              <span className="wlfull-op-av" style={areaStyle}>
                                {avatarUrl ? <img src={avatarUrl} alt={operator.full_name || operator.username} /> : initials}
                              </span>
                              <span className="wlfull-op-info">
                                <b>{operator.full_name || operator.username}</b>
                                {roleLabel && <span title={roleLabel}>{roleLabel}</span>}
                              </span>
                              <span className="wlfull-op-cap">{formatHours(weekHours)}</span>
                            </div>
                          </td>
                          {/* Celle giorno (o settimana aggregata in vista mese) */}
                          {columns.map((col) => {
                            const isToday = col.days.includes(today);
                            const key = `complete-cell-${operator.user_id}-${areaKey}-${col.key}`;
                            // Vista mese: cella aggregata per settimana (ore · % · task), senza chip.
                            if (!col.single) {
                              const weekCells = col.days.map((d) => byDate.get(d)).filter((c): c is NonNullable<typeof c> => !!c);
                              const occupied = weekCells.reduce((s, c) => s + (c.occupied_capacity_hours ?? 0), 0);
                              const taskCount = weekCells.reduce((s, c) => s + (c.assigned_tasks_count ?? 0), 0);
                              const weekCap = operator.max_capacity_hours_week ?? operator.max_capacity_hours_day * 5;
                              const util = weekCap > 0 ? (occupied / weekCap) * 100 : 0;
                              return (
                                <td
                                  key={col.key}
                                  className={`${cellState(key)}${isToday ? " is-today" : ""}`}
                                  onDragOver={(event) => onCompleteDropHover(event, key)}
                                  onDrop={(event) => void moveTaskByDrop(event, group.area_id != null ? { assignee_id: operator.user_id, work_area_id: group.area_id, work_date: col.dropDay } : { assignee_id: operator.user_id, work_area_ids: [], work_date: col.dropDay }, key)}
                                >
                                  <div className="wlfull-cellbox items-center justify-center">
                                    {taskCount > 0 ? (
                                      <div className="flex flex-col items-center gap-0.5 py-2 text-center">
                                        <span className="text-[15px] font-bold tabular-nums leading-none text-ink dark:text-paper">{formatHours(occupied)}</span>
                                        <span className={`text-[12px] font-bold tabular-nums ${util >= 100 ? "text-danger" : util >= 80 ? "text-warning" : "text-success"}`}>{Math.round(util)}%</span>
                                        <span className="text-[10px] text-muted dark:text-muted-dark">{taskCount} task · sett.</span>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => { setQuickAdd({ day: col.dropDay, userId: operator.user_id }); setNewWorkModalOpen(true); }}
                                        className="wlfull-add-empty"
                                        title="Aggiungi lavorazione"
                                      >
                                        <Icon name="plus" className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              );
                            }
                            const day = col.days[0];
                            const cell = byDate.get(day);
                            if (!cell || cell.workload_status === "empty") {
                              return (
                                <td
                                  key={day}
                                  className={`${cellState(key)}${isToday ? " is-today" : ""}`}
                                  onDragOver={(event) => onCompleteDropHover(event, key)}
                                  onDrop={(event) => void moveTaskByDrop(event, group.area_id != null ? { assignee_id: operator.user_id, work_area_id: group.area_id, work_date: day } : { assignee_id: operator.user_id, work_area_ids: [], work_date: day }, key)}
                                >
                                  <div className="wlfull-cellbox">
                                    <button
                                      type="button"
                                      onClick={() => { setQuickAdd({ day, userId: operator.user_id }); setNewWorkModalOpen(true); }}
                                      className="wlfull-add-empty"
                                      title="Aggiungi lavorazione"
                                    >
                                      <Icon name="plus" className="w-3 h-3" />
                                    </button>
                                  </div>
                                </td>
                              );
                            }
                            return (
                              <td
                                key={day}
                                className={`${cellState(key)}${isToday ? " is-today" : ""}`}
                                onDragOver={(event) => onCompleteDropHover(event, key)}
                                onDrop={(event) => void moveTaskByDrop(event, group.area_id != null ? { assignee_id: operator.user_id, work_area_id: group.area_id, work_date: day } : { assignee_id: operator.user_id, work_area_ids: [], work_date: day }, key)}
                              >
                                <div className="wlfull-cellbox">
                                  {cell.tasks.length > 0 ? (
                                    <div className="wlfull-chips">
                                      {sortTasksByStartTime(cell.tasks).map((task) => renderChip(task, areaColor))}
                                    </div>
                                  ) : (
                                    <div className="wlfull-chips">
                                      <div className="wlfull-chip" style={areaStyle}>
                                        <span className="wlfull-chip-main">
                                          <span className="wlfull-chip-t">{cell.assigned_tasks_count} task</span>
                                        </span>
                                        <span className="wlfull-chip-h">{formatHours(cell.occupied_capacity_hours)}</span>
                                      </div>
                                    </div>
                                  )}
                                  <div className="wlfull-foot">
                                    <span className="wlfull-foot-h">{formatHours(cell.occupied_capacity_hours)}</span>
                                    <span className={`wlfull-foot-load ${loadClass(cell.utilization_percent)}`}>
                                      {cell.utilization_percent.toFixed(0)}%
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => { setQuickAdd({ day, userId: operator.user_id }); setNewWorkModalOpen(true); }}
                                    className="wlfull-add"
                                    title="Aggiungi lavorazione"
                                  >
                                    <Icon name="plus" className="w-2.5 h-2.5" />
                                  </button>
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderHeatmapView = () => {
    if (!heatmap || heatmap.groups.length === 0) {
      return (
        <div className="rounded-md border border-dashed border-line dark:border-line-dark px-4 py-8 text-sm text-muted dark:text-muted-dark">
          Nessun dato heatmap disponibile nel range selezionato.
        </div>
      );
    }

    const today = getTodayDate();
    // Classe di "calore" della cella in base alla % di carico (come il prototipo).
    const heatCls = (cell?: { utilization_percent: number; workload_status: WorkloadComputedStatus }) => {
      if (!cell || cell.workload_status === "empty" || cell.utilization_percent <= 0) return "is-empty";
      if (cell.utilization_percent >= 100) return "is-over";
      if (cell.utilization_percent >= 80) return "is-warn";
      return "is-ok";
    };

    return (
      <div className={`wlfull-shell${calendarDensity === "compact" ? " wlfull-shell--compact" : ""}`}>
        <div className="wlfull-sub">
          <span className="wlfull-sub-title">Heatmap carico per area</span>
          <span className="wlfull-sub-hint">{heatmap.days.length} giorni · % su capacità</span>
        </div>
        {renderWorkloadLegend()}
        <div className="wlfull">
          <table className="wlfull-tbl wlfull-tbl--heat">
            <thead>
              <tr>
                <th className="wlfull-corner">Operatore</th>
                {heatmap.days.map((day) => {
                  const chip = formatDayChip(day);
                  const isToday = day === today;
                  return (
                    <th key={day} className={`wlfull-dh${isToday ? " is-today" : ""}`}>
                      <span className="dow">{chip.weekday}</span>
                      <span className="num">{chip.day}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {heatmap.groups.map((group, index) => {
                const areaKey = String(group.area_id ?? `none-${index}`);
                const areaColor = group.area_color ?? "#9ca3af";
                const areaStyle = { ["--area" as string]: areaColor } as CSSProperties;
                return (
                  <Fragment key={areaKey}>
                    {/* Banda area */}
                    <tr>
                      <td className="wlfull-area" style={areaStyle}>
                        <div className="wlfull-area-in">
                          <span className="wlfull-area-dot" />
                          <span className="wlfull-area-name">{group.area_name || "Non assegnato"}</span>
                          <span className="wlfull-area-count">{group.users.length}</span>
                        </div>
                      </td>
                      <td colSpan={heatmap.days.length} className="wlfull-area-fill" style={areaStyle} />
                    </tr>
                    {/* Righe operatori */}
                    {group.users.map((operator) => {
                      const byDate = new Map(operator.days.map((d) => [d.date, d]));
                      const avatarUrl = operator.avatar_url;
                      const initials = (operator.full_name || operator.username)
                        .split(" ")
                        .slice(0, 2)
                        .map((w) => w[0]?.toUpperCase() ?? "")
                        .join("");
                      const roleLabel = operator.roles?.map((r) => r.name).join(", ") || null;
                      return (
                        <tr key={`${areaKey}-${operator.user_id}`}>
                          <td className="wlfull-op" style={areaStyle}>
                            <div className="wlfull-op-in">
                              <span className="wlfull-op-av" style={areaStyle}>
                                {avatarUrl ? <img src={avatarUrl} alt={operator.full_name || operator.username} /> : initials}
                              </span>
                              <span className="wlfull-op-info">
                                <b>{operator.full_name || operator.username}</b>
                                {roleLabel && <span title={roleLabel}>{roleLabel}</span>}
                              </span>
                              <span className="wlfull-op-cap">{operator.max_capacity_hours_day}h</span>
                            </div>
                          </td>
                          {heatmap.days.map((day) => {
                            const cell = byDate.get(day);
                            const isToday = day === today;
                            const filled = !!cell && cell.workload_status !== "empty" && cell.utilization_percent > 0;
                            const dropKey = `heat-cell-${operator.user_id}-${day}`;
                            return (
                              <td
                                key={day}
                                className={`wlfull-heatcell${isToday ? " is-today" : ""}${activeDropTarget === dropKey ? " is-drop" : ""}`}
                                onDragOver={(event) => { if (draggingTaskId != null) event.preventDefault(); }}
                                onDragEnter={() => { if (draggingTaskId != null) setActiveDropTarget(dropKey); }}
                                onDragLeave={() => setActiveDropTarget((current) => (current === dropKey ? null : current))}
                                onDrop={(event) => void moveTaskByDrop(event, { assignee_id: operator.user_id, work_date: day }, dropKey)}
                              >
                                <button
                                  type="button"
                                  className={`wlfull-heat ${heatCls(cell)}${selectedDay === day ? " is-sel" : ""}`}
                                  onClick={() => setSelectedDay(day)}
                                  title={`${operator.full_name || operator.username} · ${formatDayChip(day).weekday} ${formatDayChip(day).day}`}
                                >
                                  {filled ? (
                                    <>
                                      <span className="wlfull-heat-h">{formatHours(cell!.occupied_capacity_hours)}</span>
                                      <span className="wlfull-heat-pct">{cell!.utilization_percent.toFixed(0)}%</span>
                                      <span className="wlfull-heat-tasks">{cell!.assigned_tasks_count} task</span>
                                    </>
                                  ) : (
                                    <span className="wlfull-heat-we">—</span>
                                  )}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };


  // Striscia info operatore selezionato (come `.op` del prototipo).
  const renderOperatorStrip = () => {
    const op = calendarOperatorId != null ? calendarOperators.find((o) => o.user_id === calendarOperatorId) : null;
    if (!op) return null;
    const name = op.full_name || op.username;
    const role = op.roles?.map((r) => r.name).join(", ");
    const initials = (name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("")) || "?";
    const dayStat = calendarDayStats.get(selectedDay);
    const status = summaryByUserId.get(op.user_id)?.workload_status;
    const statusCls = status === "overload" ? "is-over" : status === "warning" ? "is-warn" : "is-neutral";
    const dayMeta = dateFromIso(selectedDay).toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "long" });
    const conflicts = calendarData?.conflicts?.length ?? 0;
    return (
      <div className="wlcal-op">
        {op.avatar_url ? (
          <img src={op.avatar_url} alt={name} className="wlcal-op-av wlcal-op-av--img" />
        ) : (
          <div className="wlcal-op-av">{initials}</div>
        )}
        <div className="wlcal-op-who">
          <b>{name}</b>
          <span>{role || "Operatore"} · {dayMeta}</span>
        </div>
        <div className="wlcal-op-stats">
          {status && <span className={`wlcal-badge ${statusCls}`}>{statusLabel(status)}</span>}
          {dayStat && (
            <span className="wlcal-badge is-neutral">{formatHours(dayStat.hours)} · {dayStat.tasks} task</span>
          )}
          {conflicts > 0 && (
            <button type="button" className="wlcal-badge is-conf" onClick={() => setCalendarConflictsModalOpen(true)}>
              Conflitti <span className="n">{conflicts}</span>
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderCalendarView = () => {
    if (calendarOperators.length === 0) {
      return (
        <div className="rounded-md border border-dashed border-line dark:border-line-dark px-4 py-8 text-sm text-muted dark:text-muted-dark">
          Nessun operatore disponibile per la vista calendario.
        </div>
      );
    }

    if (calendarError) {
      return (
        <div className="rounded-md border border-danger/20 bg-danger/5 px-4 py-4 text-sm text-danger">
          {calendarError}
        </div>
      );
    }

    // Vista MESE: griglia mensile (dati per-giorno dalla heatmap), niente timeline/tray.
    if (rangeMode === "month") {
      const monthCapacity = (calendarOperatorId != null ? summaryByUserId.get(calendarOperatorId)?.max_capacity_hours_day : null) ?? 8;
      return (
        <div className="wlcal-area">
          {renderOperatorStrip()}
          <WorkloadMonthGrid
            anchorDate={anchorDate}
            stats={calendarDayStats}
            capacityHours={monthCapacity}
            today={getTodayDate()}
            onOpenDay={(iso) => {
              setRangeMode("day");
              setAnchorDate(iso);
              setSelectedDay(iso);
            }}
          />
        </div>
      );
    }

    if (calendarLoading && !calendarData) {
      return <div className="py-8 flex items-center justify-center"><Spinner size="md" /></div>;
    }

    if (!calendarData) {
      return (
        <div className="rounded-md border border-dashed border-line dark:border-line-dark px-4 py-8 text-sm text-muted dark:text-muted-dark">
          Seleziona operatore e giorno per visualizzare la timeline.
        </div>
      );
    }

    const operatorSummary = summaryByUserId.get(calendarData.user_id);
    return (
      <div className="wlcal-area">
        {renderOperatorStrip()}
        {renderWorkloadLegend()}
        <WorkloadCalendar
          ref={calendarRef}
          userId={calendarData.user_id}
          companyId={selectedCompanyId}
          visibleDays={visibleDays}
          selectedDate={calendarData.selected_date}
          bounds={calendarBounds}
          nowMinutes={nowMinutes}
          density={calendarDensity}
          showReview={showReviewTasks}
          maxCapacityHours={operatorSummary?.max_capacity_hours_day ?? null}
          reloadToken={multiReloadToken}
          onOpenEdit={(id) => { void openEditWorkItemModal(id); }}
          onToggleComplete={(item) => { void toggleCalendarTaskCompleted(item); }}
          onMove={(taskId, day, startTime) => { void moveCalendarTaskToDaySlot(taskId, day, startTime); }}
          onSwap={(sourceId, targetId, positions) => { void swapCalendarTasks(sourceId, targetId, positions); }}
          onCreateByDrag={({ day, startTime, estimatedHours }) => {
            setEditingItem(null);
            setQuickAdd({ day, userId: calendarData.user_id, startTime, estimatedHours });
            setNewWorkModalOpen(true);
          }}
          onRequestPage={(dir) => onShiftPeriod(dir)}
        />
      </div>
    );
  };

  const renderMultiOperatorCalendar = () => {
    const operatorMetas: MultiOperatorMeta[] = calendarOperatorIds
      .map((id) => calendarOperators.find((op) => op.user_id === id))
      .filter((op): op is NonNullable<typeof op> => !!op)
      .map((op) => ({ id: op.user_id, name: op.full_name || op.username, avatarUrl: op.avatar_url ?? null }));
    if (!selectedCompanyId || operatorMetas.length === 0) return null;
    return (
      <MultiOperatorCalendar
        operators={operatorMetas}
        selectedDate={selectedDay}
        companyId={selectedCompanyId}
        bounds={calendarBounds}
        nowMinutes={nowMinutes}
        showReview={showReviewTasks}
        onOpenTask={(id) => { void openEditWorkItemModal(id); }}
        onCreateTask={({ day, userId, startTime, estimatedHours }) => {
          setEditingItem(null);
          setQuickAdd({ day, userId, startTime, estimatedHours });
          setNewWorkModalOpen(true);
        }}
        onAfterChange={() => { void loadMain({ silent: true }); }}
        reloadToken={multiReloadToken}
      />
    );
  };

  const renderMainView = () => {
    // Spinner a tutta pagina solo al PRIMO caricamento (nessun dato ancora). Durante i reload
    // — incluso il paging mentre trascini una task — la vista resta montata, così il calendario
    // (e il fantasma del drag) non si smontano e il drop sul nuovo periodo continua a funzionare.
    if (loading && summary.length === 0 && !heatmap && !calendarData) {
      return <div className="py-8 flex items-center justify-center"><Spinner size="md" /></div>;
    }

    if (viewMode === "accordion") return renderAccordionView();
    if (viewMode === "complete") return renderCompleteView();
    if (viewMode === "heatmap") return renderHeatmapView();
    // Più operatori selezionati → vista a colonne affiancate (solo admin/PM).
    if (!isOperatorView && calendarOperatorIds.length > 1) return renderMultiOperatorCalendar();
    return renderCalendarView();
  };

  const renderWorkloadLegend = () => (
    <div className="shrink-0 px-[22px] py-1.5 border-b border-line dark:border-line-dark bg-cream dark:bg-ink-2">
      <div className="flex flex-wrap items-center gap-3 text-[11px]">
        <button
          type="button"
          onClick={() => setLegendOpen((open) => !open)}
          aria-expanded={legendOpen}
          className="inline-flex items-center gap-1.5 font-semibold uppercase tracking-wider text-muted transition-colors hover:text-ink dark:text-muted-dark dark:hover:text-paper"
        >
          <Icon name="chevron-down" className={`h-3.5 w-3.5 transition-transform ${legendOpen ? "rotate-180" : ""}`} />
          Legenda
        </button>

        {legendOpen && (
          <>
            {legendAreas.length > 0 && (
              <>
                <span className="mx-1 h-3 w-px bg-line dark:bg-line-dark" />
                <span className="font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Aree</span>
                {legendAreas.map((area) => (
                  <span key={area.id} className="inline-flex items-center gap-1.5 text-muted dark:text-muted-dark">
                    <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: area.color }} />
                    {area.name}
                  </span>
                ))}
              </>
            )}
            <span className="mx-1 h-3 w-px bg-line dark:bg-line-dark" />
            <span className="font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Carico</span>
            <span className="inline-flex items-center gap-1.5 text-muted dark:text-muted-dark">
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-success/30 border border-success/40" />
              Basso/OK (&lt; 80%)
            </span>
            <span className="inline-flex items-center gap-1.5 text-muted dark:text-muted-dark">
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-warning/30 border border-warning/40" />
              Attenzione (80-99%)
            </span>
            <span className="inline-flex items-center gap-1.5 text-muted dark:text-muted-dark">
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-danger/30 border border-danger/40" />
              Overload (&gt;= 100%)
            </span>
            <span className="inline-flex items-center gap-1.5 text-muted dark:text-muted-dark">
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-line dark:bg-line-dark border border-line dark:border-line-dark" />
              Vuoto
            </span>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className={`px-6 mx-auto w-full animate-fadeIn ${isFillView ? "max-w-none pt-4 h-full flex flex-col overflow-hidden" : "py-8 pb-20"}`}>
      <div className={isFillView ? "mb-1" : "mb-8"}>
        <h1 className="section-title flex items-center gap-2.5">
          <Icon name="activity" className="w-6 h-6" />
          Workload
        </h1>
      </div>

      <div className={`wl-toolbar-shell ${isFillView ? "mb-0" : "mb-5"}`}>
        {/* RIGA 1 — sinistra: data, Oggi, giorno/settimana/mese · destra: cerca + operatore | team + nuova */}
        <div className="wl-toolbar-row wl-toolbar-bar">
          <div className="wl-toolbar-group">
            <WorkloadDateNav
              label={currentRangeLabel}
              onPrev={() => onShiftPeriod(-1)}
              onNext={() => onShiftPeriod(1)}
            />

            <button type="button" className="wl-outline-btn" onClick={onGoToday}>
              <Icon name="calendar" className="w-3.5 h-3.5" />
              Oggi
            </button>

            <SegmentedSwitch<RangeMode>
              value={rangeMode}
              onChange={setRangeMode}
              ariaLabel="Intervallo"
              options={RANGE_MODE_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
            />

            <button
              type="button"
              className="wl-outline-btn wl-outline-btn--icon"
              onClick={() => { void loadMain(); }}
              title="Aggiorna"
              aria-label="Aggiorna"
            >
              <Icon name="refresh-cw" className="w-4 h-4" />
            </button>
          </div>

          <div className="wl-toolbar-group">
            <label className="wl-search-field wl-search-field--compact" aria-label="Cerca task cliente operatore">
              <Icon name="search" className="w-3.5 h-3.5" />
              <input
                type="text"
                placeholder="Cerca..."
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
              />
            </label>

            {!isOperatorView && viewMode === "calendar" && (
              <div className="min-w-[200px]">
                <MultiSelect
                  value={calendarOperatorIds}
                  onChange={setCalendarOperatorIds}
                  options={calendarOperators.map((op) => ({ id: op.user_id, label: op.full_name || op.username }))}
                  placeholder="Operatori in calendario..."
                  searchPlaceholder="Cerca operatore..."
                />
              </div>
            )}

            <span className="wl-toolbar-divider" />

            {!isOperatorView && (
              <button
                type="button"
                className="wl-outline-btn"
                onClick={() => setTeamModalOpen(true)}
              >
                <Icon name="users" className="w-3.5 h-3.5" />
                Team e capacità
              </button>
            )}

            <button
              type="button"
              className="wl-new-task-btn"
              onClick={openNewWorkModal}
            >
              <Icon name="plus" className="w-3.5 h-3.5" />
              Nuova lavorazione
            </button>
          </div>
        </div>

        {rangeMode === "custom" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <Input
              label="Dal"
              type="date"
              value={customFromDate}
              onChange={(event) => setCustomFromDate(event.target.value || getTodayDate())}
            />
            <Input
              label="Al"
              type="date"
              value={customToDate}
              onChange={(event) => setCustomToDate(event.target.value || getTodayDate())}
            />
          </div>
        )}

        {/* RIGA 2 — sinistra: viste · destra: densità + tray */}
        <div className="wl-toolbar-row wl-toolbar-bar">
          <div className="wl-toolbar-group">
            {!isOperatorView && (
              <div className="wl-vchips">
                {VIEW_MODE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setViewMode(option.value)}
                    className={`wl-vchip ${viewMode === option.value ? "is-active" : ""}`}
                  >
                    <Icon name={option.icon} className="w-3.5 h-3.5" />
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="wl-toolbar-group">
            {/* Densità comodo/compatto — disponibile in tutte le view */}
            <SegmentedSwitch<WorkloadCalendarDensity>
              value={calendarDensity}
              onChange={setCalendarDensity}
              ariaLabel="Densità"
              buttonClassName="wl-icon-btn"
              options={([
                { value: "comfortable", icon: "grid", label: "Comodo" },
                { value: "compact", icon: "grid-compact", label: "Compatto" },
              ] as const).map((option) => ({
                value: option.value,
                title: `Densità: ${option.label}`,
                label: <Icon name={option.icon} className="w-4 h-4" />,
              }))}
            />

            {/* Mostra/nascondi task in revisione */}
            <div className="wl-segmented wl-segmented--view" role="group" aria-label="Task in revisione">
              <button
                type="button"
                onClick={() => setShowReviewTasks((v) => !v)}
                title={showReviewTasks ? "Nascondi dal calendario le task in revisione" : "Mostra sul calendario le task in revisione"}
                aria-label={showReviewTasks ? "Nascondi task in revisione" : "Mostra task in revisione"}
                aria-pressed={showReviewTasks}
                className={`wl-segmented-btn wl-segmented-btn--view inline-flex items-center gap-1.5 ${showReviewTasks ? "is-active" : ""}`}
              >
                <Icon name={showReviewTasks ? "eye" : "eye-off"} className="w-4 h-4" />
                In revisione
              </button>
            </div>

            {/* Tray "Da pianificare": Sidebar (colonna) o Dock (pannello a scomparsa) */}
            <SegmentedSwitch<WorkloadTrayLayout>
              value={trayLayout}
              onChange={(v) => { setTrayLayout(v); if (v === "dock") setTrayDockOpen(false); }}
              ariaLabel="Tray Da pianificare"
              options={[
                { value: "sidebar", label: "Sidebar" },
                { value: "dock", label: "Dock" },
              ]}
            />
          </div>
        </div>

        {!isFillView && (
        <div className="wl-day-row">
          <div className="wl-view-label">
            {viewMode === "accordion" && "Workload team - vista ibrida"}
            {viewMode === "heatmap" && "Heatmap per area e giorno"}
            {viewMode === "accordion" && (
              <div className="mt-1 text-[11px] normal-case tracking-normal font-normal text-muted dark:text-muted-dark">
                La percentuale di carico indica le ore occupate rispetto alla capacità nel periodo selezionato: giorno, settimana o mese.
              </div>
            )}
          </div>

          <div className="wl-day-strip">
            {visibleDays.map((day) => {
              const meta = formatDayChip(day);
              const isActive = selectedDay === day;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => {
                    setSelectedDay(day);
                    if (rangeMode === "day") setAnchorDate(day);
                  }}
                  onDragOver={(event) => {
                    if (draggingTaskId == null || viewMode !== "accordion") return;
                    event.preventDefault();
                    setActiveDropTarget(`acc-day-${day}`);
                  }}
                  onDragLeave={() => {
                    if (viewMode !== "accordion") return;
                    setActiveDropTarget((current) => (current === `acc-day-${day}` ? null : current));
                  }}
                  onDrop={(event) => {
                    if (viewMode !== "accordion") return;
                    setSelectedDay(day);
                    void moveTaskByDrop(event, buildAccordionDayMovePayload(day), `acc-day-${day}`);
                  }}
                  className={`wl-day-chip ${isActive ? "is-active" : ""} ${viewMode === "accordion" && activeDropTarget === `acc-day-${day}` ? "ring-2 ring-inset ring-amber-500 bg-amber-50/70 dark:bg-amber-900/35" : ""}`}
                >
                  <div className="text-[10px] uppercase tracking-wider">{meta.weekday}</div>
                  <div className="text-xs font-semibold">{meta.day}</div>
                </button>
              );
            })}
          </div>

          <button type="button" className="wl-sort-btn" onClick={onToggleSortByLoad}>
            <Icon name="list" className="w-3.5 h-3.5" />
            Ordina per carico {sortDir === "desc" ? "↓" : "↑"}
          </button>
        </div>
        )}

      </div>

      {error && (
        <div className="mb-4 rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</div>
      )}

      <div className="-mx-6 flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 min-h-0 flex flex-col px-6">
          {loading && (
            <div className="flex items-center justify-end mb-3">
              <Spinner size="sm" />
            </div>
          )}

          {renderMainView()}
        </div>

        {/* Tray "Da pianificare" condivisa a livello pagina: stessa posizione/comportamento in
            tutte le view. Nel calendario le schede sono trascinabili (drag pointer-based via handle). */}
        <WorkloadTray
          groups={displayTrayGroups}
          unassignedItems={trayUnassignedItems}
          layout={trayLayout}
          open={trayDockOpen}
          onOpenChange={setTrayDockOpen}
          tab={trayTab}
          onTab={setTrayTab}
          onCardClick={(id) => void openEditWorkItemModal(id)}
          onCardPointerDown={viewMode === "calendar" ? (event, item) => calendarRef.current?.startTrayDrag(event, item) : undefined}
          onCardDragStart={viewMode === "calendar" ? undefined : (event, item) => onTaskDragStart(event, item.id, null)}
          onCardDragEnd={viewMode === "calendar" ? undefined : onTaskDragEnd}
          draggingId={draggingTaskId}
          onlyMine={trayOnlyMine}
          onOnlyMineChange={isOperatorView ? undefined : setTrayOnlyMine}
          allOperators={trayAllOperators}
          onAllOperatorsChange={isOperatorView ? undefined : setTrayAllOperators}
          priorityTabs={isOperatorView ? ["overdue", "review"] : ["reassign", "unassigned"]}
          hint={viewMode === "calendar"
            ? "Trascina una scheda su un giorno per assegnarle l'orario."
            : "Trascina una scheda su un operatore/cella per assegnarla."}
        />
      </div>

      <WorkloadTeamModal
        open={teamModalOpen}
        onClose={() => setTeamModalOpen(false)}
        companyId={selectedCompanyId!}
        canManage={canManageProfiles}
      />

      <SwapConfirmModal
        open={swapConfirm != null}
        preview={swapConfirm?.preview ?? null}
        submitting={swapConfirmSubmitting}
        onConfirm={(dontShowAgain) => { void confirmSwap(dontShowAgain); }}
        onCancel={cancelSwap}
      />

      <Modal
        open={calendarConflictsModalOpen}
        onClose={() => {
          setCalendarConflictsModalOpen(false);
          setConflictsModalTab("conflitti");
        }}
        title={conflictsModalTab === "conflitti" ? "Conflitti rilevati" : "Task arretrate"}
        description={
          conflictsModalTab === "conflitti"
            ? "Elenco dei problemi individuati nel giorno selezionato."
            : "Attività in ritardo per l'operatore selezionato (ultimi 7 giorni)."
        }
        size="lg"
        footer={
          <Button
            variant="primary"
            onClick={() => {
              setCalendarConflictsModalOpen(false);
              setConflictsModalTab("conflitti");
            }}
          >
            Chiudi
          </Button>
        }
      >
        <div className="mb-3 flex items-center gap-1 border-b border-line dark:border-line-dark">
          <button
            type="button"
            onClick={() => setConflictsModalTab("conflitti")}
            className={`-mb-px border-b-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
              conflictsModalTab === "conflitti"
                ? "border-ink text-ink dark:border-paper dark:text-paper"
                : "border-transparent text-muted hover:text-ink dark:text-muted-dark dark:hover:text-paper"
            }`}
          >
            Conflitti ({(calendarData?.conflicts ?? []).length})
          </button>
          <button
            type="button"
            onClick={() => setConflictsModalTab("arretrate")}
            className={`-mb-px border-b-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
              conflictsModalTab === "arretrate"
                ? "border-ink text-ink dark:border-paper dark:text-paper"
                : "border-transparent text-muted hover:text-ink dark:text-muted-dark dark:hover:text-paper"
            }`}
          >
            Arretrate ({overdueData?.total_tasks_count ?? 0})
          </button>
        </div>

        {conflictsModalTab === "conflitti" && (
        <div className="flex flex-col gap-3">
          {(calendarData?.conflicts ?? []).length === 0 ? (
            <div className="rounded-md border border-dashed border-line px-3 py-6 text-center text-sm text-muted dark:border-line-dark dark:text-muted-dark">
              Nessun conflitto rilevato.
            </div>
          ) : (
            (calendarData?.conflicts ?? []).map((conflict, index) => {
              const primaryTaskId = conflict.work_item_ids[0] ?? conflict.tasks[0]?.id ?? null;
              const primaryTask = primaryTaskId != null
                ? conflict.tasks.find((task) => task.id === primaryTaskId) ??
                  calendarData?.timeline.find((item) => item.kind === "task" && item.work_item_id === primaryTaskId)?.task ??
                  calendarData?.over_capacity?.tasks.find((task) => task.work_item_id === primaryTaskId)?.task ??
                  null
                : null;
              const canReschedule = primaryTaskId != null && conflict.conflict_type !== "severe_delay" && !!primaryTask?.deadline_date;
              return (
                <div
                  key={`${conflict.conflict_type}-${index}`}
                  className={`rounded-md border px-3 py-2 ${calendarConflictClass(conflict)}`}
                >
                  <div className="flex items-start gap-2">
                    <Icon name={calendarConflictIcon(conflict)} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold uppercase tracking-wider">{conflict.title}</div>
                      <p className="mt-1 text-[12px] leading-5 text-ink dark:text-paper">{conflict.message}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted dark:text-muted-dark">
                        {conflict.start_time && conflict.end_time && <span>{conflict.start_time} - {conflict.end_time}</span>}
                        {conflict.overlap_minutes != null && <span>{conflict.overlap_minutes} min sovrapposti</span>}
                        {conflict.overload_hours != null && <span>{formatHours(conflict.overload_hours)} oltre capacità</span>}
                        {conflict.effective_load_hours != null && <span>{formatHours(conflict.effective_load_hours)} workload</span>}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      {primaryTaskId != null && (
                        <button
                          type="button"
                          className="rounded border border-line bg-paper px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-ink hover:bg-cream dark:border-line-dark dark:bg-ink-2 dark:text-paper dark:hover:bg-ink-soft"
                          onClick={() => void openEditWorkItemModal(primaryTaskId)}
                        >
                          Apri
                        </button>
                      )}
                      {canReschedule && (
                        <button
                          type="button"
                          className="rounded border border-warning/35 bg-warning/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-warning hover:bg-warning/15 disabled:opacity-50"
                          disabled={reschedulingTaskId === primaryTaskId}
                          onClick={() => void rescheduleTaskToNextAvailable(primaryTaskId)}
                        >
                          {reschedulingTaskId === primaryTaskId ? "..." : "Riprogramma"}
                        </button>
                      )}
                      {primaryTaskId != null && conflict.conflict_type !== "severe_delay" && !primaryTask?.deadline_date && (
                        <span className="rounded border border-line px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted dark:border-line-dark dark:text-muted-dark" title="Serve una scadenza per riprogrammare automaticamente">
                          No scadenza
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
        )}

        {conflictsModalTab === "arretrate" && (
        <div className="flex flex-col gap-3">
          {!calendarOperatorId ? (
            <div className="rounded-md border border-dashed border-line px-3 py-6 text-center text-sm text-muted dark:border-line-dark dark:text-muted-dark">
              Seleziona un operatore per vedere le task arretrate.
            </div>
          ) : overdueLoading ? (
            <div className="flex items-center justify-center px-3 py-6">
              <Spinner />
            </div>
          ) : overdueError ? (
            <div className="rounded-md border border-danger/35 bg-danger/10 px-3 py-3 text-sm text-danger">
              {overdueError}
            </div>
          ) : (overdueData?.tasks ?? []).length === 0 ? (
            <div className="rounded-md border border-dashed border-line px-3 py-6 text-center text-sm text-muted dark:border-line-dark dark:text-muted-dark">
              Nessuna task arretrata.
            </div>
          ) : (
            (overdueData?.tasks ?? []).map((item) => {
              const isSevere = item.is_severe_delay || item.delay_code === "non_deferrable_overdue";
              const cardClass = isSevere
                ? "border-danger/35 bg-danger/10 text-danger"
                : "border-warning/35 bg-warning/10 text-warning";
              return (
                <div
                  key={item.work_item_id}
                  className={`rounded-md border px-3 py-2 ${cardClass}`}
                >
                  <div className="flex items-start gap-2">
                    <Icon name="alert-triangle" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider">{item.title}</span>
                        {item.is_deadline_locked && (
                          <span className="rounded border border-danger/40 bg-danger/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-danger">
                            Non derogabile
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted dark:text-muted-dark">
                        {item.days_overdue > 0 && <span>{item.days_overdue} gg di ritardo</span>}
                        {item.deadline_date && <span>Scadenza {item.deadline_date}</span>}
                        {item.work_date && <span>Pianificata {item.work_date}</span>}
                        <span>{formatHours(item.effective_load_hours)} workload</span>
                        {item.client_name && <span>{item.client_name}</span>}
                      </div>
                      {item.work_areas.length > 0 && (
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          {item.work_areas.map((area) => (
                            <span
                              key={area.id}
                              className="inline-flex items-center gap-1 rounded border border-line px-1.5 py-0.5 text-[9px] font-medium text-muted dark:border-line-dark dark:text-muted-dark"
                            >
                              {area.icon && <span>{area.icon}</span>}
                              {area.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      <button
                        type="button"
                        className="rounded border border-line bg-paper px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-ink hover:bg-cream dark:border-line-dark dark:bg-ink-2 dark:text-paper dark:hover:bg-ink-soft"
                        onClick={() => void openEditWorkItemModal(item.work_item_id)}
                      >
                        Apri
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
        )}
      </Modal>

      <WorkItemFormModal
        open={newWorkModalOpen}
        onClose={() => { setNewWorkModalOpen(false); setQuickAdd(null); setEditingItem(null); }}
        editingItem={editingItem}
        companyId={selectedCompanyId!}
        isAdmin={!!permissions?.is_admin}
        defaultWorkDate={quickAdd?.day ?? selectedDay ?? getTodayDate()}
        defaultStartTime={quickAdd?.startTime}
        defaultEstimatedHours={quickAdd?.estimatedHours}
        defaultAssigneeIds={quickAdd ? [quickAdd.userId] : undefined}
        onOverlapConflict={(message, conflicts, suggestedSlots, onPickSlot) => {
          // Una nuova risposta 409 (anche dopo un retry fallito) azzera lo stato di loading.
          setConflictRetrySlot(null);
          setCalendarConflictModal({
            message,
            conflicts,
            suggestedSlots,
            requestedDate: quickAdd?.day ?? selectedDay ?? null,
            onPickSlot: (slot) => {
              setConflictRetrySlot(`${slot.date}T${slot.start_time}`);
              onPickSlot(slot);
            },
          });
        }}
        onSaved={() => { setCalendarConflictModal(null); setConflictRetrySlot(null); setQuickAdd(null); setEditingItem(null); void loadMain(); void reloadCalendar(); setMultiReloadToken((t) => t + 1); }}
      />

      {/* Reso dopo il form così, nel flusso di creazione in conflitto, resta in primo piano (stessa z dei Modal). */}
      <TaskConflictModal
        open={!!calendarConflictModal}
        message={calendarConflictModal?.message ?? ""}
        conflicts={calendarConflictModal?.conflicts ?? []}
        suggestedSlots={calendarConflictModal?.suggestedSlots ?? []}
        requestedDate={calendarConflictModal?.requestedDate ?? null}
        retryingSlotKey={conflictRetrySlot}
        onPickSlot={calendarConflictModal?.onPickSlot}
        onOpenTask={(workItemId) => void openEditWorkItemModal(workItemId)}
        onClose={() => { setCalendarConflictModal(null); setConflictRetrySlot(null); }}
      />



    </div>
  );
}