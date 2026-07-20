/**
 * Severità visiva di una task in base ai rimandi da revisione (`rework_count`):
 * · 1 rimando  → "rework-warn"   (giallo — la task non è andata bene)
 * · 2+ rimandi → "rework-danger" (rosso — gravità crescente)
 * Restituisce la classe CSS da appendere alla card, o "" se non ci sono rimandi.
 */
export function reworkSeverityClass(reworkCount?: number | null): "" | "rework-warn" | "rework-danger" {
  const n = reworkCount ?? 0;
  if (n >= 2) return "rework-danger";
  if (n >= 1) return "rework-warn";
  return "";
}
