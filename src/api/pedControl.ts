import { authFetch, API_BASE } from "./auth";

// ── Types ────────────────────────────────────────────────────────────────────

export interface PedStatus {
  id: number;
  company_id: number | null;
  slug: string;
  label: string;
  short_label: string;
  color: string;
  sort_order: number;
  is_system: boolean;
}

export interface PedControlMonth {
  year: number;
  month: number;
  /** Etichetta mese, es. "giugno 2026". */
  label: string;
}

export interface PedControlCell {
  /** La cella corrisponde a una task PED reale (is_ped) del cliente in quel mese. */
  work_item_id: number | null;
  title: string | null;
  ped_status_id: number | null;
  status_slug: string | null;
  /** Stato workflow della task (planned/in_progress/review/completed), informativo. */
  work_status: string | null;
  /** Link al PED (URL al piano editoriale): mostrato cliccabile nella cella. */
  link_ped: string | null;
}

export interface PedControlRow {
  client_id: number;
  client_name: string;
  /** Chiave "YYYY-MM", es. "2026-06". */
  cells: Record<string, PedControlCell>;
}

export interface PedControlResponse {
  from_year: number;
  from_month: number;
  to_year: number;
  to_month: number;
  months: PedControlMonth[];
  statuses: PedStatus[];
  rows: PedControlRow[];
}

export interface GetPedControlParams {
  company_id: number;
  from_year: number;
  from_month: number;
  to_year: number;
  to_month: number;
}

export interface UpsertPedCellPayload {
  company_id: number;
  work_item_id: number;
  ped_status_id: number | null;
}

export interface UpsertPedCellResponse {
  work_item_id: number | null;
  title: string | null;
  ped_status_id: number | null;
  status_slug: string | null;
  work_status: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseApiError(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;

  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail === "string" && detail.trim()) return detail;

  if (Array.isArray(detail) && detail.length > 0) {
    const messages = detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          const msg = (item as { msg?: unknown }).msg;
          if (typeof msg === "string" && msg.trim()) return msg;
        }
        return null;
      })
      .filter((message): message is string => !!message);

    if (messages.length > 0) return messages.join("; ");
  }

  const message = (body as { message?: unknown }).message;
  if (typeof message === "string" && message.trim()) return message;

  const error = (body as { error?: unknown }).error;
  if (typeof error === "string" && error.trim()) return error;

  return fallback;
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value == null || value === "") return;
    query.set(key, String(value));
  });
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

// ── API calls ────────────────────────────────────────────────────────────────

export async function getPedStatusesApi(companyId: number): Promise<PedStatus[]> {
  const qs = buildQuery({ company_id: companyId });
  const res = await authFetch(`${API_BASE}/api/v1/ped/statuses${qs}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Impossibile recuperare gli stati PED")}`);
  }
  return res.json();
}

export async function getPedControlApi(params: GetPedControlParams): Promise<PedControlResponse> {
  const qs = buildQuery({
    company_id: params.company_id,
    from_year: params.from_year,
    from_month: params.from_month,
    to_year: params.to_year,
    to_month: params.to_month,
  });
  const res = await authFetch(`${API_BASE}/api/v1/ped/control${qs}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Impossibile recuperare il controllo PED")}`);
  }
  return res.json();
}

export async function upsertPedCellApi(payload: UpsertPedCellPayload): Promise<UpsertPedCellResponse> {
  const res = await authFetch(`${API_BASE}/api/v1/ped/control/cell`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Impossibile aggiornare la cella PED")}`);
  }
  return res.json();
}

// ── Gestione stati (admin) ─────────────────────────────────────────────────────

export interface CreatePedStatusPayload {
  company_id: number;
  label: string;
  short_label?: string | null;
  color: string;
  sort_order?: number | null;
}

export interface UpdatePedStatusPayload {
  label?: string;
  short_label?: string;
  color?: string;
  sort_order?: number;
  is_active?: boolean;
}

export async function createPedStatusApi(payload: CreatePedStatusPayload): Promise<PedStatus> {
  const res = await authFetch(`${API_BASE}/api/v1/ped/statuses`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Impossibile creare lo stato PED")}`);
  }
  return res.json();
}

export async function updatePedStatusApi(statusId: number, payload: UpdatePedStatusPayload): Promise<PedStatus> {
  const res = await authFetch(`${API_BASE}/api/v1/ped/statuses/${statusId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Impossibile aggiornare lo stato PED")}`);
  }
  return res.json();
}

export async function deletePedStatusApi(statusId: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/api/v1/ped/statuses/${statusId}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Impossibile eliminare lo stato PED")}`);
  }
}
