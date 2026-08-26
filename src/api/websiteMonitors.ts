import { authFetch, API_BASE } from "./auth";
import type { CrawlSummary, PageChange, PageCheck } from "./websiteCrawls";

// ─────────────────────────────────────────────────────────────────────────────
// Monitoraggi dei siti web: gemelli dei monitor social. Un monitor è una
// configurazione autonoma (cosa controllare, ogni quanto, con quali soglie) a
// cui si agganciano uno o più siti.
// Vedi app/api/v1/endpoints/website_monitors.py.
// ─────────────────────────────────────────────────────────────────────────────

const BASE = `${API_BASE}/api/v1/website-monitors`;

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string })?.detail ?? "Errore imprevisto");
  }
  return res.json() as Promise<T>;
}

export interface MonitorSettings {
  name: string;
  is_active: boolean;
  client_id: number | null;
  /** Cadenza in ore: 168 = settimanale, 24 = giornaliero. */
  interval_hours: number;
  /** Ora preferita (0-23) nel fuso indicato. null = appena scade la cadenza. */
  run_hour: number | null;
  timezone: string;
  max_pages: number;
  use_sitemap: boolean;
  crawl_fallback: boolean;
  respect_robots: boolean;
  request_delay_ms: number;
  user_agent: string | null;
  check_seo: boolean;
  check_broken_links: boolean;
  alert_on_errors: boolean;
  alert_on_noindex: boolean;
  alert_on_redirects: boolean;
  alert_on_disappeared: boolean;
  seo_min_score: number | null;
  max_response_ms: number | null;
  notify_in_app: boolean;
  notify_push: boolean;
}

export interface MonitorTarget {
  id: number;
  website_id: number;
  website_name: string;
  website_url: string;
  website_domain: string | null;
  max_pages_override: number | null;
  user_agent_override: string | null;
  is_paused: boolean;
  last_crawl_id: number | null;
  last_run_at: string | null;
  last_status: string | null;
  pages_checked: number;
  errors_count: number;
  avg_seo_score: number | null;
  critical_changes: number;
  is_alerting: boolean;
  alert_reason: string | null;
}

export interface WebsiteMonitor extends MonitorSettings {
  id: number;
  company_id: number;
  client_name: string | null;
  last_run_at: string | null;
  next_run_at: string | null;
  targets: MonitorTarget[];
  recipient_ids: number[];
  created_at: string | null;
}

export interface ReportTotals {
  by_status: Record<string, number>;
  by_seo_band: Record<string, number>;
  pages_ok: number;
  pages_redirect: number;
  pages_error: number;
  pages_noindex: number;
  pages_slow: number;
  avg_response_ms: number | null;
  total_bytes: number;
}

export interface MonitorReport {
  target: MonitorTarget;
  monitor_name: string;
  website_url: string;
  crawl: CrawlSummary | null;
  totals: ReportTotals;
  pages: PageCheck[];
  changes: PageChange[];
  history: CrawlSummary[];
}

export const DEFAULT_MONITOR: MonitorSettings = {
  name: "",
  is_active: true,
  client_id: null,
  interval_hours: 168,
  run_hour: 3,
  timezone: "Europe/Rome",
  max_pages: 100,
  use_sitemap: true,
  crawl_fallback: true,
  respect_robots: true,
  request_delay_ms: 500,
  user_agent: null,
  check_seo: true,
  check_broken_links: true,
  alert_on_errors: true,
  alert_on_noindex: true,
  alert_on_redirects: false,
  alert_on_disappeared: true,
  seo_min_score: null,
  max_response_ms: null,
  notify_in_app: true,
  notify_push: false,
};

/** Cadenze proposte, in ore. */
export const INTERVAL_OPTIONS = [
  { value: 6, label: "Ogni 6 ore" },
  { value: 12, label: "Ogni 12 ore" },
  { value: 24, label: "Ogni giorno" },
  { value: 72, label: "Ogni 3 giorni" },
  { value: 168, label: "Ogni settimana" },
  { value: 336, label: "Ogni 2 settimane" },
  { value: 720, label: "Ogni mese" },
];

export function intervalLabel(hours: number): string {
  const trovato = INTERVAL_OPTIONS.find((o) => o.value === hours);
  if (trovato) return trovato.label;
  if (hours % 24 === 0) return `Ogni ${hours / 24} giorni`;
  return `Ogni ${hours} ore`;
}

export async function listMonitorsApi(companyId: number): Promise<WebsiteMonitor[]> {
  return jsonOrThrow(await authFetch(`${BASE}?company_id=${companyId}`));
}

export async function createMonitorApi(
  companyId: number,
  body: MonitorSettings & { website_ids: number[]; recipient_ids?: number[] }
): Promise<WebsiteMonitor> {
  return jsonOrThrow(
    await authFetch(BASE, {
      method: "POST",
      body: JSON.stringify({ ...body, company_id: companyId }),
    })
  );
}

export async function updateMonitorApi(
  monitorId: number,
  body: Partial<MonitorSettings> & { website_ids?: number[]; recipient_ids?: number[] }
): Promise<WebsiteMonitor> {
  return jsonOrThrow(
    await authFetch(`${BASE}/${monitorId}`, { method: "PATCH", body: JSON.stringify(body) })
  );
}

export async function deleteMonitorApi(monitorId: number): Promise<void> {
  const res = await authFetch(`${BASE}/${monitorId}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string })?.detail ?? "Eliminazione non riuscita");
  }
}

/** Sincrona: con molti siti può prendersi qualche minuto. */
export async function runMonitorApi(monitorId: number, targetId?: number): Promise<WebsiteMonitor> {
  const qs = targetId ? `?target_id=${targetId}` : "";
  return jsonOrThrow(await authFetch(`${BASE}/${monitorId}/run${qs}`, { method: "POST" }));
}

export async function updateTargetApi(
  targetId: number,
  body: { max_pages_override?: number | null; user_agent_override?: string | null; is_paused?: boolean }
): Promise<MonitorTarget> {
  return jsonOrThrow(
    await authFetch(`${BASE}/targets/${targetId}`, { method: "PATCH", body: JSON.stringify(body) })
  );
}

export async function targetReportApi(targetId: number, crawlId?: number): Promise<MonitorReport> {
  const qs = crawlId ? `?crawl_id=${crawlId}` : "";
  return jsonOrThrow(await authFetch(`${BASE}/targets/${targetId}/report${qs}`));
}

/** Scarica il CSV del report. Passa dal fetch autenticato, non da un link. */
export async function downloadReportCsv(targetId: number, crawlId?: number): Promise<void> {
  const qs = crawlId ? `?crawl_id=${crawlId}` : "";
  const res = await authFetch(`${BASE}/targets/${targetId}/report.csv${qs}`);
  if (!res.ok) throw new Error("Export non riuscito");
  const blob = await res.blob();
  const nome =
    res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "report.csv";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}
