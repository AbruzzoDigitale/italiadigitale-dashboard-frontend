import type { EvidenceKind, TripStatus } from "../../api/expenses";
import type { IconName } from "../../components/ui/Icon";

// Formattazione e vocabolario condivisi da tabella, card, modale e coda
// approvazioni: gli stessi numeri devono leggersi identici ovunque.

export function euro(value: number | null | undefined): string {
  return `${(value ?? 0).toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} €`;
}

export function num(value: number | null | undefined, decimals = 0): string {
  return (value ?? 0).toLocaleString("it-IT", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** "2026-08-04" → "04/08/2026". */
export function dateIt(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function dayNumber(iso: string): string {
  return iso.slice(8, 10);
}

export const MONTH_SHORT = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

export const MONTH_LABELS = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

export function monthLabel(year: number, month: number): string {
  return `${MONTH_LABELS[month - 1]} ${year}`;
}

/** Nome del tab sul foglio del commercialista: (2025, 9) → "SETT25". */
export function sheetTab(year: number, month: number): string {
  const short = ["GEN", "FEB", "MAR", "APR", "MAG", "GIU", "LUG", "AGO", "SETT", "OTT", "NOV", "DIC"];
  return `${short[month - 1]}${String(year % 100).padStart(2, "0")}`;
}

/** Data di oggi come "YYYY-MM-DD" locale (l'input date vuole questo formato). */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const EVIDENCE_META: Record<
  EvidenceKind,
  { label: string; short: string; icon: IconName; hint: string }
> = {
  maps: {
    label: "Percorso Google Maps",
    short: "Maps",
    icon: "target",
    hint: "Distanza e durata calcolate sul percorso reale.",
  },
  calendar: {
    label: "Appuntamento in agenda",
    short: "Calendar",
    icon: "calendar",
    hint: "L'evento del giorno collegato alla trasferta.",
  },
  timeline: {
    label: "Cronologia spostamenti",
    short: "Timeline",
    icon: "clock",
    hint: "Export della Timeline scaricato dal telefono: Google non la espone più via API, va allegato a mano.",
  },
  gps: {
    label: "Check-in GPS",
    short: "GPS",
    icon: "map-pin",
    hint: "Posizione registrata dall'app mobile a inizio e fine trasferta.",
  },
};

export const STATUS_META: Record<
  TripStatus,
  { label: string; tone: "default" | "success" | "warning" | "danger" | "info" }
> = {
  bozza: { label: "Bozza", tone: "default" },
  da_approvare: { label: "Da approvare", tone: "warning" },
  approvata: { label: "Approvata", tone: "success" },
  respinta: { label: "Respinta", tone: "danger" },
};

/** Mesi selezionabili: dal mese corrente all'indietro, per la navigazione del periodo. */
export function monthOptions(count = 24): { year: number; month: number; label: string }[] {
  const out: { year: number; month: number; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < count; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ year: d.getFullYear(), month: d.getMonth() + 1, label: monthLabel(d.getFullYear(), d.getMonth() + 1) });
  }
  return out;
}

export function fileSize(bytes: number | null | undefined): string {
  if (!bytes) return "";
  if (bytes > 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}
