import { useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from "react";
import {
  getWorkloadUserCalendarDayApi,
  type WorkloadTimelineItem,
  type WorkloadUserCalendarDayResponse,
} from "../../api/workload";
import { Spinner } from "../ui/Spinner";
import {
  CALENDAR_CREATE_SLOT_MINUTES,
  CALENDAR_SLOT_MINUTES,
  clampTimelineInRange,
  formatHours,
  getReadableTaskTextColors,
  hhmmToMinutes,
  layoutCalendarTimelineBlocks,
  minutesToHHMM,
  resolveTimelineClientLabel,
  resolveTimelineEffectiveHours,
  resolveTimelineTaskColor,
  resolveTimelineTaskTitle,
  snapMinutesToSlotInRange,
} from "./calendarUtils";

// ── Tipi & costanti ─────────────────────────────────────────────────────────────
export interface WorkloadCalendarBounds {
  dayStartMinutes: number;
  dayEndMinutes: number;
  totalMinutes: number;
  hourSlots: number;
  openingMinutes: number | null;
  closingMinutes: number | null;
}

export type WorkloadCalendarDensity = "comfortable" | "compact";

export interface WorkloadCalendarProps {
  /** Operatore di cui mostrare il calendario. */
  userId: number;
  /** Azienda corrente (per filtrare le task). */
  companyId: number | null;
  /** Giorni visibili (uno per range "day"; 5-7 per "week"). */
  visibleDays: string[];
  /** Giorno selezionato/anchor (usato per lo scroll iniziale e l'evidenza). */
  selectedDate: string;
  bounds: WorkloadCalendarBounds;
  nowMinutes: number;
  density: WorkloadCalendarDensity;
  /** Capacità giornaliera operatore (h) per la barra di carico; fallback 8h. */
  maxCapacityHours?: number | null;
  /** Token: cambiando valore forza un nuovo fetch (dopo mutazioni dal parent). */
  reloadToken?: number;
  /** Click su un evento task → apre la modifica. */
  onOpenEdit: (workItemId: number) => void;
  /** Toggle completamento task. */
  onToggleComplete: (item: WorkloadTimelineItem) => void;
  /** Sposta una task (stesso operatore) in un giorno+slot. */
  onMove: (taskId: number, day: string, startTime: string) => void;
  /** Crea per drag su slot vuoto. */
  onCreateByDrag: (args: { day: string; startTime: string; estimatedHours: number }) => void;
}

const HOUR_HEIGHT: Record<WorkloadCalendarDensity, number> = {
  comfortable: 64,
  compact: 40,
};

const DOW_LABELS = ["DOM", "LUN", "MAR", "MER", "GIO", "VEN", "SAB"];
const GUTTER_WIDTH = 64;

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function dayNumber(iso: string): number {
  const [, , d] = iso.split("-").map(Number);
  return d;
}

function dowIndex(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

function isBreakKind(kind: WorkloadTimelineItem["kind"]): boolean {
  return kind === "break" || kind === "holiday" || kind === "day_off";
}

function loadClass(pct: number): "wlcal-load-ok" | "wlcal-load-warn" | "wlcal-load-over" {
  if (pct >= 100) return "wlcal-load-over";
  if (pct >= 80) return "wlcal-load-warn";
  return "wlcal-load-ok";
}

// ── Stato per-giorno (dati timeline + carico) ────────────────────────────────────
interface DayState {
  date: string;
  data: WorkloadUserCalendarDayResponse | null;
}

export function WorkloadCalendar({
  userId,
  companyId,
  visibleDays,
  selectedDate,
  bounds,
  nowMinutes,
  density,
  maxCapacityHours,
  reloadToken,
  onOpenEdit,
  onToggleComplete,
  onMove,
  onCreateByDrag,
}: WorkloadCalendarProps) {
  const { dayStartMinutes, dayEndMinutes, totalMinutes, hourSlots, openingMinutes, closingMinutes } = bounds;
  const hourHeight = HOUR_HEIGHT[density];

  const [dayStates, setDayStates] = useState<DayState[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const capacityHours = maxCapacityHours && maxCapacityHours > 0 ? maxCapacityHours : 8;

  // Drag intra-operatore (sposta task) + create-by-drag su slot vuoto.
  const [drag, setDrag] = useState<{ taskId: number; durationMinutes: number } | null>(null);
  const [dropPreview, setDropPreview] = useState<{ day: string; startMinutes: number } | null>(null);
  const [createPreview, setCreatePreview] = useState<{ day: string; startMinutes: number; endMinutes: number } | null>(null);
  const createAnchorRef = useRef<{ day: string; minutes: number } | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const initialScrollKeyRef = useRef<string | null>(null);

  const daysKey = visibleDays.join(",");

  // ── Fetch in parallelo di ogni giorno visibile per l'operatore ────────────────
  useEffect(() => {
    if (!visibleDays.length) {
      setDayStates([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all(
      visibleDays.map((day) =>
        getWorkloadUserCalendarDayApi(userId, {
          range_mode: "day",
          selected_date: day,
          anchor_date: day,
          company_id: companyId ?? undefined,
          include_completed: true,
        })
          .then((data) => ({ date: day, data }))
          .catch(() => ({ date: day, data: null }))
      )
    )
      .then((results) => {
        if (cancelled) return;
        setDayStates(results);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Impossibile caricare il calendario");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, companyId, daysKey, reloadToken]);

  // ── Scroll iniziale verso l'ora corrente (come OperatorCalendarColumn) ────────
  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container || dayStates.length === 0) return;
    const key = `${userId}-${selectedDate}-${density}`;
    if (initialScrollKeyRef.current === key) return;
    const roundedDown = Math.floor(nowMinutes / CALENDAR_SLOT_MINUTES) * CALENDAR_SLOT_MINUTES;
    const bounded = Math.max(dayStartMinutes, Math.min(dayEndMinutes - CALENDAR_SLOT_MINUTES, roundedDown));
    const targetTop = ((bounded - dayStartMinutes) / 60) * hourHeight;
    const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
    container.scrollTop = Math.max(0, Math.min(maxTop, targetTop - 16));
    initialScrollKeyRef.current = key;
  }, [dayStates.length, userId, selectedDate, density, nowMinutes, dayStartMinutes, dayEndMinutes, hourHeight]);

  const today = todayIso();
  const yOf = (minutes: number) => ((minutes - dayStartMinutes) / 60) * hourHeight;
  const bodyHeight = (totalMinutes / 60) * hourHeight;

  const hourMarks = useMemo(() => {
    const marks: number[] = [];
    for (let i = 0; i < hourSlots; i++) marks.push(dayStartMinutes + i * 60);
    if (dayStartMinutes + (hourSlots - 1) * 60 < dayEndMinutes) marks.push(dayEndMinutes);
    return marks;
  }, [dayStartMinutes, dayEndMinutes, hourSlots]);

  const showOpening = openingMinutes != null && openingMinutes > dayStartMinutes && openingMinutes < dayEndMinutes;
  const showClosing = closingMinutes != null && closingMinutes > dayStartMinutes && closingMinutes < dayEndMinutes;

  const gridColumns = `${GUTTER_WIDTH}px repeat(${visibleDays.length}, minmax(${visibleDays.length === 1 ? 320 : 130}px, 1fr))`;

  // ── Calcolo blocchi/carico per ogni giorno ────────────────────────────────────
  const columns = visibleDays.map((day) => {
    const state = dayStates.find((s) => s.date === day) ?? null;
    const data = state?.data ?? null;
    const timeline = data?.timeline ?? [];
    const timed = timeline.filter((item) => !item.is_all_day && !!item.start_time && !!item.end_time);
    const blocks = timed
      .map((item) => {
        const start = hhmmToMinutes(item.start_time) ?? 0;
        const end = hhmmToMinutes(item.end_time) ?? start + Math.max(30, Math.round(resolveTimelineEffectiveHours(item) * 60));
        const safe = clampTimelineInRange(start, end, dayStartMinutes, dayEndMinutes);
        if (safe.end <= dayStartMinutes || safe.start >= dayEndMinutes) return null;
        return { item, start: safe.start, end: safe.end };
      })
      .filter((b): b is { item: WorkloadTimelineItem; start: number; end: number } => !!b);
    const laidOut = layoutCalendarTimelineBlocks(blocks);
    const tasks = timeline.filter((i) => i.kind === "task");
    const totalHours = tasks.reduce((acc, i) => acc + resolveTimelineEffectiveHours(i), 0);
    const loadPct = (totalHours / capacityHours) * 100;
    return { day, data, laidOut, taskCount: tasks.length, totalHours, loadPct };
  });

  // ── Helper coordinate → minuti su una colonna ─────────────────────────────────
  const minutesFromMouse = (event: MouseEvent<HTMLElement> | DragEvent<HTMLElement>, slot = CALENDAR_SLOT_MINUTES) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const relativeY = Math.max(0, Math.min(rect.height - 1, event.clientY - rect.top));
    const raw = (relativeY / hourHeight) * 60 + dayStartMinutes;
    return snapMinutesToSlotInRange(raw, dayStartMinutes, dayEndMinutes, slot);
  };

  const isTaskBlockTarget = (event: MouseEvent<HTMLElement>) =>
    !!(event.target as HTMLElement | null)?.closest('[data-wlcal-task="true"], [data-wlcal-check="true"]');

  if (error && dayStates.every((s) => !s.data)) {
    return <div className="rounded-md border border-danger/20 bg-danger/5 px-4 py-4 text-sm text-danger">{error}</div>;
  }

  return (
    <div className="wlcal" ref={scrollRef}>
      <div className="wlcal-inner">
        {/* Intestazione giorni */}
        <div className="wlcal-head" style={{ gridTemplateColumns: gridColumns }}>
          <div className="wlcal-corner" />
          {columns.map((col) => {
            const isToday = col.day === today;
            const cls = loadClass(col.loadPct);
            return (
              <div key={col.day} className={`wlcal-dcol ${isToday ? "is-today" : ""}`}>
                <div className="wlcal-dow">{DOW_LABELS[dowIndex(col.day)]}</div>
                <div className="wlcal-dnum">
                  {dayNumber(col.day)}
                  {isToday && <span className="wlcal-todayflag">OGGI</span>}
                </div>
                <div className="wlcal-dmeta">
                  {formatHours(col.totalHours)} · {col.taskCount} task
                </div>
                <div className="wlcal-loadbar">
                  <i className={cls} style={{ width: `${Math.min(100, col.loadPct)}%` }} />
                </div>
                <div className={`wlcal-pct ${cls}`}>{Math.round(col.loadPct)}% carico</div>
              </div>
            );
          })}
        </div>

        {/* Corpo: gutter + colonne giorno */}
        <div className="wlcal-body" style={{ gridTemplateColumns: gridColumns }}>
          {/* Gutter ore */}
          <div className="wlcal-gutter" style={{ height: bodyHeight }}>
            {hourMarks.map((minutes) => (
              <div className="wlcal-hslot" key={minutes} style={{ top: yOf(minutes) }}>
                <span>{minutesToHHMM(minutes)}</span>
              </div>
            ))}
            {showOpening && (
              <div className="wlcal-gmark is-start" style={{ top: yOf(openingMinutes!) }}>
                <b>{minutesToHHMM(openingMinutes!)}</b>
                <span>Inizio</span>
              </div>
            )}
            {showClosing && (
              <div className="wlcal-gmark is-limit" style={{ top: yOf(closingMinutes!) }}>
                <b>{minutesToHHMM(closingMinutes!)}</b>
                <span>Limite</span>
              </div>
            )}
          </div>

          {/* Colonne giorno */}
          {columns.map((col) => {
            const isToday = col.day === today;
            const isDrop = dropPreview?.day === col.day && drag != null;
            const showNow = isToday && nowMinutes >= dayStartMinutes && nowMinutes <= dayEndMinutes;
            return (
              <div
                key={col.day}
                data-date={col.day}
                className={`wlcal-daycol ${isToday ? "is-today" : ""} ${isDrop ? "is-drop" : ""}`}
                style={{ height: bodyHeight }}
                onMouseMove={(event) => {
                  if (drag != null || isTaskBlockTarget(event)) return;
                  const minutes = minutesFromMouse(event, CALENDAR_CREATE_SLOT_MINUTES);
                  const anchor = createAnchorRef.current;
                  if (anchor && anchor.day === col.day) {
                    const start = Math.min(anchor.minutes, minutes);
                    const end = Math.min(dayEndMinutes, Math.max(anchor.minutes, minutes) + CALENDAR_CREATE_SLOT_MINUTES);
                    setCreatePreview({ day: col.day, startMinutes: start, endMinutes: Math.max(start + CALENDAR_CREATE_SLOT_MINUTES, end) });
                    return;
                  }
                  const slotEnd = Math.min(dayEndMinutes, minutes + CALENDAR_CREATE_SLOT_MINUTES);
                  setCreatePreview({ day: col.day, startMinutes: minutes, endMinutes: slotEnd });
                }}
                onMouseDown={(event) => {
                  if (event.button !== 0 || drag != null || isTaskBlockTarget(event)) return;
                  const minutes = minutesFromMouse(event, CALENDAR_CREATE_SLOT_MINUTES);
                  createAnchorRef.current = { day: col.day, minutes };
                  setCreatePreview({ day: col.day, startMinutes: minutes, endMinutes: Math.min(dayEndMinutes, minutes + CALENDAR_CREATE_SLOT_MINUTES) });
                }}
                onMouseUp={(event) => {
                  if (drag != null || isTaskBlockTarget(event)) return;
                  const anchor = createAnchorRef.current;
                  if (!anchor || anchor.day !== col.day) return;
                  const minutes = minutesFromMouse(event, CALENDAR_CREATE_SLOT_MINUTES);
                  const start = Math.min(anchor.minutes, minutes);
                  const end = Math.min(dayEndMinutes, Math.max(anchor.minutes, minutes) + CALENDAR_CREATE_SLOT_MINUTES);
                  const startMinutes = start;
                  const endMinutes = Math.max(start + CALENDAR_CREATE_SLOT_MINUTES, end);
                  createAnchorRef.current = null;
                  setCreatePreview(null);
                  onCreateByDrag({ day: col.day, startTime: minutesToHHMM(startMinutes), estimatedHours: (endMinutes - startMinutes) / 60 });
                }}
                onMouseLeave={() => {
                  createAnchorRef.current = null;
                  setCreatePreview((current) => (current?.day === col.day ? null : current));
                }}
                onDragOver={(event) => {
                  if (drag == null) return;
                  event.preventDefault();
                  setDropPreview({ day: col.day, startMinutes: minutesFromMouse(event) });
                }}
                onDragLeave={() => {
                  setDropPreview((current) => (current?.day === col.day ? null : current));
                }}
                onDrop={(event) => {
                  if (drag == null) return;
                  event.preventDefault();
                  const minutes = dropPreview?.day === col.day ? dropPreview.startMinutes : minutesFromMouse(event);
                  const taskId = drag.taskId;
                  setDrag(null);
                  setDropPreview(null);
                  onMove(taskId, col.day, minutesToHHMM(minutes));
                }}
              >
                {/* griglia oraria */}
                {hourMarks.map((minutes) => (
                  <div className="wlcal-gline" key={minutes} style={{ top: yOf(minutes) }} />
                ))}

                {/* fuori orario */}
                {showOpening && (
                  <div className="wlcal-offhours" style={{ top: 0, height: yOf(openingMinutes!) }}>
                    <span>Fuori orario</span>
                  </div>
                )}
                {showClosing && (
                  <div className="wlcal-offhours is-bot" style={{ top: yOf(closingMinutes!), height: bodyHeight - yOf(closingMinutes!) }}>
                    <span>Fuori orario</span>
                  </div>
                )}

                {/* linee inizio/limite */}
                {showOpening && (
                  <div className="wlcal-workline" style={{ top: yOf(openingMinutes!) }}>
                    <span>Inizio {minutesToHHMM(openingMinutes!)}</span>
                  </div>
                )}
                {showClosing && (
                  <div className="wlcal-limite" style={{ top: yOf(closingMinutes!) }}>
                    <span>Limite {minutesToHHMM(closingMinutes!)}</span>
                  </div>
                )}

                {/* ora corrente */}
                {showNow && <div className="wlcal-nowline" style={{ top: yOf(nowMinutes) }} />}

                {/* eventi */}
                <div className="wlcal-evlayer">
                  {col.laidOut.map(({ item, start, end, column, totalColumns }, idx) => {
                    const top = yOf(start) + 1;
                    const height = Math.max(24, yOf(end) - yOf(start) - 2);
                    const widthPct = 100 / totalColumns;
                    const isBreak = isBreakKind(item.kind);
                    const isDone = item.kind === "task" && (item.status === "completed" || item.status === "done");
                    const areaColor = resolveTimelineTaskColor(item);
                    const compact = (height < 50 || density === "compact") && totalColumns > 1;
                    const showRange = height > 60;
                    const durationHours = (end - start) / 60;
                    const key = `${item.kind}-${item.source_id ?? idx}-${start}`;
                    const blockStyle: React.CSSProperties = {
                      top,
                      height,
                      left: `calc(${column * widthPct}% + 2px)`,
                      width: `calc(${widthPct}% - 5px)`,
                      ...(areaColor ? ({ ["--area" as string]: areaColor } as React.CSSProperties) : {}),
                    };

                    if (isBreak) {
                      return (
                        <div key={key} className="wlcal-ev is-lunch" style={blockStyle}>
                          <div className="wlcal-ev-client">{item.title || "Pausa"}</div>
                          {height > 36 && item.start_time && item.end_time && (
                            <div className="wlcal-ev-type">{item.start_time} – {item.end_time}</div>
                          )}
                        </div>
                      );
                    }

                    const readable = getReadableTaskTextColors(areaColor);
                    return (
                      <div
                        key={key}
                        data-wlcal-task="true"
                        className={`wlcal-ev ${compact ? "is-compact" : ""} ${isDone ? "is-done" : ""}`}
                        style={blockStyle}
                        title={`${resolveTimelineClientLabel(item)} · ${resolveTimelineTaskTitle(item)} · ${item.start_time}–${item.end_time}`}
                        draggable={item.kind === "task" && !!item.work_item_id && !isDone}
                        onDragStart={() => {
                          if (item.kind !== "task" || !item.work_item_id) return;
                          setDrag({ taskId: item.work_item_id, durationMinutes: end - start });
                        }}
                        onDragEnd={() => {
                          setDrag(null);
                          setDropPreview(null);
                        }}
                        onClick={(event) => {
                          if ((event.target as HTMLElement).closest('[data-wlcal-check="true"]')) return;
                          if (item.kind === "task" && item.work_item_id) onOpenEdit(item.work_item_id);
                        }}
                      >
                        {item.kind === "task" && item.work_item_id && (
                          <button
                            type="button"
                            data-wlcal-check="true"
                            className={`wlcal-ev-check ${isDone ? "is-done" : ""}`}
                            title={isDone ? "Segna non completata" : "Segna completata"}
                            onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
                            onClick={(event) => { event.stopPropagation(); onToggleComplete(item); }}
                          >
                            {isDone ? "✓" : ""}
                          </button>
                        )}
                        <div className="wlcal-ev-client" style={areaColor ? { color: readable.primary } : undefined}>
                          {resolveTimelineClientLabel(item)}
                        </div>
                        {!compact && (
                          <div className="wlcal-ev-type" style={areaColor ? { color: readable.secondary } : undefined}>
                            {resolveTimelineTaskTitle(item)}
                          </div>
                        )}
                        <div className="wlcal-ev-foot">
                          <span className="wlcal-ev-dur"><i />{formatHours(durationHours)}</span>
                          {showRange && item.start_time && item.end_time && (
                            <span className="wlcal-ev-range">{item.start_time}–{item.end_time}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* preview drop (sposta task) */}
                  {drag != null && dropPreview?.day === col.day && (
                    <div
                      className="wlcal-dropind"
                      style={{
                        top: yOf(dropPreview.startMinutes) + 1,
                        height: (drag.durationMinutes / 60) * hourHeight - 2,
                        left: 2,
                        right: 5,
                      }}
                    >
                      <span>
                        {minutesToHHMM(dropPreview.startMinutes)} – {minutesToHHMM(dropPreview.startMinutes + drag.durationMinutes)}
                      </span>
                    </div>
                  )}

                  {/* preview create (slot vuoto) */}
                  {drag == null && createPreview?.day === col.day && (
                    <div
                      className="wlcal-createind"
                      style={{
                        top: yOf(createPreview.startMinutes) + 1,
                        height: Math.max(16, yOf(createPreview.endMinutes) - yOf(createPreview.startMinutes) - 2),
                        left: 2,
                        right: 5,
                      }}
                    >
                      <span>+ {minutesToHHMM(createPreview.startMinutes)}–{minutesToHHMM(createPreview.endMinutes)}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {loading && dayStates.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-paper/60 dark:bg-ink-soft/60">
          <Spinner size="md" />
        </div>
      )}
    </div>
  );
}
