import { authFetch, API_BASE } from "./auth";

// ── Types ────────────────────────────────────────────────────────────────────

export interface QuickLink {
  id: number;
  title: string;
  url: string;
  favicon_url: string | null;
  position: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface CreateQuickLinkPayload {
  title: string;
  url: string;
  favicon_url?: string | null;
}

export interface UpdateQuickLinkPayload {
  title?: string;
  url?: string;
  favicon_url?: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseApiError(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail === "string" && detail.trim()) return detail;
  }
  return fallback;
}

const BASE = `${API_BASE}/api/v1/quick-links`;

// ── API calls ────────────────────────────────────────────────────────────────

export async function listQuickLinksApi(): Promise<QuickLink[]> {
  const res = await authFetch(BASE);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Impossibile recuperare i collegamenti rapidi")}`);
  }
  return res.json();
}

export async function createQuickLinkApi(payload: CreateQuickLinkPayload): Promise<QuickLink> {
  const res = await authFetch(BASE, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Impossibile creare il collegamento")}`);
  }
  return res.json();
}

export async function updateQuickLinkApi(
  id: number,
  payload: UpdateQuickLinkPayload,
): Promise<QuickLink> {
  const res = await authFetch(`${BASE}/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Impossibile aggiornare il collegamento")}`);
  }
  return res.json();
}

export async function deleteQuickLinkApi(id: number): Promise<void> {
  const res = await authFetch(`${BASE}/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Impossibile eliminare il collegamento")}`);
  }
}

/** L'ordine dell'array `ids` diventa il nuovo ordinamento delle posizioni. */
export async function reorderQuickLinksApi(ids: number[]): Promise<QuickLink[]> {
  const res = await authFetch(`${BASE}/reorder`, {
    method: "PUT",
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Impossibile riordinare i collegamenti")}`);
  }
  return res.json();
}
