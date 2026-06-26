import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import {
  getWorkloadUserCalendarDayApi,
  type WorkloadTimelineItem,
  type WorkloadUserCalendarDayResponse,
} from "../../api/workload";
import { Spinner } from "../ui/Spinner";
import {
  CALENDAR_CREATE_SLOT_MINUTES,
  CALENDAR_HOUR_HEIGHT_PX,
  CALENDAR_SLOT_MINUTES,
  clampTimelineInRange,
  formatHours,
  getReadableTaskTextColors,
  hhmmToMinutes,
  layoutCalendarTimelineBlocks,
  minutesToHHMM,
  resolveTimelineClientLabel,
  resolveTimelineEffectiveHours,
  resolveTimelineScheduleState,
  resolveTimelineTaskColor,
  resolveTimelineTaskTitle,
  snapMinutesToSlotInRange,
  type WorkloadTrayItem,
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
  /** Scambia le posizioni di due task (drop di una task su un'altra). */
  onSwap: (sourceId: number, targetId: number) => void;
  /** Crea per drag su slot vuoto. */
  onCreateByDrag: (args: { day: string; startTime: string; estimatedHours: number }) => void;
  /** Cambia periodo (−1 prec / +1 succ): usato per l'auto-paging trascinando sulle frecce. */
  onRequestPage?: (dir: -1 | 1) => void;
}

/** Handle imperativo: la tray (a livello pagina) avvia il drag pointer-based del calendario. */
export interface WorkloadCalendarHandle {
  startTrayDrag: (event: ReactPointerEvent<HTMLElement>, item: WorkloadTrayItem) => void;
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

/** Payload del drag pointer-based (evento già a calendario o scheda dalla tray). */
interface DragInfo {
  kind: "event" | "tray";
  taskId: number;
  durationMinutes: number;
  label: string;
  subtitle: string;
  areaColor: string | null;
  /** Item originale (per gli eventi): consente l'anteprima ottimistica anche cross-week,
   *  quando la settimana di partenza non è più caricata in dayStates. */
  sourceItem?: WorkloadTimelineItem | null;
}

/** Sposta un item timeline a un altro giorno aggiornando anche i campi data (così il filtro
 *  "solo giorno di assegnazione" mantiene visibile la task spostata di giorno). */
function patchTimelineItemDay(item: WorkloadTimelineItem, day: string): WorkloadTimelineItem {
  return {
    ...item,
    date: day,
    schedule_state: item.schedule_state ? { ...item.schedule_state, effective_work_date: day } : item.schedule_state,
    task: item.task
      ? {
          ...item.task,
          work_date: day,
          schedule_state: item.task.schedule_state
            ? { ...item.task.schedule_state, effective_work_date: day }
            : item.task.schedule_state,
        }
      : item.task,
  };
}

/** Notifica la barra di navigazione data (frecce) dello stato del drag, per il verde/auto-paging. */
function dispatchCalendarDragState(active: boolean, armed: -1 | 1 | null) {
  window.dispatchEvent(
    new CustomEvent("wlcal:drag", {
      detail: { active, armed: armed === -1 ? "prev" : armed === 1 ? "next" : null },
    }),
  );
}

// ── Stato per-giorno (dati timeline + carico) ────────────────────────────────────
interface DayState {
  date: string;
  data: WorkloadUserCalendarDayResponse | null;
}

export const WorkloadCalendar = forwardRef<WorkloadCalendarHandle, WorkloadCalendarProps>(function WorkloadCalendar({
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
  onSwap,
  onCreateByDrag,
  onRequestPage,
}: WorkloadCalendarProps, ref) {
  const { dayStartMinutes, dayEndMinutes, totalMinutes, hourSlots, openingMinutes, closingMinutes } = bounds;

  const [dayStates, setDayStates] = useState<DayState[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const capacityHours = maxCapacityHours && maxCapacityHours > 0 ? maxCapacityHours : 8;

  // Drag pointer-based (sposta evento / assegna scheda tray). Indipendente dai nodi DOM:
  // sopravvive ai re-render e al cambio periodo (paging) — a differenza dell'HTML5 DnD.
  const [drag, setDrag] = useState<DragInfo | null>(null);
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null);
  const [dropPreview, setDropPreview] = useState<{ day: string; startMinutes: number } | null>(null);
  // Task su cui si sta per fare swap (drop di una task sopra un'altra).
  const [swapTargetId, setSwapTargetId] = useState<number | null>(null);
  // Task in attesa di conferma swap dall'endpoint (anteprima ottimistica).
  const [swapPendingIds, setSwapPendingIds] = useState<number[]>([]);
  // Task in uscita (animazione di completamento) prima della rimozione locale.
  const [exitingIds, setExitingIds] = useState<number[]>([]);

  // Completa una task con animazione (pop del check + slide-out) e rimozione locale;
  // la persistenza/ricarica è gestita dal parent via onToggleComplete.
  const handleToggleComplete = (item: WorkloadTimelineItem) => {
    const id = item.work_item_id;
    const done = item.status === "completed" || item.status === "done";
    onToggleComplete(item);
    if (done || id == null) return;
    setExitingIds((cur) => (cur.includes(id) ? cur : [...cur, id]));
    window.setTimeout(() => {
      setDayStates((states) =>
        states.map((s) =>
          s.data
            ? { ...s, data: { ...s.data, timeline: s.data.timeline.filter((t) => !(t.kind === "task" && t.work_item_id === id)) } }
            : s,
        ),
      );
      setExitingIds((cur) => cur.filter((x) => x !== id));
    }, 320);
  };
  const [createPreview, setCreatePreview] = useState<{ day: string; startMinutes: number; endMinutes: number } | null>(null);
  const createAnchorRef = useRef<{ day: string; minutes: number } | null>(null);

  // Auto-scroll del calendario durante il drag verso i bordi alto/basso.
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRafRef = useRef<number | null>(null);
  const pointerYRef = useRef<number>(0);

  const stopAutoScroll = () => {
    if (autoScrollRafRef.current != null) {
      cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = null;
    }
  };

  const tickAutoScroll = () => {
    const el = scrollRef.current;
    if (!el) {
      autoScrollRafRef.current = null;
      return;
    }
    const rect = el.getBoundingClientRect();
    const edge = 70; // soglia in px dai bordi
    const maxSpeed = 20; // px per frame
    const y = pointerYRef.current;
    let delta = 0;
    if (y < rect.top + edge) {
      delta = -maxSpeed * Math.min(1, (rect.top + edge - y) / edge);
    } else if (y > rect.bottom - edge) {
      delta = maxSpeed * Math.min(1, (y - (rect.bottom - edge)) / edge);
    }
    if (delta !== 0) el.scrollTop += delta;
    autoScrollRafRef.current = requestAnimationFrame(tickAutoScroll);
  };

  useEffect(() => () => stopAutoScroll(), []);

  // Anteprima ottimistica dello swap: riposiziona subito le due task (ognuna
  // prende l'orario/giorno dell'altra mantenendo la propria durata) in attesa
  // della conferma dell'endpoint; il reload successivo riconcilia col server.
  const applyOptimisticSwap = (sourceId: number, targetId: number) => {
    setDayStates((states) => {
      let src: WorkloadTimelineItem | null = null;
      let tgt: WorkloadTimelineItem | null = null;
      // NB: il backend può restituire la stessa task su più giorni (dal giorno di
      // assegnazione alla scadenza): prendiamo la prima occorrenza e il giorno di
      // ASSEGNAZIONE dai suoi campi, non il giorno della colonna in cui compare.
      for (const s of states) {
        for (const it of s.data?.timeline ?? []) {
          if (it.kind !== "task") continue;
          if (it.work_item_id === sourceId && !src) src = it;
          if (it.work_item_id === targetId && !tgt) tgt = it;
        }
      }
      if (!src || !tgt) return states;
      const assignDayOf = (it: WorkloadTimelineItem) =>
        (resolveTimelineScheduleState(it)?.effective_work_date ?? it.task?.work_date ?? "").slice(0, 10) || null;
      const srcDay = assignDayOf(src);
      const tgtDay = assignDayOf(tgt);
      if (srcDay == null || tgtDay == null) return states;
      const srcStart = hhmmToMinutes(src.start_time) ?? 0;
      const srcEnd = hhmmToMinutes(src.end_time) ?? srcStart;
      const tgtStart = hhmmToMinutes(tgt.start_time) ?? 0;
      const tgtEnd = hhmmToMinutes(tgt.end_time) ?? tgtStart;
      const srcDur = Math.max(CALENDAR_SLOT_MINUTES, srcEnd - srcStart);
      const tgtDur = Math.max(CALENDAR_SLOT_MINUTES, tgtEnd - tgtStart);
      const srcMoved = patchTimelineItemDay({ ...src, start_time: minutesToHHMM(tgtStart), end_time: minutesToHHMM(tgtStart + srcDur) }, tgtDay);
      const tgtMoved = patchTimelineItemDay({ ...tgt, start_time: minutesToHHMM(srcStart), end_time: minutesToHHMM(srcStart + tgtDur) }, srcDay);
      return states.map((s) => {
        if (!s.data) return s;
        let timeline = s.data.timeline.filter(
          (it) => !(it.kind === "task" && (it.work_item_id === sourceId || it.work_item_id === targetId)),
        );
        if (s.date === tgtDay) timeline = [...timeline, srcMoved];
        if (s.date === srcDay) timeline = [...timeline, tgtMoved];
        return { ...s, data: { ...s.data, timeline } };
      });
    });
    setSwapPendingIds([sourceId, targetId]);
  };

  // Anteprima ottimistica dello spostamento: riposiziona subito la task (nuovo giorno/orario,
  // durata invariata) in attesa della conferma del backend; il reload riconcilia.
  // Usa l'item catturato all'inizio del drag, così funziona anche cross-week (quando la
  // settimana di partenza non è più caricata e la task non è in dayStates).
  const applyOptimisticMove = (info: DragInfo, day: string, startMinutes: number) => {
    const src = info.sourceItem;
    if (!src) return;
    const moved = patchTimelineItemDay(
      {
        ...src,
        is_all_day: false,
        start_time: minutesToHHMM(startMinutes),
        end_time: minutesToHHMM(startMinutes + info.durationMinutes),
      },
      day,
    );
    setDayStates((states) =>
      states.map((s) => {
        if (!s.data) return s;
        let timeline = s.data.timeline.filter((it) => !(it.kind === "task" && it.work_item_id === info.taskId));
        if (s.date === day) timeline = [...timeline, moved];
        return { ...s, data: { ...s.data, timeline } };
      }),
    );
  };

  // ── Drag pointer-based: controller ───────────────────────────────────────────────
  // Valori "freschi" letti dai listener globali (registrati una volta per drag).
  const geomRef = useRef({ dayStartMinutes, dayEndMinutes, totalMinutes });
  const cbRef = useRef({ onMove, onSwap, onRequestPage, applyOptimisticSwap, applyOptimisticMove });
  useEffect(() => {
    geomRef.current = { dayStartMinutes, dayEndMinutes, totalMinutes };
    cbRef.current = { onMove, onSwap, onRequestPage, applyOptimisticSwap, applyOptimisticMove };
  });

  const dragRef = useRef<(DragInfo & { startX: number; startY: number; active: boolean }) | null>(null);
  const dropRef = useRef<{ day: string; minutes: number } | null>(null);
  const swapRef = useRef<number | null>(null);
  const navHoldRef = useRef<{ dir: -1 | 1 | null; timer: number | null }>({ dir: null, timer: null });
  const justDraggedRef = useRef(false);

  // "hold to page": sostando su una freccia si cambia periodo (subito e poi ogni 700ms).
  const setNavHold = useCallback((dir: -1 | 1 | null) => {
    const h = navHoldRef.current;
    if (h.dir === dir) return;
    if (h.timer != null) { window.clearInterval(h.timer); h.timer = null; }
    h.dir = dir;
    dispatchCalendarDragState(true, dir);
    if (dir) {
      const page = () => cbRef.current.onRequestPage?.(dir);
      page();
      h.timer = window.setInterval(page, 700);
    }
  }, []);

  const onPointerMove = useCallback((e: PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    if (!d.active) {
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 4) return;
      d.active = true;
      setDrag({ kind: d.kind, taskId: d.taskId, durationMinutes: d.durationMinutes, label: d.label, subtitle: d.subtitle, areaColor: d.areaColor });
      document.body.style.userSelect = "none";
      dispatchCalendarDragState(true, null);
    }
    setGhostPos({ x: e.clientX, y: e.clientY });
    pointerYRef.current = e.clientY;
    if (autoScrollRafRef.current == null) autoScrollRafRef.current = requestAnimationFrame(tickAutoScroll);

    // 1) frecce di navigazione → auto-paging (cambio settimana/giorno mentre trascini)
    let dir: -1 | 1 | null = null;
    document.querySelectorAll<HTMLElement>("[data-wl-navzone]").forEach((b) => {
      const r = b.getBoundingClientRect();
      if (e.clientX >= r.left - 10 && e.clientX <= r.right + 10 && e.clientY >= r.top - 10 && e.clientY <= r.bottom + 10) {
        dir = b.dataset.wlNavzone === "prev" ? -1 : 1;
      }
    });
    setNavHold(dir);
    if (dir) { dropRef.current = null; setDropPreview(null); swapRef.current = null; setSwapTargetId(null); return; }

    // 2) sopra un'altra task (solo trascinando un evento) → swap
    let swapId: number | null = null;
    if (d.kind === "event") {
      document.querySelectorAll<HTMLElement>('[data-wlcal-task="true"]').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
          const tid = Number(el.dataset.taskId);
          if (Number.isFinite(tid) && tid !== d.taskId) swapId = tid;
        }
      });
    }
    if (swapId != null) { swapRef.current = swapId; setSwapTargetId(swapId); dropRef.current = null; setDropPreview(null); return; }
    swapRef.current = null; setSwapTargetId(null);

    // 3) sopra una colonna-giorno → anteprima del drop (snap a 15')
    // NB: for...of (non forEach) così il control-flow di TS tipizza correttamente `hit`
    // (con la closure di forEach verrebbe inferito `never` in build mode → errore tsc -b).
    let hit: { day: string; minutes: number } | null = null;
    for (const el of document.querySelectorAll<HTMLElement>(".wlcal-daycol[data-date]")) {
      const r = el.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        const g = geomRef.current;
        const relY = Math.max(0, Math.min(r.height - 1, e.clientY - r.top));
        const raw = (relY / r.height) * g.totalMinutes + g.dayStartMinutes;
        hit = { day: el.dataset.date!, minutes: snapMinutesToSlotInRange(raw, g.dayStartMinutes, g.dayEndMinutes, CALENDAR_SLOT_MINUTES) };
      }
    }
    if (hit) { dropRef.current = hit; setDropPreview({ day: hit.day, startMinutes: hit.minutes }); }
    else { dropRef.current = null; setDropPreview(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setNavHold]);

  const onPointerUp = useCallback(() => {
    window.removeEventListener("pointermove", onPointerMove);
    setNavHold(null);
    stopAutoScroll();
    document.body.style.userSelect = "";
    const d = dragRef.current;
    const drop = dropRef.current;
    const swapId = swapRef.current;
    if (d && d.active) {
      if (swapId != null && d.kind === "event") {
        cbRef.current.applyOptimisticSwap(d.taskId, swapId);
        cbRef.current.onSwap(d.taskId, swapId);
      } else if (drop) {
        // Anteprima ottimistica immediata (solo per gli eventi già a calendario).
        if (d.kind === "event") cbRef.current.applyOptimisticMove(d, drop.day, drop.minutes);
        cbRef.current.onMove(d.taskId, drop.day, minutesToHHMM(drop.minutes));
      }
      justDraggedRef.current = true;
      window.setTimeout(() => { justDraggedRef.current = false; }, 0);
    }
    dragRef.current = null; dropRef.current = null; swapRef.current = null;
    setDrag(null); setDropPreview(null); setSwapTargetId(null); setGhostPos(null);
    dispatchCalendarDragState(false, null);
  }, [onPointerMove, setNavHold]);

  const startDrag = (e: ReactPointerEvent<HTMLElement>, info: DragInfo) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragRef.current = { ...info, startX: e.clientX, startY: e.clientY, active: false };
    setGhostPos({ x: e.clientX, y: e.clientY });
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
  };

  // Pulizia se il componente smonta durante un drag.
  useEffect(() => () => {
    window.removeEventListener("pointermove", onPointerMove);
    if (navHoldRef.current.timer != null) window.clearInterval(navHoldRef.current.timer);
    document.body.style.userSelect = "";
  }, [onPointerMove]);

  // La tray (a livello pagina) avvia il drag pointer-based del calendario tramite questo handle.
  useImperativeHandle(ref, () => ({
    startTrayDrag: (event, item) => startDrag(event, {
      kind: "tray",
      taskId: item.id,
      durationMinutes: item.durationMinutes,
      label: item.client,
      subtitle: item.type,
      areaColor: item.areaColor,
    }),
  }));

  const daysKey = visibleDays.join(",");

  // Scroll iniziale all'orario di apertura (non a 00:00). Si riposiziona quando cambiano
  // operatore, densità o l'orario azienda; non sul paging (per non disturbare lo scroll utente).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || openingMinutes == null) return;
    const head = el.querySelector<HTMLElement>(".wlcal-head");
    const start = el.querySelector<HTMLElement>(".wlcal-gmark.is-start");
    if (!start) return;
    const headH = head?.offsetHeight ?? 0;
    el.scrollTop += start.getBoundingClientRect().top - el.getBoundingClientRect().top - headH - 16;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, density, openingMinutes]);

  // ── Fetch: UNA sola chiamata per l'intero range; il timeline è già taggato per
  //    giorno (item.date) e qui lo bucketizziamo per colonna-giorno. ────────────
  useEffect(() => {
    if (!visibleDays.length) {
      setDayStates([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const fromDay = visibleDays[0];
    const toDay = visibleDays[visibleDays.length - 1];
    const single = visibleDays.length === 1;
    getWorkloadUserCalendarDayApi(userId, {
      range_mode: single ? "day" : "custom",
      selected_date: single ? fromDay : todayIso(),
      anchor_date: fromDay,
      from_date: single ? undefined : fromDay,
      to_date: single ? undefined : toDay,
      company_id: companyId ?? undefined,
      include_completed: true,
    })
      .then((data) => {
        if (cancelled) return;
        const byDay = new Map<string, typeof data.timeline>();
        for (const item of data.timeline ?? []) {
          const d = (item.date ?? data.selected_date ?? fromDay).slice(0, 10);
          if (!byDay.has(d)) byDay.set(d, []);
          byDay.get(d)!.push(item);
        }
        const states: DayState[] = visibleDays.map((day) => ({
          date: day,
          data: {
            ...data,
            selected_date: day,
            timeline: byDay.get(day) ?? [],
            // over_capacity/conflitti restano riferiti al giorno selezionato dal backend.
            over_capacity: day === data.selected_date ? data.over_capacity : null,
            conflicts: day === data.selected_date ? data.conflicts : [],
          },
        }));
        setDayStates(states);
        setSwapPendingIds([]);
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
  // Posizionamento in PERCENTUALE rispetto al corpo: il corpo ha però un'altezza
  // FISSA in pixel (ore "grandi") e scorre internamente — la pagina resta ferma.
  const yPct = (minutes: number) => ((minutes - dayStartMinutes) / totalMinutes) * 100;
  const hourPx = density === "compact" ? 44 : CALENDAR_HOUR_HEIGHT_PX;
  const bodyHeightPx = Math.round((totalMinutes / 60) * hourPx);

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
  const buildColumn = (day: string) => {
    const state = dayStates.find((s) => s.date === day) ?? null;
    const data = state?.data ?? null;
    // Il timeline del giorno è già quello giusto (bucketizzato per item.date): il
    // backend piazza ogni task una sola volta nel suo giorno effettivo.
    const timeline = data?.timeline ?? [];
    const timed = timeline.filter((item) => !item.is_all_day && !!item.start_time && !!item.end_time);
    const blocks = timed
      .map((item) => {
        const start = hhmmToMinutes(item.start_time) ?? 0;
        let end = hhmmToMinutes(item.end_time) ?? start + Math.max(30, Math.round(resolveTimelineEffectiveHours(item) * 60));
        // Per le task arretrate (carried-over) l'OCCUPAZIONE sul calendario riflette
        // le ore EFFETTIVE (peso ridotto), non la durata stimata start→end.
        const sched = resolveTimelineScheduleState(item);
        const overdue = item.kind === "task" && !!sched && (sched.delay_code != null || sched.is_overdue || sched.is_left_behind);
        if (overdue) {
          const effMin = Math.round(resolveTimelineEffectiveHours(item) * 60);
          if (effMin > 0) end = start + Math.max(CALENDAR_SLOT_MINUTES, effMin);
        }
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
  };

  const columns = visibleDays.map(buildColumn);

  // ── Tray "Da pianificare": over-capacity (riprogrammare) + senza orario ───────

  // ── Helper coordinate → minuti su una colonna ─────────────────────────────────
  const minutesFromMouse = (event: MouseEvent<HTMLElement>, slot = CALENDAR_SLOT_MINUTES) => {
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
    <div className={`wlcal-shell ${visibleDays.length === 1 ? "is-single" : ""}`}>
    <div
      className="wlcal"
      ref={scrollRef}
    >
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

        {/* Corpo: gutter + colonne giorno — altezza fissa in px, scroll interno */}
        <div className="wlcal-body" style={{ gridTemplateColumns: gridColumns, height: bodyHeightPx, flex: "0 0 auto" }}>
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

                {/* ora corrente */}
                {showNow && <div className="wlcal-nowline" style={{ top: `${yPct(nowMinutes)}%` }} />}

                {/* eventi */}
                <div className="wlcal-evlayer">
                  {col.laidOut.map(({ item, start, end, column, totalColumns }, idx) => {
                    const durationHours = (end - start) / 60;
                    const widthPct = 100 / totalColumns;
                    const isBreak = isBreakKind(item.kind);
                    const isExiting = item.kind === "task" && item.work_item_id != null && exitingIds.includes(item.work_item_id);
                    const isDone = (item.kind === "task" && (item.status === "completed" || item.status === "done")) || isExiting;
                    const scheduleState = resolveTimelineScheduleState(item);
                    const isOverdue = item.kind === "task" && !!scheduleState &&
                      (scheduleState.delay_code != null || scheduleState.is_overdue || scheduleState.is_left_behind);
                    const effectiveHours = resolveTimelineEffectiveHours(item);
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
                        data-task-id={item.kind === "task" && item.work_item_id ? item.work_item_id : undefined}
                        className={`wlcal-ev ${compact ? "is-compact" : ""} ${isDone ? "is-done" : ""} ${isOverdue ? "is-overdue" : ""} ${isExiting ? "wl-cal-task-exit" : ""} ${swapTargetId === item.work_item_id ? "is-swap-target" : ""} ${item.work_item_id && swapPendingIds.includes(item.work_item_id) ? "is-swap-pending" : ""} ${drag?.taskId === item.work_item_id ? "is-dragging" : ""}`}
                        style={blockStyle}
                        title={`${resolveTimelineClientLabel(item)} · ${resolveTimelineTaskTitle(item)} · ${item.start_time}–${item.end_time}`}
                        onPointerDown={(event) => {
                          if (item.kind !== "task" || !item.work_item_id || isDone) return;
                          if ((event.target as HTMLElement).closest('[data-wlcal-check="true"]')) return;
                          startDrag(event, {
                            kind: "event",
                            taskId: item.work_item_id,
                            durationMinutes: end - start,
                            label: resolveTimelineClientLabel(item),
                            subtitle: resolveTimelineTaskTitle(item),
                            areaColor: areaColor ?? null,
                            sourceItem: item,
                          });
                        }}
                        onClick={(event) => {
                          if (justDraggedRef.current) return;
                          if ((event.target as HTMLElement).closest('[data-wlcal-check="true"]')) return;
                          if (item.kind === "task" && item.work_item_id) onOpenEdit(item.work_item_id);
                        }}
                      >
                        {isOverdue && (
                          <span
                            className="wlcal-ev-late"
                            title={`Arretrata${scheduleState?.overdue_days ? ` · ${scheduleState.overdue_days}g di ritardo` : ""}`}
                          >
                            ⟲
                          </span>
                        )}
                        {item.kind === "task" && item.work_item_id && (
                          <button
                            type="button"
                            data-wlcal-check="true"
                            className={`wlcal-ev-check ${isDone ? "is-done" : ""} ${isExiting ? "wl-cal-check-anim" : ""}`}
                            title={isDone ? "Segna non completata" : "Segna completata"}
                            onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
                            onClick={(event) => { event.stopPropagation(); handleToggleComplete(item); }}
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
                          <span className="wlcal-ev-dur"><i />{formatHours(isOverdue ? effectiveHours : durationHours)}</span>
                          {showRange && !isOverdue && item.start_time && item.end_time && (
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

          {/* Linea unica inizio/limite orario (una sola, non ripetuta per colonna) */}
          {showOpening && (
            <div className="wlcal-workline-full" style={{ top: `${yPct(openingMinutes!)}%`, left: GUTTER_WIDTH }}>
              <span>Inizio {minutesToHHMM(openingMinutes!)}</span>
            </div>
          )}
          {showClosing && (
            <div className="wlcal-limite-full" style={{ top: `${yPct(closingMinutes!)}%`, left: GUTTER_WIDTH }}>
              <span>Limite {minutesToHHMM(closingMinutes!)}</span>
            </div>
          )}
        </div>
      </div>

      {loading && dayStates.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-paper/60 dark:bg-ink-soft/60">
          <Spinner size="md" />
        </div>
      )}
    </div>

      {/* Fantasma che segue il cursore durante il drag (pointer-based). */}
      {drag && ghostPos && createPortal(
        <div
          className="wlcal-drag-ghost"
          style={{
            left: ghostPos.x,
            top: ghostPos.y,
            ...(drag.areaColor ? ({ ["--area" as string]: drag.areaColor } as React.CSSProperties) : {}),
          }}
        >
          <div className="wlcal-ev-client">{drag.label}</div>
          {drag.subtitle && <div className="wlcal-ev-type">{drag.subtitle}</div>}
          <div className="wlcal-ev-foot">
            <span className="wlcal-ev-dur"><i />{formatHours(drag.durationMinutes / 60)}</span>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
});
