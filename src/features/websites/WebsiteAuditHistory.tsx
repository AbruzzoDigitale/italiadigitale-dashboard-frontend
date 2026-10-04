import { useCallback, useEffect, useState } from "react";
import {
  SCAN_STATUS_LABELS,
  listAuditScansApi,
  scanInCorso,
  scoreClass,
  severityClass,
  type AuditScanSummary,
} from "../../api/websiteAudits";
import { Icon } from "../../components/ui/Icon";
import { Spinner } from "../../components/ui/Spinner";

/**
 * Storico dei giri di controlli tecnici di un sito, dentro la sua scheda.
 *
 * Mostra l'intestazione di ogni giro, non i rilievi: il referto completo si apre
 * al clic e riusa lo stesso modale del giro appena fatto, perché
 * `GET /website-controlli/{id}` restituisce la stessa forma di `POST /run`.
 *
 * Il punteggio in riga serve a una cosa sola, ma importante: vedere se fra due
 * giri il sito è migliorato. Un elenco di conteggi non lo dice a colpo d'occhio.
 */

interface WebsiteAuditHistoryProps {
  websiteId: number;
  /** Cambiarlo ricarica l'elenco: lo alza la scheda dopo ogni giro. */
  reloadKey?: number;
  onOpen: (scanId: number) => void;
}

function quando(valore: string): string {
  const d = new Date(valore);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
}

export function WebsiteAuditHistory({
  websiteId,
  reloadKey = 0,
  onOpen,
}: WebsiteAuditHistoryProps) {
  const [giri, setGiri] = useState<AuditScanSummary[] | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  const carica = useCallback(async () => {
    setErrore(null);
    try {
      setGiri(await listAuditScansApi(websiteId));
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
        <Icon name="tools" className="h-4 w-4" />
        <h3 className="font-semibold">Controlli tecnici</h3>
        {giri && giri.length > 0 && (
          <span className="text-[11.5px] text-muted dark:text-[#9999a0]">
            {giri.length === 1 ? "1 giro" : `${giri.length} giri`}
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
          Mai controllato. Il bottone con la chiave inglese, qui sopra nella riga del sito, legge
          banner cookie, pagine legali, form, FAQ e peso delle immagini.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {giri.map((g) => (
            <li key={g.id}>
              <button
                type="button"
                // Un giro ancora in coda o in esecuzione non ha un referto da
                // aprire: i suoi conteggi sono a zero perché non si sa ancora,
                // non perché il sito sia a posto.
                disabled={scanInCorso(g.status)}
                onClick={() => onOpen(g.id)}
                className="flex w-full items-center gap-2.5 rounded-md border border-transparent px-2 py-1.5 text-left transition-colors hover:border-line hover:bg-paper disabled:cursor-default disabled:opacity-70 disabled:hover:border-transparent disabled:hover:bg-transparent dark:hover:border-[#2a2a2e] dark:hover:bg-[#131316]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold text-ink dark:text-[#f4f4f7]">
                    {quando(g.started_at)}
                  </span>
                  <span className="block truncate text-[11.5px] text-muted dark:text-[#9999a0]">
                    {g.pages_checked} {g.pages_checked === 1 ? "pagina" : "pagine"}
                    {/* Quanti controlli: un giro vecchio può averne meno di
                        quelli di oggi, e il referto lo dice in testa. */}
                    {g.checks.length > 0 &&
                      ` · ${g.checks.length} ${g.checks.length === 1 ? "controllo" : "controlli"}`}
                    {/* Lo stato si nomina solo quando NON è quello normale: una
                        riga su cinque che dice "Completati" è rumore. */}
                    {g.status !== "completed" &&
                      ` · ${SCAN_STATUS_LABELS[g.status] ?? g.status}`}
                  </span>
                </span>

                <span className="flex flex-none items-center gap-1">
                  {scanInCorso(g.status) && (
                    <span className="rounded-full border border-brand-magenta/30 bg-brand-magenta/5 px-2 py-0.5 text-[11px] font-semibold text-brand-magenta">
                      {SCAN_STATUS_LABELS[g.status] ?? g.status}
                    </span>
                  )}
                  {g.critical_count > 0 && (
                    <span
                      title="Da sistemare"
                      className={`rounded-full border px-1.5 py-0.5 text-[11px] font-semibold ${severityClass("critical")}`}
                    >
                      {g.critical_count}
                    </span>
                  )}
                  {g.warning_count > 0 && (
                    <span
                      title="Da valutare"
                      className={`rounded-full border px-1.5 py-0.5 text-[11px] font-semibold ${severityClass("warning")}`}
                    >
                      {g.warning_count}
                    </span>
                  )}
                  {g.score !== null && !scanInCorso(g.status) && (
                    <span
                      title="Punteggio del giro: serve a vedere se fra due controlli il sito è migliorato"
                      className={`rounded-full border px-1.5 py-0.5 text-[11px] font-bold ${scoreClass(g.score)}`}
                    >
                      {g.score}
                    </span>
                  )}
                </span>

                {!scanInCorso(g.status) && (
                  <Icon name="chevron-right" className="h-4 w-4 flex-none opacity-50" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
