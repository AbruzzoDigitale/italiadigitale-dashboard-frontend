import { useMemo, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { useSelectedCompanyId } from "../hooks/useSelectedCompanyId";
import { useToast } from "../context/ToastContext";
import { useBilling } from "../hooks/useBilling";
import { PageSectionHeader } from "../components/ui/PageSectionHeader";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { Spinner } from "../components/ui/Spinner";
import { BillingSummaryBar } from "../components/billing/BillingSummaryBar";
import {
  BillingFilters,
  type BillingFilterOption,
  type BillingFilterState,
} from "../components/billing/BillingFilters";
import { BillingClientGroup } from "../components/billing/BillingClientGroup";
import { computeBillingStats, monthLabel, type BillingItem, type BillingStatus } from "../utils/billing";
import { DEMO_BILLING_ITEMS } from "../utils/billingDemo";

const EMPTY_FILTERS: BillingFilterState = {
  q: "",
  clientId: "",
  month: "",
  kind: "all",
  status: "all",
};

export function FatturazionePage() {
  const { user, activeCompanyId } = useAuth();
  const { selectedCompanyId } = useSelectedCompanyId(user?.company_id ?? null);
  const companyId = selectedCompanyId ?? activeCompanyId ?? user?.company_id ?? null;
  const toast = useToast();

  const [demoMode, setDemoMode] = useState(false);
  const {
    items: liveItems,
    stats: liveStats,
    isLoading,
    error,
    refetch,
    setStatus,
  } = useBilling(companyId, { enabled: !demoMode });
  const [demoItems, setDemoItems] = useState<BillingItem[]>(DEMO_BILLING_ITEMS);
  const [filters, setFilters] = useState<BillingFilterState>(EMPTY_FILTERS);

  // Dataset effettivo: demo (solo-frontend) oppure dati reali dal backend.
  const items = demoMode ? demoItems : liveItems;
  const stats = useMemo(
    () => (demoMode ? computeBillingStats(demoItems) : liveStats),
    [demoMode, demoItems, liveStats]
  );

  const clientOptions = useMemo<BillingFilterOption[]>(() => {
    const map = new Map<string, string>();
    for (const item of items) map.set(String(item.clientId), item.clientName);
    return [...map.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [items]);

  const monthOptions = useMemo<BillingFilterOption[]>(() => {
    const set = new Set<string>();
    for (const item of items) if (item.month) set.add(item.month);
    return [...set]
      .sort((a, b) => b.localeCompare(a))
      .map((value) => ({ value, label: monthLabel(value) ?? value }));
  }, [items]);

  const filteredItems = useMemo(() => {
    const query = filters.q.trim().toLowerCase();
    return items.filter((item) => {
      if (filters.clientId && String(item.clientId) !== filters.clientId) return false;
      if (filters.month && item.month !== filters.month) return false;
      if (filters.kind !== "all" && item.kind !== filters.kind) return false;
      if (filters.status !== "all" && item.status !== filters.status) return false;
      if (query) {
        const haystack = `${item.description} ${item.clientName} ${item.contractTitle}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [items, filters]);

  const groups = useMemo(() => {
    const byClient = new Map<string, BillingItem[]>();
    for (const item of filteredItems) {
      const list = byClient.get(item.clientName) ?? [];
      list.push(item);
      byClient.set(item.clientName, list);
    }
    return [...byClient.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredItems]);

  const handleSetStatus = (key: string, status: BillingStatus, ficPlaceholder?: boolean) => {
    if (demoMode) {
      setDemoItems((prev) =>
        prev.map((item) =>
          item.key === key ? { ...item, status, ficPlaceholder: !!ficPlaceholder } : item
        )
      );
    } else {
      setStatus(key, status, ficPlaceholder);
    }
    if (status === "fatturato" && ficPlaceholder) {
      toast.success("Voce segnata come fatturata (placeholder: da collegare a FIC)");
    }
  };

  const hasActiveFilters =
    filters.q !== "" ||
    filters.clientId !== "" ||
    filters.month !== "" ||
    filters.kind !== "all" ||
    filters.status !== "all";

  const contentBlock = (
    <div className="flex flex-col gap-5">
      <BillingSummaryBar stats={stats} />
      <BillingFilters
        filters={filters}
        onChange={setFilters}
        clientOptions={clientOptions}
        monthOptions={monthOptions}
      />

      {groups.length === 0 ? (
        <EmptyState
          icon="search"
          title="Nessun risultato"
          message={
            hasActiveFilters
              ? "Nessuna voce corrisponde ai filtri selezionati."
              : "Nessuna voce disponibile."
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map(([clientName, clientItems]) => (
            <BillingClientGroup
              key={clientName}
              clientName={clientName}
              items={clientItems}
              onSetStatus={handleSetStatus}
            />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-[1600px] animate-fadeIn px-10 py-8 pb-20">
      <PageSectionHeader
        eyebrow="Commerciale · Proposta"
        eyebrowIcon={<Icon name="credit-card" className="h-3.5 w-3.5" />}
        title="Fatturazione"
        lead="Riepilogo delle lavorazioni completate da fatturare, derivate da contratti e preventivi collegati al cliente."
        actions={
          <>
            <Button
              variant={demoMode ? "primary" : "ghost"}
              size="sm"
              leftIcon={<Icon name="eye" className="h-3.5 w-3.5" />}
              onClick={() => setDemoMode((prev) => !prev)}
            >
              {demoMode ? "Esci dalla demo" : "Modalità demo"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Icon name="refresh-cw" className="h-3.5 w-3.5" />}
              onClick={refetch}
              disabled={demoMode || isLoading || companyId == null}
            >
              Aggiorna
            </Button>
          </>
        }
      />

      {/* Avviso contestuale */}
      {demoMode ? (
        <div className="mb-6 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-[12px] text-warning">
          <Icon name="information-circle" className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>
            <strong>Modalità demo attiva:</strong> dati di esempio solo-frontend. Nessuna lettura o
            scrittura sul backend — utile per provare flusso e interfaccia senza creare dati reali.
          </span>
        </div>
      ) : (
        <div className="mb-6 flex items-start gap-2 rounded-xl border border-info/30 bg-info/5 px-4 py-3 text-[12px] text-info">
          <Icon name="information-circle" className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>
            Anteprima funzionale: lo stato “fatturato” è salvato localmente e il pulsante “Genera
            fattura su FIC” è un placeholder, in attesa dell’endpoint fattura lato backend.
          </span>
        </div>
      )}

      {demoMode ? (
        contentBlock
      ) : companyId == null ? (
        <EmptyState
          icon="building"
          title="Nessuna azienda selezionata"
          message="Seleziona un’azienda dalla barra in alto, oppure attiva la Modalità demo per vedere un esempio."
        />
      ) : isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Spinner />
        </div>
      ) : error ? (
        <EmptyState icon="alert-triangle" title="Errore di caricamento" message={error} tone="danger" />
      ) : items.length === 0 ? (
        <EmptyState
          icon="credit-card"
          title="Nessuna voce da fatturare"
          message="Quando una lavorazione collegata a un contratto viene completata, comparirà qui. In alternativa attiva la Modalità demo."
        />
      ) : (
        contentBlock
      )}
    </div>
  );
}

interface EmptyStateProps {
  icon: Parameters<typeof Icon>[0]["name"];
  title: string;
  message: string;
  tone?: "default" | "danger";
}

function EmptyState({ icon, title, message, tone = "default" }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line py-20 text-center dark:border-[#2a2a2e]">
      <Icon
        name={icon}
        className={`h-8 w-8 ${tone === "danger" ? "text-danger" : "text-muted dark:text-muted-dark"}`}
      />
      <h3 className="text-[15px] font-bold text-ink dark:text-paper">{title}</h3>
      <p className="max-w-md text-[13px] text-muted dark:text-muted-dark">{message}</p>
    </div>
  );
}
