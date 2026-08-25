import { authFetch, API_BASE } from "./auth";

// ─────────────────────────────────────────────────────────────────────────────
// Monitor (configurazioni di revisione) delle pubblicazioni social.
// Gestione riservata ad admin e PM. Vedi app/api/v1/endpoints/social_monitors.py.
// ─────────────────────────────────────────────────────────────────────────────

const BASE = `${API_BASE}/api/v1/social-monitors`;

export interface SocialMonitorTarget {
  id: number;
  social_profile_id: number;
  platform: string | null;
  profile_name: string | null;
  profile_url: string | null;
  client_id: number | null;
  client_name: string | null;
  is_active: boolean;
  inactivity_days_override: number | null;
  last_post_at: string | null;
  last_carousel_at: string | null;
  last_reel_at: string | null;
  last_story_at: string | null;
  last_checked_at: string | null;
  is_alerting: boolean;
  last_error: string | null;
  last_error_at: string | null;
}

export interface SocialMonitorRecipient {
  user_id: number;
  name: string | null;
}

export interface SocialMonitor {
  id: number;
  company_id: number;
  client_id: number | null;
  client_name: string | null;
  work_item_id: number | null;
  work_item_title: string | null;
  name: string;
  is_active: boolean;
  auto_disable_at: string | null;
  interval_hours: number;
  run_hour: number | null;
  timezone: string;
  default_inactivity_days: number;
  reminder_interval_days: number;
  analysis_depth: number;
  fetch_insights: boolean;
  check_posts: boolean;
  check_carousels: boolean;
  check_reels: boolean;
  check_stories: boolean;
  posts_inactivity_days: number;
  carousels_inactivity_days: number;
  reels_inactivity_days: number;
  stories_inactivity_days: number;
  check_pace: boolean;
  target_posts_per_month: number | null;
  target_carousels_per_month: number | null;
  target_reels_per_month: number | null;
  target_stories_per_month: number | null;
  notify_in_app: boolean;
  notify_push: boolean;
  operators_can_view: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string | null;
  targets: SocialMonitorTarget[];
  recipients: SocialMonitorRecipient[];
}

export interface SocialMonitorCreate {
  company_id: number;
  name: string;
  client_id?: number | null;
  work_item_id?: number | null;
  social_profile_ids?: number[];
  recipient_user_ids?: number[];
  interval_hours?: number;
  run_hour?: number | null;
  timezone?: string;
  default_inactivity_days?: number;
  reminder_interval_days?: number;
  analysis_depth?: number;
  fetch_insights?: boolean;
  check_posts?: boolean;
  check_carousels?: boolean;
  check_reels?: boolean;
  check_stories?: boolean;
  posts_inactivity_days?: number;
  carousels_inactivity_days?: number;
  reels_inactivity_days?: number;
  stories_inactivity_days?: number;
  check_pace?: boolean;
  target_posts_per_month?: number | null;
  target_carousels_per_month?: number | null;
  target_reels_per_month?: number | null;
  target_stories_per_month?: number | null;
  notify_in_app?: boolean;
  notify_push?: boolean;
  operators_can_view?: boolean;
  is_active?: boolean;
  auto_disable_at?: string | null;
}

export type SocialMonitorUpdate = Partial<Omit<SocialMonitorCreate, "company_id">>;

export interface SocialMonitorRun {
  id: number;
  started_at: string | null;
  finished_at: string | null;
  status: string;
  targets_total: number;
  targets_ok: number;
  targets_error: number;
  alerts_triggered: number;
  error_message: string | null;
}

export interface SocialAlert {
  id: number;
  monitor_id: number;
  social_profile_id: number;
  profile_name: string | null;
  platform: string | null;
  alert_type: string;
  content_type: string;
  triggered_at: string | null;
  days_inactive: number | null;
  last_post_at: string | null;
  expected_count: number | null;
  actual_count: number | null;
  last_reminder_at: string | null;
  resolved_at: string | null;
  resolved_reason: string | null;
}

export interface PaceRow {
  target_id: number;
  social_profile_id: number;
  platform: string | null;
  profile_name: string | null;
  content_type: string;
  label: string;
  target_per_month: number;
  expected: number;
  actual: number;
  deficit: number;
  behind: boolean;
  window_start: string | null;
  window_end: string | null;
  elapsed_days: number;
  expected_gap_days: number | null;
  actual_gap_days: number | null;
}

export interface PeriodCount {
  period: string;
  count: number;
}
export interface PeriodEngagement {
  period: string;
  posts: number;
  avg_likes: number | null;
  avg_comments: number | null;
  avg_reach: number | null;
}
export interface CadenceSummary {
  posts: number;
  first_post_at: string | null;
  last_post_at: string | null;
  avg_gap_days: number | null;
}
export interface SocialAnalytics {
  posts_per_period: PeriodCount[];
  engagement_per_period: PeriodEngagement[];
  cadence: CadenceSummary;
  counts_by_type: Record<string, number>;
}

export interface RecentPost {
  id: number;
  social_profile_id: number;
  platform: string | null;
  content_type: string;
  posted_at: string | null;
  permalink: string | null;
  caption: string | null;
  media_type: string | null;
  thumbnail_url: string | null;
  like_count: number | null;
  comments_count: number | null;
  reach: number | null;
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string })?.detail ?? "Errore imprevisto");
  }
  return res.json() as Promise<T>;
}

// ── CRUD ──────────────────────────────────────────────────────────────────────
export async function listMonitorsApi(companyId?: number | null): Promise<SocialMonitor[]> {
  const qs = companyId != null ? `?company_id=${companyId}` : "";
  return jsonOrThrow(await authFetch(`${BASE}${qs}`));
}

export async function getMonitorApi(id: number): Promise<SocialMonitor> {
  return jsonOrThrow(await authFetch(`${BASE}/${id}`));
}

/** Monitor collegato a una task (null se assente o non visibile all'utente). */
export async function getMonitorForWorkItemApi(workItemId: number): Promise<SocialMonitor | null> {
  return jsonOrThrow(await authFetch(`${BASE}/for-work-item/${workItemId}`));
}

/** Crea un monitor pre-compilato dalla configurazione PED della task (admin/PM). */
export async function suggestMonitorFromWorkItemApi(workItemId: number): Promise<SocialMonitor> {
  return jsonOrThrow(await authFetch(`${BASE}/suggest-from-work-item/${workItemId}`, { method: "POST" }));
}

export async function createMonitorApi(body: SocialMonitorCreate): Promise<SocialMonitor> {
  return jsonOrThrow(
    await authFetch(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

export async function updateMonitorApi(id: number, body: SocialMonitorUpdate): Promise<SocialMonitor> {
  return jsonOrThrow(
    await authFetch(`${BASE}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

export async function deleteMonitorApi(id: number): Promise<void> {
  const res = await authFetch(`${BASE}/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string })?.detail ?? "Errore eliminazione monitor");
  }
}

export async function runMonitorNowApi(id: number): Promise<SocialMonitor> {
  return jsonOrThrow(await authFetch(`${BASE}/${id}/run`, { method: "POST" }));
}

/** Ritmo pubblicazioni vs PED (per profilo e tipo). Vuoto se il monitor non ha check_pace. */
export async function getMonitorPaceApi(id: number): Promise<PaceRow[]> {
  return jsonOrThrow(await authFetch(`${BASE}/${id}/pace`));
}

// ── Letture ─────────────────────────────────────────────────────────────────
export async function listMonitorRunsApi(id: number, limit = 20): Promise<SocialMonitorRun[]> {
  return jsonOrThrow(await authFetch(`${BASE}/${id}/runs?limit=${limit}`));
}

export async function listMonitorAlertsApi(
  id: number,
  status: "all" | "open" = "all",
  limit = 50
): Promise<SocialAlert[]> {
  return jsonOrThrow(await authFetch(`${BASE}/${id}/alerts?status=${status}&limit=${limit}`));
}

export interface AnalyticsParams {
  companyId: number;
  clientId?: number | null;
  socialProfileId?: number | null;
  platform?: string | null;
  granularity?: "day" | "week" | "month";
  days?: number | null;
}

function analyticsQuery(p: AnalyticsParams): string {
  const qs = new URLSearchParams();
  qs.set("company_id", String(p.companyId));
  if (p.clientId != null) qs.set("client_id", String(p.clientId));
  if (p.socialProfileId != null) qs.set("social_profile_id", String(p.socialProfileId));
  if (p.platform) qs.set("platform", p.platform);
  if (p.granularity) qs.set("granularity", p.granularity);
  if (p.days != null) qs.set("days", String(p.days));
  return qs.toString();
}

export async function getMonitorAnalyticsApi(p: AnalyticsParams): Promise<SocialAnalytics> {
  return jsonOrThrow(await authFetch(`${BASE}/analytics?${analyticsQuery(p)}`));
}

export async function listRecentPostsApi(
  p: AnalyticsParams & { limit?: number }
): Promise<RecentPost[]> {
  const qs = analyticsQuery(p);
  const extra = p.limit != null ? `&limit=${p.limit}` : "";
  return jsonOrThrow(await authFetch(`${BASE}/analytics/recent-posts?${qs}${extra}`));
}

// ── Aggregazioni per singolo monitor ──────────────────────────────────────────
export async function getMonitorAnalyticsByIdApi(
  id: number,
  opts?: { granularity?: "day" | "week" | "month"; days?: number | null; platform?: string | null }
): Promise<SocialAnalytics> {
  const qs = new URLSearchParams();
  if (opts?.granularity) qs.set("granularity", opts.granularity);
  if (opts?.days != null) qs.set("days", String(opts.days));
  if (opts?.platform) qs.set("platform", opts.platform);
  const q = qs.toString();
  return jsonOrThrow(await authFetch(`${BASE}/${id}/analytics${q ? `?${q}` : ""}`));
}

export async function listMonitorRecentPostsByIdApi(
  id: number,
  opts?: { limit?: number; platform?: string | null; contentType?: string | null }
): Promise<RecentPost[]> {
  const qs = new URLSearchParams();
  if (opts?.limit != null) qs.set("limit", String(opts.limit));
  if (opts?.platform) qs.set("platform", opts.platform);
  if (opts?.contentType) qs.set("content_type", opts.contentType);
  const q = qs.toString();
  return jsonOrThrow(await authFetch(`${BASE}/${id}/recent-posts${q ? `?${q}` : ""}`));
}
