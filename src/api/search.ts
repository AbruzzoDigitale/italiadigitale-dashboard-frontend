import { authFetch, API_BASE } from "./auth";

export interface SearchGroup {
  tipo: string;
  etichetta: string;
  records: Record<string, unknown>[];
  totale: number;
}

export interface SearchResponse {
  query: string;
  gruppi: SearchGroup[];
}

/**
 * Ricerca globale nel gestionale.
 *
 * Non passa da un modello: sono query dirette, già scopate per ruolo lato server.
 * L'Oracolo è un'altra cosa, ed è la riga in fondo alla tendina.
 */
export async function searchApi(q: string, signal?: AbortSignal): Promise<SearchResponse> {
  const res = await authFetch(`${API_BASE}/api/v1/search?q=${encodeURIComponent(q)}`, { signal });
  if (!res.ok) throw new Error("Ricerca non riuscita");
  return res.json();
}
