import type { IconName } from "../components/ui/Icon";

/**
 * Helper condivisi per le "risorse/collegamenti" delle lavorazioni (chip stile Trello).
 * Riusati sia nell'editor del form task sia nel rendering dei chip sulle card.
 */

export type ResourceType = "canva" | "drive" | "nas" | "link";

/** Opzioni del selettore tipo (etichette in italiano). */
export const RESOURCE_TYPE_OPTIONS: { value: ResourceType; label: string }[] = [
  { value: "link", label: "Collegamento" },
  { value: "canva", label: "Canva" },
  { value: "drive", label: "Google Drive" },
  { value: "nas", label: "NAS / Rete" },
];

/**
 * Deduce il tipo di risorsa dall'URL/percorso.
 * L'ordine conta: i percorsi di rete (non http) vanno riconosciuti prima degli host.
 */
export function detectResourceType(url: string): ResourceType {
  const raw = (url ?? "").trim();
  if (!raw) return "link";
  const lower = raw.toLowerCase();
  // Percorsi NAS / condivisioni di rete: prefissi non-http.
  if (
    lower.startsWith("\\\\") ||
    lower.startsWith("smb://") ||
    lower.startsWith("//") ||
    lower.startsWith("nas")
  ) {
    return "nas";
  }
  if (lower.includes("canva.com")) return "canva";
  if (
    lower.includes("drive.google.com") ||
    lower.includes("docs.google.com") ||
    lower.includes("sheets.google.com") ||
    lower.includes("slides.google.com") ||
    lower.includes("forms.google.com")
  ) {
    return "drive";
  }
  return "link";
}

/** Mappa tipo → nome icona (fallback a "link" per tipi sconosciuti). */
export function resourceIconName(type: string): IconName {
  switch (type) {
    case "canva":
      return "canva";
    case "drive":
      return "drive";
    case "nas":
      return "nas";
    default:
      return "link";
  }
}

/** True se l'URL è un vero collegamento http(s) (apribile in una nuova scheda). */
export function isHttpResourceUrl(url: string): boolean {
  return /^https?:\/\//i.test((url ?? "").trim());
}

/**
 * Etichetta da mostrare sul chip: il titolo scelto, altrimenti l'host dell'URL
 * (o il percorso grezzo per i NAS) e, in mancanza, "Collegamento".
 */
export function resourceChipLabel(title: string, url: string): string {
  const t = (title ?? "").trim();
  if (t) return t;
  const raw = (url ?? "").trim();
  if (!raw) return "Collegamento";
  if (isHttpResourceUrl(raw)) {
    try {
      return new URL(raw).host || "Collegamento";
    } catch {
      return "Collegamento";
    }
  }
  return raw;
}
