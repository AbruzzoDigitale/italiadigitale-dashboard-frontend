import { useCallback, useEffect, useMemo, useState } from "react";
import "./fatturazione-page.css";
import { Icon } from "../components/ui/Icon";
import { Spinner } from "../components/ui/Spinner";
import { useToast } from "../context/ToastContext";
import {
  listBillingItemsApi,
  generateBillingItemApi,
  cancelBillingItemApi,
  billingItemKey,
  type BillingItem,
  type BillingItemsResponse,
  type BillingType,
} from "../api/billing";
import { FicReconcilePanel } from "../components/billing/FicReconcilePanel";
import { FicCreditNotesPanel } from "../components/billing/FicCreditNotesPanel";
import { FicDuplicateInvoicesPanel } from "../components/billing/FicDuplicateInvoicesPanel";

// ─────────────────────────────────────────────────────────────────────────────
// Fatturazione — dati REALI.
// Le voci "da fatturare" sono derivate lato backend dalle lavorazioni completate
// collegate a un contratto (GET /billing/items); lo stato "fatturato" è persistito
// (POST /billing/generate|cancel). Vedi app/services/billing.py.
// Nota: il push reale su Fatture in Cloud è predisposto ma disattivato lato server
// finché non viene abilitato deliberatamente — "Genera" registra la voce con un
// numero placeholder locale.
// ─────────────────────────────────────────────────────────────────────────────

const FB_TYPES: Record<BillingType, { label: string; cls: string }> = {
  canone: { label: "Canone", cls: "canone" },
  una_tantum: { label: "Una tantum", cls: "tantum" },
};

const MONTHS_IT = [
  "",
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

const beuro = (n: number) =>
  n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const agingTone = (d: number) => (d >= 60 ? "grave" : d >= 30 ? "warn" : "soft");
const initials = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  return `${MONTHS_IT[Number(m)] ?? ""} ${y}`.trim();
}

function TypeBadge({ type }: { type: BillingType }) {
  const t = FB_TYPES[type];
  return <span className={"fb-type " + t.cls}>{t.label}</span>;
}

function InvoiceRow({
  it,
  busy,
  onGenerate,
  onCancel,
}: {
  it: BillingItem;
  busy: boolean;
  onGenerate: (it: BillingItem) => void;
  onCancel: (it: BillingItem) => void;
}) {
  const done = it.state === "fatturato";
  return (
    <div className={"fb-row" + (done ? " is-done" : "")}>
      <div className="fb-row-main">
        <div className="fb-row-title">
          {it.title} <TypeBadge type={it.type} />
          {it.work_item_id == null && <span className="fb-type plan">Tranche piano</span>}
        </div>
        <div className="fb-row-source">
          <Icon name="document-text" className="h-3 w-3" /> {it.source ?? "—"}
          {it.month_label && (
            <span className="fb-month">
              <Icon name="calendar" className="h-3 w-3" /> {it.month_label}
            </span>
          )}
        </div>
      </div>
      <div className="fb-row-right">
        <div className="fb-amount-wrap">
          <div className="fb-amount">{beuro(it.amount)}</div>
          <span className={"fb-state " + (done ? "done" : "todo")}>
            {done ? "Fatturato" : "Da fatturare"}
          </span>
        </div>
        {done ? (
          <div className="fb-done-actions">
            <span className="fb-invoice">
              <Icon name="credit-card" className="h-3.5 w-3.5" /> {it.invoice_number ?? it.fic_id ?? "—"}
            </span>
            <button className="fb-cancel" disabled={busy} onClick={() => onCancel(it)}>
              Annulla
            </button>
          </div>
        ) : (
          <button className="fb-generate" disabled={busy} onClick={() => onGenerate(it)}>
            <Icon name="upload" className="h-3.5 w-3.5" /> Genera fattura su FIC
          </button>
        )}
      </div>
    </div>
  );
}

function ClientGroup({
  client,
  items,
  busyIds,
  onGenerate,
  onCancel,
}: {
  client: string;
  items: BillingItem[];
  busyIds: Set<string>;
  onGenerate: (it: BillingItem) => void;
  onCancel: (it: BillingItem) => void;
}) {
  const todo = items.filter((i) => i.state === "da_fatturare");
  const todoTot = todo.reduce((s, i) => s + i.amount, 0);
  return (
    <div className="fb-group">
      <div className="fb-group-head">
        <div className="fb-group-id">
          <span className="fb-group-av">{initials(client)}</span>
          <span className="fb-group-name">{client}</span>
        </div>
        <div className="fb-group-tot">
          {todo.length > 0 ? (
            <>
              <b>{todo.length} da fatturare</b> · {beuro(todoTot)}
            </>
          ) : (
            <span className="fb-group-clear">
              <Icon name="check" className="h-3.5 w-3.5" /> Tutto fatturato
            </span>
          )}
        </div>
      </div>
      <div className="fb-group-body">
        {items.map((it) => (
          <InvoiceRow
            key={billingItemKey(it)}
            it={it}
            busy={busyIds.has(billingItemKey(it))}
            onGenerate={onGenerate}
            onCancel={onCancel}
          />
        ))}
      </div>
    </div>
  );
}

function ForgottenRow({
  it,
  busy,
  onGenerate,
}: {
  it: BillingItem;
  busy: boolean;
  onGenerate: (it: BillingItem) => void;
}) {
  const tone = agingTone(it.aging_days ?? 0);
  return (
    <div className={"fb-forgot-row tone-" + tone}>
      <div className="fb-forgot-aging">
        <span className="fb-aging-n">{it.aging_days ?? "—"}</span>
        <span className="fb-aging-u">giorni</span>
      </div>
      <div className="fb-forgot-main">
        <div className="fb-row-title">
          {it.title} <TypeBadge type={it.type} />
        </div>
        <div className="fb-row-source">
          <Icon name="building" className="h-3 w-3" /> {it.client_name}
          {it.month_label && (
            <>
              {" "}· <Icon name="calendar" className="h-3 w-3" /> {it.month_label}
            </>
          )}
          {it.completed_at && <> · completata {it.completed_at}</>}
        </div>
      </div>
      <div className="fb-row-right">
        <div className="fb-amount-wrap">
          <div className="fb-amount">{beuro(it.amount)}</div>
          <span className={"fb-aging-tag tone-" + tone}>Mai emessa</span>
        </div>
        <button className="fb-generate urgent" disabled={busy} onClick={() => onGenerate(it)}>
          <Icon name="upload" className="h-3.5 w-3.5" /> Emetti ora
        </button>
      </div>
    </div>
  );
}

function ForgottenPanel({
  items,
  open,
  onToggle,
  busyIds,
  onGenerate,
}: {
  items: BillingItem[];
  open: boolean;
  onToggle: () => void;
  busyIds: Set<string>;
  onGenerate: (it: BillingItem) => void;
}) {
  if (items.length === 0) return null;
  const tot = items.reduce((s, i) => s + i.amount, 0);
  return (
    <div className={"fb-forgot" + (open ? " open" : "")}>
      <div
        className="fb-forgot-head"
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => e.key === "Enter" && onToggle()}
      >
        <span className="fb-forgot-ic">
          <Icon name="clock" className="h-[18px] w-[18px]" />
        </span>
        <div className="fb-forgot-htext">
          <b>Da recuperare — fatture dimenticate</b>
          <span>
            {items.length} lavorazioni completate nei mesi scorsi e mai fatturate · {beuro(tot)}
          </span>
        </div>
        <span className="fb-forgot-badge">{items.length}</span>
        <button className="fb-forgot-caret" aria-label="Espandi">
          <Icon name="chevron-down" className="h-[18px] w-[18px]" />
        </button>
      </div>
      {open && (
        <div className="fb-forgot-body">
          {items.map((it) => (
            <ForgottenRow key={billingItemKey(it)} it={it} busy={busyIds.has(billingItemKey(it))} onGenerate={onGenerate} />
          ))}
        </div>
      )}
    </div>
  );
}

export function FatturazionePage() {
  const toast = useToast();
  const [view, setView] = useState<"fatture" | "riconciliazione" | "note-credito" | "duplica">("fatture");
  const [month, setMonth] = useState<string>(currentMonth());
  const [data, setData] = useState<BillingItemsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forgotOpen, setForgotOpen] = useState(true);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listBillingItemsApi(month);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel caricamento della fatturazione");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  const setBusy = (key: string, on: boolean) =>
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  const onGenerate = async (it: BillingItem) => {
    const key = billingItemKey(it);
    setBusy(key, true);
    try {
      await generateBillingItemApi(it);
      toast.success("Fattura generata");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossibile generare la fattura");
    } finally {
      setBusy(key, false);
    }
  };

  const onCancel = async (it: BillingItem) => {
    const key = billingItemKey(it);
    setBusy(key, true);
    try {
      await cancelBillingItemApi(it);
      toast.info("Fattura annullata");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossibile annullare la fattura");
    } finally {
      setBusy(key, false);
    }
  };

  const groups = useMemo(() => {
    const map = new Map<string, BillingItem[]>();
    (data?.items ?? []).forEach((i) => {
      if (!map.has(i.client_name)) map.set(i.client_name, []);
      map.get(i.client_name)!.push(i);
    });
    return [...map.entries()];
  }, [data]);

  const summary = data?.summary;
  const label = monthLabel(month);

  const Filter = ({ icon, text }: { icon: string; text: string }) => (
    <button className="fb-filter" disabled>
      <span className="fb-f-ic">{icon}</span>
      {text}
      <Icon name="chevron-down" className="h-3.5 w-3.5" />
    </button>
  );

  return (
    <div className="fb-page">
      <div className="fb-head">
        <div className="fb-head-row">
          <div>
            <div className="fb-crumb">
              <Icon name="credit-card" /> Commerciale · Fatturazione
            </div>
            <h1 className="fb-title">Fatturazione</h1>
            <p className="fb-sub">
              Lavorazioni completate da fatturare nel mese, raggruppate per cliente — più il recupero delle fatture mai
              emesse.
            </p>
          </div>
          {view === "fatture" ? (
            <div className="fb-month-pick">
              <span className="fb-month-l">Mese di riferimento</span>
              <div className="fb-month-nav">
                <button
                  className="fb-month-arrow"
                  aria-label="Mese precedente"
                  onClick={() => setMonth((m) => shiftMonth(m, -1))}
                >
                  <Icon name="chevron-right" className="h-[15px] w-[15px] rotate-180" />
                </button>
                <button className="fb-month-btn" onClick={() => setMonth(currentMonth())} title="Torna al mese corrente">
                  <Icon name="calendar" className="h-[15px] w-[15px]" /> {label}
                </button>
                <button
                  className="fb-month-arrow"
                  aria-label="Mese successivo"
                  onClick={() => setMonth((m) => shiftMonth(m, 1))}
                >
                  <Icon name="chevron-right" className="h-[15px] w-[15px]" />
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {/* tab: fatturazione mensile · riconciliazione FIC (admin) */}
        <div className="fb-tabs">
          <button
            className={"fb-tab" + (view === "fatture" ? " is-active" : "")}
            onClick={() => setView("fatture")}
          >
            <Icon name="credit-card" className="h-[15px] w-[15px]" /> Da fatturare
          </button>
          <button
            className={"fb-tab" + (view === "riconciliazione" ? " is-active" : "")}
            onClick={() => setView("riconciliazione")}
          >
            <Icon name="refresh-cw" className="h-[15px] w-[15px]" /> Riconciliazione FIC
          </button>
          <button
            className={"fb-tab" + (view === "note-credito" ? " is-active" : "")}
            onClick={() => setView("note-credito")}
          >
            <Icon name="document-text" className="h-[15px] w-[15px]" /> Note di credito
          </button>
          <button
            className={"fb-tab" + (view === "duplica" ? " is-active" : "")}
            onClick={() => setView("duplica")}
          >
            <Icon name="copy" className="h-[15px] w-[15px]" /> Duplica fatture
          </button>
        </div>
      </div>

      {view === "riconciliazione" ? <FicReconcilePanel /> : null}

      {view === "note-credito" ? <FicCreditNotesPanel /> : null}

      {view === "duplica" ? <FicDuplicateInvoicesPanel /> : null}

      {view === "fatture" && (
        <>
      {/* summary */}
      <div className="fb-summary">
        <div className="fb-sum big">
          <b>{beuro(summary?.todo_total ?? 0)}</b>
          <span>importo da fatturare</span>
        </div>
        <div className="fb-sum">
          <b>{summary?.todo_count ?? 0}</b>
          <span>da fatturare</span>
        </div>
        <div className="fb-sum">
          <b className="mint">{beuro(summary?.billed_total ?? 0)}</b>
          <span>già fatturato</span>
        </div>
        <span className="fb-sum-sep" />
        <div className="fb-sum">
          <b>{beuro(summary?.canone_total ?? 0)}</b>
          <span>canone</span>
        </div>
        <div className="fb-sum">
          <b>{beuro(summary?.tantum_total ?? 0)}</b>
          <span>una tantum</span>
        </div>
      </div>

      {/* filtri (segnaposto, non ancora attivi) */}
      <div className="fb-toolbar">
        <div className="fb-search">
          <Icon name="search" />
          <input placeholder="Cerca voce o cliente…" disabled />
        </div>
        <Filter icon="TI" text="Tutti i clienti" />
        <Filter icon="TI" text="Tutti i tipi" />
        <Filter icon="TG" text="Tutti gli stati" />
        <span className="fb-spacer" />
        <button className="fb-tbtn" disabled>
          <Icon name="upload" className="h-[15px] w-[15px]" /> Esporta
        </button>
      </div>

      {loading ? (
        <div className="fb-state-box">
          <Spinner /> Caricamento…
        </div>
      ) : error ? (
        <div className="fb-state-box fb-state-error">
          <Icon name="alert-triangle" className="h-4 w-4" /> {error}
          <button className="fb-tbtn" onClick={() => void load()}>
            <Icon name="refresh-cw" className="h-[15px] w-[15px]" /> Riprova
          </button>
        </div>
      ) : (
        <>
          {/* fatture dimenticate */}
          <ForgottenPanel
            items={data?.forgotten ?? []}
            open={forgotOpen}
            onToggle={() => setForgotOpen((v) => !v)}
            busyIds={busyIds}
            onGenerate={onGenerate}
          />

          {/* gruppi cliente */}
          <div className="fb-section-label">
            <Icon name="calendar" className="h-3.5 w-3.5" /> Da fatturare · {label}
          </div>
          {groups.length === 0 ? (
            <div className="fb-state-box fb-empty">
              <Icon name="check-circle" className="h-4 w-4" /> Nessuna lavorazione da fatturare per {label}.
            </div>
          ) : (
            <div className="fb-groups">
              {groups.map(([client, its]) => (
                <ClientGroup
                  key={client}
                  client={client}
                  items={its}
                  busyIds={busyIds}
                  onGenerate={onGenerate}
                  onCancel={onCancel}
                />
              ))}
            </div>
          )}
        </>
      )}
        </>
      )}
    </div>
  );
}
