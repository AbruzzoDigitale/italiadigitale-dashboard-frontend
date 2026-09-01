import type { RoomBooking } from "../../api/meetingRooms";

// Geometria della griglia oraria, senza JSX: le ore stanno sull'asse Y e ogni
// prenotazione è posizionata in assoluto a partire dai minuti, così non deve
// sapere nulla della griglia per sapere dove finire.

/** Altezza di un'ora in pixel. */
export const ROW_H = 56;

/** Minuti → offset verticale in px, rispetto all'apertura della finestra. */
export function yFor(minute: number, openMinute: number): number {
  return ((minute - openMinute) / 60) * ROW_H;
}

/** Le ore intere disegnate nella colonna delle etichette. */
export function hourMarks(openMinute: number, closeMinute: number): number[] {
  const marks: number[] = [];
  const primo = Math.ceil(openMinute / 60) * 60;
  for (let m = primo; m <= closeMinute; m += 60) marks.push(m);
  return marks;
}

export interface PlacedBooking {
  booking: RoomBooking;
  /** Corsia occupata dentro il gruppo di prenotazioni sovrapposte. */
  lane: number;
  /** Quante corsie servono al gruppo: la larghezza è 1/lanes. */
  lanes: number;
}

/**
 * Dispone in corsie le prenotazioni che si sovrappongono nella stessa colonna.
 *
 * Serve alla vista Settimana con il filtro su "Tutte le sale": due sale possono
 * benissimo essere occupate alla stessa ora, e sovrapporre i rettangoli
 * renderebbe illeggibile proprio il momento più affollato della giornata.
 */
export function layoutBookings(bookings: RoomBooking[]): PlacedBooking[] {
  const ordinate = [...bookings].sort(
    (a, b) => a.start_minute - b.start_minute || a.end_minute - b.end_minute,
  );
  const out: PlacedBooking[] = [];
  let gruppo: PlacedBooking[] = [];
  let fineGruppo = -1;

  const chiudiGruppo = () => {
    const corsie = gruppo.reduce((max, p) => Math.max(max, p.lane + 1), 0);
    gruppo.forEach((p) => {
      p.lanes = corsie;
    });
    out.push(...gruppo);
    gruppo = [];
    fineGruppo = -1;
  };

  for (const booking of ordinate) {
    if (gruppo.length && booking.start_minute >= fineGruppo) chiudiGruppo();
    // Prima corsia libera nel gruppo corrente.
    const occupate = new Set(
      gruppo.filter((p) => p.booking.end_minute > booking.start_minute).map((p) => p.lane),
    );
    let lane = 0;
    while (occupate.has(lane)) lane += 1;
    gruppo.push({ booking, lane, lanes: 1 });
    fineGruppo = Math.max(fineGruppo, booking.end_minute);
  }
  if (gruppo.length) chiudiGruppo();
  return out;
}
