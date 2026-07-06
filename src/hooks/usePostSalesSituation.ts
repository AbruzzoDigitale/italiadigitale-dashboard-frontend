import { useCallback, useEffect, useRef, useState } from "react";
import {
  getPostSalesSituationApi,
  type ClientPostSalesSituationItem,
  type ClientPostSalesSituationStats,
  type GetPostSalesSituationParams,
} from "../api/clients";

interface UsePostSalesSituationOptions {
  enabled?: boolean;
}

interface UsePostSalesSituationResult {
  clients: ClientPostSalesSituationItem[];
  stats: ClientPostSalesSituationStats;
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

const EMPTY_STATS: ClientPostSalesSituationStats = {
  clients_count: 0,
  quotes_count: 0,
  contracts_count: 0,
  active_contracts_count: 0,
  recurring_monthly_total: 0,
  one_time_total: 0,
  work_areas: [],
  tags: [],
  quote_statuses: [],
  contract_statuses: [],
};

export function usePostSalesSituation(
  params: GetPostSalesSituationParams = {},
  options: UsePostSalesSituationOptions = {}
): UsePostSalesSituationResult {
  const [clients, setClients] = useState<ClientPostSalesSituationItem[]>([]);
  const [stats, setStats] = useState<ClientPostSalesSituationStats>(EMPTY_STATS);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(24);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const enabled = options.enabled ?? true;
  const paramsKey = JSON.stringify(params);
  const paramsKeyRef = useRef(paramsKey);
  paramsKeyRef.current = paramsKey;

  const fetch = useCallback(async () => {
    if (!enabled) {
      setClients([]);
      setStats(EMPTY_STATS);
      setTotal(0);
      setPage(params.page ?? 1);
      setPerPage(params.per_page ?? 24);
      setTotalPages(1);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const data = await getPostSalesSituationApi(
        JSON.parse(paramsKeyRef.current) as GetPostSalesSituationParams
      );
      setClients(data.data ?? []);
      setStats(data.stats ?? EMPTY_STATS);
      setTotal(data.total ?? 0);
      setPage(data.page ?? params.page ?? 1);
      setPerPage(data.per_page ?? params.per_page ?? 24);
      setTotalPages(data.total_pages ?? 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore caricamento situazione clienti");
    } finally {
      setIsLoading(false);
    }
  }, [enabled, params.page, params.per_page, paramsKey]);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  // Identita' stabile: se ricreata a ogni render, gli effect dei consumer che la
  // includono fra le dipendenze (es. refetch su `reloadNonce`) andrebbero in loop.
  const refetch = useCallback(() => {
    void fetch();
  }, [fetch]);

  return {
    clients,
    stats,
    total,
    page,
    perPage,
    totalPages,
    isLoading,
    error,
    refetch,
  };
}
