import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../../ui/Icon";
import { clampRect, DEFAULT_COLS, gridRows, reflow, type Rect } from "./gridEngine";
import { getWidgetDef } from "../widgets/registry";
import { WidgetHostProvider } from "../widgets/WidgetHostContext";
import type { WidgetInstance } from "../widgets/types";

const COLS = DEFAULT_COLS;
const ROW_H = 76; // px per unità di riga
const GAP = 16; // px tra le celle
const NARROW = 640; // sotto questa larghezza → colonna singola (mobile)

// Tinte di sfondo selezionabili per le card KPI "valore" (non per i grafici).
const KPI_BG_COLORS = [
  "#FDE68A", "#FBCFE8", "#BFDBFE", "#BBF7D0", "#DDD6FE",
  "#FED7AA", "#FECACA", "#A7F3D0", "#E9D5FF", "#BAE6FD",
];
// Tipi widget a cui si applica la tinta di sfondo (le sole card "valore").
const TINTABLE_TYPES = new Set(["kpi-stat"]);

interface DragState {
  id: string;
  mode: "move" | "resize";
  startClientX: number;
  startClientY: number;
  orig: Rect;
  ghost: Rect;
  minW: number;
  minH: number;
  dx: number;
  dy: number;
}

interface DashboardGridProps {
  items: WidgetInstance[];
  editing: boolean;
  onLayoutChange: (items: WidgetInstance[]) => void;
  onRemove?: (id: string) => void;
  onConfigChange?: (id: string, patch: Record<string, unknown>) => void;
  /** Ostacoli fissi (le note) che i widget devono evitare durante il reflow. */
  reserved?: Rect[];
  /** Numero di colonne della griglia (default 12 = desktop; usa 2 per l'anteprima mobile). */
  cols?: number;
  /** Se false, NON collassa a colonna singola su schermi stretti (per l'anteprima telefono
   *  a colonne fisse, dove l'editing resta attivo). Default true (comportamento desktop). */
  narrowCollapse?: boolean;
  /** Override della larghezza minima (in colonne) dei widget in resize. Serve all'anteprima
   *  mobile a 2 colonne, dove i minSize a 12 colonne dei widget desktop impedirebbero di
   *  scendere sotto la larghezza piena. Default: la minSize del widget. */
  minCol?: number;
}

export function DashboardGrid({ items, editing, onLayoutChange, onRemove, onConfigChange, reserved, cols: colsProp, narrowCollapse, minCol }: DashboardGridProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const dragRef = useRef<DragState | null>(null);
  const [, setTick] = useState(0);
  const rerender = useCallback(() => setTick((n) => n + 1), []);
  // Selettore di colore aperto (renderizzato in portal per non essere tagliato).
  const [palette, setPalette] = useState<{ id: string; top: number; right: number } | null>(null);

  // Misura la larghezza del contenitore per convertire celle ↔ pixel.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setWidth(e.contentRect.width);
    });
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const collapse = narrowCollapse !== false;
  const colsBase = colsProp ?? COLS;
  const narrow = collapse && width > 0 && width < NARROW;
  const cols = narrow ? 1 : colsBase;
  const colW = cols > 0 && width > 0 ? (width - (cols - 1) * GAP) / cols : 0;

  // Ref aggiornati a ogni render: i listener globali (creati una volta) li leggono.
  const colWRef = useRef(colW);
  colWRef.current = colW;
  const colsRef = useRef(cols);
  colsRef.current = cols;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const reservedRef = useRef<Rect[]>(reserved ?? []);
  reservedRef.current = reserved ?? [];
  const onLayoutChangeRef = useRef(onLayoutChange);
  onLayoutChangeRef.current = onLayoutChange;

  const cellToPx = (r: Rect) => ({
    left: r.x * (colW + GAP),
    top: r.y * (ROW_H + GAP),
    width: r.w * colW + (r.w - 1) * GAP,
    height: r.h * ROW_H + (r.h - 1) * GAP,
  });

  const onWinMove = useCallback((e: PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    d.dx = e.clientX - d.startClientX;
    d.dy = e.clientY - d.startClientY;
    const stepX = colWRef.current + GAP;
    const stepY = ROW_H + GAP;
    if (d.mode === "move") {
      const nx = d.orig.x + Math.round(d.dx / stepX);
      const ny = d.orig.y + Math.round(d.dy / stepY);
      d.ghost = clampRect({ ...d.orig, x: nx, y: ny }, colsRef.current);
    } else {
      const nw = d.orig.w + Math.round(d.dx / stepX);
      const nh = d.orig.h + Math.round(d.dy / stepY);
      d.ghost = clampRect({ ...d.orig, w: nw, h: nh }, colsRef.current, d.minW, d.minH);
    }
    rerender();
  }, [rerender]);

  const onWinUp = useCallback(() => {
    const d = dragRef.current;
    window.removeEventListener("pointermove", onWinMove);
    window.removeEventListener("pointerup", onWinUp);
    if (d) {
      const withGhost = itemsRef.current.map((it) =>
        it.id === d.id ? { ...it, ...d.ghost } : it,
      );
      const next = reflow(withGhost, colsRef.current, d.id, reservedRef.current);
      dragRef.current = null;
      rerender();
      const changed = JSON.stringify(next.map(geom)) !== JSON.stringify(itemsRef.current.map(geom));
      if (changed) onLayoutChangeRef.current(next);
    } else {
      dragRef.current = null;
      rerender();
    }
  }, [onWinMove, rerender]);

  const startDrag = (e: React.PointerEvent, item: WidgetInstance, mode: "move" | "resize") => {
    if (!editing || narrow) return;
    e.preventDefault();
    e.stopPropagation();
    const def = getWidgetDef(item.type);
    dragRef.current = {
      id: item.id,
      mode,
      startClientX: e.clientX,
      startClientY: e.clientY,
      orig: { x: item.x, y: item.y, w: item.w, h: item.h },
      ghost: { x: item.x, y: item.y, w: item.w, h: item.h },
      minW: minCol ?? def?.minSize.w ?? 2,
      minH: def?.minSize.h ?? 2,
      dx: 0,
      dy: 0,
    };
    window.addEventListener("pointermove", onWinMove);
    window.addEventListener("pointerup", onWinUp);
    rerender();
  };

  useEffect(() => () => {
    window.removeEventListener("pointermove", onWinMove);
    window.removeEventListener("pointerup", onWinUp);
  }, [onWinMove, onWinUp]);

  // ── Calcolo del layout da renderizzare ─────────────────────────────────────
  const drag = dragRef.current;
  let layout: WidgetInstance[];
  if (narrow) {
    const ordered = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
    let y = 0;
    layout = ordered.map((it) => {
      const d = { ...it, x: 0, w: 1, y, h: it.h };
      y += it.h;
      return d;
    });
  } else if (drag) {
    const withGhost = items.map((it) => (it.id === drag.id ? { ...it, ...drag.ghost } : it));
    layout = reflow(withGhost, cols, drag.id, reserved ?? []);
  } else {
    layout = items;
  }

  const rows = gridRows(layout);
  const containerHeight = Math.max(0, rows * (ROW_H + GAP) - GAP) + (editing && !narrow ? ROW_H + GAP : 0);

  return (
    <div ref={ref} className="relative w-full" style={{ height: containerHeight || undefined }}>
      {/* Placeholder di destinazione durante drag/resize */}
      {drag && !narrow && colW > 0 && (
        <div
          className="pointer-events-none absolute rounded-lg border-2 border-dashed border-brand-magenta/60 bg-brand-magenta/5"
          style={{ ...cellToPx(drag.ghost), transition: "left .12s, top .12s, width .12s, height .12s" }}
        />
      )}

      {colW > 0 &&
        layout.map((it) => {
          const def = getWidgetDef(it.type);
          const isActive = drag?.id === it.id;
          const px = cellToPx(it);

          let style: CSSProperties = {
            position: "absolute",
            left: px.left,
            top: px.top,
            width: px.width,
            height: px.height,
            transition: isActive ? "none" : "left .18s ease, top .18s ease, width .18s ease, height .18s ease",
          };

          // L'elemento attivo in MOVE segue il puntatore (feel "afferrato").
          if (isActive && drag?.mode === "move") {
            const origPx = cellToPx(drag.orig);
            style = {
              ...style,
              left: origPx.left + drag.dx,
              top: origPx.top + drag.dy,
              width: origPx.width,
              height: origPx.height,
              zIndex: 50,
              transition: "none",
            };
          }

          const tint = typeof it.config?.bgColor === "string" ? (it.config.bgColor as string) : undefined;

          return (
            <div key={it.id} style={style}>
              <div
                style={tint ? { backgroundColor: tint } : undefined}
                className={`relative flex h-full w-full flex-col overflow-hidden rounded-lg border bg-paper dark:bg-[#131316] ${
                  isActive
                    ? "border-brand-magenta shadow-2"
                    : "border-line dark:border-[#2a2a2e] shadow-1"
                }`}
              >
                {editing && !narrow && (
                  <div
                    onPointerDown={(e) => startDrag(e, it, "move")}
                    className="flex flex-shrink-0 cursor-grab items-center justify-between gap-2 border-b border-line bg-cream/70 px-2 py-1 active:cursor-grabbing dark:border-[#2a2a2e] dark:bg-[#1c1c20]"
                    title="Trascina per spostare"
                  >
                    <Icon name="dots-horizontal" className="h-4 w-4 text-muted dark:text-[#9999a0]" />
                    <div className="flex items-center gap-1">
                      {onConfigChange && TINTABLE_TYPES.has(it.type) && (
                        <button
                          type="button"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            const r = e.currentTarget.getBoundingClientRect();
                            setPalette((p) =>
                              p?.id === it.id
                                ? null
                                : { id: it.id, top: r.bottom + 6, right: window.innerWidth - r.right },
                            );
                          }}
                          className="grid h-5 w-5 place-items-center rounded border border-black/15 text-muted transition-colors hover:text-ink dark:text-[#9999a0]"
                          title="Colore di sfondo"
                          aria-label="Colore di sfondo"
                          style={tint ? { backgroundColor: tint } : undefined}
                        >
                          {!tint && <Icon name="image" className="h-3.5 w-3.5" />}
                        </button>
                      )}
                      {onRemove && (
                        <button
                          type="button"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={() => onRemove(it.id)}
                          className="grid h-5 w-5 place-items-center rounded text-muted transition-colors hover:text-danger dark:text-[#9999a0]"
                          title="Rimuovi widget"
                          aria-label="Rimuovi widget"
                        >
                          <Icon name="x" className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div className="min-h-0 flex-1 overflow-hidden">
                  {def ? (
                    <WidgetHostProvider
                      value={{ editing, updateConfig: (patch) => onConfigChange?.(it.id, patch) }}
                    >
                      {def.render(it)}
                    </WidgetHostProvider>
                  ) : (
                    <div className="flex h-full items-center justify-center p-4 text-center text-[12px] text-muted">
                      Widget sconosciuto: {it.type}
                    </div>
                  )}
                </div>

                {editing && !narrow && (
                  <div
                    onPointerDown={(e) => startDrag(e, it, "resize")}
                    className="absolute bottom-0 right-0 flex h-5 w-5 cursor-se-resize items-end justify-end p-1"
                    title="Trascina per ridimensionare"
                  >
                    <span className="block h-2.5 w-2.5 border-b-2 border-r-2 border-muted dark:border-[#9999a0]" />
                  </div>
                )}
              </div>
            </div>
          );
        })}

      {/* Selettore colore in portal: fuori dall'overflow-hidden delle card. */}
      {editing && palette && onConfigChange &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[9998]" onClick={() => setPalette(null)} />
            <div
              className="fixed z-[9999] grid grid-cols-5 gap-1 rounded-md border border-line bg-paper p-1.5 shadow-lg dark:border-[#2a2a2e] dark:bg-[#1c1c20]"
              style={{ top: palette.top, right: palette.right }}
            >
              {(() => {
                const cur = items.find((i) => i.id === palette.id);
                const curTint = typeof cur?.config?.bgColor === "string" ? (cur.config.bgColor as string) : undefined;
                return (
                  <>
                    <button
                      type="button"
                      onClick={() => { onConfigChange(palette.id, { bgColor: null }); setPalette(null); }}
                      className="col-span-5 mb-0.5 rounded border border-line px-1 py-1 text-[11px] font-semibold text-muted hover:text-ink dark:border-[#2a2a2e] dark:text-[#9999a0]"
                      title="Nessuna tinta"
                    >
                      Predefinito
                    </button>
                    {KPI_BG_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => { onConfigChange(palette.id, { bgColor: c }); setPalette(null); }}
                        className={`h-6 w-6 rounded-full border ${curTint === c ? "border-black/60 ring-1 ring-black/40" : "border-black/10"}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </>
                );
              })()}
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}

function geom(w: WidgetInstance) {
  return { id: w.id, x: w.x, y: w.y, w: w.w, h: w.h };
}
