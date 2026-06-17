import { useCallback, useEffect, useRef, useState } from "react";
import { listWorkItemsApi, type ListWorkItemsParams, type WorkItem } from "../api/workItems";

interface UseWorkItemsResult {
  workItems: WorkItem[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useWorkItems(params: ListWorkItemsParams = {}): UseWorkItemsResult {
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Stable serialized key to avoid unnecessary refetches
  const paramsKey = JSON.stringify(params);
  const paramsKeyRef = useRef(paramsKey);
  paramsKeyRef.current = paramsKey;

  const fetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await listWorkItemsApi(JSON.parse(paramsKeyRef.current) as ListWorkItemsParams);
      setWorkItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore sconosciuto");
    } finally {
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { workItems, isLoading, error, refetch: fetch };
}
