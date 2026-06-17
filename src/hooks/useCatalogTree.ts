import { useEffect, useMemo, useState } from "react";
import { getCatalogTreeApi, type CatalogTreeResponse } from "../api/catalog";

interface UseCatalogTreeResult {
  tree: CatalogTreeResponse | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useCatalogTree(companyId: number | null, selectedServiceIds: number[]): UseCatalogTreeResult {
  const [tree, setTree] = useState<CatalogTreeResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stableIds = useMemo(
    () => Array.from(new Set(selectedServiceIds)).sort((a, b) => a - b),
    [selectedServiceIds]
  );

  const signature = stableIds.join(",");

  const fetchTree = async () => {
    if (!companyId) {
      setTree(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await getCatalogTreeApi({
        company_id: companyId,
        selected_service_ids: stableIds,
      });
      setTree(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore caricamento catalogo");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchTree();
  }, [companyId, signature]);

  return { tree, isLoading, error, refetch: fetchTree };
}
