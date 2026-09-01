import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { PageSectionHeader } from "../components/ui/PageSectionHeader";
import { SegmentedSwitch } from "../components/ui/SegmentedSwitch";
import { Spinner } from "../components/ui/Spinner";
import { useAuth } from "../hooks/useAuth";
import { useSelectedCompanyId } from "../hooks/useSelectedCompanyId";
import { useUsers } from "../hooks/useUsers";
import { useToast } from "../context/ToastContext";
import {
  getBookingApi,
  listBookingsApi,
  listRoomsApi,
  type MeetingRoom,
  type RoomBooking,
} from "../api/meetingRooms";
import { DayCalendar } from "../features/meeting-rooms/DayCalendar";
import { WeekCalendar } from "../features/meeting-rooms/WeekCalendar";
import { MonthCalendar } from "../features/meeting-rooms/MonthCalendar";
import { BookingModal, type BookingDraft } from "../features/meeting-rooms/BookingModal";
import { RoomsManagerModal } from "../features/meeting-rooms/RoomsManagerModal";
import {
  MONTHS,
  dayInfo,
  fmtDuration,
  monthLabel,
  monthRange,
  roomShort,
  shiftIso,
  shiftMonthIso,
  todayIso,
  weekOf,
} from "../features/meeting-rooms/roomsTime";
import "../features/meeting-rooms/meeting-rooms.css";

type View = "day" | "week" | "month";

/**
 * Prenotazione sale: calendario condiviso dell'azienda.
 *
 * Tutti vedono l'occupazione e possono prenotare uno slot libero; la modifica
 * resta a chi ha creato la prenotazione (o a un admin/PM), e le sale le
 * configura l'admin da "Gestisci sale".
 */
export function MeetingRoomsPage() {
  const { user, activeCompanyId, permissions } = useAuth();
  const { selectedCompanyId } = useSelectedCompanyId(activeCompanyId ?? user?.company_id ?? null);
  const companyId = selectedCompanyId ?? activeCompanyId ?? user?.company_id ?? null;
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [view, setView] = useState<View>("day");
  const [dayIso, setDayIso] = useState<string>(() => searchParams.get("day") || todayIso());
  const [roomFilter, setRoomFilter] = useState<number | "all">("all");

  // L'admin carica anche le sale disattivate: gli servono in "Gestisci sale".
  // Il calendario lavora solo su quelle attive.
  const [allRooms, setAllRooms] = useState<MeetingRoom[]>([]);
  const [bookings, setBookings] = useState<RoomBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<BookingDraft | null>(null);
  const [roomsOpen, setRoomsOpen] = useState(false);

  const { users } = useUsers(companyId);
  const isAdmin = !!permissions?.is_admin;

  const rooms = useMemo(() => allRooms.filter((r) => r.is_active), [allRooms]);

  // Finestra di date da chiedere al server, per vista.
  const range = useMemo(() => {
    if (view === "day") return { from: dayIso, to: dayIso };
    if (view === "week") {
      const settimana = weekOf(dayIso);
      return { from: settimana[0].iso, to: settimana[6].iso };
    }
    return monthRange(dayIso);
  }, [view, dayIso]);

  const loadRooms = useCallback(async () => {
    if (companyId == null) return;
    try {
      setAllRooms(await listRoomsApi(companyId, isAdmin));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impossibile caricare le sale");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, isAdmin]);

  const loadBookings = useCallback(async () => {
    if (companyId == null) return;
    setLoading(true);
    try {
      setBookings(await listBookingsApi({ companyId, from: range.from, to: range.to }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impossibile caricare le prenotazioni");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, range.from, range.to]);

  useEffect(() => {
    void loadRooms();
  }, [loadRooms]);

  useEffect(() => {
    void loadBookings();
  }, [loadBookings]);

  // Il giorno mostrato resta nell'URL: così un link a una giornata precisa
  // (e il tasto Indietro) funzionano come su ogni altra pagina.
  useEffect(() => {
    const corrente = searchParams.get("day");
    if (corrente === dayIso) return;
    const next = new URLSearchParams(searchParams);
    if (dayIso === todayIso()) next.delete("day");
    else next.set("day", dayIso);
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayIso]);

  // Arrivo da una notifica (?booking=123): porta al giorno giusto e apre la scheda.
  const aperturaRichiesta = useRef<string | null>(null);
  useEffect(() => {
    const raw = searchParams.get("booking");
    if (!raw || aperturaRichiesta.current === raw) return;
    aperturaRichiesta.current = raw;
    getBookingApi(Number(raw))
      .then((b) => {
        setDayIso(b.day);
        setView("day");
        setDraft(toDraft(b));
      })
      .catch(() => toast.error("Prenotazione non trovata"))
      .finally(() => {
        const next = new URLSearchParams(window.location.search);
        next.delete("booking");
        setSearchParams(next, { replace: true });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const visibleRooms = useMemo(() => {
    if (roomFilter === "all") return rooms;
    const sola = rooms.filter((r) => r.id === roomFilter);
    // La sala filtrata può essere stata disattivata mentre era selezionata:
    // meglio ricadere su tutte che restare con un calendario senza colonne.
    return sola.length ? sola : rooms;
  }, [rooms, roomFilter]);

  const scopeBookings = useMemo(
    () => (roomFilter === "all" ? bookings : bookings.filter((b) => b.room_id === roomFilter)),
    [bookings, roomFilter],
  );

  const info = dayInfo(dayIso);
  const settimana = useMemo(() => weekOf(dayIso), [dayIso]);

  const navLabel =
    view === "month"
      ? monthLabel(dayIso)
      : view === "week"
        ? `${settimana[0].date} – ${settimana[6].date} ${MONTHS[Number(settimana[6].iso.slice(5, 7)) - 1]} ${settimana[6].iso.slice(0, 4)}`
        : info.label;

  const shift = (direzione: 1 | -1) => {
    if (view === "month") setDayIso(shiftMonthIso(dayIso, direzione));
    else setDayIso(shiftIso(dayIso, direzione * (view === "week" ? 7 : 1)));
  };

  // Occupazione della giornata mostrata: minuti prenotati sul totale delle
  // ore di lavoro delle sale visibili (fuori orario non entra nel conto).
  const occupazione = useMemo(() => {
    const delGiorno = scopeBookings.filter((b) => b.day === dayIso);
    const occupati = delGiorno.reduce((s, b) => s + (b.end_minute - b.start_minute), 0);
    const capienza = visibleRooms
      .filter((r) => r.weekdays.includes(info.weekday))
      .reduce((s, r) => s + (r.work_end_minute - r.work_start_minute), 0);
    return capienza > 0 ? Math.round((occupati / capienza) * 100) : 0;
  }, [scopeBookings, visibleRooms, dayIso, info.weekday]);

  const targetRoom = roomFilter === "all" ? (rooms[0] ?? null) : (rooms.find((r) => r.id === roomFilter) ?? null);

  function toDraft(b: RoomBooking): BookingDraft {
    return {
      id: b.id,
      room_id: b.room_id,
      day: b.day,
      start_minute: b.start_minute,
      end_minute: b.end_minute,
      title: b.title,
      organizer_user_id: b.organizer_user_id,
      notes: b.notes ?? "",
      guest_user_ids: b.guests.map((g) => g.user_id),
      can_edit: b.can_edit,
      organizer_name: b.organizer_name,
      room_name: b.room_name,
      google_calendar_url: b.google_calendar_url,
    };
  }

  const nuovaPrenotazione = (roomId: number, startMinute: number, iso = dayIso) => {
    const room = rooms.find((r) => r.id === roomId);
    if (!room) return;
    const durata = Math.min(60, room.close_minute - startMinute);
    setDraft({
      id: null,
      room_id: roomId,
      day: iso,
      start_minute: startMinute,
      end_minute: Math.min(room.close_minute, startMinute + Math.max(durata, room.slot_minutes)),
      title: "",
      organizer_user_id: user?.id ?? null,
      notes: "",
      guest_user_ids: [],
      can_edit: true,
    });
  };

  const nuovaDalPulsante = () => {
    const room = targetRoom;
    if (!room) return;
    // Parte dal primo slot dell'orario di lavoro: è dove finisce quasi ogni riunione.
    nuovaPrenotazione(room.id, room.work_start_minute, dayIso);
  };

  if (companyId == null) {
    return (
      <div className="mx-auto flex h-full w-full flex-col px-6 py-8">
        <PageSectionHeader
          icon={<Icon name="calendar" className="h-6 w-6" />}
          title="Prenotazione sale"
        />
        <div className="mr-page">
          <div className="mr-empty">
            <b>Nessuna azienda selezionata</b>
            <span>Scegli un'azienda per vedere il calendario delle sale.</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mr-page mx-auto flex h-full w-full flex-col px-6 py-8 min-h-0 animate-fadeIn">
      <div className="flex flex-none flex-wrap items-center justify-between gap-3">
        <PageSectionHeader
          icon={<Icon name="calendar" className="h-6 w-6" />}
          title="Prenotazione sale"
        />
        <SegmentedSwitch
          value={view}
          onChange={(v) => setView(v as View)}
          ariaLabel="Vista calendario"
          options={[
            { value: "day", label: "Giorno" },
            { value: "week", label: "Settimana" },
            { value: "month", label: "Mese" },
          ]}
        />
      </div>

      <div className="mr-toolbar">
        <div className="mr-daynav">
          <button
            type="button"
            className="mr-nav"
            onClick={() => shift(-1)}
            aria-label="Periodo precedente"
          >
            <Icon name="chevron-right" className="h-4 w-4 rotate-180" />
          </button>
          <span className="mr-daylabel">
            {navLabel}
            {view === "day" && info.isToday && <i>oggi</i>}
          </span>
          <button
            type="button"
            className="mr-nav"
            onClick={() => shift(1)}
            aria-label="Periodo successivo"
          >
            <Icon name="chevron-right" className="h-4 w-4" />
          </button>
        </div>

        <button type="button" className="mr-today" onClick={() => setDayIso(todayIso())}>
          <Icon name="calendar" className="h-3.5 w-3.5" /> Oggi
        </button>

        {rooms.length > 1 && (
          <div className="mr-roomfilter">
            <button
              type="button"
              className={roomFilter === "all" ? "on" : ""}
              onClick={() => setRoomFilter("all")}
            >
              Tutte
            </button>
            {rooms.map((r) => (
              <button
                key={r.id}
                type="button"
                className={roomFilter === r.id ? "on" : ""}
                onClick={() => setRoomFilter(r.id)}
              >
                <i style={{ background: r.color }} />
                {roomShort(r)}
              </button>
            ))}
          </div>
        )}

        <span className="mr-spacer" />

        {loading && <Spinner className="h-4 w-4" />}
        <div className="mr-stat">
          <b>{scopeBookings.length}</b>
          <span>prenotazioni</span>
        </div>
        {view === "day" && (
          <div className="mr-stat">
            <b>{occupazione}%</b>
            <span>occupazione</span>
          </div>
        )}

        {isAdmin && (
          <Button
            variant="secondary"
            onClick={() => setRoomsOpen(true)}
            leftIcon={<Icon name="settings" className="h-4 w-4" />}
          >
            Gestisci sale
          </Button>
        )}
        <Button
          onClick={nuovaDalPulsante}
          disabled={!targetRoom}
          leftIcon={<Icon name="plus" className="h-4 w-4" />}
        >
          Nuova prenotazione
        </Button>
      </div>

      <div className="mr-board">
        {!rooms.length ? (
          <div className="mr-empty">
            <Icon name="building" className="h-6 w-6" />
            <b>Nessuna sala configurata</b>
            <span>
              {isAdmin
                ? "Crea la prima sala da «Gestisci sale»: nome, posti e orari di apertura bastano per iniziare a prenotare."
                : "Chiedi a un amministratore di configurare le sale dell'azienda."}
            </span>
            {isAdmin && (
              <Button
                variant="secondary"
                onClick={() => setRoomsOpen(true)}
                leftIcon={<Icon name="plus" className="h-4 w-4" />}
              >
                Gestisci sale
              </Button>
            )}
          </div>
        ) : (
          <>
            {view === "day" && (
              <DayCalendar
                rooms={visibleRooms}
                bookings={scopeBookings.filter((b) => b.day === dayIso)}
                day={info}
                onSlot={(roomId, start) => nuovaPrenotazione(roomId, start)}
                onOpen={(b) => setDraft(toDraft(b))}
              />
            )}
            {view === "week" && (
              <WeekCalendar
                days={settimana}
                bookings={scopeBookings}
                rooms={visibleRooms}
                targetRoom={targetRoom}
                onSlot={(roomId, start, iso) => nuovaPrenotazione(roomId, start, iso)}
                onOpen={(b) => setDraft(toDraft(b))}
              />
            )}
            {view === "month" && (
              <MonthCalendar
                iso={dayIso}
                bookings={scopeBookings}
                onPickDay={(iso) => {
                  setDayIso(iso);
                  setView("day");
                }}
              />
            )}

            <div className="mr-legend">
              <Icon name="information-circle" className="h-4 w-4" />
              <span>
                Clicca su uno slot libero per prenotare. I partecipanti ricevono una{" "}
                <b>notifica nel gestionale</b>; la sincronizzazione con Google Calendar arriverà in
                un secondo momento.
                {view === "day" && visibleRooms.length > 0 && (
                  <>
                    {" "}
                    Orario di lavoro:{" "}
                    {fmtDuration(
                      Math.max(
                        ...visibleRooms.map((r) => r.work_end_minute - r.work_start_minute),
                      ),
                    )}
                    .
                  </>
                )}
              </span>
            </div>
          </>
        )}
      </div>

      <BookingModal
        draft={draft}
        rooms={rooms}
        users={users}
        onClose={() => setDraft(null)}
        onSaved={loadBookings}
      />

      {isAdmin && (
        <RoomsManagerModal
          open={roomsOpen}
          onClose={() => setRoomsOpen(false)}
          companyId={companyId}
          rooms={allRooms}
          onChanged={() => {
            void loadRooms();
            void loadBookings();
          }}
        />
      )}
    </div>
  );
}
