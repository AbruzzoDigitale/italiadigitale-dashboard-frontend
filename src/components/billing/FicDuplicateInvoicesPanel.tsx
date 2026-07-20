import { useState } from "react";
import {
  duplicatePreviousMonthInvoicesApi,
  type DuplicateInvoicesResult,
  type DuplicateInvoiceItem,
} from "../../api/ficDuplicateInvoices";
import { useToast } from "../../context/ToastContext";
import { Icon } from "../ui/Icon";
import { Input } from "../ui/Input";
import { Spinner } from "../ui/Spinner";
import "./fic-reconcile.css";

const euro = (n: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n || 0);

const monthLabel = (year: number, month: number) => `${String(month).padStart(2, "0")}/${year}`;

const STATUS_META: Record<DuplicateInvoiceItem["status"], { label: string; cls: string }> = {
  preview: { label: "Da copiare", cls: "text-info" },
  created: { label: "Creata", cls: "text-success" },
  skipped: { label: "Saltata", cls: "text-muted dark:text-muted-dark" },
  error: { label: "Errore", cls: "text-danger" },
};

function ItemsTable({ items }: { items: DuplicateInvoiceItem[] }) {
  if (items.length === 0) {
    return <p className="fr-hint">Nessuna fattura trovata nel mese di origine.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-muted dark:border-line-dark dark:text-muted-dark">
            <th className="px-2 py-1.5">N.</th>
            <th className="px-2 py-1.5">Cliente</th>
            <th className="px-2 py-1.5">Data → nuova</th>
            <th className="px-2 py-1.5">Scadenza</th>
            <th className="px-2 py-1.5 text-right">Importo</th>
            <th className="px-2 py-1.5">Esito</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => {
            const meta = STATUS_META[it.status];
            return (
              <tr key={`${it.number}-${i}`} className="border-b border-line/60 dark:border-line-dark/60">
                <td className="px-2 py-1.5 tabular-nums">{it.number || "—"}</td>
                <td className="px-2 py-1.5">{it.client}</td>
                <td className="px-2 py-1.5 tabular-nums">
                  {it.old_date ?? "—"} <span className="text-muted dark:text-muted-dark">→</span>{" "}
                  {it.status === "created" && it.new_number
                    ? `${it.new_date ?? "—"} (n. ${it.new_number})`
                    : it.new_date ?? "—"}
                </td>
                <td className="px-2 py-1.5 tabular-nums">{it.due_date}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{euro(it.amount)}</td>
                <td className={`px-2 py-1.5 font-semibold ${meta.cls}`} title={it.error ?? undefined}>
                  {meta.label}
                  {it.error ? <span className="ml-1 font-normal">· {it.error}</span> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function FicDuplicateInvoicesPanel() {
  const toast = useToast();
  // Mese di origine (input type=month → "YYYY-MM"); vuoto = mese precedente.
  const [sourceMonthInput, setSourceMonthInput] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [excludeInput, setExcludeInput] = useState("");
  const [onlyFirstN, setOnlyFirstN] = useState("0");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DuplicateInvoicesResult | null>(null);

  const parseSourceMonth = (): { sourceYear: number | null; sourceMonth: number | null } => {
    const m = sourceMonthInput.trim();
    if (!/^\d{4}-\d{2}$/.test(m)) return { sourceYear: null, sourceMonth: null };
    const [y, mm] = m.split("-").map(Number);
    return { sourceYear: y, sourceMonth: mm };
  };

  const parseExclude = (): string[] =>
    excludeInput
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);

  const run = async (dryRun: boolean) => {
    if (!dryRun) {
      const ok = window.confirm(
        "Verranno CREATE le copie delle fatture su Fatture in Cloud (non inviate allo SDI). Procedere?",
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      const { sourceYear, sourceMonth } = parseSourceMonth();
      const res = await duplicatePreviousMonthInvoicesApi({
        sourceYear,
        sourceMonth,
        dueDate: dueDate.trim() || null,
        excludeNumbers: parseExclude(),
        onlyFirstN: Math.max(0, Number(onlyFirstN) || 0),
        dryRun,
      });
      setResult(res);
      if (dryRun) {
        toast.success(`Anteprima: ${res.found} fatture nel mese di origine`);
      } else if (res.errors > 0) {
        toast.error(`Create ${res.created}, errori ${res.errors}`);
      } else {
        toast.success(`Copie create: ${res.created} · saltate ${res.skipped}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nella duplicazione");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fr-panel">
      <div className="fr-form">
        <div className="fr-field">
          <label className="fr-label">Mese di origine</label>
          <Input
            type="month"
            value={sourceMonthInput}
            onChange={(e) => setSourceMonthInput(e.target.value)}
            title="Vuoto = mese precedente rispetto ad oggi"
          />
        </div>
        <div className="fr-field">
          <label className="fr-label">Scadenza copie</label>
          <Input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            title="Vuoto = giorno 20 del mese di destinazione"
          />
        </div>
        <div className="fr-field fr-field-grow">
          <label className="fr-label">Numeri da escludere</label>
          <input
            className="rounded-md border border-line bg-paper px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-ink dark:border-line-dark dark:bg-ink-soft dark:text-paper dark:focus:border-paper"
            value={excludeInput}
            onChange={(e) => setExcludeInput(e.target.value)}
            placeholder="es. 149, 150, 151"
          />
        </div>
        <div className="fr-field" style={{ maxWidth: 120 }}>
          <label className="fr-label">Solo prime N (test)</label>
          <input
            type="number"
            min={0}
            className="rounded-md border border-line bg-paper px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-ink dark:border-line-dark dark:bg-ink-soft dark:text-paper dark:focus:border-paper"
            value={onlyFirstN}
            onChange={(e) => setOnlyFirstN(e.target.value)}
            title="0 = tutte; 1 = solo la prima non esclusa (per test)"
          />
        </div>
        <div className="fr-actions">
          <button className="fr-btn" onClick={() => void run(true)} disabled={busy}>
            {busy ? <Spinner size="sm" /> : <Icon name="eye" className="h-4 w-4" />}
            Anteprima
          </button>
          <button className="fr-btn fr-btn-primary" onClick={() => void run(false)} disabled={busy}>
            {busy ? <Spinner size="sm" /> : <Icon name="copy" className="h-4 w-4" />}
            Crea copie
          </button>
        </div>
      </div>

      <p className="fr-hint">
        Duplica le fatture emesse del mese precedente creando delle copie nel mese successivo su Fatture in Cloud,
        <b> senza inviarle allo SDI</b> (restano tra le fatture da inviare). Il token FIC è quello configurato per
        l'azienda. Fai prima l'<b>Anteprima</b>: non crea nulla e ti mostra cosa verrebbe copiato.
      </p>

      {result && (
        <div className="fr-result">
          <div className="fr-result-head">
            <span className="fr-stat">
              {monthLabel(result.source_month, result.source_year)} → {monthLabel(result.dest_month, result.dest_year)}
            </span>
            <span className="fr-stat">Trovate <b>{result.found}</b></span>
            {result.dry_run ? (
              <span className="fr-stat fr-stat-ok">Anteprima (non creato nulla)</span>
            ) : (
              <>
                <span className="fr-stat fr-stat-ok">Create <b>{result.created}</b></span>
                <span className="fr-stat">Saltate <b>{result.skipped}</b></span>
                {result.errors > 0 ? <span className="fr-stat fr-stat-nessuno">Errori <b>{result.errors}</b></span> : null}
              </>
            )}
            <span className="fr-stat">Scadenza <b>{result.due_date}</b></span>
          </div>
          <ItemsTable items={result.items} />
        </div>
      )}
    </div>
  );
}
