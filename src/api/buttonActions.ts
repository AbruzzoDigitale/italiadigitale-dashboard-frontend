import { authFetch, API_BASE } from "./auth";

// ─────────────────────────────────────────────────────────────────────────────
// Bottoni configurabili: un bottone dell'interfaccia nasce muto, un admin gli
// collega un'azione (invia mail, crea task, notifica, webhook) e da quel
// momento funziona per tutti. Finché non è configurato lo vede solo l'admin.
// Vedi app/api/v1/endpoints/button_actions.py.
// ─────────────────────────────────────────────────────────────────────────────

const BASE = `${API_BASE}/api/v1/button-actions`;

/** Tipi di campo che il popup di configurazione sa disegnare. */
export type ActionFieldType =
  | "text"
  | "textarea"
  | "number"
  | "bool"
  | "date"
  | "email_template"
  | "users"
  | "work_area"
  | "notification_category"
  | "url"
  | "select";

export interface ActionField {
  key: string;
  label: string;
  type: ActionFieldType;
  required: boolean;
  help: string;
  default: unknown;
  options: { value: string; label: string }[];
}

export interface ActionSpec {
  action_type: string;
  label: string;
  description: string;
  /** Campi che compila l'admin in configurazione. */
  fields: ActionField[];
  /** Campi che compila chi preme, al momento dell'esecuzione. */
  run_fields: ActionField[];
}

export interface ButtonSpec {
  key: string;
  label: string;
  description: string;
  entity_type: string;
  suggested_template_key: string | null;
  allowed_actions: string[];
  /** Campi propri del bottone, chiesti al clic (es. la data dell'intervento). */
  run_fields: ActionField[];
}

export interface ActionCatalog {
  buttons: ButtonSpec[];
  actions: ActionSpec[];
}

export interface ButtonRunSummary {
  id: number;
  at: string;
  detail: string;
  payload: Record<string, unknown>;
}

export interface ButtonStateItem {
  entity_id: number | null;
  /** Non configurato = visibile solo agli admin. */
  visible: boolean;
  configured: boolean;
  /** Configurato su questa singola riga (eccezione al «vale per tutti»). */
  overridden: boolean;
  action_type: string | null;
  action_label: string | null;
  last_run: ButtonRunSummary | null;
}

export interface ButtonState {
  button_key: string;
  label: string;
  description: string;
  entity_type: string;
  can_configure: boolean;
  items: ButtonStateItem[];
}

export interface ButtonActionConfig {
  id: number;
  company_id: number;
  button_key: string;
  scope_type: string;
  scope_id: number;
  applies_to_all: boolean;
  action_type: string;
  config: Record<string, unknown> | null;
  is_active: boolean;
}

/** Anteprima dell'azione «invia mail»: è ciò che mostra il modale. */
export interface EmailPreparePayload {
  action_type: string;
  entity_id: number | null;
  entity_label: string;
  run_values: Record<string, string>;
  to: string;
  cc: string;
  subject: string;
  body_html: string;
  signature_html: string;
  full_html: string;
  sender_email: string;
  sender_origin: "personale" | "aziendale" | "nessuno";
  template_name: string;
  can_run: boolean;
  warnings: string[];
}

export interface ButtonRunOutcome {
  entity_id: number | null;
  entity_label: string;
  ok: boolean;
  detail: string;
  payload: Record<string, unknown>;
}

export interface ButtonRunResponse {
  ok: boolean;
  results: ButtonRunOutcome[];
}

/** Una riga del registro con la copia del messaggio spedito. */
export interface ButtonRunDetail {
  id: number;
  button_key: string;
  action_type: string;
  entity_id: number | null;
  actor_name: string;
  status: string;
  detail: string;
  payload: Record<string, unknown>;
  body_html: string;
  created_at: string;
}

export interface ButtonRunLogItem {
  id: number;
  button_key: string;
  action_type: string;
  entity_id: number | null;
  actor_user_id: number | null;
  actor_name: string;
  status: string;
  detail: string;
  payload: Record<string, unknown>;
  created_at: string;
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string })?.detail ?? "Errore imprevisto");
  }
  return res.json() as Promise<T>;
}

/** Catalogo di bottoni e azioni: il popup di configurazione si disegna da qui. */
export async function getActionCatalogApi(): Promise<ActionCatalog> {
  return jsonOrThrow(await authFetch(`${BASE}/catalog`));
}

export async function getButtonStateApi(
  companyId: number,
  buttonKey: string,
  entityIds: number[],
): Promise<ButtonState> {
  const qs = new URLSearchParams({ company_id: String(companyId), button_key: buttonKey });
  if (entityIds.length) qs.set("entity_ids", entityIds.join(","));
  return jsonOrThrow(await authFetch(`${BASE}/state?${qs.toString()}`));
}

export async function listButtonConfigsApi(
  companyId: number,
  buttonKey?: string,
): Promise<ButtonActionConfig[]> {
  const qs = new URLSearchParams({ company_id: String(companyId) });
  if (buttonKey) qs.set("button_key", buttonKey);
  return jsonOrThrow(await authFetch(`${BASE}/config?${qs.toString()}`));
}

export async function saveButtonConfigApi(
  companyId: number,
  body: {
    button_key: string;
    entity_id?: number | null;
    action_type: string;
    config: Record<string, unknown>;
    apply_to_all: boolean;
  },
): Promise<ButtonActionConfig> {
  return jsonOrThrow(
    await authFetch(`${BASE}/config?company_id=${companyId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

export async function deleteButtonConfigApi(
  companyId: number,
  buttonKey: string,
  entityId?: number | null,
): Promise<void> {
  const qs = new URLSearchParams({ company_id: String(companyId), button_key: buttonKey });
  if (entityId != null) qs.set("entity_id", String(entityId));
  const res = await authFetch(`${BASE}/config?${qs.toString()}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) throw new Error("Impossibile togliere la configurazione");
}

/** Cosa mostrare nel modale prima di eseguire. Non scrive nulla. */
export async function prepareButtonActionApi<T = EmailPreparePayload>(
  companyId: number,
  body: { button_key: string; entity_id?: number | null; values?: Record<string, unknown> },
): Promise<T> {
  return jsonOrThrow(
    await authFetch(`${BASE}/prepare?company_id=${companyId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

export async function runButtonActionApi(
  companyId: number,
  body: {
    button_key: string;
    entity_id?: number | null;
    entity_ids?: number[];
    values?: Record<string, unknown>;
  },
): Promise<ButtonRunResponse> {
  return jsonOrThrow(
    await authFetch(`${BASE}/run?company_id=${companyId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

export async function listButtonRunsApi(
  companyId: number,
  params: { button_key?: string; action_type?: string; entity_id?: number; limit?: number } = {},
): Promise<ButtonRunLogItem[]> {
  const qs = new URLSearchParams({ company_id: String(companyId) });
  if (params.button_key) qs.set("button_key", params.button_key);
  if (params.action_type) qs.set("action_type", params.action_type);
  if (params.entity_id != null) qs.set("entity_id", String(params.entity_id));
  if (params.limit) qs.set("limit", String(params.limit));
  return jsonOrThrow(await authFetch(`${BASE}/runs?${qs.toString()}`));
}

/** Una esecuzione singola, con la copia del messaggio spedito. */
export async function getButtonRunApi(companyId: number, runId: number): Promise<ButtonRunDetail> {
  return jsonOrThrow(await authFetch(`${BASE}/runs/${runId}?company_id=${companyId}`));
}
