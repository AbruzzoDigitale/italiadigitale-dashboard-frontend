import { API_BASE, authFetch } from "./auth";

const BASE = `${API_BASE}/api/v1/documents`;

export type DocType =
  | "generico"
  | "modello"
  | "modello_contratto"
  | "parte_contratto"
  | "compilato";
export type DocFieldType = "text" | "textarea" | "date" | "number" | "signature";
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
  /** Etichetta scelta dall'utente, mostrata al posto del testo estratto dal PDF. */
  display_label: string | null;
  field_type: DocFieldType;
  source_path: string | null;
  /** Sezione (area) del form a cui appartiene il campo. */
  group_key: string | null;
  /** Il cliente deve compilarlo prima di firmare. */
  required: boolean;
  /** "client" = precompilato ma modificabile dal cliente; "internal" = dato azienda, bloccato. */
  audience: "client" | "internal";
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

export interface DocumentPart {
  id: number;
  link_id: number;
  part_document_id: number;
  title: string;
  sort_order: number;
  original_filename: string;
  page_count: number;
  field_count: number;
  created_at?: string | null;
}

/** Sezione (area) del form di compilazione. */
export interface FieldArea {
  key: string;
  label: string;
  icon?: string | null;
  sub?: string | null;
  /** Solo compositori: documento-parte d'origine dell'area. */
  part_document_id?: number | null;
  sort_order?: number;
}

export interface DocumentDetail extends DocumentItem {
  template_fields: TemplateField[];
  field_values?: Record<string, string> | null;
  field_areas?: FieldArea[] | null;
  source_document_title?: string | null;
  template_scanned_at?: string | null;
  has_fill_base: boolean;
  page_metrics?: PageMetric[] | null;
  overlay_elements?: (OverlayState & { part_ids?: number[] }) | null;
  parts: DocumentPart[];
}

/** Richiesta di firma cliente (link tokenizzato + stato). */
export type SignatureStatus =
  | "draft"
  | "sent"
  | "opened"
  | "filled"
  | "signing"
  | "signed"
  | "refused"
  | "expired"
  | "cancelled";

/** Audit trail della firma (valore probatorio FES). */
export interface SignatureAudit {
  document_title?: string;
  signer_name?: string | null;
  signer_email?: string | null;
  ip?: string | null;
  user_agent?: string | null;
  sent_at?: string | null;
  opened_at?: string | null;
  signed_at?: string | null;
  consent?: boolean;
  consent_text?: string;
  document_sha256?: string;
  issuer?: string;
  timestamp?: { applied?: boolean; provider?: string | null; transaction?: string | null };
}

export interface SignatureRequest {
  id: number;
  token: string;
  document_id: number;
  contract_id: number | null;
  status: SignatureStatus;
  signer_name: string | null;
  signer_email: string | null;
  signer_phone: string | null;
  otp_channel: "email" | "sms";
  has_password?: boolean;
  expires_at: string | null;
  signed_document_id: number | null;
  opened_at?: string | null;
  signed_at?: string | null;
  audit?: SignatureAudit | null;
  created_at: string;
}

/** Campo del modello composto (coordinate rimappate + valore risolto). */
export interface ComposeField {
  tag_name: string;
  label: string;
  display_label: string | null;
  field_type: DocFieldType;
  source_path: string | null;
  group_key: string | null;
  is_in_document: boolean;
  page: number;
  pos_x: number;
  pos_y: number;
  pos_w: number | null;
  pos_h: number | null;
  font_size: number | null;
  placeholder_kind: "underscore" | "tag" | null;
  placeholder_len: number | null;
  value: string;
  required: boolean;
  audience: "client" | "internal";
  /** Origine del campo composto (per riconfigurarlo sulla parte). */
  part_document_id: number | null;
  field_id: number | null;
}

export interface ComposeResult {
  document_id: number;
  contract_id: number | null;
  part_ids: number[];
  pages: PageMetric[];
  has_text_layer: boolean;
  suggested_title: string;
  fields: ComposeField[];
  areas: FieldArea[];
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
    display_label?: string | null;
    clear_display_label?: boolean;
    field_type?: DocFieldType;
    source_path?: string | null;
    clear_source_path?: boolean;
    group_key?: string | null;
    required?: boolean;
    audience?: "client" | "internal";
  }
): Promise<TemplateField> {
  const res = await authFetch(`${BASE}/${documentId}/template-fields/${fieldId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return jsonOrThrow(res);
}

/** Salva l'elenco ordinato delle sezioni (aree) del modello/parte. */
export async function saveFieldAreasApi(
  documentId: number,
  areas: Array<{ key: string; label: string; icon?: string | null; sub?: string | null }>
): Promise<FieldArea[]> {
  const res = await authFetch(`${BASE}/${documentId}/field-areas`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ areas }),
  });
  return jsonOrThrow(res);
}

/** Riordina/sposta i campi in un'unica chiamata (drag&drop). */
export async function reorderTemplateFieldsApi(
  documentId: number,
  items: Array<{ field_id: number; group_key?: string | null; sort_order: number }>
): Promise<void> {
  const res = await authFetch(`${BASE}/${documentId}/template-fields/reorder`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
  if (!res.ok && res.status !== 204) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string })?.detail ?? "Impossibile riordinare i campi");
  }
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

/** Scarica il PDF su cui si compila (serve a pdf.js, richiede il bearer).
 *  Con partIds streamma il PDF composto dalle parti selezionate. */
export async function fetchFillBaseApi(
  documentId: number,
  partIds?: number[]
): Promise<ArrayBuffer> {
  const token = localStorage.getItem("id_token");
  const suffix = partIds?.length ? `?parts=${partIds.join(",")}` : "";
  const res = await fetch(`${BASE}/${documentId}/fill-base${suffix}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string })?.detail ?? "Documento non disponibile");
  }
  return res.arrayBuffer();
}

// ── Parti del contratto (libreria riutilizzabile) ────────────────────────────

export async function listPartsApi(documentId: number): Promise<DocumentPart[]> {
  return jsonOrThrow(await authFetch(`${BASE}/${documentId}/parts`));
}

/** Collega una parte esistente (documento parte_contratto) al compositore. */
export async function linkPartApi(
  documentId: number,
  partDocumentId: number
): Promise<DocumentPart> {
  const res = await authFetch(`${BASE}/${documentId}/parts/link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ part_document_id: partDocumentId }),
  });
  return jsonOrThrow(res);
}

/** Crea una NUOVA parte dal file e la collega al compositore. */
export async function uploadPartApi(
  documentId: number,
  file: File,
  title?: string
): Promise<DocumentPart> {
  const token = localStorage.getItem("id_token");
  const form = new FormData();
  form.append("file", file);
  if (title) form.append("title", title);
  const res = await fetch(`${BASE}/${documentId}/parts`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  return jsonOrThrow(res);
}

export async function updatePartApi(
  documentId: number,
  linkId: number,
  body: { title?: string; sort_order?: number }
): Promise<DocumentPart> {
  const res = await authFetch(`${BASE}/${documentId}/parts/${linkId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return jsonOrThrow(res);
}

/** Scollega la parte dal compositore (non elimina il documento-parte). */
export async function unlinkPartApi(documentId: number, linkId: number): Promise<void> {
  const res = await authFetch(`${BASE}/${documentId}/parts/${linkId}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string })?.detail ?? "Impossibile scollegare la parte");
  }
}

/** Campi (coordinate rimappate) + pagine + valori del modello composto. */
export async function composeApi(
  documentId: number,
  options: { contractId?: number | null; clientId?: number | null; partIds?: number[] } = {}
): Promise<ComposeResult> {
  const qs = new URLSearchParams();
  if (options.contractId != null) qs.set("contract_id", String(options.contractId));
  if (options.clientId != null) qs.set("client_id", String(options.clientId));
  if (options.partIds?.length) qs.set("parts", options.partIds.join(","));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return jsonOrThrow(await authFetch(`${BASE}/${documentId}/compose${suffix}`));
}

export async function visualFillApi(
  documentId: number,
  body: {
    contract_id: number | null;
    title?: string;
    values: Record<string, string>;
    elements: OverlayElement[];
    signatures: Record<string, string>;
    part_ids?: number[];
  }
): Promise<DocumentDetail> {
  const res = await authFetch(`${BASE}/${documentId}/visual-fill`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return jsonOrThrow(res);
}

/** Crea un modello di contratto componibile (senza file) unendo parti esistenti. */
export async function createComposerApi(body: {
  company_id: number;
  title?: string;
  description?: string;
  part_ids: number[];
}): Promise<DocumentDetail> {
  const res = await authFetch(`${BASE}/composer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return jsonOrThrow(res);
}

// ── Firma cliente ───────────────────────────────────────────────────────────

export interface CompanyOverlay {
  values: Record<string, string>;
  elements: OverlayElement[];
  page_metrics: PageMetric[];
  has_signature: boolean;
}

/** Legge la preparazione azienda (valori interni + firma azienda) del modello. */
export async function getCompanyOverlayApi(documentId: number): Promise<CompanyOverlay> {
  return jsonOrThrow(await authFetch(`${BASE}/${documentId}/company-overlay`));
}

/** Salva sul modello i valori interni + la firma azienda (auto-apposti sui contratti). */
export async function saveCompanyOverlayApi(
  documentId: number,
  body: {
    values: Record<string, string>;
    elements: OverlayElement[];
    signatures: Record<string, string>;
  }
): Promise<CompanyOverlay> {
  const res = await authFetch(`${BASE}/${documentId}/company-overlay`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return jsonOrThrow(res);
}

/** Genera il link cliente: prepara il contratto e crea la richiesta di firma. */
export async function createSignatureRequestApi(
  documentId: number,
  body: {
    contract_id?: number | null;
    client_id?: number | null;
    part_ids?: number[];
    signer_name?: string;
    signer_email?: string;
    signer_phone?: string;
    otp_channel: "email" | "sms";
    expires_days?: number;
    password?: string;
    values?: Record<string, string>;
    elements?: OverlayElement[];
    signatures?: Record<string, string>;
  }
): Promise<SignatureRequest> {
  const res = await authFetch(`${BASE}/${documentId}/signature-requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return jsonOrThrow(res);
}

export async function listSignatureRequestsApi(documentId: number): Promise<SignatureRequest[]> {
  return jsonOrThrow(await authFetch(`${BASE}/${documentId}/signature-requests`));
}

/** Anteprima assemblata (dati azienda + cliente) per la revisione admin. */
export async function signaturePreviewApi(
  documentId: number,
  options: { contractId?: number | null; partIds?: number[] } = {}
): Promise<ComposeResult> {
  const qs = new URLSearchParams();
  if (options.contractId != null) qs.set("contract_id", String(options.contractId));
  if (options.partIds?.length) qs.set("parts", options.partIds.join(","));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return jsonOrThrow(await authFetch(`${BASE}/${documentId}/signature-preview${suffix}`));
}

/** Annulla un invio in corso (il link non sarà più utilizzabile). */
export async function cancelSignatureRequestApi(
  documentId: number,
  sigId: number
): Promise<SignatureRequest> {
  const res = await authFetch(`${BASE}/${documentId}/signature-requests/${sigId}/cancel`, {
    method: "POST",
  });
  return jsonOrThrow(res);
}

// ── Pagina di firma PUBBLICA (cliente, senza account) ─────────────────────────

const SIGN_BASE = `${API_BASE}/api/v1/sign`;

export interface PublicSignArea {
  key: string;
  label: string;
  icon?: string | null;
  sub?: string | null;
}

/** Campo LOGICO del form cliente (deduplicato): `tags` = tutte le occorrenze da riempire. */
export interface PublicSignField {
  key: string;
  label: string;
  field_type: DocFieldType;
  required: boolean;
  group_key: string | null;
  tags: string[];
}

export interface PublicSignData {
  status: string;
  requires_password: boolean;
  document_title: string;
  signer_name: string | null;
  company_name: string;
  company_logo: string | null;
  company_email: string | null;
  company_phone: string | null;
  company_website: string | null;
  company_address: string | null;
  areas: PublicSignArea[];
  fields: PublicSignField[];
  values: Record<string, string>;
  page_metrics: PageMetric[];
  has_company_signature: boolean;
}

/** Apre la pagina di firma: verifica token/scadenza/password e restituisce i campi. */
export async function openSignApi(token: string, password?: string): Promise<PublicSignData> {
  const res = await fetch(`${SIGN_BASE}/${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: password ?? null }),
  });
  return jsonOrThrow(res);
}

/** PDF su cui firma il cliente (con dati azienda + firma azienda già impressi). */
export async function fetchSignFillBaseApi(token: string, password?: string): Promise<ArrayBuffer> {
  const qs = password ? `?p=${encodeURIComponent(password)}` : "";
  const res = await fetch(`${SIGN_BASE}/${encodeURIComponent(token)}/fill-base${qs}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string })?.detail ?? "Impossibile caricare il documento");
  }
  return res.arrayBuffer();
}

/** Anteprima PDF (non salva) con dati azienda + cliente correnti. */
export async function previewSignApi(
  token: string,
  body: {
    password?: string;
    values: Record<string, string>;
    elements: OverlayElement[];
    signatures: Record<string, string>;
  }
): Promise<ArrayBuffer> {
  const res = await fetch(`${SIGN_BASE}/${encodeURIComponent(token)}/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    throw new Error((b as { detail?: string })?.detail ?? "Impossibile generare l'anteprima");
  }
  return res.arrayBuffer();
}

/** Invia campi compilati + firma del cliente. */
export async function submitSignApi(
  token: string,
  body: {
    password?: string;
    values: Record<string, string>;
    elements: OverlayElement[];
    signatures: Record<string, string>;
    consent?: boolean;
  }
): Promise<{ ok: boolean; document_title: string }> {
  const res = await fetch(`${SIGN_BASE}/${encodeURIComponent(token)}/submit`, {
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

/** Valori auto-risolti del modello. Con contratto o cliente; senza, solo dati azienda. */
export async function getFillPrefillApi(
  documentId: number,
  contractId?: number | null,
  clientId?: number | null
): Promise<FillPrefill> {
  const qs = new URLSearchParams();
  if (contractId != null) qs.set("contract_id", String(contractId));
  else if (clientId != null) qs.set("client_id", String(clientId));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return jsonOrThrow(await authFetch(`${BASE}/${documentId}/fill/prefill${suffix}`));
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
  parte_contratto: "Parte contratto",
  compilato: "Compilato",
};

export function formatDocSize(bytes: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
