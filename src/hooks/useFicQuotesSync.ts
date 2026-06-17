import { useCallback, useState } from "react";
import {
  syncFicQuotesApi,
  type FicSyncQuotesPayload,
  type FicSyncQuotesResult,
} from "../api/fic";

interface UseFicQuotesSyncOptions {
  isAdmin: boolean;
}

interface UseFicQuotesSyncResult {
  previewResult: FicSyncQuotesResult | null;
  executionResult: FicSyncQuotesResult | null;
  previewLoading: boolean;
  executionLoading: boolean;
  runPreview: (payload: Omit<FicSyncQuotesPayload, "dry_run">) => Promise<FicSyncQuotesResult>;
  runExecution: (payload: Omit<FicSyncQuotesPayload, "dry_run">) => Promise<FicSyncQuotesResult>;
  reset: () => void;
}

const ADMIN_ERROR = "Operazione consentita solo agli admin";

export function useFicQuotesSync({ isAdmin }: UseFicQuotesSyncOptions): UseFicQuotesSyncResult {
  const [previewResult, setPreviewResult] = useState<FicSyncQuotesResult | null>(null);
  const [executionResult, setExecutionResult] = useState<FicSyncQuotesResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [executionLoading, setExecutionLoading] = useState(false);

  const ensureAdmin = useCallback(() => {
    if (!isAdmin) {
      throw new Error(ADMIN_ERROR);
    }
  }, [isAdmin]);

  const runPreview = useCallback(async (payload: Omit<FicSyncQuotesPayload, "dry_run">) => {
    ensureAdmin();
    setPreviewLoading(true);
    try {
      const result = await syncFicQuotesApi({ ...payload, dry_run: true });
      setPreviewResult(result);
      setExecutionResult(null);
      return result;
    } finally {
      setPreviewLoading(false);
    }
  }, [ensureAdmin]);

  const runExecution = useCallback(async (payload: Omit<FicSyncQuotesPayload, "dry_run">) => {
    ensureAdmin();
    setExecutionLoading(true);
    try {
      const result = await syncFicQuotesApi({ ...payload, dry_run: false });
      setExecutionResult(result);
      return result;
    } finally {
      setExecutionLoading(false);
    }
  }, [ensureAdmin]);

  const reset = useCallback(() => {
    setPreviewResult(null);
    setExecutionResult(null);
  }, []);

  return {
    previewResult,
    executionResult,
    previewLoading,
    executionLoading,
    runPreview,
    runExecution,
    reset,
  };
}
