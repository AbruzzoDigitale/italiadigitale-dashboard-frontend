import { useCallback, useState } from "react";
import {
  applyFicQuoteToExistingApi,
  importFicQuoteApi,
  searchFicQuotesApi,
  type FicApplyQuoteToExistingRequest,
  type FicApplyQuoteToExistingResponse,
  type FicImportQuoteRequest,
  type FicImportQuoteResponse,
  type FicQuoteSearchParams,
  type FicQuoteSearchResponse,
} from "../api/fic";

interface UseFicQuoteImportOptions {
  isAdmin: boolean;
}

export interface FicApplyTarget {
  ficDocumentId: number;
  quoteId: number;
  payload: Omit<FicApplyQuoteToExistingRequest, "dry_run">;
}

interface UseFicQuoteImportResult {
  searchResult: FicQuoteSearchResponse | null;
  importPreview: FicImportQuoteResponse | null;
  importExecution: FicImportQuoteResponse | null;
  applyPreview: FicApplyQuoteToExistingResponse | null;
  applyExecution: FicApplyQuoteToExistingResponse | null;
  searchLoading: boolean;
  importPreviewLoading: boolean;
  importExecutionLoading: boolean;
  applyPreviewLoading: boolean;
  applyExecutionLoading: boolean;
  search: (params?: FicQuoteSearchParams) => Promise<FicQuoteSearchResponse>;
  runImportPreview: (payload: Omit<FicImportQuoteRequest, "dry_run">) => Promise<FicImportQuoteResponse>;
  runImportExecution: (payload: Omit<FicImportQuoteRequest, "dry_run">) => Promise<FicImportQuoteResponse>;
  runApplyPreview: (target: FicApplyTarget) => Promise<FicApplyQuoteToExistingResponse>;
  runApplyExecution: (target: FicApplyTarget) => Promise<FicApplyQuoteToExistingResponse>;
  reset: () => void;
}

const ADMIN_ERROR = "Operazione consentita solo agli admin";

export function useFicQuoteImport({ isAdmin }: UseFicQuoteImportOptions): UseFicQuoteImportResult {
  const [searchResult, setSearchResult] = useState<FicQuoteSearchResponse | null>(null);
  const [importPreview, setImportPreview] = useState<FicImportQuoteResponse | null>(null);
  const [importExecution, setImportExecution] = useState<FicImportQuoteResponse | null>(null);
  const [applyPreview, setApplyPreview] = useState<FicApplyQuoteToExistingResponse | null>(null);
  const [applyExecution, setApplyExecution] = useState<FicApplyQuoteToExistingResponse | null>(null);

  const [searchLoading, setSearchLoading] = useState(false);
  const [importPreviewLoading, setImportPreviewLoading] = useState(false);
  const [importExecutionLoading, setImportExecutionLoading] = useState(false);
  const [applyPreviewLoading, setApplyPreviewLoading] = useState(false);
  const [applyExecutionLoading, setApplyExecutionLoading] = useState(false);

  const ensureAdmin = useCallback(() => {
    if (!isAdmin) {
      throw new Error(ADMIN_ERROR);
    }
  }, [isAdmin]);

  const search = useCallback(async (params: FicQuoteSearchParams = {}) => {
    ensureAdmin();
    setSearchLoading(true);
    try {
      const result = await searchFicQuotesApi(params);
      setSearchResult(result);
      return result;
    } finally {
      setSearchLoading(false);
    }
  }, [ensureAdmin]);

  const runImportPreview = useCallback(async (payload: Omit<FicImportQuoteRequest, "dry_run">) => {
    ensureAdmin();
    setImportPreviewLoading(true);
    try {
      const result = await importFicQuoteApi({ ...payload, dry_run: true });
      setImportPreview(result);
      setImportExecution(null);
      return result;
    } finally {
      setImportPreviewLoading(false);
    }
  }, [ensureAdmin]);

  const runImportExecution = useCallback(async (payload: Omit<FicImportQuoteRequest, "dry_run">) => {
    ensureAdmin();
    setImportExecutionLoading(true);
    try {
      const result = await importFicQuoteApi({ ...payload, dry_run: false });
      setImportExecution(result);
      return result;
    } finally {
      setImportExecutionLoading(false);
    }
  }, [ensureAdmin]);

  const runApplyPreview = useCallback(async (target: FicApplyTarget) => {
    ensureAdmin();
    setApplyPreviewLoading(true);
    try {
      const result = await applyFicQuoteToExistingApi(target.ficDocumentId, target.quoteId, {
        ...target.payload,
        dry_run: true,
      });
      setApplyPreview(result);
      setApplyExecution(null);
      return result;
    } finally {
      setApplyPreviewLoading(false);
    }
  }, [ensureAdmin]);

  const runApplyExecution = useCallback(async (target: FicApplyTarget) => {
    ensureAdmin();
    setApplyExecutionLoading(true);
    try {
      const result = await applyFicQuoteToExistingApi(target.ficDocumentId, target.quoteId, {
        ...target.payload,
        dry_run: false,
      });
      setApplyExecution(result);
      return result;
    } finally {
      setApplyExecutionLoading(false);
    }
  }, [ensureAdmin]);

  const reset = useCallback(() => {
    setSearchResult(null);
    setImportPreview(null);
    setImportExecution(null);
    setApplyPreview(null);
    setApplyExecution(null);
  }, []);

  return {
    searchResult,
    importPreview,
    importExecution,
    applyPreview,
    applyExecution,
    searchLoading,
    importPreviewLoading,
    importExecutionLoading,
    applyPreviewLoading,
    applyExecutionLoading,
    search,
    runImportPreview,
    runImportExecution,
    runApplyPreview,
    runApplyExecution,
    reset,
  };
}
