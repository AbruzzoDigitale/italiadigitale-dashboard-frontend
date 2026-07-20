import { useCallback, useState } from "react";
import {
  swapWorkItemsPreviewApi,
  swapWorkItemsApi,
  type WorkItemSwapRequest,
  type WorkItemSwapPreviewResponse,
} from "../api/workItems";

export function useWorkItemSwap() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = useCallback(async (body: WorkItemSwapRequest): Promise<WorkItemSwapPreviewResponse | null> => {
    try {
      return await swapWorkItemsPreviewApi(body);
    } catch {
      return null;
    }
  }, []);

  const apply = useCallback(async (body: WorkItemSwapRequest): Promise<WorkItemSwapPreviewResponse | null> => {
    setIsLoading(true);
    setError(null);
    try {
      return await swapWorkItemsApi(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scambio non possibile");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { preview, apply, isLoading, error };
}
