import { authFetch, API_BASE } from "./auth";

// ─────────────────────────────────────────────────────────────────────────────
// Verifica note di credito su Fatture in Cloud (area admin, SOLA LETTURA).
// Elenca le note di credito emesse e segnala quali NON sono collegate alla fattura
// che stornano. Ogni verifica viene salvata (run + righe). Vedi
// app/api/v1/endpoints/fic_credit_notes.py sul backend.
// ─────────────────────────────────────────────────────────────────────────────

const BASE = `${API_BASE}/api/v1/fic/credit-notes`;

export interface CreditNoteLine {
  id: number;
  fic_document_id: number | null;
  fic_document_url: string | null;
  numero: string | null;
  data: string | null; // "YYYY-MM-DD"
  cliente: string | null;
  importo: number | null;
  invoice_number: string | null;
  invoice_date: string | null;
  collegata: boolean;
  note: string | null;
  raw_json: Record<string, unknown> | null;
}

export interface CreditNoteCheck {
  id: number;
  anni: string | null;
  note_totali: number;
  note_collegate: number;
  note_scollegate: number;
  user_id: number | null;
  created_at: string | null;
  /** Fuori dallo storico "Verifiche recenti" (archiviata, non cancellata). */
  archived?: boolean;
  lines?: CreditNoteLine[];
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string })?.detail ?? "Errore imprevisto");
  }
  return res.json() as Promise<T>;
}

/** Lancia una verifica delle note di credito. `anni` = CSV opzionale (es. "2025,2026"). */
export async function runCreditNoteCheckApi(params?: { anni?: string; ficCompanyId?: number }): Promise<CreditNoteCheck> {
  const fd = new FormData();
  if (params?.anni) fd.append("anni", params.anni);
  if (params?.ficCompanyId) fd.append("fic_company_id", String(params.ficCompanyId));

  // FormData: niente Content-Type manuale (il browser aggiunge il boundary).
  const token = localStorage.getItem("id_token");
  const res = await fetch(`${BASE}/check`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  return jsonOrThrow(res);
}

/** Storico delle verifiche. `archived: true` restituisce SOLO quelle archiviate. */
export async function listCreditNoteChecksApi(archived = false): Promise<{ runs: CreditNoteCheck[] }> {
  const res = await authFetch(`${BASE}/runs${archived ? "?archived=true" : ""}`);
  return jsonOrThrow(res);
}

/** Toglie (o rimette) una verifica dallo storico. Non cancella nulla. */
export async function archiveCreditNoteCheckApi(
  checkId: number,
  archived = true,
): Promise<{ id: number; archived: boolean }> {
  const res = await authFetch(`${BASE}/runs/${checkId}/archive`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ archived }),
  });
  return jsonOrThrow(res);
}

export async function getCreditNoteCheckApi(checkId: number): Promise<CreditNoteCheck> {
  const res = await authFetch(`${BASE}/runs/${checkId}`);
  return jsonOrThrow(res);
}
