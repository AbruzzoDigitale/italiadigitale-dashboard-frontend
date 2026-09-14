import { useLayoutEffect, useRef } from "react";
import { BookingBlock, ColumnBackdrop, HourGutter } from "./calendarParts";
import { ROW_H, layoutBookings, yFor } from "./calendarGeometry";
import { nowMinute, roomShort } from "./roomsTime";
import type { DayInfo } from "./roomsTime";
import type { MeetingRoom, RoomBooking } from "../../api/meetingRooms";

interface WeekCalendarProps {
  days: DayInfo[];
  /** Prenotazioni della settimana, già filtrate per sala se serve. */
  bookings: RoomBooking[];
  rooms: MeetingRoom[];
  /** Sala su cui ricade il clic su uno slot vuoto (la prima visibile se "Tutte"). */
  targetRoom: MeetingRoom | null;
  onSlot: (roomId: number, startMinute: number, dayIso: string) => void;
  onOpen: (booking: RoomBooking) => void;
}

/** Vista Settimana: una colonna per giorno, le ore sull'asse Y. */
export function WeekCalendar({
  days,
  bookings,
  rooms,
  targetRoom,
  onSlot,
  onOpen,
}: WeekCalendarProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const open = Math.min(...rooms.map((r) => r.open_minute));
  const close = Math.max(...rooms.map((r) => r.close_minute));
  const workStart = Math.min(...rooms.map((r) => r.work_start_minute));
  const workEnd = Math.max(...rooms.map((r) => r.work_end_minute));
  const oggi = nowMinute();

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = Math.max(0, yFor(workStart, open) - 20);
  }, [open, workStart]);

  const clickSlot = (day: DayInfo, e: React.MouseEvent<HTMLDivElement>) => {
    const room = targetRoom;
    if (!room || !room.weekdays.includes(day.weekday)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const grezzo = open + ((e.clientY - rect.top) / ROW_H) * 60;
    const passo = room.slot_minutes;
    const snap = Math.floor((grezzo - room.open_minute) / passo) * passo + room.open_minute;
    const inizio = Math.max(room.open_minute, Math.min(snap, room.close_minute - passo));
    onSlot(room.id, inizio, day.iso);
  };

  return (
    <div className="mr-cal">
      <div className="mr-cal-body" ref={scrollRef}>
        <div className="mr-cal-head" style={{ ["--mr-cols" as string]: days.length }}>
          <div className="mr-corner" />
          {days.map((day) => {
            const n = bookings.filter((b) => b.day === day.iso).length;
            return (
              <div className={`mr-chead day${day.isToday ? " today" : ""}`} key={day.iso}>
                <div className="mr-wd-dow">{day.dow}</div>
                <div className="mr-wd-num">
                  {day.date}
                  {day.isToday && <i>oggi</i>}
                </div>
                <div className="mr-chead-stat">
                  {n} {n === 1 ? "prenotazione" : "prenotazioni"}
                </div>
              </div>
            );
          })}
        </div>

        <div
          className="mr-grid"
          style={{ height: yFor(close, open), ["--mr-cols" as string]: days.length }}
        >
          <HourGutter open={open} close={close} />
          {days.map((day) => {
            // Un giorno è prenotabile se almeno una sala visibile è aperta.
            const aperto = rooms.some((r) => r.weekdays.includes(day.weekday));
            const delGiorno = layoutBookings(bookings.filter((b) => b.day === day.iso));
            const prenotabile = aperto && !!targetRoom?.weekdays.includes(day.weekday);
            return (
              <div
                key={day.iso}
                className={`mr-col${prenotabile ? " bookable" : ""}`}
                style={{ height: yFor(close, open) }}
                onClick={(e) => clickSlot(day, e)}
              >
                <ColumnBackdrop
                  open={open}
                  close={close}
                  workStart={workStart}
                  workEnd={workEnd}
                  nowAt={day.isToday ? oggi : null}
                />
                {!aperto && <div className="mr-closed">Chiuso</div>}
                {delGiorno.map((placed) => {
                  const room = rooms.find((r) => r.id === placed.booking.room_id);
                  return (
                    <BookingBlock
                      key={placed.booking.id}
                      placed={placed}
                      open={open}
                      onOpen={onOpen}
                      meta={
                        <span className="mr-ev-room">
                          {room
                            ? roomShort(room)
                            : placed.booking.room_short_name || placed.booking.room_name}
                        </span>
                      }
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
