import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "../ui/Icon";
import { Spinner } from "../ui/Spinner";
import { Button } from "../ui/Button";
import { useToast } from "../../context/ToastContext";
import {
  listClientBillingApi,
  generateBillingItemApi,
  cancelBillingItemApi,
  billingItemKey,
  type BillingClientResponse,
  type BillingItem,
} from "../../api/billing";

const euro = (n: number) =>
  n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

function TypeBadge({ type }: { type: BillingItem["type"] }) {
  const isCanone = type === "canone";
  return (
    <span
      className={
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide " +
        (isCanone
          ? "bg-info/15 text-info"
          : "bg-line/60 text-muted dark:bg-line-dark/60 dark:text-muted-dark")
      }
    >
      {isCanone ? "Canone" : "Una tantum"}
    </span>
  );
}

function BillingRow({
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
    <div
      className={
        "flex items-center gap-3 rounded-md border px-3 py-2.5 " +
        (done
          ? "border-success/25 bg-success/5"
          : "border-line dark:border-line-dark")
      }
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink dark:text-paper">
          <span className="truncate">{it.title}</span>
          <TypeBadge type={it.type} />
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted dark:text-muted-dark">
          {it.source && (
            <span className="inline-flex items-center gap-1">
              <Icon name="document-text" className="h-3 w-3" /> {it.source}
            </span>
          )}
          {it.month_label && (
            <span className="inline-flex items-center gap-1">
              <Icon name="calendar" className="h-3 w-3" /> {it.month_label}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col items-end gap-1">
        <div className="text-sm font-bold tabular-nums text-ink dark:text-paper">{euro(it.amount)}</div>
        <span
          className={
            "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide " +
            (done ? "bg-success/15 text-success" : "bg-warning/15 text-warning")
          }
        >
          {done ? "Fatturato" : "Da fatturare"}
        </span>
      </div>

      <div className="flex w-[132px] shrink-0 justify-end">
        {done ? (
          <div className="flex flex-col items-end gap-1">
            {it.invoice_number && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted dark:text-muted-dark">
                <Icon name="credit-card" className="h-3 w-3" /> {it.invoice_number}
              </span>
            )}
            <button
              className="rounded-md border border-line px-2 py-1 text-[11px] font-semibold text-muted transition-colors hover:border-danger hover:text-danger disabled:opacity-50 dark:border-line-dark dark:text-muted-dark"
              disabled={busy}
              onClick={() => onCancel(it)}
            >
              Annulla
            </button>
          </div>
        ) : (
          <Button size="sm" variant="primary" disabled={busy} onClick={() => onGenerate(it)}>
            <Icon name="upload" className="h-3.5 w-3.5" /> Genera
          </Button>
        )}
      </div>
    </div>
  );
}

export function ClientBillingTab({ clientId }: { clientId: number }) {
  const toast = useToast();
  const [data, setData] = useState<BillingClientResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await listClientBillingApi(clientId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel caricamento della fatturazione");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

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

  const toIssue = useMemo(() => (data?.items ?? []).filter((i) => i.state === "da_fatturare"), [data]);
  const issued = useMemo(() => (data?.items ?? []).filter((i) => i.state === "fatturato"), [data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner />
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
        <Icon name="alert-triangle" className="h-4 w-4" /> {error}
        <button className="ml-auto text-xs font-semibold underline" onClick={() => void load()}>
          Riprova
        </button>
      </div>
    );
  }

  const s = data?.summary;

  return (
    <div className="space-y-3">
      {/* riepilogo */}
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div className="rounded-md border border-line px-3 py-2 dark:border-line-dark">
          <div className="text-muted dark:text-muted-dark">Da emettere</div>
          <div className="text-sm font-semibold text-warning">{euro(s?.to_issue_total ?? 0)}</div>
        </div>
        <div className="rounded-md border border-line px-3 py-2 dark:border-line-dark">
          <div className="text-muted dark:text-muted-dark">Già emesse</div>
          <div className="text-sm font-semibold text-success">{euro(s?.issued_total ?? 0)}</div>
        </div>
        <div className="rounded-md border border-line px-3 py-2 dark:border-line-dark">
          <div className="text-muted dark:text-muted-dark">Canone</div>
          <div className="text-sm font-semibold text-ink dark:text-paper">{euro(s?.canone_total ?? 0)}</div>
        </div>
        <div className="rounded-md border border-line px-3 py-2 dark:border-line-dark">
          <div className="text-muted dark:text-muted-dark">Una tantum</div>
          <div className="text-sm font-semibold text-ink dark:text-paper">{euro(s?.tantum_total ?? 0)}</div>
        </div>
      </div>

      {(data?.items.length ?? 0) === 0 ? (
        <div className="flex items-center gap-2 rounded-md border border-dashed border-line px-3 py-5 text-sm text-muted dark:border-line-dark dark:text-muted-dark">
          <Icon name="information-circle" className="h-4 w-4" /> Nessuna lavorazione fatturabile per questo cliente.
          <span className="text-xs">(servono lavorazioni completate e collegate a un contratto)</span>
        </div>
      ) : (
        <>
          {/* da emettere */}
          <div>
            <div className="mb-1.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted dark:text-muted-dark">
              <Icon name="clock" className="h-3.5 w-3.5" /> Da emettere ({toIssue.length})
            </div>
            {toIssue.length === 0 ? (
              <div className="rounded-md border border-dashed border-line px-3 py-3 text-xs text-muted dark:border-line-dark dark:text-muted-dark">
                Tutto fatturato.
              </div>
            ) : (
              <div className="space-y-2">
                {toIssue.map((it) => (
                  <BillingRow
                    key={billingItemKey(it)}
                    it={it}
                    busy={busyIds.has(billingItemKey(it))}
                    onGenerate={onGenerate}
                    onCancel={onCancel}
                  />
                ))}
              </div>
            )}
          </div>

          {/* già emesse */}
          {issued.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted dark:text-muted-dark">
                <Icon name="check-circle" className="h-3.5 w-3.5" /> Fatture emesse ({issued.length})
              </div>
              <div className="space-y-2">
                {issued.map((it) => (
                  <BillingRow
                    key={billingItemKey(it)}
                    it={it}
                    busy={busyIds.has(billingItemKey(it))}
                    onGenerate={onGenerate}
                    onCancel={onCancel}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
