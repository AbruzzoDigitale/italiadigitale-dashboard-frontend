import { useCallback, useEffect, useRef, useState, type DragEvent, type MouseEvent } from "react";
import type {
  WorkloadCalendarConflict,
  WorkloadComputedStatus,
  WorkloadTimelineItem,
  WorkloadUserCalendarDayResponse,
} from "../../api/workload";
import type { WorkItem, WorkItemSwapEffectivePosition } from "../../api/workItems";
import { Badge } from "../ui/Badge";
import { Icon } from "../ui/Icon";
import {
  CALENDAR_CREATE_SLOT_MINUTES,
  CALENDAR_HOUR_HEIGHT_PX,
  CALENDAR_INITIAL_SCROLL_OFFSET_PX,
  CALENDAR_SLOT_MINUTES,
  clampTimelineInRange,
  formatHours,
  getReadableTaskTextColors,
  hhmmToMinutes,
  isTimelineNonDeferrable,
  isTimelineTaskPriority,
  layoutCalendarTimelineBlocks,
  minutesToHHMM,
  normalizeCalendarCreateRange,
  resolveTimelineClientLabel,
  resolveTimelineEffectiveHours,
  resolveTimelineEffectiveWeight,
  resolveTimelineEstimatedHours,
  resolveTimelineScheduleState,
  resolveTimelineTaskColor,
  resolveTimelineTaskTitle,
  snapMinutesToSlotInRange,
  timelineItemClass,
  timelineItemStyle,
  timelineItemZIndex,
  type CalendarCreatePreview,
  type CalendarResizeState,
} from "./calendarUtils";

// Stato salvataggio per le task (mostra spinner/animazione di uscita).
export type CalendarTaskUiState = "saving" | "exiting";

export interface OperatorCalendarColumnBounds {
  dayStartMinutes: number;
  dayEndMinutes: number;
  totalMinutes: number;
  hourSlots: number;
  halfSlots: number;
  openingMinutes: number | null;
  closingMinutes: number | null;
}

export interface OperatorCalendarColumnProps {
  data: WorkloadUserCalendarDayResponse;
  bounds: OperatorCalendarColumnBounds;
  nowMinutes: number;
  /** Stato di carico per il badge in intestazione (dalla summary). */
  summaryStatus?: WorkloadComputedStatus | null;
  /** Vista multi-operatore: colonna più stretta. */
  compact?: boolean;
  // ── Drag condiviso tra colonne (per riassegnazione cross-colonna) ──
  draggedTaskId: number | null;
  draggedFromOperatorId: number | null;
  onTaskDragStart: (taskId: number, fromOperatorId: number) => void;
  onTaskDragEnd: () => void;
  // ── Persistenza: il parent esegue API + reload del proprio operatore ──
  onOpenEdit: (workItemId: number) => void;
  onCreateByDrag: (args: { startTime: string; estimatedHours: number }) => void;
  /** Riposiziona una task dello stesso operatore in uno slot. */
  onMove: (taskId: number, startTimeHHMM: string) => void;
  /** Drop da un'altra colonna: riassegna a questo operatore e posiziona. */
  onReassign: (taskId: number, fromOperatorId: number, startTimeHHMM: string) => void;
  /** Anteprima swap (solo intra-colonna). Ritorna can_swap. */
  previewSwap: (sourceId: number, targetIds: number[], positions?: WorkItemSwapEffectivePosition[]) => Promise<boolean>;
  onSwap: (sourceId: number, targetIds: number[], positions?: WorkItemSwapEffectivePosition[]) => void;
  onResize: (taskId: number, endTimeHHMM: string) => void;
  onToggleComplete: (item: WorkloadTimelineItem) => void;
  onCompleteOverCapacity: (taskId: number) => void;
  onRescheduleOverflow: (taskId: number) => void;
  reschedulingTaskId: number | null;
  /** Task in salvataggio/uscita (per disabilitare i controlli). */
  taskUiState?: Record<number, CalendarTaskUiState>;
  onOpenConflicts?: () => void;
  /** Mostra/nascondi le task in revisione. */
  showReview?: boolean;
}

// ── Piccoli helper locali (status badge + label cliente over-capacity) ──────────────
function statusBadgeVariant(status: WorkloadComputedStatus) {
  if (status === "overload") return "danger" as const;
  if (status === "warning") return "warning" as const;
  if (status === "ok" || status === "active") return "success" as const;
  if (status === "empty") return "default" as const;
  return "info" as const;
}

function statusLabel(status: WorkloadComputedStatus) {
  switch (status) {
    case "overload": return "Overload";
    case "warning": return "Warning";
    case "ok": return "OK";
    case "active": return "Attivo";
    case "vacation": return "Ferie";
    case "sick": return "Malattia";
    case "unavailable": return "Non disp.";
    case "part_time": return "Part-time";
    case "empty": return "Vuoto";
    default: return status;
  }
}

function resolveWorkItemClientLabel(task: WorkItem | null | undefined, fallback?: string | null) {
  const client = (task as (WorkItem & { client?: { commercial_name?: string | null; name?: string | null } | null }) | null | undefined)?.client ?? null;
  return client?.commercial_name || client?.name || fallback || "Senza cliente";
}

function isCalendarTaskDone(item: WorkloadTimelineItem) {
  return item.kind === "task" && (item.status === "completed" || item.status === "done");
}

function isCalendarTaskActionClick(event: MouseEvent<HTMLElement>) {
  const target = event.target as HTMLElement | null;
  return !!target?.closest('[data-cal-complete-btn="true"]');
}

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function OperatorCalendarColumn({
  data,
  bounds,
  nowMinutes,
  summaryStatus,
  compact = false,
  draggedTaskId,
  draggedFromOperatorId,
  onTaskDragStart,
  onTaskDragEnd,
  onOpenEdit,
  onCreateByDrag,
  onMove,
  onReassign,
  previewSwap,
  onSwap,
  onResize,
  onToggleComplete,
  onCompleteOverCapacity,
  onRescheduleOverflow,
  reschedulingTaskId,
  taskUiState,
  onOpenConflicts,
  showReview = true,
}: OperatorCalendarColumnProps) {
  const operatorId = data.user_id;

  // ── Stato UI locale alla colonna ──
  const [dropPreviewMinutes, setDropPreviewMinutes] = useState<number | null>(null);
  const [createPreview, setCreatePreview] = useState<CalendarCreatePreview | null>(null);
  const [resizeState, setResizeState] = useState<CalendarResizeState | null>(null);
  const [swapPreview, setSwapPreview] = useState<{ targetIds: number[]; canSwap: boolean | null } | null>(null);
  const [gridDropActive, setGridDropActive] = useState(false);
  const createDragStartRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const autoScrollRafRef = useRef<number | null>(null);
  const pointerYRef = useRef<number>(0);
  const initialScrollKeyRef = useRef<string | null>(null);
  const swapHoverKeyRef = useRef<string | null>(null);
  const swapSeqRef = useRef(0);

  const {
    dayStartMinutes,
    dayEndMinutes,
    totalMinutes,
    hourSlots,
    halfSlots,
    openingMinutes,
    closingMinutes,
  } = bounds;

  const getUiState = (workItemId?: number | null) =>
    typeof workItemId === "number" ? taskUiState?.[workItemId] : undefined;

  // ── Auto-scroll della colonna durante il drag verso i bordi alto/basso ──
  const stopAutoScroll = useCallback(() => {
    if (autoScrollRafRef.current != null) {
      cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = null;
    }
  }, []);

  const tickAutoScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      autoScrollRafRef.current = null;
      return;
    }
    const rect = el.getBoundingClientRect();
    const edge = 70;
    const maxSpeed = 20;
    const y = pointerYRef.current;
    let delta = 0;
    if (y < rect.top + edge) {
      delta = -maxSpeed * Math.min(1, (rect.top + edge - y) / edge);
    } else if (y > rect.bottom - edge) {
      delta = maxSpeed * Math.min(1, (y - (rect.bottom - edge)) / edge);
    }
    if (delta !== 0) el.scrollTop += delta;
    autoScrollRafRef.current = requestAnimationFrame(tickAutoScroll);
  }, []);

  const handleAutoScrollDragOver = useCallback((clientY: number) => {
    pointerYRef.current = clientY;
    if (autoScrollRafRef.current == null) {
      autoScrollRafRef.current = requestAnimationFrame(tickAutoScroll);
    }
  }, [tickAutoScroll]);

  useEffect(() => () => stopAutoScroll(), [stopAutoScroll]);

  // ── Swap preview (debounced per gruppo target) ──
  const clearSwapPreview = useCallback(() => {
    swapSeqRef.current += 1;
    swapHoverKeyRef.current = null;
    setSwapPreview(null);
  }, []);

  const requestSwapPreview = useCallback(async (sourceId: number, targetIds: number[], positions?: WorkItemSwapEffectivePosition[]) => {
    if (targetIds.length === 0) {
      clearSwapPreview();
      return;
    }
    const key = `${sourceId}->${[...targetIds].sort((a, b) => a - b).join(",")}`;
    if (swapHoverKeyRef.current === key) return;
    swapHoverKeyRef.current = key;
    setSwapPreview({ targetIds, canSwap: null });
    const seq = ++swapSeqRef.current;
    const canSwap = await previewSwap(sourceId, targetIds, positions);
    if (seq !== swapSeqRef.current) return;
    setSwapPreview({ targetIds, canSwap });
  }, [clearSwapPreview, previewSwap]);

  // ── Resize: listener globali finché si trascina la maniglia ──
  useEffect(() => {
    if (!resizeState) return;
    const onMouseMove = (event: globalThis.MouseEvent) => {
      const deltaMinutes = ((event.clientY - resizeState.startClientY) / CALENDAR_HOUR_HEIGHT_PX) * 60;
      const nextEndMinutes = snapMinutesToSlotInRange(
        resizeState.originalEndMinutes + deltaMinutes,
        resizeState.minEndMinutes,
        resizeState.maxEndMinutes,
      );
      setResizeState((current) => (current ? { ...current, currentEndMinutes: nextEndMinutes } : current));
    };
    const onMouseUp = () => {
      // Commit FUORI dall'updater di stato (chiamare onResize dentro setState
      // = setState del parent durante il render). resizeState nel closure è aggiornato
      // perché l'effetto si ri-esegue ad ogni cambio di resizeState.
      if (resizeState.currentEndMinutes !== resizeState.originalEndMinutes) {
        onResize(resizeState.workItemId, minutesToHHMM(resizeState.currentEndMinutes));
      }
      setResizeState(null);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp, { once: true });
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [resizeState, onResize]);

  // ── Scroll iniziale verso l'ora corrente ──
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const dayKey = `${data.user_id}-${data.selected_date}`;
    if (initialScrollKeyRef.current === dayKey) return;
    const roundedDownMinutes = Math.floor(nowMinutes / CALENDAR_SLOT_MINUTES) * CALENDAR_SLOT_MINUTES;
    const boundedMinutes = Math.max(dayStartMinutes, Math.min(dayEndMinutes - CALENDAR_SLOT_MINUTES, roundedDownMinutes));
    const targetTop = ((boundedMinutes - dayStartMinutes) / 60) * CALENDAR_HOUR_HEIGHT_PX;
    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    container.scrollTop = Math.max(0, Math.min(maxScrollTop, targetTop - CALENDAR_INITIAL_SCROLL_OFFSET_PX));
    initialScrollKeyRef.current = dayKey;
  }, [data.user_id, data.selected_date, dayStartMinutes, dayEndMinutes, nowMinutes]);

  const roleLabel = data.roles.map((role) => role.name).join(", ");
  const displayName = data.full_name || data.username;
  const avatarInitials = displayName.split(" ").filter(Boolean).slice(0, 2).map((c) => c[0]?.toUpperCase() ?? "").join("") || "?";

  // Mostra la task nel suo giorno EFFETTIVO (effective_work_date): le arretrate
  // compaiono nel giorno di recupero, non da assegnazione a scadenza.
  const dayTimeline = data.timeline.filter((item) => {
    if (item.kind !== "task") return true;
    if (!showReview && (item.is_review === true || item.status === "review")) return false;
    const state = resolveTimelineScheduleState(item);
    const assignDay = (state?.effective_work_date ?? item.task?.work_date ?? "").slice(0, 10);
    return !assignDay || assignDay === data.selected_date;
  });
  const timedItems = dayTimeline.filter((item) => !item.is_all_day && !!item.start_time && !!item.end_time);
  const unscheduledTaskItems = dayTimeline.filter((item) => item.kind === "task" && (item.is_all_day || !item.start_time || !item.end_time));
  const overCapacity = data.over_capacity;
  const calendarConflicts: WorkloadCalendarConflict[] = data.conflicts ?? [];

  const showEndLabel = closingMinutes != null && closingMinutes > dayStartMinutes && closingMinutes < dayEndMinutes;
  const showOpeningLine = openingMinutes != null && openingMinutes > dayStartMinutes && openingMinutes < dayEndMinutes;
  const isToday = data.selected_date === todayIso();
  const showNowLine = isToday && nowMinutes >= dayStartMinutes && nowMinutes <= dayEndMinutes;
  const nowTopPx = ((nowMinutes - dayStartMinutes) / 60) * CALENDAR_HOUR_HEIGHT_PX;

  // Task in revisione: "fantasma" non interattivo. Il PM le vede ma non le apre/sposta,
  // e soprattutto NON occupano lo slot dell'operatore (non bloccano nuovi inserimenti).
  const isReviewItem = (item: WorkloadTimelineItem) =>
    item.kind === "task" && (item.is_review === true || item.status === "review");

  const timelineBlocks = timedItems.map((item) => {
    const start = hhmmToMinutes(item.start_time) ?? 0;
    const end = hhmmToMinutes(item.end_time) ?? start + Math.max(30, Math.round(resolveTimelineEffectiveHours(item) * 60));
    const safe = clampTimelineInRange(start, end, dayStartMinutes, dayEndMinutes);
    if (safe.end <= dayStartMinutes || safe.start >= dayEndMinutes) return null;
    return { item, start: safe.start, end: safe.end };
  }).filter((b): b is { item: WorkloadTimelineItem; start: number; end: number } => !!b);
  const laidOutTimelineBlocks = layoutCalendarTimelineBlocks(timelineBlocks);

  const totalTaskHours = dayTimeline.filter((i) => i.kind === "task").reduce((acc, i) => acc + resolveTimelineEffectiveHours(i), 0);
  const taskCount = dayTimeline.filter((i) => i.kind === "task").length;

  const dayMeta = (() => {
    const [y, m, d] = data.selected_date.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "short" });
  })();

  const previewTopPx = dropPreviewMinutes != null ? ((dropPreviewMinutes - dayStartMinutes) / 60) * CALENDAR_HOUR_HEIGHT_PX : null;
  const previewHeightPx = (CALENDAR_SLOT_MINUTES / 60) * CALENDAR_HOUR_HEIGHT_PX;
  const createPreviewTopPx = createPreview ? ((createPreview.startMinutes - dayStartMinutes) / 60) * CALENDAR_HOUR_HEIGHT_PX : null;
  const createPreviewHeightPx = createPreview ? Math.max(18, ((createPreview.endMinutes - createPreview.startMinutes) / 60) * CALENDAR_HOUR_HEIGHT_PX) : null;

  const isCreationBlocked = (event: MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement | null;
    return !!target?.closest('[data-calendar-task-block="true"], [data-cal-complete-btn="true"]');
  };

  const getGridMinutes = (event: MouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const relativeY = Math.max(0, Math.min(rect.height - 1, event.clientY - rect.top));
    const rawMinutes = (relativeY / CALENDAR_HOUR_HEIGHT_PX) * 60 + dayStartMinutes;
    return snapMinutesToSlotInRange(rawMinutes, dayStartMinutes, dayEndMinutes, CALENDAR_CREATE_SLOT_MINUTES);
  };

  const getDropMinutes = (event: DragEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const relativeY = Math.max(0, Math.min(rect.height - 1, event.clientY - rect.top));
    const rawMinutes = (relativeY / CALENDAR_HOUR_HEIGHT_PX) * 60 + dayStartMinutes;
    return snapMinutesToSlotInRange(rawMinutes, dayStartMinutes, dayEndMinutes);
  };

  const isRangeOccupied = (startMinutes: number, endMinutes: number) =>
    timelineBlocks.some((block) => !isReviewItem(block.item) && startMinutes < block.end && endMinutes > block.start);

  // Gruppo target dello swap (solo intra-colonna): task coperte dalla finestra della task trascinata.
  const computeSwapTargetIds = (targetStart: number, targetEnd: number): number[] => {
    const sourceBlock = timelineBlocks.find((b) => b.item.kind === "task" && b.item.work_item_id === draggedTaskId);
    const sourceDuration = sourceBlock
      ? Math.max(CALENDAR_SLOT_MINUTES, sourceBlock.end - sourceBlock.start)
      : Math.max(CALENDAR_SLOT_MINUTES, targetEnd - targetStart);
    const windowStart = targetStart;
    const windowEnd = windowStart + sourceDuration;
    return timelineBlocks
      .filter((b) => b.item.kind === "task" && !isReviewItem(b.item) && typeof b.item.work_item_id === "number" && b.item.work_item_id !== draggedTaskId && b.start < windowEnd && b.end > windowStart)
      .map((b) => b.item.work_item_id as number);
  };

  // Posizioni MOSTRATE (reflow) delle task coinvolte: il backend le usa per swappare
  // davvero le trascinate (il loro start_time salvato non corrisponde a dove appaiono).
  const buildEffectivePositions = (ids: number[]): WorkItemSwapEffectivePosition[] =>
    ids
      .map((id) => {
        const b = timelineBlocks.find((bl) => bl.item.kind === "task" && bl.item.work_item_id === id);
        if (!b || !b.item.date) return null;
        return { work_item_id: id, work_date: String(b.item.date).slice(0, 10), start_minutes: b.start };
      })
      .filter((p): p is WorkItemSwapEffectivePosition => p !== null);

  const openQuickAdd = (preview: CalendarCreatePreview) => {
    if (isRangeOccupied(preview.startMinutes, preview.endMinutes)) {
      setCreatePreview(null);
      createDragStartRef.current = null;
      return;
    }
    const durationHours = (preview.endMinutes - preview.startMinutes) / 60;
    onCreateByDrag({ startTime: minutesToHHMM(preview.startMinutes), estimatedHours: durationHours });
    setCreatePreview(null);
    createDragStartRef.current = null;
  };

  // È uno swap valido (stessa colonna, target diverso dalla task trascinata)?
  const isIntraColumnSwap = (targetItemId: number | null) =>
    draggedTaskId != null && draggedFromOperatorId === operatorId && targetItemId != null && targetItemId !== draggedTaskId;

  const handleGridDrop = (event: DragEvent<HTMLElement>) => {
    if (draggedTaskId == null) return;
    const minutes = dropPreviewMinutes ?? getDropMinutes(event);
    setGridDropActive(false);
    setDropPreviewMinutes(null);
    const startTime = minutesToHHMM(minutes);
    if (draggedFromOperatorId === operatorId) {
      onMove(draggedTaskId, startTime);
    } else {
      onReassign(draggedTaskId, draggedFromOperatorId as number, startTime);
    }
  };

  return (
    <div className={`flex flex-col gap-4 ${compact ? "min-w-[320px] flex-1" : ""}`}>
      {/* Intestazione operatore */}
      {compact ? (
        // Multi-vista: header ad altezza FISSA e riga singola, così tutte le colonne
        // affiancate hanno la stessa altezza e le griglie restano allineate.
        <div className="flex h-[60px] items-center gap-2 rounded-lg border border-line dark:border-line-dark bg-paper dark:bg-ink-soft px-3">
          {data.avatar_url ? (
            <img src={data.avatar_url} alt={displayName} className="h-8 w-8 shrink-0 rounded-full object-cover border border-line dark:border-line-dark" />
          ) : (
            <div className="h-8 w-8 shrink-0 rounded-full border border-line dark:border-line-dark bg-cream dark:bg-ink-2 text-[11px] font-semibold text-ink dark:text-paper flex items-center justify-center">
              {avatarInitials}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-ink dark:text-paper">{displayName}</div>
            <div className="truncate text-[11px] text-muted dark:text-muted-dark">
              {taskCount} task · {totalTaskHours > 0 ? formatHours(totalTaskHours) : "Libero"}
            </div>
          </div>
          {summaryStatus && (
            <Badge variant={statusBadgeVariant(summaryStatus)}>{statusLabel(summaryStatus)}</Badge>
          )}
          {calendarConflicts.length > 0 && onOpenConflicts && (
            <button
              type="button"
              onClick={onOpenConflicts}
              className="relative inline-flex shrink-0 items-center gap-1 rounded-md border border-warning/35 bg-warning/10 px-1.5 py-1 text-warning transition-colors hover:bg-warning/15"
              title="Mostra conflitti rilevati"
            >
              <Icon name="alert-triangle" className="h-3.5 w-3.5" />
              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-warning px-1 text-[10px] font-bold text-paper">
                {calendarConflicts.length}
              </span>
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-line dark:border-line-dark bg-paper dark:bg-ink-soft p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2">
              {data.avatar_url ? (
                <img src={data.avatar_url} alt={displayName} className="h-9 w-9 rounded-full object-cover border border-line dark:border-line-dark" />
              ) : (
                <div className="h-9 w-9 rounded-full border border-line dark:border-line-dark bg-cream dark:bg-ink-2 text-[11px] font-semibold text-ink dark:text-paper flex items-center justify-center">
                  {avatarInitials}
                </div>
              )}
              <div>
                <div className="text-sm font-semibold text-ink dark:text-paper">{displayName}</div>
                <div className="text-xs text-muted dark:text-muted-dark">{roleLabel || "Nessun ruolo"} · {dayMeta}</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant={summaryStatus ? statusBadgeVariant(summaryStatus) : "default"}>
                {summaryStatus ? statusLabel(summaryStatus) : "N/D"}
              </Badge>
              <span className="rounded-md border border-line dark:border-line-dark px-2 py-1 text-muted dark:text-muted-dark">
                {totalTaskHours > 0 ? `${formatHours(totalTaskHours)} task` : "Libero"}
              </span>
              <span className="rounded-md border border-line dark:border-line-dark px-2 py-1 text-muted dark:text-muted-dark">
                {taskCount} task · {dayTimeline.length} eventi
              </span>
              {calendarConflicts.length > 0 && onOpenConflicts && (
                <button
                  type="button"
                  onClick={onOpenConflicts}
                  className="relative inline-flex items-center gap-1 rounded-md border border-warning/35 bg-warning/10 px-2 py-1 text-warning transition-colors hover:bg-warning/15"
                  title="Mostra conflitti rilevati"
                >
                  <Icon name="alert-triangle" className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider">Conflitti</span>
                  <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-warning px-1 text-[10px] font-bold text-paper">
                    {calendarConflicts.length}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Griglia oraria */}
      <div className="rounded-lg border border-line dark:border-line-dark bg-paper dark:bg-ink-soft overflow-hidden">
        <div
          ref={scrollRef}
          className="max-h-[70vh] overflow-y-auto"
          onDragOver={(event) => handleAutoScrollDragOver(event.clientY)}
          onDragLeave={stopAutoScroll}
          onDrop={stopAutoScroll}
          onDragEnd={stopAutoScroll}
        >
          <div className="grid grid-cols-[68px_1fr]">
            <div className="relative border-r border-line dark:border-line-dark bg-cream/50 dark:bg-ink-2">
              {Array.from({ length: hourSlots }, (_, index) => {
                const minutes = dayStartMinutes + index * 60;
                return (
                  <div key={minutes} className="h-16 px-2 py-1 text-[10px] text-muted dark:text-muted-dark border-b border-line/50 dark:border-line-dark/60">
                    {minutesToHHMM(minutes)}
                  </div>
                );
              })}
              {showEndLabel && (
                <div className="absolute bottom-1 left-2 text-[10px] text-muted dark:text-muted-dark">{minutesToHHMM(dayEndMinutes)}</div>
              )}
            </div>

            <div
              className={`relative ${draggedTaskId == null ? "cursor-copy" : ""} ${gridDropActive ? "ring-1 ring-inset ring-amber-500 bg-amber-50/30 dark:bg-amber-900/15" : ""}`}
              style={{ height: `${(totalMinutes / 60) * CALENDAR_HOUR_HEIGHT_PX}px` }}
              onMouseMove={(event) => {
                if (draggedTaskId != null || isCreationBlocked(event)) return;
                const minutes = getGridMinutes(event);
                const anchorMinutes = createDragStartRef.current;
                if (anchorMinutes != null) {
                  const range = normalizeCalendarCreateRange(anchorMinutes, minutes, dayEndMinutes);
                  setCreatePreview(isRangeOccupied(range.startMinutes, range.endMinutes) ? null : range);
                  return;
                }
                const slotEnd = Math.min(dayEndMinutes, minutes + CALENDAR_CREATE_SLOT_MINUTES);
                if (isRangeOccupied(minutes, slotEnd)) { setCreatePreview(null); return; }
                setCreatePreview({ startMinutes: minutes, endMinutes: slotEnd, isDragging: false });
              }}
              onMouseDown={(event) => {
                if (event.button !== 0 || draggedTaskId != null || isCreationBlocked(event)) return;
                const minutes = getGridMinutes(event);
                const slotEnd = Math.min(dayEndMinutes, minutes + CALENDAR_CREATE_SLOT_MINUTES);
                if (isRangeOccupied(minutes, slotEnd)) return;
                event.preventDefault();
                createDragStartRef.current = minutes;
                setCreatePreview({ startMinutes: minutes, endMinutes: slotEnd, isDragging: true });
              }}
              onMouseUp={(event) => {
                if (draggedTaskId != null || isCreationBlocked(event)) return;
                const anchorMinutes = createDragStartRef.current;
                if (anchorMinutes == null) return;
                const minutes = getGridMinutes(event);
                openQuickAdd(normalizeCalendarCreateRange(anchorMinutes, minutes, dayEndMinutes));
              }}
              onMouseLeave={() => { createDragStartRef.current = null; setCreatePreview(null); }}
              onDragOver={(event) => {
                if (draggedTaskId == null) return;
                event.preventDefault();
                clearSwapPreview();
                setGridDropActive(true);
                const rect = event.currentTarget.getBoundingClientRect();
                const relativeY = Math.max(0, Math.min(rect.height - 1, event.clientY - rect.top));
                const rawMinutes = (relativeY / CALENDAR_HOUR_HEIGHT_PX) * 60 + dayStartMinutes;
                setDropPreviewMinutes(snapMinutesToSlotInRange(rawMinutes, dayStartMinutes, dayEndMinutes));
              }}
              onDragLeave={() => {
                setGridDropActive(false);
                setDropPreviewMinutes(null);
                if (createDragStartRef.current == null) setCreatePreview(null);
              }}
              onDrop={handleGridDrop}
            >
              {Array.from({ length: hourSlots }, (_, index) => (
                <div key={`hour-${index}`} className="absolute left-0 right-0 border-b border-line/40 dark:border-line-dark/50" style={{ top: `${index * CALENDAR_HOUR_HEIGHT_PX}px` }} />
              ))}
              {Array.from({ length: halfSlots }, (_, index) => {
                if (index % 2 === 0) return null;
                return <div key={`half-${index}`} className="absolute left-0 right-0 border-b border-dashed border-line/30 dark:border-line-dark/40" style={{ top: `${(index * CALENDAR_HOUR_HEIGHT_PX) / 2}px` }} />;
              })}

              {showOpeningLine && (
                <div className="pointer-events-none absolute left-0 right-0 border-t-2 border-dashed border-emerald-500" style={{ top: `${((openingMinutes! - dayStartMinutes) / 60) * CALENDAR_HOUR_HEIGHT_PX}px`, zIndex: 40 }}>
                  <span className="absolute left-2 -top-3 rounded bg-emerald-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-paper shadow" style={{ zIndex: 41 }}>
                    Apertura {minutesToHHMM(openingMinutes!)}
                  </span>
                </div>
              )}

              {closingMinutes != null && closingMinutes > dayStartMinutes && closingMinutes < dayEndMinutes && (
                <div className="absolute left-0 right-0 border-t-2 border-dashed border-danger" style={{ top: `${((Math.min(dayEndMinutes, closingMinutes + 30) - dayStartMinutes) / 60) * CALENDAR_HOUR_HEIGHT_PX}px`, zIndex: 40 }}>
                  <span className="absolute right-2 -top-3 rounded bg-danger px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-paper shadow" style={{ zIndex: 41 }}>
                    Limite orario {minutesToHHMM(closingMinutes)}
                  </span>
                </div>
              )}

              {showNowLine && (
                <div className="pointer-events-none absolute left-0 right-0 border-t-2 border-solid border-red-600" style={{ top: `${nowTopPx}px`, zIndex: 45 }}>
                  <span className="absolute -left-1 -top-[5px] h-2.5 w-2.5 rounded-full bg-red-600 shadow" />
                  <span className="absolute right-2 -top-3 rounded bg-red-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-paper shadow" style={{ zIndex: 46 }}>
                    Ora {minutesToHHMM(nowMinutes)}
                  </span>
                </div>
              )}

              {draggedTaskId != null && previewTopPx != null && (
                <div className="pointer-events-none absolute left-2 right-2 rounded-md border border-amber-500 bg-amber-200/45 dark:bg-amber-800/35" style={{ top: `${previewTopPx}px`, height: `${previewHeightPx}px` }}>
                  <div className="px-2 py-1 text-[10px] font-semibold text-amber-900 dark:text-amber-100">{minutesToHHMM(dropPreviewMinutes ?? 0)}</div>
                </div>
              )}

              {draggedTaskId == null && createPreviewTopPx != null && createPreviewHeightPx != null && createPreview && !isRangeOccupied(createPreview.startMinutes, createPreview.endMinutes) && (
                <div className="pointer-events-none absolute left-2 right-2 rounded-md border-2 border-dashed border-emerald-500 bg-emerald-500/10 shadow-sm" style={{ top: `${createPreviewTopPx}px`, height: `${createPreviewHeightPx}px`, zIndex: 35 }}>
                  <div className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-paper">+</span>
                    {minutesToHHMM(createPreview.startMinutes)} - {minutesToHHMM(createPreview.endMinutes)}
                  </div>
                </div>
              )}

              {laidOutTimelineBlocks.map(({ item, start, end, column, totalColumns }, idx) => {
                const top = ((start - dayStartMinutes) / 60) * CALENDAR_HOUR_HEIGHT_PX;
                const activeResize = item.kind === "task" && item.work_item_id === resizeState?.workItemId ? resizeState : null;
                const isResizing = activeResize != null;
                const renderEnd = activeResize ? activeResize.currentEndMinutes : end;
                const height = Math.max(28, ((renderEnd - start) / 60) * CALENDAR_HOUR_HEIGHT_PX);
                const itemKey = `${item.kind}-${item.source_id ?? idx}-${start}`;
                const isDone = isCalendarTaskDone(item);
                const isExiting = item.kind === "task" && getUiState(item.work_item_id) === "exiting";
                const isPriority = item.kind === "task" && isTimelineTaskPriority(item);
                const isReview = isReviewItem(item);
                // Se questa colonna è quella del REVISORE della task in revisione, la task è
                // sua (peso REVIEWER_LOAD_FACTOR) e va resa interattiva/modificabile. Sulla
                // colonna dell'assegnatario resta invece "fantasma" non interattivo.
                const isReviewerHere = isReview && item.kind === "task" && item.task?.reviewer_user_id === operatorId;
                const scheduleState = item.kind === "task" ? resolveTimelineScheduleState(item) : null;
                const isCarriedOver = scheduleState?.delay_code === "carried_over";
                const isSevereDelay = scheduleState?.delay_code === "non_deferrable_overdue";
                const isNonDeferrable = item.kind === "task" && isTimelineNonDeferrable(item);
                const taskColor = item.kind === "task" ? resolveTimelineTaskColor(item) : null;
                const taskEstimatedHours = item.kind === "task" ? resolveTimelineEstimatedHours(item) : null;
                const taskEffectiveHoursValue = item.kind === "task" ? resolveTimelineEffectiveHours(item) : null;
                const taskEffectiveWeight = item.kind === "task" ? resolveTimelineEffectiveWeight(item) : null;
                const taskStyle = item.kind === "task" && taskColor ? { backgroundColor: taskColor, borderColor: taskColor } : undefined;
                const delayStyle = isSevereDelay
                  ? { backgroundColor: "rgba(220, 38, 38, 0.14)", borderColor: "#DC2626", color: "#7f1d1d" }
                  : isCarriedOver
                    ? { backgroundColor: "rgba(245, 158, 11, 0.16)", borderColor: "#F59E0B", color: "#78350f" }
                    : undefined;
                const priorityStyle = isPriority ? { boxShadow: "inset 3px 0 0 #E91E8A", borderLeftColor: "#E91E8A" } : undefined;
                // Revisione. Vista revisore: card interattiva con accento cyan tratteggiato.
                // Vista assegnatario: "fantasma" cyan sbiadito, non interattivo.
                const reviewStyle = !isReview
                  ? undefined
                  : isReviewerHere
                    ? {
                      borderColor: "color-mix(in srgb, #2ec3f3 60%, transparent)",
                      borderStyle: "dashed" as const,
                    }
                    : {
                      backgroundColor: "color-mix(in srgb, #2ec3f3 10%, transparent)",
                      borderColor: "color-mix(in srgb, #2ec3f3 45%, transparent)",
                      borderStyle: "dashed" as const,
                      boxShadow: "none",
                      opacity: 0.55,
                      cursor: "default" as const,
                      // Fantasma non interattivo: lascia passare il pointer così il
                      // rettangolo di creazione compare anche sopra le task in revisione.
                      pointerEvents: "none" as const,
                    };
                const itemStyle = item.kind === "task" ? { ...taskStyle, ...delayStyle, ...priorityStyle, ...reviewStyle } : timelineItemStyle(item);
                const readableText = item.kind === "task"
                  ? isSevereDelay
                    ? { primary: "#7f1d1d", secondary: "rgba(127,29,29,0.72)" }
                    : isCarriedOver
                      ? { primary: "#78350f", secondary: "rgba(120,53,15,0.72)" }
                      : getReadableTaskTextColors(taskColor)
                  : { primary: undefined, secondary: undefined };
                const isTaskColumned = item.kind === "task" && totalColumns > 1;
                const isTinyTask = item.kind === "task" && height < 38;
                const isCompactTask = item.kind === "task" && height < 56;
                const taskColumnStyle = isTaskColumned
                  ? {
                    left: `calc(8px + ((100% - 16px) / ${totalColumns}) * ${column} + ${column > 0 ? 2 : 0}px)`,
                    right: `calc(8px + ((100% - 16px) / ${totalColumns}) * ${totalColumns - column - 1} + ${column < totalColumns - 1 ? 2 : 0}px)`,
                  }
                  : undefined;
                const resizeWorkItemId = item.kind === "task" && typeof item.work_item_id === "number" ? item.work_item_id : null;
                const swapWorkItemId = item.kind === "task" && typeof item.work_item_id === "number" ? item.work_item_id : null;
                const isSwapTarget = swapWorkItemId != null && !!swapPreview?.targetIds.includes(swapWorkItemId);
                const swapRingClass = isSwapTarget
                  ? swapPreview?.canSwap === true ? "ring-2 ring-emerald-500"
                    : swapPreview?.canSwap === false ? "ring-2 ring-danger"
                      : "ring-2 ring-amber-400"
                  : "";
                return (
                  <div
                    key={itemKey}
                    data-calendar-task-block={item.kind === "task" ? "true" : undefined}
                    className={`group absolute left-2 right-2 overflow-hidden px-2 pr-8 py-1 text-xs shadow-sm ${item.kind === "break" ? "rounded-none border-0" : "rounded-md border"} ${timelineItemClass(item.kind)} ${item.kind === "task" && item.work_item_id && !isSevereDelay && (!isReview || isReviewerHere) ? "cursor-grab active:cursor-grabbing" : ""} ${isDone ? "opacity-70" : ""} ${isExiting ? "wl-cal-task-exit" : ""} ${isPriority ? "border-l-[3px] border-l-[#E91E8A]" : ""} ${isResizing ? "ring-2 ring-emerald-500" : ""} ${swapRingClass}`}
                    style={{ top: `${top}px`, height: `${height}px`, zIndex: timelineItemZIndex(item.kind), ...taskColumnStyle, ...itemStyle }}
                    onDragOver={(event) => {
                      if (!isIntraColumnSwap(swapWorkItemId)) return; // self / non-task / cross-colonna → bubble al move della griglia
                      event.preventDefault();
                      event.stopPropagation();
                      setDropPreviewMinutes(null);
                      setGridDropActive(false);
                      {
                        const tids = computeSwapTargetIds(start, end);
                        void requestSwapPreview(draggedTaskId as number, tids, buildEffectivePositions([draggedTaskId as number, ...tids]));
                      }
                    }}
                    onDrop={(event) => {
                      if (!isIntraColumnSwap(swapWorkItemId)) return;
                      event.preventDefault();
                      event.stopPropagation();
                      clearSwapPreview();
                      {
                        const tids = computeSwapTargetIds(start, end);
                        onSwap(draggedTaskId as number, tids, buildEffectivePositions([draggedTaskId as number, ...tids]));
                      }
                    }}
                    draggable={item.kind === "task" && !!item.work_item_id && !isSevereDelay && (!isReview || isReviewerHere) && !getUiState(item.work_item_id)}
                    onDragStart={() => {
                      if (item.kind !== "task" || !item.work_item_id || isSevereDelay || (isReview && !isReviewerHere)) return;
                      onTaskDragStart(item.work_item_id, operatorId);
                    }}
                    onDragEnd={() => { clearSwapPreview(); setDropPreviewMinutes(null); setGridDropActive(false); onTaskDragEnd(); }}
                    onClick={(event) => {
                      if (isCalendarTaskActionClick(event)) return;
                      if (item.kind === "task" && item.work_item_id && (!isReview || isReviewerHere)) onOpenEdit(item.work_item_id);
                    }}
                  >
                    {item.kind === "task" && item.work_item_id && (!isReview || isReviewerHere) && (
                      <button
                        type="button"
                        data-cal-complete-btn="true"
                        className={`absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-bold transition-transform hover:scale-110 ${isDone ? "border-success bg-success text-paper" : "border-line bg-paper text-muted dark:border-line-dark dark:bg-ink-2 dark:text-muted-dark"}`}
                        title={isDone ? "Segna non completata" : "Segna completata"}
                        onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
                        onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
                        onClick={(event) => { event.stopPropagation(); onToggleComplete(item); }}
                        disabled={!!getUiState(item.work_item_id)}
                      >
                        {isDone ? "✓" : ""}
                      </button>
                    )}
                    {item.kind === "task" ? (
                      <>
                        {!isTinyTask && (
                          <div className="truncate text-[10px] uppercase tracking-wider" style={{ color: readableText.secondary }}>
                            {resolveTimelineClientLabel(item)}
                          </div>
                        )}
                        <div className={`flex min-w-0 items-center gap-1 ${isDone ? "line-through" : ""}`} style={{ color: readableText.primary }}>
                          <span className="truncate font-semibold">{resolveTimelineTaskTitle(item)}</span>
                          {isPriority && <Icon name="star" className="h-3 w-3 text-[#E91E8A]" />}
                        </div>
                        {!isTinyTask && (
                          <div className="mt-0.5 truncate text-[10px]" style={{ color: readableText.secondary }}>
                            {isResizing ? `${formatHours((renderEnd - start) / 60)} stimate` : taskEstimatedHours != null ? `${formatHours(taskEstimatedHours)} stimate` : "Ore stimate —"}
                          </div>
                        )}
                        {!isCompactTask && (isCarriedOver || isSevereDelay || isNonDeferrable || scheduleState?.is_overdue) && (
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            {isCarriedOver && <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-200">In ritardo</span>}
                            {isSevereDelay && <span className="inline-flex items-center rounded-full border border-danger/40 bg-danger/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-danger">Ritardo grave</span>}
                            {scheduleState?.is_overdue && <span className="inline-flex items-center rounded-full border border-danger/40 bg-danger/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-danger">{scheduleState.overdue_days && scheduleState.overdue_days > 0 ? `Scaduta ${scheduleState.overdue_days}g` : "Scaduta"}</span>}
                            {isNonDeferrable && (
                              <span className="inline-flex items-center gap-1 rounded-full border border-[#E91E8A]/35 bg-[#E91E8A]/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[#E91E8A]">
                                <Icon name="shield" className="h-2.5 w-2.5" />
                                Non derogabile
                              </span>
                            )}
                            {(isCarriedOver || isSevereDelay) && taskEffectiveHoursValue != null && taskEffectiveWeight != null && (
                              <span className="text-[9px] font-semibold opacity-80">{formatHours(taskEffectiveHoursValue)} eff · peso {taskEffectiveWeight.toFixed(2)}x</span>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className={`font-semibold truncate ${isDone ? "line-through" : ""}`}>{item.emoji ? `${item.emoji} ` : ""}{item.title}</div>
                        <div className="mt-0.5 text-[10px] opacity-80">{item.start_time} - {item.end_time}</div>
                      </>
                    )}
                    {resizeWorkItemId != null && !isSevereDelay && !isReview && !getUiState(resizeWorkItemId) && (
                      <button
                        type="button"
                        aria-label="Ridimensiona task"
                        title="Trascina per allungare/accorciare la durata"
                        className="absolute bottom-0 left-0 right-0 h-3 cursor-ns-resize opacity-0 transition-opacity group-hover:opacity-100"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setDropPreviewMinutes(null);
                          createDragStartRef.current = null;
                          setCreatePreview(null);
                          setResizeState({
                            workItemId: resizeWorkItemId,
                            startMinutes: start,
                            originalEndMinutes: end,
                            currentEndMinutes: end,
                            minEndMinutes: Math.min(dayEndMinutes, start + CALENDAR_CREATE_SLOT_MINUTES),
                            maxEndMinutes: dayEndMinutes,
                            startClientY: event.clientY,
                          });
                        }}
                        onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}
                        draggable={false}
                      >
                        <span className="absolute bottom-1 left-1/2 h-1 w-10 -translate-x-1/2 rounded-full bg-emerald-500/90 shadow" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Oltre capacità */}
      {overCapacity && overCapacity.total_tasks_count > 0 && (
        <div className="rounded-lg border border-warning/35 bg-warning/10 p-3 dark:bg-warning/15">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-start gap-2">
              <Icon name="alert-triangle" className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <div>
                <div className="text-sm font-semibold text-ink dark:text-paper">
                  Oltre capacità — {overCapacity.total_tasks_count} lavorazion{overCapacity.total_tasks_count === 1 ? "e" : "i"} ({formatHours(overCapacity.overflow_tasks_effective_hours)}) che non rientr{overCapacity.total_tasks_count === 1 ? "a" : "ano"} nella giornata.
                </div>
                <div className="mt-1 text-[11px] text-muted dark:text-muted-dark">
                  Capacità {formatHours(overCapacity.capacity_hours)} · pianificate {formatHours(overCapacity.planned_hours)} · overload {formatHours(overCapacity.overload_hours)}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
            {overCapacity.tasks.map((task) => {
              const areaColor = task.work_areas.find((area) => area.color)?.color ?? null;
              const readableText = getReadableTaskTextColors(areaColor);
              const isSaving = !!getUiState(task.work_item_id);
              const canReschedule = !!task.task?.deadline_date;
              return (
                <div key={task.work_item_id} className="flex items-center gap-2 rounded-md border border-warning/25 bg-paper p-2 text-xs shadow-sm dark:bg-ink-soft">
                  <button
                    type="button"
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold transition-transform hover:scale-110 ${isSaving ? "border-muted text-muted" : "border-line bg-paper text-muted hover:border-success hover:text-success dark:border-line-dark dark:bg-ink-2 dark:text-muted-dark"}`}
                    title="Segna fatta"
                    disabled={isSaving}
                    onClick={() => onCompleteOverCapacity(task.work_item_id)}
                  >
                    {isSaving ? "…" : ""}
                  </button>
                  <button
                    type="button"
                    className="min-w-0 flex-1 rounded px-2 py-1 text-left transition hover:bg-cream/70 dark:hover:bg-ink-2"
                    onClick={() => onOpenEdit(task.work_item_id)}
                  >
                    <div className="truncate font-semibold text-ink dark:text-paper">
                      [{resolveWorkItemClientLabel(task.task, task.client_name)}] {task.title}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-muted dark:text-muted-dark">
                      {task.start_time && task.end_time && <span>{task.start_time} - {task.end_time}</span>}
                      <span>{formatHours(task.effective_load_hours)} workload</span>
                      <span>{formatHours(task.overflow_hours)} oltre limite</span>
                    </div>
                  </button>
                  {areaColor && (
                    <span className="h-6 min-w-10 rounded-full border px-2 text-center text-[10px] font-semibold leading-6" style={{ backgroundColor: areaColor, borderColor: areaColor, color: readableText.primary }} title={task.work_areas.map((area) => area.name).join(", ")}>
                      {task.work_areas[0]?.icon || "•"}
                    </span>
                  )}
                  <span className="shrink-0 rounded-full bg-warning/15 px-2 py-1 text-[10px] font-semibold text-warning">{formatHours(task.effective_load_hours)}</span>
                  <button
                    type="button"
                    className="shrink-0 rounded border border-warning/35 bg-warning/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-warning hover:bg-warning/15 disabled:opacity-50"
                    disabled={!canReschedule || reschedulingTaskId === task.work_item_id}
                    title={canReschedule ? "Riprogramma al primo slot libero" : "Serve una scadenza per riprogrammare automaticamente"}
                    onClick={() => onRescheduleOverflow(task.work_item_id)}
                  >
                    {reschedulingTaskId === task.work_item_id ? "..." : canReschedule ? "Riprogramma" : "No scadenza"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Senza orario */}
      {unscheduledTaskItems.length > 0 && (
        <div className="rounded-lg border border-line dark:border-line-dark bg-paper dark:bg-ink-soft p-3">
          <div className="mb-2 text-[11px] uppercase tracking-wider text-muted dark:text-muted-dark">Senza orario</div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {unscheduledTaskItems.map((item, index) => {
              const scheduleState = resolveTimelineScheduleState(item);
              const isCarriedOver = scheduleState?.delay_code === "carried_over";
              const isSevereDelay = scheduleState?.delay_code === "non_deferrable_overdue";
              const isNonDeferrable = isTimelineNonDeferrable(item);
              const isPriority = isTimelineTaskPriority(item);
              const taskColor = resolveTimelineTaskColor(item);
              const taskEstimatedHours = resolveTimelineEstimatedHours(item);
              const taskEffectiveHoursValue = resolveTimelineEffectiveHours(item);
              const taskEffectiveWeight = resolveTimelineEffectiveWeight(item);
              const readableText = isSevereDelay
                ? { primary: "#7f1d1d", secondary: "rgba(127,29,29,0.72)" }
                : isCarriedOver
                  ? { primary: "#78350f", secondary: "rgba(120,53,15,0.72)" }
                  : getReadableTaskTextColors(taskColor);
              return (
                <button
                  key={`${item.kind}-${item.source_id ?? index}-unscheduled`}
                  type="button"
                  draggable={!!item.work_item_id && !getUiState(item.work_item_id)}
                  onDragStart={() => { if (item.work_item_id) onTaskDragStart(item.work_item_id, operatorId); }}
                  onDragEnd={() => { clearSwapPreview(); setDropPreviewMinutes(null); setGridDropActive(false); onTaskDragEnd(); }}
                  onClick={() => { if (item.work_item_id) onOpenEdit(item.work_item_id); }}
                  className={`relative rounded-md border px-3 py-2 pr-8 text-left text-xs shadow-sm transition hover:-translate-y-px hover:shadow-md ${item.work_item_id ? "cursor-grab active:cursor-grabbing" : ""} ${isSevereDelay ? "border-danger bg-danger/10" : isCarriedOver ? "border-warning bg-warning/10" : "border-line bg-cream dark:border-line-dark dark:bg-ink-2"}`}
                  style={taskColor ? { borderColor: taskColor, backgroundColor: taskColor } : undefined}
                  title="Trascina su uno slot per pianificarla"
                >
                  {isPriority && <Icon name="star" className="absolute right-2 top-2 h-3.5 w-3.5 text-[#E91E8A]" />}
                  <div className="text-[10px] uppercase tracking-wider" style={{ color: readableText.secondary }}>{resolveTimelineClientLabel(item)}</div>
                  <div className="mt-0.5 font-semibold" style={{ color: readableText.primary }}>{resolveTimelineTaskTitle(item)}</div>
                  <div className="mt-0.5 text-[10px]" style={{ color: readableText.secondary }}>
                    {taskEstimatedHours != null ? `${formatHours(taskEstimatedHours)} stimate` : "Ore stimate —"}
                  </div>
                  {(isCarriedOver || isSevereDelay || isNonDeferrable || scheduleState?.is_overdue) && (
                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      {isCarriedOver && <span className="rounded-full border border-warning/30 bg-warning/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-warning">In ritardo</span>}
                      {isSevereDelay && <span className="rounded-full border border-danger/30 bg-danger/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-danger">Ritardo grave</span>}
                      {scheduleState?.is_overdue && <span className="rounded-full border border-danger/30 bg-danger/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-danger">{scheduleState.overdue_days && scheduleState.overdue_days > 0 ? `Scaduta ${scheduleState.overdue_days}g` : "Scaduta"}</span>}
                      {isNonDeferrable && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-[#E91E8A]/35 bg-[#E91E8A]/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[#E91E8A]">
                          <Icon name="shield" className="h-2.5 w-2.5" />
                          Non derogabile
                        </span>
                      )}
                      {(isCarriedOver || isSevereDelay) && (
                        <span className="text-[9px] font-semibold" style={{ color: readableText.secondary }}>{formatHours(taskEffectiveHoursValue)} eff · peso {taskEffectiveWeight.toFixed(2)}x</span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
