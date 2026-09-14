// Rilevamento "PED" nel titolo di una task: parola intera, case-insensitive.
// Stessa regola usata in WorkItemFormModal e nello slider contratti — qui in un
// unico punto riutilizzabile (import Trello, quick task, ecc.).
const PED_RE = /\bped\b/i;

export function isPedTitle(title: string | null | undefined): boolean {
  return PED_RE.test(title ?? "");
}

/** Antepone "PED " se il titolo non contiene già "PED" come parola. */
export function withPedPrefix(title: string | null | undefined): string {
  const t = (title ?? "").trim();
  if (!t) return "PED";
  return PED_RE.test(t) ? t : `PED ${t}`;
}
