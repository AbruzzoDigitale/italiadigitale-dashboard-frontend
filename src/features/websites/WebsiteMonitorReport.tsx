import { useCallback, useEffect, useState } from "react";
import {
  CHANGE_LABELS,
  CRAWL_STATUS_LABELS,
  seoBandClass,
  statusClass,
} from "../../api/websiteCrawls";
import {
  downloadReportCsv,
  targetReportApi,
  type MonitorReport,
  type MonitorTarget,
  type WebsiteMonitor,
} from "../../api/websiteMonitors";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { Input } from "../../components/ui/Input";
import { SegmentedSwitch } from "../../components/ui/SegmentedSwitch";
import { useToast } from "../../context/ToastContext";

/**
 * Report esteso di un sito monitorato: tutto quello che il giro ha visto,
 * pagina per pagina e codice per codice, più il confronto col giro precedente
 * e lo storico delle esecuzioni.
 */

interface WebsiteMonitorReportProps {
  monitor: WebsiteMonitor;
  target: MonitorTarget;
  running: boolean;
  onRun: () => void;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "mai";
  return new Date(value).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Colore della pastiglia di un codice HTTP raggruppato. */
function codeClass(code: string): string {
  if (code === "errore") return "bg-danger/10 text-danger";
  const n = Number(code);
  if (!Number.isFinite(n)) return "bg-muted/10 text-muted dark:text-[#9999a0]";
  if (n >= 400) return "bg-danger/10 text-danger";
  if (n >= 300) return "bg-warning/10 text-[#b07d00] dark:text-warning";
  return "bg-success/10 text-success";
}

export function WebsiteMonitorReport({ monitor, target, running, onRun }: WebsiteMonitorReportProps) {
  const toast = useToast();
  const [report, setReport] = useState<MonitorReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [crawlId, setCrawlId] = useState<number | undefined>(undefined);
  const [view, setView] = useState<"pagine" | "variazioni" | "storico">("pagine");
  const [filter, setFilter] = useState("");
  const [codeFilter, setCodeFilter] = useState<string | null>(null);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReport(await targetReportApi(target.id, crawlId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Report non disponibile");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [target.id, crawlId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const esporta = async () => {
    setExporting(true);
    try {
      await downloadReportCsv(target.id, crawlId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export non riuscito");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return <div className="sp-skeleton h-72 rounded-xl border border-line dark:border-[#2a2a2e]" />;
  }

  if (!report || !report.crawl) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-md border border-dashed border-line px-4 py-8 dark:border-[#2a2a2e]">
        <p className="text-[13px] text-muted dark:text-[#9999a0]">
          Questo sito non è ancora stato analizzato da questo monitoraggio.
        </p>
        <Button onClick={onRun} loading={running} leftIcon={<Icon name="refresh-cw" className="h-3.5 w-3.5" />}>
          Analizza adesso
        </Button>
      </div>
    );
  }

  const { crawl, totals, pages, changes, history } = report;

  const pagineFiltrate = pages.filter((p) => {
    if (codeFilter) {
      const chiave = p.error ? "errore" : String(p.http_status ?? "—");
      if (chiave !== codeFilter) return false;
    }
    if (onlyProblems) {
      const problematica =
        !!p.error || (p.http_status ?? 0) >= 400 || !!p.redirect_to || p.seo_issues.length > 0;
      if (!problematica) return false;
    }
    const q = filter.trim().toLowerCase();
    if (q && !`${p.path ?? ""} ${p.title ?? ""} ${p.url}`.toLowerCase().includes(q)) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-4">
      {/* ── Testata ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            className="mb-0.5 truncate font-display font-bold tracking-tight text-ink dark:text-[#f4f4f7]"
            style={{ fontSize: "17px" }}
          >
            {target.website_name}
          </h2>
          <p className="text-[12px] text-muted dark:text-[#9999a0]">
            <a
              href={target.website_url}
              target="_blank"
              rel="noreferrer"
              className="hover:underline"
            >
              {target.website_domain ?? target.website_url.replace(/^https?:\/\/(www\.)?/, "")}
            </a>
            {" · "}
            {CRAWL_STATUS_LABELS[crawl.status]}
            {" · "}
            {formatDateTime(crawl.started_at)}
            {crawl.discovery && ` · da ${crawl.discovery}`}
          </p>
        </div>
        <div className="flex flex-none items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => void esporta()}
            loading={exporting}
            leftIcon={<Icon name="download" className="h-3.5 w-3.5" />}
          >
            CSV
          </Button>
          <Button
            onClick={onRun}
            loading={running}
            leftIcon={<Icon name="refresh-cw" className="h-3.5 w-3.5" />}
          >
            Analizza
          </Button>
        </div>
      </div>

      {target.is_alerting && target.alert_reason && (
        <div className="flex items-start gap-2 rounded-md border border-danger/25 bg-danger/5 px-3 py-2">
          <Icon name="alert-triangle" className="mt-0.5 h-4 w-4 flex-none text-danger" />
          <p className="text-[12.5px] text-danger">{target.alert_reason}</p>
        </div>
      )}

      {crawl.message && (
        <p className="rounded-md border border-warning/25 bg-warning/5 px-3 py-2 text-[12.5px] text-[#b07d00] dark:text-warning">
          {crawl.message}
        </p>
      )}

      {/* ── I numeri del giro ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Pagine", value: crawl.pages_checked, tone: "" },
          { label: "A posto", value: totals.pages_ok, tone: "text-success" },
          { label: "Redirect", value: totals.pages_redirect, tone: totals.pages_redirect ? "text-[#b07d00] dark:text-warning" : "" },
          { label: "In errore", value: totals.pages_error, tone: totals.pages_error ? "text-danger" : "" },
          { label: "SEO medio", value: crawl.avg_seo_score ?? "—", tone: "" },
          { label: "Risposta", value: totals.avg_response_ms != null ? `${totals.avg_response_ms} ms` : "—", tone: "" },
        ].map((k) => (
          <div
            key={k.label}
            className="rounded-md border border-line bg-cream px-3 py-2 dark:border-[#2a2a2e] dark:bg-[#1c1c20]"
          >
            <p className="text-[9.5px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
              {k.label}
            </p>
            <p className={`text-[17px] font-bold tabular-nums text-ink dark:text-[#f4f4f7] ${k.tone}`}>
              {k.value}
            </p>
          </div>
        ))}
      </div>

      {/* ── Codici, cliccabili come filtro ──────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
          Codici
        </span>
        {Object.entries(totals.by_status)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([code, n]) => (
            <button
              key={code}
              type="button"
              onClick={() => {
                setCodeFilter(codeFilter === code ? null : code);
                setView("pagine");
              }}
              title={`Mostra solo le pagine con esito ${code}`}
              className={`rounded-pill px-2 py-0.5 text-[11px] font-semibold tabular-nums transition-opacity ${codeClass(code)} ${
                codeFilter && codeFilter !== code ? "opacity-40" : ""
              }`}
            >
              {code} · {n}
            </button>
          ))}
        {totals.pages_noindex > 0 && (
          <span className="rounded-pill bg-danger/10 px-2 py-0.5 text-[11px] font-semibold text-danger">
            noindex · {totals.pages_noindex}
          </span>
        )}
        {crawl.broken_links_count > 0 && (
          <span className="rounded-pill bg-danger/10 px-2 py-0.5 text-[11px] font-semibold text-danger">
            link rotti · {crawl.broken_links_count}
          </span>
        )}
        <span className="ml-auto text-[11px] text-muted dark:text-[#9999a0]">
          {formatBytes(totals.total_bytes)} scaricati
        </span>
      </div>

      {/* ── Viste ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedSwitch
          value={view}
          onChange={(v) => setView(v as typeof view)}
          ariaLabel="Vista report"
          options={[
            { value: "pagine", label: <>Pagine ({pages.length})</> },
            { value: "variazioni", label: <>Variazioni ({changes.length})</> },
            { value: "storico", label: <>Storico ({history.length})</> },
          ]}
        />
        {view === "pagine" && (
          <>
            <div className="relative min-w-[180px] flex-1">
              <Icon name="search" className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filtra per percorso o titolo..."
                className="pl-9"
              />
            </div>
            <button
              type="button"
              onClick={() => setOnlyProblems((v) => !v)}
              className={`rounded-md border px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                onlyProblems
                  ? "border-brand-magenta bg-brand-magenta/10 text-brand-magenta"
                  : "border-line text-muted hover:bg-cream dark:border-[#2a2a2e] dark:hover:bg-[#1c1c20]"
              }`}
            >
              Solo problemi
            </button>
            {codeFilter && (
              <button
                type="button"
                onClick={() => setCodeFilter(null)}
                className="rounded-md border border-line px-2.5 py-1.5 text-[11px] text-muted hover:bg-cream dark:border-[#2a2a2e]"
              >
                ✕ filtro {codeFilter}
              </button>
            )}
          </>
        )}
      </div>

      {/* ── Pagine, codice per codice ───────────────────────────────────── */}
      {view === "pagine" && (
        <div className="overflow-x-auto rounded-md border border-line dark:border-[#2a2a2e]">
          <table className="w-full min-w-[860px] text-left text-[12px]">
            <thead className="bg-cream dark:bg-[#1c1c20]">
              <tr className="text-[9.5px] uppercase tracking-wider text-muted dark:text-[#9999a0]">
                <th className="px-3 py-2 font-semibold">Pagina</th>
                <th className="px-2 py-2 font-semibold">Codice</th>
                <th className="px-2 py-2 font-semibold">SEO</th>
                <th className="px-2 py-2 font-semibold">Tempo</th>
                <th className="px-2 py-2 font-semibold">Peso</th>
                <th className="px-2 py-2 font-semibold">Parole</th>
                <th className="px-2 py-2 font-semibold">Alt</th>
                <th className="px-3 py-2 font-semibold">Problemi</th>
              </tr>
            </thead>
            <tbody>
              {pagineFiltrate.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-muted dark:text-[#9999a0]">
                    Nessuna pagina con questi filtri.
                  </td>
                </tr>
              ) : (
                pagineFiltrate.map((p) => (
                  <tr
                    key={p.id}
                    className="border-t border-line/60 align-top dark:border-[#2a2a2e]"
                  >
                    <td className="max-w-[300px] px-3 py-2">
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noreferrer"
                        title={p.url}
                        className="block truncate font-mono text-[11.5px] text-ink hover:underline dark:text-[#f4f4f7]"
                      >
                        {p.path || "/"}
                      </a>
                      {p.title && (
                        <span className="block truncate text-[11px] text-muted dark:text-[#9999a0]">
                          {p.title}
                        </span>
                      )}
                      {p.redirect_to && (
                        <span className="block truncate text-[10.5px] text-[#b07d00] dark:text-warning">
                          → {p.redirect_to.replace(/^https?:\/\/(www\.)?/, "")}
                        </span>
                      )}
                      {p.is_noindex && (
                        <span className="mt-0.5 inline-block rounded-pill bg-danger/10 px-1.5 text-[9.5px] font-semibold uppercase text-danger">
                          noindex
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums ${statusClass(p.http_status, p.error)}`}
                      >
                        {p.error ? "errore" : (p.http_status ?? "—")}
                      </span>
                    </td>
                    <td className={`px-2 py-2 font-semibold tabular-nums ${seoBandClass(p.seo_band)}`}>
                      {p.seo_score ?? "—"}
                    </td>
                    <td className="px-2 py-2 tabular-nums text-muted dark:text-[#9999a0]">
                      {p.response_ms != null ? `${p.response_ms} ms` : "—"}
                    </td>
                    <td className="px-2 py-2 tabular-nums text-muted dark:text-[#9999a0]">
                      {p.size_bytes ? formatBytes(p.size_bytes) : "—"}
                    </td>
                    <td className="px-2 py-2 tabular-nums text-muted dark:text-[#9999a0]">
                      {p.word_count || "—"}
                    </td>
                    <td className="px-2 py-2 tabular-nums text-muted dark:text-[#9999a0]">
                      {p.images_total ? `${p.images_total - p.images_without_alt}/${p.images_total}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-muted dark:text-[#9999a0]">
                      {p.error ? (
                        <span className="text-danger">{p.error}</span>
                      ) : p.seo_issues.length === 0 ? (
                        "—"
                      ) : (
                        <button
                          type="button"
                          onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                          className="text-left hover:underline"
                        >
                          {expanded === p.id ? (
                            <span className="flex flex-col gap-0.5">
                              {p.seo_issues.map((issue, i) => (
                                <span key={i}>· {issue}</span>
                              ))}
                            </span>
                          ) : (
                            `${p.seo_issues.length} da sistemare`
                          )}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Variazioni ──────────────────────────────────────────────────── */}
      {view === "variazioni" && (
        changes.length === 0 ? (
          <p className="rounded-md border border-dashed border-line px-4 py-6 text-[12.5px] text-muted dark:border-[#2a2a2e] dark:text-[#9999a0]">
            Niente di cambiato dalla scansione precedente.
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {changes.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center gap-2 rounded border border-line bg-cream px-2.5 py-2 text-[12px] dark:border-[#2a2a2e] dark:bg-[#1c1c20]"
              >
                <span
                  className={`rounded-pill px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider ${
                    c.severity === "critical"
                      ? "bg-danger/10 text-danger"
                      : c.severity === "warning"
                        ? "bg-warning/10 text-[#b07d00] dark:text-warning"
                        : "bg-muted/10 text-muted dark:text-[#9999a0]"
                  }`}
                >
                  {CHANGE_LABELS[c.change_type]}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-ink dark:text-[#f4f4f7]">
                  {c.path ?? c.url ?? "—"}
                </span>
                {c.from_value && (
                  <span className="truncate text-[11px] text-muted line-through dark:text-[#9999a0]">
                    {c.from_value.slice(0, 40)}
                  </span>
                )}
                {c.to_value && (
                  <span className="truncate text-[11px] text-ink dark:text-[#f4f4f7]">
                    → {c.to_value.slice(0, 40)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )
      )}

      {/* ── Storico ─────────────────────────────────────────────────────── */}
      {view === "storico" && (
        <div className="flex flex-col gap-1">
          {history.map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => setCrawlId(h.id === crawl.id ? undefined : h.id)}
              className={`flex flex-wrap items-center gap-3 rounded border px-2.5 py-2 text-left text-[12px] transition-colors ${
                h.id === crawl.id
                  ? "border-brand-magenta bg-brand-magenta/5"
                  : "border-line bg-cream hover:border-brand-magenta/40 dark:border-[#2a2a2e] dark:bg-[#1c1c20]"
              }`}
            >
              <span className="w-32 flex-none tabular-nums text-ink dark:text-[#f4f4f7]">
                {formatDateTime(h.started_at)}
              </span>
              <span className="text-muted dark:text-[#9999a0]">{CRAWL_STATUS_LABELS[h.status]}</span>
              <span className="tabular-nums text-muted dark:text-[#9999a0]">{h.pages_checked} pagine</span>
              {h.errors_count > 0 && (
                <span className="tabular-nums text-danger">{h.errors_count} errori</span>
              )}
              <span className="tabular-nums text-muted dark:text-[#9999a0]">SEO {h.avg_seo_score ?? "—"}</span>
              {h.changes_count > 0 && (
                <span className="ml-auto tabular-nums text-muted dark:text-[#9999a0]">
                  {h.changes_count} variazioni
                  {h.critical_changes > 0 && <span className="text-danger"> ({h.critical_changes} gravi)</span>}
                </span>
              )}
              <span className="text-[10.5px] text-muted dark:text-[#9999a0]">
                {h.trigger === "cron" ? "automatica" : "manuale"}
              </span>
            </button>
          ))}
        </div>
      )}

      <p className="text-[11px] text-muted dark:text-[#9999a0]">
        Monitoraggio «{monitor.name}» · prossimo giro {formatDateTime(monitor.next_run_at)}
      </p>
    </div>
  );
}
