import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { getUsersApi, type User } from "../api/users";
import { listRolesApi, type Role } from "../api/roles";
import { getWorkItemApi, moveWorkItemApi, type MoveWorkItemPayload, type WorkItem } from "../api/workItems";
import { WorkItemFormModal } from "../components/work-items/WorkItemFormModal";
import { WorkloadTeamModal } from "../components/workload/WorkloadTeamModal";
import {
  applyWorkloadEngineRunApi,
  getWorkloadAllocationGridApi,
  getWorkloadUserCalendarDayApi,
  listWorkloadUsersApi,
  listWorkloadUsersGroupedByAreaAndDayApi,
  previewWorkloadEngineRunApi,
  type WorkloadAllocationGrid,
  type WorkloadComputedStatus,
  type WorkloadDayStatus,
  type WorkloadEngineRunResponse,
  type WorkloadGroupedByAreaAndDayResponse,
  type WorkloadTaskSummary,
  type WorkloadTimelineItem,
  type WorkloadUserByDay,
  type WorkloadUserCalendarDayResponse,
  type WorkloadUserSummary,
} from "../api/workload";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Icon, type IconName } from "../components/ui/Icon";
import { Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { Spinner } from "../components/ui/Spinner";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../hooks/useAuth";
import { useSelectedCompanyId } from "../hooks/useSelectedCompanyId";
import "./workload-page.css";

type RangeMode = "day" | "week" | "month" | "custom";
type ViewMode = "accordion" | "complete" | "heatmap" | "calendar" | "griglia";

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
  { value: "griglia", label: "Griglia allocazioni", icon: "grid" },
];

const CALENDAR_SLOT_MINUTES = 30;

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
  const [h, m] = value.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function clampTimeline(start: number, end: number): { start: number; end: number } {
  const min = 0;
  const max = 24 * 60;
  const safeStart = Math.min(max, Math.max(min, start));
  const safeEnd = Math.min(max, Math.max(min, end));
  if (safeEnd <= safeStart) {
    return { start: safeStart, end: Math.min(max, safeStart + 30) };
  }
  return { start: safeStart, end: safeEnd };
}

function minutesToHHMM(totalMinutes: number): string {
  const safe = Math.max(0, Math.min((24 * 60) - 1, totalMinutes));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function snapMinutesToSlot(totalMinutes: number, slotMinutes = CALENDAR_SLOT_MINUTES): number {
  const max = (24 * 60) - slotMinutes;
  const bounded = Math.max(0, Math.min(max, totalMinutes));
  return Math.round(bounded / slotMinutes) * slotMinutes;
}

function timelineItemClass(kind: WorkloadTimelineItem["kind"]) {
  if (kind === "break") return "border-amber-400 text-amber-900 dark:border-amber-700 dark:text-amber-100";
  if (kind === "remote") return "border-sky-300 bg-sky-100/80 text-sky-900 dark:border-sky-700 dark:bg-sky-900/35 dark:text-sky-100";
  if (kind === "holiday" || kind === "day_off") return "border-rose-300 bg-rose-100/80 text-rose-900 dark:border-rose-700 dark:bg-rose-900/35 dark:text-rose-100";
  return "border-line bg-paper/90 text-ink dark:border-line-dark dark:bg-ink-soft/90 dark:text-paper";
}

function timelineItemStyle(item: WorkloadTimelineItem) {
  if (item.kind === "break") {
    return {
      backgroundColor: "rgba(245, 158, 11, 0.2)",
      backgroundImage:
        "repeating-linear-gradient(135deg, rgba(245, 158, 11, 0.18) 0px, rgba(245, 158, 11, 0.18) 8px, rgba(245, 158, 11, 0.36) 8px, rgba(245, 158, 11, 0.36) 16px)",
    };
  }
  if (item.color) {
    return { backgroundColor: item.color };
  }
  return undefined;
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

  const [rangeMode, setRangeMode] = useState<RangeMode>("week");
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
  const [quickAdd, setQuickAdd] = useState<{ day: string; userId: number } | null>(null);
  const [openingEditTaskId, setOpeningEditTaskId] = useState<number | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<number | null>(null);
  const [dragSourceAssigneeId, setDragSourceAssigneeId] = useState<number | null | undefined>(undefined);
  const [movingTaskId, setMovingTaskId] = useState<number | null>(null);
  const [activeDropTarget, setActiveDropTarget] = useState<string | null>(null);
  const [hotDropTarget, setHotDropTarget] = useState<string | null>(null);
  const moveInFlightRef = useRef(false);
  const completeScrollRef = useRef<HTMLDivElement | null>(null);
  const dropHoverRef = useRef<{ key: string | null; sinceMs: number }>({ key: null, sinceMs: 0 });
  const [unassignedOpen, setUnassignedOpen] = useState(false);
  const [calendarOperatorId, setCalendarOperatorId] = useState<number | null>(null);
  const [calendarData, setCalendarData] = useState<WorkloadUserCalendarDayResponse | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [calendarDropPreviewMinutes, setCalendarDropPreviewMinutes] = useState<number | null>(null);
  const calendarRequestSeqRef = useRef(0);

  // ── Workload Engine State ──────────────────────────────────────────────────
  const [engineRunning, setEngineRunning] = useState(false);
  const [engineResult, setEngineResult] = useState<WorkloadEngineRunResponse | null>(null);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [engineModalOpen, setEngineModalOpen] = useState(false);

  // ── Allocation Grid State ──────────────────────────────────────────────────
  const [allocationGrid, setAllocationGrid] = useState<WorkloadAllocationGrid | null>(null);
  const [allocationGridLoading, setAllocationGridLoading] = useState(false);
  const [allocationGridError, setAllocationGridError] = useState<string | null>(null);
  const [allocationGridView, setAllocationGridView] = useState<"globale" | "operatore" | "area">("globale");

  const canManageProfiles = !!permissions?.is_admin;

  const visibleDays = useMemo(() => getVisibleDays(rangeMode, anchorDate, weekOffset), [anchorDate, rangeMode, weekOffset]);
  const calendarOperators = useMemo(() => extractCalendarOperators(heatmap), [heatmap]);
  const summaryByUserId = useMemo(() => new Map(summary.map((item) => [item.user_id, item])), [summary]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

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

  useEffect(() => {
    if (viewMode !== "calendar") return;
    if (!calendarData?.selected_date) return;
    setSelectedDay((current) => (current === calendarData.selected_date ? current : calendarData.selected_date));
  }, [calendarData?.selected_date, viewMode]);

  useEffect(() => {
    if (viewMode !== "calendar") return;
    if (calendarOperators.length === 0) {
      setCalendarOperatorId(null);
      setCalendarData(null);
      return;
    }

    if (calendarOperatorId != null && calendarOperators.some((op) => op.user_id === calendarOperatorId)) {
      return;
    }

    const preferred = user?.id != null
      ? calendarOperators.find((op) => op.user_id === user.id)
      : null;
    setCalendarOperatorId((preferred ?? calendarOperators[0]).user_id);
  }, [calendarOperatorId, calendarOperators, user?.id, viewMode]);

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
        const weightedHours = item.affects_daily_load === false ? 0 : item.effective_load_hours ?? item.estimated_hours ?? 0;
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
      toast.error(message);
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
    toast,
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
      toast.error(message);
    }
  }, [selectedCompanyId, toast]);

  useEffect(() => {
    loadMain();
  }, [loadMain]);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

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

  const resolvePlanningRange = useCallback((): { planningStart: string; planningEnd: string } => {
    if (rangeMode === "day") {
      return { planningStart: anchorDate, planningEnd: anchorDate };
    }

    if (rangeMode === "week") {
      const shiftedAnchor = shiftIsoByDays(anchorDate, weekOffset * 7);
      const planningStart = startOfIsoWeek(shiftedAnchor);
      return { planningStart, planningEnd: shiftIsoByDays(planningStart, 6) };
    }

    if (rangeMode === "month") {
      const date = dateFromIso(anchorDate);
      const year = date.getFullYear();
      const month = date.getMonth();
      return {
        planningStart: isoFromDate(new Date(year, month, 1)),
        planningEnd: isoFromDate(new Date(year, month + 1, 0)),
      };
    }

    return { planningStart: customFromDate, planningEnd: customToDate };
  }, [anchorDate, customFromDate, customToDate, rangeMode, weekOffset]);

  // ── Workload Engine Handlers ───────────────────────────────────────────────
  const handlePreviewWorkload = useCallback(async () => {
    if (!selectedCompanyId) {
      toast.error("Seleziona un'azienda");
      return;
    }

    setEngineRunning(true);
    setEngineError(null);
    setEngineResult(null);

    try {
      const { planningStart, planningEnd } = resolvePlanningRange();
      const result = await previewWorkloadEngineRunApi({
        company_id: selectedCompanyId,
        planning_start_date: planningStart,
        planning_end_date: planningEnd,
      });

      setEngineResult(result);
      setEngineModalOpen(true);

      toast.success(
        `Preview: ${result.allocated_tasks}/${result.total_tasks} task allocate, ${result.total_overload_hours.toFixed(1)}h di overload`
      );
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Errore sconosciuto";
      setEngineError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setEngineRunning(false);
    }
  }, [resolvePlanningRange, selectedCompanyId, toast]);

  const handleApplyWorkload = useCallback(async () => {
    if (!selectedCompanyId || !canManageProfiles) {
      toast.error(canManageProfiles ? "Seleziona un'azienda" : "Solo admin può applicare");
      return;
    }

    setEngineRunning(true);
    setEngineError(null);

    try {
      const { planningStart, planningEnd } = resolvePlanningRange();
      const result = await applyWorkloadEngineRunApi({
        company_id: selectedCompanyId,
        planning_start_date: planningStart,
        planning_end_date: planningEnd,
      });

      setEngineResult(result);

      const [summaryData, grouped] = await Promise.all([
        listWorkloadUsersApi({
          range_mode: rangeMode === "custom" ? "custom" : rangeMode,
          from_date: planningStart,
          to_date: planningEnd,
          company_id: selectedCompanyId,
          q: searchQuery || undefined,
          sort_by: sortBy,
          sort_dir: sortDir,
          include_tasks: viewMode === "accordion",
        }),
        listWorkloadUsersGroupedByAreaAndDayApi({
          range_mode: rangeMode === "custom" ? "custom" : rangeMode,
          from_date: planningStart,
          to_date: planningEnd,
          company_id: selectedCompanyId,
          q: searchQuery || undefined,
          sort_by: sortBy,
          sort_dir: sortDir,
          include_tasks: true,
          include_task_details: true,
        }),
      ]);

      setSummary(summaryData);
      setHeatmap(grouped);

      // Fetch allocation grid with the run_id from this apply so columns are precise
      try {
        const grid = await getWorkloadAllocationGridApi({
          company_id: selectedCompanyId,
          from_date: planningStart,
          to_date: planningEnd,
          run_id: result.run_id,
        });
        setAllocationGrid(grid);
        setAllocationGridError(null);
      } catch {
        // fail silently – user can refresh manually in griglia view
      }

      toast.success(
        `Workload applicato: ${result.allocated_tasks}/${result.total_tasks} task, ${result.total_overload_hours.toFixed(1)}h overload persistito`
      );
      setEngineModalOpen(false);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Errore sconosciuto";
      setEngineError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setEngineRunning(false);
    }
  }, [
    canManageProfiles,
    rangeMode,
    resolvePlanningRange,
    searchQuery,
    selectedCompanyId,
    sortBy,
    sortDir,
    toast,
    viewMode,
  ]);

  const shiftCalendarOperator = useCallback((direction: -1 | 1) => {
    if (calendarOperators.length === 0) return;
    const fallbackId = calendarOperators[0].user_id;
    const currentId = calendarOperatorId ?? fallbackId;
    const currentIndex = Math.max(0, calendarOperators.findIndex((op) => op.user_id === currentId));
    const nextIndex = (currentIndex + direction + calendarOperators.length) % calendarOperators.length;
    setCalendarOperatorId(calendarOperators[nextIndex].user_id);
  }, [calendarOperatorId, calendarOperators]);

  const buildCalendarDayMovePayload = useCallback((day: string): MoveWorkItemPayload => {
    const fallbackOperatorId = calendarOperatorId ?? calendarData?.user_id ?? null;
    if (dragSourceAssigneeId === null) {
      return {
        assignee_ids: [],
        work_date: day,
      };
    }
    if (typeof dragSourceAssigneeId === "number") {
      return {
        assignee_id: dragSourceAssigneeId,
        work_date: day,
      };
    }
    if (typeof fallbackOperatorId === "number") {
      return {
        assignee_id: fallbackOperatorId,
        work_date: day,
      };
    }
    return { work_date: day };
  }, [calendarData?.user_id, calendarOperatorId, dragSourceAssigneeId]);

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

  const onTaskDragStart = (event: DragEvent<HTMLElement>, workItemId: number, sourceAssigneeId?: number | null) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(workItemId));
    setDraggingTaskId(workItemId);
    setDragSourceAssigneeId(sourceAssigneeId);
  };

  const onTaskDragEnd = () => {
    setDraggingTaskId(null);
    setDragSourceAssigneeId(undefined);
    setActiveDropTarget(null);
    setHotDropTarget(null);
    setCalendarDropPreviewMinutes(null);
    dropHoverRef.current = { key: null, sinceMs: 0 };
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

    try {
      moveInFlightRef.current = true;
      setMovingTaskId(taskId);
      await moveWorkItemApi(taskId, payload);
      patchCalendarTaskLocally(taskId, payload);
      await loadMain({ silent: true });
      await reloadCalendar();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Impossibile spostare la task";
      toast.error(message);
    } finally {
      moveInFlightRef.current = false;
      setMovingTaskId(null);
      setDraggingTaskId(null);
      setDragSourceAssigneeId(undefined);
      setActiveDropTarget((current) => (current === dropTargetKey ? null : current));
    }
  }, [loadMain, patchCalendarTaskLocally, reloadCalendar, toast]);

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

  // ── Allocation Grid helpers ────────────────────────────────────────────────

  const loadAllocationGrid = useCallback(async (runId?: string | null) => {
    if (!selectedCompanyId) return;
    const { planningStart, planningEnd } = resolvePlanningRange();
    setAllocationGridLoading(true);
    setAllocationGridError(null);
    try {
      const grid = await getWorkloadAllocationGridApi({
        company_id: selectedCompanyId,
        from_date: planningStart,
        to_date: planningEnd,
        run_id: runId ?? undefined,
      });
      setAllocationGrid(grid);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore griglia allocazioni";
      setAllocationGridError(msg);
      toast.error(msg);
    } finally {
      setAllocationGridLoading(false);
    }
  }, [resolvePlanningRange, selectedCompanyId, toast]);

  // Auto-load when switching to griglia view
  useEffect(() => {
    if (viewMode === "griglia" && selectedCompanyId) {
      void loadAllocationGrid(allocationGrid?.last_run_id);
    }
  }, [viewMode, selectedCompanyId, rangeMode]);

  const dayStatusLabel = (status: WorkloadDayStatus) => {
    if (status === "empty") return "text-muted dark:text-muted-dark";
    if (status === "ok") return "text-green dark:text-green-light";
    if (status === "warning") return "text-warning dark:text-warning-light";
    return "text-danger dark:text-danger-light";
  };

  // ────────────────────────────────────────────────────────────────────────────
  // ALLOCATION GRID VIEWS
  // ────────────────────────────────────────────────────────────────────────────

  const renderAllocationGridGlobale = () => {
    if (!allocationGrid) return null;

    const today = getTodayDate();
    const cap = allocationGrid.daily_capacity_hours;
    const maxHours = cap * 1.6;
    const BAR_PX = 300;
    const hoursToY = (h: number) => Math.round((h / maxHours) * BAR_PX);
    const capLineFromTop = BAR_PX - hoursToY(cap);

    const allocColor = (status: "ok" | "at_limit" | "overload") => {
      if (status === "ok") return {
        bg: "bg-[#eaf3de] dark:bg-[#2a3d1a]",
        border: "border-[#3b6d11] dark:border-[#5a9e22]",
        text: "text-[#3b6d11] dark:text-[#8ed44f]",
      };
      if (status === "at_limit") return {
        bg: "bg-[#faeeda] dark:bg-[#3d2e10]",
        border: "border-[#854f0b] dark:border-[#c47a1a]",
        text: "text-[#854f0b] dark:text-[#efb44a]",
      };
      return {
        bg: "bg-[#fceaeb] dark:bg-[#3d1212]",
        border: "border-[#a32d2d] dark:border-[#cc4444]",
        text: "text-[#a32d2d] dark:text-[#f47070]",
      };
    };

    return (
      <div className="overflow-x-auto pb-3">
        <div className="flex items-end gap-2" style={{ minWidth: `${Math.max(allocationGrid.days.length * 150, 600)}px` }}>
          <div className="flex flex-col items-end justify-between shrink-0 pb-6" style={{ height: `${BAR_PX + 24}px` }}>
            <span className="text-[10px] text-muted dark:text-muted-dark tabular-nums">{maxHours.toFixed(1)}h</span>
            <span className="text-[10px] text-muted dark:text-muted-dark tabular-nums">{cap}h</span>
            <span className="text-[10px] text-muted dark:text-muted-dark tabular-nums">0h</span>
          </div>

          {allocationGrid.days.map((day) => {
            const chip = formatDayChip(day.date);
            const isToday = day.date === today;
            let cumulativeHours = 0;

            return (
              <div key={day.date} className="flex flex-1 flex-col items-center gap-1" style={{ minWidth: "130px" }}>
                <div className={`text-[11px] font-semibold tabular-nums ${dayStatusLabel(day.day_status)}`}>
                  {day.day_status === "empty" ? "—" : `${day.utilization_percent.toFixed(0)}%`}
                </div>

                <div className="relative w-full overflow-hidden rounded-sm" style={{ height: `${BAR_PX}px` }}>
                  <div className="absolute bottom-0 left-0 right-0 h-px bg-line dark:bg-line-dark" />
                  <div className="absolute left-0 right-0 z-10 border-t border-dashed" style={{ top: `${capLineFromTop}px`, borderColor: "rgba(115,114,108,0.7)" }} />
                  {day.day_status === "empty" && (
                    <div className="absolute inset-0 rounded border border-dashed border-line dark:border-line-dark" />
                  )}

                  {day.allocations.map((alloc) => {
                    const blockH = Math.max(hoursToY(alloc.planned_hours), 18);
                    const bottomPx = hoursToY(cumulativeHours);
                    cumulativeHours += alloc.planned_hours;
                    const c = allocColor(alloc.allocation_status);

                    return (
                      <button
                        key={alloc.work_item_id}
                        type="button"
                        onClick={() => void openEditWorkItemModal(alloc.work_item_id)}
                        title={`${alloc.title}\n${alloc.planned_hours.toFixed(1)}h${alloc.client_name ? `\n${alloc.client_name}` : ""}${alloc.conflict_code ? `\nConflitto: ${alloc.conflict_code}` : ""}`}
                        className={`absolute left-0 right-0 rounded-[3px] border ${c.bg} ${c.border} overflow-hidden hover:brightness-95 dark:hover:brightness-110 transition-all`}
                        style={{ height: `${blockH}px`, bottom: `${bottomPx}px` }}
                      >
                        <div className={`flex h-full items-center justify-between gap-1 px-1.5 ${c.text}`}>
                          <span className="min-w-0 truncate text-[11px] font-medium leading-tight">{alloc.title}</span>
                          <span className="shrink-0 text-[11px] font-semibold tabular-nums">{alloc.planned_hours.toFixed(1)}h</span>
                        </div>
                        {alloc.overload_hours > 0 && (
                          <div className="absolute left-0 right-0 top-0 rounded-t-[3px] bg-[#a32d2d]/20" style={{ height: `${hoursToY(alloc.overload_hours)}px` }} />
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className={`flex flex-col items-center gap-0.5 ${isToday ? "font-bold text-ink dark:text-paper" : "text-muted dark:text-muted-dark"}`}>
                  <span className="text-[10px] uppercase tracking-wider">{chip.weekday}</span>
                  <span className="text-sm font-semibold leading-none">{chip.day} {chip.month}</span>
                  <span className="text-[10px] tabular-nums">
                    {day.total_planned_hours.toFixed(1)}h
                    {day.total_overload_hours > 0 && (
                      <span className="text-danger font-semibold"> +{day.total_overload_hours.toFixed(1)}</span>
                    )}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderAllocationGridOperatore = () => {
    if (!allocationGrid) return null;

    const today = getTodayDate();
    const cap = allocationGrid.daily_capacity_hours;
    const maxHours = cap * 1.6;
    const BAR_PX = 300;
    const hoursToY = (h: number) => Math.round((h / maxHours) * BAR_PX);
    const capLineFromTop = BAR_PX - hoursToY(cap);

    const allocColor = (status: "ok" | "at_limit" | "overload") => {
      if (status === "ok") return { bg: "bg-[#eaf3de] dark:bg-[#2a3d1a]", border: "border-[#3b6d11] dark:border-[#5a9e22]", text: "text-[#3b6d11] dark:text-[#8ed44f]" };
      if (status === "at_limit") return { bg: "bg-[#faeeda] dark:bg-[#3d2e10]", border: "border-[#854f0b] dark:border-[#c47a1a]", text: "text-[#854f0b] dark:text-[#efb44a]" };
      return { bg: "bg-[#fceaeb] dark:bg-[#3d1212]", border: "border-[#a32d2d] dark:border-[#cc4444]", text: "text-[#a32d2d] dark:text-[#f47070]" };
    };

    return (
      <div className="flex flex-col gap-3">
        {allocationGrid.operators.map((op) => (
          <div key={op.user_id} className="rounded-lg border border-line dark:border-line-dark overflow-hidden">
            <div className="flex items-center justify-between gap-3 bg-cream/40 dark:bg-[#2a2a30] px-4 py-2.5 border-b border-line dark:border-line-dark">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex flex-col min-w-0">
                  <span className="font-semibold text-sm text-ink dark:text-paper">{op.full_name || op.username}</span>
                  <span className="text-[11px] text-muted dark:text-muted-dark">@{op.username}</span>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0 text-right">
                <span className="text-[11px]">
                  <span className="font-semibold text-ink dark:text-paper">{op.total_planned_hours.toFixed(1)}h</span>
                  <span className="text-muted dark:text-muted-dark"> pianificate</span>
                </span>
                {op.total_overload_hours > 0 && (
                  <span className="text-[11px] text-danger">
                    <span className="font-semibold">+{op.total_overload_hours.toFixed(1)}h</span>
                    <span> overload</span>
                  </span>
                )}
              </div>
            </div>

            <div className="overflow-x-auto p-3">
              <div className="flex items-end gap-2" style={{ minWidth: `${Math.max(op.days.length * 150, 600)}px` }}>
                <div className="flex flex-col items-end justify-between shrink-0 pb-6" style={{ height: `${BAR_PX + 24}px` }}>
                  <span className="text-[10px] text-muted dark:text-muted-dark tabular-nums">{maxHours.toFixed(1)}h</span>
                  <span className="text-[10px] text-muted dark:text-muted-dark tabular-nums">{cap}h</span>
                  <span className="text-[10px] text-muted dark:text-muted-dark tabular-nums">0h</span>
                </div>

                {op.days.map((day) => {
                  const chip = formatDayChip(day.date);
                  const isToday = day.date === today;
                  let cumulativeHours = 0;

                  return (
                    <div key={day.date} className="flex flex-1 flex-col items-center gap-1" style={{ minWidth: "130px" }}>
                      <div className={`text-[11px] font-semibold tabular-nums ${dayStatusLabel(day.day_status)}`}>
                        {day.day_status === "empty" ? "—" : `${day.utilization_percent.toFixed(0)}%`}
                      </div>

                      <div className="relative w-full overflow-hidden rounded-sm" style={{ height: `${BAR_PX}px` }}>
                        <div className="absolute bottom-0 left-0 right-0 h-px bg-line dark:bg-line-dark" />
                        <div className="absolute left-0 right-0 z-10 border-t border-dashed" style={{ top: `${capLineFromTop}px`, borderColor: "rgba(115,114,108,0.7)" }} />
                        {day.day_status === "empty" && (
                          <div className="absolute inset-0 rounded border border-dashed border-line dark:border-line-dark" />
                        )}

                        {day.allocations.map((alloc) => {
                          const blockH = Math.max(hoursToY(alloc.planned_hours), 18);
                          const bottomPx = hoursToY(cumulativeHours);
                          cumulativeHours += alloc.planned_hours;
                          const c = allocColor(alloc.allocation_status);

                          return (
                            <button
                              key={alloc.work_item_id}
                              type="button"
                              onClick={() => void openEditWorkItemModal(alloc.work_item_id)}
                              title={`${alloc.title}\n${alloc.planned_hours.toFixed(1)}h${alloc.client_name ? `\n${alloc.client_name}` : ""}`}
                              className={`absolute left-0 right-0 rounded-[3px] border ${c.bg} ${c.border} overflow-hidden hover:brightness-95 dark:hover:brightness-110 transition-all`}
                              style={{ height: `${blockH}px`, bottom: `${bottomPx}px` }}
                            >
                              <div className={`flex h-full items-center justify-between gap-1 px-1.5 ${c.text}`}>
                                <span className="min-w-0 truncate text-[11px] font-medium leading-tight">{alloc.title}</span>
                                <span className="shrink-0 text-[11px] font-semibold tabular-nums">{alloc.planned_hours.toFixed(1)}h</span>
                              </div>
                              {alloc.overload_hours > 0 && (
                                <div className="absolute left-0 right-0 top-0 rounded-t-[3px] bg-[#a32d2d]/20" style={{ height: `${hoursToY(alloc.overload_hours)}px` }} />
                              )}
                            </button>
                          );
                        })}
                      </div>

                      <div className={`flex flex-col items-center gap-0.5 ${isToday ? "font-bold text-ink dark:text-paper" : "text-muted dark:text-muted-dark"}`}>
                        <span className="text-[10px] uppercase tracking-wider">{chip.weekday}</span>
                        <span className="text-sm font-semibold leading-none">{chip.day} {chip.month}</span>
                        <span className="text-[10px] tabular-nums">
                          {day.total_planned_hours.toFixed(1)}h
                          {day.total_overload_hours > 0 && (
                            <span className="text-danger font-semibold"> +{day.total_overload_hours.toFixed(1)}</span>
                          )}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderAllocationGridArea = () => {
    if (!allocationGrid) return null;

    const today = getTodayDate();
    const cap = allocationGrid.daily_capacity_hours;
    const maxHours = cap * 1.6;
    const BAR_PX = 300;
    const hoursToY = (h: number) => Math.round((h / maxHours) * BAR_PX);
    const capLineFromTop = BAR_PX - hoursToY(cap);

    const allocColor = (status: "ok" | "at_limit" | "overload") => {
      if (status === "ok") return { bg: "bg-[#eaf3de] dark:bg-[#2a3d1a]", border: "border-[#3b6d11] dark:border-[#5a9e22]", text: "text-[#3b6d11] dark:text-[#8ed44f]" };
      if (status === "at_limit") return { bg: "bg-[#faeeda] dark:bg-[#3d2e10]", border: "border-[#854f0b] dark:border-[#c47a1a]", text: "text-[#854f0b] dark:text-[#efb44a]" };
      return { bg: "bg-[#fceaeb] dark:bg-[#3d1212]", border: "border-[#a32d2d] dark:border-[#cc4444]", text: "text-[#a32d2d] dark:text-[#f47070]" };
    };

    return (
      <div className="flex flex-col gap-3">
        {allocationGrid.work_areas.map((area) => (
          <div key={area.area_id} className="rounded-lg border border-line dark:border-line-dark overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-line dark:border-line-dark" style={{ backgroundColor: area.area_color ? `${area.area_color}15` : undefined }}>
              <div className="flex items-center gap-2.5 min-w-0">
                {area.area_icon && <span className="text-lg shrink-0">{area.area_icon}</span>}
                <div className="flex flex-col min-w-0">
                  <span className="font-semibold text-sm text-ink dark:text-paper">{area.area_name}</span>
                  {area.area_slug && <span className="text-[11px] text-muted dark:text-muted-dark">#{area.area_slug}</span>}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0 text-right">
                <span className="text-[11px]">
                  <span className="font-semibold text-ink dark:text-paper">{area.total_planned_hours.toFixed(1)}h</span>
                  <span className="text-muted dark:text-muted-dark"> pianificate</span>
                </span>
                {area.total_overload_hours > 0 && (
                  <span className="text-[11px] text-danger">
                    <span className="font-semibold">+{area.total_overload_hours.toFixed(1)}h</span>
                    <span> overload</span>
                  </span>
                )}
              </div>
            </div>

            <div className="overflow-x-auto p-3">
              <div className="flex items-end gap-2" style={{ minWidth: `${Math.max(area.days.length * 150, 600)}px` }}>
                <div className="flex flex-col items-end justify-between shrink-0 pb-6" style={{ height: `${BAR_PX + 24}px` }}>
                  <span className="text-[10px] text-muted dark:text-muted-dark tabular-nums">{maxHours.toFixed(1)}h</span>
                  <span className="text-[10px] text-muted dark:text-muted-dark tabular-nums">{cap}h</span>
                  <span className="text-[10px] text-muted dark:text-muted-dark tabular-nums">0h</span>
                </div>

                {area.days.map((day) => {
                  const chip = formatDayChip(day.date);
                  const isToday = day.date === today;
                  let cumulativeHours = 0;

                  return (
                    <div key={day.date} className="flex flex-1 flex-col items-center gap-1" style={{ minWidth: "130px" }}>
                      <div className={`text-[11px] font-semibold tabular-nums ${dayStatusLabel(day.day_status)}`}>
                        {day.day_status === "empty" ? "—" : `${day.utilization_percent.toFixed(0)}%`}
                      </div>

                      <div className="relative w-full overflow-hidden rounded-sm" style={{ height: `${BAR_PX}px` }}>
                        <div className="absolute bottom-0 left-0 right-0 h-px bg-line dark:bg-line-dark" />
                        <div className="absolute left-0 right-0 z-10 border-t border-dashed" style={{ top: `${capLineFromTop}px`, borderColor: "rgba(115,114,108,0.7)" }} />
                        {day.day_status === "empty" && (
                          <div className="absolute inset-0 rounded border border-dashed border-line dark:border-line-dark" />
                        )}

                        {day.allocations.map((alloc) => {
                          const blockH = Math.max(hoursToY(alloc.planned_hours), 18);
                          const bottomPx = hoursToY(cumulativeHours);
                          cumulativeHours += alloc.planned_hours;
                          const c = allocColor(alloc.allocation_status);

                          return (
                            <button
                              key={alloc.work_item_id}
                              type="button"
                              onClick={() => void openEditWorkItemModal(alloc.work_item_id)}
                              title={`${alloc.title}\n${alloc.planned_hours.toFixed(1)}h${alloc.client_name ? `\n${alloc.client_name}` : ""}`}
                              className={`absolute left-0 right-0 rounded-[3px] border ${c.bg} ${c.border} overflow-hidden hover:brightness-95 dark:hover:brightness-110 transition-all`}
                              style={{ height: `${blockH}px`, bottom: `${bottomPx}px` }}
                            >
                              <div className={`flex h-full items-center justify-between gap-1 px-1.5 ${c.text}`}>
                                <span className="min-w-0 truncate text-[11px] font-medium leading-tight">{alloc.title}</span>
                                <span className="shrink-0 text-[11px] font-semibold tabular-nums">{alloc.planned_hours.toFixed(1)}h</span>
                              </div>
                              {alloc.overload_hours > 0 && (
                                <div className="absolute left-0 right-0 top-0 rounded-t-[3px] bg-[#a32d2d]/20" style={{ height: `${hoursToY(alloc.overload_hours)}px` }} />
                              )}
                            </button>
                          );
                        })}
                      </div>

                      <div className={`flex flex-col items-center gap-0.5 ${isToday ? "font-bold text-ink dark:text-paper" : "text-muted dark:text-muted-dark"}`}>
                        <span className="text-[10px] uppercase tracking-wider">{chip.weekday}</span>
                        <span className="text-sm font-semibold leading-none">{chip.day} {chip.month}</span>
                        <span className="text-[10px] tabular-nums">
                          {day.total_planned_hours.toFixed(1)}h
                          {day.total_overload_hours > 0 && (
                            <span className="text-danger font-semibold"> +{day.total_overload_hours.toFixed(1)}</span>
                          )}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderGridView = () => {
    if (allocationGridLoading) {
      return <div className="flex items-center justify-center py-12"><Spinner size="md" /></div>;
    }

    if (allocationGridError) {
      return (
        <div className="rounded-md border border-danger/20 bg-danger/5 px-3 py-3 text-sm text-danger">
          {allocationGridError}
          <button type="button" className="ml-3 underline text-xs" onClick={() => void loadAllocationGrid()}>
            Riprova
          </button>
        </div>
      );
    }

    if (!allocationGrid) {
      return (
        <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-line dark:border-line-dark px-4 py-10 text-sm text-muted dark:text-muted-dark">
          <p>Nessuna griglia allocazioni disponibile.</p>
          <p className="text-xs">Esegui <strong>Simula workload</strong> e poi <strong>Applica</strong> per vedere la distribuzione delle ore per giorno.</p>
          <Button size="sm" variant="secondary" onClick={() => void loadAllocationGrid()}>
            Carica griglia
          </Button>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-5">

        {/* ── Summary bar ─────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-cream/60 px-4 py-3 dark:border-line-dark dark:bg-[#1c1c20]">
          <div className="flex items-center gap-1.5">
            <Icon name="activity" className="h-3.5 w-3.5 text-muted dark:text-muted-dark" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Strategia</span>
            <span className="text-xs text-ink dark:text-paper">{allocationGrid.strategy}</span>
          </div>
          <span className="text-muted/40">·</span>
          <span className="text-xs text-muted dark:text-muted-dark">Capacità <strong className="text-ink dark:text-paper">{allocationGrid.daily_capacity_hours}h</strong>/giorno</span>
          <span className="text-muted/40">·</span>
          <span className="text-xs text-muted dark:text-muted-dark">Task <strong className="text-ink dark:text-paper">{allocationGrid.total_tasks}</strong></span>
          {allocationGrid.total_overload_hours > 0 && (
            <>
              <span className="text-muted/40">·</span>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-danger">
                <Icon name="alert-triangle" className="h-3.5 w-3.5" />
                {allocationGrid.total_overload_hours.toFixed(1)}h overload totale
              </span>
            </>
          )}
          {allocationGrid.last_run_id && (
            <span className="ml-auto text-[10px] font-mono text-muted dark:text-muted-dark">
              run: {allocationGrid.last_run_id.slice(0, 8)}…
            </span>
          )}
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted hover:text-ink dark:text-muted-dark dark:hover:text-paper"
            onClick={() => void loadAllocationGrid(allocationGrid.last_run_id)}
          >
            <Icon name="refresh-cw" className="h-3 w-3" />
            Aggiorna
          </button>
        </div>

        {/* ── View switcher tabs ──────────────────────────────── */}
        <div className="flex gap-2">
          {(["globale", "operatore", "area"] as const).map((viewType) => (
            <button
              key={viewType}
              type="button"
              onClick={() => setAllocationGridView(viewType)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-colors ${
                allocationGridView === viewType
                  ? "bg-ink text-paper dark:bg-paper dark:text-ink"
                  : "bg-cream/40 text-ink hover:bg-cream/60 dark:bg-[#2a2a30] dark:text-paper dark:hover:bg-[#3a3a40]"
              }`}
            >
              {viewType === "globale" && "Globale"}
              {viewType === "operatore" && "Per Operatore"}
              {viewType === "area" && "Per Area"}
            </button>
          ))}
        </div>

        {/* ── Content based on selected view ──────────────────── */}
        {allocationGridView === "globale" && renderAllocationGridGlobale()}
        {allocationGridView === "operatore" && renderAllocationGridOperatore()}
        {allocationGridView === "area" && renderAllocationGridArea()}

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

    const selectedSummary = summaryByUserId.get(calendarData.user_id);
    const roleLabel = calendarData.roles.map((role) => role.name).join(", ");
    const displayName = calendarData.full_name || calendarData.username;
    const avatarInitials = displayName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((chunk) => chunk[0]?.toUpperCase() ?? "")
      .join("") || "?";

    const allDayItems = calendarData.timeline.filter((item) => item.is_all_day || !item.start_time || !item.end_time);
    const timedItems = calendarData.timeline.filter((item) => !item.is_all_day && !!item.start_time && !!item.end_time);

    const timelineBlocks = timedItems.map((item) => {
      const start = hhmmToMinutes(item.start_time) ?? 0;
      const end = hhmmToMinutes(item.end_time) ?? start + Math.max(30, Math.round(((item.affects_daily_load === false ? 0 : item.effective_load_hours ?? item.estimated_hours ?? 0)) * 60));
      const safe = clampTimeline(start, end);
      return { item, start: safe.start, end: safe.end };
    });

    const totalTaskHours = calendarData.timeline
      .filter((item) => item.kind === "task")
      .reduce((acc, item) => {
        const start = hhmmToMinutes(item.start_time);
        const end = hhmmToMinutes(item.end_time);
        if (start != null && end != null && end > start) {
          return acc + (end - start) / 60;
        }
        return acc + (item.affects_daily_load === false ? 0 : item.effective_load_hours ?? item.estimated_hours ?? 0);
      }, 0);

    const dayMeta = dateFromIso(calendarData.selected_date).toLocaleDateString("it-IT", {
      weekday: "long",
      day: "2-digit",
      month: "short",
    });
    const previewTopPx =
      calendarDropPreviewMinutes != null
        ? (calendarDropPreviewMinutes / 60) * 64
        : null;
    const previewHeightPx = (CALENDAR_SLOT_MINUTES / 60) * 64;

    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-line dark:border-line-dark bg-paper dark:bg-ink-soft p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2">
              <button type="button" className="wl-nav-btn" onClick={() => shiftCalendarOperator(-1)} aria-label="Operatore precedente">
                <Icon name="chevron-right" className="w-4 h-4 rotate-180" />
              </button>
              {calendarData.avatar_url ? (
                <img
                  src={calendarData.avatar_url}
                  alt={displayName}
                  className="h-9 w-9 rounded-full object-cover border border-line dark:border-line-dark"
                />
              ) : (
                <div className="h-9 w-9 rounded-full border border-line dark:border-line-dark bg-cream dark:bg-ink-2 text-[11px] font-semibold text-ink dark:text-paper flex items-center justify-center">
                  {avatarInitials}
                </div>
              )}
              <div>
                <div className="text-sm font-semibold text-ink dark:text-paper">{displayName}</div>
                <div className="text-xs text-muted dark:text-muted-dark">
                  {roleLabel || "Nessun ruolo"} · {dayMeta}
                </div>
              </div>
              <button type="button" className="wl-nav-btn" onClick={() => shiftCalendarOperator(1)} aria-label="Operatore successivo">
                <Icon name="chevron-right" className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant={selectedSummary ? statusBadgeVariant(selectedSummary.workload_status) : "default"}>
                {selectedSummary ? statusLabel(selectedSummary.workload_status) : "N/D"}
              </Badge>
              <span className="rounded-md border border-line dark:border-line-dark px-2 py-1 text-muted dark:text-muted-dark">
                {totalTaskHours > 0 ? `${formatHours(totalTaskHours)} task` : "Libero"}
              </span>
              <span className="rounded-md border border-line dark:border-line-dark px-2 py-1 text-muted dark:text-muted-dark">
                {calendarData.timeline.filter((item) => item.kind === "task").length} task · {calendarData.timeline.length} eventi
              </span>
            </div>
          </div>
        </div>

        {allDayItems.length > 0 && (
          <div className="rounded-lg border border-line dark:border-line-dark bg-paper dark:bg-ink-soft p-3">
            <div className="mb-2 text-[11px] uppercase tracking-wider text-muted dark:text-muted-dark">Tutto il giorno</div>
            <div
              className={`flex flex-wrap gap-2 rounded-md ${activeDropTarget === "cal-all-day" ? "ring-1 ring-inset ring-amber-500 bg-amber-50/50 dark:bg-amber-900/20" : ""}`}
              onDragOver={(event) => {
                if (draggingTaskId == null) return;
                event.preventDefault();
                setActiveDropTarget("cal-all-day");
              }}
              onDragLeave={() => {
                setActiveDropTarget((current) => (current === "cal-all-day" ? null : current));
              }}
              onDrop={(event) => {
                void moveTaskByDrop(event, buildCalendarDayMovePayload(calendarData.selected_date), "cal-all-day");
              }}
            >
              {allDayItems.map((item, idx) => (
                <div
                  key={`${item.kind}-${item.source_id ?? idx}`}
                  className={`px-2 py-1 text-xs ${item.kind === "break" ? "rounded-none border-0" : "rounded-md border"} ${timelineItemClass(item.kind)}`}
                  style={timelineItemStyle(item)}
                  draggable={item.kind === "task" && !!item.work_item_id}
                  onDragStart={(event) => {
                    if (item.kind !== "task" || !item.work_item_id) return;
                    onTaskDragStart(event, item.work_item_id, calendarData.user_id);
                  }}
                  onDragEnd={onTaskDragEnd}
                  onClick={() => {
                    if (item.kind === "task" && item.work_item_id) {
                      void openEditWorkItemModal(item.work_item_id);
                    }
                  }}
                >
                  <div className="font-semibold">{item.emoji ? `${item.emoji} ` : ""}{item.title}</div>
                  {item.description && <div className="text-[11px] opacity-80">{item.description}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-lg border border-line dark:border-line-dark bg-paper dark:bg-ink-soft overflow-hidden">
          <div className="grid grid-cols-[68px_1fr]">
            <div className="border-r border-line dark:border-line-dark bg-cream/50 dark:bg-ink-2">
              {Array.from({ length: 24 }, (_, hour) => (
                <div key={hour} className="h-16 px-2 py-1 text-[10px] text-muted dark:text-muted-dark border-b border-line/50 dark:border-line-dark/60">
                  {String(hour).padStart(2, "0")}:00
                </div>
              ))}
            </div>

            <div
              className={`relative ${activeDropTarget === "cal-time-grid" ? "ring-1 ring-inset ring-amber-500 bg-amber-50/30 dark:bg-amber-900/15" : ""}`}
              style={{ height: `${24 * 64}px` }}
              onDragOver={(event) => {
                if (draggingTaskId == null) return;
                event.preventDefault();
                setActiveDropTarget("cal-time-grid");

                const container = event.currentTarget;
                const rect = container.getBoundingClientRect();
                const relativeY = Math.max(0, Math.min(rect.height - 1, event.clientY - rect.top));
                const rawMinutes = (relativeY / 64) * 60;
                setCalendarDropPreviewMinutes(snapMinutesToSlot(rawMinutes));
              }}
              onDragLeave={() => {
                setActiveDropTarget((current) => (current === "cal-time-grid" ? null : current));
                setCalendarDropPreviewMinutes(null);
              }}
              onDrop={(event) => {
                const container = event.currentTarget;
                const rect = container.getBoundingClientRect();
                const relativeY = Math.max(0, Math.min(rect.height - 1, event.clientY - rect.top));
                const rawMinutes = (relativeY / 64) * 60;
                const minutes = calendarDropPreviewMinutes ?? snapMinutesToSlot(rawMinutes);
                const payload: MoveWorkItemPayload = {
                  ...buildCalendarDayMovePayload(calendarData.selected_date),
                  start_time: minutesToHHMM(minutes),
                };
                void moveTaskByDrop(event, payload, "cal-time-grid");
              }}
            >
              {Array.from({ length: 24 }, (_, hour) => (
                <div key={hour} className="absolute left-0 right-0 border-b border-line/40 dark:border-line-dark/50" style={{ top: `${hour * 64}px` }} />
              ))}
              {Array.from({ length: 24 }, (_, hour) => (
                <div key={`half-${hour}`} className="absolute left-0 right-0 border-b border-dashed border-line/30 dark:border-line-dark/40" style={{ top: `${hour * 64 + 32}px` }} />
              ))}

              {draggingTaskId != null && previewTopPx != null && (
                <div
                  className="pointer-events-none absolute left-2 right-2 rounded-md border border-amber-500 bg-amber-200/45 dark:bg-amber-800/35"
                  style={{ top: `${previewTopPx}px`, height: `${previewHeightPx}px` }}
                >
                  <div className="px-2 py-1 text-[10px] font-semibold text-amber-900 dark:text-amber-100">
                    {minutesToHHMM(calendarDropPreviewMinutes ?? 0)}
                  </div>
                </div>
              )}

              {timelineBlocks.map(({ item, start, end }, idx) => {
                const top = (start / 60) * 64;
                const height = Math.max(28, ((end - start) / 60) * 64);
                const itemKey = `${item.kind}-${item.source_id ?? idx}-${start}`;
                return (
                  <div
                    key={itemKey}
                    className={`absolute left-2 right-2 px-2 py-1 text-xs shadow-sm ${item.kind === "break" ? "rounded-none border-0" : "rounded-md border"} ${timelineItemClass(item.kind)} ${item.kind === "task" && item.work_item_id ? "cursor-grab active:cursor-grabbing" : ""}`}
                    style={{
                      top: `${top}px`,
                      height: `${height}px`,
                      ...timelineItemStyle(item),
                    }}
                    draggable={item.kind === "task" && !!item.work_item_id}
                    onDragStart={(event) => {
                      if (item.kind !== "task" || !item.work_item_id) return;
                      onTaskDragStart(event, item.work_item_id, calendarData.user_id);
                    }}
                    onDragEnd={onTaskDragEnd}
                    onClick={() => {
                      if (item.kind === "task" && item.work_item_id) {
                        void openEditWorkItemModal(item.work_item_id);
                      }
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold truncate">{item.emoji ? `${item.emoji} ` : ""}{item.title}</div>
                      <div className="text-[10px] opacity-80">{item.start_time} - {item.end_time}</div>
                    </div>

                    {item.kind === "task" && (
                      <div className="mt-1 text-[11px] opacity-90">
                        {item.client_name || "Senza cliente"}
                        {item.status ? ` · ${item.status}` : ""}
                        {(item.effective_load_hours != null || item.estimated_hours != null) ? ` · ${formatHours(item.affects_daily_load === false ? 0 : item.effective_load_hours ?? item.estimated_hours ?? 0)} eff${item.estimated_hours != null ? ` · ${formatHours(item.estimated_hours)} st` : ""}` : ""}
                      </div>
                    )}

                    {item.kind === "task" && item.work_item_id && <div className="mt-1 text-[10px] underline underline-offset-2">Apri task</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderMainView = () => {
    if (loading) {
      return <div className="py-8 flex items-center justify-center"><Spinner size="md" /></div>;
    }

    if (viewMode === "accordion") return renderAccordionView();
    if (viewMode === "complete") return renderCompleteView();
    if (viewMode === "heatmap") return renderHeatmapView();
    if (viewMode === "griglia") return renderGridView();
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

          <button
            type="button"
            className="wl-new-task-btn"
            onClick={openNewWorkModal}
          >
            <Icon name="plus" className="w-3.5 h-3.5" />
            Nuova lavorazione
          </button>
          <button
            type="button"
            className="wl-new-task-btn"
            onClick={() => setTeamModalOpen(true)}
          >
            <Icon name="users" className="w-3.5 h-3.5" />
            Team e capacità
          </button>

          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-cream p-2 dark:border-line-dark dark:bg-[#1c1c20]">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void handlePreviewWorkload()}
              loading={engineRunning}
              disabled={!selectedCompanyId}
            >
              <Icon name="eye" className="h-3.5 w-3.5" />
              Simula workload
            </Button>
            {canManageProfiles && (
              <Button
                size="sm"
                variant="primary"
                onClick={() => void handleApplyWorkload()}
                loading={engineRunning}
                disabled={!selectedCompanyId}
              >
                <Icon name="check" className="h-3.5 w-3.5" />
                Applica workload
              </Button>
            )}
          </div>
        </div>

        <div className="wl-day-row">
          <div className="wl-view-label">
            {viewMode === "accordion" && "Workload team - vista ibrida"}
            {viewMode === "complete" && "Vista completa per area"}
            {viewMode === "heatmap" && "Heatmap per area e giorno"}
            {viewMode === "calendar" && "Calendario workload"}
            {viewMode === "griglia" && "Griglia allocazioni per giorno"}
            {viewMode === "accordion" && (
              <div className="mt-1 text-[11px] normal-case tracking-normal font-normal text-muted dark:text-muted-dark">
                La percentuale di carico indica le ore occupate rispetto alla capacità nel periodo selezionato: giorno, settimana o mese.
              </div>
            )}
          </div>

          <div className="wl-day-strip">
            {(viewMode === "calendar" && calendarData ? calendarData.days.map((d) => d.date) : visibleDays).map((day) => {
              const meta = formatDayChip(day);
              const isActive = selectedDay === day;
              const calendarDay = viewMode === "calendar" ? calendarData?.days.find((d) => d.date === day) : undefined;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => {
                    setSelectedDay(day);
                    if (rangeMode === "day") {
                      setAnchorDate(day);
                    }
                  }}
                  onDragOver={(event) => {
                    if (draggingTaskId == null) return;
                    event.preventDefault();
                    if (viewMode === "accordion") {
                      setActiveDropTarget(`acc-day-${day}`);
                      return;
                    }
                    if (viewMode === "calendar") {
                      setActiveDropTarget(`cal-day-${day}`);
                    }
                  }}
                  onDragLeave={() => {
                    if (viewMode === "accordion") {
                      setActiveDropTarget((current) => (current === `acc-day-${day}` ? null : current));
                      return;
                    }
                    if (viewMode === "calendar") {
                      setActiveDropTarget((current) => (current === `cal-day-${day}` ? null : current));
                    }
                  }}
                  onDrop={(event) => {
                    if (viewMode === "accordion") {
                      setSelectedDay(day);
                      void moveTaskByDrop(event, buildAccordionDayMovePayload(day), `acc-day-${day}`);
                      return;
                    }
                    if (viewMode === "calendar") {
                      setSelectedDay(day);
                      void moveTaskByDrop(event, buildCalendarDayMovePayload(day), `cal-day-${day}`);
                    }
                  }}
                  className={`wl-day-chip ${isActive ? "is-active" : ""} ${(viewMode === "accordion" && activeDropTarget === `acc-day-${day}`) || (viewMode === "calendar" && activeDropTarget === `cal-day-${day}`) ? "ring-2 ring-inset ring-amber-500 bg-amber-50/70 dark:bg-amber-900/35" : ""}`}
                >
                  <div className="text-[10px] uppercase tracking-wider">{meta.weekday}</div>
                  <div className="text-xs font-semibold">{meta.day}</div>
                  {calendarDay && (
                    <div className="text-[10px] text-muted dark:text-muted-dark">
                      {calendarDay.tasks_count}t · {calendarDay.schedule_windows_count}r
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <button type="button" className="wl-sort-btn" onClick={onToggleSortByLoad}>
            <Icon name="list" className="w-3.5 h-3.5" />
            Ordina per carico {sortDir === "desc" ? "↓" : "↑"}
          </button>
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

      {engineModalOpen && engineResult && (
        <Modal
          open={engineModalOpen}
          onClose={() => setEngineModalOpen(false)}
          title="Risultati Workload Engine"
          size="lg"
          footer={
            <>
              <Button variant="ghost" onClick={() => setEngineModalOpen(false)}>
                Chiudi
              </Button>
              {canManageProfiles && (
                <Button
                  variant="primary"
                  onClick={() => void handleApplyWorkload()}
                  loading={engineRunning}
                >
                  Applica allocazioni
                </Button>
              )}
            </>
          }
        >
          <div className="flex flex-col gap-4">
            {engineError && (
              <div className="rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
                {engineError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-line bg-cream p-3 dark:border-line-dark dark:bg-[#1c1c20]">
                <p className="text-xs font-semibold text-muted dark:text-muted-dark">Totali</p>
                <p className="mt-1 text-lg font-bold text-ink dark:text-paper">{engineResult.total_tasks}</p>
              </div>
              <div className="rounded-lg border border-line bg-cream p-3 dark:border-line-dark dark:bg-[#1c1c20]">
                <p className="text-xs font-semibold text-muted dark:text-muted-dark">Allocate</p>
                <p className="mt-1 text-lg font-bold text-success">{engineResult.allocated_tasks}</p>
              </div>
              <div className="rounded-lg border border-line bg-cream p-3 dark:border-line-dark dark:bg-[#1c1c20]">
                <p className="text-xs font-semibold text-muted dark:text-muted-dark">Ore totali</p>
                <p className="mt-1 text-lg font-bold text-ink dark:text-paper">{engineResult.total_effective_hours.toFixed(1)}h</p>
              </div>
              <div
                className={`rounded-lg border p-3 ${
                  engineResult.total_overload_hours > 0
                    ? "border-danger/30 bg-danger/5"
                    : "border-success/30 bg-success/5"
                }`}
              >
                <p className="text-xs font-semibold text-muted dark:text-muted-dark">Overload</p>
                <p
                  className={`mt-1 text-lg font-bold ${
                    engineResult.total_overload_hours > 0 ? "text-danger" : "text-success"
                  }`}
                >
                  {engineResult.total_overload_hours.toFixed(1)}h
                </p>
              </div>
            </div>

            <div className="rounded-md border border-line bg-cream/60 px-3 py-2 dark:border-line-dark dark:bg-[#1c1c20]">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Strategia</p>
              <p className="mt-1 text-sm text-ink dark:text-paper">
                {engineResult.strategy} {engineResult.strategy_version && `(${engineResult.strategy_version})`}
              </p>
              <p className="text-xs text-muted dark:text-muted-dark">
                Capacità giornaliera: {engineResult.daily_capacity_hours}h
              </p>
            </div>

            <div className="max-h-96 overflow-y-auto">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
                Allocazioni task ({engineResult.tasks.length})
              </p>
              <div className="flex flex-col gap-2">
                {engineResult.tasks.map((task) => (
                  <div
                    key={task.task_id}
                    className={`rounded-md border p-2.5 text-xs ${
                      task.conflict_code
                        ? "border-danger/30 bg-danger/5"
                        : "border-success/30 bg-success/5"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-ink dark:text-paper">#{task.task_id} {task.title}</p>
                        <p className="mt-1 text-[11px] text-muted dark:text-muted-dark">
                          {task.start_date} → {task.end_date} · {task.estimated_hours}h stimate · {task.effective_hours.toFixed(1)}h effettive
                        </p>
                      </div>
                      {task.overload_hours > 0 && (
                        <span className="inline-flex items-center rounded-full bg-danger/10 px-2 py-1 text-[10px] font-semibold text-danger">
                          +{task.overload_hours.toFixed(1)}h
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}

      <WorkItemFormModal
        open={newWorkModalOpen}
        onClose={() => { setNewWorkModalOpen(false); setQuickAdd(null); setEditingItem(null); }}
        editingItem={editingItem}
        companyId={selectedCompanyId!}
        isAdmin={!!permissions?.is_admin}
        defaultWorkDate={quickAdd?.day ?? selectedDay ?? getTodayDate()}
        defaultAssigneeIds={quickAdd ? [quickAdd.userId] : undefined}
        onSaved={() => { setQuickAdd(null); setEditingItem(null); loadMain(); }}
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