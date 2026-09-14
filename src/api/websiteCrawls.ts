import { authFetch, API_BASE } from "./auth";

// ─────────────────────────────────────────────────────────────────────────────
// Scansione delle pagine di un sito: giri, esiti pagina per pagina, variazioni
// rispetto al giro precedente. Tutto dall'esterno, senza plugin sui siti.
// Vedi app/api/v1/endpoints/website_crawls.py.
// ─────────────────────────────────────────────────────────────────────────────

const BASE = `${API_BASE}/api/v1/website-crawls`;

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string })?.detail ?? "Errore imprevisto");
  }
  return res.json() as Promise<T>;
}

export type CrawlStatus = "running" | "completed" | "partial" | "failed" | "blocked";

export const CRAWL_STATUS_LABELS: Record<CrawlStatus, string> = {
  running: "In corso",
  completed: "Completata",
  partial: "Parziale",
  failed: "Fallita",
  blocked: "Respinta dal sito",
};

export type ChangeType =
  | "became_error"
  | "became_noindex"
  | "became_redirect"
  | "disappeared"
  | "canonical_changed"
  | "title_changed"
  | "appeared";

export const CHANGE_LABELS: Record<ChangeType, string> = {
  became_error: "Non risponde più",
  became_noindex: "Uscita dai motori di ricerca",
  became_redirect: "Ora reindirizza altrove",
  disappeared: "Sparita",
  canonical_changed: "Canonical cambiato",
  title_changed: "Titolo cambiato",
  appeared: "Nuova",
};

export interface CrawlSummary {
  id: number;
  website_id: number;
  started_at: string;
  finished_at: string | null;
  status: CrawlStatus;
  trigger: "cron" | "manual";
  pages_found: number;
  pages_checked: number;
  errors_count: number;
  redirects_count: number;
  broken_links_count: number;
  avg_seo_score: number | null;
  discovery: string | null;
  sitemap_url: string | null;
  message: string | null;
  changes_count: number;
  critical_changes: number;
}

export interface PageCheck {
  id: number;
  page_id: number;
  url: string;
  path: string | null;
  http_status: number | null;
  redirect_to: string | null;
  redirect_chain: string[];
  response_ms: number | null;
  size_bytes: number | null;
  content_type: string | null;
  error: string | null;
  title: string | null;
  meta_description: string | null;
  canonical: string | null;
  h1_count: number;
  heading_gap: boolean;
  is_noindex: boolean;
  word_count: number;
  images_total: number;
  images_without_alt: number;
  internal_links: number;
  broken_links: number;
  has_og: boolean;
  has_jsonld: boolean;
  seo_score: number | null;
  /** "good" ≥85 · "warn" 60-84 · "bad" <60 · "none" non analizzata */
  seo_band: "good" | "warn" | "bad" | "none";
  seo_issues: string[];
  is_key_page: boolean;
}

export interface PageChange {
  id: number;
  page_id: number | null;
  url: string | null;
  path: string | null;
  change_type: ChangeType;
  severity: "critical" | "warning" | "info";
  from_value: string | null;
  to_value: string | null;
}

export interface CrawlOverviewRow {
  website_id: number;
  name: string;
  url: string;
  domain: string | null;
  crawl_enabled: boolean;
  last_crawl_at: string | null;
  next_crawl_at: string | null;
  status: CrawlStatus | null;
  pages_checked: number;
  errors_count: number;
  avg_seo_score: number | null;
  critical_changes: number;
  message: string | null;
}

export interface CrawlSettings {
  crawl_interval_days: number;
  crawl_max_pages: number;
}

export interface CrawlSettingsResponse extends CrawlSettings {
  crawl_enabled_count: number;
}

export async function crawlOverviewApi(companyId: number): Promise<CrawlOverviewRow[]> {
  return jsonOrThrow(await authFetch(`${BASE}/overview?company_id=${companyId}`));
}

export async function listCrawlsApi(websiteId: number, limit = 20): Promise<CrawlSummary[]> {
  return jsonOrThrow(await authFetch(`${BASE}?website_id=${websiteId}&limit=${limit}`));
}

/** Sincrona: un sito da cento pagine impiega un paio di minuti. */
export async function runCrawlApi(websiteId: number, maxPages?: number): Promise<CrawlSummary> {
  const qs = new URLSearchParams({ website_id: String(websiteId) });
  if (maxPages) qs.set("max_pages", String(maxPages));
  return jsonOrThrow(await authFetch(`${BASE}/run?${qs}`, { method: "POST" }));
}

export async function crawlPagesApi(crawlId: number, onlyProblems = false): Promise<PageCheck[]> {
  return jsonOrThrow(await authFetch(`${BASE}/${crawlId}/pages?only_problems=${onlyProblems}`));
}

export async function crawlChangesApi(crawlId: number): Promise<PageChange[]> {
  return jsonOrThrow(await authFetch(`${BASE}/${crawlId}/changes`));
}

export async function getCrawlSettingsApi(companyId: number): Promise<CrawlSettingsResponse> {
  return jsonOrThrow(await authFetch(`${BASE}/settings?company_id=${companyId}`));
}

export async function updateCrawlSettingsApi(
  companyId: number,
  body: CrawlSettings
): Promise<CrawlSettingsResponse> {
  return jsonOrThrow(
    await authFetch(`${BASE}/settings?company_id=${companyId}`, {
      method: "PUT",
      body: JSON.stringify(body),
    })
  );
}

export async function updateCrawlOptionsApi(
  websiteId: number,
  body: { crawl_enabled?: boolean; crawl_user_agent?: string | null; crawl_max_pages?: number | null }
): Promise<CrawlSummary | null> {
  return jsonOrThrow(
    await authFetch(`${BASE}/options?website_id=${websiteId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    })
  );
}

/** Colore della fascia SEO, allineato a quello usato nel calendario manutenzioni. */
export function seoBandClass(band: PageCheck["seo_band"]): string {
  if (band === "good") return "text-success";
  if (band === "warn") return "text-[#b07d00] dark:text-warning";
  if (band === "bad") return "text-danger";
  return "text-muted dark:text-[#9999a0]";
}

/** Pastiglia per un codice HTTP: verde 2xx, ambra 3xx, rosso 4xx/5xx. */
export function statusClass(status: number | null, error: string | null): string {
  if (error) return "bg-danger/10 text-danger";
  if (status == null) return "bg-muted/10 text-muted dark:text-[#9999a0]";
  if (status >= 400) return "bg-danger/10 text-danger";
  if (status >= 300) return "bg-warning/10 text-[#b07d00] dark:text-warning";
  return "bg-success/10 text-success";
}
