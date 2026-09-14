import { authFetch, API_BASE } from "./auth";

// ─────────────────────────────────────────────────────────────────────────────
// Sale riunioni e prenotazioni.
// Le sale sono anagrafica aziendale (le gestisce l'admin); il calendario lo
// vede e lo usa chiunque abbia accesso all'azienda.
//
// Gli orari sono MINUTI dalla mezzanotte (540 = 09:00) e il giorno è una data
// pura "YYYY-MM-DD": nessun fuso orario nel mezzo, quello che si prenota è
// quello che si rilegge. Vedi app/api/v1/endpoints/meeting_rooms.py.
// ─────────────────────────────────────────────────────────────────────────────

const BASE = `${API_BASE}/api/v1/meeting-rooms`;

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

export interface RoomSettings {
  name: string;
  /** Etichetta corta per le viste strette. Vuota = si usa `name`. */
  short_name: string | null;
  capacity: number;
  location: string | null;
  color: string;
  /** Dotazioni: "Schermo 65\"", "Whiteboard", … */
  features: string[];
  notes: string | null;
  /** Finestra visibile del calendario, in minuti dalla mezzanotte. */
  open_minute: number;
  close_minute: number;
  /** Fascia "in orario": fuori resta prenotabile, ma è tratteggiata. */
  work_start_minute: number;
  work_end_minute: number;
  /** Passo della griglia in minuti (30 = mezz'ora). */
  slot_minutes: number;
  /** Giorni prenotabili, ISO 1=lunedì … 7=domenica. */
  weekdays: number[];
  max_duration_minutes: number | null;
  is_active: boolean;
  sort_order: number;
}

export interface MeetingRoom extends RoomSettings {
  id: number;
  company_id: number;
  created_at: string | null;
}

export interface BookingGuest {
  user_id: number;
  name: string;
  email: string;
  initials: string;
}

export interface RoomBooking {
  id: number;
  company_id: number;
  room_id: number;
  room_name: string;
  room_short_name: string | null;
  room_color: string;
  title: string;
  /** "YYYY-MM-DD" */
  day: string;
  start_minute: number;
  end_minute: number;
  organizer_user_id: number | null;
  organizer_name: string;
  organizer_initials: string;
  notes: string | null;
  guests: BookingGuest[];
  google_event_id: string | null;
  /** Link «Aggiungi a Google Calendar»: apre Google col modulo evento già
   *  compilato. Non richiede OAuth — la sincronizzazione vera è un'altra cosa. */
  google_calendar_url: string;
  /** L'utente corrente può modificarla o annullarla. */
  can_edit: boolean;
  created_at: string | null;
}

/** Motivo per cui uno slot non è prenotabile (o lo è, ma fuori orario). */
export type SlotReason = "libero" | "occupato" | "fuori_orario" | "passato" | "chiuso";

export interface AvailabilitySlot {
  start_minute: number;
  end_minute: number;
  is_free: boolean;
  reason: SlotReason;
  booking_id: number | null;
}

export interface RoomAvailability {
  room_id: number;
  day: string;
  is_open: boolean;
  slot_minutes: number;
  open_minute: number;
  close_minute: number;
  work_start_minute: number;
  work_end_minute: number;
  slots: AvailabilitySlot[];
  free_minutes: number;
  busy_minutes: number;
}

export type RoomCreatePayload = Partial<RoomSettings> & { company_id: number; name: string };
export type RoomUpdatePayload = Partial<RoomSettings>;

export interface BookingCreatePayload {
  room_id: number;
  title: string;
  day: string;
  start_minute: number;
  end_minute: number;
  /** Assente = chi sta prenotando. */
  organizer_user_id?: number | null;
  notes?: string | null;
  guest_user_ids?: number[];
}

export type BookingUpdatePayload = Partial<BookingCreatePayload>;

// ── Sale ─────────────────────────────────────────────────────────────────────

export async function listRoomsApi(
  companyId?: number | null,
  includeInactive = false,
): Promise<MeetingRoom[]> {
  const qs = new URLSearchParams();
  if (companyId != null) qs.set("company_id", String(companyId));
  if (includeInactive) qs.set("include_inactive", "true");
  return jsonOrThrow(await authFetch(`${BASE}?${qs.toString()}`));
}

export async function createRoomApi(payload: RoomCreatePayload): Promise<MeetingRoom> {
  return jsonOrThrow(
    await authFetch(BASE, { method: "POST", body: JSON.stringify(payload) }),
  );
}

export async function updateRoomApi(id: number, payload: RoomUpdatePayload): Promise<MeetingRoom> {
  return jsonOrThrow(
    await authFetch(`${BASE}/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  );
}

/** `force` elimina anche le prenotazioni future (senza, il server risponde 409). */
export async function deleteRoomApi(id: number, force = false): Promise<void> {
  await okOrThrow(await authFetch(`${BASE}/${id}?force=${force}`, { method: "DELETE" }));
}

export async function getRoomAvailabilityApi(id: number, day: string): Promise<RoomAvailability> {
  return jsonOrThrow(await authFetch(`${BASE}/${id}/availability?day=${day}`));
}

// ── Prenotazioni ─────────────────────────────────────────────────────────────

export async function listBookingsApi(params: {
  companyId?: number | null;
  from: string;
  to: string;
  roomId?: number | null;
}): Promise<RoomBooking[]> {
  const qs = new URLSearchParams({ from: params.from, to: params.to });
  if (params.companyId != null) qs.set("company_id", String(params.companyId));
  if (params.roomId != null) qs.set("room_id", String(params.roomId));
  return jsonOrThrow(await authFetch(`${BASE}/bookings?${qs.toString()}`));
}

/** Una prenotazione sola (link della notifica → apre il giorno giusto). */
export async function getBookingApi(id: number): Promise<RoomBooking> {
  return jsonOrThrow(await authFetch(`${BASE}/bookings/${id}`));
}

export async function createBookingApi(payload: BookingCreatePayload): Promise<RoomBooking> {
  return jsonOrThrow(
    await authFetch(`${BASE}/bookings`, { method: "POST", body: JSON.stringify(payload) }),
  );
}

export async function updateBookingApi(
  id: number,
  payload: BookingUpdatePayload,
): Promise<RoomBooking> {
  return jsonOrThrow(
    await authFetch(`${BASE}/bookings/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  );
}

export async function deleteBookingApi(id: number): Promise<void> {
  await okOrThrow(await authFetch(`${BASE}/bookings/${id}`, { method: "DELETE" }));
}
