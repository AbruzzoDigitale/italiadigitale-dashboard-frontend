import { authFetch, API_BASE } from "./auth";
import type { NotificationPreferences } from "../features/notifications/notificationPreferences";
import type { NotifItem, NotifTabKey } from "../features/notifications/notificationsData";

export interface NotificationListResponse {
  items: NotifItem[];
  unread_counts: Record<NotifTabKey, number>;
}

/** Lista notifiche dell'utente loggato + conteggi non lette per scheda. */
export async function getMyNotificationsApi(limit = 100): Promise<NotificationListResponse> {
  const res = await authFetch(`${API_BASE}/api/v1/notifications?limit=${limit}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Impossibile recuperare le notifiche")}`);
  }
  return res.json();
}

export async function markNotificationReadApi(id: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/api/v1/notifications/${id}/read`, { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Impossibile segnare come letta")}`);
  }
}

// ── Comunicazioni (admin/PM) ──────────────────────────────────────────────────

export type CommunicationScope = "globale" | "area" | "operatore";

export interface CommunicationItem {
  id: number;
  company_id: number;
  scope: CommunicationScope;
  title: string;
  body: string | null;
  work_area_id: number | null;
  work_area_name: string | null;
  target_user_ids: number[] | null;
  author_name: string | null;
  created_at: string;
  time: string;
  recipients_count: number;
  read_count: number;
}

export interface CreateCommunicationPayload {
  company_id: number;
  scope: CommunicationScope;
  title: string;
  body?: string | null;
  work_area_id?: number | null;
  target_user_ids?: number[] | null;
}

export async function getCommunicationsApi(companyId: number): Promise<CommunicationItem[]> {
  const res = await authFetch(`${API_BASE}/api/v1/notifications/communications?company_id=${companyId}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Impossibile recuperare le comunicazioni")}`);
  }
  return res.json();
}

export async function createCommunicationApi(payload: CreateCommunicationPayload): Promise<CommunicationItem> {
  const res = await authFetch(`${API_BASE}/api/v1/notifications/communications`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Impossibile inviare la comunicazione")}`);
  }
  return res.json();
}

export async function deleteCommunicationApi(id: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/api/v1/notifications/communications/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Impossibile eliminare la comunicazione")}`);
  }
}

export async function markAllNotificationsReadApi(tab?: NotifTabKey): Promise<void> {
  const res = await authFetch(`${API_BASE}/api/v1/notifications/read-all`, {
    method: "POST",
    body: JSON.stringify(tab ? { tab } : {}),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Impossibile segnare tutte come lette")}`);
  }
}

function parseApiError(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const msg = detail
      .map((item) => (typeof item === "string" ? item : (item as { msg?: string })?.msg))
      .filter(Boolean)
      .join("; ");
    if (msg) return msg;
  }
  return fallback;
}

/** Preferenze notifiche dell'utente loggato. */
export async function getMyNotificationPreferencesApi(): Promise<NotificationPreferences> {
  const res = await authFetch(`${API_BASE}/api/v1/notifications/preferences`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Impossibile recuperare le preferenze notifiche")}`);
  }
  return res.json();
}

export async function updateMyNotificationPreferencesApi(
  payload: NotificationPreferences,
): Promise<NotificationPreferences> {
  const res = await authFetch(`${API_BASE}/api/v1/notifications/preferences`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${parseApiError(body, "Impossibile salvare le preferenze notifiche")}`);
  }
  return res.json();
}
