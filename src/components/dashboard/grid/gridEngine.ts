/**
 * Motore di griglia custom (zero dipendenze) per la dashboard personalizzabile.
 *
 * Modello: griglia a `cols` colonne, righe di altezza fissa. Ogni elemento occupa
 * un rettangolo intero {x,y,w,h} in unità di cella. Le funzioni sono PURE: prendono
 * e ritornano nuovi array, così sono facili da testare e da usare in preview durante
 * il drag/resize.
 *
 * Comportamento di compattazione: gli elementi vengono impacchettati verso l'alto
 * (masonry verticale). Durante un'operazione l'elemento attivo può essere "pinnato"
 * alla sua posizione (canvas-like: resta dove lo lasci) mentre gli altri si
 * riorganizzano attorno riempiendo i buchi in alto.
 */

/** Numero di colonne della griglia (deve combaciare tra grid e placement). */
export const DEFAULT_COLS = 12;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GridItem extends Rect {
  id: string;
}

export function collides(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function collidesAny(r: Rect, list: Rect[]): boolean {
  return list.some((o) => collides(r, o));
}

/** Vincola un rettangolo dentro la griglia (w<=cols, x+w<=cols, y>=0, h>=1). */
export function clampRect(r: Rect, cols: number, minW = 1, minH = 1): Rect {
  const w = Math.max(minW, Math.min(Math.round(r.w), cols));
  const h = Math.max(minH, Math.round(r.h));
  const x = Math.max(0, Math.min(Math.round(r.x), cols - w));
  const y = Math.max(0, Math.round(r.y));
  return { x, y, w, h };
}

/**
 * Riorganizza gli elementi impacchettandoli verso l'alto. Se `pinnedId` è dato,
 * quell'elemento mantiene la sua (x,y) e gli altri si dispongono attorno.
 * `reserved` sono rettangoli fissi (es. le note) che TUTTI gli elementi — incluso
 * quello pinnato — devono evitare: così i widget scorrono attorno alle note invece
 * di finirci sotto.
 */
export function reflow<T extends GridItem>(
  items: T[],
  cols: number,
  pinnedId?: string,
  reserved: Rect[] = [],
): T[] {
  const placed: T[] = [];
  const obstacles: Rect[] = [...reserved]; // note fisse + elementi già posizionati

  const pinned = pinnedId ? items.find((i) => i.id === pinnedId) : undefined;
  if (pinned) {
    const c = clampRect(pinned, cols);
    // Il pinnato resta dove lo lasci, ma scivola sotto una nota se ci finisce sopra.
    let y = c.y;
    while (collidesAny({ ...c, y }, reserved)) y++;
    const p = { ...pinned, ...c, y };
    placed.push(p);
    obstacles.push(p);
  }

  const rest = items
    .filter((i) => i.id !== pinnedId)
    .slice()
    .sort((a, b) => a.y - b.y || a.x - b.x);

  for (const it of rest) {
    const c = clampRect(it, cols);
    let y = 0;
    while (collidesAny({ ...c, y }, obstacles)) y++;
    const p = { ...it, ...c, y };
    placed.push(p);
    obstacles.push(p);
  }

  // Mantiene l'ordine originale dell'array in input (stabile per il rendering).
  const byId = new Map(placed.map((p) => [p.id, p]));
  return items.map((i) => byId.get(i.id) as T);
}

/** Numero di righe occupate (per calcolare l'altezza del contenitore). */
export function gridRows(items: Rect[]): number {
  return items.reduce((m, it) => Math.max(m, it.y + it.h), 0);
}

/** Primo slot libero per un nuovo elemento di dimensione w×h (scansione top-down). */
export function findFreeSlot(items: Rect[], cols: number, w: number, h: number): { x: number; y: number } {
  const ww = Math.min(w, cols);
  for (let y = 0; y < 2000; y++) {
    for (let x = 0; x <= cols - ww; x++) {
      if (!collidesAny({ x, y, w: ww, h }, items)) return { x, y };
    }
  }
  return { x: 0, y: gridRows(items) };
}
