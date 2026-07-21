import type { WorkItem } from "../api/workItems";
import type { BoardSortMode, ColumnSort } from "../api/workboardPreferences";

// ─────────────────────────────────────────────────────────────────────────────
// Ordinamento delle card dentro una colonna della board lavorazioni.
// Modalità: scadenza crescente/decrescente, urgenza, oppure ordine manuale
// (custom) scelto e salvato dall'operatore.
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_SORT_MODE: BoardSortMode = "deadline_asc";

const URGENCY_RANK: Record<string, number> = { critical: 3, high: 2, normal: 1, low: 0 };

/** Confronto per scadenza; i task senza scadenza vanno SEMPRE in fondo. `dir` 1=asc, -1=desc. */
function cmpDeadline(a: WorkItem, b: WorkItem, dir: 1 | -1): number {
  const da = a.deadline_date;
  const db = b.deadline_date;
  if (da && db) {
    if (da !== db) return dir * (da < db ? -1 : 1);
    return a.id - b.id;
  }
  if (da) return -1; // b senza scadenza → a prima
  if (db) return 1; // a senza scadenza → b prima
  return a.id - b.id;
}

/** Urgenza (critica→bassa), poi priorità, poi scadenza più vicina. */
function cmpUrgency(a: WorkItem, b: WorkItem): number {
  const ra = URGENCY_RANK[a.urgency_level ?? ""] ?? -1;
  const rb = URGENCY_RANK[b.urgency_level ?? ""] ?? -1;
  if (ra !== rb) return rb - ra;
  if (a.is_priority !== b.is_priority) return a.is_priority ? -1 : 1;
  return cmpDeadline(a, b, 1);
}

/** Ritorna una NUOVA lista ordinata secondo la configurazione della colonna. */
export function sortColumnItems(items: WorkItem[], conf: ColumnSort | undefined): WorkItem[] {
  const mode = conf?.mode ?? DEFAULT_SORT_MODE;
  const arr = [...items];
  switch (mode) {
    case "deadline_desc":
      return arr.sort((a, b) => cmpDeadline(a, b, -1));
    case "urgency":
      return arr.sort(cmpUrgency);
    case "custom": {
      const pos = new Map<number, number>();
      (conf?.order ?? []).forEach((id, i) => pos.set(id, i));
      return arr.sort((a, b) => {
        const pa = pos.has(a.id) ? (pos.get(a.id) as number) : Number.MAX_SAFE_INTEGER;
        const pb = pos.has(b.id) ? (pos.get(b.id) as number) : Number.MAX_SAFE_INTEGER;
        if (pa !== pb) return pa - pb;
        // id non ancora nell'ordine manuale (nuovi/spostati) → in coda per scadenza.
        return cmpDeadline(a, b, 1);
      });
    }
    case "deadline_asc":
    default:
      return arr.sort((a, b) => cmpDeadline(a, b, 1));
  }
}
