import { useEffect, useState } from "react";
import { getMonitorPaceApi, type PaceRow } from "../../api/socialMonitors";
import { SocialIcon } from "../../components/social/SocialIcon";

// Etichette plurali IT per i tipi di contenuto.
const PLURAL: Record<string, string> = {
  post: "post",
  carosello: "caroselli",
  reel: "reel",
  storia: "storie",
};

/** "1 ogni Xg" da un numero di giorni tra pubblicazioni (o "—" se assente). */
function freqLabel(gapDays: number | null): string {
  if (gapDays == null || gapDays <= 0) return "—";
  return `1 ogni ${gapDays % 1 === 0 ? gapDays : gapDays.toFixed(1)}g`;
}

interface Props {
  monitorId: number;
  /** Cambia questo valore per forzare un refetch (es. dopo "analizza subito"). */
  refreshKey?: number | string | null;
  compact?: boolean;
}

/**
 * Indicatore di ritmo pubblicazioni vs PED: per ogni profilo e tipo mostra
 * "pubblicati / attesi finora" con stato ok/indietro. Vuoto (non renderizza)
 * se il monitor non ha il controllo ritmo attivo o non ci sono target.
 */
export function PaceIndicator({ monitorId, refreshKey = 0, compact = false }: Props) {
  const [rows, setRows] = useState<PaceRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMonitorPaceApi(monitorId)
      .then((r) => !cancelled && setRows(r))
      .catch(() => !cancelled && setRows([]));
    return () => {
      cancelled = true;
    };
  }, [monitorId, refreshKey]);

  if (!rows || rows.length === 0) return null;

  // Data d'inizio del conteggio (passaggio "in pubblicazione" del PED).
  const startIso = rows[0]?.window_start ?? null;
  const startLabel = startIso
    ? new Date(startIso).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" })
    : null;

  // Raggruppa per profilo mantenendo l'ordine di arrivo.
  const byProfile: { key: number; name: string; platform: string | null; rows: PaceRow[] }[] = [];
  for (const r of rows) {
    let g = byProfile.find((x) => x.key === r.social_profile_id);
    if (!g) {
      g = { key: r.social_profile_id, name: r.profile_name ?? "", platform: r.platform, rows: [] };
      byProfile.push(g);
    }
    g.rows.push(r);
  }

  return (
    <div className="rounded-lg border border-line p-3 dark:border-[#2a2a2e]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
          Ritmo vs PED
        </p>
        {!compact && (
          <span className="text-right text-[10.5px] text-muted dark:text-[#9999a0]">
            pubblicati / previsti (PED){startLabel ? ` · dal ${startLabel}` : ""}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {byProfile.map((g) => (
          <div key={g.key} className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
              <SocialIcon platform={g.platform ?? ""} className="h-4 w-4 flex-none" />
              <span className="min-w-0 flex-1 truncate text-ink dark:text-[#f4f4f7]">{g.name}</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {g.rows.map((r) => {
                  const plural = PLURAL[r.label] ?? r.label;
                  const cls = r.behind
                    ? "bg-danger/10 text-danger"
                    : "bg-success/10 text-success";
                  return (
                    <span
                      key={r.content_type}
                      title={
                        `${r.actual} pubblicati · ${r.target_per_month} previsti/mese dal PED · ` +
                        `attesi finora ${r.expected} · ` +
                        `attesa ${freqLabel(r.expected_gap_days)}, effettiva ${freqLabel(r.actual_gap_days)}` +
                        (r.behind ? ` · indietro di ${r.deficit} ${plural}` : " · in linea")
                      }
                      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-medium tabular-nums ${cls}`}
                    >
                      <span className="capitalize">{r.label}</span>
                      <span className="font-semibold">
                        {r.actual}/{r.target_per_month}
                      </span>
                      {r.behind && <span>· -{r.deficit}</span>}
                    </span>
                  );
                })}
              </div>
            </div>
            {!compact && (
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 pl-6 text-[10.5px] text-muted dark:text-[#9999a0]">
                {g.rows.map((r) => (
                  <span key={r.content_type} className="tabular-nums">
                    <span className="capitalize">{r.label}</span>: attesa{" "}
                    <span className="text-ink dark:text-[#f4f4f7]">{freqLabel(r.expected_gap_days)}</span>
                    {" · "}effettiva{" "}
                    <span className="text-ink dark:text-[#f4f4f7]">{freqLabel(r.actual_gap_days)}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
