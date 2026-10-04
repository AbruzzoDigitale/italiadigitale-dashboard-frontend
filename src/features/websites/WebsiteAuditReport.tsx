import { useMemo } from "react";
import {
  SCAN_STATUS_LABELS,
  SEVERITY_DESCRIPTIONS,
  SEVERITY_LABELS,
  scanInCorso,
  scoreClass,
  severityClass,
  severityIcon,
  type AuditFinding,
  type AuditScanDetail,
  type ControlloCatalogo,
} from "../../api/websiteAudits";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { Modal } from "../../components/ui/Modal";
import { useToast } from "../../context/ToastContext";

/**
 * Referto di un giro di controlli tecnici su un sito.
 *
 * L'ordine dei blocchi è l'ordine del lavoro: prima quello che si sistema, poi
 * quello da valutare col cliente, infine quello che è già a posto. Quel terzo
 * blocco non è decorativo: è ciò che permette di dire al cliente «queste cose
 * funzionano» invece di consegnargli solo un elenco di difetti, e impedisce a
 * un collega di rifare un lavoro già fatto.
 *
 * In testa si dichiara **quali controlli hanno girato**. Senza quella riga un
 * referto di sei mesi fa, fatto quando il controllo sui video non esisteva, si
 * leggerebbe come «video a posto».
 */

interface WebsiteAuditReportProps {
  open: boolean;
  onClose: () => void;
  scan: AuditScanDetail | null;
  siteLabel: string;
  siteUrl?: string | null;
  /** Il catalogo, per dare un nome leggibile ai controlli eseguiti. */
  catalogo?: ControlloCatalogo[];
  onRerun?: () => void;
  rerunning?: boolean;
}

const ORDINE: Array<"critical" | "warning" | "info"> = ["critical", "warning", "info"];

export function WebsiteAuditReport({
  open,
  onClose,
  scan,
  siteLabel,
  siteUrl,
  catalogo = [],
  onRerun,
  rerunning = false,
}: WebsiteAuditReportProps) {
  const toast = useToast();

  const gruppi = useMemo(() => {
    const out: Record<string, AuditFinding[]> = { critical: [], warning: [], info: [] };
    (scan?.findings ?? []).forEach((f) => {
      (out[f.severity] ??= []).push(f);
    });
    return out;
  }, [scan]);

  /** Per area: quanti da sistemare, quanti da valutare. È la mappa del lavoro. */
  const aree = useMemo(() => {
    const mappa = new Map<string, { critical: number; warning: number; info: number }>();
    (scan?.findings ?? []).forEach((f) => {
      const voce = mappa.get(f.area) ?? { critical: 0, warning: 0, info: 0 };
      if (f.severity === "critical") voce.critical += 1;
      else if (f.severity === "warning") voce.warning += 1;
      else voce.info += 1;
      mappa.set(f.area, voce);
    });
    // Prima le aree con più problemi: è l'ordine in cui conviene guardarle.
    return [...mappa.entries()].sort(
      (a, b) => b[1].critical - a[1].critical || b[1].warning - a[1].warning
    );
  }, [scan]);

  const eseguiti = useMemo(() => {
    if (!scan) return [];
    const nomi = new Map(catalogo.map((c) => [c.id, c.nome]));
    return scan.checks.map((id) => nomi.get(id) ?? id);
  }, [scan, catalogo]);

  const mancanti = useMemo(() => {
    if (!scan || !catalogo.length) return [];
    const fatti = new Set(scan.checks);
    return catalogo.filter((c) => !fatti.has(c.id));
  }, [scan, catalogo]);

  if (!scan) return null;

  const totale = scan.findings.length;
  const daFare = scan.critical_count + scan.warning_count;

  /** Il referto in testo semplice, pronto da incollare in una mail al cliente. */
  const copiaPerCliente = async () => {
    const righe: string[] = [
      `Controlli tecnici — ${siteUrl || siteLabel}`,
      `Pagine analizzate: ${scan.pages_checked}`,
      scan.score !== null ? `Punteggio: ${scan.score}/100` : "",
      "",
    ].filter(Boolean);
    ORDINE.forEach((sev) => {
      const lista = gruppi[sev] ?? [];
      if (!lista.length) return;
      righe.push(`${SEVERITY_LABELS[sev].toUpperCase()} (${lista.length})`);
      lista.forEach((f) => {
        righe.push(
          `- [${f.area}] ${f.title}${f.pages_count > 1 ? ` — su ${f.pages_count} pagine` : ""}`
        );
        righe.push(`  ${f.detail}`);
        if (f.reference) righe.push(`  Riferimento: ${f.reference}`);
        if (f.action) righe.push(`  Cosa fare: ${f.action}`);
        righe.push("");
      });
    });
    try {
      await navigator.clipboard.writeText(righe.join("\n"));
      toast.success("Referto copiato: puoi incollarlo nella mail al cliente");
    } catch {
      toast.error("Copia non riuscita: il browser l'ha bloccata");
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="2xl"
      icon={<Icon name="tools" className="h-5 w-5" />}
      title={`Controlli tecnici — ${siteLabel}`}
      description={eseguiti.join(" · ")}
      headerActions={
        onRerun ? (
          <Button
            variant="secondary"
            onClick={onRerun}
            loading={rerunning}
            leftIcon={<Icon name="refresh-cw" className="h-3.5 w-3.5" />}
          >
            Ricontrolla
          </Button>
        ) : undefined
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11.5px] text-muted dark:text-[#9999a0]">
            Tutto misurato dall'esterno, al primo accesso e senza cliccare nulla: prova le
            violazioni, non certifica la conformità.
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={copiaPerCliente}
              leftIcon={<Icon name="copy" className="h-3.5 w-3.5" />}
            >
              Copia per il cliente
            </Button>
            <Button variant="primary" onClick={onClose}>
              Chiudi
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {/* ── Intestazione: punteggio, cosa è stato letto, cosa è uscito ──── */}
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-paper px-3 py-2.5 dark:border-[#2a2a2e] dark:bg-[#131316]">
          {scan.score !== null && (
            <span
              title="100 meno quello che non va: ordina i siti su cui intervenire, non è una pagella"
              className={`rounded-full border px-2.5 py-0.5 text-[13px] font-bold ${scoreClass(scan.score)}`}
            >
              {scan.score}/100
            </span>
          )}
          <span className="text-[12px] text-muted dark:text-[#9999a0]">
            {scan.pages_checked} {scan.pages_checked === 1 ? "pagina letta" : "pagine lette"}
            {scan.pages_found > scan.pages_checked ? ` di ${scan.pages_found} trovate` : ""}
          </span>
          <span className="text-[12px] text-muted dark:text-[#9999a0]">·</span>
          <span className="text-[12px] text-muted dark:text-[#9999a0]">
            {SCAN_STATUS_LABELS[scan.status] ?? scan.status}
          </span>
          <div className="ml-auto flex flex-wrap gap-1.5">
            {ORDINE.map((sev) => (
              <span
                key={sev}
                className={`rounded-full border px-2 py-0.5 text-[11.5px] font-semibold ${severityClass(sev)}`}
              >
                {(gruppi[sev] ?? []).length} {SEVERITY_LABELS[sev].toLowerCase()}
              </span>
            ))}
          </div>
        </div>

        {/* ── Le aree, in ordine di urgenza ──────────────────────────────── */}
        {aree.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {aree.map(([area, conti]) => {
              const sev = conti.critical ? "critical" : conti.warning ? "warning" : "info";
              return (
                <span
                  key={area}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11.5px] font-semibold ${severityClass(sev)}`}
                >
                  <Icon name={severityIcon(sev)} className="h-3 w-3" />
                  {area}
                  {conti.critical > 0 && ` · ${conti.critical} da sistemare`}
                  {conti.critical === 0 && conti.warning > 0 && ` · ${conti.warning} da valutare`}
                  {conti.critical === 0 && conti.warning === 0 && " · a posto"}
                </span>
              );
            })}
          </div>
        )}

        {mancanti.length > 0 && !scanInCorso(scan.status) && (
          /* Un referto vecchio non ha i controlli aggiunti dopo: dirlo evita di
             leggere il silenzio su un'area come «quell'area è a posto». */
          <p className="rounded-md border border-line bg-paper px-3 py-2 text-[12px] text-muted dark:border-[#2a2a2e] dark:bg-[#131316] dark:text-[#9999a0]">
            Questo giro non comprendeva: {mancanti.map((c) => c.nome).join(", ")}. Su quelle aree
            il referto non dice niente — né in bene né in male. Un nuovo giro le include.
          </p>
        )}

        {scan.message && (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[12.5px] text-amber-700 dark:text-amber-400">
            {scan.message}
          </p>
        )}

        {scanInCorso(scan.status) ? (
          /* Senza questo ramo un giro a metà si presenterebbe come un sito
             pulito, punteggio compreso: i conteggi sono a zero perché non si sa
             ancora, non perché non ci sia niente. */
          <div className="flex flex-col items-center gap-2 rounded-md border border-line px-4 py-10 text-center dark:border-[#2a2a2e]">
            <Icon name="clock" className="h-8 w-8 text-brand-magenta" />
            <p className="text-sm font-semibold text-ink dark:text-[#f4f4f7]">
              Controlli non ancora conclusi
            </p>
            <p className="max-w-md text-[12.5px] text-muted dark:text-[#9999a0]">
              {scan.status === "pending"
                ? "Sono in coda: li eseguirà il controllo automatico. I rilievi compaiono qui quando ha finito."
                : "Sono in esecuzione adesso. I rilievi compaiono qui quando ha finito."}
            </p>
          </div>
        ) : totale === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-md border border-line px-4 py-10 text-center dark:border-[#2a2a2e]">
            <Icon name="information-circle" className="h-8 w-8 text-muted" />
            <p className="text-sm font-semibold text-ink dark:text-[#f4f4f7]">Nessun esito</p>
            <p className="max-w-md text-[12.5px] text-muted dark:text-[#9999a0]">
              Il giro non ha prodotto rilievi, nemmeno positivi: di solito significa che non è
              riuscito a leggere le pagine. Vale la pena rilanciarlo.
            </p>
          </div>
        ) : (
          <>
            {daFare === 0 && (
              <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5">
                <Icon name="check-circle" className="h-5 w-5 flex-none text-emerald-500" />
                <p className="text-[12.5px] text-emerald-700 dark:text-emerald-400">
                  Nessun rilievo da sistemare sulle pagine lette. Qui sotto resta l'elenco dei
                  controlli passati: è quello che si manda al cliente.
                </p>
              </div>
            )}

            {ORDINE.map((sev) => {
              const lista = gruppi[sev] ?? [];
              if (!lista.length) return null;
              return (
                <section key={sev} className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Icon name={severityIcon(sev)} className="h-4 w-4" />
                    <h3 className="text-[13px] font-semibold text-ink dark:text-[#f4f4f7]">
                      {SEVERITY_LABELS[sev]} ({lista.length})
                    </h3>
                    <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted dark:text-[#9999a0]">
                      {SEVERITY_DESCRIPTIONS[sev]}
                    </span>
                  </div>

                  {lista.map((f) => (
                    <article
                      key={f.id}
                      className={`rounded-md border px-3 py-2.5 ${severityClass(f.severity)}`}
                    >
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="rounded-full bg-ink/10 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider dark:bg-white/10">
                          {f.area}
                        </span>
                        <h4 className="text-[13px] font-semibold text-ink dark:text-[#f4f4f7]">
                          {f.title}
                        </h4>
                        {f.pages_count > 1 && (
                          <span className="rounded-full bg-ink/10 px-2 py-0.5 text-[11px] font-semibold dark:bg-white/10">
                            su {f.pages_count} pagine
                          </span>
                        )}
                        {f.reference && (
                          <span className="ml-auto text-[11px] font-medium opacity-80">
                            {f.reference}
                          </span>
                        )}
                      </div>

                      <p className="mt-1 text-[12.5px] leading-relaxed text-ink/90 dark:text-[#e4e4e7]">
                        {f.detail}
                      </p>

                      {f.excerpt && (
                        <pre className="mt-1.5 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded border border-ink/10 bg-ink/[0.03] px-2 py-1 font-mono text-[11.5px] text-ink/80 dark:border-white/10 dark:bg-white/5 dark:text-[#c4c4c8]">
                          {f.excerpt}
                        </pre>
                      )}

                      {f.action && (
                        <p className="mt-1.5 text-[12.5px] font-medium text-ink dark:text-[#f4f4f7]">
                          → {f.action}
                        </p>
                      )}

                      <a
                        href={f.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-[11.5px] opacity-70 hover:underline"
                      >
                        <Icon name="link" className="h-3 w-3" />
                        <span className="max-w-[28rem] truncate">{f.url}</span>
                      </a>
                    </article>
                  ))}
                </section>
              );
            })}
          </>
        )}
      </div>
    </Modal>
  );
}

/**
 * Riepilogo di un giro su più siti: quali sono peggio, in che ordine guardarli.
 *
 * È il vero esito del bulk. Senza questa schermata l'operatore avrebbe venti
 * referti da aprire uno per uno senza sapere da dove cominciare; qui i siti
 * arrivano ordinati per punteggio crescente, e quelli a posto stanno in fondo
 * dove non rubano attenzione.
 */

export interface AuditBulkRow {
  websiteId: number;
  label: string;
  url: string;
  scan: AuditScanDetail | null;
  error?: string;
}

interface WebsiteAuditBulkSummaryProps {
  open: boolean;
  onClose: () => void;
  rows: AuditBulkRow[];
  onOpenReport: (row: AuditBulkRow) => void;
}

export function WebsiteAuditBulkSummary({
  open,
  onClose,
  rows,
  onOpenReport,
}: WebsiteAuditBulkSummaryProps) {
  const ordinate = useMemo(
    () =>
      [...rows].sort((a, b) => {
        // Prima gli errori: un sito non letto è un buco nel controllo, non un
        // sito a posto. Poi per punteggio crescente.
        if (!!a.error !== !!b.error) return a.error ? -1 : 1;
        const as = a.scan?.score ?? -1;
        const bs = b.scan?.score ?? -1;
        if (as !== bs) return as - bs;
        return a.label.localeCompare(b.label);
      }),
    [rows]
  );

  const daSistemare = ordinate.filter((r) => (r.scan?.critical_count ?? 0) > 0).length;
  const daValutare = ordinate.filter(
    (r) => (r.scan?.critical_count ?? 0) === 0 && (r.scan?.warning_count ?? 0) > 0
  ).length;
  const aPosto = ordinate.filter(
    (r) => !r.error && r.scan && r.scan.critical_count === 0 && r.scan.warning_count === 0
  ).length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="2xl"
      icon={<Icon name="tools" className="h-5 w-5" />}
      title="Quali siti hanno bisogno di lavoro"
      description="Controlli tecnici · dal punteggio più basso"
      footer={
        <div className="flex items-center justify-end">
          <Button variant="primary" onClick={onClose}>
            Chiudi
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <span className={`rounded-full border px-2.5 py-1 text-[12px] font-semibold ${severityClass("critical")}`}>
            {daSistemare} da sistemare
          </span>
          <span className={`rounded-full border px-2.5 py-1 text-[12px] font-semibold ${severityClass("warning")}`}>
            {daValutare} da valutare
          </span>
          <span className={`rounded-full border px-2.5 py-1 text-[12px] font-semibold ${severityClass("info")}`}>
            {aPosto} senza interventi
          </span>
        </div>

        <ul className="flex flex-col gap-1.5">
          {ordinate.map((row) => {
            const critici = row.scan?.critical_count ?? 0;
            const avvisi = row.scan?.warning_count ?? 0;
            const sev = row.error || critici ? "critical" : avvisi ? "warning" : "info";
            return (
              <li key={row.websiteId}>
                <button
                  type="button"
                  disabled={!row.scan}
                  onClick={() => row.scan && onOpenReport(row)}
                  className="flex w-full items-center gap-3 rounded-md border border-line px-3 py-2 text-left transition-colors hover:bg-paper disabled:cursor-default disabled:opacity-60 dark:border-[#2a2a2e] dark:hover:bg-[#131316]"
                >
                  <Icon name={severityIcon(sev)} className="h-4 w-4 flex-none" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-ink dark:text-[#f4f4f7]">
                      {row.label}
                    </span>
                    <span className="block truncate text-[11.5px] text-muted dark:text-[#9999a0]">
                      {row.error ? row.error : `${row.scan?.pages_checked ?? 0} pagine lette`}
                    </span>
                  </span>
                  {!row.error && row.scan?.score !== null && row.scan !== null && (
                    <span
                      className={`flex-none rounded-full border px-2 py-0.5 text-[11.5px] font-bold ${scoreClass(row.scan.score)}`}
                    >
                      {row.scan.score}
                    </span>
                  )}
                  {!row.error && (
                    <span className="flex flex-none gap-1">
                      {critici > 0 && (
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${severityClass("critical")}`}>
                          {critici}
                        </span>
                      )}
                      {avvisi > 0 && (
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${severityClass("warning")}`}>
                          {avvisi}
                        </span>
                      )}
                    </span>
                  )}
                  {row.scan && <Icon name="chevron-right" className="h-4 w-4 flex-none opacity-50" />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </Modal>
  );
}
