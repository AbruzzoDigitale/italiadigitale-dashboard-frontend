import { useCallback, useEffect, useState } from "react";
import { getWorkItemApi, type WorkItem } from "../api/workItems";

interface UseWorkItemDetailResult {
  workItem: WorkItem | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useWorkItemDetail(workItemId: number | null, enabled = true): UseWorkItemDetailResult {
  const [workItem, setWorkItem] = useState<WorkItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    if (!enabled || workItemId == null) {
      setWorkItem(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const data = await getWorkItemApi(workItemId);
      setWorkItem(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore sconosciuto");
    } finally {
      setIsLoading(false);
    }
  }, [enabled, workItemId]);

  useEffect(() => {
    void fetchDetail();
  }, [fetchDetail]);

  return {
    workItem,
    isLoading,
    error,
    refetch: fetchDetail,
  };
}