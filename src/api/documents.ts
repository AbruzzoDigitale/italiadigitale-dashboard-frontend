import { API_BASE, authFetch } from "./auth";

const BASE = `${API_BASE}/api/v1/documents`;

export type DocType = "generico" | "modello" | "modello_contratto" | "compilato";
export type DocFieldType = "text" | "textarea" | "date" | "number";
export type DocLinkEntityType = "client" | "contract" | "quote";

export interface DocumentLink {
  id: number;
  entity_type: DocLinkEntityType;
  entity_id: number;
  entity_label?: string | null;
  created_at?: string | null;
}

export interface TemplateField {
  id: number;
  tag_name: string;
  label: string;
  field_type: DocFieldType;
  source_path: string | null;
  is_in_document: boolean;
  occurrences: number;
  placeholder_len: number | null;
  sort_order: number;
  // Posizione sul documento (punti PDF, origine in alto a sinistra).
  page: number | null;
  pos_x: number | null;
  pos_y: number | null;
  pos_w: number | null;
  pos_h: number | null;
  font_size: number | null;
  placeholder_kind: "underscore" | "tag" | null;
}

export interface PageMetric {
  page: number;
  width: number;
  height: number;
}

export type OverlayElementType = "text" | "check" | "signature";

export interface OverlayElement {
  id?: string;
  type: OverlayElementType;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  value?: string | null;
  font_size?: number | null;
  signature_key?: string | null;
  /** Presente sugli elementi già salvati: firma su storage. */
  signature_blob_path?: string;
}

export interface OverlayState {
  version: number;
  values: Record<string, string>;
  elements: OverlayElement[];
  generated_at?: string;
}

export interface VisualScanResult {
  document_id: number;
  pages: PageMetric[];
  has_text_layer: boolean;
  fields_added: number;
  fields_updated: number;
  fields_missing: string[];
  fields: TemplateField[];
}

export interface DocumentItem {
  id: number;
  company_id: number;
  doc_type: DocType;
  title: string;
  description?: string | null;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  source_document_id?: number | null;
  has_pdf_cache: boolean;
  uploaded_by?: number | null;
  uploaded_by_name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  links: DocumentLink[];
}

export interface DocumentDetail extends DocumentItem {
  template_fields: TemplateField[];
  field_values?: Record<string, string> | null;
  source_document_title?: string | null;
  template_scanned_at?: string | null;
  has_fill_base: boolean;
  page_metrics?: PageMetric[] | null;
  overlay_elements?: OverlayState | null;
}

export interface FillPrefillField {
  tag_name: string;
  label: string;
  field_type: DocFieldType;
  source_path: string | null;
  is_in_document: boolean;
  placeholder_len: number | null;
  value: string;
}

export interface FillPrefill {
  document_id: number;
  contract_id: number;
  suggested_title: string;
  fields: FillPrefillField[];
}

export interface SignedUrl {
  url: string;
  filename: string;
  expires_at: string;
}

export interface SourcePathInfo {
  path: string;
  label: string;
  gruppo: string;
}

export interface ListDocumentsParams {
  company_id?: number | null;
  doc_type?: DocType;
  entity_type?: DocLinkEntityType;
  entity_id?: number;
  search?: string;
  include_compiled?: boolean;
  limit?: number;
  offset?: number;
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string })?.detail ?? "Errore imprevisto");
  }
  return res.json() as Promise<T>;
}

export async function listDocumentsApi(params: ListDocumentsParams = {}): Promise<DocumentItem[]> {
  const qs = new URLSearchParams();
  if (params.company_id != null) qs.set("company_id", String(params.company_id));
  if (params.doc_type) qs.set("doc_type", params.doc_type);
  if (params.entity_type && params.entity_id != null) {
    qs.set("entity_type", params.entity_type);
    qs.set("entity_id", String(params.entity_id));
  }
  if (params.search) qs.set("search", params.search);
  if (params.include_compiled === false) qs.set("include_compiled", "false");
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.offset != null) qs.set("offset", String(params.offset));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return jsonOrThrow(await authFetch(`${BASE}${suffix}`));
}

export async function getDocumentApi(id: number): Promise<DocumentDetail> {
  return jsonOrThrow(await authFetch(`${BASE}/${id}`));
}

export async function uploadDocumentApi(input: {
  file: File;
  company_id: number;
  doc_type: DocType;
  title?: string;
  description?: string;
  links?: Array<{ entity_type: DocLinkEntityType; entity_id: number }>;
}): Promise<DocumentDetail> {
  // Multipart: fetch raw (authFetch forza Content-Type JSON) + solo Authorization.
  const token = localStorage.getItem("id_token");
  const form = new FormData();
  form.append("file", input.file);
  form.append("company_id", String(input.company_id));
  form.append("doc_type", input.doc_type);
  if (input.title) form.append("title", input.title);
  if (input.description) form.append("description", input.description);
  if (input.links?.length) form.append("links", JSON.stringify(input.links));

  const res = await fetch(`${BASE}/upload`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  return jsonOrThrow(res);
}

export async function updateDocumentApi(
  id: number,
  body: { title?: string; description?: string }
): Promise<DocumentItem> {
  const res = await authFetch(`${BASE}/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return jsonOrThrow(res);
}

export async function deleteDocumentApi(id: number, purge = false): Promise<void> {
  const res = await authFetch(`${BASE}/${id}${purge ? "?purge=true" : ""}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string })?.detail ?? "Impossibile eliminare il documento");
  }
}

export async function addDocumentLinkApi(
  documentId: number,
  body: { entity_type: DocLinkEntityType; entity_id: number }
): Promise<DocumentLink> {
  const res = await authFetch(`${BASE}/${documentId}/links`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return jsonOrThrow(res);
}

export async function removeDocumentLinkApi(documentId: number, linkId: number): Promise<void> {
  const res = await authFetch(`${BASE}/${documentId}/links/${linkId}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string })?.detail ?? "Impossibile rimuovere il collegamento");
  }
}

export async function listTemplateFieldsApi(documentId: number): Promise<TemplateField[]> {
  return jsonOrThrow(await authFetch(`${BASE}/${documentId}/template-fields`));
}

export async function updateTemplateFieldApi(
  documentId: number,
  fieldId: number,
  body: {
    label?: string;
    field_type?: DocFieldType;
    source_path?: string | null;
    clear_source_path?: boolean;
  }
): Promise<TemplateField> {
  const res = await authFetch(`${BASE}/${documentId}/template-fields/${fieldId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return jsonOrThrow(res);
}

export async function deleteTemplateFieldApi(documentId: number, fieldId: number): Promise<void> {
  const res = await authFetch(`${BASE}/${documentId}/template-fields/${fieldId}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string })?.detail ?? "Impossibile eliminare il campo");
  }
}

export async function visualScanApi(documentId: number, force = false): Promise<VisualScanResult> {
  const suffix = force ? "?force=true" : "";
  return jsonOrThrow(await authFetch(`${BASE}/${documentId}/visual-scan${suffix}`, { method: "POST" }));
}

/** Scarica il PDF su cui si compila (serve a pdf.js, richiede il bearer). */
export async function fetchFillBaseApi(documentId: number): Promise<ArrayBuffer> {
  const token = localStorage.getItem("id_token");
  const res = await fetch(`${BASE}/${documentId}/fill-base`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string })?.detail ?? "Documento non disponibile");
  }
  return res.arrayBuffer();
}

export async function visualFillApi(
  documentId: number,
  body: {
    contract_id: number;
    title?: string;
    values: Record<string, string>;
    elements: OverlayElement[];
    signatures: Record<string, string>;
  }
): Promise<DocumentDetail> {
  const res = await authFetch(`${BASE}/${documentId}/visual-fill`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return jsonOrThrow(res);
}

export async function updateVisualOverlayApi(
  documentId: number,
  body: {
    values: Record<string, string>;
    elements: OverlayElement[];
    signatures: Record<string, string>;
  }
): Promise<DocumentDetail> {
  const res = await authFetch(`${BASE}/${documentId}/visual-overlay`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return jsonOrThrow(res);
}

export async function getFillPrefillApi(documentId: number, contractId: number): Promise<FillPrefill> {
  return jsonOrThrow(
    await authFetch(`${BASE}/${documentId}/fill/prefill?contract_id=${contractId}`)
  );
}

export async function getDocumentDownloadUrlApi(
  documentId: number,
  options: { variant?: "original" | "fillbase"; disposition?: "attachment" | "inline" } = {}
): Promise<SignedUrl> {
  const qs = new URLSearchParams();
  if (options.variant) qs.set("variant", options.variant);
  if (options.disposition) qs.set("disposition", options.disposition);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return jsonOrThrow(await authFetch(`${BASE}/${documentId}/download${suffix}`));
}

export async function exportDocumentPdfApi(
  documentId: number,
  options: { disposition?: "attachment" | "inline" } = {}
): Promise<SignedUrl> {
  const suffix = options.disposition ? `?disposition=${options.disposition}` : "";
  return jsonOrThrow(await authFetch(`${BASE}/${documentId}/export/pdf${suffix}`));
}

export async function listSourcePathsApi(): Promise<SourcePathInfo[]> {
  return jsonOrThrow(await authFetch(`${BASE}/meta/source-paths`));
}

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  generico: "Documento",
  modello: "Modello",
  modello_contratto: "Modello contratto",
  compilato: "Compilato",
};

export function formatDocSize(bytes: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
