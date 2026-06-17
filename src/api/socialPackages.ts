import { API_BASE, authFetch } from "./auth";
import type { BulkDeleteResponse } from "./bulk";
import type { QuoteLineItem, QuotePreviewResponse, QuoteTotals } from "./quotes";

function parseApiError(body: unknown, fallback: string) {
  if (body && typeof body === "object") {
    const detail = (body as { detail?: unknown }).detail;
    const message = (body as { message?: unknown }).message;
    const error = (body as { error?: unknown }).error;
    return (
      (typeof detail === "string" && detail) ||
      (typeof message === "string" && message) ||
      (typeof error === "string" && error) ||
      fallback
    );
  }
  return fallback;
}

async function safeBody(res: Response) {
  return res.json().catch(() => ({}));
}

function mapApiError(status: number, fallback: string) {
  if (status === 403) return "Non hai i permessi necessari.";
  if (status === 404) return "La risorsa non esiste piu, ricarica la pagina.";
  if (status === 422) return "Controlla i dati inseriti e riprova.";
  return fallback;
}

async function requestJson<T>(path: string, init?: RequestInit, fallback = "Operazione non riuscita"): Promise<T> {
  const res = await authFetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    const body = await safeBody(res);
    throw new Error(parseApiError(body, mapApiError(res.status, fallback)));
  }
  return res.json();
}

function buildQuery(params: Record<string, string | number | boolean | null | undefined>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value == null) return;
    if (typeof value === "boolean") {
      if (value) query.set(key, "true");
      return;
    }
    query.set(key, String(value));
  });
  return query.toString();
}

export type SocialPackageBillingPeriod = "oneoff" | "monthly" | "yearly";

export interface SocialPackageBase {
  id: number;
  company_id: number;
  company_ids: number[] | null;
  title: string;
  slug: string;
  description: string | null;
  area: string | null;
  price_badge: string | null;
  currency: string;
  base_price: number | null;
  billing_period: SocialPackageBillingPeriod | null;
  default_duration_months: number | null;
  discount_pct: number;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  sections_count?: number;
  badges_count?: number;
  badge_items_count?: number;
  catalog_items_count?: number;
  quote_lines_count?: number;
  sections?: SocialPackageSection[];
  catalog_items?: SocialPackageCatalogItem[];
}

export interface SocialPackageBadgeItem {
  id: number;
  badge_id: number;
  title: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface SocialPackageBadge {
  id: number;
  section_id: number;
  title: string;
  slug: string;
  description: string | null;
  tone?: string | null;
  color: string | null;
  sort_order: number;
  is_active: boolean;
  items: SocialPackageBadgeItem[];
  created_at?: string;
  updated_at?: string;
}

export interface SocialPackageSection {
  id: number;
  package_id: number;
  title: string;
  slug: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  badges: SocialPackageBadge[];
  created_at?: string;
  updated_at?: string;
}

export interface SocialPackageCatalogItem {
  id: number;
  package_id: number;
  service_id: number | null;
  service_name: string | null;
  title: string;
  description: string | null;
  area: string | null;
  category: string | null;
  quantity: number;
  unit_amount: number | null;
  billing_period: SocialPackageBillingPeriod | null;
  discount_pct: number;
  is_included: boolean;
  sort_order: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface SocialPackageDetail extends SocialPackageBase {
  sections: SocialPackageSection[];
  catalog_items: SocialPackageCatalogItem[];
}

export interface SocialPackageListParams {
  company_id?: number;
  q?: string;
  area?: string;
  include_inactive?: boolean;
}

export interface CreateSocialPackagePayload {
  company_id: number;
  company_ids?: number[] | null;
  title: string;
  slug: string;
  description?: string | null;
  area?: string | null;
  price_badge?: string | null;
  currency?: string;
  base_price?: number | null;
  billing_period?: SocialPackageBillingPeriod | null;
  default_duration_months?: number | null;
  discount_pct?: number;
  sort_order?: number;
  is_active?: boolean;
  sections?: SocialPackageSection[];
  catalog_items?: SocialPackageCatalogItem[];
}

export type UpdateSocialPackagePayload = Partial<CreateSocialPackagePayload>;

export interface CreateSocialPackageSectionPayload {
  title: string;
  slug: string;
  description?: string | null;
  sort_order?: number;
  is_active?: boolean;
}

export type UpdateSocialPackageSectionPayload = Partial<CreateSocialPackageSectionPayload>;

export interface CreateSocialPackageBadgePayload {
  title: string;
  slug: string;
  description?: string | null;
  color?: string | null;
  sort_order?: number;
  is_active?: boolean;
}

export type UpdateSocialPackageBadgePayload = Partial<CreateSocialPackageBadgePayload>;

export interface CreateSocialPackageBadgeItemPayload {
  title: string;
  description?: string | null;
  sort_order?: number;
  is_active?: boolean;
}

export type UpdateSocialPackageBadgeItemPayload = Partial<CreateSocialPackageBadgeItemPayload>;

export interface CreateSocialPackageCatalogItemPayload {
  service_id?: number | null;
  title: string;
  description?: string | null;
  area?: string | null;
  category?: string | null;
  quantity?: number;
  unit_amount?: number | null;
  billing_period?: SocialPackageBillingPeriod | null;
  discount_pct?: number;
  is_included?: boolean;
  sort_order?: number;
  is_active?: boolean;
}

export type UpdateSocialPackageCatalogItemPayload = Partial<CreateSocialPackageCatalogItemPayload>;

export interface SocialPackageQuoteLinesResponse {
  package_id: number;
  duration_months: number;
  lines: QuoteLineItem[];
  totals: QuoteTotals | null;
}

export interface SocialPackageQuotePreviewPayload {
  client_id?: number | null;
  company_id?: number | null;
  date?: string | null;
  tag?: string | null;
  notes?: string | null;
  discount_pct?: number;
  discount_eur?: number;
  duration_months?: number;
}

export interface SocialPackageQuotePreviewResponse extends QuotePreviewResponse {
  package_id: number;
  package_title: string;
  package_slug: string;
  duration_months: number;
}

function normalizeBadgeItem(raw: unknown): SocialPackageBadgeItem {
  const item = (raw ?? {}) as Record<string, unknown>;
  return {
    id: Number(item.id ?? 0),
    badge_id: Number(item.badge_id ?? 0),
    title: String(item.title ?? item.text ?? ""),
    description: item.description == null ? null : String(item.description),
    sort_order: Number(item.sort_order ?? 0),
    is_active: item.is_active == null ? true : Boolean(item.is_active),
    created_at: typeof item.created_at === "string" ? item.created_at : undefined,
    updated_at: typeof item.updated_at === "string" ? item.updated_at : undefined,
  };
}

function normalizeBadge(raw: unknown): SocialPackageBadge {
  const badge = (raw ?? {}) as Record<string, unknown>;
  const rawItems = Array.isArray(badge.items)
    ? badge.items
    : Array.isArray(badge.bullet_items)
      ? badge.bullet_items
      : [];

  return {
    id: Number(badge.id ?? 0),
    section_id: Number(badge.section_id ?? 0),
    title: String(badge.title ?? ""),
    slug: String(badge.slug ?? ""),
    description: badge.description == null ? null : String(badge.description),
    tone: badge.tone == null ? null : String(badge.tone),
    color: badge.color == null ? null : String(badge.color),
    sort_order: Number(badge.sort_order ?? 0),
    is_active: badge.is_active == null ? true : Boolean(badge.is_active),
    items: rawItems.map((item) => normalizeBadgeItem(item)),
    created_at: typeof badge.created_at === "string" ? badge.created_at : undefined,
    updated_at: typeof badge.updated_at === "string" ? badge.updated_at : undefined,
  };
}

function normalizeSection(raw: unknown): SocialPackageSection {
  const section = (raw ?? {}) as Record<string, unknown>;
  const rawBadges = Array.isArray(section.badges) ? section.badges : [];

  return {
    id: Number(section.id ?? 0),
    package_id: Number(section.package_id ?? 0),
    title: String(section.title ?? ""),
    slug: String(section.slug ?? ""),
    description: section.description == null ? null : String(section.description),
    sort_order: Number(section.sort_order ?? 0),
    is_active: section.is_active == null ? true : Boolean(section.is_active),
    badges: rawBadges.map((badge) => normalizeBadge(badge)),
    created_at: typeof section.created_at === "string" ? section.created_at : undefined,
    updated_at: typeof section.updated_at === "string" ? section.updated_at : undefined,
  };
}

function normalizeSocialPackageDetail(raw: unknown): SocialPackageDetail {
  const detail = raw as SocialPackageDetail & Record<string, unknown>;
  const sections = Array.isArray(detail.sections) ? detail.sections : [];

  return {
    ...detail,
    sections: sections.map((section) => normalizeSection(section)),
    catalog_items: Array.isArray(detail.catalog_items) ? detail.catalog_items : [],
  };
}

function normalizeSocialPackageBase(raw: unknown): SocialPackageBase {
  const base = raw as SocialPackageBase & Record<string, unknown>;
  const sections = Array.isArray(base.sections) ? base.sections : undefined;

  return {
    ...base,
    sections: sections ? sections.map((section) => normalizeSection(section)) : undefined,
    catalog_items: Array.isArray(base.catalog_items) ? base.catalog_items : undefined,
  };
}

export async function listSocialPackagesApi(params: SocialPackageListParams = {}): Promise<SocialPackageBase[]> {
  const query = buildQuery({
    company_id: params.company_id,
    q: params.q,
    area: params.area,
    include_inactive: params.include_inactive,
  });
  const suffix = query ? `?${query}` : "";
  const response = await requestJson<unknown[]>(
    `/api/v1/social-packages${suffix}`,
    undefined,
    "Impossibile recuperare i pacchetti social"
  );
  return response.map((item) => normalizeSocialPackageBase(item));
}

export async function getSocialPackageApi(packageId: number): Promise<SocialPackageDetail> {
  const response = await requestJson<unknown>(
    `/api/v1/social-packages/${packageId}`,
    undefined,
    "Impossibile recuperare il pacchetto social"
  );
  return normalizeSocialPackageDetail(response);
}

export async function createSocialPackageApi(payload: CreateSocialPackagePayload): Promise<SocialPackageBase> {
  return requestJson(
    "/api/v1/social-packages",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    "Errore creazione pacchetto social"
  );
}

export async function updateSocialPackageApi(
  packageId: number,
  payload: UpdateSocialPackagePayload
): Promise<SocialPackageBase> {
  return requestJson(
    `/api/v1/social-packages/${packageId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    "Errore aggiornamento pacchetto social"
  );
}

export async function deleteSocialPackageApi(packageId: number): Promise<void> {
  await requestJson(
    `/api/v1/social-packages/${packageId}`,
    { method: "DELETE" },
    "Errore eliminazione pacchetto social"
  );
}

export async function bulkDeleteSocialPackagesApi(ids: number[]): Promise<BulkDeleteResponse> {
  return requestJson(
    "/api/v1/social-packages/bulk-delete",
    {
      method: "POST",
      body: JSON.stringify({ ids }),
    },
    "Errore eliminazione bulk pacchetti social"
  );
}

export async function createSocialPackageSectionApi(
  packageId: number,
  payload: CreateSocialPackageSectionPayload
): Promise<SocialPackageSection> {
  return requestJson(
    `/api/v1/social-packages/${packageId}/sections`,
    { method: "POST", body: JSON.stringify(payload) },
    "Errore creazione sezione"
  );
}

export async function updateSocialPackageSectionApi(
  sectionId: number,
  payload: UpdateSocialPackageSectionPayload
): Promise<SocialPackageSection> {
  return requestJson(
    `/api/v1/social-packages/sections/${sectionId}`,
    { method: "PATCH", body: JSON.stringify(payload) },
    "Errore aggiornamento sezione"
  );
}

export async function deleteSocialPackageSectionApi(sectionId: number): Promise<void> {
  await requestJson(
    `/api/v1/social-packages/sections/${sectionId}`,
    { method: "DELETE" },
    "Errore eliminazione sezione"
  );
}

export async function createSocialPackageBadgeApi(
  sectionId: number,
  payload: CreateSocialPackageBadgePayload
): Promise<SocialPackageBadge> {
  return requestJson(
    `/api/v1/social-packages/sections/${sectionId}/badges`,
    { method: "POST", body: JSON.stringify(payload) },
    "Errore creazione badge"
  );
}

export async function updateSocialPackageBadgeApi(
  badgeId: number,
  payload: UpdateSocialPackageBadgePayload
): Promise<SocialPackageBadge> {
  return requestJson(
    `/api/v1/social-packages/badges/${badgeId}`,
    { method: "PATCH", body: JSON.stringify(payload) },
    "Errore aggiornamento badge"
  );
}

export async function deleteSocialPackageBadgeApi(badgeId: number): Promise<void> {
  await requestJson(
    `/api/v1/social-packages/badges/${badgeId}`,
    { method: "DELETE" },
    "Errore eliminazione badge"
  );
}

export async function createSocialPackageBadgeItemApi(
  badgeId: number,
  payload: CreateSocialPackageBadgeItemPayload
): Promise<SocialPackageBadgeItem> {
  return requestJson(
    `/api/v1/social-packages/badges/${badgeId}/items`,
    { method: "POST", body: JSON.stringify(payload) },
    "Errore creazione bullet item"
  );
}

export async function updateSocialPackageBadgeItemApi(
  itemId: number,
  payload: UpdateSocialPackageBadgeItemPayload
): Promise<SocialPackageBadgeItem> {
  return requestJson(
    `/api/v1/social-packages/badge-items/${itemId}`,
    { method: "PATCH", body: JSON.stringify(payload) },
    "Errore aggiornamento bullet item"
  );
}

export async function deleteSocialPackageBadgeItemApi(itemId: number): Promise<void> {
  await requestJson(
    `/api/v1/social-packages/badge-items/${itemId}`,
    { method: "DELETE" },
    "Errore eliminazione bullet item"
  );
}

export async function createSocialPackageCatalogItemApi(
  packageId: number,
  payload: CreateSocialPackageCatalogItemPayload
): Promise<SocialPackageCatalogItem> {
  return requestJson(
    `/api/v1/social-packages/${packageId}/catalog-items`,
    { method: "POST", body: JSON.stringify(payload) },
    "Errore creazione riga catalogo"
  );
}

export async function updateSocialPackageCatalogItemApi(
  itemId: number,
  payload: UpdateSocialPackageCatalogItemPayload
): Promise<SocialPackageCatalogItem> {
  return requestJson(
    `/api/v1/social-packages/catalog-items/${itemId}`,
    { method: "PATCH", body: JSON.stringify(payload) },
    "Errore aggiornamento riga catalogo"
  );
}

export async function deleteSocialPackageCatalogItemApi(itemId: number): Promise<void> {
  await requestJson(
    `/api/v1/social-packages/catalog-items/${itemId}`,
    { method: "DELETE" },
    "Errore eliminazione riga catalogo"
  );
}

export async function getSocialPackageQuoteLinesApi(
  packageId: number,
  durationMonths: number
): Promise<SocialPackageQuoteLinesResponse> {
  const query = buildQuery({ duration_months: durationMonths });
  const suffix = query ? `?${query}` : "";
  return requestJson(
    `/api/v1/social-packages/${packageId}/quote-lines${suffix}`,
    undefined,
    "Impossibile recuperare le righe preventivo del pacchetto social"
  );
}

export async function previewSocialPackageQuoteApi(
  packageId: number,
  payload: SocialPackageQuotePreviewPayload = {}
): Promise<SocialPackageQuotePreviewResponse> {
  return requestJson(
    `/api/v1/social-packages/${packageId}/quote-preview`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    "Impossibile generare l'anteprima preventivo"
  );
}
