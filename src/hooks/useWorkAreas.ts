import { useCallback, useEffect, useState } from "react";
import { listWorkAreasApi, type WorkArea } from "../api/workAreas";

interface UseWorkAreasResult {
  workAreas: WorkArea[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useWorkAreas(includeInactive: boolean, companyId?: number): UseWorkAreasResult {
  const [workAreas, setWorkAreas] = useState<WorkArea[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await listWorkAreasApi({ include_inactive: includeInactive, company_id: companyId });
      setWorkAreas(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore sconosciuto");
    } finally {
      setIsLoading(false);
    }
  }, [companyId, includeInactive]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { workAreas, isLoading, error, refetch: fetch };
}