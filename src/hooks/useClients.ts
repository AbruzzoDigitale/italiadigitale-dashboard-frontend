import { useCallback, useEffect, useState } from "react";
import { getClientsApi, type Client, type GetClientsParams } from "../api/clients";

interface UseClientsResult {
  clients: Client[];
  total: number;
  page: number;
  pages: number;
  isLoading: boolean;
  error: string | null;
  refetch: (params?: GetClientsParams) => void;
}

export function useClients(): UseClientsResult {
  const [clients, setClients] = useState<Client[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async (params?: GetClientsParams) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getClientsApi(params);
      setClients(data.data);
      setTotal(data.total);
      setPage(data.page);
      setPages(data.total_pages);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore sconosciuto");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { clients, total, page, pages, isLoading, error, refetch: fetch };
}
