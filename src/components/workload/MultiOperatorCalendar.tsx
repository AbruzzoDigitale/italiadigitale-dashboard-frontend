import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import {
  getWorkloadUserCalendarDayApi,
  type WorkloadTimelineItem,
  type WorkloadUserCalendarDayResponse,
} from "../../api/workload";
import { isWorkItemOverlapApiError, moveWorkItemApi, updateWorkItemApi, type WorkItem } from "../../api/workItems";
import { Icon } from "../ui/Icon";
import { Spinner } from "../ui/Spinner";
import { useToast } from "../../context/ToastContext";

// ── Costanti griglia (allineate al calendario singolo) ──────────────────────────
const HOUR_PX = 64;
const SLOT_MINUTES = 30;

export interface MultiOperatorMeta {
  id: number;
  name: string;
  avatarUrl: string | null;
}

interface MultiOperatorCalendarProps {
  operators: MultiOperatorMeta[];
  selectedDate: string;
  companyId: number;
  bounds: { dayStartMinutes: number; dayEndMinutes: number; hourSlots: number };
  onOpenTask: (workItemId: number) => void;
  /** Invocata dopo uno spostamento/riassegnazione così il parent può aggiornare heatmap/statistiche. */
  onAfterChange?: () => void;
  /** Cambiando questo valore il componente forza un refetch. */
  reloadToken?: number;
}

// ── Helper (versione minimale, autonoma dal calendario singolo) ──────────────────
function hhmmToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const [h, m] = value.split(":").slice(0, 2).map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function minutesToHHMM(total: number): string {
  const safe = Math.max(0, Math.min(24 * 60 - 1, total));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function snapToSlot(total: number, min: number, max: number, step = SLOT_MINUTES): number {
  const maxStart = Math.max(min, max - step);
  const bounded = Math.max(min, Math.min(maxStart, total));
  return min + Math.round((bounded - min) / step) * step;
}

function formatHours(value: number): string {
  return `${value.toFixed(1)}h`;
}

function resolveTask(item: WorkloadTimelineItem): (WorkItem & { client?: { commercial_name?: string | null; name?: string | null } | null }) | null {
  return (item as { task?: (WorkItem & { client?: { commercial_name?: string | null; name?: string | null } | null }) | null }).task ?? null;
}

function effectiveHours(item: WorkloadTimelineItem): number {
  const state = resolveTask(item)?.schedule_state ?? item.schedule_state;
  if (typeof state?.effective_load_hours === "number") return state.effective_load_hours;
  if (item.affects_daily_load === false) return 0;
  return item.effective_load_hours ?? item.estimated_hours ?? 0;
}

function taskTitle(item: WorkloadTimelineItem): string {
  return resolveTask(item)?.title ?? item.title;
}

function clientLabel(item: WorkloadTimelineItem): string {
  const client = resolveTask(item)?.client ?? null;
  return client?.commercial_name || client?.name || item.client_name || "Senza cliente";
}

function taskColor(item: WorkloadTimelineItem): string | null {
  return item.work_areas?.find((area) => area.color)?.color ?? item.color ?? null;
}

function parseHex(color: string | null): { r: number; g: number; b: number } | null {
  if (!color) return null;
  const full = /^#([0-9a-fA-F]{6})$/.exec(color.trim());
  if (full) {
    return {
      r: parseInt(full[1].slice(0, 2), 16),
      g: parseInt(full[1].slice(2, 4), 16),
      b: parseInt(full[1].slice(4, 6), 16),
    };
  }
  const short = /^#([0-9a-fA-F]{3})$/.exec(color.trim());
  if (short) {
    const [r, g, b] = short[1].split("").map((v) => parseInt(`${v}${v}`, 16));
    return { r, g, b };
  }
  return null;
}

function readableText(bg: string | null): { primary: string | undefined; secondary: string | undefined } {
  const rgb = parseHex(bg);
  if (!rgb) return { primary: undefined, secondary: undefined };
  const srgb = [rgb.r, rgb.g, rgb.b].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
  const dark = luminance > 0.48;
  return {
    primary: dark ? "#0a0a0a" : "#ffffff",
    secondary: dark ? "rgba(10,10,10,0.72)" : "rgba(255,255,255,0.82)",
  };
}

type PositionedBlock = { item: WorkloadTimelineItem; start: number; end: number; column: number; totalColumns: number };

/** Impacchetta i blocchi che si sovrappongono in colonne affiancate (dentro la colonna dell'operatore). */
function layoutBlocks(blocks: Array<{ item: WorkloadTimelineItem; start: number; end: number }>): PositionedBlock[] {
  const laid: PositionedBlock[] = blocks
    .map((b) => ({ ...b, column: 0, totalColumns: 1 }))
    .sort((a, b) => a.start - b.start || a.end - b.end);

  let group: PositionedBlock[] = [];
  let groupEnd = -1;
  const flush = () => {
    const columnEnds: number[] = [];
    group.forEach((block) => {
      const reusable = columnEnds.findIndex((end) => block.start >= end);
      const col = reusable >= 0 ? reusable : columnEnds.length;
      block.column = col;
      columnEnds[col] = block.end;
    });
    const total = Math.max(1, columnEnds.length);
    group.forEach((block) => { block.totalColumns = total; });
  };
  laid.forEach((block) => {
    if (group.length === 0 || block.start < groupEnd) {
      group.push(block);
      groupEnd = Math.max(groupEnd, block.end);
      return;
    }
    flush();
    group = [block];
    groupEnd = block.end;
  });
  if (group.length) flush();
  return laid;
}

function isDoneTask(item: WorkloadTimelineItem): boolean {
  return item.kind === "task" && (item.status === "completed" || item.status === "done");
}

export function MultiOperatorCalendar({
  operators,
  selectedDate,
  companyId,
  bounds,
  onOpenTask,
  onAfterChange,
  reloadToken,
}: MultiOperatorCalendarProps) {
  const toast = useToast();
  const [dataByOperator, setDataByOperator] = useState<Record<number, WorkloadUserCalendarDayResponse | null>>({});
  const [loading, setLoading] = useState(true);
  const [drag, setDrag] = useState<{ taskId: number; fromOperatorId: number; durationMinutes: number } | null>(null);
  const [dropPreview, setDropPreview] = useState<{ operatorId: number; minutes: number } | null>(null);
  const [savingTaskId, setSavingTaskId] = useState<number | null>(null);
  const requestSeqRef = useRef(0);

  const operatorIdsKey = operators.map((o) => o.id).join(",");

  const loadAll = useCallback(async () => {
    if (operators.length === 0) {
      setDataByOperator({});
      setLoading(false);
      return;
    }
    const seq = ++requestSeqRef.current;
    setLoading(true);
    const results = await Promise.all(
      operators.map((op) =>
        getWorkloadUserCalendarDayApi(op.id, {
          range_mode: "day",
          selected_date: selectedDate,
          anchor_date: selectedDate,
          company_id: companyId,
          include_completed: true,
        })
          .then((data) => ({ id: op.id, data }))
          .catch(() => ({ id: op.id, data: null }))
      )
    );
    if (seq !== requestSeqRef.current) return;
    const next: Record<number, WorkloadUserCalendarDayResponse | null> = {};
    results.forEach(({ id, data }) => { next[id] = data; });
    setDataByOperator(next);
    setLoading(false);
  }, [companyId, operatorIdsKey, selectedDate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void loadAll();
  }, [loadAll, reloadToken]);

  const { dayStartMinutes, dayEndMinutes, hourSlots } = bounds;
  const gridHeight = hourSlots * HOUR_PX;

  const minutesFromEvent = useCallback((event: DragEvent<HTMLElement>): number => {
    const rect = event.currentTarget.getBoundingClientRect();
    const relativeY = Math.max(0, Math.min(rect.height - 1, event.clientY - rect.top));
    const raw = (relativeY / HOUR_PX) * 60 + dayStartMinutes;
    return snapToSlot(raw, dayStartMinutes, dayEndMinutes);
  }, [dayEndMinutes, dayStartMinutes]);

  const handleDrop = useCallback(async (targetOperatorId: number, minutes: number) => {
    const current = drag;
    setDropPreview(null);
    setDrag(null);
    if (!current) return;

    setSavingTaskId(current.taskId);
    try {
      await moveWorkItemApi(current.taskId, {
        assignee_id: targetOperatorId,
        work_date: selectedDate,
        start_time: minutesToHHMM(minutes),
      });
      const reassigned = targetOperatorId !== current.fromOperatorId;
      toast.success(reassigned ? "Task riassegnata e posizionata" : "Task riposizionata");
      await loadAll();
      onAfterChange?.();
    } catch (err) {
      if (isWorkItemOverlapApiError(err)) {
        toast.error(err.backendMessage);
      } else {
        toast.error(err instanceof Error ? err.message : "Impossibile spostare la task");
      }
    } finally {
      setSavingTaskId(null);
    }
  }, [drag, loadAll, onAfterChange, selectedDate, toast]);

  const toggleDone = useCallback(async (operatorId: number, item: WorkloadTimelineItem) => {
    if (item.kind !== "task" || !item.work_item_id) return;
    const workItemId = item.work_item_id;
    const done = isDoneTask(item);
    setSavingTaskId(workItemId);
    try {
      await updateWorkItemApi(workItemId, {
        status: done ? "planned" : "completed",
        is_completed: !done,
      });
      await loadAll();
      onAfterChange?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossibile aggiornare la task");
    } finally {
      setSavingTaskId(null);
    }
  }, [loadAll, onAfterChange, toast]);

  if (loading && Object.keys(dataByOperator).length === 0) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-line dark:border-line-dark bg-paper dark:bg-ink-soft py-16">
        <Spinner size="md" />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-line dark:border-line-dark bg-paper dark:bg-ink-soft overflow-hidden">
      <div className="max-h-[72vh] overflow-auto">
        <div
          className="grid min-w-max"
          style={{ gridTemplateColumns: `64px repeat(${operators.length}, minmax(180px, 1fr))` }}
        >
          {/* Intestazioni colonne */}
          <div className="sticky top-0 z-20 border-b border-r border-line dark:border-line-dark bg-cream/70 dark:bg-ink-2" />
          {operators.map((op) => {
            const data = dataByOperator[op.id];
            const taskCount = data ? data.timeline.filter((i) => i.kind === "task").length : 0;
            return (
              <div
                key={`head-${op.id}`}
                className="sticky top-0 z-20 flex items-center gap-2 border-b border-l border-line dark:border-line-dark bg-cream/70 dark:bg-ink-2 px-3 py-2"
              >
                {op.avatarUrl ? (
                  <img src={op.avatarUrl} alt={op.name} className="h-7 w-7 rounded-full object-cover border border-line dark:border-line-dark" />
                ) : (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full border border-line dark:border-line-dark bg-paper dark:bg-ink-soft text-[10px] font-semibold text-ink dark:text-paper">
                    {op.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-ink dark:text-paper">{op.name}</div>
                  <div className="text-[10px] text-muted dark:text-muted-dark">{taskCount} task</div>
                </div>
              </div>
            );
          })}

          {/* Gutter orari */}
          <div className="relative border-r border-line dark:border-line-dark bg-cream/40 dark:bg-ink-2" style={{ height: gridHeight }}>
            {Array.from({ length: hourSlots }, (_, index) => {
              const minutes = dayStartMinutes + index * 60;
              return (
                <div
                  key={minutes}
                  className="absolute left-0 right-0 px-2 text-[10px] text-muted dark:text-muted-dark"
                  style={{ top: index * HOUR_PX }}
                >
                  {minutesToHHMM(minutes)}
                </div>
              );
            })}
          </div>

          {/* Colonne operatori */}
          {operators.map((op) => {
            const data = dataByOperator[op.id];
            const timed = (data?.timeline ?? []).filter((i) => !i.is_all_day && !!i.start_time && !!i.end_time);
            const blocks = layoutBlocks(
              timed
                .map((item) => {
                  const start = hhmmToMinutes(item.start_time) ?? dayStartMinutes;
                  const end = hhmmToMinutes(item.end_time) ?? start + Math.max(SLOT_MINUTES, Math.round(effectiveHours(item) * 60));
                  const safeStart = Math.max(dayStartMinutes, Math.min(dayEndMinutes, start));
                  const safeEnd = Math.max(safeStart + SLOT_MINUTES, Math.min(dayEndMinutes, end));
                  return { item, start: safeStart, end: safeEnd };
                })
                .filter((b) => b.end > dayStartMinutes && b.start < dayEndMinutes)
            );
            const unscheduled = (data?.timeline ?? []).filter((i) => i.kind === "task" && (i.is_all_day || !i.start_time));
            const isPreviewColumn = dropPreview?.operatorId === op.id;

            return (
              <div
                key={`col-${op.id}`}
                className={`relative border-l border-line dark:border-line-dark ${isPreviewColumn ? "bg-amber-50/40 dark:bg-amber-900/15" : ""}`}
                style={{ height: gridHeight }}
                onDragOver={(event) => {
                  if (!drag) return;
                  event.preventDefault();
                  setDropPreview({ operatorId: op.id, minutes: minutesFromEvent(event) });
                }}
                onDragLeave={() => {
                  setDropPreview((current) => (current?.operatorId === op.id ? null : current));
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  void handleDrop(op.id, minutesFromEvent(event));
                }}
              >
                {/* Linee orarie */}
                {Array.from({ length: hourSlots }, (_, index) => (
                  <div
                    key={`line-${index}`}
                    className="absolute left-0 right-0 border-b border-line/40 dark:border-line-dark/50"
                    style={{ top: index * HOUR_PX }}
                  />
                ))}

                {/* Task non pianificate (chip in alto, trascinabili in uno slot) */}
                {unscheduled.length > 0 && (
                  <div className="absolute left-1 right-1 top-1 z-10 flex flex-col gap-1">
                    {unscheduled.map((item) => (
                      <button
                        key={`uns-${item.work_item_id}`}
                        type="button"
                        draggable={!!item.work_item_id}
                        onDragStart={() => item.work_item_id && setDrag({ taskId: item.work_item_id, fromOperatorId: op.id, durationMinutes: Math.max(SLOT_MINUTES, Math.round(effectiveHours(item) * 60)) })}
                        onDragEnd={() => { setDrag(null); setDropPreview(null); }}
                        onClick={() => item.work_item_id && onOpenTask(item.work_item_id)}
                        className="truncate rounded border border-dashed border-amber-400 bg-amber-50/80 px-2 py-1 text-left text-[10px] font-semibold text-amber-900 dark:bg-amber-900/25 dark:text-amber-100"
                        title="Task senza orario — trascinala su uno slot"
                      >
                        {taskTitle(item)}
                      </button>
                    ))}
                  </div>
                )}

                {/* Anteprima slot di rilascio */}
                {isPreviewColumn && dropPreview && (
                  <div
                    className="pointer-events-none absolute left-1 right-1 z-30 rounded border border-amber-500 bg-amber-200/45 dark:bg-amber-800/35"
                    style={{ top: ((dropPreview.minutes - dayStartMinutes) / 60) * HOUR_PX, height: Math.max(18, (drag ? drag.durationMinutes : SLOT_MINUTES) / 60 * HOUR_PX) }}
                  >
                    <div className="px-1 text-[10px] font-semibold text-amber-900 dark:text-amber-100">{minutesToHHMM(dropPreview.minutes)}</div>
                  </div>
                )}

                {/* Blocchi task */}
                {blocks.map(({ item, start, end, column, totalColumns }, idx) => {
                  if (item.kind !== "task" || !item.work_item_id) {
                    // Eventi non-task (pausa/ferie): mostrati come fasce neutre, non trascinabili.
                    const top = ((start - dayStartMinutes) / 60) * HOUR_PX;
                    const height = Math.max(18, ((end - start) / 60) * HOUR_PX);
                    return (
                      <div
                        key={`evt-${idx}`}
                        className="absolute left-1 right-1 overflow-hidden rounded border border-line/70 bg-cream/70 px-1.5 py-0.5 text-[10px] text-muted dark:border-line-dark/70 dark:bg-ink-2 dark:text-muted-dark"
                        style={{ top, height, zIndex: 5 }}
                      >
                        {item.emoji ? `${item.emoji} ` : ""}{item.title}
                      </div>
                    );
                  }

                  const top = ((start - dayStartMinutes) / 60) * HOUR_PX;
                  const height = Math.max(28, ((end - start) / 60) * HOUR_PX);
                  const color = taskColor(item);
                  const text = readableText(color);
                  const done = isDoneTask(item);
                  const widthPct = 100 / totalColumns;
                  const saving = savingTaskId === item.work_item_id;
                  return (
                    <div
                      key={`task-${item.work_item_id}-${start}`}
                      draggable={!saving}
                      onDragStart={() => setDrag({ taskId: item.work_item_id!, fromOperatorId: op.id, durationMinutes: end - start })}
                      onDragEnd={() => { setDrag(null); setDropPreview(null); }}
                      onClick={(event) => {
                        if ((event.target as HTMLElement).closest("[data-done-btn]")) return;
                        onOpenTask(item.work_item_id!);
                      }}
                      className={`group absolute overflow-hidden rounded-md border px-1.5 py-1 text-[11px] shadow-sm cursor-grab active:cursor-grabbing ${done ? "opacity-70" : ""} ${saving ? "animate-pulse" : ""}`}
                      style={{
                        top,
                        height,
                        left: `calc(4px + (100% - 8px) * ${column * widthPct / 100})`,
                        width: `calc((100% - 8px) * ${widthPct / 100} - 2px)`,
                        zIndex: 20,
                        backgroundColor: color ?? undefined,
                        borderColor: color ?? undefined,
                        color: text.primary,
                      }}
                      title={`${clientLabel(item)} · ${taskTitle(item)}`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <span className={`truncate font-semibold ${done ? "line-through" : ""}`}>{taskTitle(item)}</span>
                        <button
                          type="button"
                          data-done-btn
                          onClick={(event) => { event.stopPropagation(); void toggleDone(op.id, item); }}
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] font-bold ${done ? "border-success bg-success text-paper" : "border-current bg-paper/80 text-muted"}`}
                          title={done ? "Segna non completata" : "Segna completata"}
                        >
                          {done ? "✓" : ""}
                        </button>
                      </div>
                      {height >= 40 && (
                        <div className="truncate text-[10px]" style={{ color: text.secondary }}>
                          {clientLabel(item)} · {formatHours(effectiveHours(item))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-line dark:border-line-dark px-3 py-2 text-[11px] text-muted dark:text-muted-dark">
        <Icon name="info" className="h-3.5 w-3.5" />
        Trascina una task in un'altra colonna per riassegnarla all'operatore e posizionarla nello slot.
      </div>
    </div>
  );
}
