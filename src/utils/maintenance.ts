// Rilevamento "manutenzione" nel titolo di una task, gemello di utils/ped.ts:
// serve a proporre la spunta quando il titolo lo suggerisce già.
const MAINTENANCE_RE = /\b(manutenzion\w*|aggiornament\w*)\b/i;

/** Tipo delle task di manutenzione sito, generate o impostate a mano. */
export const MAINTENANCE_TASK_TYPE = "website_maintenance";

export function isMaintenanceTitle(title: string | null | undefined): boolean {
  return MAINTENANCE_RE.test(title ?? "");
}

/** Antepone "Manutenzione sito — " se il titolo non lo suggerisce già. */
export function withMaintenancePrefix(title: string | null | undefined): string {
  const t = (title ?? "").trim();
  if (!t) return "Manutenzione sito";
  return MAINTENANCE_RE.test(t) ? t : `Manutenzione sito — ${t}`;
}
