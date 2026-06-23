import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { getUsersApi, type User } from "../api/users";
import { listRolesApi, type Role } from "../api/roles";
import {
  getWorkItemApi,
  isWorkItemOverlapApiError,
  moveWorkItemApi,
  rescheduleNextAvailableWorkItemApi,
  updateWorkItemApi,
  type MoveWorkItemPayload,
  type WorkItem,
  type WorkItemOverlapConflict,
  type WorkItemScheduleState,
} from "../api/workItems";
import { getCompanyApi } from "../api/companies";
import { WorkItemFormModal } from "../components/work-items/WorkItemFormModal";
import { WorkloadTeamModal } from "../components/workload/WorkloadTeamModal";
import { MultiOperatorCalendar, type MultiOperatorMeta } from "../components/workload/MultiOperatorCalendar";
import { WorkloadCalendar, type WorkloadCalendarDensity } from "../components/workload/WorkloadCalendar";
import { WorkloadMonthGrid } from "../components/workload/WorkloadMonthGrid";
import {
  getWorkloadUserCalendarDayApi,
  listWorkloadUsersApi,
  listWorkloadUsersGroupedByAreaAndDayApi,
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
import { Badge } from "../components/ui/Badge";
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
  return `${value.toFixed(1)}h`;
}

function taskEffectiveHours(task: Pick<WorkloadTaskSummary, "affects_daily_load" | "effective_load_hours" | "estimated_hours">): number {
  if (!task.affects_daily_load) return 0;
  if (typeof task.effective_load_hours === "number") return task.effective_load_hours;
  return task.estimated_hours ?? 0;
}

function taskHoursLabel(task: Pick<WorkloadTaskSummary, "affects_daily_load" | "effective_load_hours" | "estimated_hours">): string {
  const effective = taskEffectiveHours(task);
  if (task.estimated_hours == null) return `${formatHours(effective)} eff`;
  return `${formatHours(effective)} eff · ${formatHours(task.estimated_hours)} st`;
}

function statusBadgeVariant(status: WorkloadComputedStatus) {
  if (status === "overload") return "danger" as const;
  if (status === "warning") return "warning" as const;
  if (status === "ok" || status === "active") return "success" as const;
  if (status === "empty") return "default" as const;
  return "info" as const;
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

function heatClass(status: WorkloadComputedStatus) {
  if (status === "overload") return "bg-danger/20 border-danger/30";
  if (status === "warning") return "bg-warning/20 border-warning/30";
  if (status === "ok" || status === "active") return "bg-success/20 border-success/30";
  if (status === "empty") return "bg-line dark:bg-line-dark border-line dark:border-line-dark";
  return "bg-info/20 border-info/30";
}

function heatmapLoadClass(utilizationPercent: number, status: WorkloadComputedStatus) {
  if (status === "empty" || utilizationPercent <= 0) return "bg-line dark:bg-line-dark border-line dark:border-line-dark";
  if (utilizationPercent >= 100) return "bg-danger/20 border-danger/30";
  if (utilizationPercent >= 80) return "bg-warning/20 border-warning/30";
  return "bg-success/20 border-success/30";
}

function getTaskDay(task: WorkloadTaskSummary): string {
  return (task.work_date ?? "").slice(0, 10);
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
  const { user, permissions } = useAuth();
  const { selectedCompanyId } = useSelectedCompanyId(user?.company_id ?? null);
  const toastRef = useRef(toast);

  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const [rangeMode, setRangeMode] = useState<RangeMode>("week");
  const [calendarDensity, setCalendarDensity] = useState<WorkloadCalendarDensity>("comfortable");
  const [anchorDate, setAnchorDate] = useState(getTodayDate());
  const [weekOffset, setWeekOffset] = useState(0);
  const [customFromDate, setCustomFromDate] = useState(getTodayDate());
  const [customToDate, setCustomToDate] = useState(getTodayDate());

  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "load" | "utilization" | "tasks">("load");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [viewMode, setViewMode] = useState<ViewMode>("accordion");
  const [selectedDay, setSelectedDay] = useState(getTodayDate());

  const [summary, setSummary] = useState<WorkloadUserSummary[]>([]);
  const [heatmap, setHeatmap] = useState<WorkloadGroupedByAreaAndDayResponse | null>(null);
  const [companyUsers, setCompanyUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [expandedAreas, setExpandedAreas] = useState<Record<string, boolean>>({});
  const [expandedUsers, setExpandedUsers] = useState<Record<number, boolean>>({});

  const [teamModalOpen, setTeamModalOpen] = useState(false);

  const [newWorkModalOpen, setNewWorkModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<WorkItem | null>(null);
  const [quickAdd, setQuickAdd] = useState<{ day: string; userId: number; startTime?: string; estimatedHours?: number } | null>(null);
  const [openingEditTaskId, setOpeningEditTaskId] = useState<number | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<number | null>(null);
  const [dragSourceAssigneeId, setDragSourceAssigneeId] = useState<number | null | undefined>(undefined);
  const [movingTaskId, setMovingTaskId] = useState<number | null>(null);
  const [activeDropTarget, setActiveDropTarget] = useState<string | null>(null);
  const [hotDropTarget, setHotDropTarget] = useState<string | null>(null);
  const moveInFlightRef = useRef(false);
  const completeScrollRef = useRef<HTMLDivElement | null>(null);
  const dropHoverRef = useRef<{ key: string | null; sinceMs: number }>({ key: null, sinceMs: 0 });
  const calendarScrollRef = useRef<HTMLDivElement | null>(null);
  const calendarInitialScrollKeyRef = useRef<string | null>(null);
  const [unassignedOpen, setUnassignedOpen] = useState(false);
  // Operatori selezionati nel calendario: 1 → vista singola (com'era), >1 → colonne affiancate.
  const [calendarOperatorIds, setCalendarOperatorIds] = useState<number[]>([]);
  const calendarOperatorId = calendarOperatorIds[0] ?? null; // operatore primario (vista singola)
  // Bump per forzare il refetch del calendario multi-operatore dopo modifiche esterne (es. nuova task).
  const [multiReloadToken, setMultiReloadToken] = useState(0);
  const [calendarData, setCalendarData] = useState<WorkloadUserCalendarDayResponse | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [, setCalendarDropPreviewMinutes] = useState<number | null>(null);
  const [, setCalendarCreatePreview] = useState<CalendarCreatePreview | null>(null);
  const [, setCalendarResizeState] = useState<CalendarResizeState | null>(null);
  const [, setCalendarTaskUiState] = useState<Record<number, "saving" | "exiting">>({});
  const [calendarConflictModal, setCalendarConflictModal] = useState<{ message: string; conflicts: WorkItemOverlapConflict[] } | null>(null);
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

  const visibleDays = useMemo(() => getVisibleDays(rangeMode, anchorDate, weekOffset), [anchorDate, rangeMode, weekOffset]);
  const calendarOperators = useMemo(() => extractCalendarOperators(heatmap), [heatmap]);
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
    const hasCompanyHours = openingMinutes != null && closingMinutes != null && closingMinutes > openingMinutes;
    const rawStartMinutes = hasCompanyHours ? Math.max(0, openingMinutes - 60) : 0;
    const rawEndMinutes = hasCompanyHours ? Math.min(24 * 60, closingMinutes + 60) : 24 * 60;
    // Allinea sempre la griglia a orari "tondi" (08:00, 09:00, ...)
    const dayStartMinutes = Math.floor(rawStartMinutes / 60) * 60;
    const dayEndMinutes = Math.min(24 * 60, Math.ceil(rawEndMinutes / 60) * 60);
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
      if (user?.id != null && (calendarOperatorIds.length !== 1 || calendarOperatorIds[0] !== user.id)) {
        setCalendarOperatorIds([user.id]);
      }
      return;
    }

    if (calendarOperators.length === 0) {
      if (calendarOperatorIds.length > 0) setCalendarOperatorIds([]);
      setCalendarData(null);
      return;
    }

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

      const groups = heatmapData?.groups || [];
      if (groups.length > 0) {
        const nextExpanded: Record<string, boolean> = {};
        groups.forEach((group, index) => {
          const key = String(group.area_id ?? `none-${index}`);
          nextExpanded[key] = index === 0;
        });
        setExpandedAreas(nextExpanded);
      }
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
      setOpeningEditTaskId(workItemId);
      const item = await getWorkItemApi(workItemId);
      setQuickAdd(null);
      setEditingItem(item);
      setNewWorkModalOpen(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Impossibile aprire la lavorazione";
      toast.error(message);
    } finally {
      setOpeningEditTaskId(null);
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

  const handleOverlapApiError = useCallback((err: unknown, fallbackMessage: string) => {
    if (isWorkItemOverlapApiError(err)) {
      setCalendarConflictModal({ message: err.backendMessage, conflicts: err.conflicts });
      toast.error(err.backendMessage);
      return true;
    }
    toast.error(err instanceof Error ? err.message : fallbackMessage);
    return false;
  }, [toast]);

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
      handleOverlapApiError(err, "Impossibile riprogrammare la task");
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
    } catch (err) {
      await reloadCalendar();
      handleOverlapApiError(err, "Impossibile spostare la task");
    } finally {
      moveInFlightRef.current = false;
      setMovingTaskId(null);
    }
  }, [calendarOperatorId, loadMain, reloadCalendar, handleOverlapApiError]);

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
    } catch (err) {
      setCalendarData(previousCalendarData);
      await reloadCalendar();
      handleOverlapApiError(err, "Impossibile spostare la task");
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

    return (
      <div
        className="wl-acc-list"
        onDragOverCapture={(event) => {
          if (draggingTaskId == null) return;
          event.preventDefault();
          const hit = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
          const lane = hit?.closest<HTMLElement>("[data-acc-drop-key]");
          const key = lane?.dataset.accDropKey ?? null;
          if (activeDropTarget !== key) setActiveDropTarget(key);
        }}
      >
        {summary.map((item) => {
          const isOpen = !!expandedUsers[item.user_id];
          const isOperatorDropTarget = activeDropTarget === `acc-user-${item.user_id}`;
          const tasks = sortTasksByStartTime((item.tasks || []).filter((task) => getTaskDay(task) === selectedDay));
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
              className={`wl-acc-lane${isOpen ? " is-expanded" : ""} ${
                isOperatorDropTarget
                  ? "!border-amber-500 !border-2"
                  : ""
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
                    <span className="wl-acc-lane__bar-label">{formatHours(item.occupied_capacity_hours)} / {formatHours(item.capacity_hours_in_range)} · {item.assigned_tasks_count} task</span>
                    <span className={`wl-acc-load ${loadClass(item.workload_status)}`}>{item.utilization_percent.toFixed(0)}%</span>
                  </div>
                  <div className="wl-acc-bar-track">
                    <div className={`wl-acc-bar ${barClass(item.workload_status)}`} style={{ width: `${fillPct}%` }} />
                  </div>
                </div>

                {/* Badge */}
                <div className="wl-acc-lane__badge">
                  <Badge variant={statusBadgeVariant(item.workload_status)}>{statusLabel(item.workload_status)}</Badge>
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
                <div className="px-0 pb-0 pt-3 mt-3 border-t border-line/70 dark:border-line-dark">
                  <div className="text-[11px] uppercase tracking-wider font-semibold text-muted dark:text-muted-dark mb-2">
                    Task del giorno {dateFromIso(selectedDay).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" })}
                  </div>
                  {tasks.length === 0 ? (
                    <div className="rounded-md border border-dashed border-line dark:border-line-dark px-3 py-3 text-xs text-muted dark:text-muted-dark">
                      Nessuna task su questo giorno.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {tasks.map((task) => (
                        <button
                          key={task.work_item_id}
                          type="button"
                          draggable
                          onDragStart={(event) => onTaskDragStart(event, task.work_item_id, item.user_id)}
                          onDragEnd={onTaskDragEnd}
                          onClick={() => void openEditWorkItemModal(task.work_item_id)}
                          className={`w-full text-left rounded-md border border-line dark:border-line-dark bg-cream/40 dark:bg-ink-2 px-3 py-2 hover:border-ink/30 dark:hover:border-paper/30 transition-colors cursor-grab active:cursor-grabbing ${draggingTaskId === task.work_item_id ? "opacity-60" : ""}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-semibold text-ink dark:text-paper">{task.title}</div>
                            <div className="text-xs font-semibold text-muted dark:text-muted-dark">{taskHoursLabel(task)}</div>
                          </div>
                          {formatTaskStartTime(task.start_time) && (
                            <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
                              {formatTaskStartTime(task.start_time)}
                            </div>
                          )}
                          <div className="mt-1 text-xs text-muted dark:text-muted-dark">
                            {task.client_name || "Senza cliente"} · {task.status}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {/* Unassigned tasks section */}
        {hasUnassigned && (() => {
          const unassigned = heatmap!.unassigned_tasks;
          const isUnassignedDropTarget = activeDropTarget === "acc-unassigned";
          const tasksForDay = unassigned.tasks.filter((t) => (t.work_date ?? "").slice(0, 10) === selectedDay);
          return (
            <div
              data-acc-drop-key="acc-unassigned"
              className={`wl-acc-lane${unassignedOpen ? " is-expanded" : ""} ${isUnassignedDropTarget ? "!border-amber-500 !border-2" : ""}`}
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
                  <div className="wl-acc-avatar" style={{ background: "#f59e0b", color: "#fff", fontWeight: 700 }}>!</div>
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
                    <div className="wl-acc-bar wl-acc-bar--warning" style={{ width: "100%" }} />
                  </div>
                </div>
                <div className="wl-acc-lane__badge">
                  <Badge variant="warning">{unassigned.total_tasks_count}</Badge>
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
                <div className="px-0 pb-0 pt-3 mt-3 border-t border-line/70 dark:border-line-dark">
                  <div className="text-[11px] uppercase tracking-wider font-semibold text-muted dark:text-muted-dark mb-2">
                    Task del giorno {dateFromIso(selectedDay).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" })}
                  </div>
                  {tasksForDay.length === 0 ? (
                    <div className="rounded-md border border-dashed border-line dark:border-line-dark px-3 py-3 text-xs text-muted dark:text-muted-dark">
                      Nessuna task non assegnata su questo giorno.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {sortTasksByStartTime(tasksForDay).map((task) => (
                        <button
                          key={task.work_item_id}
                          type="button"
                          draggable
                          onDragStart={(event) => onTaskDragStart(event, task.work_item_id, null)}
                          onDragEnd={onTaskDragEnd}
                          onClick={() => void openEditWorkItemModal(task.work_item_id)}
                          className={`w-full text-left rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 hover:border-amber-500 dark:hover:border-amber-500 transition-colors cursor-grab active:cursor-grabbing ${draggingTaskId === task.work_item_id ? "opacity-60" : ""}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-semibold text-ink dark:text-paper">{task.title}</div>
                            <div className="text-xs font-semibold text-muted dark:text-muted-dark">{taskHoursLabel(task)}</div>
                          </div>
                          {formatTaskStartTime(task.start_time) && (
                            <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
                              {formatTaskStartTime(task.start_time)}
                            </div>
                          )}
                          <div className="mt-1 text-xs text-muted dark:text-muted-dark">
                            {task.client_name || "Senza cliente"} · {task.status}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}
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

    return (
      <div className="rounded-md border border-line dark:border-line-dark overflow-hidden">
        <div
          ref={completeScrollRef}
          className="overflow-x-auto"
          onDragOver={(event) => autoScrollCompleteCalendar(event.clientX)}
          onDrop={() => {
            setActiveDropTarget(null);
            setHotDropTarget(null);
            dropHoverRef.current = { key: null, sinceMs: 0 };
          }}
        >
          <table className="min-w-full text-[12px] border-collapse">
            <thead>
              <tr className="border-b-2 border-line dark:border-line-dark bg-cream/80 dark:bg-ink-2">
                <th className="sticky left-0 z-[2] bg-cream/80 dark:bg-ink-2 px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted dark:text-muted-dark w-[140px] max-w-[140px] border-r border-line dark:border-line-dark">
                  Operatore
                </th>
                {heatmap.days.map((day) => {
                  const chip = formatDayChip(day);
                  const isToday = day === today;
                  return (
                    <th
                      key={day}
                      className={`px-1.5 py-2 text-center min-w-[80px] border-r border-line/40 dark:border-line-dark/40 last:border-r-0 ${
                        isToday ? "bg-ink/5 dark:bg-paper/10" : ""
                      }`}
                    >
                      <div className="text-[10px] uppercase tracking-wider text-muted dark:text-muted-dark">{chip.weekday}</div>
                      <div className={`font-bold text-[14px] leading-none mt-0.5 ${
                        isToday ? "text-ink dark:text-paper" : "text-muted dark:text-muted-dark"
                      }`}>{chip.day}</div>
                      <div className="text-[10px] text-muted/60 dark:text-muted-dark/60 mt-0.5">{chip.month}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {/* Unassigned tasks with NO area – global top row */}
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
                  <>
                    <tr className="bg-amber-50/80 dark:bg-amber-900/10">
                      <td className="sticky left-0 z-[2] px-4 py-2 border-b border-r border-amber-200 dark:border-amber-800 w-[140px] max-w-[140px]">
                        <div className="flex items-center gap-1.5">
                          <Icon name="alert-triangle" className="w-3 h-3 text-amber-500 flex-shrink-0" />
                          <span className="font-bold text-[11px] uppercase tracking-wider text-amber-600 dark:text-amber-400">Da distribuire</span>
                          <span className="inline-flex items-center rounded-full border border-amber-300 dark:border-amber-700 px-1 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">{noAreaTasks.length}</span>
                        </div>
                      </td>
                      <td colSpan={heatmap.days.length} className="border-b border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10" />
                    </tr>
                    <tr className="border-b border-amber-200/60 dark:border-amber-800/60 align-top">
                      <td
                        className={`sticky left-0 z-[1] bg-paper dark:bg-ink-soft px-3 py-2 border-r border-line dark:border-line-dark align-top w-[140px] max-w-[140px] ${activeDropTarget === "complete-no-area" ? "ring-1 ring-amber-400/60" : ""}`}
                        onDragOver={(event) => event.preventDefault()}
                        onDragEnter={() => setActiveDropTarget("complete-no-area")}
                        onDragLeave={() => setActiveDropTarget((current) => (current === "complete-no-area" ? null : current))}
                        onDrop={(event) => void moveTaskByDrop(event, { work_area_ids: [] }, "complete-no-area")}
                      >
                        <div className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">Senza area</div>
                      </td>
                      {heatmap.days.map((day) => {
                        const tasks = tasksByDay.get(day) ?? [];
                        const isToday = day === today;
                        if (tasks.length === 0) {
                          return (
                            <td
                              key={day}
                              className={`px-1 py-1.5 border-r border-line/30 dark:border-line-dark/30 last:border-r-0 ${isToday ? "bg-ink/5 dark:bg-paper/5" : ""} ${activeDropTarget === `complete-no-area-${day}` ? "bg-amber-50/70 dark:bg-amber-900/20 ring-1 ring-inset ring-amber-400/70" : ""} ${hotDropTarget === `complete-no-area-${day}` ? "bg-amber-100/70 dark:bg-amber-900/35 ring-2 ring-inset ring-amber-500" : ""}`}
                              onDragOver={(event) => onCompleteDropHover(event, `complete-no-area-${day}`)}
                              onDrop={(event) => void moveTaskByDrop(event, { work_area_ids: [], work_date: day }, `complete-no-area-${day}`)}
                            >
                              <div className="h-10" />
                            </td>
                          );
                        }
                        return (
                          <td
                            key={day}
                            className={`px-1 py-1.5 border-r border-line/30 dark:border-line-dark/30 last:border-r-0 align-top ${isToday ? "bg-ink/5 dark:bg-paper/5" : ""} ${activeDropTarget === `complete-no-area-${day}` ? "bg-amber-50/70 dark:bg-amber-900/20 ring-1 ring-inset ring-amber-400/70" : ""} ${hotDropTarget === `complete-no-area-${day}` ? "bg-amber-100/70 dark:bg-amber-900/35 ring-2 ring-inset ring-amber-500" : ""}`}
                            onDragOver={(event) => onCompleteDropHover(event, `complete-no-area-${day}`)}
                            onDrop={(event) => void moveTaskByDrop(event, { work_area_ids: [], work_date: day }, `complete-no-area-${day}`)}
                          >
                            <div className="space-y-1 min-w-[72px]">
                              {tasks.map((task) => (
                                <button
                                  key={task.work_item_id}
                                  type="button"
                                  draggable
                                  onDragStart={(event) => onTaskDragStart(event, task.work_item_id)}
                                  onDragEnd={onTaskDragEnd}
                                  onClick={() => void openEditWorkItemModal(task.work_item_id)}
                                  className={`w-full text-left rounded border border-amber-300 dark:border-amber-700 bg-amber-50/80 dark:bg-amber-900/20 px-1.5 py-1 hover:border-amber-500 dark:hover:border-amber-500 transition-colors cursor-grab active:cursor-grabbing ${draggingTaskId === task.work_item_id ? "opacity-60" : ""}`}
                                >
                                  <div className="text-[11px] font-semibold text-ink dark:text-paper leading-snug truncate" title={task.title}>{task.title}</div>
                                  <div className="text-[10px] text-muted dark:text-muted-dark">{taskHoursLabel(task)}</div>
                                </button>
                              ))}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  </>
                );
              })()}
              {heatmap.groups.map((group, gIndex) => {
                const areaKey = String(group.area_id ?? `none-${gIndex}`);
                // Collect unassigned tasks for this area
                const areaUnassigned = heatmap.unassigned_tasks.tasks.filter(
                  (t) => t.work_areas && t.work_areas.some((a) => a.id === group.area_id)
                );
                const areaUnassignedByDay = new Map<string, typeof areaUnassigned>();
                areaUnassigned.forEach((t) => {
                  const d = (t.work_date ?? "").slice(0, 10);
                  if (!areaUnassignedByDay.has(d)) areaUnassignedByDay.set(d, []);
                  areaUnassignedByDay.get(d)!.push(t);
                });
                return (
                  <>
                    {/* Area header row */}
                    <tr key={`area-${areaKey}`}>
                      {/* Sticky label cell */}
                      <td
                        className={`sticky left-0 z-[2] px-4 py-2 border-b border-r border-line dark:border-line-dark w-[140px] max-w-[140px] ${activeDropTarget === `complete-area-${areaKey}` ? "ring-1 ring-ink/25 dark:ring-paper/25" : ""}`}
                        style={group.area_color ? { backgroundColor: group.area_color + "22" } : undefined}
                        onDragOver={(event) => event.preventDefault()}
                        onDragEnter={() => setActiveDropTarget(`complete-area-${areaKey}`)}
                        onDragLeave={() => setActiveDropTarget((current) => (current === `complete-area-${areaKey}` ? null : current))}
                        onDrop={(event) => void moveTaskByDrop(event, group.area_id != null ? { work_area_id: group.area_id } : { work_area_ids: [] }, `complete-area-${areaKey}`)}
                      >
                        <div className="flex items-center gap-2">
                          {group.area_color && (
                            <span
                              className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: group.area_color }}
                            />
                          )}
                          {group.area_icon ? (
                            <span className="text-sm leading-none">{group.area_icon}</span>
                          ) : (
                            <Icon name="target" className="w-3.5 h-3.5 text-muted dark:text-muted-dark flex-shrink-0" />
                          )}
                          <span
                            className="font-bold text-[11px] uppercase tracking-wider"
                            style={group.area_color ? { color: group.area_color } : undefined}
                          >
                            {group.area_name || "Non assegnato"}
                          </span>
                          <span className="ml-1 inline-flex items-center rounded-full border border-line dark:border-line-dark px-1.5 py-0.5 text-[10px] font-semibold text-muted dark:text-muted-dark">
                            {group.users.length}
                          </span>
                        </div>
                      </td>
                      {/* Colored fill for the rest of the row */}
                      <td
                        colSpan={heatmap.days.length}
                        className={`border-b border-line dark:border-line-dark ${activeDropTarget === `complete-area-${areaKey}-fill` ? "ring-1 ring-ink/25 dark:ring-paper/25" : ""}`}
                        style={group.area_color ? { backgroundColor: group.area_color + "22" } : { backgroundColor: "var(--color-cream, #f8f5f0)" }}
                        onDragOver={(event) => event.preventDefault()}
                        onDragEnter={() => setActiveDropTarget(`complete-area-${areaKey}-fill`)}
                        onDragLeave={() => setActiveDropTarget((current) => (current === `complete-area-${areaKey}-fill` ? null : current))}
                        onDrop={(event) => void moveTaskByDrop(event, group.area_id != null ? { work_area_id: group.area_id } : { work_area_ids: [] }, `complete-area-${areaKey}-fill`)}
                      />
                    </tr>
                    {/* Unassigned tasks for this area – first row after header */}
                    {areaUnassigned.length > 0 && (
                      <tr className="border-b border-amber-200/60 dark:border-amber-800/60 align-top">
                        <td
                          className={`sticky left-0 z-[1] bg-paper dark:bg-ink-soft px-3 py-2 border-r border-line dark:border-line-dark align-top w-[140px] max-w-[140px] ${activeDropTarget === `complete-area-unassigned-${areaKey}` ? "ring-1 ring-amber-400/60" : ""}`}
                          onDragOver={(event) => event.preventDefault()}
                          onDragEnter={() => setActiveDropTarget(`complete-area-unassigned-${areaKey}`)}
                          onDragLeave={() => setActiveDropTarget((current) => (current === `complete-area-unassigned-${areaKey}` ? null : current))}
                          onDrop={(event) => void moveTaskByDrop(event, group.area_id != null ? { assignee_ids: [], work_area_id: group.area_id } : { assignee_ids: [], work_area_ids: [] }, `complete-area-unassigned-${areaKey}`)}
                        >
                          <div className="flex items-center gap-1.5">
                            <Icon name="alert-triangle" className="w-3 h-3 text-amber-500 flex-shrink-0" />
                            <div>
                              <div className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">Da distribuire</div>
                              <div className="text-[10px] text-muted dark:text-muted-dark">{areaUnassigned.length} task</div>
                            </div>
                          </div>
                        </td>
                        {heatmap.days.map((day) => {
                          const tasks = sortTasksByStartTime(areaUnassignedByDay.get(day) ?? []);
                          const isToday = day === today;
                          if (tasks.length === 0) {
                            return (
                              <td
                                key={day}
                                className={`px-1 py-1.5 border-r border-line/30 dark:border-line-dark/30 last:border-r-0 ${isToday ? "bg-ink/5 dark:bg-paper/5" : ""} ${activeDropTarget === `complete-area-unassigned-${areaKey}-${day}` ? "bg-amber-50/70 dark:bg-amber-900/20 ring-1 ring-inset ring-amber-400/70" : ""} ${hotDropTarget === `complete-area-unassigned-${areaKey}-${day}` ? "bg-amber-100/70 dark:bg-amber-900/35 ring-2 ring-inset ring-amber-500" : ""}`}
                                onDragOver={(event) => onCompleteDropHover(event, `complete-area-unassigned-${areaKey}-${day}`)}
                                onDrop={(event) => void moveTaskByDrop(event, group.area_id != null ? { assignee_ids: [], work_area_id: group.area_id, work_date: day } : { assignee_ids: [], work_area_ids: [], work_date: day }, `complete-area-unassigned-${areaKey}-${day}`)}
                              >
                                <div className="h-10" />
                              </td>
                            );
                          }
                          return (
                            <td
                              key={day}
                              className={`px-1 py-1.5 border-r border-line/30 dark:border-line-dark/30 last:border-r-0 align-top ${isToday ? "bg-ink/5 dark:bg-paper/5" : ""} ${activeDropTarget === `complete-area-unassigned-${areaKey}-${day}` ? "bg-amber-50/70 dark:bg-amber-900/20 ring-1 ring-inset ring-amber-400/70" : ""} ${hotDropTarget === `complete-area-unassigned-${areaKey}-${day}` ? "bg-amber-100/70 dark:bg-amber-900/35 ring-2 ring-inset ring-amber-500" : ""}`}
                              onDragOver={(event) => onCompleteDropHover(event, `complete-area-unassigned-${areaKey}-${day}`)}
                              onDrop={(event) => void moveTaskByDrop(event, group.area_id != null ? { assignee_ids: [], work_area_id: group.area_id, work_date: day } : { assignee_ids: [], work_area_ids: [], work_date: day }, `complete-area-unassigned-${areaKey}-${day}`)}
                            >
                              <div className="space-y-1 min-w-[72px]">
                                {tasks.map((task) => (
                                  <button
                                    key={task.work_item_id}
                                    type="button"
                                    draggable
                                    onDragStart={(event) => onTaskDragStart(event, task.work_item_id)}
                                    onDragEnd={onTaskDragEnd}
                                    onClick={() => void openEditWorkItemModal(task.work_item_id)}
                                    className={`w-full text-left rounded border border-amber-300 dark:border-amber-700 bg-amber-50/80 dark:bg-amber-900/20 px-1.5 py-1 hover:border-amber-500 dark:hover:border-amber-500 transition-colors cursor-grab active:cursor-grabbing ${draggingTaskId === task.work_item_id ? "opacity-60" : ""}`}
                                  >
                                    <div className="text-[11px] font-semibold text-ink dark:text-paper leading-snug truncate" title={task.title}>{task.title}</div>
                                    {formatTaskStartTime(task.start_time) && (
                                      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
                                        {formatTaskStartTime(task.start_time)}
                                      </div>
                                    )}
                                    <div className="text-[10px] text-muted dark:text-muted-dark">{taskHoursLabel(task)}</div>
                                  </button>
                                ))}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    )}
                    {/* Operator rows */}
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
                        <tr
                          key={`${areaKey}-${operator.user_id}`}
                          className="border-b border-line/50 dark:border-line-dark/50 hover:bg-cream/20 dark:hover:bg-ink-soft/10 align-top"
                        >
                          {/* Operator name cell */}
                          <td
                            className={`sticky left-0 z-[1] bg-paper dark:bg-ink-soft px-3 py-2 border-r border-line dark:border-line-dark align-top w-[140px] max-w-[140px] ${activeDropTarget === `complete-user-${operator.user_id}-${areaKey}` ? "ring-1 ring-ink/25 dark:ring-paper/25" : ""}`}
                            onDragOver={(event) => event.preventDefault()}
                            onDragEnter={() => setActiveDropTarget(`complete-user-${operator.user_id}-${areaKey}`)}
                            onDragLeave={() => setActiveDropTarget((current) => (current === `complete-user-${operator.user_id}-${areaKey}` ? null : current))}
                            onDrop={(event) => void moveTaskByDrop(event, group.area_id != null ? { assignee_id: operator.user_id, work_area_id: group.area_id } : { assignee_id: operator.user_id, work_area_ids: [] }, `complete-user-${operator.user_id}-${areaKey}`)}
                          >
                            <div className="flex items-start gap-2.5 pt-0.5">
                              {avatarUrl ? (
                                <img
                                  src={avatarUrl}
                                  alt={operator.full_name || operator.username}
                                  className="w-7 h-7 rounded-full object-cover flex-shrink-0"
                                />
                              ) : (
                                <div className="w-7 h-7 rounded-full bg-ink/10 dark:bg-paper/10 flex items-center justify-center flex-shrink-0">
                                  <span className="text-[10px] font-bold text-ink dark:text-paper">{initials}</span>
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="font-semibold text-[13px] text-ink dark:text-paper truncate">
                                  {operator.full_name || operator.username}
                                </div>
                                {roleLabel && (
                                  <div className="text-[10px] text-muted dark:text-muted-dark truncate" title={roleLabel}>
                                    {roleLabel}
                                  </div>
                                )}
                                <div className="text-[10px] text-muted dark:text-muted-dark">
                                  {operator.max_capacity_hours_day}h/g
                                </div>
                              </div>
                            </div>
                          </td>
                          {/* Day cells */}
                          {heatmap.days.map((day) => {
                            const cell = byDate.get(day);
                            const isToday = day === today;
                            if (!cell || cell.workload_status === "empty") {
                              return (
                                <td
                                  key={day}
                                  className={`group/cell px-1 py-1.5 border-r border-line/30 dark:border-line-dark/30 last:border-r-0 align-top ${
                                    isToday ? "bg-ink/5 dark:bg-paper/5" : ""
                                  } ${activeDropTarget === `complete-cell-${operator.user_id}-${areaKey}-${day}` ? "bg-amber-50/70 dark:bg-amber-900/20 ring-1 ring-inset ring-amber-400/70" : ""} ${hotDropTarget === `complete-cell-${operator.user_id}-${areaKey}-${day}` ? "bg-amber-100/70 dark:bg-amber-900/35 ring-2 ring-inset ring-amber-500" : ""}`}
                                  onDragOver={(event) => onCompleteDropHover(event, `complete-cell-${operator.user_id}-${areaKey}-${day}`)}
                                  onDrop={(event) => void moveTaskByDrop(event, group.area_id != null ? { assignee_id: operator.user_id, work_area_id: group.area_id, work_date: day } : { assignee_id: operator.user_id, work_area_ids: [], work_date: day }, `complete-cell-${operator.user_id}-${areaKey}-${day}`)}
                                >
                                  <div className="flex items-center justify-center h-10">
                                    <button
                                      type="button"
                                      onClick={() => { setQuickAdd({ day, userId: operator.user_id }); setNewWorkModalOpen(true); }}
                                      className="opacity-0 group-hover/cell:opacity-100 transition-opacity w-6 h-6 rounded-full border border-dashed border-line dark:border-line-dark text-muted dark:text-muted-dark hover:border-ink hover:text-ink dark:hover:border-paper dark:hover:text-paper flex items-center justify-center"
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
                                className={`group/cell px-1 py-1.5 border-r border-line/30 dark:border-line-dark/30 last:border-r-0 align-top ${
                                  isToday ? "bg-ink/5 dark:bg-paper/5" : ""
                                } ${activeDropTarget === `complete-cell-${operator.user_id}-${areaKey}-${day}` ? "bg-amber-50/70 dark:bg-amber-900/20 ring-1 ring-inset ring-amber-400/70" : ""} ${hotDropTarget === `complete-cell-${operator.user_id}-${areaKey}-${day}` ? "bg-amber-100/70 dark:bg-amber-900/35 ring-2 ring-inset ring-amber-500" : ""}`}
                                onDragOver={(event) => onCompleteDropHover(event, `complete-cell-${operator.user_id}-${areaKey}-${day}`)}
                                onDrop={(event) => void moveTaskByDrop(event, group.area_id != null ? { assignee_id: operator.user_id, work_area_id: group.area_id, work_date: day } : { assignee_id: operator.user_id, work_area_ids: [], work_date: day }, `complete-cell-${operator.user_id}-${areaKey}-${day}`)}
                              >
                                <div className="relative space-y-1 min-w-[72px]">
                                  {/* Expanded task list */}
                                  {cell.tasks.length > 0 ? (
                                    sortTasksByStartTime(cell.tasks).map((task) => (
                                      <button
                                        key={task.work_item_id}
                                        type="button"
                                        draggable
                                        onDragStart={(event) => onTaskDragStart(event, task.work_item_id)}
                                        onDragEnd={onTaskDragEnd}
                                        onClick={() => void openEditWorkItemModal(task.work_item_id)}
                                        className={`w-full text-left rounded border px-1.5 py-1 hover:ring-1 hover:ring-ink/20 dark:hover:ring-paper/20 transition-colors cursor-grab active:cursor-grabbing ${heatClass(cell.workload_status)} ${draggingTaskId === task.work_item_id ? "opacity-60" : ""}`}
                                      >
                                        <div className="text-[11px] font-semibold text-ink dark:text-paper leading-snug truncate" title={task.title}>
                                          {task.title}
                                        </div>
                                        {formatTaskStartTime(task.start_time) && (
                                          <div className="text-[10px] text-muted dark:text-muted-dark leading-none mt-0.5">
                                            {formatTaskStartTime(task.start_time)}
                                          </div>
                                        )}
                                        <div className="text-[10px] text-muted dark:text-muted-dark leading-none mt-0.5">
                                          {taskHoursLabel(task)}
                                        </div>
                                      </button>
                                    ))
                                  ) : (
                                    /* tasks[] empty means include_task_details=false — fallback summary */
                                    <div className={`rounded-md border px-1.5 py-1.5 text-center ${heatClass(cell.workload_status)}`}>
                                      <div className="font-bold text-[12px] text-ink dark:text-paper leading-none">
                                        {formatHours(cell.occupied_capacity_hours)}
                                      </div>
                                      {cell.assigned_tasks_count > 0 && (
                                        <div className="text-[10px] text-muted dark:text-muted-dark mt-0.5 leading-none">
                                          {cell.assigned_tasks_count} task
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  {/* Footer: total hours + utilization */}
                                  <div className="flex items-center justify-between gap-1 px-0.5 pt-0.5">
                                    <span className="text-[10px] text-muted dark:text-muted-dark">{formatHours(cell.occupied_capacity_hours)}</span>
                                    <span className="text-[10px] text-muted dark:text-muted-dark">{cell.utilization_percent.toFixed(0)}%</span>
                                  </div>
                                  {/* Quick-add button */}
                                  <button
                                    type="button"
                                    onClick={() => { setQuickAdd({ day, userId: operator.user_id }); setNewWorkModalOpen(true); }}
                                    className="absolute -top-1.5 -right-1.5 opacity-0 group-hover/cell:opacity-100 transition-opacity w-5 h-5 rounded-full bg-ink dark:bg-paper text-paper dark:text-ink flex items-center justify-center shadow-sm z-[1]"
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
                  </>
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

    return (
      <div className="space-y-3">
        {heatmap.groups.map((group, index) => {
          const key = String(group.area_id ?? `none-${index}`);
          const isOpen = !!expandedAreas[key];
          return (
            <div key={key} className="rounded-md border border-line dark:border-line-dark overflow-hidden">
              <button
                type="button"
                onClick={() => setExpandedAreas((current) => ({ ...current, [key]: !isOpen }))}
                className={`w-full px-4 py-3 flex items-center justify-between gap-3 bg-cream/70 dark:bg-ink-2 ${activeDropTarget === `heat-area-${key}` ? "ring-1 ring-ink/25 dark:ring-paper/25" : ""}`}
                onDragOver={(event) => event.preventDefault()}
                onDragEnter={() => setActiveDropTarget(`heat-area-${key}`)}
                onDragLeave={() => setActiveDropTarget((current) => (current === `heat-area-${key}` ? null : current))}
                onDrop={(event) => void moveTaskByDrop(event, group.area_id != null ? { work_area_id: group.area_id } : { work_area_ids: [] }, `heat-area-${key}`)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {group.area_icon ? <span className="text-base">{group.area_icon}</span> : <Icon name="target" className="w-4 h-4 text-muted" />}
                  <span className="font-semibold text-sm text-ink dark:text-paper truncate">{group.area_name || "Non assegnato"}</span>
                  <Badge variant="default">{group.users.length} utenti</Badge>
                </div>
                <Icon name="chevron-down" className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>

              {isOpen && (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-[12px]">
                    <thead>
                      <tr className="border-b border-line dark:border-line-dark bg-paper dark:bg-ink-soft">
                        <th className="sticky left-0 z-[1] bg-paper dark:bg-ink-soft px-3 py-2 text-left text-[11px] uppercase tracking-wider text-muted dark:text-muted-dark w-[140px] max-w-[140px]">Operatore</th>
                        {heatmap.days.map((day) => (
                          <th key={day} className="px-2 py-2 text-center text-[11px] uppercase tracking-wider text-muted dark:text-muted-dark min-w-[88px]">
                            {formatDayChip(day).weekday} {formatDayChip(day).day}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {group.users.map((operator) => (
                        <tr key={operator.user_id} className="border-b border-line/60 dark:border-line-dark/70">
                          <td
                            className={`sticky left-0 z-[1] bg-paper dark:bg-ink-soft px-3 py-2 align-top ${activeDropTarget === `heat-user-${operator.user_id}-${key}` ? "ring-1 ring-ink/25 dark:ring-paper/25" : ""}`}
                            onDragOver={(event) => event.preventDefault()}
                            onDragEnter={() => setActiveDropTarget(`heat-user-${operator.user_id}-${key}`)}
                            onDragLeave={() => setActiveDropTarget((current) => (current === `heat-user-${operator.user_id}-${key}` ? null : current))}
                            onDrop={(event) => void moveTaskByDrop(event, group.area_id != null ? { assignee_id: operator.user_id, work_area_id: group.area_id } : { assignee_id: operator.user_id, work_area_ids: [] }, `heat-user-${operator.user_id}-${key}`)}
                          >
                            <div className="font-semibold text-ink dark:text-paper">{operator.full_name || operator.username}</div>
                            <div className="mt-1 text-[10px] uppercase tracking-wider text-muted dark:text-muted-dark">
                              cap {operator.max_capacity_hours_day}h / giorno
                            </div>
                          </td>
                          {operator.days.map((cell) => (
                            <td
                              key={`${operator.user_id}-${cell.date}`}
                              className={`px-2 py-2 align-top ${activeDropTarget === `heat-cell-${operator.user_id}-${key}-${cell.date}` ? "ring-1 ring-ink/25 dark:ring-paper/25" : ""}`}
                              onDragOver={(event) => event.preventDefault()}
                              onDragEnter={() => setActiveDropTarget(`heat-cell-${operator.user_id}-${key}-${cell.date}`)}
                              onDragLeave={() => setActiveDropTarget((current) => (current === `heat-cell-${operator.user_id}-${key}-${cell.date}` ? null : current))}
                              onDrop={(event) => void moveTaskByDrop(event, group.area_id != null ? { assignee_id: operator.user_id, work_area_id: group.area_id } : { assignee_id: operator.user_id, work_area_ids: [] }, `heat-cell-${operator.user_id}-${key}-${cell.date}`)}
                            >
                              <div>
                                <button
                                  type="button"
                                  className={`w-full rounded-md border px-1.5 py-1 text-center ${heatmapLoadClass(cell.utilization_percent, cell.workload_status)} ${selectedDay === cell.date ? "ring-1 ring-ink dark:ring-paper" : ""}`}
                                  onClick={() => setSelectedDay(cell.date)}
                                >
                                  <div className="text-[11px] font-semibold text-ink dark:text-paper">{formatHours(cell.occupied_capacity_hours)}</div>
                                  <div className="text-[10px] text-muted dark:text-muted-dark">{cell.utilization_percent.toFixed(0)}%</div>
                                  <div className="text-[10px] text-muted dark:text-muted-dark">{cell.assigned_tasks_count} task</div>
                                </button>
                              </div>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
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
        <WorkloadCalendar
          userId={calendarData.user_id}
          companyId={selectedCompanyId}
          visibleDays={visibleDays}
          selectedDate={calendarData.selected_date}
          bounds={calendarBounds}
          nowMinutes={nowMinutes}
          density={calendarDensity}
          maxCapacityHours={operatorSummary?.max_capacity_hours_day ?? null}
          reloadToken={multiReloadToken}
          onOpenEdit={(id) => { void openEditWorkItemModal(id); }}
          onToggleComplete={(item) => { void toggleCalendarTaskCompleted(item); }}
          onMove={(taskId, day, startTime) => { void moveCalendarTaskToDaySlot(taskId, day, startTime); }}
          onCreateByDrag={({ day, startTime, estimatedHours }) => {
            setEditingItem(null);
            setQuickAdd({ day, userId: calendarData.user_id, startTime, estimatedHours });
            setNewWorkModalOpen(true);
          }}
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
    if (loading) {
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
    <div className="mb-3 rounded-md border border-line dark:border-line-dark bg-paper dark:bg-ink-soft px-3 py-2">
      <div className="flex flex-wrap items-center gap-3 text-[11px]">
        <span className="font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Legenda carico</span>
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
      </div>
    </div>
  );

  return (
    <div className="px-10 py-8 pb-20 max-w-[1600px] mx-auto w-full animate-fadeIn">
      <div className="mb-8">
        <div className="section-eyebrow">
          <Icon name="activity" className="w-3.5 h-3.5" />
          Produzione
        </div>
        <h1 className="section-title">Workload</h1>
        <p className="section-lead">Timeline operativa con filtri dinamici, viste multiple e controllo carico per operatore.</p>
      </div>

      <div className="wl-toolbar-shell mb-5">
        <div className="wl-toolbar-row wl-toolbar-row--left">
          <div className="wl-segmented wl-segmented--range">
          {RANGE_MODE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setRangeMode(option.value)}
              className={`wl-segmented-btn wl-segmented-btn--range ${rangeMode === option.value ? "is-active" : ""}`}
            >
              {option.label}
            </button>
          ))}
          </div>

          <button
            type="button"
            onClick={() => onShiftPeriod(-1)}
            className="wl-nav-btn"
            aria-label="Periodo precedente"
          >
            <Icon name="chevron-right" className="h-4 w-4 rotate-180" />
          </button>
          <div className="wl-range-label">{currentRangeLabel}</div>
          <button
            type="button"
            onClick={() => onShiftPeriod(1)}
            className="wl-nav-btn"
            aria-label="Periodo successivo"
          >
            <Icon name="chevron-right" className="h-4 w-4" />
          </button>

          <button type="button" className="wl-today-btn" onClick={onGoToday}>
            Oggi
          </button>

          <button type="button" className="wl-ghost-btn" onClick={() => { void loadMain(); }}>
            <Icon name="refresh-cw" className="w-3.5 h-3.5" />
            Aggiorna
          </button>
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

        <div className="wl-toolbar-row wl-toolbar-row--controls wl-toolbar-row--left">
          <label className="wl-search-field wl-search-field--compact" aria-label="Cerca task cliente operatore">
            <Icon name="search" className="w-3.5 h-3.5" />
            <input
              type="text"
              placeholder="Cerca..."
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </label>

          {!isOperatorView && (
            <div className="wl-segmented wl-segmented--view">
              {VIEW_MODE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setViewMode(option.value)}
                  className={`wl-segmented-btn wl-segmented-btn--view ${viewMode === option.value ? "is-active" : ""}`}
                >
                  <Icon name={option.icon} className="w-3.5 h-3.5" />
                  {option.label}
                </button>
              ))}
            </div>
          )}

          {viewMode === "calendar" && (
            <div className="wl-segmented wl-segmented--view" role="group" aria-label="Densità calendario">
              {([
                { value: "comfortable", icon: "grid", label: "Comodo" },
                { value: "compact", icon: "grid-compact", label: "Compatto" },
              ] as const).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setCalendarDensity(option.value)}
                  title={`Densità: ${option.label}`}
                  aria-label={`Densità: ${option.label}`}
                  aria-pressed={calendarDensity === option.value}
                  className={`wl-segmented-btn wl-segmented-btn--view wl-icon-btn ${calendarDensity === option.value ? "is-active" : ""}`}
                >
                  <Icon name={option.icon} className="w-4 h-4" />
                </button>
              ))}
            </div>
          )}

          {!isOperatorView && viewMode === "calendar" && (
            <div className="min-w-[220px]">
              <MultiSelect
                value={calendarOperatorIds}
                onChange={setCalendarOperatorIds}
                options={calendarOperators.map((op) => ({ id: op.user_id, label: op.full_name || op.username }))}
                placeholder="Operatori in calendario..."
                searchPlaceholder="Cerca operatore..."
              />
            </div>
          )}

          <button
            type="button"
            className="wl-new-task-btn"
            onClick={openNewWorkModal}
          >
            <Icon name="plus" className="w-3.5 h-3.5" />
            Nuova lavorazione
          </button>
          {!isOperatorView && (
            <button
              type="button"
              className="wl-new-task-btn"
              onClick={() => setTeamModalOpen(true)}
            >
              <Icon name="users" className="w-3.5 h-3.5" />
              Team e capacità
            </button>
          )}
        </div>

        <div className="wl-day-row">
          <div className="wl-view-label">
            {viewMode === "accordion" && "Workload team - vista ibrida"}
            {viewMode === "complete" && "Vista completa per area"}
            {viewMode === "heatmap" && "Heatmap per area e giorno"}
            {viewMode === "calendar" && "Calendario workload"}
            {viewMode === "accordion" && (
              <div className="mt-1 text-[11px] normal-case tracking-normal font-normal text-muted dark:text-muted-dark">
                La percentuale di carico indica le ore occupate rispetto alla capacità nel periodo selezionato: giorno, settimana o mese.
              </div>
            )}
          </div>

          {viewMode !== "calendar" && (
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
          )}

          {viewMode !== "calendar" && (
          <button type="button" className="wl-sort-btn" onClick={onToggleSortByLoad}>
            <Icon name="list" className="w-3.5 h-3.5" />
            Ordina per carico {sortDir === "desc" ? "↓" : "↑"}
          </button>
          )}
        </div>

      </div>

      {error && (
        <div className="mb-4 rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</div>
      )}

      <div className="mb-6">
        {loading && (
          <div className="flex items-center justify-end mb-3">
            <Spinner size="sm" />
          </div>
        )}

        {renderWorkloadLegend()}

        {renderMainView()}
      </div>

      <WorkloadTeamModal
        open={teamModalOpen}
        onClose={() => setTeamModalOpen(false)}
        companyId={selectedCompanyId!}
        canManage={canManageProfiles}
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

      <Modal
        open={!!calendarConflictModal}
        onClose={() => setCalendarConflictModal(null)}
        title="Slot orario occupato"
        description={calendarConflictModal?.message ?? "Una o più task si sovrappongono allo slot selezionato."}
        size="lg"
        footer={
          <Button variant="primary" onClick={() => setCalendarConflictModal(null)}>
            Ho capito
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          {(calendarConflictModal?.conflicts ?? []).map((conflict) => (
            <div key={`${conflict.work_item_id}-${conflict.overlap_start_time}`} className="rounded-md border border-warning/35 bg-warning/10 px-3 py-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink dark:text-paper">{conflict.title}</p>
                  <p className="mt-1 text-xs text-muted dark:text-muted-dark">
                    Occupa {conflict.start_time ?? "—"} - {conflict.end_time ?? "—"}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-warning">
                    Accavallamento: {conflict.overlap_start_time} - {conflict.overlap_end_time} ({conflict.overlap_minutes} min)
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => void openEditWorkItemModal(conflict.work_item_id)}>
                  Apri task
                </Button>
              </div>
            </div>
          ))}
        </div>
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
        onOverlapConflict={(message, conflicts) => setCalendarConflictModal({ message, conflicts })}
        onSaved={() => { setQuickAdd(null); setEditingItem(null); void loadMain(); void reloadCalendar(); setMultiReloadToken((t) => t + 1); }}
      />

      {openingEditTaskId != null && (
        <div className="fixed bottom-5 right-5 z-40 rounded-md border border-line dark:border-line-dark bg-paper dark:bg-ink-soft px-3 py-2 text-xs text-muted dark:text-muted-dark shadow-lg">
          Apertura task #{openingEditTaskId}...
        </div>
      )}

      {movingTaskId != null && (
        <div className="fixed bottom-16 right-5 z-40 rounded-md border border-line dark:border-line-dark bg-paper dark:bg-ink-soft px-3 py-2 text-xs text-muted dark:text-muted-dark shadow-lg">
          Spostamento task #{movingTaskId}...
        </div>
      )}


    </div>
  );
}