// Helper puri condivisi dal calendario workload: usati sia dalla vista a singolo operatore
// (WorkloadPage) sia dal componente colonna riutilizzabile (OperatorCalendarColumn).
import type {
  WorkloadTimelineItem,
  WorkloadTaskSummary,
  WorkloadUserCalendarDayResponse,
} from "../../api/workload";
import type { WorkItem, WorkItemScheduleState } from "../../api/workItems";
import { formatDurationHuman } from "../../utils/duration";

export interface WorkloadTrayItem {
  id: number;
  client: string;
  type: string;
  durationMinutes: number;
  areaColor: string | null;
  overflowHours?: number;
  /** Task oltre la scadenza (deadline superata). */
  isOverdue?: boolean;
  /** Giorni di ritardo rispetto alla deadline. */
  daysOverdue?: number;
  /** Scadenza non derogabile (delay_code = non_deferrable_overdue). */
  nonDeferrable?: boolean;
  /** Task in revisione. */
  isReview?: boolean;
}

// ── Costanti griglia ────────────────────────────────────────────────────────────
export const CALENDAR_SLOT_MINUTES = 30;
export const CALENDAR_CREATE_SLOT_MINUTES = 15;
export const CALENDAR_HOUR_HEIGHT_PX = 64;
export const CALENDAR_INITIAL_SCROLL_OFFSET_PX = 16;

// ── Tipi ─────────────────────────────────────────────────────────────────────────
export type CalendarCreatePreview = { startMinutes: number; endMinutes: number; isDragging: boolean };
export type CalendarTimelineBlock = {
  item: WorkloadTimelineItem;
  start: number;
  end: number;
  originalIndex: number;
  column: number;
  totalColumns: number;
};
export type CalendarResizeState = {
  workItemId: number;
  startMinutes: number;
  originalEndMinutes: number;
  currentEndMinutes: number;
  minEndMinutes: number;
  maxEndMinutes: number;
  startClientY: number;
};

// ── Tempo / formattazione ─────────────────────────────────────────────────────────
export function hhmmToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const [h, m] = value.split(":").slice(0, 2).map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

export function minutesToHHMM(totalMinutes: number): string {
  const safe = Math.max(0, Math.min((24 * 60) - 1, totalMinutes));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Durata in linguaggio umano: 2.8 → "2h48min", 0.8 → "48min", 1 → "1h", 0 → "0min". */
export function formatHours(value: number) {
  return formatDurationHuman(value);
}

export function snapMinutesToSlotInRange(totalMinutes: number, min: number, max: number, slotMinutes = CALENDAR_SLOT_MINUTES): number {
  const maxStart = Math.max(min, max - slotMinutes);
  const bounded = Math.max(min, Math.min(maxStart, totalMinutes));
  const offset = Math.round((bounded - min) / slotMinutes) * slotMinutes;
  return min + offset;
}

export function snapBoundaryMinutesInRange(totalMinutes: number, min: number, max: number, slotMinutes = CALENDAR_CREATE_SLOT_MINUTES): number {
  const bounded = Math.max(min, Math.min(max, totalMinutes));
  const offset = Math.round((bounded - min) / slotMinutes) * slotMinutes;
  return min + offset;
}

export function clampTimelineInRange(start: number, end: number, min: number, max: number): { start: number; end: number } {
  const safeStart = Math.min(max, Math.max(min, start));
  const safeEnd = Math.min(max, Math.max(min, end));
  if (safeEnd <= safeStart) {
    return { start: safeStart, end: Math.min(max, safeStart + 30) };
  }
  return { start: safeStart, end: safeEnd };
}

export function normalizeCalendarCreateRange(anchorMinutes: number, currentMinutes: number, dayEndMinutes: number): CalendarCreatePreview {
  const start = Math.min(anchorMinutes, currentMinutes);
  const end = Math.min(dayEndMinutes, Math.max(anchorMinutes, currentMinutes) + CALENDAR_CREATE_SLOT_MINUTES);
  return {
    startMinutes: start,
    endMinutes: Math.max(start + CALENDAR_CREATE_SLOT_MINUTES, end),
    isDragging: true,
  };
}

// ── Carico / etichette task ────────────────────────────────────────────────────────
export function taskEffectiveHours(task: Pick<WorkloadTaskSummary, "affects_daily_load" | "effective_load_hours" | "estimated_hours">): number {
  if (!task.affects_daily_load) return 0;
  if (typeof task.effective_load_hours === "number") return task.effective_load_hours;
  return task.estimated_hours ?? 0;
}

export function taskHoursLabel(task: Pick<WorkloadTaskSummary, "affects_daily_load" | "effective_load_hours" | "estimated_hours">): string {
  const effective = taskEffectiveHours(task);
  if (task.estimated_hours == null) return `${formatHours(effective)} eff`;
  return `${formatHours(effective)} eff · ${formatHours(task.estimated_hours)} st`;
}

// ── Stile blocchi timeline ─────────────────────────────────────────────────────────
export function timelineItemClass(kind: WorkloadTimelineItem["kind"]) {
  if (kind === "break") return "border-amber-400 text-amber-900 dark:border-amber-700 dark:text-amber-100";
  if (kind === "remote") return "border-sky-300 text-sky-900 dark:border-sky-700 dark:text-sky-100";
  if (kind === "holiday" || kind === "day_off") return "border-rose-300 bg-rose-100/80 text-rose-900 dark:border-rose-700 dark:bg-rose-900/35 dark:text-rose-100";
  return "border-line bg-paper/90 text-ink dark:border-line-dark dark:bg-ink-soft/90 dark:text-paper";
}

export function timelineItemStyle(item: WorkloadTimelineItem) {
  if (item.kind === "break") {
    return {
      backgroundColor: "rgba(245, 158, 11, 0.2)",
      backgroundImage:
        "repeating-linear-gradient(135deg, rgba(245, 158, 11, 0.18) 0px, rgba(245, 158, 11, 0.18) 8px, rgba(245, 158, 11, 0.36) 8px, rgba(245, 158, 11, 0.36) 16px)",
    };
  }
  if (item.kind === "remote") {
    const stripe = item.color ?? "#3b82f6";
    return {
      backgroundColor: `${stripe}22`,
      backgroundImage:
        `repeating-linear-gradient(135deg, ${stripe}20 0px, ${stripe}20 8px, ${stripe}44 8px, ${stripe}44 16px)`,
      borderColor: `${stripe}66`,
    };
  }
  if (item.color) {
    return { backgroundColor: item.color };
  }
  return undefined;
}

export function timelineItemZIndex(kind: WorkloadTimelineItem["kind"]) {
  if (kind === "task") return 30;
  if (kind === "break") return 20;
  return 10;
}

export function parseHexColor(color: string | null): { r: number; g: number; b: number } | null {
  if (!color) return null;
  const normalized = color.trim();
  const short = /^#([0-9a-fA-F]{3})$/.exec(normalized);
  if (short) {
    const [r, g, b] = short[1].split("").map((value) => parseInt(`${value}${value}`, 16));
    return { r, g, b };
  }
  const full = /^#([0-9a-fA-F]{6})$/.exec(normalized);
  if (!full) return null;
  return {
    r: parseInt(full[1].slice(0, 2), 16),
    g: parseInt(full[1].slice(2, 4), 16),
    b: parseInt(full[1].slice(4, 6), 16),
  };
}

export function getReadableTaskTextColors(backgroundColor: string | null) {
  const rgb = parseHexColor(backgroundColor);
  if (!rgb) {
    return { primary: undefined, secondary: undefined };
  }
  const srgb = [rgb.r, rgb.g, rgb.b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = (0.2126 * srgb[0]) + (0.7152 * srgb[1]) + (0.0722 * srgb[2]);
  const useDarkText = luminance > 0.48;
  return {
    primary: useDarkText ? "#0a0a0a" : "#ffffff",
    secondary: useDarkText ? "rgba(10,10,10,0.72)" : "rgba(255,255,255,0.82)",
  };
}

// ── Layout colonne per blocchi sovrapposti ──────────────────────────────────────────
export function layoutCalendarTimelineBlocks(blocks: Array<{ item: WorkloadTimelineItem; start: number; end: number }>): CalendarTimelineBlock[] {
  const laidOut = blocks.map((block, originalIndex) => ({ ...block, originalIndex, column: 0, totalColumns: 1 }));
  const taskBlocks = laidOut
    .filter((block) => block.item.kind === "task")
    .sort((left, right) => left.start - right.start || left.end - right.end || left.originalIndex - right.originalIndex);

  const layoutGroup = (group: CalendarTimelineBlock[]) => {
    const columnEnds: number[] = [];
    group.forEach((block) => {
      const reusableColumn = columnEnds.findIndex((end) => block.start >= end);
      const column = reusableColumn >= 0 ? reusableColumn : columnEnds.length;
      block.column = column;
      columnEnds[column] = block.end;
    });
    const totalColumns = Math.max(1, columnEnds.length);
    group.forEach((block) => {
      block.totalColumns = totalColumns;
    });
  };

  let group: CalendarTimelineBlock[] = [];
  let groupEnd = -1;
  taskBlocks.forEach((block) => {
    if (group.length === 0 || block.start < groupEnd) {
      group.push(block);
      groupEnd = Math.max(groupEnd, block.end);
      return;
    }
    layoutGroup(group);
    group = [block];
    groupEnd = block.end;
  });
  if (group.length > 0) layoutGroup(group);

  return laidOut;
}

// ── Risoluzione campi task dai timeline item ─────────────────────────────────────────
export function resolveTimelineTask(item: WorkloadTimelineItem) {
  return (item as { task?: (WorkItem & { client?: { commercial_name?: string | null; name?: string | null } | null }) | null }).task ?? null;
}

export function resolveTimelineScheduleState(item: WorkloadTimelineItem): WorkItemScheduleState | null {
  return resolveTimelineTask(item)?.schedule_state ?? item.schedule_state ?? null;
}

export function resolveTimelineTaskTitle(item: WorkloadTimelineItem) {
  const task = resolveTimelineTask(item);
  return task?.title ?? item.title;
}

export function resolveTimelineClientLabel(item: WorkloadTimelineItem) {
  const task = resolveTimelineTask(item);
  const client = task?.client ?? null;
  return client?.commercial_name || client?.name || item.client_name || "Senza cliente";
}

export function resolveTimelineEstimatedHours(item: WorkloadTimelineItem) {
  const task = resolveTimelineTask(item);
  return task?.estimated_hours ?? item.estimated_hours ?? null;
}

export function resolveTimelineEffectiveHours(item: WorkloadTimelineItem) {
  const state = resolveTimelineScheduleState(item);
  if (typeof state?.effective_load_hours === "number") return state.effective_load_hours;
  if (item.affects_daily_load === false) return 0;
  return item.effective_load_hours ?? item.estimated_hours ?? 0;
}

export function resolveTimelineEffectiveWeight(item: WorkloadTimelineItem) {
  const state = resolveTimelineScheduleState(item);
  return state?.effective_load_weight_factor ?? item.load_weight_factor ?? 1;
}

export function resolveTimelineTaskColor(item: WorkloadTimelineItem) {
  const areaColor = item.work_areas?.find((area) => area.color)?.color;
  return areaColor ?? item.color ?? null;
}

export function isTimelineTaskPriority(item: WorkloadTimelineItem) {
  return !!resolveTimelineTask(item)?.is_priority;
}

export function isTimelineNonDeferrable(item: WorkloadTimelineItem) {
  return !!resolveTimelineTask(item)?.is_deadline_locked;
}

/**
 * Costruisce gli elenchi della tray "Da pianificare" da una o più risposte calendario-giorno:
 * - reassign: task oltre capacità (over_capacity);
 * - unsched: task senza orario (all-day o senza start_time).
 * Condiviso tra il calendario (più giorni) e la pagina (singola risposta dell'operatore).
 */
export function buildWorkloadTrayItems(
  responses: Array<WorkloadUserCalendarDayResponse | null | undefined>,
): { reassign: WorkloadTrayItem[]; unsched: WorkloadTrayItem[] } {
  const reassign = new Map<number, WorkloadTrayItem>();
  const unsched = new Map<number, WorkloadTrayItem>();
  for (const data of responses) {
    if (!data) continue;
    for (const t of data.over_capacity?.tasks ?? []) {
      if (reassign.has(t.work_item_id)) continue;
      reassign.set(t.work_item_id, {
        id: t.work_item_id,
        client: t.client_name || "Senza cliente",
        type: t.title,
        durationMinutes: Math.max(CALENDAR_SLOT_MINUTES, Math.round((t.effective_load_hours || t.estimated_hours || 0.5) * 60)),
        areaColor: t.work_areas?.find((a) => a.color)?.color ?? null,
        overflowHours: t.overflow_hours,
      });
    }
    for (const item of data.timeline) {
      if (item.kind !== "task" || !item.work_item_id) continue;
      if (!(item.is_all_day || !item.start_time)) continue;
      if (unsched.has(item.work_item_id)) continue;
      const eff = resolveTimelineEffectiveHours(item);
      unsched.set(item.work_item_id, {
        id: item.work_item_id,
        client: resolveTimelineClientLabel(item),
        type: resolveTimelineTaskTitle(item),
        durationMinutes: Math.max(CALENDAR_SLOT_MINUTES, Math.round((eff || 0.5) * 60)),
        areaColor: resolveTimelineTaskColor(item),
      });
    }
  }
  return { reassign: [...reassign.values()], unsched: [...unsched.values()] };
}
