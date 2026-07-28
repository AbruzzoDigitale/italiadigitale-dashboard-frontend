import { authFetch, API_BASE } from "./auth";

// Situazioni con peso di default configurabile per azienda (fallback ai default di codice).
export type WorkloadWeightSituationKey =
  | "review_pm"
  | "carried_over"
  | "awaiting_publish"
  | "rework"
  | "justified_delay"
  | "client_protection";

export interface WorkloadWeightSituation {
  key: WorkloadWeightSituationKey;
  label: string;
  help: string;
  factor: number;
  locked: boolean;
  default_factor: number;
}

export interface WorkloadWeightsConfig {
  editable: boolean;
  situations: WorkloadWeightSituation[];
}

// Payload di salvataggio: per ogni situazione modificata, factor e/o locked.
export type WorkloadWeightsUpdate = Partial<
  Record<WorkloadWeightSituationKey, { factor?: number; locked?: boolean }>
>;

function parseApiError(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail;
  }
  return fallback;
}

export async function getWorkloadWeightsApi(companyId: number): Promise<WorkloadWeightsConfig> {
  const res = await authFetch(`${API_BASE}/api/v1/workload/weights?company_id=${companyId}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Impossibile recuperare i pesi del carico")}`);
  }
  return res.json();
}

export async function updateWorkloadWeightsApi(
  companyId: number,
  weights: WorkloadWeightsUpdate,
): Promise<WorkloadWeightsConfig> {
  const res = await authFetch(`${API_BASE}/api/v1/workload/weights?company_id=${companyId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ weights }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Errore nel salvataggio dei pesi del carico")}`);
  }
  return res.json();
}
