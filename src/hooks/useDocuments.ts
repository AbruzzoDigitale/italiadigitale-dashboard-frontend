import { useCallback, useEffect, useRef, useState } from "react";
import { listDocumentsApi, type DocumentItem, type ListDocumentsParams } from "../api/documents";

interface UseDocumentsResult {
  items: DocumentItem[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

interface UseDocumentsOptions {
  enabled?: boolean;
}

export function useDocuments(
  params: ListDocumentsParams = {},
  options: UseDocumentsOptions = {}
): UseDocumentsResult {
  const [items, setItems] = useState<DocumentItem[]>([]);
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
      const data = await listDocumentsApi(JSON.parse(paramsKeyRef.current) as ListDocumentsParams);
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
