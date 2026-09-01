import { Icon } from "../../components/ui/Icon";
import type { Trip, TripTotals } from "../../api/expenses";
import { MONTH_SHORT, dayNumber, euro, num } from "./format";
import { EvidencePins, PersonAvatar, ReceiptsHint, StatusBadge } from "./TripBits";

// Vista a card per gli schermi stretti: stessa sostanza della tabella, ma
// leggibile con il pollice — data grande a sinistra, totale a destra.

interface Props {
  trips: Trip[];
  totals: TripTotals;
  showPerson: boolean;
  onEdit: (trip: Trip) => void;
  onDelete: (trip: Trip) => void;
}

export function TripCards({ trips, totals, showPerson, onEdit, onDelete }: Props) {
  if (trips.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line px-4 py-10 text-center text-sm text-muted dark:border-[#2a2a2e] dark:text-muted-dark">
        Nessuna trasferta in questo mese.
        <span className="mt-1 block text-xs">Tocca “Nuova trasferta” per aggiungerne una.</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {trips.map((trip) => (
        <article
          key={trip.id}
          onClick={() => onEdit(trip)}
          className="cursor-pointer rounded-lg border border-line bg-paper p-3 shadow-1 transition-colors hover:border-brand-magenta/40 dark:border-[#2a2a2e] dark:bg-[#131316]"
        >
          <div className="flex items-start gap-3">
            <span className="flex w-10 shrink-0 flex-col items-center rounded-md bg-cream py-1 dark:bg-[#1c1c20]">
              <b className="text-[15px] leading-none">{dayNumber(trip.trip_date)}</b>
              <span className="text-[10px] uppercase text-muted dark:text-muted-dark">
                {MONTH_SHORT[Number(trip.trip_date.slice(5, 7)) - 1]}
              </span>
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                {showPerson && <PersonAvatar trip={trip} />}
                <span className="truncate text-[13px] font-semibold">{trip.location}</span>
                {trip.abroad && (
                  <span className="rounded-xs bg-brand-cyan/15 px-1.5 py-[1px] text-[9px] font-bold uppercase text-brand-cyan">
                    Estero
                  </span>
                )}
              </div>
              <p className="truncate text-[11px] text-muted dark:text-muted-dark">{trip.reason}</p>
            </div>

            <b className="shrink-0 text-[14px] font-bold text-brand-magenta">{euro(trip.total)}</b>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Chip>
              <Icon name="target" className="h-3 w-3" />
              {num(trip.km)} km
            </Chip>
            <Chip>{euro(trip.km_allowance)}</Chip>
            {trip.expenses_total > 0 && <Chip>Spese {euro(trip.expenses_total)}</Chip>}
            <Chip>Ind. {euro(trip.daily_allowance)}</Chip>
            <ReceiptsHint trip={trip} />
          </div>

          <div className="mt-2 flex items-center gap-2 border-t border-line/70 pt-2 dark:border-[#2a2a2e]">
            <EvidencePins trip={trip} size="xs" />
            <span className="flex-1" />
            <StatusBadge trip={trip} />
            {trip.can_edit && (
              <button
                type="button"
                title="Elimina"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(trip);
                }}
                className="rounded-sm p-1 text-muted transition-colors hover:bg-danger/10 hover:text-danger dark:text-muted-dark"
              >
                <Icon name="trash" className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </article>
      ))}

      <div className="flex items-center justify-between rounded-lg border border-line bg-cream/60 px-3 py-2.5 text-[12px] font-semibold dark:border-[#2a2a2e] dark:bg-[#1c1c20]">
        <span>
          {totals.count} {totals.count === 1 ? "trasferta" : "trasferte"} · {num(totals.km)} km
        </span>
        <b className="text-brand-magenta">{euro(totals.total)}</b>
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-pill border border-line bg-cream px-2 py-[3px] text-[10px] font-medium text-muted dark:border-[#2a2a2e] dark:bg-[#1c1c20] dark:text-muted-dark">
      {children}
    </span>
  );
}
