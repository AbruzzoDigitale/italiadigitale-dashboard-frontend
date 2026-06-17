import { useState } from "react";
import { createQuoteFromConfiguratorApi, type CreateQuotePayload, type Quote } from "../api/quotes";

interface UseCreateQuoteFromConfiguratorResult {
  createQuote: (payload: CreateQuotePayload) => Promise<Quote>;
  isSubmitting: boolean;
  error: string | null;
}

export function useCreateQuoteFromConfigurator(): UseCreateQuoteFromConfiguratorResult {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createQuote = async (payload: CreateQuotePayload) => {
    setIsSubmitting(true);
    setError(null);
    try {
      return await createQuoteFromConfiguratorApi(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Errore creazione preventivo da configuratore";
      setError(message);
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  return { createQuote, isSubmitting, error };
}
