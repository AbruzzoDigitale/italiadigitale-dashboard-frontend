import { useCallback, useState } from "react";
import { getRequestsApi } from "../api/requests";
import { type ListQuotesParams, type Quote } from "../api/quotes";

interface UseRequestsResult {
  requests: Quote[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
  isLoading: boolean;
  error: string | null;
  refetch: (params?: ListQuotesParams) => void;
}

export function useRequests(): UseRequestsResult {
  const [requests, setRequests] = useState<Quote[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async (params?: ListQuotesParams) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getRequestsApi(params);
      setRequests(data.data ?? []);
      setTotal(data.total ?? 0);
      setPage(data.page ?? 1);
      setPerPage(data.per_page ?? 20);
      setTotalPages(data.total_pages ?? 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore sconosciuto");
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { requests, total, page, perPage, totalPages, isLoading, error, refetch: fetch };
}
