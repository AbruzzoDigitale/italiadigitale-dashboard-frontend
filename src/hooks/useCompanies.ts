import { useCallback, useEffect, useState } from "react";
import { getCompaniesApi, type Company } from "../api/companies";

interface UseCompaniesResult {
  companies: Company[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useCompanies(): UseCompaniesResult {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getCompaniesApi();
      setCompanies(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore sconosciuto");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { companies, isLoading, error, refetch: fetch };
}
