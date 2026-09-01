import { DOW_SHORT, fmtMinute, monthGrid } from "./roomsTime";
import type { RoomBooking } from "../../api/meetingRooms";

interface MonthCalendarProps {
  /** Un giorno qualsiasi del mese da mostrare. */
  iso: string;
  bookings: RoomBooking[];
  onPickDay: (iso: string) => void;
}

/** Quante prenotazioni entrano in una cella prima del "+n". */
const MAX_PER_CELL = 3;

/** Vista Mese: colpo d'occhio sul carico, il clic porta al giorno. */
export function MonthCalendar({ iso, bookings, onPickDay }: MonthCalendarProps) {
  const celle = monthGrid(iso);
  return (
    <div className="mr-cal">
      <div className="mr-mgrid-dows">
        {DOW_SHORT.map((d, i) => (
          <div key={d} className={`mr-mdow${i >= 5 ? " we" : ""}`}>
            {d}
          </div>
        ))}
      </div>
      <div className="mr-mgrid">
        {celle.map((day, i) => {
          if (!day) return <div key={`vuota-${i}`} className="mr-mcell blank" />;
          const delGiorno = bookings
            .filter((b) => b.day === day.iso)
            .sort((a, b) => a.start_minute - b.start_minute);
          const classi = [
            "mr-mcell",
            day.isWeekend ? "we" : "",
            day.isToday ? "today" : "",
            day.iso === iso ? "sel" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <button type="button" key={day.iso} className={classi} onClick={() => onPickDay(day.iso)}>
              <div className="mr-mtop">
                <span className="mr-mnum">{day.date}</span>
                {delGiorno.length > 0 && <span className="mr-mcount">{delGiorno.length}</span>}
              </div>
              <div className="mr-mevs">
                {delGiorno.slice(0, MAX_PER_CELL).map((b) => (
                  <span
                    key={b.id}
                    className="mr-mev"
                    style={{ ["--mr-room" as string]: b.room_color }}
                    title={`${b.title} · ${b.room_name}`}
                  >
                    <i />
                    <span className="mr-mev-t">
                      {fmtMinute(b.start_minute)} {b.title}
                    </span>
                  </span>
                ))}
                {delGiorno.length > MAX_PER_CELL && (
                  <span className="mr-mmore">+{delGiorno.length - MAX_PER_CELL} altre</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
