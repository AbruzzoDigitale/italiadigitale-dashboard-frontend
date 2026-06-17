import { useCallback, useState } from "react";
import {
  createQuickTaskApi,
  type CreateQuickTaskPayload,
  type CreateQuickTaskResponse,
  type QuickTaskApiError,
} from "../api/workItems";

interface UseQuickTaskResult {
  createQuickTask: (payload: CreateQuickTaskPayload) => Promise<CreateQuickTaskResponse>;
  isSubmitting: boolean;
  error: string | null;
  statusCode: number | null;
  missingFields: string[];
  autoAssignedUserId: number | null;
  reset: () => void;
}

export function useQuickTask(): UseQuickTaskResult {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusCode, setStatusCode] = useState<number | null>(null);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [autoAssignedUserId, setAutoAssignedUserId] = useState<number | null>(null);

  const reset = useCallback(() => {
    setError(null);
    setStatusCode(null);
    setMissingFields([]);
    setAutoAssignedUserId(null);
  }, []);

  const createQuickTask = useCallback(async (payload: CreateQuickTaskPayload) => {
    setIsSubmitting(true);
    setError(null);
    setStatusCode(null);
    setMissingFields([]);

    try {
      const response = await createQuickTaskApi(payload);
      setAutoAssignedUserId(response.auto_assigned_user_id ?? null);
      return response;
    } catch (err) {
      const quickTaskError = err as QuickTaskApiError;
      const message = quickTaskError?.message || "Errore creazione quick task";

      setError(message);
      setStatusCode(typeof quickTaskError?.status === "number" ? quickTaskError.status : null);
      setMissingFields(Array.isArray(quickTaskError?.missingFields) ? quickTaskError.missingFields : []);

      throw err;
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  return {
    createQuickTask,
    isSubmitting,
    error,
    statusCode,
    missingFields,
    autoAssignedUserId,
    reset,
  };
}
