import { useCallback, useEffect, useState } from "react";
import {
  listCompanyLlmProfilesApi,
  type LlmProfile,
} from "../api/llm";

interface UseCompanyLlmProfilesResult {
  profiles: LlmProfile[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useCompanyLlmProfiles(
  companyId: number | null,
  options: { includeSecretValues?: boolean } = {}
): UseCompanyLlmProfilesResult {
  const [profiles, setProfiles] = useState<LlmProfile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProfiles = useCallback(async () => {
    if (!companyId) {
      setProfiles([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const items = await listCompanyLlmProfilesApi(companyId, {
        include_secret_values: options.includeSecretValues,
      });
      setProfiles(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore caricamento profili LLM");
    } finally {
      setIsLoading(false);
    }
  }, [companyId, options.includeSecretValues]);

  useEffect(() => {
    void fetchProfiles();
  }, [fetchProfiles]);

  return {
    profiles,
    isLoading,
    error,
    refetch: () => void fetchProfiles(),
  };
}
