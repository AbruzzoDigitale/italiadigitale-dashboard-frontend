import { authFetch, API_BASE } from "./auth";

/** Una novità del feed, già normalizzata dal backend (vedi `app/schemas/feed.py`). */
export interface FeedItem {
  id: string;
  source: "work_item" | "deadline" | "trip" | "quote" | "contract" | "client" | "booking" | "notification";
  category: string;
  title: string;
  subtitle: string | null;
  meta: string | null;
  at: string;
  tone: "neutral" | "info" | "success" | "warning" | "danger";
  entity_type: string | null;
  entity_id: number | null;
}

export interface FeedResponse {
  items: FeedItem[];
  generated_at: string;
}

/** GET /api/v1/feed — ultime novità dell'utente, mescolate tra le aree del gestionale. */
export async function getFeedApi(params: { company_id?: number | null; limit?: number } = {}): Promise<FeedResponse> {
  const qs = new URLSearchParams();
  if (params.company_id != null) qs.set("company_id", String(params.company_id));
  if (params.limit != null) qs.set("limit", String(params.limit));
  const suffix = qs.toString() ? `?${qs}` : "";
  const res = await authFetch(`${API_BASE}/api/v1/feed${suffix}`);
  if (!res.ok) throw new Error(`[${res.status}] Impossibile recuperare le novità`);
  return res.json();
}

/** Dove porta una novità nel gestionale desktop. `null` = non apribile. */
export function feedRoute(item: FeedItem): string | null {
  const id = item.entity_id;
  switch (item.entity_type) {
    case "work_item":
      return id != null ? `/work-items?task=${id}` : "/work-items";
    case "expense_trip":
      return id != null ? `/rimborsi?trasferta=${id}` : "/rimborsi";
    case "meeting_room_booking":
      return id != null ? `/prenotazione-sale?booking=${id}` : "/prenotazione-sale";
    case "quote":
      return item.category === "Richieste" && id != null ? `/requests/edit?quote_id=${id}` : "/quotes";
    case "contract":
      return "/contracts-pipeline";
    case "client":
      return "/clients";
    default:
      // Le notifiche senza entità nota restano informative: nessuna destinazione.
      return null;
  }
}
