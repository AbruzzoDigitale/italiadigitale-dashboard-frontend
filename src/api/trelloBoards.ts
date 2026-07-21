import { authFetch, API_BASE } from "./auth";
import type { ClientTrelloBoard } from "./clients";

export interface TrelloLiveBoard {
  id: string;
  name: string;
  url: string;
  closed?: boolean;
}

export interface CreateTrelloBoardPayload {
  company_id: number;
  trello_board_id: string;
  name: string;
  url: string;
}

function parseApiError(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  const message = (body as { message?: unknown }).message;
  if (typeof message === "string" && message.trim()) return message;
  const error = (body as { error?: unknown }).error;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

export async function listTrelloBoardsApi(companyId: number): Promise<ClientTrelloBoard[]> {
  const res = await authFetch(`${API_BASE}/api/v1/trello-boards?company_id=${companyId}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Impossibile recuperare le board Trello")}`);
  }
  return res.json();
}

export async function listLiveTrelloBoardsApi(
  companyId: number,
  includeClosed = false,
  source: "workspace" | "member" = "workspace"
): Promise<TrelloLiveBoard[]> {
  const qs = new URLSearchParams({ company_id: String(companyId), source });
  if (includeClosed) qs.set("include_closed", "true");
  const res = await authFetch(`${API_BASE}/api/v1/trello-boards/live?${qs.toString()}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Impossibile recuperare le board live Trello")}`);
  }
  return res.json();
}

export async function createTrelloBoardApi(payload: CreateTrelloBoardPayload): Promise<ClientTrelloBoard> {
  const res = await authFetch(`${API_BASE}/api/v1/trello-boards`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Impossibile salvare la board Trello")}`);
  }
  return res.json();
}