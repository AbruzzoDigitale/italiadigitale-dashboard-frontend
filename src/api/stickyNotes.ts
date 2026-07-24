import { authFetch, API_BASE } from "./auth";

const BASE = `${API_BASE}/api/v1/sticky-notes`;

/** Nota adesiva sulla dashboard. Geometria in celle (griglia 12 colonne). */
export interface StickyNote {
  id: number;
  text: string;
  color: string;
  x: number;
  y: number;
  w: number;
  h: number;
  group_id: number | null;
  z: number;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface StickyNoteCreate {
  text?: string;
  color?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  group_id?: number | null;
  z?: number;
}

export type StickyNoteUpdate = Partial<Omit<StickyNote, "id" | "created_at" | "updated_at">>;

export interface StickyNoteGeometry {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  group_id: number | null;
  z: number;
}

async function jsonOrThrow<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string })?.detail ?? fallback);
  }
  return res.json() as Promise<T>;
}

export async function listStickyNotesApi(companyId: number): Promise<StickyNote[]> {
  return jsonOrThrow(await authFetch(`${BASE}?company_id=${companyId}`), "Impossibile caricare le note");
}

export async function createStickyNoteApi(companyId: number, body: StickyNoteCreate): Promise<StickyNote> {
  return jsonOrThrow(
    await authFetch(`${BASE}?company_id=${companyId}`, { method: "POST", body: JSON.stringify(body) }),
    "Impossibile creare la nota",
  );
}

export async function updateStickyNoteApi(id: number, body: StickyNoteUpdate): Promise<StickyNote> {
  return jsonOrThrow(
    await authFetch(`${BASE}/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    "Impossibile aggiornare la nota",
  );
}

export async function bulkUpdateStickyNotesApi(
  companyId: number,
  notes: StickyNoteGeometry[],
): Promise<StickyNote[]> {
  return jsonOrThrow(
    await authFetch(`${BASE}/bulk?company_id=${companyId}`, { method: "PUT", body: JSON.stringify({ notes }) }),
    "Impossibile salvare le note",
  );
}

export async function deleteStickyNoteApi(id: number): Promise<void> {
  const res = await authFetch(`${BASE}/${id}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) throw new Error("Impossibile eliminare la nota");
}
