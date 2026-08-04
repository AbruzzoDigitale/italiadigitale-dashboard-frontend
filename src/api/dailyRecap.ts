import { authFetch, API_BASE } from "./auth";
import type { RecapTemplate } from "../features/daily-recap/recapTemplate";

// Template aziendale del recap giornaliero (Attività del giorno).
// Vedi app/api/v1/endpoints/daily_recap.py.

const BASE = `${API_BASE}/api/v1/daily-recap`;

export async function getRecapTemplateApi(companyId: number): Promise<RecapTemplate | null> {
  const res = await authFetch(`${BASE}/template?company_id=${companyId}`);
  if (!res.ok) throw new Error("Impossibile caricare il template del recap");
  const body = (await res.json()) as { template: RecapTemplate | null };
  return body.template && Array.isArray(body.template.blocks) ? body.template : null;
}

/** template = null → rimuove la personalizzazione (torna al default di serie). */
export async function saveRecapTemplateApi(
  companyId: number,
  template: RecapTemplate | null
): Promise<void> {
  const res = await authFetch(`${BASE}/template?company_id=${companyId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ template }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string })?.detail ?? "Salvataggio template non riuscito");
  }
}
