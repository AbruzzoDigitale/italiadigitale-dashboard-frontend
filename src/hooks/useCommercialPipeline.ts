import { useCallback, useEffect, useRef, useState } from "react";
import {
  listCommercialPipelineApi,
  type CommercialPipelineItem,
  type ListCommercialPipelineParams,
} from "../api/contracts";

interface UseCommercialPipelineResult {
  items: CommercialPipelineItem[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

interface UseCommercialPipelineOptions {
  enabled?: boolean;
}

export function useCommercialPipeline(
  params: ListCommercialPipelineParams = {},
  options: UseCommercialPipelineOptions = {}
): UseCommercialPipelineResult {
  const [items, setItems] = useState<CommercialPipelineItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const paramsKey = JSON.stringify(params);
  const enabled = options.enabled ?? true;
  const paramsKeyRef = useRef(paramsKey);
  paramsKeyRef.current = paramsKey;

  const fetch = useCallback(async () => {
    if (!enabled) {
      setItems([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const data = await listCommercialPipelineApi(JSON.parse(paramsKeyRef.current) as ListCommercialPipelineParams);
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore sconosciuto");
    } finally {
      setIsLoading(false);
    }
  }, [enabled, paramsKey]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { items, isLoading, error, refetch: fetch };
}