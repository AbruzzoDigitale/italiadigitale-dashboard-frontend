import { useCallback, useEffect, useState } from "react";
import {
  listCompanyLlmOperationBindingsApi,
  type LlmOperationBinding,
} from "../api/llm";

interface UseCompanyLlmBindingsResult {
  bindings: LlmOperationBinding[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useCompanyLlmBindings(companyId: number | null): UseCompanyLlmBindingsResult {
  const [bindings, setBindings] = useState<LlmOperationBinding[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBindings = useCallback(async () => {
    if (!companyId) {
      setBindings([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const items = await listCompanyLlmOperationBindingsApi(companyId);
      setBindings(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore caricamento binding LLM");
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void fetchBindings();
  }, [fetchBindings]);

  return {
    bindings,
    isLoading,
    error,
    refetch: () => void fetchBindings(),
  };
}
