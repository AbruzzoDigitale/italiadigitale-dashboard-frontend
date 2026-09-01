import type { ReactNode } from "react";
import { hourMarks, yFor, type PlacedBooking } from "./calendarGeometry";
import { fmtMinute } from "./roomsTime";
import type { RoomBooking } from "../../api/meetingRooms";

// Pezzi comuni alle viste Giorno e Settimana: la colonna delle ore, lo sfondo
// di una colonna (griglia, fasce fuori orario, linea "adesso") e il rettangolo
// di una prenotazione.

export function HourGutter({ open, close }: { open: number; close: number }) {
  return (
    <div className="mr-gutter" style={{ height: yFor(close, open) }}>
      {hourMarks(open, close).map((h) => (
        <span key={h} className="mr-hlab" style={{ top: yFor(h, open) }}>
          {fmtMinute(h)}
        </span>
      ))}
    </div>
  );
}

interface ColumnBackdropProps {
  open: number;
  close: number;
  workStart: number;
  workEnd: number;
  /** Minuti trascorsi oggi: disegna la linea "adesso". null = non è oggi. */
  nowAt?: number | null;
  /** Etichetta le fasce fuori orario (solo la vista Giorno ha spazio). */
  labelOffHours?: boolean;
}

/** Griglia oraria, fasce fuori orario, linee di inizio/fine giornata e "adesso". */
export function ColumnBackdrop({
  open,
  close,
  workStart,
  workEnd,
  nowAt = null,
  labelOffHours = false,
}: ColumnBackdropProps) {
  const y = (m: number) => yFor(m, open);
  const ore = hourMarks(open, close);
  return (
    <>
      {workStart > open && (
        <div className="mr-off" style={{ top: 0, height: y(workStart) }}>
          {labelOffHours && <span>Fuori orario</span>}
        </div>
      )}
      {workEnd < close && (
        <div className="mr-off bot" style={{ top: y(workEnd), height: y(close) - y(workEnd) }}>
          {labelOffHours && <span>Fuori orario</span>}
        </div>
      )}
      {ore.map((h) => (
        <div key={h} className="mr-hl" style={{ top: y(h) }} />
      ))}
      {ore.map((h) => (
        <div key={`half-${h}`} className="mr-hl half" style={{ top: y(h + 30) }} />
      ))}
      {workStart > open && <div className="mr-workline" style={{ top: y(workStart) }} />}
      {workEnd < close && <div className="mr-workline end" style={{ top: y(workEnd) }} />}
      {nowAt != null && nowAt >= open && nowAt <= close && (
        <div className="mr-nowline" style={{ top: y(nowAt) }} />
      )}
    </>
  );
}

interface BookingBlockProps {
  placed: PlacedBooking;
  open: number;
  onOpen: (booking: RoomBooking) => void;
  /** Riga secondaria: iniziali dell'organizzatore (giorno) o nome sala (settimana). */
  meta: ReactNode;
}

export function BookingBlock({ placed, open, onOpen, meta }: BookingBlockProps) {
  const { booking, lane, lanes } = placed;
  const top = yFor(booking.start_minute, open);
  const height = yFor(booking.end_minute, open) - top;
  const compatta = height < 46;
  const larghezza = 100 / lanes;
  return (
    <button
      type="button"
      className={`mr-ev${compatta ? " compact" : ""}`}
      style={{
        top: top + 1,
        height: Math.max(height - 3, 16),
        left: `calc(${lane * larghezza}% + 4px)`,
        right: `calc(${(lanes - lane - 1) * larghezza}% + 5px)`,
        ["--mr-room" as string]: booking.room_color,
      }}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(booking);
      }}
      title={`${booking.title} · ${booking.room_name} · ${fmtMinute(booking.start_minute)}–${fmtMinute(booking.end_minute)}`}
    >
      <span className="mr-ev-t">{booking.title}</span>
      <span className="mr-ev-m">
        <span className="mr-ev-h">
          {fmtMinute(booking.start_minute)}
          {!compatta && ` – ${fmtMinute(booking.end_minute)}`}
        </span>
        {meta}
      </span>
    </button>
  );
}
