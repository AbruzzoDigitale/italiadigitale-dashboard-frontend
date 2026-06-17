import { authFetch, API_BASE } from "./auth";

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

function mapCatalogError(status: number, fallback: string) {
  if (status === 403) return "Non hai i permessi necessari.";
  if (status === 404) return "La risorsa non esiste piu, ricarica la pagina.";
  if (status === 422) return "Controlla i vincoli di dipendenza o bundle.";
  return fallback;
}

export type CatalogProductType = "service" | "bundle" | "option";
export type CatalogBillingPeriod = "oneoff" | "monthly" | "yearly";

export interface CatalogCategory {
  id: number;
  company_id: number;
  company_ids: number[] | null;
  parent_id: number | null;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  icon_set: string | null;
  icon_name: string | null;
  sort_order: number;
  meta: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CatalogService {
  id: number;
  company_id: number;
  company_ids: number[] | null;
  category_id: number;
  parent_service_id: number | null;
  title: string;
  slug: string;
  description: string | null;
  icon: string | null;
  icon_set: string | null;
  icon_name: string | null;
  product_type: CatalogProductType;
  base_amount: number | null;
  base_billing_period: CatalogBillingPeriod | null;
  currency: string;
  sort_order: number;
  meta: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CatalogServiceDetail extends CatalogService {
  prices: CatalogServicePrice[];
  dependencies: CatalogServiceDependency[];
  bundle_items: CatalogBundleItem[];
  option_services: CatalogService[];
}

export interface CatalogDependencyViolation {
  dependency_rule_id?: number;
  code?: string;
  message?: string;
  detail?: string;
  required_service_id?: number | null;
  required_category_id?: number | null;
}

export interface CatalogServiceTreeNode extends CatalogService {
  prices: CatalogServicePrice[];
  dependencies: CatalogServiceDependency[];
  bundle_items: CatalogBundleItem[];
  option_services: CatalogServiceTreeNode[];
  can_select: boolean;
  dependency_violations: Array<CatalogDependencyViolation | string>;
}

export interface CatalogCategoryTreeNode extends CatalogCategory {
  children: CatalogCategoryTreeNode[];
  services: CatalogServiceTreeNode[];
  /** Server-evaluated: true when required sub-sections are missing or incomplete */
  has_composition_issues?: boolean;
  /** Human-readable list of missing required children names */
  missing_required_children?: string[];
  /** Optional server-provided warning message */
  composition_warning?: string | null;
}

export interface CatalogTreeResponse {
  company_id: number;
  selected_service_ids: number[];
  roots: CatalogCategoryTreeNode[];
}

export interface CatalogProductFlatResponse extends CatalogServiceDetail {
  category_name: string;
  category_slug: string;
  bundle_parent_ids: number[];
  is_bundle_component: boolean;
}

export interface CatalogServicePrice {
  billing_period: CatalogBillingPeriod;
  amount: number | null;
  is_default: boolean;
  sort_order: number;
}

export interface CatalogServiceDependency {
  required_service_id?: number | null;
  required_category_id?: number | null;
  match_type: "any" | "all";
  min_selected: number;
  sort_order: number;
  is_active: boolean;
}

export interface CatalogBundleItem {
  item_service_id: number;
  group_key: string | null;
  group_label: string | null;
  is_required: boolean;
  min_select: number;
  max_select: number | null;
  sort_order: number;
}

export interface CreateCategoryPayload {
  company_id: number;
  company_ids?: number[] | null;
  parent_id?: number | null;
  name: string;
  slug: string;
  description?: string | null;
  sort_order?: number;
  is_active?: boolean;
}

export type UpdateCategoryPayload = Partial<CreateCategoryPayload>;

export interface CreateServicePayload {
  company_id: number;
  company_ids?: number[] | null;
  category_id: number;
  parent_service_id?: number | null;
  title: string;
  slug: string;
  description?: string | null;
  product_type?: CatalogProductType;
  base_amount?: number | null;
  base_billing_period?: CatalogBillingPeriod | null;
  currency?: string;
  sort_order?: number;
  is_active?: boolean;
}

export type UpdateServicePayload = Partial<CreateServicePayload>;

export interface ListCatalogServicesParams {
  company_id: number;
  category_id?: number;
  parent_service_id?: number;
}

export interface CatalogTreeParams {
  company_id: number;
  selected_service_ids?: number[];
}

export interface CatalogProductsFlatParams {
  company_id: number;
  category_id?: number;
  product_type?: CatalogProductType;
  include_inactive?: boolean;
  only_standalone?: boolean;
}

export async function listCatalogCategoriesApi(companyId: number): Promise<CatalogCategory[]> {
  const res = await authFetch(`${API_BASE}/api/v1/catalog/categories?company_id=${companyId}`);
  if (!res.ok) {
    const body = await safeBody(res);
    throw new Error(parseApiError(body, mapCatalogError(res.status, "Impossibile recuperare le categorie")));
  }
  return res.json();
}

export async function getCatalogTreeApi(params: CatalogTreeParams): Promise<CatalogTreeResponse> {
  const query = new URLSearchParams({ company_id: String(params.company_id) });
  if (params.selected_service_ids && params.selected_service_ids.length > 0) {
    query.set("selected_service_ids", params.selected_service_ids.join(","));
  }
  const res = await authFetch(`${API_BASE}/api/v1/catalog/tree?${query.toString()}`);
  if (!res.ok) {
    const body = await safeBody(res);
    throw new Error(parseApiError(body, mapCatalogError(res.status, "Impossibile recuperare l'albero catalogo")));
  }
  return res.json();
}

export async function getCatalogProductsFlatApi(params: CatalogProductsFlatParams): Promise<CatalogProductFlatResponse[]> {
  const query = new URLSearchParams({ company_id: String(params.company_id) });
  if (params.category_id != null) query.set("category_id", String(params.category_id));
  if (params.product_type) query.set("product_type", params.product_type);
  if (params.include_inactive) query.set("include_inactive", "true");
  if (params.only_standalone) query.set("only_standalone", "true");

  const res = await authFetch(`${API_BASE}/api/v1/catalog/products?${query.toString()}`);
  if (!res.ok) {
    const body = await safeBody(res);
    throw new Error(parseApiError(body, mapCatalogError(res.status, "Impossibile recuperare i prodotti catalogo")));
  }
  return res.json();
}

export async function createCatalogCategoryApi(payload: CreateCategoryPayload): Promise<CatalogCategory> {
  const res = await authFetch(`${API_BASE}/api/v1/catalog/categories`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await safeBody(res);
    throw new Error(parseApiError(body, mapCatalogError(res.status, "Errore creazione categoria")));
  }
  return res.json();
}

export async function updateCatalogCategoryApi(categoryId: number, payload: UpdateCategoryPayload): Promise<CatalogCategory> {
  const res = await authFetch(`${API_BASE}/api/v1/catalog/categories/${categoryId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await safeBody(res);
    throw new Error(parseApiError(body, mapCatalogError(res.status, "Errore aggiornamento categoria")));
  }
  return res.json();
}

export async function deleteCatalogCategoryApi(categoryId: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/api/v1/catalog/categories/${categoryId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const body = await safeBody(res);
    throw new Error(parseApiError(body, mapCatalogError(res.status, "Errore eliminazione categoria")));
  }
}

export async function listCatalogServicesApi(params: ListCatalogServicesParams): Promise<CatalogService[]> {
  const query = new URLSearchParams({ company_id: String(params.company_id) });
  if (params.category_id) query.set("category_id", String(params.category_id));
  if (params.parent_service_id) query.set("parent_service_id", String(params.parent_service_id));
  const res = await authFetch(`${API_BASE}/api/v1/catalog/services?${query.toString()}`);
  if (!res.ok) {
    const body = await safeBody(res);
    throw new Error(parseApiError(body, mapCatalogError(res.status, "Impossibile recuperare i servizi")));
  }
  return res.json();
}

export async function createCatalogServiceApi(payload: CreateServicePayload): Promise<CatalogService> {
  const res = await authFetch(`${API_BASE}/api/v1/catalog/services`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await safeBody(res);
    throw new Error(parseApiError(body, mapCatalogError(res.status, "Errore creazione servizio")));
  }
  return res.json();
}

export async function getCatalogServiceApi(serviceId: number): Promise<CatalogService> {
  const res = await authFetch(`${API_BASE}/api/v1/catalog/services/${serviceId}`);
  if (!res.ok) {
    const body = await safeBody(res);
    throw new Error(parseApiError(body, mapCatalogError(res.status, "Servizio non trovato")));
  }
  return res.json();
}

export async function getCatalogServiceDetailApi(serviceId: number): Promise<CatalogServiceDetail> {
  const res = await authFetch(`${API_BASE}/api/v1/catalog/services/${serviceId}`);
  if (!res.ok) {
    const body = await safeBody(res);
    throw new Error(parseApiError(body, mapCatalogError(res.status, "Dettaglio servizio non trovato")));
  }
  return res.json();
}

export async function updateCatalogServiceApi(serviceId: number, payload: UpdateServicePayload): Promise<CatalogService> {
  const res = await authFetch(`${API_BASE}/api/v1/catalog/services/${serviceId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await safeBody(res);
    throw new Error(parseApiError(body, mapCatalogError(res.status, "Errore aggiornamento servizio")));
  }
  return res.json();
}

export async function deleteCatalogServiceApi(serviceId: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/api/v1/catalog/services/${serviceId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const body = await safeBody(res);
    throw new Error(parseApiError(body, mapCatalogError(res.status, "Errore eliminazione servizio")));
  }
}

export async function replaceCatalogServicePricesApi(
  serviceId: number,
  payload: CatalogServicePrice[]
): Promise<CatalogServicePrice[]> {
  const res = await authFetch(`${API_BASE}/api/v1/catalog/services/${serviceId}/prices`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await safeBody(res);
    throw new Error(parseApiError(body, mapCatalogError(res.status, "Errore salvataggio prezzi")));
  }
  return res.json();
}

export async function replaceCatalogServiceDependenciesApi(
  serviceId: number,
  payload: CatalogServiceDependency[]
): Promise<CatalogServiceDependency[]> {
  const res = await authFetch(`${API_BASE}/api/v1/catalog/services/${serviceId}/dependencies`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await safeBody(res);
    throw new Error(parseApiError(body, mapCatalogError(res.status, "Errore salvataggio dipendenze")));
  }
  return res.json();
}

export async function replaceCatalogBundleItemsApi(
  serviceId: number,
  payload: CatalogBundleItem[]
): Promise<CatalogBundleItem[]> {
  const res = await authFetch(`${API_BASE}/api/v1/catalog/services/${serviceId}/bundle-items`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await safeBody(res);
    throw new Error(parseApiError(body, mapCatalogError(res.status, "Errore salvataggio bundle")));
  }
  return res.json();
}
