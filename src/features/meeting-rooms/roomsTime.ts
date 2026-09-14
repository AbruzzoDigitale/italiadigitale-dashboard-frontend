// Aiutanti di data/ora per il calendario delle sale.
//
// Il giorno viaggia sempre come stringa "YYYY-MM-DD" e gli orari come minuti
// dalla mezzanotte: sono le stesse unità del backend, così non c'è nessun
// `Date` di mezzo che possa spostare una riunione di un'ora al cambio d'ora.
// I calcoli sul calendario usano `Date.UTC` proprio per lo stesso motivo.

export const MONTHS = [
  "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
];

export const DOWS = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];

/** Iniziali dei giorni per l'intestazione della vista mese (lunedì → domenica). */
export const DOW_SHORT = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

const pad = (n: number) => String(n).padStart(2, "0");

/** 570 → "09:30" */
export function fmtMinute(minute: number): string {
  return `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`;
}

/** 90 → "1h 30m"; 60 → "1h"; 45 → "45m" */
export function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Minuti trascorsi oggi (per la linea "adesso"). */
export function nowMinute(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

export function shiftIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** Sposta di N mesi tenendo il giorno, con clamp sull'ultimo del mese. */
export function shiftMonthIso(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  let mese = m + months;
  let anno = y;
  while (mese < 1) { mese += 12; anno -= 1; }
  while (mese > 12) { mese -= 12; anno += 1; }
  const ultimo = new Date(Date.UTC(anno, mese, 0)).getUTCDate();
  return `${anno}-${pad(mese)}-${pad(Math.min(d, ultimo))}`;
}

export interface DayInfo {
  iso: string;
  /** Numero del giorno nel mese. */
  date: number;
  /** "Lun", "Mar", … */
  dow: string;
  /** "venerdì 21 agosto 2026" */
  label: string;
  /** ISO: 1 = lunedì … 7 = domenica. */
  weekday: number;
  isWeekend: boolean;
  isToday: boolean;
}

export function dayInfo(iso: string): DayInfo {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay();
  const weekday = dow === 0 ? 7 : dow;
  return {
    iso,
    date: d,
    dow: DOW_SHORT[weekday - 1],
    label: `${DOWS[dow]} ${d} ${MONTHS[m - 1]} ${y}`,
    weekday,
    isWeekend: weekday >= 6,
    isToday: iso === todayIso(),
  };
}

/** "venerdì 21 agosto" — per note e titoli, senza l'anno. */
export function shortDayLabel(iso: string): string {
  const info = dayInfo(iso);
  const [, m] = iso.split("-").map(Number);
  return `${DOWS[info.weekday === 7 ? 0 : info.weekday]} ${info.date} ${MONTHS[m - 1]}`;
}

export function monthLabel(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/** I 7 giorni della settimana (lunedì → domenica) che contiene `iso`. */
export function weekOf(iso: string): DayInfo[] {
  const lunedi = shiftIso(iso, -(dayInfo(iso).weekday - 1));
  return Array.from({ length: 7 }, (_, i) => dayInfo(shiftIso(lunedi, i)));
}

/** Celle della vista mese: `null` = riempimento prima/dopo il mese. */
export function monthGrid(iso: string): (DayInfo | null)[] {
  const [y, m] = iso.split("-").map(Number);
  const giorniNelMese = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const primo = dayInfo(`${y}-${pad(m)}-01`).weekday - 1;
  const celle: (DayInfo | null)[] = Array.from({ length: primo }, () => null);
  for (let d = 1; d <= giorniNelMese; d += 1) celle.push(dayInfo(`${y}-${pad(m)}-${pad(d)}`));
  while (celle.length % 7) celle.push(null);
  return celle;
}

/** Primo e ultimo giorno del mese di `iso`, per la GET delle prenotazioni. */
export function monthRange(iso: string): { from: string; to: string } {
  const [y, m] = iso.split("-").map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(ultimo)}` };
}

/** Elenco di orari selezionabili in una sala, a passo `step`. */
export function timeOptions(from: number, to: number, step: number): number[] {
  const out: number[] = [];
  for (let m = from; m <= to; m += step) out.push(m);
  return out;
}

/** Etichetta di una sala nelle viste strette. */
export function roomShort(room: { name: string; short_name: string | null }): string {
  return room.short_name?.trim() || room.name;
}
