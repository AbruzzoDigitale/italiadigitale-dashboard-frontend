import { useCallback, useEffect, useState } from "react";
import {
  SCAN_STATUS_LABELS,
  listDecreeScansApi,
  severityClass,
  type DecreeScanSummary,
} from "../../api/websiteDecrees";
import { Icon } from "../../components/ui/Icon";
import { Spinner } from "../../components/ui/Spinner";

/**
 * Storico delle scansioni di conformità di un sito, dentro la sua scheda.
 *
 * Fino a ieri i giri finivano nel database e non erano più raggiungibili
 * dall'interfaccia: chiuso il referto, per rileggerlo bisognava riscansionare.
 * Le righe qui sotto sono quelle che il backend conservava già.
 *
 * Mostra l'intestazione di ogni giro, non i rilievi: il referto completo si apre
 * al clic e riusa lo stesso modale della scansione appena fatta, perché
 * `GET /website-decreti/{id}` restituisce la stessa forma di `POST /run`.
 */

interface WebsiteDecreeHistoryProps {
  websiteId: number;
  /** Cambiarlo ricarica l'elenco: lo alza la scheda dopo ogni scansione. */
  reloadKey?: number;
  onOpen: (scanId: number) => void;
}

function quando(valore: string): string {
  const d = new Date(valore);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
}

export function WebsiteDecreeHistory({
  websiteId,
  reloadKey = 0,
  onOpen,
}: WebsiteDecreeHistoryProps) {
  const [giri, setGiri] = useState<DecreeScanSummary[] | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  const carica = useCallback(async () => {
    setErrore(null);
    try {
      setGiri(await listDecreeScansApi(websiteId));
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Storico non disponibile");
      setGiri([]);
    }
  }, [websiteId]);

  useEffect(() => {
    void carica();
  }, [carica, reloadKey]);

  return (
    <div className="rounded-lg border border-line bg-surface p-3 dark:border-line-dark dark:bg-surface-dark">
      <div className="mb-2 flex items-center gap-2">
        <Icon name="shield" className="h-4 w-4" />
        <h3 className="font-semibold">Conformità</h3>
        {giri && giri.length > 0 && (
          <span className="text-[11.5px] text-muted dark:text-[#9999a0]">
            {giri.length === 1 ? "1 scansione" : `${giri.length} scansioni`}
          </span>
        )}
      </div>

      {giri === null ? (
        <div className="flex items-center gap-2 py-2 text-[12.5px] text-muted dark:text-[#9999a0]">
          <Spinner size="sm" />
          Carico lo storico…
        </div>
      ) : errore ? (
        <p className="py-1 text-[12.5px] text-danger">{errore}</p>
      ) : giri.length === 0 ? (
        <p className="py-1 text-[12.5px] text-muted dark:text-[#9999a0]">
          Mai controllato. Il bottone con lo scudo, qui sopra nella riga del sito, lancia la
          scansione.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {giri.map((g) => (
            <li key={g.id}>
              <button
                type="button"
                onClick={() => onOpen(g.id)}
                className="flex w-full items-center gap-2.5 rounded-md border border-transparent px-2 py-1.5 text-left transition-colors hover:border-line hover:bg-paper dark:hover:border-[#2a2a2e] dark:hover:bg-[#131316]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold text-ink dark:text-[#f4f4f7]">
                    {quando(g.started_at)}
                  </span>
                  <span className="block truncate text-[11.5px] text-muted dark:text-[#9999a0]">
                    {g.decree_nome} · {g.pages_checked}{" "}
                    {g.pages_checked === 1 ? "pagina" : "pagine"}
                    {/* Lo stato si nomina solo quando NON è quello normale: una
                        riga su cinque che dice "Completata" è rumore. */}
                    {g.status !== "completed" &&
                      ` · ${SCAN_STATUS_LABELS[g.status] ?? g.status}`}
                  </span>
                </span>

                <span className="flex flex-none gap-1">
                  {g.critical_count > 0 && (
                    <span
                      title="Da rimuovere"
                      className={`rounded-full border px-1.5 py-0.5 text-[11px] font-semibold ${severityClass("critical")}`}
                    >
                      {g.critical_count}
                    </span>
                  )}
                  {g.warning_count > 0 && (
                    <span
                      title="Da verificare"
                      className={`rounded-full border px-1.5 py-0.5 text-[11px] font-semibold ${severityClass("warning")}`}
                    >
                      {g.warning_count}
                    </span>
                  )}
                  {g.info_count > 0 && (
                    <span
                      title="Legittimo, non rimuovere"
                      className={`rounded-full border px-1.5 py-0.5 text-[11px] font-semibold ${severityClass("info")}`}
                    >
                      {g.info_count}
                    </span>
                  )}
                  {g.critical_count + g.warning_count + g.info_count === 0 && (
                    <span className="text-[11.5px] text-muted dark:text-[#9999a0]">
                      nessun rilievo
                    </span>
                  )}
                </span>

                <Icon name="chevron-right" className="h-4 w-4 flex-none opacity-50" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
