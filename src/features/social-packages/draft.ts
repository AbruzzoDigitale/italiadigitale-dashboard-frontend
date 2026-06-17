import type {
  CreateSocialPackageBadgeItemPayload,
  CreateSocialPackageBadgePayload,
  CreateSocialPackageCatalogItemPayload,
  CreateSocialPackagePayload,
  CreateSocialPackageSectionPayload,
  SocialPackageBadge,
  SocialPackageBadgeItem,
  SocialPackageCatalogItem,
  SocialPackageDetail,
  SocialPackageSection,
  SocialPackageBillingPeriod,
  UpdateSocialPackageBadgeItemPayload,
  UpdateSocialPackageBadgePayload,
  UpdateSocialPackageCatalogItemPayload,
  UpdateSocialPackagePayload,
  UpdateSocialPackageSectionPayload,
} from "../../api/socialPackages";

export interface SocialPackageDraft {
  company_id: number | null;
  title: string;
  slug: string;
  description: string;
  area: string;
  price_badge: string;
  currency: string;
  base_price: string;
  billing_period: SocialPackageBillingPeriod | "";
  default_duration_months: string;
  discount_pct: string;
  sort_order: string;
  is_active: boolean;
}

export interface SocialPackageSectionDraft {
  title: string;
  slug: string;
  description: string;
  sort_order: string;
  is_active: boolean;
}

export interface SocialPackageBadgeDraft {
  title: string;
  slug: string;
  description: string;
  color: string;
  sort_order: string;
  is_active: boolean;
}

export interface SocialPackageBadgeItemDraft {
  title: string;
  description: string;
  sort_order: string;
  is_active: boolean;
}

export interface SocialPackageCatalogItemDraft {
  service_id: string;
  title: string;
  description: string;
  area: string;
  category: string;
  quantity: string;
  unit_amount: string;
  billing_period: SocialPackageBillingPeriod | "";
  discount_pct: string;
  is_included: boolean;
  sort_order: string;
  is_active: boolean;
}

export const EMPTY_SOCIAL_PACKAGE_DRAFT: SocialPackageDraft = {
  company_id: null,
  title: "",
  slug: "",
  description: "",
  area: "",
  price_badge: "",
  currency: "EUR",
  base_price: "",
  billing_period: "monthly",
  default_duration_months: "",
  discount_pct: "0",
  sort_order: "0",
  is_active: true,
};

export const EMPTY_SOCIAL_PACKAGE_SECTION_DRAFT: SocialPackageSectionDraft = {
  title: "",
  slug: "",
  description: "",
  sort_order: "0",
  is_active: true,
};

export const EMPTY_SOCIAL_PACKAGE_BADGE_DRAFT: SocialPackageBadgeDraft = {
  title: "",
  slug: "",
  description: "",
  color: "",
  sort_order: "0",
  is_active: true,
};

export const EMPTY_SOCIAL_PACKAGE_BADGE_ITEM_DRAFT: SocialPackageBadgeItemDraft = {
  title: "",
  description: "",
  sort_order: "0",
  is_active: true,
};

export const EMPTY_SOCIAL_PACKAGE_CATALOG_ITEM_DRAFT: SocialPackageCatalogItemDraft = {
  service_id: "",
  title: "",
  description: "",
  area: "",
  category: "",
  quantity: "1",
  unit_amount: "",
  billing_period: "monthly",
  discount_pct: "0",
  is_included: false,
  sort_order: "0",
  is_active: true,
};

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function formatCurrency(amount: number | null | undefined, currency = "EUR") {
  if (amount == null) return "-";
  try {
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

export function toNumber(value: string, fallback: number | null = null) {
  if (!value.trim()) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeDraft(detail?: SocialPackageDetail | null): SocialPackageDraft {
  return {
    company_id: detail?.company_id ?? null,
    title: detail?.title ?? "",
    slug: detail?.slug ?? "",
    description: detail?.description ?? "",
    area: detail?.area ?? "",
    price_badge: detail?.price_badge ?? "",
    currency: detail?.currency ?? "EUR",
    base_price: detail?.base_price == null ? "" : String(detail.base_price),
    billing_period: detail?.billing_period ?? "",
    default_duration_months: detail?.default_duration_months == null ? "" : String(detail.default_duration_months),
    discount_pct: String(detail?.discount_pct ?? 0),
    sort_order: String(detail?.sort_order ?? 0),
    is_active: detail?.is_active ?? true,
  };
}

export function normalizeSectionDraft(section?: SocialPackageSection | null): SocialPackageSectionDraft {
  return {
    title: section?.title ?? "",
    slug: section?.slug ?? "",
    description: section?.description ?? "",
    sort_order: String(section?.sort_order ?? 0),
    is_active: section?.is_active ?? true,
  };
}

export function normalizeBadgeDraft(badge?: SocialPackageBadge | null): SocialPackageBadgeDraft {
  return {
    title: badge?.title ?? "",
    slug: badge?.slug ?? "",
    description: badge?.description ?? "",
    color: badge?.color ?? "",
    sort_order: String(badge?.sort_order ?? 0),
    is_active: badge?.is_active ?? true,
  };
}

export function normalizeBadgeItemDraft(item?: SocialPackageBadgeItem | null): SocialPackageBadgeItemDraft {
  return {
    title: item?.title ?? "",
    description: item?.description ?? "",
    sort_order: String(item?.sort_order ?? 0),
    is_active: item?.is_active ?? true,
  };
}

export function normalizeCatalogItemDraft(item?: SocialPackageCatalogItem | null): SocialPackageCatalogItemDraft {
  return {
    service_id: item?.service_id == null ? "" : String(item.service_id),
    title: item?.title ?? "",
    description: item?.description ?? "",
    area: item?.area ?? "",
    category: item?.category ?? "",
    quantity: String(item?.quantity ?? 1),
    unit_amount: item?.unit_amount == null ? "" : String(item.unit_amount),
    billing_period: item?.billing_period ?? "",
    discount_pct: String(item?.discount_pct ?? 0),
    is_included: item?.is_included ?? false,
    sort_order: String(item?.sort_order ?? 0),
    is_active: item?.is_active ?? true,
  };
}

export function buildSocialPackagePayload(form: SocialPackageDraft): CreateSocialPackagePayload | UpdateSocialPackagePayload {
  return {
    company_id: form.company_id ?? 0,
    title: form.title.trim(),
    slug: form.slug.trim(),
    description: form.description.trim() || null,
    area: form.area.trim() || null,
    price_badge: form.price_badge.trim() || null,
    currency: form.currency.trim() || "EUR",
    base_price: toNumber(form.base_price, null),
    billing_period: form.billing_period || null,
    default_duration_months: toNumber(form.default_duration_months, null),
    discount_pct: toNumber(form.discount_pct, 0) ?? 0,
    sort_order: toNumber(form.sort_order, 0) ?? 0,
    is_active: form.is_active,
  };
}

export function buildSectionPayload(form: SocialPackageSectionDraft): CreateSocialPackageSectionPayload | UpdateSocialPackageSectionPayload {
  return {
    title: form.title.trim(),
    slug: form.slug.trim(),
    description: form.description.trim() || null,
    sort_order: toNumber(form.sort_order, 0) ?? 0,
    is_active: form.is_active,
  };
}

export function buildBadgePayload(form: SocialPackageBadgeDraft): CreateSocialPackageBadgePayload | UpdateSocialPackageBadgePayload {
  return {
    title: form.title.trim(),
    slug: form.slug.trim(),
    description: form.description.trim() || null,
    color: form.color.trim() || null,
    sort_order: toNumber(form.sort_order, 0) ?? 0,
    is_active: form.is_active,
  };
}

export function buildBadgeItemPayload(
  form: SocialPackageBadgeItemDraft
): CreateSocialPackageBadgeItemPayload | UpdateSocialPackageBadgeItemPayload {
  return {
    title: form.title.trim(),
    description: form.description.trim() || null,
    sort_order: toNumber(form.sort_order, 0) ?? 0,
    is_active: form.is_active,
  };
}

export function buildCatalogItemPayload(
  form: SocialPackageCatalogItemDraft
): CreateSocialPackageCatalogItemPayload | UpdateSocialPackageCatalogItemPayload {
  return {
    service_id: form.service_id.trim() ? Number(form.service_id) : null,
    title: form.title.trim(),
    description: form.description.trim() || null,
    area: form.area.trim() || null,
    category: form.category.trim() || null,
    quantity: toNumber(form.quantity, 1) ?? 1,
    unit_amount: toNumber(form.unit_amount, null),
    billing_period: form.billing_period || null,
    discount_pct: toNumber(form.discount_pct, 0) ?? 0,
    is_included: form.is_included,
    sort_order: toNumber(form.sort_order, 0) ?? 0,
    is_active: form.is_active,
  };
}
