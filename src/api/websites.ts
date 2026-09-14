import { authFetch, API_BASE } from "./auth";

// ─────────────────────────────────────────────────────────────────────────────
// Registro dei siti web dei clienti. Gemello dei profili social: anagrafica per
// azienda, tassonomie configurabili (tipo / categoria / stato), temi collegati
// al tipo, campi personalizzati con visibilità, e i dati che si compilano da
// soli (WHOIS + PageSpeed mobile/desktop).
// Vedi app/api/v1/endpoints/websites.py.
// ─────────────────────────────────────────────────────────────────────────────

const BASE = `${API_BASE}/api/v1/websites`;
const TAXONOMIES = `${API_BASE}/api/v1/website-taxonomies`;
const THEMES = `${API_BASE}/api/v1/website-themes`;
const CUSTOM_FIELDS = `${API_BASE}/api/v1/website-custom-fields`;

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

/** Etichetta compatta di un sito: nome scelto, altrimenti l'URL ripulita. */
export function websiteLabel(site: { name: string; url: string }): string {
  if (site.name.trim()) return site.name.trim();
  return site.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
}

// ── Tassonomie ───────────────────────────────────────────────────────────────

export interface WebsiteType {
  id: number;
  company_id: number;
  name: string;
  slug: string;
  color: string | null;
  /** Se il tipo prevede la scelta di un tema (WordPress sì, sito a codice no). */
  uses_themes: boolean;
  sort_order: number;
  websites_count: number;
  themes_count: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface WebsiteCategory {
  id: number;
  company_id: number;
  name: string;
  slug: string;
  color: string | null;
  sort_order: number;
  websites_count: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface WebsiteStatus {
  id: number;
  company_id: number;
  name: string;
  slug: string;
  color: string | null;
  sort_order: number;
  is_default: boolean;
  websites_count: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface WebsiteTypePayload {
  name?: string;
  slug?: string | null;
  color?: string | null;
  uses_themes?: boolean;
  sort_order?: number;
}

export interface WebsiteCategoryPayload {
  name?: string;
  slug?: string | null;
  color?: string | null;
  sort_order?: number;
}

export interface WebsiteStatusPayload {
  name?: string;
  slug?: string | null;
  color?: string | null;
  sort_order?: number;
  is_default?: boolean;
}

export async function listWebsiteTypesApi(companyId?: number | null): Promise<WebsiteType[]> {
  const qs = companyId != null ? `?company_id=${companyId}` : "";
  return jsonOrThrow(await authFetch(`${TAXONOMIES}/types${qs}`));
}

export async function createWebsiteTypeApi(
  body: WebsiteTypePayload & { company_id: number; name: string }
): Promise<WebsiteType> {
  return jsonOrThrow(await authFetch(`${TAXONOMIES}/types`, jsonBody("POST", body)));
}

export async function updateWebsiteTypeApi(id: number, body: WebsiteTypePayload): Promise<WebsiteType> {
  return jsonOrThrow(await authFetch(`${TAXONOMIES}/types/${id}`, jsonBody("PATCH", body)));
}

export async function deleteWebsiteTypeApi(id: number): Promise<void> {
  await okOrThrow(await authFetch(`${TAXONOMIES}/types/${id}`, { method: "DELETE" }), "Errore eliminazione tipo");
}

export async function listWebsiteCategoriesApi(companyId?: number | null): Promise<WebsiteCategory[]> {
  const qs = companyId != null ? `?company_id=${companyId}` : "";
  return jsonOrThrow(await authFetch(`${TAXONOMIES}/categories${qs}`));
}

export async function createWebsiteCategoryApi(
  body: WebsiteCategoryPayload & { company_id: number; name: string }
): Promise<WebsiteCategory> {
  return jsonOrThrow(await authFetch(`${TAXONOMIES}/categories`, jsonBody("POST", body)));
}

export async function updateWebsiteCategoryApi(
  id: number,
  body: WebsiteCategoryPayload
): Promise<WebsiteCategory> {
  return jsonOrThrow(await authFetch(`${TAXONOMIES}/categories/${id}`, jsonBody("PATCH", body)));
}

export async function deleteWebsiteCategoryApi(id: number): Promise<void> {
  await okOrThrow(
    await authFetch(`${TAXONOMIES}/categories/${id}`, { method: "DELETE" }),
    "Errore eliminazione categoria"
  );
}

export async function listWebsiteStatusesApi(companyId?: number | null): Promise<WebsiteStatus[]> {
  const qs = companyId != null ? `?company_id=${companyId}` : "";
  return jsonOrThrow(await authFetch(`${TAXONOMIES}/statuses${qs}`));
}

export async function createWebsiteStatusApi(
  body: WebsiteStatusPayload & { company_id: number; name: string }
): Promise<WebsiteStatus> {
  return jsonOrThrow(await authFetch(`${TAXONOMIES}/statuses`, jsonBody("POST", body)));
}

export async function updateWebsiteStatusApi(id: number, body: WebsiteStatusPayload): Promise<WebsiteStatus> {
  return jsonOrThrow(await authFetch(`${TAXONOMIES}/statuses/${id}`, jsonBody("PATCH", body)));
}

export async function deleteWebsiteStatusApi(id: number): Promise<void> {
  await okOrThrow(
    await authFetch(`${TAXONOMIES}/statuses/${id}`, { method: "DELETE" }),
    "Errore eliminazione stato"
  );
}

// ── Temi ─────────────────────────────────────────────────────────────────────

/** Valore consigliato di una direttiva PHP (es. memory_limit = 512M). */
export interface PhpVariable {
  name: string;
  value: string;
}

export interface WebsiteTheme {
  id: number;
  company_id: number;
  website_type_id: number | null;
  website_type_name: string | null;
  name: string;
  php_variables: PhpVariable[];
  documentation_url: string | null;
  download_url: string | null;
  /** Numerico dal backend, ma JSON lo consegna come stringa decimale. */
  cost: string | number | null;
  woocommerce_compatible: boolean;
  notes: string | null;
  category_ids: number[];
  category_names: string[];
  websites_count: number;
  created_by: number | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface WebsiteThemePayload {
  website_type_id?: number | null;
  name?: string;
  php_variables?: PhpVariable[];
  documentation_url?: string | null;
  download_url?: string | null;
  cost?: number | null;
  woocommerce_compatible?: boolean;
  notes?: string | null;
  category_ids?: number[];
}

export async function listWebsiteThemesApi(params?: {
  companyId?: number | null;
  websiteTypeId?: number | null;
  categoryId?: number | null;
}): Promise<WebsiteTheme[]> {
  const qs = new URLSearchParams();
  if (params?.companyId != null) qs.set("company_id", String(params.companyId));
  if (params?.websiteTypeId != null) qs.set("website_type_id", String(params.websiteTypeId));
  if (params?.categoryId != null) qs.set("category_id", String(params.categoryId));
  const query = qs.toString();
  return jsonOrThrow(await authFetch(`${THEMES}${query ? `?${query}` : ""}`));
}

export async function createWebsiteThemeApi(
  body: WebsiteThemePayload & { company_id: number; name: string }
): Promise<WebsiteTheme> {
  return jsonOrThrow(await authFetch(THEMES, jsonBody("POST", body)));
}

export async function updateWebsiteThemeApi(id: number, body: WebsiteThemePayload): Promise<WebsiteTheme> {
  return jsonOrThrow(await authFetch(`${THEMES}/${id}`, jsonBody("PATCH", body)));
}

export async function deleteWebsiteThemeApi(id: number): Promise<void> {
  await okOrThrow(await authFetch(`${THEMES}/${id}`, { method: "DELETE" }), "Errore eliminazione tema");
}

// ── Campi personalizzati ─────────────────────────────────────────────────────

export type WebsiteCustomFieldType =
  | "text"
  | "textarea"
  | "number"
  | "boolean"
  | "date"
  | "select"
  | "url"
  | "email";

export const CUSTOM_FIELD_TYPE_LABELS: Record<WebsiteCustomFieldType, string> = {
  text: "Testo",
  textarea: "Testo lungo",
  number: "Numero",
  boolean: "Sì / No",
  date: "Data",
  select: "Elenco di scelte",
  url: "Link",
  email: "Email",
};

export interface WebsiteCustomField {
  id: number;
  company_id: number;
  label: string;
  key: string;
  field_type: WebsiteCustomFieldType;
  options: string[] | null;
  help_text: string | null;
  /** "private" = solo chi l'ha creato; "company" = tutta l'azienda. */
  visibility: "private" | "company";
  owner_user_id: number | null;
  owner_name: string | null;
  owner_access_level: string;
  sort_order: number;
  /** Calcolato dal backend per chi chiede: può modificarne la definizione? */
  can_manage: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export interface WebsiteCustomFieldPayload {
  label?: string;
  key?: string | null;
  field_type?: WebsiteCustomFieldType;
  options?: string[] | null;
  help_text?: string | null;
  visibility?: "private" | "company";
  sort_order?: number;
}

export async function listWebsiteCustomFieldsApi(companyId?: number | null): Promise<WebsiteCustomField[]> {
  const qs = companyId != null ? `?company_id=${companyId}` : "";
  return jsonOrThrow(await authFetch(`${CUSTOM_FIELDS}${qs}`));
}

export async function createWebsiteCustomFieldApi(
  body: WebsiteCustomFieldPayload & { company_id: number; label: string }
): Promise<WebsiteCustomField> {
  return jsonOrThrow(await authFetch(CUSTOM_FIELDS, jsonBody("POST", body)));
}

export async function updateWebsiteCustomFieldApi(
  id: number,
  body: WebsiteCustomFieldPayload
): Promise<WebsiteCustomField> {
  return jsonOrThrow(await authFetch(`${CUSTOM_FIELDS}/${id}`, jsonBody("PATCH", body)));
}

export async function deleteWebsiteCustomFieldApi(id: number): Promise<void> {
  await okOrThrow(await authFetch(`${CUSTOM_FIELDS}/${id}`, { method: "DELETE" }), "Errore eliminazione campo");
}

// ── Siti ─────────────────────────────────────────────────────────────────────

export type ScanStrategy = "mobile" | "desktop";

export interface WebsiteScan {
  id: number;
  website_id: number;
  strategy: ScanStrategy;
  run_at: string | null;
  /** "ok" | "error": è la colonna "Esito" del vecchio foglio. */
  status: string;
  error: string | null;
  performance_score: number | null;
  accessibility_score: number | null;
  best_practices_score: number | null;
  seo_score: number | null;
  fcp_s: number | null;
  lcp_s: number | null;
  speed_index_s: number | null;
  cls: number | null;
  tbt_ms: number | null;
  inp_ms: number | null;
  ttfb_ms: number | null;
  crux_lcp: number | null;
  crux_cls: number | null;
  crux_inp: number | null;
}

export interface Website {
  id: number;
  company_id: number;
  client_id: number | null;
  client_name: string | null;
  url: string;
  domain: string | null;
  name: string;
  requires_maintenance: boolean;

  website_type_id: number | null;
  website_type_name: string | null;
  website_type_color: string | null;
  website_type_uses_themes: boolean;
  theme_id: number | null;
  theme_name: string | null;
  category_id: number | null;
  category_name: string | null;
  category_color: string | null;
  status_id: number | null;
  status_name: string | null;
  status_color: string | null;

  notes: string | null;
  /** Data di messa online del sito. */
  launched_on: string | null;
  /** Ultimo aggiornamento fatto sul sito. */
  last_update_on: string | null;

  registrar: string | null;
  nameservers: string | null;
  domain_expires_on: string | null;
  whois_checked_at: string | null;
  whois_error: string | null;

  scan_enabled: boolean;
  last_scan_at: string | null;
  next_scan_at: string | null;
  latest_mobile: WebsiteScan | null;
  latest_desktop: WebsiteScan | null;

  /** Solo i campi visibili a chi chiede: { chiave campo: valore }. */
  custom_values: Record<string, string | null>;

  created_by: number | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface WebsiteCreate {
  company_id: number;
  client_id?: number | null;
  url: string;
  name?: string;
  requires_maintenance?: boolean;
  website_type_id?: number | null;
  theme_id?: number | null;
  category_id?: number | null;
  status_id?: number | null;
  notes?: string | null;
  launched_on?: string | null;
  last_update_on?: string | null;
  scan_enabled?: boolean;
  custom_values?: Record<string, string | null>;
}

export interface WebsiteUpdate {
  client_id?: number | null;
  url?: string;
  name?: string;
  requires_maintenance?: boolean;
  website_type_id?: number | null;
  theme_id?: number | null;
  category_id?: number | null;
  status_id?: number | null;
  notes?: string | null;
  launched_on?: string | null;
  last_update_on?: string | null;
  scan_enabled?: boolean;
  registrar?: string | null;
  nameservers?: string | null;
  custom_values?: Record<string, string | null>;
}

export async function listWebsitesApi(params?: {
  companyId?: number | null;
  clientId?: number | null;
  websiteTypeId?: number | null;
  categoryId?: number | null;
  statusId?: number | null;
  themeId?: number | null;
  requiresMaintenance?: boolean | null;
  q?: string;
}): Promise<Website[]> {
  const qs = new URLSearchParams();
  if (params?.companyId != null) qs.set("company_id", String(params.companyId));
  if (params?.clientId != null) qs.set("client_id", String(params.clientId));
  if (params?.websiteTypeId != null) qs.set("website_type_id", String(params.websiteTypeId));
  if (params?.categoryId != null) qs.set("category_id", String(params.categoryId));
  if (params?.statusId != null) qs.set("status_id", String(params.statusId));
  if (params?.themeId != null) qs.set("theme_id", String(params.themeId));
  if (params?.requiresMaintenance != null) qs.set("requires_maintenance", String(params.requiresMaintenance));
  if (params?.q) qs.set("q", params.q);
  const query = qs.toString();
  return jsonOrThrow(await authFetch(`${BASE}${query ? `?${query}` : ""}`));
}

export async function createWebsiteApi(body: WebsiteCreate): Promise<Website> {
  return jsonOrThrow(await authFetch(BASE, jsonBody("POST", body)));
}

export async function updateWebsiteApi(id: number, body: WebsiteUpdate): Promise<Website> {
  return jsonOrThrow(await authFetch(`${BASE}/${id}`, jsonBody("PATCH", body)));
}

export async function deleteWebsiteApi(id: number): Promise<void> {
  await okOrThrow(await authFetch(`${BASE}/${id}`, { method: "DELETE" }), "Errore eliminazione sito");
}

/** Analisi immediata (mobile + desktop): richiesta lenta, decine di secondi. */
export async function scanWebsiteApi(
  id: number,
  body?: { strategies?: ScanStrategy[]; force_whois?: boolean }
): Promise<Website> {
  return jsonOrThrow(
    await authFetch(`${BASE}/${id}/scan`, jsonBody("POST", { strategies: [], force_whois: false, ...body }))
  );
}

/** Rilegge registrar e name server del dominio. */
export async function refreshWebsiteWhoisApi(id: number): Promise<Website> {
  return jsonOrThrow(await authFetch(`${BASE}/${id}/whois`, { method: "POST" }));
}

/**
 * Accoda l'analisi di più siti: la esegue lo scheduler al prossimo giro.
 * `skipped` = siti con l'analisi automatica sospesa, che restano fuori dalla coda.
 */
export async function queueWebsiteScansApi(
  ids: number[]
): Promise<{ queued: number; skipped: number }> {
  return jsonOrThrow(await authFetch(`${BASE}/scan-bulk`, jsonBody("POST", { ids })));
}

// ── Impostazioni della scansione automatica (per azienda) ────────────────────

export interface WebsiteScanSettings {
  /** Ogni quanti giorni ogni sito viene rianalizzato. */
  scan_interval_days: number;
  /** Quanti siti sono stati riallineati dall'ultimo cambio di cadenza. */
  rescheduled: number;
  /** Siti con l'analisi automatica accesa. */
  scan_enabled_count: number;
}

/** Cadenza corrente. Leggibile da chiunque abbia accesso all'azienda. */
export async function getWebsiteScanSettingsApi(companyId: number): Promise<WebsiteScanSettings> {
  return jsonOrThrow(await authFetch(`${BASE}/settings?company_id=${companyId}`));
}

/** Cambia la cadenza (solo admin) e riallinea i siti già analizzati. */
export async function updateWebsiteScanSettingsApi(
  companyId: number,
  scanIntervalDays: number
): Promise<WebsiteScanSettings> {
  return jsonOrThrow(
    await authFetch(
      `${BASE}/settings?company_id=${companyId}`,
      jsonBody("PUT", { scan_interval_days: scanIntervalDays })
    )
  );
}

/** Descrizione leggibile di una cadenza: "ogni giorno", "ogni settimana", … */
export function scanIntervalLabel(days: number): string {
  if (days === 1) return "ogni giorno";
  if (days === 7) return "ogni settimana";
  if (days === 14) return "ogni 2 settimane";
  if (days === 30) return "ogni mese";
  if (days % 7 === 0) return `ogni ${days / 7} settimane`;
  return `ogni ${days} giorni`;
}

/** Storico delle letture, dalla più recente. */
export async function listWebsiteScansApi(
  id: number,
  params?: { strategy?: ScanStrategy; limit?: number }
): Promise<WebsiteScan[]> {
  const qs = new URLSearchParams();
  if (params?.strategy) qs.set("strategy", params.strategy);
  if (params?.limit) qs.set("limit", String(params.limit));
  const query = qs.toString();
  return jsonOrThrow(await authFetch(`${BASE}/${id}/scans${query ? `?${query}` : ""}`));
}
