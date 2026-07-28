/**
 * Formattazione durate in linguaggio umano.
 *
 * Input in ORE (può essere decimale). Output compatto italiano:
 *   0.5  → "30min"
 *   1    → "1h"
 *   1.5  → "1h30min"
 *   2.75 → "2h45min"
 *   0    → "0min"
 *
 * Usato su TUTTE le card lavorazioni (lista, board, workload) per evitare i decimali
 * poco leggibili tipo "0.5h".
 */
export function formatDurationHuman(hours: number): string {
  const totalMinutes = Math.round((hours || 0) * 60);
  if (totalMinutes <= 0) return "0min";
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0 && m > 0) return `${h}h${m}min`;
  if (h > 0) return `${h}h`;
  return `${m}min`;
}
