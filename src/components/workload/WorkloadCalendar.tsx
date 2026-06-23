import { useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from "react";
import {
  getWorkloadUserCalendarDayApi,
  type WorkloadTimelineItem,
  type WorkloadUserCalendarDayResponse,
} from "../../api/workload";
import { Spinner } from "../ui/Spinner";
import { Icon } from "../ui/Icon";
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

interface TrayItem {
  id: number;
  client: string;
  type: string;
  durationMinutes: number;
  areaColor: string | null;
  overflowHours?: number;
}

export function WorkloadCalendar({
  userId,
  companyId,
  visibleDays,
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

  const [dayStates, setDayStates] = useState<DayState[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const capacityHours = maxCapacityHours && maxCapacityHours > 0 ? maxCapacityHours : 8;

  // Drag intra-operatore (sposta task) + create-by-drag su slot vuoto.
  const [drag, setDrag] = useState<{ taskId: number; durationMinutes: number } | null>(null);
  const [dropPreview, setDropPreview] = useState<{ day: string; startMinutes: number } | null>(null);
  const [createPreview, setCreatePreview] = useState<{ day: string; startMinutes: number; endMinutes: number } | null>(null);
  const createAnchorRef = useRef<{ day: string; minutes: number } | null>(null);
  const [trayTab, setTrayTab] = useState<"reassign" | "unsched">("reassign");
  const [trayOpen, setTrayOpen] = useState(true);

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

  const today = todayIso();
  // Posizionamento in PERCENTUALE: il calendario riempie il contenitore ad altezza fissa (no scroll verticale).
  const yPct = (minutes: number) => ((minutes - dayStartMinutes) / totalMinutes) * 100;

  const hourMarks = useMemo(() => {
    const marks: number[] = [];
    for (let i = 0; i < hourSlots; i++) marks.push(dayStartMinutes + i * 60);
    if (dayStartMinutes + (hourSlots - 1) * 60 < dayEndMinutes) marks.push(dayEndMinutes);
    return marks;
  }, [dayStartMinutes, dayEndMinutes, hourSlots]);

  const showOpening = openingMinutes != null && openingMinutes > dayStartMinutes && openingMinutes < dayEndMinutes;
  const showClosing = closingMinutes != null && closingMinutes > dayStartMinutes && closingMinutes < dayEndMinutes;

  const gridColumns = `${GUTTER_WIDTH}px repeat(${visibleDays.length}, minmax(0, 1fr))`;

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

  // ── Tray "Da pianificare": over-capacity (riprogrammare) + senza orario ───────
  const tray = useMemo(() => {
    const reassign = new Map<number, TrayItem>();
    const unsched = new Map<number, TrayItem>();
    for (const s of dayStates) {
      const data = s.data;
      if (!data) continue;
      for (const t of data.over_capacity?.tasks ?? []) {
        if (reassign.has(t.work_item_id)) continue;
        reassign.set(t.work_item_id, {
          id: t.work_item_id,
          client: t.client_name || "Senza cliente",
          type: t.title,
          durationMinutes: Math.max(CALENDAR_SLOT_MINUTES, Math.round(((t.effective_load_hours || t.estimated_hours || 0.5)) * 60)),
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
  }, [dayStates]);
  const trayList = trayTab === "reassign" ? tray.reassign : tray.unsched;

  // ── Helper coordinate → minuti su una colonna ─────────────────────────────────
  const minutesFromMouse = (event: MouseEvent<HTMLElement> | DragEvent<HTMLElement>, slot = CALENDAR_SLOT_MINUTES) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const relativeY = Math.max(0, Math.min(rect.height - 1, event.clientY - rect.top));
    const raw = (relativeY / rect.height) * totalMinutes + dayStartMinutes;
    return snapMinutesToSlotInRange(raw, dayStartMinutes, dayEndMinutes, slot);
  };

  const isTaskBlockTarget = (event: MouseEvent<HTMLElement>) =>
    !!(event.target as HTMLElement | null)?.closest('[data-wlcal-task="true"], [data-wlcal-check="true"]');

  if (error && dayStates.every((s) => !s.data)) {
    return <div className="rounded-md border border-danger/20 bg-danger/5 px-4 py-4 text-sm text-danger">{error}</div>;
  }

  return (
    <div className={`wlcal-shell ${trayOpen ? "" : "is-tray-closed"} ${visibleDays.length === 1 ? "is-single" : ""}`}>
    <div className="wlcal">
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
          <div className="wlcal-gutter">
            {hourMarks.map((minutes) => (
              <div className="wlcal-hslot" key={minutes} style={{ top: `${yPct(minutes)}%` }}>
                <span>{minutesToHHMM(minutes)}</span>
              </div>
            ))}
            {showOpening && (
              <div className="wlcal-gmark is-start" style={{ top: `${yPct(openingMinutes!)}%` }}>
                <b>{minutesToHHMM(openingMinutes!)}</b>
                <span>Inizio</span>
              </div>
            )}
            {showClosing && (
              <div className="wlcal-gmark is-limit" style={{ top: `${yPct(closingMinutes!)}%` }}>
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
                  <div className="wlcal-gline" key={minutes} style={{ top: `${yPct(minutes)}%` }} />
                ))}

                {/* fuori orario */}
                {showOpening && (
                  <div className="wlcal-offhours" style={{ top: 0, height: `${yPct(openingMinutes!)}%` }}>
                    <span>Fuori orario</span>
                  </div>
                )}
                {showClosing && (
                  <div className="wlcal-offhours is-bot" style={{ top: `${yPct(closingMinutes!)}%`, height: `${100 - yPct(closingMinutes!)}%` }}>
                    <span>Fuori orario</span>
                  </div>
                )}

                {/* linee inizio/limite */}
                {showOpening && (
                  <div className="wlcal-workline" style={{ top: `${yPct(openingMinutes!)}%` }}>
                    <span>Inizio {minutesToHHMM(openingMinutes!)}</span>
                  </div>
                )}
                {showClosing && (
                  <div className="wlcal-limite" style={{ top: `${yPct(closingMinutes!)}%` }}>
                    <span>Limite {minutesToHHMM(closingMinutes!)}</span>
                  </div>
                )}

                {/* ora corrente */}
                {showNow && <div className="wlcal-nowline" style={{ top: `${yPct(nowMinutes)}%` }} />}

                {/* eventi */}
                <div className="wlcal-evlayer">
                  {col.laidOut.map(({ item, start, end, column, totalColumns }, idx) => {
                    const durationHours = (end - start) / 60;
                    const widthPct = 100 / totalColumns;
                    const isBreak = isBreakKind(item.kind);
                    const isDone = item.kind === "task" && (item.status === "completed" || item.status === "done");
                    const areaColor = resolveTimelineTaskColor(item);
                    const compact = durationHours <= 0.75 || density === "compact";
                    const showRange = durationHours >= 1.25;
                    const key = `${item.kind}-${item.source_id ?? idx}-${start}`;
                    const blockStyle: React.CSSProperties = {
                      top: `${yPct(start)}%`,
                      height: `calc(${yPct(end) - yPct(start)}% - 2px)`,
                      left: `calc(${column * widthPct}% + 2px)`,
                      width: `calc(${widthPct}% - 5px)`,
                      ...(areaColor ? ({ ["--area" as string]: areaColor } as React.CSSProperties) : {}),
                    };

                    if (isBreak) {
                      return (
                        <div key={key} className="wlcal-ev is-lunch" style={blockStyle}>
                          <div className="wlcal-ev-client">{item.title || "Pausa"}</div>
                          {!compact && item.start_time && item.end_time && (
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
                        top: `${yPct(dropPreview.startMinutes)}%`,
                        height: `${(drag.durationMinutes / totalMinutes) * 100}%`,
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
                        top: `${yPct(createPreview.startMinutes)}%`,
                        height: `${yPct(createPreview.endMinutes) - yPct(createPreview.startMinutes)}%`,
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

      {/* Tray "Da pianificare" (sidebar) — apribile/chiudibile */}
      {!trayOpen && (
        <button
          type="button"
          className="wlcal-tray-reopen"
          onClick={() => setTrayOpen(true)}
          title="Apri 'Da pianificare'"
        >
          <Icon name="list" className="h-4 w-4" />
          <span className="wlcal-tray-reopen__label">Da pianificare</span>
          <span className="wlcal-tray-reopen__cnt">{tray.reassign.length + tray.unsched.length}</span>
        </button>
      )}
      {trayOpen && (
      <aside className="wlcal-tray">
        <div className="wlcal-tray-head">
          <div className="wlcal-tray-tt">
            <Icon name="list" className="h-4 w-4 text-[#E91E8A]" />
            <h3>Da pianificare</h3>
            <span className="wlcal-tray-cnt">{tray.reassign.length + tray.unsched.length} schede</span>
            <button type="button" className="wlcal-tray-close" onClick={() => setTrayOpen(false)} aria-label="Chiudi" title="Chiudi">
              <Icon name="x" className="h-4 w-4" />
            </button>
          </div>
          <p>Trascina una scheda sulla timeline per assegnarle un orario.</p>
        </div>

        <div className="wlcal-tray-tabs">
          <button type="button" className={trayTab === "reassign" ? "on" : ""} onClick={() => setTrayTab("reassign")}>
            Da riprogrammare <span className="b">{tray.reassign.length}</span>
          </button>
          <button type="button" className={trayTab === "unsched" ? "on" : ""} onClick={() => setTrayTab("unsched")}>
            Senza orario <span className="b">{tray.unsched.length}</span>
          </button>
        </div>

        {trayTab === "reassign" && (
          <div className="wlcal-tray-note">
            <Icon name="alert-triangle" className="h-4 w-4 shrink-0" />
            <span><b>Oltre capacità.</b> Queste lavorazioni non rientrano nella giornata pianificata. Riportale in un altro giorno trascinandole sul calendario.</span>
          </div>
        )}

        <div className="wlcal-tray-list">
          {trayList.length === 0 ? (
            <div className="wlcal-tray-empty">Tutto pianificato.<br />Nessuna scheda in coda.</div>
          ) : (
            trayList.map((t) => (
              <div
                key={t.id}
                className="wlcal-tcard"
                style={t.areaColor ? ({ ["--area" as string]: t.areaColor } as React.CSSProperties) : undefined}
                draggable
                onDragStart={() => setDrag({ taskId: t.id, durationMinutes: t.durationMinutes })}
                onDragEnd={() => { setDrag(null); setDropPreview(null); }}
                onClick={() => onOpenEdit(t.id)}
                title="Trascina su un giorno per assegnare l'orario"
              >
                <div className="wlcal-tc-client">{t.client}</div>
                <div className="wlcal-tc-type">{t.type}</div>
                <div className="wlcal-tc-foot">
                  <span className="wlcal-tc-dur"><i />{formatHours(t.durationMinutes / 60)}</span>
                  {t.overflowHours != null && t.overflowHours > 0 && (
                    <span className="wlcal-tc-over">+{formatHours(t.overflowHours)} oltre limite</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </aside>
      )}
    </div>
  );
}
