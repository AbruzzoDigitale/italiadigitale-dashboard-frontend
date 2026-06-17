import { useEffect, useMemo, useState } from "react";
import {
  getCatalogProductsFlatApi,
  type CatalogProductFlatResponse,
  type CatalogProductsFlatParams,
} from "../api/catalog";

interface UseCatalogProductsFlatResult {
  products: CatalogProductFlatResponse[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useCatalogProductsFlat(
  companyId: number | null,
  filters?: Omit<CatalogProductsFlatParams, "company_id">
): UseCatalogProductsFlatResult {
  const [products, setProducts] = useState<CatalogProductFlatResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signature = useMemo(() => JSON.stringify(filters ?? {}), [filters]);

  const fetchProducts = async () => {
    if (!companyId) {
      setProducts([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await getCatalogProductsFlatApi({
        company_id: companyId,
        ...filters,
      });
      setProducts(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore caricamento prodotti");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchProducts();
  }, [companyId, signature]);

  return { products, isLoading, error, refetch: fetchProducts };
}
