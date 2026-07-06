import { authFetch, API_BASE } from "./auth";

export type BillingType = "canone" | "una_tantum";
export type BillingState = "da_fatturare" | "fatturato";

export interface BillingItem {
  /** id della riga persistita se gia' emessa, altrimenti null (voce derivata) */
  id: number | null;
  work_item_id: number;
  contract_id: number | null;
  client_id: number | null;
  client_name: string;
  title: string;
  source: string | null;
  type: BillingType;
  period_month: string | null; // "YYYY-MM"
  month_label: string | null; // es. "Giugno 2026"
  amount: number;
  state: BillingState;
  invoice_number: string | null;
  fic_id: string | null;
  fic_document_url: string | null;
  invoiced_at: string | null;
  aging_days: number | null;
  completed_at: string | null;
}

export interface BillingSummary {
  todo_count: number;
  todo_total: number;
  billed_total: number;
  canone_total: number;
  tantum_total: number;
}

export interface BillingItemsResponse {
  month: string; // "YYYY-MM"
  month_label: string;
  items: BillingItem[];
  forgotten: BillingItem[];
  summary: BillingSummary;
}

export interface BillingClientSummary {
  to_issue_count: number;
  to_issue_total: number;
  issued_count: number;
  issued_total: number;
  canone_total: number;
  tantum_total: number;
}

export interface BillingClientResponse {
  client_id: number;
  items: BillingItem[];
  summary: BillingClientSummary;
}

function parseApiError(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail;
  }
  return fallback;
}

/** Voci fatturabili del mese (YYYY-MM). Omesso => mese corrente lato server. */
export async function listBillingItemsApi(month?: string): Promise<BillingItemsResponse> {
  const qs = new URLSearchParams();
  if (month) qs.set("month", month);
  const suffix = qs.toString() ? `?${qs}` : "";
  const res = await authFetch(`${API_BASE}/api/v1/billing/items${suffix}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Impossibile recuperare le voci di fatturazione"));
  }
  return res.json();
}

/** Tutte le voci di fatturazione di un cliente (ogni mese, emesse + da emettere). */
export async function listClientBillingApi(clientId: number): Promise<BillingClientResponse> {
  const res = await authFetch(`${API_BASE}/api/v1/billing/by-client/${clientId}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Impossibile recuperare la fatturazione del cliente"));
  }
  return res.json();
}

/** Genera/emette la fattura per la lavorazione (persiste stato 'fatturato'). */
export async function generateBillingItemApi(
  workItemId: number,
  pushToFic = false
): Promise<BillingItem> {
  const res = await authFetch(`${API_BASE}/api/v1/billing/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ work_item_id: workItemId, push_to_fic: pushToFic }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Impossibile generare la fattura"));
  }
  return res.json();
}

/** Annulla l'emissione: la lavorazione torna 'da fatturare'. */
export async function cancelBillingItemApi(workItemId: number): Promise<BillingItem> {
  const res = await authFetch(`${API_BASE}/api/v1/billing/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ work_item_id: workItemId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Impossibile annullare la fattura"));
  }
  return res.json();
}

// ── Documenti di fatturazione (accorpamento di N voci in una fattura) ─────────

export interface BillingDocumentItem {
  id: number;
  work_item_id: number | null;
  title: string;
  area: string | null;
  type: "canone" | "una_tantum";
  period_month: string | null;
  month_label: string | null;
  amount: number;
}

export interface BillingDocument {
  id: number;
  company_id: number;
  client_id: number | null;
  oggetto: string;
  due_date: string | null;
  numeration: string | null;
  state: string;
  total: number;
  invoice_number: string | null;
  fic_id: string | null;
  fic_document_url: string | null;
  invoiced_at: string | null;
  created_at: string | null;
  items: BillingDocumentItem[];
}

export interface CreateBillingDocumentPayload {
  work_item_ids: number[];
  oggetto?: string | null;
  due_date?: string | null;
  numeration?: string | null;
  push_to_fic?: boolean;
}

/** Accorpa N lavorazioni completate in un unico documento (fattura) con oggetto e scadenza. */
export async function createBillingDocumentApi(payload: CreateBillingDocumentPayload): Promise<BillingDocument> {
  const res = await authFetch(`${API_BASE}/api/v1/billing/documents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Impossibile creare la fattura"));
  }
  return res.json();
}

export async function listBillingDocumentsApi(): Promise<BillingDocument[]> {
  const res = await authFetch(`${API_BASE}/api/v1/billing/documents`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Impossibile caricare le fatture"));
  }
  return res.json();
}

export async function getBillingDocumentApi(documentId: number): Promise<BillingDocument> {
  const res = await authFetch(`${API_BASE}/api/v1/billing/documents/${documentId}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Impossibile caricare la fattura"));
  }
  return res.json();
}
