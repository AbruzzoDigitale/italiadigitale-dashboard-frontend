import { authFetch, API_BASE } from "./auth";

// ─────────────────────────────────────────────────────────────────────────────
// Moduli compilabili (report) riusabili in tutta l'app: si agganciano a una task
// oppure vivono da soli con un link condiviso (che richiede comunque l'accesso).
// Vedi app/api/v1/endpoints/forms.py.
// ─────────────────────────────────────────────────────────────────────────────

const FORMS = `${API_BASE}/api/v1/forms`;
const SUBMISSIONS = `${API_BASE}/api/v1/form-submissions`;
const SHARED = `${API_BASE}/api/v1/shared-forms`;

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string })?.detail ?? "Errore imprevisto");
  }
  return res.json() as Promise<T>;
}

async function okOrThrow(res: Response, fallback: string): Promise<void> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string })?.detail ?? fallback);
  }
}

function jsonBody(method: string, body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

// ── Tipi ─────────────────────────────────────────────────────────────────────

export type FormFieldType =
  | "text"
  | "textarea"
  | "number"
  | "boolean"
  | "date"
  | "select"
  | "multiselect"
  | "url"
  | "email"
  | "file";

export const FIELD_TYPE_LABELS: Record<FormFieldType, string> = {
  text: "Testo",
  textarea: "Testo lungo",
  number: "Numero",
  boolean: "Sì / No",
  date: "Data",
  select: "Scelta singola",
  multiselect: "Scelta multipla",
  url: "Link",
  email: "Email",
  file: "Allegato",
};

/** Campi che si compilano da soli col contesto della task. */
export type FormFieldSource = "website" | "client" | "operator" | "today" | "work_item";

export const FIELD_SOURCE_LABELS: Record<FormFieldSource, string> = {
  website: "Sito web",
  client: "Cliente",
  operator: "Chi compila",
  today: "Data di oggi",
  work_item: "Task",
};

export type ConditionOperator = "eq" | "neq" | "in" | "filled" | "empty";

export const CONDITION_LABELS: Record<ConditionOperator, string> = {
  eq: "è uguale a",
  neq: "è diverso da",
  in: "è fra",
  filled: "è compilato",
  empty: "è vuoto",
};

export interface FieldCondition {
  field_key: string;
  operator: ConditionOperator;
  value?: string | string[] | null;
}

export interface FormField {
  id: number;
  section_id: number | null;
  label: string;
  key: string;
  field_type: FormFieldType;
  help_text: string | null;
  is_required: boolean;
  position: number;
  options: string[] | null;
  /** Casella "Altro" con risposta libera accanto alle opzioni. */
  allow_other: boolean;
  source: FormFieldSource | null;
  visible_if: FieldCondition | null;
  config: Record<string, unknown> | null;
}

export interface FormSection {
  id: number;
  title: string;
  description: string | null;
  position: number;
  visible_if: FieldCondition | null;
}

export interface FormAssignments {
  work_area_ids: number[];
  work_area_names: string[];
  user_ids: number[];
  user_names: string[];
}

export interface Form {
  id: number;
  company_id: number;
  name: string;
  description: string | null;
  is_active: boolean;
  /** Sale a ogni modifica della struttura. */
  version: number;
  /** Link condiviso attivo: serve comunque l'accesso alla dashboard. */
  share_enabled: boolean;
  share_token: string | null;
  sections: FormSection[];
  fields: FormField[];
  assignments: FormAssignments;
  submissions_count: number;
  created_at: string | null;
  updated_at: string | null;
}

/** Campo in scrittura: `id` presente = campo esistente, così la chiave resta stabile. */
export interface FormFieldPayload {
  id?: number | null;
  label: string;
  field_type: FormFieldType;
  help_text?: string | null;
  is_required?: boolean;
  position?: number;
  options?: string[] | null;
  allow_other?: boolean;
  source?: FormFieldSource | null;
  visible_if?: FieldCondition | null;
  config?: Record<string, unknown> | null;
  /** Indice della sezione nell'elenco inviato (le sezioni nuove non hanno id). */
  section_index?: number | null;
}

export interface FormSectionPayload {
  id?: number | null;
  title: string;
  description?: string | null;
  position?: number;
  visible_if?: FieldCondition | null;
}

export interface FormUpdatePayload {
  name?: string;
  description?: string | null;
  is_active?: boolean;
  sections?: FormSectionPayload[];
  fields?: FormFieldPayload[];
  assignments?: { work_area_ids: number[]; user_ids: number[] };
}

// ── Moduli ───────────────────────────────────────────────────────────────────

export async function listFormsApi(params?: {
  companyId?: number | null;
  onlyMine?: boolean;
}): Promise<Form[]> {
  const qs = new URLSearchParams();
  if (params?.companyId != null) qs.set("company_id", String(params.companyId));
  if (params?.onlyMine) qs.set("only_mine", "true");
  const query = qs.toString();
  return jsonOrThrow(await authFetch(`${FORMS}${query ? `?${query}` : ""}`));
}

export async function getFormApi(id: number): Promise<Form> {
  return jsonOrThrow(await authFetch(`${FORMS}/${id}`));
}

export async function createFormApi(body: {
  company_id: number;
  name: string;
  description?: string | null;
}): Promise<Form> {
  return jsonOrThrow(await authFetch(FORMS, jsonBody("POST", body)));
}

export async function updateFormApi(id: number, body: FormUpdatePayload): Promise<Form> {
  return jsonOrThrow(await authFetch(`${FORMS}/${id}`, jsonBody("PATCH", body)));
}

export async function deleteFormApi(id: number): Promise<void> {
  await okOrThrow(await authFetch(`${FORMS}/${id}`, { method: "DELETE" }), "Errore eliminazione modulo");
}

export interface ShareLink {
  share_enabled: boolean;
  share_token: string | null;
  path: string | null;
}

/** Attiva il link condiviso. Non è pubblico: apre solo a chi ha accesso alla
 *  dashboard ed è fra le aree/operatori assegnati al modulo. */
export async function enableShareLinkApi(id: number, regenerate = false): Promise<ShareLink> {
  return jsonOrThrow(
    await authFetch(`${FORMS}/${id}/share-link${regenerate ? "?regenerate=true" : ""}`, {
      method: "POST",
    })
  );
}

export async function disableShareLinkApi(id: number): Promise<ShareLink> {
  return jsonOrThrow(await authFetch(`${FORMS}/${id}/share-link`, { method: "DELETE" }));
}

// ── Collegamento a una task ──────────────────────────────────────────────────

export interface WorkItemForm {
  id: number;
  form_id: number;
  form_name: string;
  /** La task non si chiude finché il report non è stato consegnato. */
  is_required: boolean;
  submission_id: number | null;
  submission_status: string | null;
}

export async function listWorkItemFormsApi(workItemId: number): Promise<WorkItemForm[]> {
  return jsonOrThrow(await authFetch(`${FORMS}/work-items/${workItemId}`));
}

export async function attachFormToWorkItemApi(
  workItemId: number,
  body: { form_id: number; is_required: boolean }
): Promise<WorkItemForm> {
  return jsonOrThrow(await authFetch(`${FORMS}/work-items/${workItemId}`, jsonBody("POST", body)));
}

export async function detachFormFromWorkItemApi(workItemId: number, formId: number): Promise<void> {
  await okOrThrow(
    await authFetch(`${FORMS}/work-items/${workItemId}/${formId}`, { method: "DELETE" }),
    "Errore scollegamento modulo"
  );
}

// ── Compilazione e report ────────────────────────────────────────────────────

export interface FormAnswer {
  field_key: string;
  field_label: string;
  field_type: string;
  value: string | null;
  other_value: string | null;
}

export interface FormAttachment {
  id: number;
  field_key: string;
  filename: string;
  content_type: string | null;
  size_bytes: number | null;
  download_url: string | null;
}

export interface FormSubmission {
  id: number;
  form_id: number;
  form_name: string;
  company_id: number;
  work_item_id: number | null;
  work_item_title: string | null;
  website_id: number | null;
  website_url: string | null;
  client_id: number | null;
  client_name: string | null;
  status: "draft" | "submitted";
  submitted_by: number | null;
  submitted_by_label: string | null;
  submitted_at: string | null;
  form_version: number;
  answers: FormAnswer[];
  attachments: FormAttachment[];
  created_at: string | null;
  updated_at: string | null;
}

export interface AnswerPayload {
  field_key: string;
  value?: string | string[] | boolean | number | null;
  other_value?: string | null;
}

export async function createSubmissionApi(body: {
  form_id: number;
  work_item_id?: number | null;
  website_id?: number | null;
  client_id?: number | null;
}): Promise<FormSubmission> {
  return jsonOrThrow(await authFetch(SUBMISSIONS, jsonBody("POST", body)));
}

export async function getSubmissionApi(id: number): Promise<FormSubmission> {
  return jsonOrThrow(await authFetch(`${SUBMISSIONS}/${id}`));
}

/** `submit: false` salva la bozza, `true` consegna e pretende gli obbligatori. */
export async function saveSubmissionApi(
  id: number,
  body: { answers: AnswerPayload[]; submit: boolean; submitted_by_name?: string | null }
): Promise<FormSubmission> {
  return jsonOrThrow(await authFetch(`${SUBMISSIONS}/${id}`, jsonBody("PUT", body)));
}

export async function listSubmissionsApi(params?: {
  companyId?: number | null;
  formId?: number | null;
  websiteId?: number | null;
  clientId?: number | null;
  workItemId?: number | null;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<FormSubmission[]> {
  const qs = new URLSearchParams();
  if (params?.companyId != null) qs.set("company_id", String(params.companyId));
  if (params?.formId != null) qs.set("form_id", String(params.formId));
  if (params?.websiteId != null) qs.set("website_id", String(params.websiteId));
  if (params?.clientId != null) qs.set("client_id", String(params.clientId));
  if (params?.workItemId != null) qs.set("work_item_id", String(params.workItemId));
  if (params?.status) qs.set("status", params.status);
  if (params?.dateFrom) qs.set("date_from", params.dateFrom);
  if (params?.dateTo) qs.set("date_to", params.dateTo);
  const query = qs.toString();
  return jsonOrThrow(await authFetch(`${SUBMISSIONS}${query ? `?${query}` : ""}`));
}

export async function deleteSubmissionApi(id: number): Promise<void> {
  await okOrThrow(await authFetch(`${SUBMISSIONS}/${id}`, { method: "DELETE" }), "Errore eliminazione report");
}

/** URL dell'export CSV: il token va passato dal chiamante che scarica. */
export function submissionsExportUrl(params: {
  companyId?: number | null;
  formId?: number | null;
  websiteId?: number | null;
  clientId?: number | null;
  dateFrom?: string;
  dateTo?: string;
}): string {
  const qs = new URLSearchParams();
  if (params.companyId != null) qs.set("company_id", String(params.companyId));
  if (params.formId != null) qs.set("form_id", String(params.formId));
  if (params.websiteId != null) qs.set("website_id", String(params.websiteId));
  if (params.clientId != null) qs.set("client_id", String(params.clientId));
  if (params.dateFrom) qs.set("date_from", params.dateFrom);
  if (params.dateTo) qs.set("date_to", params.dateTo);
  const query = qs.toString();
  return `${SUBMISSIONS}/export${query ? `?${query}` : ""}`;
}

/** Scarica il CSV passando dall'autenticazione, poi lo salva come file. */
export async function downloadSubmissionsCsv(params: Parameters<typeof submissionsExportUrl>[0]): Promise<void> {
  const res = await authFetch(submissionsExportUrl(params));
  if (!res.ok) throw new Error("Errore durante l'export");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `report-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function uploadAttachmentApi(
  submissionId: number,
  fieldKey: string,
  file: File
): Promise<FormAttachment> {
  const data = new FormData();
  data.append("file", file);
  // Niente Content-Type a mano: lo mette il browser col boundary del multipart.
  const res = await authFetch(
    `${SUBMISSIONS}/${submissionId}/attachments?field_key=${encodeURIComponent(fieldKey)}`,
    { method: "POST", body: data, headers: {} }
  );
  return jsonOrThrow(res);
}

export async function attachmentDownloadUrlApi(
  submissionId: number,
  attachmentId: number
): Promise<{ url: string; expires_at: string }> {
  return jsonOrThrow(
    await authFetch(`${SUBMISSIONS}/${submissionId}/attachments/${attachmentId}/download`)
  );
}

export async function deleteAttachmentApi(submissionId: number, attachmentId: number): Promise<void> {
  await okOrThrow(
    await authFetch(`${SUBMISSIONS}/${submissionId}/attachments/${attachmentId}`, { method: "DELETE" }),
    "Errore eliminazione allegato"
  );
}

// ── Compilazione dal link condiviso (richiede accesso) ───────────────────────

export interface SharedForm {
  form_id: number;
  name: string;
  description: string | null;
  sections: FormSection[];
  fields: FormField[];
}

/** 404 = link revocato o modulo spento; 403 = non sei fra le aree/operatori scelti. */
export async function getSharedFormApi(token: string): Promise<SharedForm> {
  const res = await authFetch(`${SHARED}/${token}`);
  if (res.status === 404) {
    throw new Error("Modulo non disponibile: il link potrebbe essere stato revocato.");
  }
  return jsonOrThrow(res);
}

export async function submitSharedFormApi(
  token: string,
  body: { answers: AnswerPayload[] }
): Promise<{ ok: boolean; submission_id: number; message: string }> {
  return jsonOrThrow(await authFetch(`${SHARED}/${token}`, jsonBody("POST", { ...body, submit: true })));
}
