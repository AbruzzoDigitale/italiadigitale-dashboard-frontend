import { authFetch, API_BASE } from "./auth";

// ─────────────────────────────────────────────────────────────────────────────
// Import card Trello → lavorazioni + mappatura membri Trello → utenti.
// Vedi app/api/v1/endpoints/trello_import.py sul backend.
// ─────────────────────────────────────────────────────────────────────────────

const BASE = `${API_BASE}/api/v1/trello-import`;

export interface TrelloMemberMapItem {
  trello_member_id: string;
  trello_username: string | null;
  trello_full_name: string | null;
  user_id: number | null;
}

export interface TrelloPreviewCard {
  trello_card_id: string;
  name: string;
  desc: string | null;
  list_name: string | null;
  status: string;
  deadline_date: string | null;
  due_complete: boolean;
  assignee_ids: number[];
  assignee_names: (string | null)[];
  unmapped_member_ids: string[];
  labels: string[];
  url: string | null;
  already_imported_work_item_id: number | null;
}

export interface TrelloImportResult {
  created: number;
  skipped: number;
  work_item_ids: number[];
  client_id: number | null;
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string })?.detail ?? "Errore imprevisto");
  }
  return res.json() as Promise<T>;
}

// ── Mappatura membri ─────────────────────────────────────────────────────────
export async function getBoardMembersApi(companyId: number, boardId: string): Promise<{ members: TrelloMemberMapItem[] }> {
  return jsonOrThrow(await authFetch(`${BASE}/members?company_id=${companyId}&board_id=${boardId}`));
}

export async function getMemberMapApi(companyId: number): Promise<{ items: TrelloMemberMapItem[] }> {
  return jsonOrThrow(await authFetch(`${BASE}/member-map?company_id=${companyId}`));
}

export async function saveMemberMapApi(companyId: number, items: TrelloMemberMapItem[]): Promise<{ items: TrelloMemberMapItem[] }> {
  return jsonOrThrow(
    await authFetch(`${BASE}/member-map?company_id=${companyId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    })
  );
}

// ── Anteprima + import ───────────────────────────────────────────────────────
export async function previewTrelloCardsApi(
  companyId: number,
  boardId: string,
  workflowOnly = true
): Promise<{ cards: TrelloPreviewCard[]; board_id: string }> {
  return jsonOrThrow(
    await authFetch(`${BASE}/cards?company_id=${companyId}&board_id=${boardId}&workflow_only=${workflowOnly}`)
  );
}

export async function importTrelloCardsApi(
  companyId: number,
  body: { board_id: string; client_id?: number | null; card_ids: string[] }
): Promise<TrelloImportResult> {
  return jsonOrThrow(
    await authFetch(`${BASE}/import?company_id=${companyId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}
