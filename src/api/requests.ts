import {
  type CreateQuotePayload,
  type ListQuotesParams,
  type Quote,
  type QuoteStatus,
  type QuotesListResponse,
  type QuotePreviewResponse,
  type UpdateQuotePayload,
} from "./quotes";
import { authFetch, API_BASE } from "./auth";
import type { BulkDeleteResponse } from "./bulk";

export async function getRequestsApi(params?: ListQuotesParams): Promise<QuotesListResponse> {
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  if (params?.status) qs.set("status", params.status);
  if (params?.company_id != null) qs.set("company_id", String(params.company_id));
  if (params?.client_id != null) qs.set("client_id", String(params.client_id));
  if (params?.page != null) qs.set("page", String(params.page));
  if (params?.per_page != null) qs.set("per_page", String(params.per_page));
  if (params?.sort_by) qs.set("sort_by", params.sort_by);
  if (params?.sort_dir) qs.set("sort_dir", params.sort_dir);
  const suffix = qs.toString() ? `?${qs}` : "";
  const res = await authFetch(`${API_BASE}/api/v1/requests${suffix}`);
  if (!res.ok) {
    if (res.status === 403) throw new Error("[403] Accesso negato alla lista richieste");
    throw new Error("Impossibile recuperare la lista richieste");
  }
  return res.json();
}

export async function getRequestApi(id: number): Promise<Quote> {
  const res = await authFetch(`${API_BASE}/api/v1/requests/${id}`);
  if (!res.ok) {
    if (res.status === 403) throw new Error("[403] Accesso negato alla richiesta");
    throw new Error("Richiesta non trovata");
  }
  return res.json();
}

export async function createRequestApi(payload: CreateQuotePayload): Promise<Quote> {
  const res = await authFetch(`${API_BASE}/api/v1/requests`, {
    method: "POST",
    body: JSON.stringify({ ...payload, kind: "richiesta" }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? "Errore nella creazione richiesta");
  }
  return res.json();
}

export async function createRequestFromConfiguratorApi(payload: CreateQuotePayload): Promise<Quote> {
  const res = await authFetch(`${API_BASE}/api/v1/requests/from-configurator`, {
    method: "POST",
    body: JSON.stringify({ ...payload, kind: "richiesta" }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? "Errore nella creazione richiesta da configuratore");
  }
  return res.json();
}

export async function createRequestFromConfiguratorPreviewApi(payload: CreateQuotePayload): Promise<QuotePreviewResponse> {
  const res = await authFetch(`${API_BASE}/api/v1/requests/from-configurator/preview`, {
    method: "POST",
    body: JSON.stringify({ ...payload, kind: "richiesta" }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? "Errore nella preview richiesta da configuratore");
  }
  return res.json();
}

export async function updateRequestApi(id: number, payload: UpdateQuotePayload): Promise<Quote> {
  const res = await authFetch(`${API_BASE}/api/v1/requests/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ ...payload, kind: "richiesta" }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? "Errore nella modifica richiesta");
  }
  return res.json();
}

export async function updateRequestStatusApi(id: number, status: QuoteStatus): Promise<Quote> {
  const res = await authFetch(`${API_BASE}/api/v1/requests/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? "Transizione non valida");
  }
  return res.json();
}

/** Converte una richiesta approvata in un preventivo (solo admin). */
export async function convertRequestToQuoteApi(id: number): Promise<Quote> {
  const res = await authFetch(`${API_BASE}/api/v1/requests/${id}/convert-to-quote`, {
    method: "POST",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? "Errore nella conversione in preventivo");
  }
  return res.json();
}

export async function duplicateRequestApi(id: number): Promise<Quote> {
  const res = await authFetch(`${API_BASE}/api/v1/requests/${id}/duplicate`, {
    method: "POST",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? "Errore nella duplicazione richiesta");
  }
  return res.json();
}

export async function deleteRequestApi(id: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/api/v1/requests/${id}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 204) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? "Errore nell'eliminazione richiesta");
  }
}

export async function bulkDeleteRequestsApi(ids: number[]): Promise<BulkDeleteResponse> {
  const res = await authFetch(`${API_BASE}/api/v1/requests/bulk-delete`, {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? "Errore nell'eliminazione bulk richieste");
  }
  return res.json();
}
