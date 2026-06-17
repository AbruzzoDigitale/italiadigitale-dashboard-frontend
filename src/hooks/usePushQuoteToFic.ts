import { useState, useCallback } from "react";
import { pushQuoteToFicApi, type PushQuoteToFicResult } from "../api/fic";
import { type Quote } from "../api/quotes";
import { useToast } from "../context/ToastContext";

interface PendingConfirm {
  quoteId: number;
  ficId: string;
  onSuccess?: () => void;
}

interface UsePushQuoteToFicReturn {
  /** Start the push flow. Shows confirm dialog if quote already has fic_id. */
  push: (quote: Pick<Quote, "id" | "fic_id">, onSuccess?: () => void) => void;
  /** ID of the quote currently being pushed (null if idle). */
  isPushing: number | null;
  /** Non-null when a duplicate-confirm dialog should be shown. */
  confirmPending: PendingConfirm | null;
  /** Confirm: proceed with sending the duplicate. */
  confirmPush: () => void;
  /** Cancel: dismiss the dialog without sending. */
  cancelConfirm: () => void;
  /** Last successful push result. */
  lastResult: PushQuoteToFicResult | null;
  /** URL of the FIC document (constructed from fic_document_id). */
  lastFicUrl: string | null;
  /** Clear lastResult. */
  clearResult: () => void;
}

export function usePushQuoteToFic(): UsePushQuoteToFicReturn {
  const toast = useToast();
  const [isPushing, setIsPushing] = useState<number | null>(null);
  const [confirmPending, setConfirmPending] = useState<PendingConfirm | null>(null);
  const [lastResult, setLastResult] = useState<PushQuoteToFicResult | null>(null);

  const doPush = useCallback(
    async (quoteId: number, onSuccess?: () => void) => {
      setIsPushing(quoteId);
      try {
        const result = await pushQuoteToFicApi(quoteId);
        setLastResult(result);
        toast.success(`Preventivo inviato a FIC (doc #${result.fic_document_id})`);
        onSuccess?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Errore durante l'invio a FIC");
      } finally {
        setIsPushing(null);
      }
    },
    [toast]
  );

  const push = useCallback(
    (quote: Pick<Quote, "id" | "fic_id">, onSuccess?: () => void) => {
      if (quote.fic_id) {
        setConfirmPending({ quoteId: quote.id, ficId: quote.fic_id, onSuccess });
      } else {
        doPush(quote.id, onSuccess);
      }
    },
    [doPush]
  );

  const confirmPush = useCallback(() => {
    if (!confirmPending) return;
    const { quoteId, onSuccess } = confirmPending;
    setConfirmPending(null);
    doPush(quoteId, onSuccess);
  }, [confirmPending, doPush]);

  const cancelConfirm = useCallback(() => {
    setConfirmPending(null);
  }, []);

  const clearResult = useCallback(() => {
    setLastResult(null);
  }, []);

  const lastFicUrl = lastResult?.fic_document_id != null
    ? `https://secure.fattureincloud.it/issued-documents/${lastResult.fic_document_id}`
    : null;

  return {
    push,
    isPushing,
    confirmPending,
    confirmPush,
    cancelConfirm,
    lastResult,
    lastFicUrl,
    clearResult,
  };
}
