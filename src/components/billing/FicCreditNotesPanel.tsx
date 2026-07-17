import { useEffect, useState } from "react";
import {
  getCreditNoteCheckApi,
  listCreditNoteChecksApi,
  runCreditNoteCheckApi,
  type CreditNoteCheck,
  type CreditNoteLine,
} from "../../api/ficCreditNotes";
import { useToast } from "../../context/ToastContext";
import { Icon } from "../ui/Icon";
import { Spinner } from "../ui/Spinner";
import "./fic-reconcile.css";

const euro = (n: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);

function dateIt(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

function LinkBadge({ line }: { line: CreditNoteLine }) {
  if (line.collegata) {
    return (
      <span className="fr-badge fr-badge-ok">
        collegata a Ft {line.invoice_number}
        {line.invoice_date ? ` del ${dateIt(line.invoice_date)}` : ""}
      </span>
    );
  }
  return <span className="fr-badge fr-badge-nessuno">nessun collegamento</span>;
}

function LinesTable({ lines }: { lines: CreditNoteLine[] }) {
  if (!lines.length) return <div className="fr-empty">Nessuna nota di credito trovata negli anni indicati.</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-muted dark:text-muted-dark">
            <th className="px-2 py-2">Nota di credito</th>
            <th className="px-2 py-2">Data</th>
            <th className="px-2 py-2">Cliente</th>
            <th className="px-2 py-2 text-right">Importo</th>
            <th className="px-2 py-2">Collegamento</th>
            <th className="px-2 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id} className={line.collegata ? "fr-row-ok" : "fr-row-nessuno"}>
              <td className="px-2 py-1.5 font-semibold">{line.numero ?? "—"}</td>
              <td className="px-2 py-1.5">{dateIt(line.data)}</td>
              <td className="px-2 py-1.5">{line.cliente ?? "—"}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{euro(line.importo)}</td>
              <td className="px-2 py-1.5"><LinkBadge line={line} /></td>
              <td className="px-2 py-1.5">
                {line.fic_document_url && (
                  <a className="fr-link" href={line.fic_document_url} target="_blank" rel="noreferrer">
                    Apri su FIC
                  </a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FicCreditNotesPanel() {
  const toast = useToast();
  const [anni, setAnni] = useState("");
  const [busy, setBusy] = useState(false);
  const [check, setCheck] = useState<CreditNoteCheck | null>(null);
  const [history, setHistory] = useState<CreditNoteCheck[]>([]);

  const reloadHistory = () => {
    listCreditNoteChecksApi()
      .then((r) => setHistory(r.runs))
      .catch(() => setHistory([]));
  };

  useEffect(() => {
    reloadHistory();
  }, []);

  const onRun = async () => {
    setBusy(true);
    try {
      const result = await runCreditNoteCheckApi({ anni: anni.trim() || undefined });
      setCheck(result);
      reloadHistory();
      const ko = result.note_scollegate;
      if (ko > 0) toast.error(`${ko} note di credito senza collegamento alla fattura`);
      else toast.success(`Verifica completata: ${result.note_totali} note, tutte collegate`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nella verifica");
    } finally {
      setBusy(false);
    }
  };

  const openRun = async (id: number) => {
    setBusy(true);
    try {
      setCheck(await getCreditNoteCheckApi(id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nel caricamento");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fr-panel">
      <div className="fr-form">
        <div className="fr-field fr-field-grow">
          <label className="fr-label">Anni da verificare</label>
          <input
            className="rounded-md border border-line bg-paper px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-ink dark:border-line-dark dark:bg-ink-soft dark:text-paper dark:focus:border-paper"
            value={anni}
            onChange={(e) => setAnni(e.target.value)}
            placeholder="Predefinito: anno corrente e precedente (es. 2025,2026)"
          />
        </div>
        <div className="fr-actions">
          <button className="fr-btn fr-btn-primary" onClick={onRun} disabled={busy}>
            {busy ? <Spinner size="sm" /> : <Icon name="refresh-cw" className="h-4 w-4" />}
            Verifica note di credito
          </button>
        </div>
      </div>

      <p className="fr-hint">
        Sola lettura: elenca le note di credito emesse su Fatture in Cloud e segnala quali NON risultano collegate
        alla fattura che stornano. Non modifica nulla su FIC.
      </p>

      {check && (
        <div className="fr-result">
          <div className="fr-result-head">
            <span className="fr-stat">Totali <b>{check.note_totali}</b></span>
            <span className="fr-stat fr-stat-ok">Collegate <b>{check.note_collegate}</b></span>
            <span className="fr-stat fr-stat-nessuno">Senza collegamento <b>{check.note_scollegate}</b></span>
          </div>
          <LinesTable lines={check.lines ?? []} />
        </div>
      )}

      {history.length > 0 && (
        <div className="fr-history">
          <div className="fr-history-label">Verifiche recenti</div>
          <div className="fr-history-list">
            {history.map((h) => (
              <button key={h.id} className="fr-history-item" onClick={() => openRun(h.id)}>
                <span className="fr-hi-meta">
                  {dateIt(h.created_at)} · anni {h.anni ?? "—"}
                </span>
                <span className="fr-hi-file">
                  {h.note_totali} note · {h.note_scollegate} senza collegamento
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
