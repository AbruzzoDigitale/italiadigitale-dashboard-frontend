import { authFetch, API_BASE } from "./auth";

// ─────────────────────────────────────────────────────────────────────────────
// Rimborsi trasferte: veicoli, quote ACI, trasferte, approvazioni, giustificativi,
// foglio Google del commercialista e archivio Drive.
// Vedi app/api/v1/endpoints/expenses.py e expense_sync.py sul backend.
// ─────────────────────────────────────────────────────────────────────────────

const BASE = `${API_BASE}/api/v1/rimborsi`;

export type TripStatus = "bozza" | "da_approvare" | "approvata" | "respinta";
export type EvidenceKind = "maps" | "calendar" | "timeline" | "gps";
export type TripScope = "mine" | "all" | "queue";

export interface AciRate {
  id: number;
  vehicle_id: number | null;
  year: number;
  rate_per_km: number;
  source: string | null;
}

export interface Vehicle {
  id: number;
  company_id: number;
  plate: string;
  model: string | null;
  fuel: string | null;
  ownership: string;
  owner_name: string | null;
  user_id: number | null;
  user_name: string | null;
  is_default: boolean;
  is_active: boolean;
  notes: string | null;
  label: string;
  current_rate_per_km: number;
  /** Il veicolo che il backend userebbe per una trasferta nuova: i form lo preselezionano. */
  is_suggested: boolean;
  rates: AciRate[];
  created_at: string | null;
}

export interface TripAttachment {
  id: number;
  kind: "giustificativo" | "timeline" | "altro";
  filename: string;
  content_type: string | null;
  size_bytes: number | null;
  /** URL firmato a scadenza breve: valido solo per questa risposta. */
  download_url: string | null;
  /** Link Drive permanente (quello che finisce sul foglio). */
  drive_link: string | null;
  created_at: string | null;
}

export interface TripCheckin {
  id: number;
  kind: "partenza" | "arrivo" | "rientro";
  latitude: number;
  longitude: number;
  accuracy_m: number | null;
  address: string | null;
  recorded_at: string;
}

export interface TripMapsInfo {
  one_way_km: number | null;
  distance_km: number | null;
  duration_text: string | null;
  duration_minutes: number | null;
  place_id: string | null;
  url: string | null;
  fetched_at: string | null;
}

export interface TripCalendarInfo {
  event_id: string | null;
  title: string | null;
  time: string | null;
  url: string | null;
  linked_at: string | null;
}

export interface TripEvidence {
  have: Record<EvidenceKind, boolean>;
  required: EvidenceKind[];
  present: number;
  total: number;
  missing: EvidenceKind[];
  complete: boolean;
}

export interface Trip {
  id: number;
  company_id: number;
  user_id: number;
  user_name: string | null;
  user_initials: string | null;
  user_role: string | null;

  trip_date: string;
  location: string;
  abroad: boolean;
  reason: string;
  km: number;
  rate_per_km: number;
  meal: number;
  lodging: number;
  parking: number;
  tolls: number;
  daily_allowance: number;

  km_allowance: number;
  expenses_total: number;
  total: number;
  needs_receipts: boolean;

  vehicle_id: number | null;
  vehicle_label: string | null;
  client_id: number | null;
  client_name: string | null;
  work_item_id: number | null;
  notes: string | null;

  origin_address: string | null;
  destination_address: string | null;
  round_trip: boolean;

  maps: TripMapsInfo | null;
  calendar: TripCalendarInfo | null;
  evidence: TripEvidence;
  attachments: TripAttachment[];
  checkins: TripCheckin[];

  status: TripStatus;
  submitted_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  rejected_at: string | null;
  reject_reason: string | null;

  synced: boolean;
  sheet_tab: string | null;
  sheet_synced_at: string | null;

  can_edit: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export interface TripTotals {
  count: number;
  km: number;
  km_allowance: number;
  meal: number;
  lodging: number;
  parking: number;
  tolls: number;
  daily_allowance: number;
  expenses: number;
  total: number;
}

export interface TripList {
  items: Trip[];
  totals: TripTotals;
  pending_sync: number;
  pending_approval: number;
}

export interface TripPayload {
  company_id?: number | null;
  user_id?: number | null;
  trip_date: string;
  location: string;
  abroad?: boolean;
  reason: string;
  km?: number;
  meal?: number;
  lodging?: number;
  parking?: number;
  tolls?: number;
  daily_allowance?: number | null;
  vehicle_id?: number | null;
  client_id?: number | null;
  work_item_id?: number | null;
  notes?: string | null;
  origin_address?: string | null;
  destination_address?: string | null;
  round_trip?: boolean;
  submit?: boolean;
  /** Percorso calcolato mentre si compilava: si salva insieme alla riga. */
  maps?: RouteResult | null;
  /** Appuntamento di agenda scelto in fase di inserimento. */
  calendar?: CalendarEvent | null;
}

export interface ExpenseReport {
  id: number | null;
  company_id: number;
  user_id: number;
  user_name: string | null;
  year: number;
  month: number;
  label: string;
  odometer_start: number | null;
  odometer_end: number | null;
  status: "aperta" | "chiusa" | "archiviata";
  closed_at: string | null;
  archived_at: string | null;
  total_km: number | null;
  total_amount: number | null;
  trips_count: number | null;
  pdf_generated_at: string | null;
  pdf_drive_link: string | null;
  archive_files_count: number | null;
  archive_size_bytes: number | null;
}

export type GoogleAccountKind = "azienda" | "personale";

export interface UserSheet {
  user_id: number;
  user_name: string | null;
  spreadsheet_id: string;
  spreadsheet_url: string | null;
  shared_with: string | null;
  last_sync_at: string | null;
}

export interface ExpenseSettings {
  company_id: number;
  origin_address: string;
  /** Partenza sempre dalla sede: nel form l'indirizzo è di sola lettura. */
  origin_locked: boolean;
  daily_allowance: number;
  default_rate_per_km: number;
  aci_source: string;
  daily_allowance_auto: boolean;
  evidence_required: EvidenceKind[];
  maps_configured: boolean;
  /** Il modello .xlsx è su Drive: da lì nasce il foglio di ogni collaboratore. */
  template_ready: boolean;
  /** Un foglio per collaboratore, come nel file che usa lo studio. */
  user_sheets: UserSheet[];
  sheet_name: string;
  sheet_configured: boolean;
  auto_sync: boolean;
  last_sync_at: string;
  accountant_email: string;
  accountant_name: string;
  drive_folder_id: string;
  drive_folder_url: string;
  drive_root_path: string;
  retention_years: number;
  auto_archive: boolean;
  share_enabled: boolean;
  share_url: string | null;
  header_company: string;
  header_vat: string;
  header_sign_place: string;
  header_authorization: string;
  header_declaration: string;
  header_vehicle_line: string;
  /** Con quale account si scrive: "azienda" (automazioni) o "personale". */
  google_account: GoogleAccountKind;
  /** Titolare, quando l'account è personale. */
  google_user_id: number | null;
  google_user_name: string | null;
  google_connected: boolean;
  google_email: string | null;
  google_error: string | null;
}

export interface ExpenseSettingsUpdate {
  origin_address?: string;
  origin_locked?: boolean;
  daily_allowance?: number;
  default_rate_per_km?: number;
  aci_source?: string;
  daily_allowance_auto?: boolean;
  evidence_required?: EvidenceKind[];
  maps_api_key?: string;
  /** Scegliendo "personale" il titolare diventa chi salva. */
  google_account?: GoogleAccountKind;
  sheet_name?: string;
  auto_sync?: boolean;
  accountant_email?: string;
  accountant_name?: string;
  drive_root_path?: string;
  retention_years?: number;
  auto_archive?: boolean;
  share_enabled?: boolean;
  header_company?: string;
  header_vat?: string;
  header_sign_place?: string;
  header_authorization?: string;
  header_declaration?: string;
  header_vehicle_line?: string;
}

export interface PlaceSuggestion {
  place_id: string;
  description: string;
  main_text: string | null;
  secondary_text: string | null;
}

export interface RouteResult {
  one_way_km: number;
  distance_km: number;
  duration_text: string;
  duration_minutes: number;
  url: string;
  place_id: string | null;
  origin_resolved: string | null;
  destination_resolved: string | null;
}

export interface CalendarEvent {
  event_id: string;
  title: string;
  time: string;
  url: string | null;
  location: string | null;
  all_day: boolean;
  /** Estremi separati e durata: servono alle schede della giornata. */
  start_time: string;
  end_time: string;
  duration_minutes: number | null;
  description: string | null;
}

export interface SheetSyncResult {
  synced: number;
  /** Tab scritti, nella forma "SETT25 · Rossi". */
  tabs: string[];
  last_sync_at: string;
  message: string;
}

export interface ArchiveResult {
  trips: number;
  files: number;
  size: number;
  attachments_copied?: number;
  folder_url: string | null;
  label?: string;
  message: string;
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string })?.detail ?? "Errore imprevisto");
  }
  return res.json() as Promise<T>;
}

async function okOrThrow(res: Response): Promise<void> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string })?.detail ?? "Errore imprevisto");
  }
}

function withCompany(params: URLSearchParams, companyId?: number | null): URLSearchParams {
  if (companyId) params.set("company_id", String(companyId));
  return params;
}

// ── Veicoli e quote ACI ──────────────────────────────────────────────────────
export async function listVehiclesApi(companyId?: number | null, includeInactive = false): Promise<Vehicle[]> {
  const params = withCompany(new URLSearchParams(), companyId);
  if (includeInactive) params.set("include_inactive", "true");
  return jsonOrThrow(await authFetch(`${BASE}/vehicles?${params}`));
}

export interface VehicleCreatePayload {
  company_id?: number | null;
  plate: string;
  model?: string | null;
  fuel?: string | null;
  ownership?: string;
  owner_name?: string | null;
  user_id?: number | null;
  is_default?: boolean;
  is_active?: boolean;
  notes?: string | null;
  /** Quota €/km da registrare subito per l'anno indicato. */
  rate_per_km?: number;
  rate_year?: number;
}

export async function createVehicleApi(payload: VehicleCreatePayload): Promise<Vehicle> {
  return jsonOrThrow(
    await authFetch(`${BASE}/vehicles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  );
}

/**
 * Campi modificabili di un veicolo. Non è `Partial<Vehicle>`: quello porterebbe
 * anche `label`, `rates` e `current_rate_per_km`, che il backend calcola e non
 * accetta in scrittura.
 */
export type VehicleUpdatePayload = Partial<
  Pick<
    Vehicle,
    | "plate"
    | "model"
    | "fuel"
    | "ownership"
    | "owner_name"
    | "user_id"
    | "is_default"
    | "is_active"
    | "notes"
  >
>;

export async function updateVehicleApi(id: number, payload: VehicleUpdatePayload): Promise<Vehicle> {
  return jsonOrThrow(
    await authFetch(`${BASE}/vehicles/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  );
}

export async function deleteVehicleApi(id: number): Promise<void> {
  await okOrThrow(await authFetch(`${BASE}/vehicles/${id}`, { method: "DELETE" }));
}

export async function upsertAciRateApi(
  payload: { vehicle_id: number | null; year: number; rate_per_km: number; source?: string | null },
  companyId?: number | null
): Promise<AciRate> {
  const params = withCompany(new URLSearchParams(), companyId);
  return jsonOrThrow(
    await authFetch(`${BASE}/aci-rates?${params}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  );
}

export async function deleteAciRateApi(id: number): Promise<void> {
  await okOrThrow(await authFetch(`${BASE}/aci-rates/${id}`, { method: "DELETE" }));
}

// ── Trasferte ────────────────────────────────────────────────────────────────
export async function listTripsApi(options: {
  companyId?: number | null;
  year?: number;
  month?: number;
  scope?: TripScope;
  userId?: number | null;
  status?: TripStatus | null;
}): Promise<TripList> {
  const params = withCompany(new URLSearchParams(), options.companyId);
  if (options.year != null) params.set("year", String(options.year));
  if (options.month != null) params.set("month", String(options.month));
  if (options.scope) params.set("scope", options.scope);
  if (options.userId) params.set("user_id", String(options.userId));
  if (options.status) params.set("status", options.status);
  return jsonOrThrow(await authFetch(`${BASE}/trips?${params}`));
}

export async function getTripApi(id: number): Promise<Trip> {
  return jsonOrThrow(await authFetch(`${BASE}/trips/${id}`));
}

export async function createTripApi(payload: TripPayload): Promise<Trip> {
  return jsonOrThrow(
    await authFetch(`${BASE}/trips`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  );
}

export async function updateTripApi(id: number, payload: Partial<TripPayload>): Promise<Trip> {
  return jsonOrThrow(
    await authFetch(`${BASE}/trips/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  );
}

export async function deleteTripApi(id: number): Promise<void> {
  await okOrThrow(await authFetch(`${BASE}/trips/${id}`, { method: "DELETE" }));
}

export async function submitTripApi(id: number): Promise<Trip> {
  return jsonOrThrow(await authFetch(`${BASE}/trips/${id}/submit`, { method: "POST" }));
}

export async function approveTripApi(id: number): Promise<Trip> {
  return jsonOrThrow(await authFetch(`${BASE}/trips/${id}/approve`, { method: "POST" }));
}

export async function rejectTripApi(id: number, reason: string): Promise<Trip> {
  return jsonOrThrow(
    await authFetch(`${BASE}/trips/${id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    })
  );
}

export async function approveAllTripsApi(
  payload: { ids?: number[]; year?: number; month?: number },
  companyId?: number | null
): Promise<{ approved: number }> {
  const params = withCompany(new URLSearchParams(), companyId);
  return jsonOrThrow(
    await authFetch(`${BASE}/trips/approve-all?${params}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  );
}

// ── Giustificativi e check-in ────────────────────────────────────────────────
export async function uploadTripAttachmentApi(
  tripId: number,
  file: File,
  kind: "giustificativo" | "timeline" | "altro" = "giustificativo"
): Promise<TripAttachment> {
  const form = new FormData();
  form.append("file", file);
  form.append("kind", kind);
  // Niente Content-Type a mano: il browser deve mettere il boundary del multipart.
  return jsonOrThrow(await authFetch(`${BASE}/trips/${tripId}/attachments`, { method: "POST", body: form }));
}

export async function deleteTripAttachmentApi(tripId: number, attachmentId: number): Promise<void> {
  await okOrThrow(
    await authFetch(`${BASE}/trips/${tripId}/attachments/${attachmentId}`, { method: "DELETE" })
  );
}

export async function addTripCheckinApi(
  tripId: number,
  payload: { kind: "partenza" | "arrivo" | "rientro"; latitude: number; longitude: number; accuracy_m?: number | null; address?: string | null }
): Promise<TripCheckin> {
  return jsonOrThrow(
    await authFetch(`${BASE}/trips/${tripId}/checkins`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  );
}

// ── Maps e Calendar ──────────────────────────────────────────────────────────
export async function placesAutocompleteApi(query: string, companyId?: number | null): Promise<PlaceSuggestion[]> {
  const params = withCompany(new URLSearchParams({ q: query }), companyId);
  return jsonOrThrow(await authFetch(`${BASE}/places?${params}`));
}

export async function computeRouteApi(
  payload: { origin?: string | null; destination: string; round_trip: boolean; destination_place_id?: string | null },
  companyId?: number | null
): Promise<RouteResult> {
  const params = withCompany(new URLSearchParams(), companyId);
  return jsonOrThrow(
    await authFetch(`${BASE}/route?${params}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  );
}

export async function computeTripRouteApi(
  tripId: number,
  payload: { origin?: string | null; destination: string; round_trip: boolean; destination_place_id?: string | null }
): Promise<Trip> {
  return jsonOrThrow(
    await authFetch(`${BASE}/trips/${tripId}/route`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  );
}

export async function listCalendarEventsApi(
  day: string,
  options: { companyId?: number | null; userId?: number | null } = {}
): Promise<CalendarEvent[]> {
  const params = withCompany(new URLSearchParams({ day }), options.companyId);
  if (options.userId) params.set("user_id", String(options.userId));
  return jsonOrThrow(await authFetch(`${BASE}/calendar/events?${params}`));
}

export async function linkCalendarEventApi(tripId: number, event: CalendarEvent): Promise<Trip> {
  return jsonOrThrow(
    await authFetch(`${BASE}/trips/${tripId}/calendar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    })
  );
}

export async function unlinkCalendarEventApi(tripId: number): Promise<Trip> {
  return jsonOrThrow(await authFetch(`${BASE}/trips/${tripId}/calendar`, { method: "DELETE" }));
}

// ── Nota spese ───────────────────────────────────────────────────────────────
export async function getExpenseReportApi(
  year: number,
  month: number,
  options: { companyId?: number | null; userId?: number | null } = {}
): Promise<ExpenseReport> {
  const params = withCompany(new URLSearchParams(), options.companyId);
  if (options.userId) params.set("user_id", String(options.userId));
  return jsonOrThrow(await authFetch(`${BASE}/reports/${year}/${month}?${params}`));
}

export async function updateExpenseReportApi(
  year: number,
  month: number,
  payload: { odometer_start?: number | null; odometer_end?: number | null },
  options: { companyId?: number | null; userId?: number | null } = {}
): Promise<ExpenseReport> {
  const params = withCompany(new URLSearchParams(), options.companyId);
  if (options.userId) params.set("user_id", String(options.userId));
  return jsonOrThrow(
    await authFetch(`${BASE}/reports/${year}/${month}?${params}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  );
}

/** Apre la nota spese PDF in una nuova scheda (il PDF si rigenera a ogni richiesta). */
export async function openExpenseReportPdf(
  year: number,
  month: number,
  options: { companyId?: number | null; userId?: number | null } = {}
): Promise<void> {
  const params = withCompany(new URLSearchParams(), options.companyId);
  if (options.userId) params.set("user_id", String(options.userId));
  const res = await authFetch(`${BASE}/reports/${year}/${month}/pdf?${params}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string })?.detail ?? "PDF non generato");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener");
  // Il revoke immediato annullerebbe l'apertura: si libera dopo un minuto.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// ── Impostazioni, foglio, archivio ───────────────────────────────────────────
export async function getExpenseSettingsApi(companyId?: number | null): Promise<ExpenseSettings> {
  const params = withCompany(new URLSearchParams(), companyId);
  return jsonOrThrow(await authFetch(`${BASE}/settings?${params}`));
}

/** Sottoinsieme visibile a tutti: sede, indennità, quota di ripiego, prove richieste. */
export async function getExpenseSettingsBasicsApi(companyId?: number | null): Promise<ExpenseSettings> {
  const params = withCompany(new URLSearchParams(), companyId);
  return jsonOrThrow(await authFetch(`${BASE}/settings/basics?${params}`));
}

export async function updateExpenseSettingsApi(
  payload: ExpenseSettingsUpdate,
  companyId?: number | null
): Promise<ExpenseSettings> {
  const params = withCompany(new URLSearchParams(), companyId);
  return jsonOrThrow(
    await authFetch(`${BASE}/settings?${params}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  );
}

export async function rotateShareTokenApi(companyId?: number | null): Promise<ExpenseSettings> {
  const params = withCompany(new URLSearchParams(), companyId);
  return jsonOrThrow(await authFetch(`${BASE}/settings/share-token/rotate?${params}`, { method: "POST" }));
}

/**
 * Prepara la rendicontazione: carica il modello su Drive e crea i fogli dei
 * collaboratori che hanno già trasferte approvate.
 */
export async function connectSheetApi(companyId?: number | null): Promise<ExpenseSettings> {
  const params = withCompany(new URLSearchParams(), companyId);
  return jsonOrThrow(await authFetch(`${BASE}/sheet/connect?${params}`, { method: "POST" }));
}

/** Stacca i fogli dal gestionale. I file su Drive restano dove sono. */
export async function disconnectSheetApi(companyId?: number | null): Promise<ExpenseSettings> {
  const params = withCompany(new URLSearchParams(), companyId);
  return jsonOrThrow(await authFetch(`${BASE}/sheet/disconnect?${params}`, { method: "POST" }));
}

export async function syncSheetApi(
  options: {
    companyId?: number | null;
    year?: number;
    month?: number;
    /** Riscrive anche i mesi già sincronizzati: serve dopo un cambio di layout. */
    force?: boolean;
  } = {}
): Promise<SheetSyncResult> {
  const params = withCompany(new URLSearchParams(), options.companyId);
  if (options.year != null) params.set("year", String(options.year));
  if (options.month != null) params.set("month", String(options.month));
  if (options.force) params.set("force", "true");
  return jsonOrThrow(await authFetch(`${BASE}/sheet/sync?${params}`, { method: "POST" }));
}

export async function archiveMonthApi(
  year: number,
  month: number,
  companyId?: number | null
): Promise<ArchiveResult> {
  const params = withCompany(new URLSearchParams(), companyId);
  return jsonOrThrow(await authFetch(`${BASE}/archive/${year}/${month}?${params}`, { method: "POST" }));
}


// ── Vista condivisa col commercialista (senza login) ─────────────────────────
export interface SharedExpenseRow {
  date: string;
  location: string;
  abroad: boolean;
  reason: string;
  km: number;
  rate_per_km: number;
  km_allowance: number;
  meal: number;
  lodging: number;
  parking: number;
  tolls: number;
  daily_allowance: number;
  total: number;
  person: string;
  receipts: string[];
}

export interface SharedExpenses {
  company: string;
  vat: string;
  label: string;
  year: number;
  month: number;
  aci_source: string;
  sheet_url: string | null;
  rows: SharedExpenseRow[];
  totals: TripTotals;
}

/**
 * Righe approvate del mese per chi ha il link. Niente `authFetch`: è la sola
 * rotta del modulo senza sessione, il token nell'URL è la credenziale.
 */
export async function getSharedExpensesApi(
  token: string,
  year?: number,
  month?: number
): Promise<SharedExpenses> {
  const params = new URLSearchParams();
  if (year != null) params.set("year", String(year));
  if (month != null) params.set("month", String(month));
  const res = await fetch(`${BASE}/public/${encodeURIComponent(token)}?${params}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string })?.detail ?? "Link non valido o revocato");
  }
  return res.json() as Promise<SharedExpenses>;
}
