import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Icon } from "../components/ui/Icon";
import { Spinner } from "../components/ui/Spinner";
import { getSharedExpensesApi, type SharedExpenses } from "../api/expenses";
import { euro, monthLabel, num } from "../features/rimborsi/format";

// Vista condivisa col commercialista: sola lettura, senza account. Il token
// nell'URL è l'unica credenziale e si revoca rigenerandolo dalle impostazioni.
//
// Mostra le stesse colonne del foglio Google, così chi rendiconta ritrova
// l'ordine che conosce; i giustificativi sono i link Drive, che non scadono.

const NUMERIC = "text-right tabular-nums";

export default function SharedExpensesPage() {
  const { token = "" } = useParams();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<SharedExpenses | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const result = await getSharedExpensesApi(token, year, month);
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Link non valido");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, year, month]);

  const shiftMonth = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  };

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream px-6 dark:bg-ink">
        <div className="max-w-md rounded-lg border border-line bg-paper p-8 text-center shadow-1 dark:border-[#2a2a2e] dark:bg-[#131316]">
          <Icon name="alert-triangle" className="mx-auto mb-3 h-8 w-8 text-warning" />
          <h1 className="font-display text-[20px] font-bold">Link non disponibile</h1>
          <p className="mt-2 text-[13px] text-muted dark:text-[#9999a0]">
            {error}. Chiedi all'azienda un link aggiornato: quello precedente potrebbe essere stato revocato.
          </p>
        </div>
      </div>
    );
  }

  const rows = data?.rows ?? [];
  const totals = data?.totals;

  return (
    <div className="min-h-screen bg-cream dark:bg-ink">
      <div className="mx-auto w-full max-w-6xl px-6 py-10">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-brand-magenta">
              Rimborsi km e indennità di trasferta
            </span>
            <h1 className="mt-1 font-display text-[28px] font-bold leading-none tracking-tight">
              {data?.company || "Rendicontazione trasferte"}
            </h1>
            {data?.vat && (
              <p className="mt-1.5 text-[13px] text-muted dark:text-[#9999a0]">P.IVA {data.vat}</p>
            )}
          </div>

          <div className="flex items-center gap-1 rounded-md border border-line bg-paper px-1 py-1 dark:border-[#2a2a2e] dark:bg-[#131316]">
            <button
              type="button"
              aria-label="Mese precedente"
              onClick={() => shiftMonth(-1)}
              className="rounded-sm p-2 text-muted transition-colors hover:bg-cream dark:text-[#9999a0] dark:hover:bg-[#1c1c20]"
            >
              <Icon name="chevron-right" className="h-4 w-4 rotate-180" />
            </button>
            <span className="px-2 text-[13px] font-semibold">{data?.label ?? monthLabel(year, month)}</span>
            <button
              type="button"
              aria-label="Mese successivo"
              onClick={() => shiftMonth(1)}
              className="rounded-sm p-2 text-muted transition-colors hover:bg-cream dark:text-[#9999a0] dark:hover:bg-[#1c1c20]"
            >
              <Icon name="chevron-right" className="h-4 w-4" />
            </button>
          </div>
        </header>

        {loading ? (
          <div className="flex justify-center py-20">
            <Spinner size="lg" />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border border-line bg-paper shadow-1 dark:border-[#2a2a2e] dark:bg-[#131316]">
              <table className="w-full min-w-[1080px] border-collapse text-[12px] font-body">
                <thead>
                  <tr className="border-b border-line dark:border-[#2a2a2e]">
                    {[
                      "Data",
                      "Località",
                      "Estero",
                      "Motivazione",
                      "Km",
                      "Quota km",
                      "Indennità km",
                      "Vitto",
                      "Alloggio",
                      "Parcheggi",
                      "Pedaggi",
                      "Ind. trasferta",
                      "Totale",
                      "Collaboratore",
                      "Giustificativi",
                    ].map((label, i) => (
                      <th
                        key={label}
                        className={`whitespace-nowrap px-2.5 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0] ${
                          i >= 4 && i <= 12 ? NUMERIC : "text-left"
                        }`}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={15} className="px-4 py-12 text-center text-muted dark:text-[#9999a0]">
                        Nessuna trasferta approvata in questo mese.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row, index) => (
                      <tr
                        key={`${row.date}-${index}`}
                        className="border-b border-line/60 last:border-0 dark:border-[#2a2a2e]"
                      >
                        <td className="whitespace-nowrap px-2.5 py-2 font-medium">{row.date}</td>
                        <td className="px-2.5 py-2 font-medium">{row.location}</td>
                        <td className="px-2.5 py-2 text-center">{row.abroad ? "SÌ" : ""}</td>
                        <td className="max-w-[240px] px-2.5 py-2">
                          <span className="block truncate" title={row.reason}>
                            {row.reason}
                          </span>
                        </td>
                        <td className={`px-2.5 py-2 ${NUMERIC}`}>{num(row.km)}</td>
                        <td className={`px-2.5 py-2 text-muted dark:text-[#9999a0] ${NUMERIC}`}>
                          {num(row.rate_per_km, 4)}
                        </td>
                        <td className={`px-2.5 py-2 font-semibold ${NUMERIC}`}>{euro(row.km_allowance)}</td>
                        <td className={`px-2.5 py-2 ${NUMERIC}`}>{row.meal ? euro(row.meal) : "—"}</td>
                        <td className={`px-2.5 py-2 ${NUMERIC}`}>{row.lodging ? euro(row.lodging) : "—"}</td>
                        <td className={`px-2.5 py-2 ${NUMERIC}`}>{row.parking ? euro(row.parking) : "—"}</td>
                        <td className={`px-2.5 py-2 ${NUMERIC}`}>{row.tolls ? euro(row.tolls) : "—"}</td>
                        <td className={`px-2.5 py-2 ${NUMERIC}`}>{euro(row.daily_allowance)}</td>
                        <td className={`px-2.5 py-2 font-bold text-brand-magenta ${NUMERIC}`}>{euro(row.total)}</td>
                        <td className="whitespace-nowrap px-2.5 py-2">{row.person}</td>
                        <td className="whitespace-nowrap px-2.5 py-2">
                          {row.receipts.length === 0 ? (
                            <span className="text-muted dark:text-[#9999a0]">—</span>
                          ) : (
                            row.receipts.map((url, i) => (
                              <a
                                key={url}
                                href={url}
                                target="_blank"
                                rel="noopener"
                                className="mr-1.5 inline-flex items-center gap-1 text-brand-magenta hover:underline"
                              >
                                <Icon name="paperclip" className="h-3 w-3" />
                                {row.receipts.length > 1 ? i + 1 : "Apri"}
                              </a>
                            ))
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {rows.length > 0 && totals && (
                  <tfoot>
                    <tr className="border-t-2 border-line bg-cream/60 font-semibold dark:border-[#2a2a2e] dark:bg-[#1c1c20]">
                      <td colSpan={4} className="px-2.5 py-2.5">
                        Totali · {totals.count} {totals.count === 1 ? "trasferta" : "trasferte"}
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
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            <footer className="mt-4 flex flex-wrap items-center gap-3 text-[11px] text-muted dark:text-[#9999a0]">
              <span>
                Sola lettura · solo le trasferte approvate. {data?.aci_source}
              </span>
              <span className="flex-1" />
              {data?.sheet_url && (
                <a
                  href={data.sheet_url}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-1.5 font-semibold text-brand-magenta hover:underline"
                >
                  <Icon name="document-text" className="h-3.5 w-3.5" />
                  Apri il foglio Google
                </a>
              )}
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
