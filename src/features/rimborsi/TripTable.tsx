import { Icon } from "../../components/ui/Icon";
import type { Trip, TripTotals } from "../../api/expenses";
import { dateIt, euro, num } from "./format";
import { EvidencePins, PersonAvatar, ReceiptsHint, StatusBadge } from "./TripBits";

// Tabella desktop: le stesse colonne del foglio del commercialista, nello stesso
// ordine, così chi rendiconta ritrova quello che già conosce.

interface Props {
  trips: Trip[];
  totals: TripTotals;
  showPerson: boolean;
  onEdit: (trip: Trip) => void;
  onDelete: (trip: Trip) => void;
}

const NUMERIC = "text-right tabular-nums";

export function TripTable({ trips, totals, showPerson, onEdit, onDelete }: Props) {
  const columns = [
    ...(showPerson ? [{ label: "Chi", cls: "" }] : []),
    { label: "Data", cls: "" },
    { label: "Località", cls: "" },
    { label: "Motivazione", cls: "" },
    { label: "Km", cls: NUMERIC },
    { label: "Quota km", cls: NUMERIC },
    { label: "Indennità km", cls: NUMERIC },
    { label: "Vitto", cls: NUMERIC },
    { label: "Alloggio", cls: NUMERIC },
    { label: "Parcheggi", cls: NUMERIC },
    { label: "Pedaggi", cls: NUMERIC },
    { label: "Ind. trasferta", cls: NUMERIC },
    { label: "Totale", cls: NUMERIC },
    { label: "Prove", cls: "" },
    { label: "Stato", cls: "" },
    { label: "", cls: "" },
  ];

  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-paper shadow-1 dark:border-[#2a2a2e] dark:bg-[#131316]">
      <table className="w-full min-w-[1180px] border-collapse text-[12px] font-body">
        <thead>
          <tr className="border-b border-line dark:border-[#2a2a2e]">
            {columns.map((col, i) => (
              <th
                key={`${col.label}-${i}`}
                className={`whitespace-nowrap px-2.5 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted dark:text-muted-dark ${col.cls || "text-left"}`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {trips.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10 text-center text-muted dark:text-muted-dark">
                Nessuna trasferta registrata in questo mese.
              </td>
            </tr>
          ) : (
            trips.map((trip) => (
              <tr
                key={trip.id}
                className="group border-b border-line/60 transition-colors last:border-0 hover:bg-cream/70 dark:border-[#2a2a2e] dark:hover:bg-[#1c1c20]/40"
              >
                {showPerson && (
                  <td className="px-2.5 py-2">
                    <PersonAvatar trip={trip} />
                  </td>
                )}
                <td className="whitespace-nowrap px-2.5 py-2 font-medium">{dateIt(trip.trip_date)}</td>
                <td className="px-2.5 py-2">
                  <span className="flex items-center gap-1.5">
                    <span className="font-medium">{trip.location}</span>
                    {trip.abroad && (
                      <span className="rounded-xs bg-brand-cyan/15 px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-wider text-brand-cyan">
                        Estero
                      </span>
                    )}
                    {trip.maps?.url && (
                      <a
                        href={trip.maps.url}
                        target="_blank"
                        rel="noopener"
                        title={`Percorso su Maps · ${num(trip.maps.distance_km)} km · ${trip.maps.duration_text ?? ""}`}
                        className="text-muted transition-colors hover:text-brand-magenta dark:text-muted-dark"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Icon name="target" className="h-3 w-3" />
                      </a>
                    )}
                  </span>
                  {trip.client_name && (
                    <span className="block text-[10px] text-muted dark:text-muted-dark">{trip.client_name}</span>
                  )}
                </td>
                <td className="max-w-[220px] px-2.5 py-2">
                  <span className="block truncate" title={trip.reason}>
                    {trip.reason}
                  </span>
                  <ReceiptsHint trip={trip} />
                </td>
                <td className={`px-2.5 py-2 ${NUMERIC}`}>{num(trip.km)}</td>
                <td className={`px-2.5 py-2 text-muted dark:text-muted-dark ${NUMERIC}`}>
                  {num(trip.rate_per_km, 4)}
                </td>
                <td className={`px-2.5 py-2 font-semibold ${NUMERIC}`}>{euro(trip.km_allowance)}</td>
                <td className={`px-2.5 py-2 ${NUMERIC}`}>{trip.meal ? euro(trip.meal) : "—"}</td>
                <td className={`px-2.5 py-2 ${NUMERIC}`}>{trip.lodging ? euro(trip.lodging) : "—"}</td>
                <td className={`px-2.5 py-2 ${NUMERIC}`}>{trip.parking ? euro(trip.parking) : "—"}</td>
                <td className={`px-2.5 py-2 ${NUMERIC}`}>{trip.tolls ? euro(trip.tolls) : "—"}</td>
                <td className={`px-2.5 py-2 ${NUMERIC}`}>{euro(trip.daily_allowance)}</td>
                <td className={`px-2.5 py-2 font-bold text-brand-magenta ${NUMERIC}`}>{euro(trip.total)}</td>
                <td className="px-2.5 py-2">
                  <EvidencePins trip={trip} size="xs" />
                </td>
                <td className="px-2.5 py-2">
                  <StatusBadge trip={trip} />
                </td>
                <td className="whitespace-nowrap px-2.5 py-2 text-right">
                  <button
                    type="button"
                    title="Modifica"
                    onClick={() => onEdit(trip)}
                    className="rounded-sm p-1 text-muted transition-colors hover:bg-line hover:text-ink dark:text-muted-dark dark:hover:bg-[#1c1c20] dark:hover:text-white"
                  >
                    <Icon name="pencil" className="h-3.5 w-3.5" />
                  </button>
                  {trip.can_edit && (
                    <button
                      type="button"
                      title="Elimina"
                      onClick={() => onDelete(trip)}
                      className="rounded-sm p-1 text-muted transition-colors hover:bg-danger/10 hover:text-danger dark:text-muted-dark"
                    >
                      <Icon name="trash" className="h-3.5 w-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
        {trips.length > 0 && (
          <tfoot>
            <tr className="border-t-2 border-line bg-cream/60 font-semibold dark:border-[#2a2a2e] dark:bg-[#1c1c20]">
              <td colSpan={showPerson ? 4 : 3} className="px-2.5 py-2.5">
                Totali del mese · {totals.count} {totals.count === 1 ? "trasferta" : "trasferte"}
              </td>
              <td className={`px-2.5 py-2.5 ${NUMERIC}`}>{num(totals.km)}</td>
              <td />
              <td className={`px-2.5 py-2.5 ${NUMERIC}`}>{euro(totals.km_allowance)}</td>
              <td className={`px-2.5 py-2.5 ${NUMERIC}`}>{euro(totals.meal)}</td>
              <td className={`px-2.5 py-2.5 ${NUMERIC}`}>{euro(totals.lodging)}</td>
              <td className={`px-2.5 py-2.5 ${NUMERIC}`}>{euro(totals.parking)}</td>
              <td className={`px-2.5 py-2.5 ${NUMERIC}`}>{euro(totals.tolls)}</td>
              <td className={`px-2.5 py-2.5 ${NUMERIC}`}>{euro(totals.daily_allowance)}</td>
              <td className={`px-2.5 py-2.5 text-brand-magenta ${NUMERIC}`}>{euro(totals.total)}</td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
