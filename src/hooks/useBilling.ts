import { useCallback, useEffect, useMemo, useState } from "react";
import { usePostSalesSituation } from "./usePostSalesSituation";
import { listWorkItemsApi, type WorkItem } from "../api/workItems";
import {
  computeBillingStats,
  deriveBillingItems,
  loadBillingOverrides,
  saveBillingOverrides,
  type BillingItem,
  type BillingOverrides,
  type BillingStats,
  type BillingStatus,
} from "../utils/billing";

interface UseBillingOptions {
  enabled?: boolean;
}

interface UseBillingResult {
  items: BillingItem[];
  stats: BillingStats;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  /** Imposta lo stato (placeholder) di una voce; ficPlaceholder=true se via FIC. */
  setStatus: (key: string, status: BillingStatus, ficPlaceholder?: boolean) => void;
}

const EMPTY_STATS: BillingStats = {
  totalCount: 0,
  toBillCount: 0,
  toBillAmount: 0,
  billedAmount: 0,
  canoneAmount: 0,
  unaTantumAmount: 0,
};

/**
 * Aggrega Situazione clienti + lavorazioni completate in voci di fatturazione.
 * Lo stato "fatturato" è un override locale (localStorage), in attesa del backend.
 */
export function useBilling(
  companyId: number | null,
  options: UseBillingOptions = {}
): UseBillingResult {
  const enabled = (options.enabled ?? true) && companyId != null;

  const {
    clients,
    isLoading: situationLoading,
    error: situationError,
    refetch: refetchSituation,
  } = usePostSalesSituation(
    { company_id: companyId ?? undefined, per_page: 200 },
    { enabled }
  );

  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [workItemsLoading, setWorkItemsLoading] = useState(enabled);
  const [workItemsError, setWorkItemsError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<BillingOverrides>(() => loadBillingOverrides());
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!enabled || companyId == null) {
        setWorkItems([]);
        setWorkItemsLoading(false);
        setWorkItemsError(null);
        return;
      }

      setWorkItemsLoading(true);
      setWorkItemsError(null);
      try {
        const data = await listWorkItemsApi({ company_id: companyId, is_completed: true });
        if (!cancelled) setWorkItems(data);
      } catch (err) {
        if (!cancelled) {
          setWorkItemsError(
            err instanceof Error ? err.message : "Errore caricamento lavorazioni completate"
          );
        }
      } finally {
        if (!cancelled) setWorkItemsLoading(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [companyId, enabled, reloadToken]);

  const workItemById = useMemo(() => {
    const map = new Map<number, WorkItem>();
    for (const item of workItems) map.set(item.id, item);
    return map;
  }, [workItems]);

  const items = useMemo(() => {
    const derived = deriveBillingItems(clients, workItemById);
    return derived.map((item) => {
      const override = overrides[item.key];
      if (!override) return item;
      return { ...item, status: override.status, ficPlaceholder: override.ficPlaceholder };
    });
  }, [clients, workItemById, overrides]);

  const stats = useMemo(() => (items.length ? computeBillingStats(items) : EMPTY_STATS), [items]);

  const setStatus = useCallback(
    (key: string, status: BillingStatus, ficPlaceholder = false) => {
      setOverrides((prev) => {
        const next: BillingOverrides = { ...prev };
        if (status === "da_fatturare") {
          delete next[key];
        } else {
          next[key] = { status, ficPlaceholder };
        }
        saveBillingOverrides(next);
        return next;
      });
    },
    []
  );

  const refetch = useCallback(() => {
    refetchSituation();
    setReloadToken((token) => token + 1);
  }, [refetchSituation]);

  return {
    items,
    stats,
    isLoading: situationLoading || workItemsLoading,
    error: situationError ?? workItemsError,
    refetch,
    setStatus,
  };
}
