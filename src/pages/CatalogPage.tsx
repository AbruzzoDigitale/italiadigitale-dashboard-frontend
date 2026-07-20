import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import {
  type CatalogCategory,
  type CatalogCategoryTreeNode,
  type CatalogService,
  type CatalogServiceDependency,
  type CatalogServiceDetail,
  type CatalogServicePrice,
  type CatalogServiceTreeNode,
  createCatalogCategoryApi,
  createCatalogServiceApi,
  deleteCatalogCategoryApi,
  deleteCatalogServiceApi,
  getCatalogServiceDetailApi,
  getCatalogTreeApi,
  listCatalogCategoriesApi,
  listCatalogServicesApi,
  updateCatalogCategoryApi,
  updateCatalogServiceApi,
} from "../api/catalog";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { Spinner } from "../components/ui/Spinner";
import { Checkbox } from "../components/ui/Checkbox";
import { SearchableSelect } from "../components/ui/SearchableSelect";
import { Textarea } from "../components/ui/Textarea";
import { useToast } from "../context/ToastContext";
import { normalizeCompanyPayload } from "../utils/companyPayload";

interface CategoryForm {
  name: string;
  slug: string;
  description: string;
  parent_id: number | null;
}

interface ServiceForm {
  title: string;
  slug: string;
  description: string;
  product_type: "service" | "bundle" | "option";
  parent_service_id: number | null;
}

interface ServiceRuleState {
  can_select: boolean;
  dependency_violations: string[];
}

interface CategoryStepItem {
  id: number;
  name: string;
  level: number;
  totalServices: number;
}

const EMPTY_CATEGORY_FORM: CategoryForm = {
  name: "",
  slug: "",
  description: "",
  parent_id: null,
};

const EMPTY_SERVICE_FORM: ServiceForm = {
  title: "",
  slug: "",
  description: "",
  product_type: "service",
  parent_service_id: null,
};

const BILLING_PERIOD_LABELS: Record<string, string> = {
  oneoff: "una tantum",
  monthly: "mensile",
  yearly: "annuale",
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function normalizeViolation(v: unknown) {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") {
    const msg = (v as { message?: unknown }).message;
    const detail = (v as { detail?: unknown }).detail;
    const code = (v as { code?: unknown }).code;
    if (typeof msg === "string" && msg) return msg;
    if (typeof detail === "string" && detail) return detail;
    if (typeof code === "string" && code) return code;
  }
  return "Vincolo non soddisfatto";
}

function indexTreeServiceState(nodes: CatalogServiceTreeNode[], map: Map<number, ServiceRuleState>) {
  nodes.forEach((node) => {
    map.set(node.id, {
      can_select: !!node.can_select,
      dependency_violations: (node.dependency_violations ?? []).map(normalizeViolation),
    });
    if (node.option_services?.length) {
      indexTreeServiceState(node.option_services, map);
    }
  });
}

function formatCurrency(amount: number | null | undefined, currency = "EUR") {
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

function getDefaultPrice(prices: CatalogServicePrice[] | undefined) {
  if (!prices?.length) return null;
  return prices.find((price) => price.is_default) ?? prices[0];
}

function summarizeServicePrice(service: {
  base_amount?: number | null;
  base_billing_period?: string | null;
  currency?: string;
  prices?: CatalogServicePrice[];
}) {
  const defaultPrice = getDefaultPrice(service.prices);
  if (defaultPrice && defaultPrice.amount != null) {
    const period = BILLING_PERIOD_LABELS[defaultPrice.billing_period] ?? defaultPrice.billing_period;
    return `${formatCurrency(defaultPrice.amount, service.currency ?? "EUR")} · ${period}`;
  }
  if (service.base_amount != null) {
    const period = service.base_billing_period
      ? BILLING_PERIOD_LABELS[service.base_billing_period] ?? service.base_billing_period
      : null;
    return period
      ? `${formatCurrency(service.base_amount, service.currency ?? "EUR")} · ${period}`
      : formatCurrency(service.base_amount, service.currency ?? "EUR");
  }
  return "Prezzo non disponibile";
}

function countVisibleServices(node: CatalogCategoryTreeNode, showInactive: boolean): number {
  const own = node.services.filter((service) => showInactive || service.is_active).length;
  return own + node.children.reduce((sum, child) => sum + countVisibleServices(child, showInactive), 0);
}

function collectCategoryIds(node: CatalogCategoryTreeNode): number[] {
  return [node.id, ...node.children.flatMap(collectCategoryIds)];
}

function flattenCategorySteps(node: CatalogCategoryTreeNode, showInactive: boolean, level = 0): CategoryStepItem[] {
  const current: CategoryStepItem[] =
    showInactive || node.is_active
      ? [
          {
            id: node.id,
            name: node.name,
            level,
            totalServices: countVisibleServices(node, showInactive),
          },
        ]
      : [];
  node.children.forEach((child) => {
    current.push(...flattenCategorySteps(child, showInactive, level + 1));
  });
  return current;
}

function productTypeBadgeVariant(productType: CatalogService["product_type"]) {
  if (productType === "bundle") return "warning" as const;
  if (productType === "option") return "default" as const;
  return "info" as const;
}

function productTypeLabel(productType: CatalogService["product_type"]) {
  if (productType === "bundle") return "bundle";
  if (productType === "option") return "opzione";
  return "servizio";
}

export function CatalogPage() {
  const { user, myCompanies, activeCompanyId, permissions } = useAuth();
  const toast = useToast();
  const isAdmin = !!user?.is_admin;
  const canViewCatalogPrices = permissions?.can_view_catalog_prices ?? isAdmin;

  const activeCompanyName = useMemo(() => {
    if (activeCompanyId != null) {
      const company = myCompanies.find((item) => item.id === activeCompanyId);
      if (company) return company.name;
    }
    return user?.company?.name ?? (activeCompanyId != null ? `Company #${activeCompanyId}` : "Nessuna azienda attiva");
  }, [activeCompanyId, myCompanies, user?.company?.name]);

  const [companyId, setCompanyId] = useState<number | null>(user?.company_id ?? null);
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [services, setServices] = useState<CatalogService[]>([]);
  const [catalogTree, setCatalogTree] = useState<CatalogCategoryTreeNode[]>([]);
  const [selectedRootId, setSelectedRootId] = useState<number | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState<number | null>(null);
  const selectedRootIdRef = useRef<number | null>(selectedRootId);
  const selectedCategoryIdRef = useRef<number | null>(selectedCategoryId);
  const selectedServiceIdRef = useRef<number | null>(selectedServiceId);
  const [selectedServiceDetail, setSelectedServiceDetail] = useState<CatalogServiceDetail | null>(null);
  const [serviceRuleState, setServiceRuleState] = useState<Map<number, ServiceRuleState>>(new Map());
  const [loading, setLoading] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CatalogCategory | null>(null);
  const [editingService, setEditingService] = useState<CatalogService | null>(null);
  const [categoryForm, setCategoryForm] = useState<CategoryForm>(EMPTY_CATEGORY_FORM);
  const [serviceForm, setServiceForm] = useState<ServiceForm>(EMPTY_SERVICE_FORM);
  const [savingModal, setSavingModal] = useState(false);

  const categoryById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const serviceById = useMemo(() => new Map(services.map((service) => [service.id, service])), [services]);

  const treeLookup = useMemo(() => {
    const nodeById = new Map<number, CatalogCategoryTreeNode>();
    const rootById = new Map<number, CatalogCategoryTreeNode>();

    const walk = (node: CatalogCategoryTreeNode, root: CatalogCategoryTreeNode) => {
      nodeById.set(node.id, node);
      rootById.set(node.id, root);
      node.children.forEach((child) => walk(child, root));
    };

    catalogTree.forEach((root) => walk(root, root));
    return { nodeById, rootById };
  }, [catalogTree]);

  const selectedRootNode = useMemo(
    () => (selectedRootId ? catalogTree.find((root) => root.id === selectedRootId) ?? null : catalogTree[0] ?? null),
    [catalogTree, selectedRootId]
  );

  const selectedCategoryNode = useMemo(
    () => (selectedCategoryId ? treeLookup.nodeById.get(selectedCategoryId) ?? null : selectedRootNode),
    [selectedCategoryId, selectedRootNode, treeLookup]
  );

  const selectedCategory = useMemo(
    () => (selectedCategoryId ? categoryById.get(selectedCategoryId) ?? null : null),
    [categoryById, selectedCategoryId]
  );

  const selectedService = useMemo(
    () => services.find((service) => service.id === selectedServiceId) ?? null,
    [services, selectedServiceId]
  );

  const selectedCategoryIds = useMemo(() => {
    if (!selectedCategoryNode) return new Set<number>();
    return new Set(collectCategoryIds(selectedCategoryNode));
  }, [selectedCategoryNode]);

  const categoryStepItems = useMemo(() => {
    if (!selectedRootNode) return [];
    return flattenCategorySteps(selectedRootNode, showInactive);
  }, [selectedRootNode, showInactive]);

  const visibleServices = useMemo(() => {
    if (!selectedCategoryNode) return [];
    return services
      .filter((service) => selectedCategoryIds.has(service.category_id))
      .filter((service) => showInactive || service.is_active)
      .sort((a, b) => a.title.localeCompare(b.title, "it"));
  }, [selectedCategoryIds, selectedCategoryNode, services, showInactive]);

  const detailRuleState = selectedService ? serviceRuleState.get(selectedService.id) : null;
  const detailViolations = detailRuleState?.dependency_violations ?? [];
  const detailCategory = selectedService ? categoryById.get(selectedService.category_id) ?? null : null;
  const detailParentService =
    selectedService?.parent_service_id != null ? serviceById.get(selectedService.parent_service_id) ?? null : null;

  const loadTreeState = useCallback(
    async (targetCompanyId: number, currentSelectedServiceId: number | null) => {
      const tree = await getCatalogTreeApi({
        company_id: targetCompanyId,
        selected_service_ids: currentSelectedServiceId ? [currentSelectedServiceId] : [],
      });
      setCatalogTree(tree.roots);

      const stateMap = new Map<number, ServiceRuleState>();
      const walkCategories = (nodes: CatalogCategoryTreeNode[]) => {
        nodes.forEach((node) => {
          indexTreeServiceState(node.services ?? [], stateMap);
          if (node.children.length) walkCategories(node.children);
        });
      };
      walkCategories(tree.roots);
      setServiceRuleState(stateMap);

      return tree.roots;
    },
    []
  );

  const loadCatalog = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const currentSelectedRootId = selectedRootIdRef.current;
      const currentSelectedCategoryId = selectedCategoryIdRef.current;
      const currentSelectedServiceId = selectedServiceIdRef.current;

      const [categoriesData, servicesData] = await Promise.all([
        listCatalogCategoriesApi(companyId),
        listCatalogServicesApi({ company_id: companyId }),
      ]);

      setCategories(categoriesData);
      setServices(servicesData);

      const roots = await loadTreeState(companyId, currentSelectedServiceId);

      const nextRootId =
        currentSelectedRootId && roots.some((root) => root.id === currentSelectedRootId)
          ? currentSelectedRootId
          : roots[0]?.id ?? null;
      setSelectedRootId(nextRootId);

      const nextCategoryId =
        currentSelectedCategoryId && categoriesData.some((category) => category.id === currentSelectedCategoryId)
          ? currentSelectedCategoryId
          : nextRootId;
      setSelectedCategoryId(nextCategoryId);

      const nextServiceId =
        currentSelectedServiceId && servicesData.some((service) => service.id === currentSelectedServiceId)
          ? currentSelectedServiceId
          : servicesData[0]?.id ?? null;
      setSelectedServiceId(nextServiceId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore caricamento catalogo");
    } finally {
      setLoading(false);
    }
  }, [companyId, loadTreeState, toast]);

  useEffect(() => {
    if (user?.company_id == null) return;
    if (companyId !== user.company_id) {
      setCompanyId(user.company_id);
    }
  }, [companyId, user?.company_id]);

  useEffect(() => {
    selectedRootIdRef.current = selectedRootId;
  }, [selectedRootId]);

  useEffect(() => {
    selectedCategoryIdRef.current = selectedCategoryId;
  }, [selectedCategoryId]);

  useEffect(() => {
    selectedServiceIdRef.current = selectedServiceId;
  }, [selectedServiceId]);

  useEffect(() => {
    if (!companyId) return;
    loadCatalog();
  }, [companyId, loadCatalog]);

  useEffect(() => {
    if (!companyId) return;
    loadTreeState(companyId, selectedServiceId).catch(() => {
      // fallback silenzioso: il catalogo resta navigabile anche senza stato regole.
    });
  }, [companyId, loadTreeState, selectedServiceId]);

  useEffect(() => {
    if (selectedRootNode && selectedCategoryId == null) {
      setSelectedCategoryId(selectedRootNode.id);
      return;
    }

    if (selectedCategoryId && !categories.some((category) => category.id === selectedCategoryId)) {
      setSelectedCategoryId(selectedRootNode?.id ?? null);
    }

    if (selectedServiceId && !services.some((service) => service.id === selectedServiceId)) {
      setSelectedServiceId(services[0]?.id ?? null);
    }
  }, [categories, selectedCategoryId, selectedRootNode, selectedServiceId, services]);

  useEffect(() => {
    if (!selectedCategoryNode) return;
    if (selectedServiceId && visibleServices.some((service) => service.id === selectedServiceId)) return;
    setSelectedServiceId(visibleServices[0]?.id ?? null);
  }, [selectedCategoryNode, selectedServiceId, visibleServices]);

  useEffect(() => {
    if (!selectedServiceId) {
      setSelectedServiceDetail(null);
      return;
    }
    getCatalogServiceDetailApi(selectedServiceId)
      .then((detail) => {
        setSelectedServiceDetail(detail);
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Errore caricamento dettaglio servizio");
        setSelectedServiceDetail(null);
      });
  }, [selectedServiceId, toast]);

  const openNewCategory = (parentId: number | null = null) => {
    setEditingCategory(null);
    setCategoryForm({
      ...EMPTY_CATEGORY_FORM,
      parent_id: parentId,
    });
    setCategoryModalOpen(true);
  };

  const openEditCategory = (category: CatalogCategory) => {
    setEditingCategory(category);
    setCategoryForm({
      name: category.name,
      slug: category.slug,
      description: category.description ?? "",
      parent_id: category.parent_id,
    });
    setCategoryModalOpen(true);
  };

  const openNewService = () => {
    setEditingService(null);
    setServiceForm(EMPTY_SERVICE_FORM);
    setServiceModalOpen(true);
  };

  const openEditService = (service: CatalogService) => {
    setEditingService(service);
    setServiceForm({
      title: service.title,
      slug: service.slug,
      description: service.description ?? "",
      product_type: service.product_type,
      parent_service_id: service.parent_service_id,
    });
    setServiceModalOpen(true);
  };

  const openNewOptionService = () => {
    if (!selectedService) {
      toast.warning("Seleziona prima un servizio padre");
      return;
    }
    setEditingService(null);
    setServiceForm({
      title: "",
      slug: "",
      description: "",
      product_type: "option",
      parent_service_id: selectedService.id,
    });
    setServiceModalOpen(true);
  };

  const saveCategory = async () => {
    if (!companyId) return;
    if (!isAdmin) {
      toast.error("Non hai i permessi necessari.");
      return;
    }
    if (!categoryForm.name.trim()) {
      toast.warning("Inserisci il nome categoria");
      return;
    }

    setSavingModal(true);
    try {
      const companyPayload = normalizeCompanyPayload(
        companyId,
        editingCategory?.company_ids ?? (companyId != null ? [companyId] : [])
      );
      const payload = {
        ...companyPayload,
        parent_id: categoryForm.parent_id,
        name: categoryForm.name.trim(),
        slug: slugify(categoryForm.slug || categoryForm.name),
        description: categoryForm.description.trim() || null,
      };

      if (editingCategory) {
        await updateCatalogCategoryApi(editingCategory.id, payload);
        toast.success("Categoria aggiornata");
      } else {
        await createCatalogCategoryApi(payload);
        toast.success("Categoria creata");
      }

      setCategoryModalOpen(false);
      await loadCatalog();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore salvataggio categoria");
    } finally {
      setSavingModal(false);
    }
  };

  const saveService = async () => {
    if (!companyId) return;
    if (!isAdmin) {
      toast.error("Non hai i permessi necessari.");
      return;
    }
    if (!selectedCategoryId) {
      toast.warning("Seleziona prima una categoria");
      return;
    }
    if (!serviceForm.title.trim()) {
      toast.warning("Inserisci il titolo servizio");
      return;
    }

    setSavingModal(true);
    try {
      const companyPayload = normalizeCompanyPayload(
        companyId,
        editingService?.company_ids ?? (companyId != null ? [companyId] : [])
      );
      const payload = {
        ...companyPayload,
        category_id: selectedCategoryId,
        parent_service_id: serviceForm.parent_service_id,
        title: serviceForm.title.trim(),
        slug: slugify(serviceForm.slug || serviceForm.title),
        description: serviceForm.description.trim() || null,
        product_type: serviceForm.product_type,
      };

      if (editingService) {
        await updateCatalogServiceApi(editingService.id, payload);
        toast.success("Servizio aggiornato");
      } else {
        await createCatalogServiceApi(payload);
        toast.success("Servizio creato");
      }

      setServiceModalOpen(false);
      await loadCatalog();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore salvataggio servizio");
    } finally {
      setSavingModal(false);
    }
  };

  const removeCategory = async (category: CatalogCategory) => {
    if (!isAdmin) return;
    const ok = window.confirm(`Eliminare la categoria ${category.name}?`);
    if (!ok) return;
    try {
      await deleteCatalogCategoryApi(category.id);
      toast.success("Categoria eliminata");
      await loadCatalog();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore eliminazione categoria");
    }
  };

  const removeService = async (service: CatalogService) => {
    if (!isAdmin) return;
    const ok = window.confirm(`Eliminare il servizio ${service.title}?`);
    if (!ok) return;
    try {
      await deleteCatalogServiceApi(service.id);
      toast.success("Servizio eliminato");
      await loadCatalog();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore eliminazione servizio");
    }
  };

  const describeDependency = (dependency: CatalogServiceDependency) => {
    if (dependency.required_service_id) {
      const service = serviceById.get(dependency.required_service_id);
      return service ? `Richiede ${service.title}` : `Richiede servizio #${dependency.required_service_id}`;
    }
    if (dependency.required_category_id) {
      const category = categoryById.get(dependency.required_category_id);
      return category ? `Richiede categoria ${category.name}` : `Richiede categoria #${dependency.required_category_id}`;
    }
    return "Regola incompleta";
  };

  return (
    <div className="mx-auto w-full animate-fadeIn px-6 py-8 pb-20">
      <div className="section-eyebrow">Catalogo servizi</div>
      <h1 className="section-title">
        Catalogo Aziendale
      </h1>
      <p className="section-lead">
        Percorso guidato in 3 passaggi: scegli area, scegli categoria, scegli servizio. A destra trovi il dettaglio completo.
      </p>

      <div className="mt-6 rounded-lg border border-line bg-paper p-4 dark:border-[#2a2a2e] dark:bg-[#131316]">
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-pill border border-line px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted dark:border-[#2a2a2e] dark:text-[#9999a0]">
            Azienda attiva: {activeCompanyName}
          </div>

          <div className="rounded-pill border border-line px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted dark:border-[#2a2a2e] dark:text-[#9999a0]">
            {visibleServices.length} servizi visibili
          </div>

          {isAdmin && (
            <label className="ml-auto flex items-center gap-2 text-sm text-muted dark:text-[#9999a0]">
              <Checkbox
                checked={showInactive}
                onChange={(v) => setShowInactive(v)}
              />
              Mostra inattivi
            </label>
          )}

          <Button
            variant="secondary"
            size="sm"
            iconOnly
            onClick={loadCatalog}
            title="Aggiorna"
            aria-label="Aggiorna"
            leftIcon={<Icon name="refresh-cw" className="w-4 h-4" />}
          />
        </div>
      </div>

      {!isAdmin && (
        <div className="mt-4 rounded-md border border-info/20 bg-info/5 px-3 py-2 text-sm text-info">
          Modalita sola lettura: puoi consultare il catalogo della tua azienda ma non modificare.
        </div>
      )}

      {loading ? (
        <div className="mt-8 flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className="space-y-4">
            <div className="rounded-lg border border-line bg-paper p-4 dark:border-[#2a2a2e] dark:bg-[#131316]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">Passaggio 1</p>
                  <h2 className="font-display text-[20px] font-bold tracking-tight text-ink dark:text-[#f4f4f7]">Scegli area</h2>
                  <p className="text-[13px] text-muted dark:text-[#9999a0]">Ogni area contiene categorie e servizi correlati.</p>
                </div>
                {isAdmin && (
                  <Button size="sm" onClick={() => openNewCategory(null)} leftIcon={<Icon name="plus" />}>
                    Nuova area
                  </Button>
                )}
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {catalogTree
                  .filter((root) => showInactive || root.is_active)
                  .map((root) => {
                    const isSelected = selectedRootNode?.id === root.id;
                    return (
                      <button
                        key={root.id}
                        type="button"
                        onClick={() => {
                          setSelectedRootId(root.id);
                          setSelectedCategoryId(root.id);
                        }}
                        className={`rounded-lg border p-4 text-left transition-colors ${
                          isSelected
                            ? "border-ink bg-cream dark:border-[#f4f4f7] dark:bg-[#1c1c20]"
                            : "border-line bg-paper hover:bg-cream dark:border-[#2a2a2e] dark:bg-[#131316] dark:hover:bg-[#1c1c20]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="font-display text-[17px] font-bold tracking-tight text-ink dark:text-[#f4f4f7]">{root.name}</h3>
                          <Badge variant="info">{countVisibleServices(root, showInactive)}</Badge>
                        </div>
                        <p className="mt-1 text-[12px] text-muted dark:text-[#9999a0]">{root.description || root.slug}</p>
                      </button>
                    );
                  })}
              </div>
            </div>

            <div className="rounded-lg border border-line bg-paper p-4 dark:border-[#2a2a2e] dark:bg-[#131316]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">Passaggio 2</p>
                  <h2 className="font-display text-[20px] font-bold tracking-tight text-ink dark:text-[#f4f4f7]">Scegli categoria</h2>
                  <p className="text-[13px] text-muted dark:text-[#9999a0]">Usa i livelli per arrivare velocemente al gruppo di servizi giusto.</p>
                </div>
                {isAdmin && selectedCategory && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="secondary" onClick={() => openNewCategory(selectedCategory.id)}>
                      Nuova sottocategoria
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openEditCategory(selectedCategory)}>
                      Modifica
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => removeCategory(selectedCategory)}>
                      Elimina
                    </Button>
                  </div>
                )}
              </div>

              <div className="mt-4 flex flex-col gap-2">
                {categoryStepItems.map((item) => {
                  const isSelected = selectedCategoryId === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedCategoryId(item.id)}
                      className={`flex items-center justify-between rounded-md px-3 py-2 text-left transition-colors ${
                        isSelected
                          ? "bg-ink text-paper dark:bg-[#f4f4f7] dark:text-[#0a0a0a]"
                          : "bg-cream dark:bg-[#1c1c20]"
                      }`}
                    >
                      <span style={{ paddingLeft: `${item.level * 14}px` }}>{item.name}</span>
                      <span className="text-[11px] opacity-75">{item.totalServices}</span>
                    </button>
                  );
                })}

                {categoryStepItems.length === 0 && (
                  <div className="rounded-md border border-line bg-cream px-3 py-4 text-sm text-muted dark:border-[#2a2a2e] dark:bg-[#1c1c20] dark:text-[#9999a0]">
                    Nessuna categoria disponibile in questa area.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-line bg-paper p-4 dark:border-[#2a2a2e] dark:bg-[#131316]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">Passaggio 3</p>
                  <h2 className="font-display text-[20px] font-bold tracking-tight text-ink dark:text-[#f4f4f7]">Scegli servizio</h2>
                  <p className="text-[13px] text-muted dark:text-[#9999a0]">Clicca un servizio per vedere subito il dettaglio nel pannello a destra.</p>
                </div>
                {isAdmin && (
                  <Button size="sm" onClick={openNewService} leftIcon={<Icon name="plus" />}>
                    Nuovo servizio
                  </Button>
                )}
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {visibleServices.map((service) => {
                  const isSelected = selectedServiceId === service.id;
                  const ruleState = serviceRuleState.get(service.id);
                  const isBlocked = ruleState?.can_select === false;

                  return (
                    <button
                      key={service.id}
                      type="button"
                      onClick={() => setSelectedServiceId(service.id)}
                      className={`rounded-lg border p-4 text-left transition-colors ${
                        isSelected
                          ? "border-ink bg-cream dark:border-[#f4f4f7] dark:bg-[#1c1c20]"
                          : "border-line bg-paper hover:bg-cream dark:border-[#2a2a2e] dark:bg-[#131316] dark:hover:bg-[#1c1c20]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-display text-[17px] font-bold tracking-tight text-ink dark:text-[#f4f4f7]">{service.title}</h3>
                            <Badge variant={productTypeBadgeVariant(service.product_type)}>
                              {productTypeLabel(service.product_type)}
                            </Badge>
                            {isBlocked && <Badge variant="danger">bloccato</Badge>}
                            {!service.is_active && <Badge variant="default">off</Badge>}
                          </div>
                          <p className="mt-1 text-[12px] text-muted dark:text-[#9999a0]">{service.description || service.slug}</p>
                        </div>
                        {canViewCatalogPrices && (
                          <span className="rounded-pill border border-line px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted dark:border-[#2a2a2e] dark:text-[#9999a0]">
                            {summarizeServicePrice(service)}
                          </span>
                        )}
                      </div>

                      {isAdmin && (
                        <div className="mt-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider">
                          <span
                            className="text-info"
                            onClick={(event) => {
                              event.stopPropagation();
                              openEditService(service);
                            }}
                          >
                            Modifica
                          </span>
                          <span
                            className="text-danger"
                            onClick={(event) => {
                              event.stopPropagation();
                              removeService(service);
                            }}
                          >
                            Elimina
                          </span>
                        </div>
                      )}
                    </button>
                  );
                })}

                {visibleServices.length === 0 && (
                  <div className="rounded-lg border border-line bg-cream p-4 text-sm text-muted dark:border-[#2a2a2e] dark:bg-[#1c1c20] dark:text-[#9999a0]">
                    Nessun servizio nella categoria selezionata.
                  </div>
                )}
              </div>
            </div>
          </section>

          <aside className="rounded-lg border border-line bg-paper p-4 dark:border-[#2a2a2e] dark:bg-[#131316] xl:sticky xl:top-6">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="font-display text-[20px] font-bold tracking-tight text-ink dark:text-[#f4f4f7]">Dettaglio servizio</h2>
                <p className="text-[12px] text-muted dark:text-[#9999a0]">
                  {selectedService ? "Vista completa del servizio selezionato" : "Seleziona un servizio"}
                </p>
              </div>
              {selectedService && (
                <Badge variant={productTypeBadgeVariant(selectedService.product_type)}>
                  {productTypeLabel(selectedService.product_type)}
                </Badge>
              )}
            </div>

            {!selectedService || !selectedServiceDetail ? (
              <div className="mt-4 rounded-md border border-line bg-cream px-3 py-6 text-sm text-muted dark:border-[#2a2a2e] dark:bg-[#1c1c20] dark:text-[#9999a0]">
                Seleziona un servizio dalla lista per vedere informazioni, prezzi, dipendenze e opzioni.
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="rounded-lg border border-line p-4 dark:border-[#2a2a2e]">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-[18px] font-bold tracking-tight text-ink dark:text-[#f4f4f7]">{selectedServiceDetail.title}</h3>
                    {!selectedServiceDetail.is_active && <Badge variant="default">off</Badge>}
                    {detailRuleState?.can_select === false && <Badge variant="danger">bloccato</Badge>}
                  </div>
                  <p className="mt-2 text-sm text-muted dark:text-[#9999a0]">
                    {selectedServiceDetail.description || "Nessuna descrizione disponibile."}
                  </p>

                  <div className="mt-3 grid gap-2 text-[12px] md:grid-cols-2">
                    <div className="rounded-md bg-cream px-3 py-2 dark:bg-[#1c1c20]">
                      <span className="font-semibold">Categoria:</span> {detailCategory?.name ?? "-"}
                    </div>
                    {canViewCatalogPrices && (
                      <div className="rounded-md bg-cream px-3 py-2 dark:bg-[#1c1c20]">
                        <span className="font-semibold">Prezzo:</span> {summarizeServicePrice(selectedServiceDetail)}
                      </div>
                    )}
                    <div className="rounded-md bg-cream px-3 py-2 dark:bg-[#1c1c20]">
                      <span className="font-semibold">Servizio padre:</span> {detailParentService?.title ?? "Nessuno"}
                    </div>
                    <div className="rounded-md bg-cream px-3 py-2 dark:bg-[#1c1c20]">
                      <span className="font-semibold">Selezionabile:</span> {detailRuleState?.can_select === false ? "No" : "Si"}
                    </div>
                  </div>

                  {isAdmin && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button size="sm" variant="secondary" onClick={() => openEditService(selectedServiceDetail)}>
                        Modifica servizio
                      </Button>
                      <Button size="sm" variant="ghost" onClick={openNewOptionService}>
                        Nuova opzione
                      </Button>
                    </div>
                  )}
                </div>

                {detailViolations.length > 0 && (
                  <div className="rounded-lg border border-warning/25 bg-warning/10 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-warning">Vincoli non soddisfatti</p>
                    <div className="mt-2 flex flex-col gap-2 text-sm text-warning">
                      {detailViolations.map((violation, index) => (
                        <div key={`${violation}-${index}`} className="rounded-md border border-warning/20 bg-paper/60 px-3 py-2 dark:bg-[#1c1c20]">
                          {violation}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {canViewCatalogPrices && (
                  <div className="rounded-lg border border-line p-4 dark:border-[#2a2a2e]">
                    <h4 className="font-display text-[16px] font-bold tracking-tight text-ink dark:text-[#f4f4f7]">Prezzi</h4>
                    <div className="mt-2 space-y-2 text-sm">
                      {selectedServiceDetail.prices.map((price, index) => (
                        <div
                          key={`${price.billing_period}-${price.sort_order}-${index}`}
                          className="rounded-md border border-line px-3 py-2 dark:border-[#2a2a2e]"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span>{BILLING_PERIOD_LABELS[price.billing_period] ?? price.billing_period}</span>
                            <span className="font-semibold">{formatCurrency(price.amount, selectedServiceDetail.currency)}</span>
                          </div>
                        </div>
                      ))}
                      {selectedServiceDetail.prices.length === 0 && (
                        <p className="text-muted dark:text-[#9999a0]">Nessun prezzo configurato.</p>
                      )}
                    </div>
                  </div>
                )}

                <div className="rounded-lg border border-line p-4 dark:border-[#2a2a2e]">
                  <h4 className="font-display text-[16px] font-bold tracking-tight text-ink dark:text-[#f4f4f7]">Dipendenze</h4>
                  <div className="mt-2 space-y-2 text-sm">
                    {selectedServiceDetail.dependencies.map((dependency, index) => (
                      <div
                        key={`${dependency.required_service_id ?? "cat"}-${dependency.required_category_id ?? "svc"}-${index}`}
                        className="rounded-md border border-line px-3 py-2 dark:border-[#2a2a2e]"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="warning">{dependency.match_type}</Badge>
                          <Badge variant="info">min {dependency.min_selected}</Badge>
                          {!dependency.is_active && <Badge variant="default">off</Badge>}
                        </div>
                        <p className="mt-2">{describeDependency(dependency)}</p>
                      </div>
                    ))}
                    {selectedServiceDetail.dependencies.length === 0 && (
                      <p className="text-muted dark:text-[#9999a0]">Nessuna dipendenza configurata.</p>
                    )}
                  </div>
                </div>

                {selectedServiceDetail.product_type === "bundle" && (
                  <div className="rounded-lg border border-line p-4 dark:border-[#2a2a2e]">
                    <h4 className="font-display text-[16px] font-bold tracking-tight text-ink dark:text-[#f4f4f7]">Bundle</h4>
                    <div className="mt-2 space-y-2 text-sm">
                      {selectedServiceDetail.bundle_items.map((item, index) => {
                        const itemService = serviceById.get(item.item_service_id);
                        return (
                          <div
                            key={`${item.item_service_id}-${item.group_key ?? "none"}-${index}`}
                            className="rounded-md border border-line px-3 py-2 dark:border-[#2a2a2e]"
                          >
                            <p className="font-semibold">{itemService?.title ?? `Servizio #${item.item_service_id}`}</p>
                            <p className="text-muted dark:text-[#9999a0]">
                              {item.is_required ? "Obbligatorio" : "Opzionale"} · min {item.min_select} · max {item.max_select ?? "-"}
                            </p>
                          </div>
                        );
                      })}
                      {selectedServiceDetail.bundle_items.length === 0 && (
                        <p className="text-muted dark:text-[#9999a0]">Nessun elemento bundle.</p>
                      )}
                    </div>
                  </div>
                )}

                <div className="rounded-lg border border-line p-4 dark:border-[#2a2a2e]">
                  <h4 className="font-display text-[16px] font-bold tracking-tight text-ink dark:text-[#f4f4f7]">Opzioni</h4>
                  <div className="mt-2 space-y-2 text-sm">
                    {selectedServiceDetail.option_services.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => {
                          setSelectedCategoryId(option.category_id);
                          setSelectedServiceId(option.id);
                        }}
                        className="w-full rounded-md border border-line px-3 py-2 text-left hover:bg-cream dark:border-[#2a2a2e] dark:hover:bg-[#1c1c20]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span>{option.title}</span>
                          {canViewCatalogPrices && (
                            <span className="text-[11px] text-muted dark:text-[#9999a0]">
                              {option.base_amount != null
                                ? formatCurrency(option.base_amount, option.currency)
                                : "Prezzo non disponibile"}
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                    {selectedServiceDetail.option_services.length === 0 && (
                      <p className="text-muted dark:text-[#9999a0]">Nessuna opzione figlia.</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </aside>
        </div>
      )}

      <Modal
        open={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
        title={editingCategory ? "Modifica categoria" : "Nuova categoria"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCategoryModalOpen(false)} disabled={savingModal}>
              Annulla
            </Button>
            <Button onClick={saveCategory} loading={savingModal}>
              Salva
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Nome"
            value={categoryForm.name}
            onChange={(event) =>
              setCategoryForm((form) => ({
                ...form,
                name: event.target.value,
                slug: form.slug || slugify(event.target.value),
              }))
            }
          />
          <Input
            label="Slug"
            value={categoryForm.slug}
            onChange={(event) => setCategoryForm((form) => ({ ...form, slug: slugify(event.target.value) }))}
          />
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
              Categoria padre (opzionale)
            </label>
            <SearchableSelect
              value={categoryForm.parent_id != null ? String(categoryForm.parent_id) : ""}
              onChange={(value) =>
                setCategoryForm((form) => ({
                  ...form,
                  parent_id: value ? Number(value) : null,
                }))
              }
              options={[
                { value: "", label: "Nessuna (categoria radice)" },
                ...categories
                  .filter((category) => !editingCategory || category.id !== editingCategory.id)
                  .map((category) => ({ value: String(category.id), label: category.name })),
              ]}
              placeholder="Nessuna (categoria radice)"
              searchPlaceholder="Cerca categoria…"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">Descrizione</label>
            <Textarea
              className="min-h-[90px] w-full rounded-md border border-line bg-paper px-3 py-2.5 text-sm dark:border-[#2a2a2e] dark:bg-[#1c1c20]"
              value={categoryForm.description}
              onChange={(event) => setCategoryForm((form) => ({ ...form, description: event.target.value }))}
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={serviceModalOpen}
        onClose={() => setServiceModalOpen(false)}
        title={editingService ? "Modifica servizio" : "Nuovo servizio"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setServiceModalOpen(false)} disabled={savingModal}>
              Annulla
            </Button>
            <Button onClick={saveService} loading={savingModal}>
              Salva
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Titolo"
            value={serviceForm.title}
            onChange={(event) =>
              setServiceForm((form) => ({
                ...form,
                title: event.target.value,
                slug: form.slug || slugify(event.target.value),
              }))
            }
          />
          <Input
            label="Slug"
            value={serviceForm.slug}
            onChange={(event) => setServiceForm((form) => ({ ...form, slug: slugify(event.target.value) }))}
          />
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">Tipo prodotto</label>
            <SearchableSelect
              value={serviceForm.product_type}
              onChange={(value) =>
                setServiceForm((form) => ({
                  ...form,
                  product_type: value as ServiceForm["product_type"],
                }))
              }
              options={[
                { value: "service", label: "service" },
                { value: "bundle", label: "bundle" },
                { value: "option", label: "option" },
              ]}
              placeholder="service"
              searchPlaceholder="Cerca tipo…"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
              Parent service (opzionale)
            </label>
            <SearchableSelect
              value={serviceForm.parent_service_id != null ? String(serviceForm.parent_service_id) : ""}
              onChange={(value) =>
                setServiceForm((form) => ({
                  ...form,
                  parent_service_id: value ? Number(value) : null,
                }))
              }
              options={[
                { value: "", label: "Nessuno (servizio padre)" },
                ...services
                  .filter((service) => !editingService || service.id !== editingService.id)
                  .map((service) => ({ value: String(service.id), label: service.title })),
              ]}
              placeholder="Nessuno (servizio padre)"
              searchPlaceholder="Cerca servizio…"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">Descrizione</label>
            <Textarea
              className="min-h-[90px] w-full rounded-md border border-line bg-paper px-3 py-2.5 text-sm dark:border-[#2a2a2e] dark:bg-[#1c1c20]"
              value={serviceForm.description}
              onChange={(event) => setServiceForm((form) => ({ ...form, description: event.target.value }))}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
