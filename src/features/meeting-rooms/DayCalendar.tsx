import { useLayoutEffect, useRef } from "react";
import { Icon } from "../../components/ui/Icon";
import { BookingBlock, ColumnBackdrop, HourGutter } from "./calendarParts";
import { ROW_H, layoutBookings, yFor } from "./calendarGeometry";
import { fmtDuration, nowMinute } from "./roomsTime";
import type { DayInfo } from "./roomsTime";
import type { MeetingRoom, RoomBooking } from "../../api/meetingRooms";

interface DayCalendarProps {
  rooms: MeetingRoom[];
  /** Solo le prenotazioni del giorno mostrato. */
  bookings: RoomBooking[];
  day: DayInfo;
  onSlot: (roomId: number, startMinute: number) => void;
  onOpen: (booking: RoomBooking) => void;
}

/** Vista Giorno: una colonna per sala, le ore sull'asse Y. */
export function DayCalendar({ rooms, bookings, day, onSlot, onOpen }: DayCalendarProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // La finestra visibile copre tutte le sale mostrate: la più mattiniera in
  // cima, la più notturna in fondo.
  const open = Math.min(...rooms.map((r) => r.open_minute));
  const close = Math.max(...rooms.map((r) => r.close_minute));
  // Solo per lo scroll iniziale: ogni colonna disegna poi la propria fascia.
  const workStart = Math.min(...rooms.map((r) => r.work_start_minute));
  const adesso = day.isToday ? nowMinute() : null;

  // All'apertura si parte dall'inizio dell'orario di lavoro: nessuno prenota
  // alle 8 e la giornata utile deve essere già sullo schermo.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = Math.max(0, yFor(workStart, open) - 20);
  }, [open, workStart]);

  const clickSlot = (room: MeetingRoom, e: React.MouseEvent<HTMLDivElement>) => {
    if (!room.weekdays.includes(day.weekday)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    // La griglia parte da `open` (la sala più mattiniera): la conversione
    // pixel→minuti usa quello, lo snap invece l'apertura di QUESTA sala.
    const grezzo = open + ((e.clientY - rect.top) / ROW_H) * 60;
    const passo = room.slot_minutes;
    const snap = Math.floor((grezzo - room.open_minute) / passo) * passo + room.open_minute;
    const inizio = Math.max(room.open_minute, Math.min(snap, room.close_minute - passo));
    const occupato = bookings.some(
      (b) => b.room_id === room.id && inizio < b.end_minute && inizio + passo > b.start_minute,
    );
    if (occupato) return;
    onSlot(room.id, inizio);
  };

  return (
    <div className="mr-cal">
      <div className="mr-cal-body" ref={scrollRef}>
        <div className="mr-cal-head" style={{ ["--mr-cols" as string]: rooms.length }}>
          <div className="mr-corner" />
          {rooms.map((room) => {
            const sue = bookings.filter((b) => b.room_id === room.id);
            const occupati = sue.reduce((s, b) => s + (b.end_minute - b.start_minute), 0);
            const aperta = room.weekdays.includes(day.weekday);
            const libere = aperta
              ? Math.max(room.work_end_minute - room.work_start_minute - occupati, 0)
              : 0;
            return (
              <div
                className="mr-chead"
                key={room.id}
                style={{ ["--mr-room" as string]: room.color }}
              >
                <div className="mr-chead-top">
                  <span className="mr-chead-dot" />
                  <span className="mr-chead-name">{room.name}</span>
                </div>
                <div className="mr-chead-meta">
                  <Icon name="users" className="h-3 w-3" />
                  {room.capacity > 0 ? `${room.capacity} posti` : "posti n.d."}
                  {room.location ? ` · ${room.location}` : ""}
                </div>
                <div className="mr-chead-stat">
                  {aperta ? (
                    <>
                      {sue.length} {sue.length === 1 ? "prenotazione" : "prenotazioni"} ·{" "}
                      <b>{fmtDuration(libere)}</b> libere
                    </>
                  ) : (
                    "Chiusa in questo giorno"
                  )}
                </div>
                {room.features.length > 0 && (
                  <div className="mr-chead-feat">
                    {room.features.map((f) => (
                      <span key={f}>{f}</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div
          className="mr-grid"
          style={{ height: yFor(close, open), ["--mr-cols" as string]: rooms.length }}
        >
          <HourGutter open={open} close={close} />
          {rooms.map((room) => {
            const aperta = room.weekdays.includes(day.weekday);
            const sue = layoutBookings(bookings.filter((b) => b.room_id === room.id));
            return (
              <div
                key={room.id}
                className={`mr-col${aperta ? " bookable" : ""}`}
                style={{ height: yFor(close, open), ["--mr-room" as string]: room.color }}
                onClick={(e) => clickSlot(room, e)}
              >
                <ColumnBackdrop
                  open={open}
                  close={close}
                  workStart={room.work_start_minute}
                  workEnd={room.work_end_minute}
                  nowAt={adesso}
                  labelOffHours
                />
                {!aperta && <div className="mr-closed">Chiusa</div>}
                {sue.map((placed) => (
                  <BookingBlock
                    key={placed.booking.id}
                    placed={placed}
                    open={open}
                    onOpen={onOpen}
                    meta={
                      <span className="mr-ev-av" title={placed.booking.organizer_name}>
                        {placed.booking.organizer_initials}
                      </span>
                    }
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
