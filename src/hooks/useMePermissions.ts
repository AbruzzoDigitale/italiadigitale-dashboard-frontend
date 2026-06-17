import { useCallback, useEffect, useState } from "react";
import { getMePermissionsApi, type UserPermissions } from "../api/users";

interface UseMePermissionsResult {
  permissions: UserPermissions | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useMePermissions(enabled = true): UseMePermissionsResult {
  const [permissions, setPermissions] = useState<UserPermissions | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPermissions = useCallback(async () => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const value = await getMePermissionsApi();
      setPermissions(value);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore caricamento permessi");
    } finally {
      setIsLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void fetchPermissions();
  }, [fetchPermissions]);

  return {
    permissions,
    isLoading,
    error,
    refetch: () => void fetchPermissions(),
  };
}
