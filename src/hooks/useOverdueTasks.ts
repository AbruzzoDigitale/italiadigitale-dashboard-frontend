import { useCallback, useEffect, useRef, useState } from "react";
import {
  listOverdueTasksApi,
  type ListOverdueTasksParams,
  type ListOverdueTasksResponse,
} from "../api/workload";

export function useOverdueTasks(
  params: ListOverdueTasksParams = {},
  options: { enabled?: boolean } = {}
) {
  const [data, setData] = useState<ListOverdueTasksResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const enabled = options.enabled ?? true;
  const paramsKey = JSON.stringify(params);
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const fetchData = useCallback(async () => {
    if (!enabled) {
      setData(null);
      setError(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      setData(await listOverdueTasksApi(paramsRef.current));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Errore nel caricamento delle attività in ritardo"
      );
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, paramsKey]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return { data, isLoading, error, refetch: fetchData };
}
