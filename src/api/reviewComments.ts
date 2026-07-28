import { authFetch, API_BASE } from "./auth";

// ─────────────────────────────────────────────────────────────────────────────
// Scheda Revisione di una lavorazione.
// Vedi app/api/v1/endpoints/work_item_review.py sul backend.
// ─────────────────────────────────────────────────────────────────────────────

const BASE = `${API_BASE}/api/v1/work-items`;

export type ReviewBadge = "operatore" | "pm" | "cliente";
export type ReviewCommentKind = "generic" | "rework";
export type ReviewSource = "interna" | "cliente";

export interface ReviewComment {
  id: number;
  work_item_id: number;
  author_user_id: number | null;
  author_name: string | null;
  author_badge: ReviewBadge;
  kind: ReviewCommentKind;
  source: ReviewSource | null;
  text: string;
  created_at: string | null;
}

export interface ReviewState {
  status: string;
  review_stage: ReviewSource | null;
  rework_count: number;
  rework_interna: number;
  last_review_source: ReviewSource | null;
  delivered_to_client_at: string | null;
  /** PED approvato dal cliente: torna in_progress a peso ridotto (da programmare). */
  client_approved_at: string | null;
  load_weight_factor: number | null;
  estimated_hours: number | null;
  deadline_date: string | null;
  reviewer_user_id: number | null;
}

export interface ReviewCommentsResponse {
  current_user_id: number;
  comments: ReviewComment[];
  review: ReviewState;
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string })?.detail ?? "Errore imprevisto");
  }
  return res.json() as Promise<T>;
}

export async function listReviewCommentsApi(workItemId: number): Promise<ReviewCommentsResponse> {
  const res = await authFetch(`${BASE}/${workItemId}/review-comments`);
  return jsonOrThrow(res);
}

export async function addReviewCommentApi(
  workItemId: number,
  body: { author_badge: ReviewBadge; kind: ReviewCommentKind; source?: ReviewSource | null; text: string }
): Promise<ReviewComment> {
  const res = await authFetch(`${BASE}/${workItemId}/review-comments`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return jsonOrThrow(res);
}

export async function sendToClientApi(workItemId: number, sent: boolean): Promise<ReviewState> {
  const res = await authFetch(`${BASE}/${workItemId}/review/send-to-client`, {
    method: "POST",
    body: JSON.stringify({ sent }),
  });
  return jsonOrThrow(res);
}

export async function sendBackApi(
  workItemId: number,
  body: { source?: ReviewSource; text?: string | null; load_weight_factor?: number | null }
): Promise<ReviewState> {
  const res = await authFetch(`${BASE}/${workItemId}/review/send-back`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return jsonOrThrow(res);
}

/** Approvazione cliente (PED): torna in_progress a peso ridotto (~10%), da programmare. */
export async function approveReviewApi(
  workItemId: number,
  body: { text?: string | null; load_weight_factor?: number | null } = {}
): Promise<ReviewState> {
  const res = await authFetch(`${BASE}/${workItemId}/review/approve`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return jsonOrThrow(res);
}
