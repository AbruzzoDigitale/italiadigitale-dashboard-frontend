import type { WebsiteScan } from "../../api/websites";
import { Icon } from "../../components/ui/Icon";

/**
 * Lettura dei punteggi e delle metriche PageSpeed di un sito.
 *
 * Le soglie sono quelle ufficiali di Lighthouse e dei Core Web Vitals: verde
 * "buono", ambra "da migliorare", rosso "scarso". Sono le stesse tre fasce che
 * si vedono su PageSpeed Insights, così il confronto è immediato.
 */

type Level = "good" | "average" | "poor" | "none";

const LEVEL_TEXT: Record<Level, string> = {
  good: "text-success",
  average: "text-warning",
  poor: "text-danger",
  none: "text-muted dark:text-[#9999a0]",
};

const LEVEL_CHIP: Record<Level, string> = {
  good: "border-success/25 bg-success/10 text-success",
  average: "border-warning/25 bg-warning/10 text-warning",
  poor: "border-danger/25 bg-danger/10 text-danger",
  none: "border-line bg-cream text-muted dark:border-[#2a2a2e] dark:bg-[#1c1c20] dark:text-[#9999a0]",
};

/** Punteggio Lighthouse 0-100: ≥90 buono, ≥50 da migliorare, sotto scarso. */
function scoreLevel(value: number | null): Level {
  if (value == null) return "none";
  if (value >= 90) return "good";
  if (value >= 50) return "average";
  return "poor";
}

/** Soglie "più basso è meglio" (secondi o millisecondi). */
function thresholdLevel(value: number | null, good: number, average: number): Level {
  if (value == null) return "none";
  if (value <= good) return "good";
  if (value <= average) return "average";
  return "poor";
}

export function ScorePill({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: number | null;
  compact?: boolean;
}) {
  const level = scoreLevel(value);
  return (
    <span
      title={label}
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${LEVEL_CHIP[level]}`}
    >
      {!compact && <span className="opacity-70">{label}</span>}
      {compact && <span className="opacity-70">{label.slice(0, 1)}</span>}
      {value ?? "—"}
    </span>
  );
}

/** Riga compatta dei 4 punteggi di una strategia, per la tabella del registro. */
export function ScoresRow({ scan, compact = true }: { scan: WebsiteScan | null; compact?: boolean }) {
  if (!scan) {
    return <span className="text-[12px] text-muted dark:text-[#9999a0] opacity-60">Mai analizzato</span>;
  }
  if (scan.status !== "ok") {
    return (
      <span
        title={scan.error ?? "Errore durante l'analisi"}
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-danger"
      >
        <Icon name="alert-triangle" className="h-3 w-3" />
        Errore
      </span>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      <ScorePill label="Performance" value={scan.performance_score} compact={compact} />
      <ScorePill label="Accessibilità" value={scan.accessibility_score} compact={compact} />
      <ScorePill label="Best practices" value={scan.best_practices_score} compact={compact} />
      <ScorePill label="SEO" value={scan.seo_score} compact={compact} />
    </div>
  );
}

function Metric({
  label,
  value,
  unit,
  level,
  hint,
}: {
  label: string;
  value: number | null;
  unit: string;
  level: Level;
  hint?: string;
}) {
  return (
    <div className="rounded-md border border-line bg-paper px-2.5 py-2 dark:border-[#2a2a2e] dark:bg-[#131316]">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]" title={hint}>
        {label}
      </p>
      <p className={`text-[14px] font-bold tabular-nums ${LEVEL_TEXT[level]}`}>
        {value == null ? "—" : `${value}${unit}`}
      </p>
    </div>
  );
}

/** Scheda completa di una strategia: punteggi + metriche di laboratorio + CrUX. */
export function ScanDetail({ scan, title }: { scan: WebsiteScan | null; title: string }) {
  if (!scan) {
    return (
      <div className="rounded-md border border-dashed border-line px-3 py-4 text-[12px] text-muted dark:border-[#2a2a2e] dark:text-[#9999a0]">
        {title}: nessuna analisi ancora.
      </div>
    );
  }

  const hasCrux = scan.crux_lcp != null || scan.crux_cls != null || scan.crux_inp != null;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink dark:text-[#f4f4f7]">
          {title}
        </span>
        {scan.run_at && (
          <span className="text-[11px] text-muted dark:text-[#9999a0]">
            {new Date(scan.run_at).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })}
          </span>
        )}
      </div>

      {scan.status !== "ok" ? (
        <div className="rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-[12px] text-danger">
          {scan.error ?? "Errore durante l'analisi"}
        </div>
      ) : (
        <>
          <ScoresRow scan={scan} compact={false} />

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric
              label="FCP"
              value={scan.fcp_s}
              unit=" s"
              level={thresholdLevel(scan.fcp_s, 1.8, 3)}
              hint="First Contentful Paint: quando compare il primo contenuto"
            />
            <Metric
              label="LCP"
              value={scan.lcp_s}
              unit=" s"
              level={thresholdLevel(scan.lcp_s, 2.5, 4)}
              hint="Largest Contentful Paint: quando compare l'elemento principale"
            />
            <Metric
              label="Speed Index"
              value={scan.speed_index_s}
              unit=" s"
              level={thresholdLevel(scan.speed_index_s, 3.4, 5.8)}
              hint="Quanto rapidamente si riempie visivamente la pagina"
            />
            <Metric
              label="CLS"
              value={scan.cls}
              unit=""
              level={thresholdLevel(scan.cls, 0.1, 0.25)}
              hint="Cumulative Layout Shift: quanto ballano gli elementi in caricamento"
            />
            <Metric
              label="TBT"
              value={scan.tbt_ms}
              unit=" ms"
              level={thresholdLevel(scan.tbt_ms, 200, 600)}
              hint="Total Blocking Time: quanto il thread principale resta bloccato"
            />
            <Metric
              label="INP"
              value={scan.inp_ms}
              unit=" ms"
              level={thresholdLevel(scan.inp_ms, 200, 500)}
              hint="Interaction to Next Paint (di laboratorio: spesso non disponibile)"
            />
            <Metric
              label="TTFB"
              value={scan.ttfb_ms}
              unit=" ms"
              level={thresholdLevel(scan.ttfb_ms, 800, 1800)}
              hint="Time To First Byte: risposta del server"
            />
          </div>

          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
              Dati di campo (CrUX)
            </p>
            {hasCrux ? (
              <div className="grid grid-cols-3 gap-2">
                <Metric label="LCP" value={scan.crux_lcp} unit=" s" level={thresholdLevel(scan.crux_lcp, 2.5, 4)} />
                <Metric label="CLS" value={scan.crux_cls} unit="" level={thresholdLevel(scan.crux_cls, 0.1, 0.25)} />
                <Metric label="INP" value={scan.crux_inp} unit=" ms" level={thresholdLevel(scan.crux_inp, 200, 500)} />
              </div>
            ) : (
              <p className="text-[12px] text-muted dark:text-[#9999a0]">
                Non disponibili: servono abbastanza visite reali su Chrome.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
