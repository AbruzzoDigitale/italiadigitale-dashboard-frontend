import { authFetch, API_BASE } from "./auth";

// ─────────────────────────────────────────────────────────────────────────────
// Manutenzioni programmate dei siti: impostazioni, anteprima della
// distribuzione, generazione delle task e calendario.
// Vedi app/api/v1/endpoints/website_maintenance.py.
// ─────────────────────────────────────────────────────────────────────────────

const BASE = `${API_BASE}/api/v1/website-maintenance`;

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string })?.detail ?? "Errore imprevisto");
  }
  return res.json() as Promise<T>;
}

/** "monthly_weekday" = es. primo lunedì; "monthly_day" = es. il 30 del mese. */
export type CadenceType = "monthly_weekday" | "monthly_day";

export const WEEKDAY_LABELS = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];

export const WEEK_ORDINAL_LABELS: Record<number, string> = {
  1: "il primo",
  2: "il secondo",
  3: "il terzo",
  4: "il quarto",
  [-1]: "l'ultimo",
};

export interface MaintenanceSettings {
  id: number | null;
  company_id: number;
  is_active: boolean;
  cadence_type: CadenceType;
  week_ordinal: number;
  weekday: number;
  day_of_month: number;
  /** Quanti siti al giorno: 6 = settimana compatta, 2 = spalmato. */
  sites_per_day: number;
  include_weekend: boolean;
  skip_holidays: boolean;
  work_area_id: number | null;
  estimated_hours: string | number | null;
  /** Non più esposto in interfaccia: resta a 1.00 e viaggia invariato. */
  load_weight_factor: string | number;
  form_id: number | null;
  form_required: boolean;
  generate_ahead_days: number;
  operator_ids: number[];
  last_generated_at: string | null;
  /** I parametri sono cambiati dall'ultima generazione: il giro futuro va rifatto. */
  pending_changes: boolean;
}

export type MaintenanceSettingsPayload = Omit<
  MaintenanceSettings,
  "id" | "company_id" | "last_generated_at" | "pending_changes"
>;

export interface PlanSite {
  website_id: number;
  website_domain: string;
  website_url: string;
  user_id: number | null;
  user_label: string | null;
}

export interface PlanDay {
  date: string;
  sites: PlanSite[];
}

export interface MaintenancePlan {
  start: string;
  days: PlanDay[];
  total_sites: number;
  excluded_sites: number;
  working_days: number;
  /** Giorni che sarebbero bastati al ritmo scelto, se la capacità bastasse. */
  target_days: number;
  per_operator: Record<string, number>;
  hours_per_operator: Record<string, number>;
  /** Siti che non è stato possibile collocare nell'orizzonte considerato. */
  unassigned: string[];
  /** Operatori considerati: quelli scelti, oppure tutta l'area di lavoro. */
  operator_names: string[];
  next_starts: string[];
}

export interface CalendarItem {
  work_item_id: number;
  title: string;
  website_id: number | null;
  website_domain: string | null;
  client_name: string | null;
  user_label: string | null;
  status: string;
  is_completed: boolean;
  submission_id: number | null;
  submission_status: string | null;
  form_id: number | null;
  form_required: boolean;
}

export interface CalendarDay {
  date: string;
  items: CalendarItem[];
}

export interface MaintenanceCalendar {
  days: CalendarDay[];
  total: number;
  done: number;
}

export async function getMaintenanceSettingsApi(companyId: number): Promise<MaintenanceSettings> {
  return jsonOrThrow(await authFetch(`${BASE}/settings?company_id=${companyId}`));
}

export async function updateMaintenanceSettingsApi(
  companyId: number,
  body: MaintenanceSettingsPayload
): Promise<MaintenanceSettings> {
  return jsonOrThrow(
    await authFetch(`${BASE}/settings?company_id=${companyId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

/** Anteprima: non scrive nulla, mostra come si distribuirebbe il giro. */
export async function previewMaintenanceApi(
  companyId: number,
  start?: string
): Promise<MaintenancePlan> {
  const qs = new URLSearchParams({ company_id: String(companyId) });
  if (start) qs.set("start", start);
  return jsonOrThrow(await authFetch(`${BASE}/preview?${qs}`));
}

/** Crea le task del giro. `replace` rifà quelle non ancora avviate. */
export async function generateMaintenanceApi(
  companyId: number,
  opts?: { start?: string; replace?: boolean }
): Promise<{ created: number; removed: number; skipped: number; start: string }> {
  const qs = new URLSearchParams({ company_id: String(companyId) });
  if (opts?.start) qs.set("start", opts.start);
  if (opts?.replace) qs.set("replace", "true");
  return jsonOrThrow(await authFetch(`${BASE}/generate?${qs}`, { method: "POST" }));
}

export async function maintenanceCalendarApi(
  companyId: number,
  from: string,
  to: string
): Promise<MaintenanceCalendar> {
  const qs = new URLSearchParams({ company_id: String(companyId), date_from: from, date_to: to });
  return jsonOrThrow(await authFetch(`${BASE}/calendar?${qs}`));
}

/** Descrizione leggibile della regola: "il primo lunedì di ogni mese". */
export function cadenceLabel(s: Pick<MaintenanceSettings, "cadence_type" | "week_ordinal" | "weekday" | "day_of_month">): string {
  if (s.cadence_type === "monthly_day") {
    return `il ${s.day_of_month} di ogni mese`;
  }
  const ordinale = WEEK_ORDINAL_LABELS[s.week_ordinal] ?? "il primo";
  return `${ordinale} ${WEEKDAY_LABELS[s.weekday].toLowerCase()} di ogni mese`;
}
