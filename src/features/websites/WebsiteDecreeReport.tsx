import { useMemo } from "react";
import {
  SCAN_STATUS_LABELS,
  SEVERITY_DESCRIPTIONS,
  SEVERITY_LABELS,
  severityClass,
  severityIcon,
  type DecreeFinding,
  type DecreeScanDetail,
} from "../../api/websiteDecrees";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { Modal } from "../../components/ui/Modal";
import { useToast } from "../../context/ToastContext";

/**
 * Referto di una scansione decreti su un sito.
 *
 * L'ordine dei blocchi è l'ordine del lavoro: prima quello che si rimuove e
 * basta, poi quello da chiedere al cliente, infine quello che NON si tocca.
 * Quel terzo blocco è la ragione per cui il referto esiste in questa forma:
 * una lista piatta di occorrenze porterebbe a cancellare a tappeto, e a
 * cancellare anche certificazioni e termini protetti.
 */

interface WebsiteDecreeReportProps {
  open: boolean;
  onClose: () => void;
  scan: DecreeScanDetail | null;
  siteLabel: string;
  siteUrl?: string | null;
  onRerun?: () => void;
  rerunning?: boolean;
}

const ORDINE: Array<"critical" | "warning" | "info"> = ["critical", "warning", "info"];

export function WebsiteDecreeReport({
  open,
  onClose,
  scan,
  siteLabel,
  siteUrl,
  onRerun,
  rerunning = false,
}: WebsiteDecreeReportProps) {
  const toast = useToast();

  const gruppi = useMemo(() => {
    const out: Record<string, DecreeFinding[]> = { critical: [], warning: [], info: [] };
    (scan?.findings ?? []).forEach((f) => {
      (out[f.severity] ??= []).push(f);
    });
    return out;
  }, [scan]);

  if (!scan) return null;

  const totale = scan.findings.length;

  /** Il referto in testo semplice, pronto da incollare in una mail al cliente. */
  const copiaPerCliente = async () => {
    const righe: string[] = [
      `Verifica di conformità — ${scan.decree_nome}`,
      `Sito: ${siteUrl || siteLabel}`,
      `Pagine analizzate: ${scan.pages_checked}`,
      "",
    ];
    ORDINE.forEach((sev) => {
      const lista = gruppi[sev] ?? [];
      if (!lista.length) return;
      righe.push(`${SEVERITY_LABELS[sev].toUpperCase()} (${lista.length})`);
      lista.forEach((f) => {
        righe.push(`- ${f.title}${f.pages_count > 1 ? ` — su ${f.pages_count} pagine` : ""}`);
        righe.push(`  Riferimento: ${f.reference}`);
        righe.push(`  Cosa fare: ${f.action}`);
        if (f.excerpt) righe.push(`  Trovato: «${f.excerpt}»`);
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
      icon={<Icon name="shield" className="h-5 w-5" />}
      title={`Conformità — ${siteLabel}`}
      description={scan.decree_nome}
      headerActions={
        onRerun ? (
          <Button
            variant="secondary"
            onClick={onRerun}
            loading={rerunning}
            leftIcon={<Icon name="refresh-cw" className="h-3.5 w-3.5" />}
          >
            Riscansiona
          </Button>
        ) : undefined
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11.5px] text-muted dark:text-[#9999a0]">
            Legge le pagine pubbliche in ordine di rilevanza, fino al tetto configurato sul
            sito: è un aiuto alla revisione, non un parere legale.
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
        {/* ── Intestazione: cosa è stato letto e cosa è uscito ───────────── */}
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-paper px-3 py-2.5 dark:border-[#2a2a2e] dark:bg-[#131316]">
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

        {scan.message && (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[12.5px] text-amber-700 dark:text-amber-400">
            {scan.message}
          </p>
        )}

        {totale === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-md border border-line px-4 py-10 text-center dark:border-[#2a2a2e]">
            <Icon name="check-circle" className="h-8 w-8 text-emerald-500" />
            <p className="text-sm font-semibold text-ink dark:text-[#f4f4f7]">
              Nessun rilievo sulle pagine lette
            </p>
            <p className="max-w-md text-[12.5px] text-muted dark:text-[#9999a0]">
              Il sito non usa asserzioni ambientali fra quelle che il decreto colpisce. Se il
              cliente comunica anche su volantini, packaging o social, quelli restano da
              controllare a mano.
            </p>
          </div>
        ) : (
          ORDINE.map((sev) => {
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
                      <h4 className="text-[13px] font-semibold text-ink dark:text-[#f4f4f7]">
                        {f.title}
                      </h4>
                      {f.pages_count > 1 && (
                        <span className="rounded-full bg-ink/10 px-2 py-0.5 text-[11px] font-semibold dark:bg-white/10">
                          su {f.pages_count} pagine
                        </span>
                      )}
                      <span className="ml-auto text-[11px] font-medium opacity-80">
                        {f.reference}
                      </span>
                    </div>

                    <p className="mt-1 text-[12.5px] leading-relaxed text-ink/90 dark:text-[#e4e4e7]">
                      {f.detail}
                    </p>

                    {f.excerpt && (
                      <p className="mt-1.5 rounded border border-ink/10 bg-ink/[0.03] px-2 py-1 font-mono text-[11.5px] text-ink/80 dark:border-white/10 dark:bg-white/5 dark:text-[#c4c4c8]">
                        {f.excerpt}
                      </p>
                    )}

                    <p className="mt-1.5 text-[12.5px] font-medium text-ink dark:text-[#f4f4f7]">
                      → {f.action}
                    </p>

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
          })
        )}
      </div>
    </Modal>
  );
}

/**
 * Riepilogo di una scansione su più siti: quali sono a rischio, in che ordine
 * guardarli.
 *
 * È il vero esito del bulk. Senza questa schermata l'operatore avrebbe venti
 * referti da aprire uno per uno senza sapere da dove cominciare; qui i siti
 * arrivano ordinati per gravità, e quelli senza rilievi stanno in fondo dove
 * non rubano attenzione.
 */

export interface DecreeBulkRow {
  websiteId: number;
  label: string;
  url: string;
  scan: DecreeScanDetail | null;
  error?: string;
}

interface WebsiteDecreeBulkSummaryProps {
  open: boolean;
  onClose: () => void;
  decretoNome: string;
  rows: DecreeBulkRow[];
  onOpenReport: (row: DecreeBulkRow) => void;
}

export function WebsiteDecreeBulkSummary({
  open,
  onClose,
  decretoNome,
  rows,
  onOpenReport,
}: WebsiteDecreeBulkSummaryProps) {
  const ordinate = useMemo(
    () =>
      [...rows].sort((a, b) => {
        // Prima gli errori: un sito non letto è un buco nel controllo, non un
        // sito a posto. Poi per gravità decrescente.
        if (!!a.error !== !!b.error) return a.error ? -1 : 1;
        const ac = a.scan?.critical_count ?? 0;
        const bc = b.scan?.critical_count ?? 0;
        if (ac !== bc) return bc - ac;
        const aw = a.scan?.warning_count ?? 0;
        const bw = b.scan?.warning_count ?? 0;
        if (aw !== bw) return bw - aw;
        return a.label.localeCompare(b.label);
      }),
    [rows]
  );

  const aRischio = ordinate.filter((r) => (r.scan?.critical_count ?? 0) > 0).length;
  const daVerificare = ordinate.filter(
    (r) => (r.scan?.critical_count ?? 0) === 0 && (r.scan?.warning_count ?? 0) > 0
  ).length;
  const puliti = ordinate.filter(
    (r) => !r.error && r.scan && r.scan.critical_count === 0 && r.scan.warning_count === 0
  ).length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="2xl"
      icon={<Icon name="shield" className="h-5 w-5" />}
      title="Quali siti sono a rischio"
      description={decretoNome}
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
            {aRischio} da sistemare subito
          </span>
          <span className={`rounded-full border px-2.5 py-1 text-[12px] font-semibold ${severityClass("warning")}`}>
            {daVerificare} da verificare col cliente
          </span>
          <span className={`rounded-full border px-2.5 py-1 text-[12px] font-semibold ${severityClass("info")}`}>
            {puliti} senza rilievi
          </span>
        </div>

        <ul className="flex flex-col gap-1.5">
          {ordinate.map((row) => {
            const critici = row.scan?.critical_count ?? 0;
            const avvisi = row.scan?.warning_count ?? 0;
            const note = row.scan?.info_count ?? 0;
            const sev = row.error ? "critical" : critici ? "critical" : avvisi ? "warning" : "info";
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
                      {row.error
                        ? row.error
                        : `${row.scan?.pages_checked ?? 0} pagine lette`}
                    </span>
                  </span>
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
                      {note > 0 && (
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${severityClass("info")}`}>
                          {note}
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
