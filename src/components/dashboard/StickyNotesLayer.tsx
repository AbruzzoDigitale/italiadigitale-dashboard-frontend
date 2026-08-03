import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { clampRect, collides, DEFAULT_COLS, type Rect } from "./grid/gridEngine";
import type { WidgetInstance } from "./widgets/types";
import { Icon } from "../ui/Icon";
import { RichTextEditor } from "../ui/RichTextEditor";

/** Solo testo (senza tag HTML) — per capire se la nota è vuota / anteprima. */
function stripHtml(html: string): string {
  return (html || "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}
import {
  listStickyNotesApi,
  createStickyNoteApi,
  updateStickyNoteApi,
  bulkUpdateStickyNotesApi,
  deleteStickyNoteApi,
  type StickyNote,
} from "../../api/stickyNotes";
import type { DashboardPlatform } from "../../api/dashboardLayout";

// Metriche identiche alla DashboardGrid: le note "vivono" nella stessa griglia a
// celle dei widget, così posso bloccarne la sovrapposizione ai widget (ma non tra loro).
// COLS è ora per-istanza (12 desktop, 2 anteprima mobile) — vedi prop `cols`.
const ROW_H = 76;
const GAP = 16;
const MIN_W = 2;
const MIN_H = 2;

export const NOTE_COLORS = [
  "#FEF3C7", "#FDE68A", "#FBCFE8", "#F9A8D4", "#BFDBFE",
  "#93C5FD", "#BBF7D0", "#86EFAC", "#FED7AA", "#DDD6FE", "#FECACA", "#E5E7EB",
];

interface Props {
  companyId: number;
  /** Le note sono spostabili/ridimensionabili solo in modalità "Personalizza". */
  editing: boolean;
  /** Widget correnti: si riorganizzano (reflow) per far spazio alle note. */
  widgets: WidgetInstance[];
  /** Riporta i rettangoli delle note così la griglia può evitarli nel reflow. */
  onNoteRectsChange?: (rects: Rect[]) => void;
  /** Anteprima layout widget durante il drag di una nota (null = ripristina). */
  onWidgetsPreview: (widgets: WidgetInstance[] | null) => void;
  /** Salva il nuovo layout widget dopo drop/aggiunta/eliminazione di note. */
  onWidgetsCommit: (widgets: WidgetInstance[]) => void;
  /** Colonne della griglia (default 12 desktop; 2 per l'anteprima mobile). */
  cols?: number;
  /** Piattaforma delle note (default desktop): note indipendenti desktop/mobile. */
  platform?: DashboardPlatform;
}

type DragKind = "move" | "resize";
interface DragState {
  kind: DragKind;
  ids: number[];               // note mosse (una singola, oppure tutte quelle del gruppo)
  primary: number;             // nota "guida" per il controllo collisioni
  startX: number;
  startY: number;
  orig: Map<number, Rect>;
  step: number;                // colW + GAP
  moved: boolean;
  lastRects?: Map<number, Rect>; // ultime posizioni del set trascinato
}

function rectOf(n: StickyNote): Rect {
  return { x: n.x, y: n.y, w: n.w, h: n.h };
}

export interface StickyNotesHandle {
  addNote: () => void;
}

export const StickyNotesLayer = forwardRef<StickyNotesHandle, Props>(function StickyNotesLayer(
  { companyId, editing, widgets, onNoteRectsChange, onWidgetsPreview, onWidgetsCommit, cols, platform = "desktop" },
  ref,
) {
  const COLS = cols ?? DEFAULT_COLS;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const [notes, setNotes] = useState<StickyNote[]>([]);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [paletteFor, setPaletteFor] = useState<number | null>(null);
  const [lightbox, setLightbox] = useState<{ groupKey: string; index: number } | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;
  // Ref sempre aggiornato alle note correnti (per leggere la geometria fresca in onUp).
  const notesRef = useRef<StickyNote[]>(notes);
  notesRef.current = notes;

  // Riporta i rettangoli delle note al contenitore (ostacoli per il reflow widget).
  const onNoteRectsChangeRef = useRef(onNoteRectsChange);
  onNoteRectsChangeRef.current = onNoteRectsChange;
  useEffect(() => {
    onNoteRectsChangeRef.current?.(notes.map(rectOf));
  }, [notes]);

  const colW = width > 0 ? (width - (COLS - 1) * GAP) / COLS : 0;

  // Larghezza reattiva.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Caricamento.
  useEffect(() => {
    let alive = true;
    listStickyNotesApi(companyId, platform)
      .then((data) => { if (alive) setNotes(data); })
      .catch(() => { if (alive) setNotes([]); });
    return () => { alive = false; };
  }, [companyId, platform]);

  const cellToPx = (r: Rect) => ({
    left: r.x * (colW + GAP),
    top: r.y * (ROW_H + GAP),
    width: r.w * colW + (r.w - 1) * GAP,
    height: r.h * ROW_H + (r.h - 1) * GAP,
  });

  // Reflow dei widget attorno alle note: le note sono ostacoli fissi, i widget si
  // impacchettano verso l'alto evitandole (come fanno tra loro nella grid).
  const reflowWidgets = useCallback((noteRects: Rect[]): WidgetInstance[] => {
    const placed: Rect[] = noteRects.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h }));
    const byId = new Map<string, WidgetInstance>();
    for (const wgt of [...widgets].sort((a, b) => a.y - b.y || a.x - b.x)) {
      const c = clampRect(wgt, COLS);
      let y = 0;
      while (placed.some((o) => collides({ ...c, y }, o))) y++;
      const pw = { ...wgt, x: c.x, y };
      placed.push(pw);
      byId.set(wgt.id, pw);
    }
    return widgets.map((w) => byId.get(w.id) ?? w);
  }, [widgets]);

  // Note correnti con override sul set trascinato → rettangoli per il reflow.
  const noteRectsWith = useCallback((overrides: Map<number, Rect>): Rect[] =>
    notesRef.current.map((n) => overrides.get(n.id) ?? rectOf(n)), []);

  // Nota: NON spostiamo più le note quando cambiano i widget. Le note sono ostacoli
  // fissi e sono i widget a scorrere attorno (vedi `reserved` nel reflow della griglia),
  // così tutto segue la stessa logica di impacchettamento degli altri elementi.

  // Note raggruppate per group_id ("" = singole, hanno key propria per id).
  const grouped = useMemo(() => {
    const map = new Map<string, StickyNote[]>();
    for (const n of notes) {
      const key = n.group_id != null ? `g${n.group_id}` : `s${n.id}`;
      const arr = map.get(key) ?? [];
      arr.push(n);
      map.set(key, arr);
    }
    // ordina per z dentro ogni pila
    for (const arr of map.values()) arr.sort((a, b) => a.z - b.z);
    return map;
  }, [notes]);

  const firstFreeSlot = (w: number, h: number): { x: number; y: number } => {
    const occupied = [...widgets, ...notes.map(rectOf)];
    for (let y = 0; y < 200; y++) {
      for (let x = 0; x <= COLS - w; x++) {
        if (!occupied.some((o) => collides({ x, y, w, h }, o))) return { x, y };
      }
    }
    return { x: 0, y: 0 };
  };

  // ── Aggiunta nota ──────────────────────────────────────────────────────────
  const addNote = async () => {
    const slot = firstFreeSlot(MIN_W, MIN_H);
    try {
      const created = await createStickyNoteApi(companyId, {
        text: "",
        color: NOTE_COLORS[0],
        x: slot.x, y: slot.y, w: MIN_W, h: MIN_H,
      }, platform);
      setNotes((cur) => [...cur, created]);
      onWidgetsCommit(reflowWidgets([...notes.map(rectOf), rectOf(created)]));
      setLightbox({ groupKey: `s${created.id}`, index: 0 });
    } catch { /* silenzioso */ }
  };

  useImperativeHandle(ref, () => ({ addNote }));

  const patchLocal = (id: number, patch: Partial<StickyNote>) =>
    setNotes((cur) => cur.map((n) => (n.id === id ? { ...n, ...patch } : n)));

  const saveNote = (id: number, patch: Partial<StickyNote>) => {
    patchLocal(id, patch);
    void updateStickyNoteApi(id, patch).catch(() => {});
  };

  const removeNote = async (id: number) => {
    setNotes((cur) => cur.filter((n) => n.id !== id));
    onWidgetsCommit(reflowWidgets(notes.filter((n) => n.id !== id).map(rectOf)));
    await deleteStickyNoteApi(id).catch(() => {});
  };

  const openLightbox = (note: StickyNote) =>
    setLightbox({ groupKey: note.group_id != null ? `g${note.group_id}` : `s${note.id}`, index: 0 });

  // ── Drag / resize ──────────────────────────────────────────────────────────
  const onPointerDown = (e: React.PointerEvent, note: StickyNote, kind: DragKind) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    // Sia move sia resize agiscono sull'intero gruppo (i membri condividono il rettangolo).
    const group = note.group_id != null ? notes.filter((n) => n.group_id === note.group_id) : [note];
    const ids = group.map((n) => n.id);
    const orig = new Map<number, Rect>();
    ids.forEach((id) => { const n = notes.find((x) => x.id === id); if (n) orig.set(id, rectOf(n)); });
    setDrag({ kind, ids, primary: note.id, startX: e.clientX, startY: e.clientY, orig, step: colW + GAP, moved: false });
  };

  useEffect(() => {
    if (!drag) return;
    const stepX = drag.step;
    const stepY = ROW_H + GAP;

    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dcx = Math.round((e.clientX - d.startX) / stepX);
      const dcy = Math.round((e.clientY - d.startY) / stepY);
      if (dcx !== 0 || dcy !== 0) d.moved = true;

      const overrides = new Map<number, Rect>();
      if (d.kind === "resize") {
        const o = d.orig.get(d.primary)!;
        const w = Math.max(MIN_W, Math.min(o.w + dcx, COLS - o.x));
        const h = Math.max(MIN_H, o.h + dcy);
        // Applica la nuova dimensione a tutto il gruppo (condividono il rettangolo).
        d.ids.forEach((id) => {
          const oo = d.orig.get(id)!;
          overrides.set(id, { x: oo.x, y: oo.y, w, h });
          patchLocal(id, { w, h });
        });
      } else {
        // move: le note si muovono LIBERAMENTE (si possono sovrapporre tra loro).
        const po = d.orig.get(d.primary)!;
        const realDx = Math.max(0, Math.min(po.x + dcx, COLS - po.w)) - po.x;
        const realDy = Math.max(0, po.y + dcy) - po.y;
        d.ids.forEach((id) => {
          const o = d.orig.get(id)!;
          overrides.set(id, { x: Math.max(0, Math.min(o.x + realDx, COLS - o.w)), y: Math.max(0, o.y + realDy), w: o.w, h: o.h });
        });
        setNotes((cur) => cur.map((n) => {
          const r = overrides.get(n.id);
          return r ? { ...n, x: r.x, y: r.y } : n;
        }));
      }
      d.lastRects = overrides;
      // I widget si riorganizzano attorno alle note (anteprima live).
      onWidgetsPreview(reflowWidgets(noteRectsWith(overrides)));
    };

    const onUp = () => {
      const d = dragRef.current;
      setDrag(null);
      if (!d) return;
      const cur = notesRef.current;
      const last = d.lastRects ?? new Map<number, Rect>();

      // Click (nessun movimento) → apri lightbox, ripristina i widget
      if (!d.moved) {
        onWidgetsPreview(null);
        const note = cur.find((n) => n.id === d.primary);
        if (note) openLightbox(note);
        return;
      }

      // Raggruppamento: nota SINGOLA rilasciata sopra un'altra nota/pila.
      const dragged = cur.find((n) => n.id === d.primary);
      const draggedRect = last.get(d.primary) ?? (dragged ? rectOf(dragged) : undefined);
      if (d.kind === "move" && dragged && dragged.group_id == null && draggedRect) {
        const target = cur.find((n) => n.id !== dragged.id && overlapRatio(draggedRect, rectOf(n)) >= 0.4);
        if (target) {
          const gid = target.group_id ?? (cur.reduce((m, n) => Math.max(m, n.group_id ?? 0), 0) + 1);
          const maxZ = cur.filter((n) => n.group_id === gid).reduce((m, n) => Math.max(m, n.z), 0);
          const base = { x: target.x, y: target.y, w: target.w, h: target.h, group_id: gid };
          const geom = [
            ...(target.group_id == null ? [{ id: target.id, ...base, z: 0 }] : []),
            { id: dragged.id, ...base, z: (target.group_id == null ? 0 : maxZ) + 1 },
          ];
          setNotes((prev) => prev.map((n) => {
            const g = geom.find((x) => x.id === n.id);
            return g ? { ...n, ...g } : n;
          }));
          void bulkUpdateStickyNotesApi(companyId, geom, platform).then(setNotes).catch(() => {});
          const finalOverrides = new Map(last);
          finalOverrides.set(dragged.id, { x: base.x, y: base.y, w: base.w, h: base.h });
          onWidgetsCommit(reflowWidgets(noteRectsWith(finalOverrides)));
          return;
        }
      }

      // Nessun raggruppamento: persisti la geometria delle note + salva il layout widget.
      const geom = d.ids
        .map((id) => {
          const r = last.get(id);
          const n = cur.find((x) => x.id === id);
          if (!n) return null;
          return { id, x: r?.x ?? n.x, y: r?.y ?? n.y, w: r?.w ?? n.w, h: r?.h ?? n.h, group_id: n.group_id, z: n.z };
        })
        .filter(Boolean) as { id: number; x: number; y: number; w: number; h: number; group_id: number | null; z: number }[];
      if (geom.length === 1) {
        const g = geom[0];
        void updateStickyNoteApi(g.id, { x: g.x, y: g.y, w: g.w, h: g.h }).catch(() => {});
      } else if (geom.length > 1) {
        void bulkUpdateStickyNotesApi(companyId, geom, platform).catch(() => {});
      }
      onWidgetsCommit(reflowWidgets(noteRectsWith(last)));
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag]);

  // Aggiungi una nuova nota già raggruppata con quella aperta nella lightbox.
  // Se la nota di riferimento è singola, crea un nuovo gruppo con entrambe.
  const addToGroup = async (ref: StickyNote) => {
    const cur = notesRef.current;
    const existingGid = ref.group_id;
    const gid = existingGid ?? (cur.reduce((m, n) => Math.max(m, n.group_id ?? 0), 0) + 1);
    const members = cur.filter((n) => (existingGid != null ? n.group_id === existingGid : n.id === ref.id));
    const maxZ = members.reduce((m, n) => Math.max(m, n.z), 0);
    // Le note di un gruppo condividono lo stesso rettangolo: uso quello della nota aperta.
    const base = { x: ref.x, y: ref.y, w: ref.w, h: ref.h };
    try {
      const created = await createStickyNoteApi(companyId, {
        text: "", color: ref.color, ...base, group_id: gid, z: maxZ + 1,
      }, platform);
      setNotes((prev) => [
        ...prev.map((n) =>
          existingGid == null && n.id === ref.id ? { ...n, group_id: gid, z: 0, ...base } : n,
        ),
        created,
      ]);
      if (existingGid == null) {
        void updateStickyNoteApi(ref.id, { group_id: gid, z: 0, ...base }).catch(() => {});
      }
      // La nuova nota occupa lo stesso rettangolo del gruppo → i widget non cambiano.
      setLightbox({ groupKey: `g${gid}`, index: members.length });
    } catch { /* silenzioso */ }
  };

  // Detach di una nota da un gruppo (dalla lightbox).
  const detachNote = (note: StickyNote) => {
    const slot = firstFreeSlot(note.w, note.h);
    saveNote(note.id, { group_id: null, z: 0, x: slot.x, y: slot.y });
    const rects = notes.map((n) => (n.id === note.id ? { x: slot.x, y: slot.y, w: note.w, h: note.h } : rectOf(n)));
    onWidgetsCommit(reflowWidgets(rects));
  };

  if (width === 0) return <div ref={containerRef} className="pointer-events-none absolute inset-0" />;

  const lightboxNotes = lightbox ? (grouped.get(lightbox.groupKey) ?? []) : [];

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-0 z-[5]">
      {[...grouped.entries()].map(([key, arr]) => {
        const top = arr[arr.length - 1];
        const px = cellToPx(rectOf(top));
        const isPile = arr.length > 1;
        return (
          <div
            key={key}
            className="pointer-events-auto absolute select-none"
            style={{ left: px.left, top: px.top, width: px.width, height: px.height }}
          >
            {/* Note "sotto" della pila (fan) */}
            {isPile && arr.slice(0, -1).map((n, i) => (
              <div
                key={n.id}
                className="absolute inset-0 rounded-lg border border-black/10 shadow-sm"
                style={{ backgroundColor: n.color, transform: `translate(${(i + 1) * 4}px, ${(i + 1) * 4}px) rotate(${(i % 2 ? 1 : -1) * 1.5}deg)`, zIndex: i }}
              />
            ))}
            {/* Nota in cima (interattiva). Spostabile solo in "Personalizza". */}
            <div
              onPointerDown={editing ? (e) => onPointerDown(e, top, "move") : undefined}
              onClick={editing ? undefined : () => openLightbox(top)}
              className={`absolute inset-0 flex flex-col overflow-hidden rounded-lg border border-black/10 p-2 shadow-md ${
                editing ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
              }`}
              style={{ backgroundColor: top.color, zIndex: arr.length }}
            >
              {stripHtml(top.text) ? (
                <div
                  className="min-h-0 flex-1 overflow-hidden break-words text-[12px] leading-snug text-[#3a2f14] [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-4 [&_p]:my-0.5 [&_ul]:list-disc [&_ul]:pl-4"
                  dangerouslySetInnerHTML={{ __html: top.text }}
                />
              ) : (
                <div className="min-h-0 flex-1 text-[12px] italic text-[#3a2f14]/50">Nota vuota…</div>
              )}
              <div className="mt-1 flex items-center justify-between">
                {isPile ? (
                  <span className="rounded-full bg-black/10 px-1.5 text-[10px] font-bold text-[#3a2f14]">{arr.length} note</span>
                ) : <span />}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    title="Colore"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); setPaletteFor((v) => (v === top.id ? null : top.id)); }}
                    className="grid h-4 w-4 place-items-center rounded-full border border-black/20 bg-white/40"
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: top.color }} />
                  </button>
                </div>
              </div>

              {paletteFor === top.id && (
                <div
                  onPointerDown={(e) => e.stopPropagation()}
                  className="absolute bottom-8 right-1 z-20 grid grid-cols-6 gap-1 rounded-md border border-line bg-paper p-1.5 shadow-lg dark:border-[#2a2a2e] dark:bg-[#1c1c20]"
                >
                  {NOTE_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); arr.forEach((n) => saveNote(n.id, { color: c })); setPaletteFor(null); }}
                      className="h-5 w-5 rounded-full border border-black/10"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Handle resize (nota o gruppo) — solo in "Personalizza". */}
            {editing && (
              <div
                onPointerDown={(e) => onPointerDown(e, top, "resize")}
                className="absolute -bottom-0.5 -right-0.5 z-30 h-4 w-4 cursor-nwse-resize"
                title="Ridimensiona"
              >
                <svg viewBox="0 0 10 10" className="h-full w-full text-black/30"><path d="M9 3v6H3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
              </div>
            )}
          </div>
        );
      })}

      {/* Lightbox / slide */}
      {lightbox && lightboxNotes.length > 0 && (
        <StickyLightbox
          notes={lightboxNotes}
          index={Math.min(lightbox.index, lightboxNotes.length - 1)}
          onIndex={(i) => setLightbox((l) => (l ? { ...l, index: i } : l))}
          onClose={() => setLightbox(null)}
          onChangeText={(id, text) => saveNote(id, { text })}
          onChangeColor={(id, color) => saveNote(id, { color })}
          onAddNote={addToGroup}
          onDetach={detachNote}
          onDelete={(id) => {
            void removeNote(id);
            setLightbox((l) => {
              if (!l) return l;
              const rest = lightboxNotes.filter((n) => n.id !== id);
              return rest.length ? { ...l, index: 0 } : null;
            });
          }}
        />
      )}
    </div>
  );
});

function overlapRatio(a: Rect, b: Rect): number {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = ix * iy;
  const area = a.w * a.h;
  return area > 0 ? inter / area : 0;
}

// ── Lightbox ──────────────────────────────────────────────────────────────────
function StickyLightbox({
  notes, index, onIndex, onClose, onChangeText, onChangeColor, onAddNote, onDetach, onDelete,
}: {
  notes: StickyNote[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  onChangeText: (id: number, text: string) => void;
  onChangeColor: (id: number, color: string) => void;
  onAddNote: (ref: StickyNote) => void;
  onDetach: (note: StickyNote) => void;
  onDelete: (id: number) => void;
}) {
  const note = notes[index];
  // Direzione della sfilata (per la motion graphic dello slide).
  const prevIndexRef = useRef(index);
  const dirRef = useRef<"next" | "prev">("next");
  if (index !== prevIndexRef.current) {
    dirRef.current = index > prevIndexRef.current ? "next" : "prev";
    prevIndexRef.current = index;
  }
  const slideClass = dirRef.current === "next" ? "sn-slide-next" : "sn-slide-prev";
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onIndex(Math.max(0, index - 1));
      if (e.key === "ArrowRight") onIndex(Math.min(notes.length - 1, index + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, notes.length, onClose, onIndex]);
  if (!note) return null;

  return (
    <div className="pointer-events-auto fixed inset-0 z-[13000] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="relative flex w-full max-w-lg flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between text-white">
          <span className="text-[12px] font-semibold">
            {notes.length > 1 ? `Nota ${index + 1} di ${notes.length}` : "Nota"}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onAddNote(note)}
              title="Aggiungi una nota a questo gruppo"
              className="inline-flex items-center gap-1.5 rounded-md bg-white/15 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-white/25"
            >
              <Icon name="plus" className="h-4 w-4" /> Nota
            </button>
            <button
              type="button"
              onClick={onClose}
              title="Fatto"
              className="inline-flex items-center gap-1.5 rounded-md bg-white/15 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-white/25"
            >
              <Icon name="check" className="h-4 w-4" /> Fatto
            </button>
          </div>
        </div>

        <div className="flex items-stretch gap-2">
          {notes.length > 1 && (
            <button type="button" onClick={() => onIndex(Math.max(0, index - 1))} disabled={index === 0}
              className="rounded-md px-2 text-white hover:bg-white/10 disabled:opacity-30">
              <Icon name="chevron-right" className="h-6 w-6 rotate-180" />
            </button>
          )}

          <div
            key={note.id}
            className={`flex-1 rounded-xl p-3 shadow-2xl ${slideClass}`}
            style={{ backgroundColor: note.color }}
          >
            <RichTextEditor
              value={note.text}
              onChange={(html) => onChangeText(note.id, html)}
              placeholder="Scrivi la nota…"
              minHeightClassName="min-h-[220px]"
              transparent
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-black/10 pt-2">
              <div className="flex flex-wrap gap-1">
                {NOTE_COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => onChangeColor(note.id, c)}
                    className={`h-5 w-5 rounded-full border ${note.color === c ? "border-black/60 ring-1 ring-black/40" : "border-black/10"}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
              <div className="flex items-center gap-1">
                {note.group_id != null && (
                  <button type="button" onClick={() => onDetach(note)} title="Sfila dal gruppo"
                    className="inline-flex items-center gap-1 rounded-md bg-black/10 px-2 py-1 text-[11px] font-semibold text-[#3a2f14] hover:bg-black/20">
                    <Icon name="maximize" className="h-3.5 w-3.5" /> Sfila
                  </button>
                )}
                <button type="button" onClick={() => onDelete(note.id)} title="Elimina nota"
                  className="inline-flex items-center gap-1 rounded-md bg-black/10 px-2 py-1 text-[11px] font-semibold text-danger hover:bg-black/20">
                  <Icon name="trash" className="h-3.5 w-3.5" /> Elimina
                </button>
              </div>
            </div>
          </div>

          {notes.length > 1 && (
            <button type="button" onClick={() => onIndex(Math.min(notes.length - 1, index + 1))} disabled={index === notes.length - 1}
              className="rounded-md px-2 text-white hover:bg-white/10 disabled:opacity-30">
              <Icon name="chevron-right" className="h-6 w-6" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
