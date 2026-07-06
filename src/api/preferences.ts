import { authFetch, API_BASE } from "./auth";

/**
 * Preferenze UI per-utente (dict generico salvato lato server).
 * Degradano in silenzio: se l'endpoint non è disponibile, il chiamante
 * ricade sul localStorage.
 */
export async function getUiPreferencesApi(): Promise<Record<string, unknown>> {
  const res = await authFetch(`${API_BASE}/api/v1/users/me/ui-preferences`);
  if (!res.ok) throw new Error(`[${res.status}] impossibile leggere le preferenze`);
  return res.json();
}

export async function saveUiPreferenceApi(patch: Record<string, unknown>): Promise<void> {
  const res = await authFetch(`${API_BASE}/api/v1/users/me/ui-preferences`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`[${res.status}] impossibile salvare le preferenze`);
}
