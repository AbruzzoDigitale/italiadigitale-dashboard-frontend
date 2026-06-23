import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useCompanies } from "../hooks/useCompanies";
import { useClients } from "../hooks/useClients";
import { useToast } from "../context/ToastContext";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { Input } from "../components/ui/Input";
import { Checkbox } from "../components/ui/Checkbox";
import { Modal } from "../components/ui/Modal";
import { Spinner } from "../components/ui/Spinner";
import { SearchableSelect } from "../components/ui/SearchableSelect";
import { Textarea } from "../components/ui/Textarea";
import { SocialPackageForm } from "../components/social-packages/SocialPackageForm";
import { SocialPackageStructureEditor } from "../components/social-packages/SocialPackageStructureEditor";
import { SocialPackageCatalogItemsEditor, type SocialPackageCatalogOption } from "../components/social-packages/SocialPackageCatalogItemsEditor";
import { SocialPackagePreviewModal } from "../components/social-packages/SocialPackagePreviewModal";
import { listCatalogServicesApi, type CatalogService } from "../api/catalog";
import {
  bulkDeleteSocialPackagesApi,
  createSocialPackageApi,
  createSocialPackageBadgeApi,
  createSocialPackageBadgeItemApi,
  createSocialPackageCatalogItemApi,
  createSocialPackageSectionApi,
  deleteSocialPackageApi,
  deleteSocialPackageBadgeApi,
  deleteSocialPackageBadgeItemApi,
  deleteSocialPackageCatalogItemApi,
  deleteSocialPackageSectionApi,
  getSocialPackageApi,
  listSocialPackagesApi,
  previewSocialPackageQuoteApi,
  updateSocialPackageApi,
  updateSocialPackageBadgeApi,
  updateSocialPackageBadgeItemApi,
  updateSocialPackageCatalogItemApi,
  updateSocialPackageSectionApi,
  type SocialPackageBadge,
  type SocialPackageBadgeItem,
  type SocialPackageBase,
  type SocialPackageCatalogItem,
  type SocialPackageDetail,
  type SocialPackageQuotePreviewResponse,
  type SocialPackageSection,
} from "../api/socialPackages";
import type { BulkDeleteResponse } from "../api/bulk";
import {
  buildBadgeItemPayload,
  buildBadgePayload,
  buildCatalogItemPayload,
  buildSectionPayload,
  buildSocialPackagePayload,
  EMPTY_SOCIAL_PACKAGE_BADGE_DRAFT,
  EMPTY_SOCIAL_PACKAGE_BADGE_ITEM_DRAFT,
  EMPTY_SOCIAL_PACKAGE_CATALOG_ITEM_DRAFT,
  EMPTY_SOCIAL_PACKAGE_DRAFT,
  EMPTY_SOCIAL_PACKAGE_SECTION_DRAFT,
  formatCurrency,
  normalizeBadgeDraft,
  normalizeBadgeItemDraft,
  normalizeCatalogItemDraft,
  normalizeDraft,
  normalizeSectionDraft,
  slugify,
  type SocialPackageBadgeDraft,
  type SocialPackageBadgeItemDraft,
  type SocialPackageCatalogItemDraft,
  type SocialPackageDraft,
  type SocialPackageSectionDraft,
  toNumber,
} from "../features/social-packages/draft";
import { normalizeCompanyPayload } from "../utils/companyPayload";

interface CompanyOption {
  id: number;
  name: string;
}

interface DeleteTarget {
  kind: "package" | "section" | "badge" | "item" | "catalog";
  label: string;
  run: () => Promise<void>;
}

type PackageSummarySource = SocialPackageBase & {
  sections?: Array<
    SocialPackageSection & {
      badges?: Array<
        SocialPackageBadge & {
          items?: SocialPackageBadgeItem[];
        }
      >;
    }
  >;
  catalog_items?: SocialPackageCatalogItem[];
};

interface PreviewRequestDraft {
  client_id: number | null;
  date: string;
  tag: string;
  notes: string;
  discount_pct: string;
  discount_eur: string;
  duration_months: string;
}

const today = new Date().toISOString().slice(0, 10);

function flattenCompanies(list: CompanyOption[] | import("../api/companies").Company[]) {
  const out: CompanyOption[] = [];
  const walk = (items: import("../api/companies").Company[]) => {
    items.forEach((item) => {
      out.push({ id: item.id, name: item.name });
      if (item.children?.length) walk(item.children);
    });
  };
  walk(list as import("../api/companies").Company[]);
  return out;
}

function uniqueSorted(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => !!value && value.trim().length > 0))).sort((a, b) =>
    a.localeCompare(b, "it")
  );
}

function summarizePackage(item: PackageSummarySource) {
  const sections = item.sections_count ?? item.sections?.length ?? 0;
  const badges =
    item.badges_count ??
    item.sections?.reduce((sum: number, section) => sum + (section.badges?.length ?? 0), 0) ??
    0;
  const bullets =
    item.badge_items_count ??
    item.sections?.reduce(
      (sum: number, section) =>
        sum +
        (section.badges?.reduce((nested: number, badge) => nested + (badge.items?.length ?? 0), 0) ?? 0),
      0
    ) ?? 0;
  const catalog = item.catalog_items_count ?? item.catalog_items?.length ?? 0;
  return { sections, badges, bullets, catalog };
}

function emptyPreviewRequest(detail: SocialPackageDetail | null, clients: import("../api/clients").Client[]): PreviewRequestDraft {
  return {
    client_id: clients[0]?.id ?? null,
    date: today,
    tag: detail?.title ?? "",
    notes: detail?.description ?? "",
    discount_pct: String(detail?.discount_pct ?? 0),
    discount_eur: "0",
    duration_months: String(detail?.default_duration_months ?? 12),
  };
}

function packageToCatalogOption(service: CatalogService): SocialPackageCatalogOption {
  return {
    id: service.id,
    label: service.title,
    category: String(service.category_id),
    area: service.parent_service_id != null ? `parent:${service.parent_service_id}` : null,
  };
}

function PackageEditorPanel(props: {
  mode: "create" | "edit";
  selectedPackage: SocialPackageDetail | null;
  packageId: number | null;
  form: SocialPackageDraft;
  setForm: (patch: Partial<SocialPackageDraft>) => void;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onPreview: () => void;
  onCreateSection: () => void;
  onEditSection: (section: SocialPackageSection) => void;
  onDeleteSection: (section: SocialPackageSection) => void;
  onCreateBadge: (section: SocialPackageSection) => void;
  onEditBadge: (section: SocialPackageSection, badge: SocialPackageBadge) => void;
  onDeleteBadge: (section: SocialPackageSection, badge: SocialPackageBadge) => void;
  onCreateItem: (section: SocialPackageSection, badge: SocialPackageBadge) => void;
  onEditItem: (section: SocialPackageSection, badge: SocialPackageBadge, item: SocialPackageBadgeItem) => void;
  onDeleteItem: (section: SocialPackageSection, badge: SocialPackageBadge, item: SocialPackageBadgeItem) => void;
  onCreateCatalogItem: () => void;
  onEditCatalogItem: (item: SocialPackageCatalogItem) => void;
  onDeleteCatalogItem: (item: SocialPackageCatalogItem) => void;
  sectionsSavingHint: string | null;
  catalogSavingHint: string | null;
  companyOptions: import("../api/companies").Company[];
  serviceOptions: SocialPackageCatalogOption[];
}) {
  const {
    mode,
    selectedPackage,
    packageId,
    form,
    setForm,
    dirty,
    saving,
    onSave,
    onPreview,
    onCreateSection,
    onEditSection,
    onDeleteSection,
    onCreateBadge,
    onEditBadge,
    onDeleteBadge,
    onCreateItem,
    onEditItem,
    onDeleteItem,
    onCreateCatalogItem,
    onEditCatalogItem,
    onDeleteCatalogItem,
    sectionsSavingHint,
    catalogSavingHint,
    companyOptions,
    serviceOptions,
  } = props;

  return (
    <div className="rounded-2xl border border-line dark:border-[#2a2a2e] bg-paper dark:bg-[#131316] shadow-sm sticky top-6">
      <div className="flex items-center justify-between gap-3 border-b border-line dark:border-[#2a2a2e] px-5 py-4">
        <div>
          <div className="section-eyebrow mb-2">
            <Icon name="target" className="w-3.5 h-3.5" />
            Editor
          </div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-ink dark:text-paper">
            {mode === "create" ? "Nuovo pacchetto social" : selectedPackage?.title ?? "Pacchetto social"}
          </h2>
          <p className="text-sm text-muted dark:text-[#9999a0]">
            {mode === "create" ? "Crea e pubblica un nuovo pacchetto." : "Modifica struttura, righe collegate e anteprima preventivo."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={form.is_active ? "success" : "default"}>{form.is_active ? "Attivo" : "Disattivo"}</Badge>
          {selectedPackage?.area && <Badge variant="info">{selectedPackage.area}</Badge>}
        </div>
      </div>

      <div className="grid gap-6 px-5 py-5">
        <SocialPackageForm form={form} companyOptions={companyOptions} onChange={setForm} />

        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line dark:border-[#2a2a2e] bg-cream/30 dark:bg-[#1c1c20] px-4 py-3">
          <Button variant="primary" onClick={onSave} loading={saving} leftIcon={<Icon name="check" className="w-4 h-4" />}>
            {mode === "create" ? "Crea pacchetto" : "Salva pacchetto"}
          </Button>
          <Button variant="secondary" onClick={onPreview} disabled={!packageId} leftIcon={<Icon name="eye" className="w-4 h-4" />}>
            Converti in preventivo
          </Button>
          <div className="text-xs text-muted dark:text-[#9999a0]">
            {dirty ? "Modifiche non salvate" : selectedPackage ? `Aggiornato ${selectedPackage.updated_at}` : "Nessun pacchetto selezionato"}
          </div>
        </div>

        <section className="grid gap-4">
          <SocialPackageStructureEditor
            packageId={packageId}
            sections={selectedPackage?.sections ?? []}
            onCreateSection={onCreateSection}
            onEditSection={onEditSection}
            onDeleteSection={onDeleteSection}
            onCreateBadge={onCreateBadge}
            onEditBadge={onEditBadge}
            onDeleteBadge={onDeleteBadge}
            onCreateItem={onCreateItem}
            onEditItem={onEditItem}
            onDeleteItem={onDeleteItem}
          />
          {sectionsSavingHint && <p className="text-xs text-muted dark:text-[#9999a0]">{sectionsSavingHint}</p>}
        </section>

        <section className="grid gap-4">
          <SocialPackageCatalogItemsEditor
            packageId={packageId}
            items={selectedPackage?.catalog_items ?? []}
            serviceOptions={serviceOptions}
            onCreateItem={onCreateCatalogItem}
            onEditItem={onEditCatalogItem}
            onDeleteItem={onDeleteCatalogItem}
          />
          {catalogSavingHint && <p className="text-xs text-muted dark:text-[#9999a0]">{catalogSavingHint}</p>}
        </section>
      </div>
    </div>
  );
}

function PackageRow({
  item,
  active,
  selected,
  onToggleSelected,
  onSelect,
  onDelete,
}: {
  item: SocialPackageBase;
  active: boolean;
  selected: boolean;
  onToggleSelected: (checked: boolean) => void;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const summary = summarizePackage(item);
  return (
    <div
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={`w-full rounded-2xl border px-4 py-4 text-left transition-all duration-200 ${
        active
          ? "border-ink dark:border-[#f4f4f7] bg-ink text-paper dark:bg-[#23232a] dark:text-[#f4f4f7] shadow-md"
          : "border-line dark:border-[#2a2a2e] bg-paper dark:bg-[#141419] text-ink dark:text-paper hover:-translate-y-0.5 hover:shadow-sm"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="mt-0.5" onClick={(event) => event.stopPropagation()}>
          <Checkbox checked={selected} onChange={onToggleSelected} />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-display text-base font-bold tracking-tight">{item.title}</h3>
            <Badge variant={item.is_active ? "success" : "default"}>{item.is_active ? "Attivo" : "Disattivo"}</Badge>
            {item.price_badge && <Badge variant="warning">{item.price_badge}</Badge>}
          </div>
          <p className={`mt-1 line-clamp-2 text-sm ${active ? "text-paper/75" : "text-muted dark:text-[#9999a0]"}`}>
            {item.description || item.slug}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          leftIcon={<Icon name="trash" className="w-4 h-4" />}
        >
          Elimina
        </Button>
      </div>

      <div className={`mt-4 flex flex-wrap gap-2 text-[11px] ${active ? "text-paper/80" : "text-muted dark:text-[#9999a0]"}`}>
        <span className="rounded-full border border-current/20 px-2 py-1">{item.area || "area n/d"}</span>
        <span className="rounded-full border border-current/20 px-2 py-1">{summary.sections} sezioni</span>
        <span className="rounded-full border border-current/20 px-2 py-1">{summary.badges} badge</span>
        <span className="rounded-full border border-current/20 px-2 py-1">{summary.catalog} righe</span>
        <span className="rounded-full border border-current/20 px-2 py-1">{formatCurrency(item.base_price, item.currency)}</span>
      </div>
    </div>
  );
}

export function SocialPackagesPage() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { companies, isLoading: companiesLoading } = useCompanies();
  const { clients, refetch: refetchClients } = useClients();

  const [companyId, setCompanyId] = useState<number | null>(user?.company_id ?? null);
  const [packages, setPackages] = useState<SocialPackageBase[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState<number | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<SocialPackageDetail | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [listOpen, setListOpen] = useState(true);
  const [editorMode, setEditorMode] = useState<"edit" | "create">("edit");
  const [form, setForm] = useState<SocialPackageDraft>({ ...EMPTY_SOCIAL_PACKAGE_DRAFT });
  const [dirty, setDirty] = useState(false);
  const [packageError, setPackageError] = useState<string | null>(null);
  const sectionsSavingHint = null;
  const catalogSavingHint = null;
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [selectedPackageIds, setSelectedPackageIds] = useState<number[]>([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkDeleteResponse | null>(null);
  const [previewRequestOpen, setPreviewRequestOpen] = useState(false);
  const [previewRequest, setPreviewRequest] = useState<PreviewRequestDraft>(emptyPreviewRequest(null, clients));
  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<SocialPackageQuotePreviewResponse | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sectionModalOpen, setSectionModalOpen] = useState(false);
  const [sectionEditing, setSectionEditing] = useState<SocialPackageSection | null>(null);
  const [sectionDraft, setSectionDraft] = useState<SocialPackageSectionDraft>({ ...EMPTY_SOCIAL_PACKAGE_SECTION_DRAFT });
  const [badgeModalOpen, setBadgeModalOpen] = useState(false);
  const [badgeEditing, setBadgeEditing] = useState<{ section: SocialPackageSection; badge: SocialPackageBadge | null } | null>(null);
  const [badgeDraft, setBadgeDraft] = useState<SocialPackageBadgeDraft>({ ...EMPTY_SOCIAL_PACKAGE_BADGE_DRAFT });
  const [badgeItemModalOpen, setBadgeItemModalOpen] = useState(false);
  const [badgeItemEditing, setBadgeItemEditing] = useState<{
    section: SocialPackageSection;
    badge: SocialPackageBadge;
    item: SocialPackageBadgeItem | null;
  } | null>(null);
  const [badgeItemDraft, setBadgeItemDraft] = useState<SocialPackageBadgeItemDraft>({ ...EMPTY_SOCIAL_PACKAGE_BADGE_ITEM_DRAFT });
  const [catalogModalOpen, setCatalogModalOpen] = useState(false);
  const [catalogEditing, setCatalogEditing] = useState<SocialPackageCatalogItem | null>(null);
  const [catalogDraft, setCatalogDraft] = useState<SocialPackageCatalogItemDraft>({ ...EMPTY_SOCIAL_PACKAGE_CATALOG_ITEM_DRAFT });
  const [serviceOptions, setServiceOptions] = useState<SocialPackageCatalogOption[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);

  const packagesListRef = useRef<SocialPackageBase[]>(packages);
  useEffect(() => {
    packagesListRef.current = packages;
  }, [packages]);

  const companyOptions = useMemo(() => flattenCompanies(companies), [companies]);
  const areaOptions = useMemo(() => uniqueSorted(packages.map((item) => item.area)), [packages]);
  const selectedCompany = useMemo(
    () => companyOptions.find((option) => option.id === companyId) ?? null,
    [companyOptions, companyId]
  );

  useEffect(() => {
    if (!companyId && companyOptions.length > 0) {
      setCompanyId(companyOptions[0].id);
    }
  }, [companyId, companyOptions]);

  useEffect(() => {
    if (user?.company_id == null) return;
    if (companyId !== user.company_id) {
      setCompanyId(user.company_id);
    }
  }, [companyId, user?.company_id]);

  useEffect(() => {
    if (companyId == null) return;
    setServicesLoading(true);
    listCatalogServicesApi({ company_id: companyId })
      .then((services) => setServiceOptions(services.map(packageToCatalogOption)))
      .catch((err) => toast.error(err instanceof Error ? err.message : "Errore caricamento catalogo servizi"))
      .finally(() => setServicesLoading(false));
  }, [companyId, toast]);

  useEffect(() => {
    if (!companyId) {
      setPackages([]);
      setSelectedPackageId(null);
      setSelectedPackage(null);
      return;
    }

    const timer = setTimeout(() => {
      setLoadingList(true);
      listSocialPackagesApi({
        company_id: companyId,
        q: search || undefined,
        area: areaFilter || undefined,
        include_inactive: showInactive,
      })
        .then((data) => {
          setPackages(data);
          if (editorMode === "edit" && data.length > 0) {
            if (!selectedPackageId || !data.some((item) => item.id === selectedPackageId)) {
              setSelectedPackageId(data[0].id);
            }
          }
        })
        .catch((err) => toast.error(err instanceof Error ? err.message : "Errore caricamento pacchetti social"))
        .finally(() => setLoadingList(false));
    }, 250);

    return () => clearTimeout(timer);
  }, [areaFilter, companyId, editorMode, search, selectedPackageId, showInactive, toast]);

  useEffect(() => {
    if (!selectedPackageId) {
      if (editorMode === "create") return;
      setSelectedPackage(null);
      return;
    }

    setLoadingDetail(true);
    getSocialPackageApi(selectedPackageId)
      .then((detail) => {
        setSelectedPackage(detail);
        setForm(normalizeDraft(detail));
        setDirty(false);
        setPackageError(null);
        setPreviewRequest(emptyPreviewRequest(detail, clients));
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Errore caricamento dettaglio pacchetto"))
      .finally(() => setLoadingDetail(false));
  }, [clients, selectedPackageId, toast]);

  useEffect(() => {
    if (!selectedPackage && editorMode === "create") {
      setPreviewRequest(emptyPreviewRequest(null, clients));
    }
  }, [clients, editorMode, selectedPackage]);

  useEffect(() => {
    refetchClients(companyId ? { company_id: companyId } : undefined);
  }, [companyId, refetchClients]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  useEffect(() => {
    const state = location.state as { preview?: SocialPackageQuotePreviewResponse; previewSource?: string } | null;
    if (state?.preview && state.previewSource === "social-package") {
      setPreview(state.preview);
      setPreviewOpen(true);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.state, navigate]);

  const currentPackageCount = packages.length;
  const canEdit = !!selectedPackageId || editorMode === "create";

  const loadSelectedPackage = useCallback(async (packageId: number) => {
    const detail = await getSocialPackageApi(packageId);
    setSelectedPackage(detail);
    setForm(normalizeDraft(detail));
    setDirty(false);
    setPackageError(null);
    return detail;
  }, []);

  const refreshList = useCallback(async () => {
    if (!companyId) return;
    const data = await listSocialPackagesApi({
      company_id: companyId,
      q: search || undefined,
      area: areaFilter || undefined,
      include_inactive: showInactive,
    });
    setPackages(data);
  }, [areaFilter, companyId, search, showInactive]);

  const setFormPatch = useCallback((patch: Partial<SocialPackageDraft>) => {
    setForm((current) => ({ ...current, ...patch }));
    setDirty(true);
  }, []);

  const confirmSwitchPackage = useCallback(
    (nextId: number | null, nextMode: "edit" | "create") => {
      if (dirty && !window.confirm("Hai modifiche non salvate. Vuoi davvero cambiare pacchetto?")) return;
      setEditorMode(nextMode);
      setSelectedPackageId(nextId);
      setPackageError(null);
      setDirty(false);
      if (nextMode === "create") {
        setSelectedPackage(null);
        setForm({ ...EMPTY_SOCIAL_PACKAGE_DRAFT, company_id: companyId, title: "", slug: "" });
        setPreviewRequest(emptyPreviewRequest(null, clients));
      }
    },
    [clients, companyId, dirty]
  );

  const handleCreateNew = () => {
    confirmSwitchPackage(null, "create");
  };

  const handleSelectPackage = (item: SocialPackageBase) => {
    if (item.id === selectedPackageId && editorMode === "edit") return;
    confirmSwitchPackage(item.id, "edit");
  };

  const handleSavePackage = useCallback(async () => {
    if (!companyId) {
      setPackageError("Seleziona una azienda.");
      return;
    }
    if (!form.title.trim()) {
      setPackageError("Il nome del pacchetto è obbligatorio.");
      return;
    }
    if (!form.slug.trim()) {
      setPackageError("Lo slug è obbligatorio.");
      return;
    }

    setSaving(true);
    setPackageError(null);
    try {
      const companyPayload = normalizeCompanyPayload(
        companyId,
        selectedPackage?.company_ids ?? (companyId != null ? [companyId] : [])
      );
      const payload = {
        ...buildSocialPackagePayload({ ...form, company_id: companyId }),
        ...companyPayload,
      };
      if (editorMode === "create" || !selectedPackageId) {
        const created = await createSocialPackageApi(payload as Parameters<typeof createSocialPackageApi>[0]);
        toast.success("Pacchetto creato");
        await refreshList();
        setEditorMode("edit");
        setSelectedPackageId(created.id);
        await loadSelectedPackage(created.id);
      } else {
        await updateSocialPackageApi(selectedPackageId, payload as Parameters<typeof updateSocialPackageApi>[1]);
        toast.success("Pacchetto aggiornato");
        await refreshList();
        await loadSelectedPackage(selectedPackageId);
      }
    } catch (err) {
      setPackageError(err instanceof Error ? err.message : "Errore salvataggio pacchetto");
      toast.error(err instanceof Error ? err.message : "Errore salvataggio pacchetto");
    } finally {
      setSaving(false);
    }
  }, [companyId, editorMode, form, loadSelectedPackage, refreshList, selectedPackageId, toast]);

  const openSectionModal = useCallback((section: SocialPackageSection | null) => {
    if (!selectedPackageId) return;
    setSectionEditing(section);
    setSectionDraft(section ? normalizeSectionDraft(section) : { ...EMPTY_SOCIAL_PACKAGE_SECTION_DRAFT });
    setSectionModalOpen(true);
  }, [selectedPackageId]);

  const openBadgeModal = useCallback((section: SocialPackageSection, badge: SocialPackageBadge | null) => {
    if (!selectedPackageId) return;
    setBadgeEditing({ section, badge });
    setBadgeDraft(badge ? normalizeBadgeDraft(badge) : { ...EMPTY_SOCIAL_PACKAGE_BADGE_DRAFT });
    setBadgeModalOpen(true);
  }, [selectedPackageId]);

  const openItemModal = useCallback((section: SocialPackageSection, badge: SocialPackageBadge, item: SocialPackageBadgeItem | null) => {
    if (!selectedPackageId) return;
    setBadgeItemEditing({ section, badge, item });
    setBadgeItemDraft(item ? normalizeBadgeItemDraft(item) : { ...EMPTY_SOCIAL_PACKAGE_BADGE_ITEM_DRAFT });
    setBadgeItemModalOpen(true);
  }, [selectedPackageId]);

  const openCatalogModal = useCallback((item: SocialPackageCatalogItem | null) => {
    if (!selectedPackageId) return;
    setCatalogEditing(item);
    setCatalogDraft(item ? normalizeCatalogItemDraft(item) : { ...EMPTY_SOCIAL_PACKAGE_CATALOG_ITEM_DRAFT });
    setCatalogModalOpen(true);
  }, [selectedPackageId]);

  const saveSection = useCallback(async () => {
    if (!selectedPackageId) return;
    if (!sectionDraft.title.trim() || !sectionDraft.slug.trim()) return;
    setSaving(true);
    try {
      const payload = buildSectionPayload(sectionDraft);
      if (sectionEditing) {
        await updateSocialPackageSectionApi(sectionEditing.id, payload as Parameters<typeof updateSocialPackageSectionApi>[1]);
        toast.success("Sezione aggiornata");
      } else {
        await createSocialPackageSectionApi(selectedPackageId, payload as Parameters<typeof createSocialPackageSectionApi>[1]);
        toast.success("Sezione creata");
      }
      setSectionModalOpen(false);
      setSectionEditing(null);
      await loadSelectedPackage(selectedPackageId);
      await refreshList();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore salvataggio sezione");
    } finally {
      setSaving(false);
    }
  }, [loadSelectedPackage, refreshList, sectionDraft, sectionEditing, selectedPackageId, toast]);

  const saveBadge = useCallback(async () => {
    if (!selectedPackageId || !badgeEditing) return;
    if (!badgeDraft.title.trim() || !badgeDraft.slug.trim()) return;
    setSaving(true);
    try {
      const payload = buildBadgePayload(badgeDraft);
      if (badgeEditing.badge) {
        await updateSocialPackageBadgeApi(badgeEditing.badge.id, payload as Parameters<typeof updateSocialPackageBadgeApi>[1]);
        toast.success("Badge aggiornato");
      } else {
        await createSocialPackageBadgeApi(badgeEditing.section.id, payload as Parameters<typeof createSocialPackageBadgeApi>[1]);
        toast.success("Badge creato");
      }
      setBadgeModalOpen(false);
      setBadgeEditing(null);
      await loadSelectedPackage(selectedPackageId);
      await refreshList();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore salvataggio badge");
    } finally {
      setSaving(false);
    }
  }, [badgeDraft, badgeEditing, loadSelectedPackage, refreshList, selectedPackageId, toast]);

  const saveBadgeItem = useCallback(async () => {
    if (!selectedPackageId || !badgeItemEditing) return;
    if (!badgeItemDraft.title.trim()) return;
    setSaving(true);
    try {
      const payload = buildBadgeItemPayload(badgeItemDraft);
      if (badgeItemEditing.item) {
        await updateSocialPackageBadgeItemApi(
          badgeItemEditing.item.id,
          payload as Parameters<typeof updateSocialPackageBadgeItemApi>[1]
        );
        toast.success("Bullet aggiornato");
      } else {
        await createSocialPackageBadgeItemApi(
          badgeItemEditing.badge.id,
          payload as Parameters<typeof createSocialPackageBadgeItemApi>[1]
        );
        toast.success("Bullet creato");
      }
      setBadgeItemModalOpen(false);
      setBadgeItemEditing(null);
      await loadSelectedPackage(selectedPackageId);
      await refreshList();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore salvataggio bullet item");
    } finally {
      setSaving(false);
    }
  }, [badgeItemDraft, badgeItemEditing, loadSelectedPackage, refreshList, selectedPackageId, toast]);

  const saveCatalogItem = useCallback(async () => {
    if (!selectedPackageId) return;
    if (!catalogDraft.title.trim()) return;
    setSaving(true);
    try {
      const payload = buildCatalogItemPayload(catalogDraft);
      if (catalogEditing) {
        await updateSocialPackageCatalogItemApi(catalogEditing.id, payload as Parameters<typeof updateSocialPackageCatalogItemApi>[1]);
        toast.success("Riga catalogo aggiornata");
      } else {
        await createSocialPackageCatalogItemApi(selectedPackageId, payload as Parameters<typeof createSocialPackageCatalogItemApi>[1]);
        toast.success("Riga catalogo creata");
      }
      setCatalogModalOpen(false);
      setCatalogEditing(null);
      await loadSelectedPackage(selectedPackageId);
      await refreshList();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore salvataggio riga catalogo");
    } finally {
      setSaving(false);
    }
  }, [catalogDraft, catalogEditing, loadSelectedPackage, refreshList, selectedPackageId, toast]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteTarget.run();
      toast.success("Eliminato con successo");
      setDeleteTarget(null);
      if (selectedPackageId) {
        await loadSelectedPackage(selectedPackageId).catch(() => undefined);
      }
      await refreshList();
      if (deleteTarget.kind === "package") {
        setSelectedPackageId(null);
        setSelectedPackage(null);
        setEditorMode("edit");
        setForm({ ...EMPTY_SOCIAL_PACKAGE_DRAFT, company_id: companyId });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore eliminazione");
    }
  }, [companyId, deleteTarget, loadSelectedPackage, refreshList, selectedPackageId, toast]);

  const openPreview = useCallback(() => {
    if (!selectedPackageId) return;
    setPreviewRequestOpen(true);
    setPreviewRequest((current) => ({
      ...current,
      tag: current.tag || form.title,
      notes: current.notes || form.description,
      discount_pct: current.discount_pct || form.discount_pct,
      duration_months: current.duration_months || form.default_duration_months || "12",
      client_id: current.client_id ?? clients[0]?.id ?? null,
    }));
  }, [clients, form.default_duration_months, form.description, form.discount_pct, form.title, selectedPackageId]);

  const generatePreview = useCallback(async () => {
    if (!selectedPackageId) return;
    const durationMonths = toNumber(previewRequest.duration_months, 12) ?? 12;
    if (durationMonths < 1) {
      toast.error("La durata deve essere almeno di 1 mese");
      return;
    }
    setPreviewLoading(true);
    try {
      const response = await previewSocialPackageQuoteApi(selectedPackageId, {
        client_id: previewRequest.client_id,
        company_id: companyId,
        date: previewRequest.date,
        tag: previewRequest.tag,
        notes: previewRequest.notes,
        discount_pct: toNumber(previewRequest.discount_pct, 0) ?? 0,
        discount_eur: toNumber(previewRequest.discount_eur, 0) ?? 0,
        duration_months: durationMonths,
      });
      setPreview(response);
      setPreviewOpen(true);
      setPreviewRequestOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore generazione anteprima");
    } finally {
      setPreviewLoading(false);
    }
  }, [companyId, previewRequest, selectedPackageId, toast]);

  const convertPreview = useCallback(() => {
    if (!preview) return;
    navigate("/preventivo", {
      state: {
        preview,
        previewSource: "social-package",
        socialPackageId: preview.package_id,
        socialPackageTitle: preview.package_title,
      },
    });
  }, [navigate, preview]);

  const selectedPackageSummary = useMemo(() => (selectedPackage ? summarizePackage(selectedPackage) : null), [selectedPackage]);
  const allVisibleSelected = packages.length > 0 && packages.every((item) => selectedPackageIds.includes(item.id));

  const togglePackageSelection = (packageId: number, checked: boolean) => {
    setSelectedPackageIds((current) => {
      if (checked) return Array.from(new Set([...current, packageId]));
      return current.filter((id) => id !== packageId);
    });
  };

  const toggleSelectAllVisible = (checked: boolean) => {
    setSelectedPackageIds((current) => {
      if (checked) {
        const merged = new Set([...current, ...packages.map((item) => item.id)]);
        return Array.from(merged);
      }
      const visibleIds = new Set(packages.map((item) => item.id));
      return current.filter((id) => !visibleIds.has(id));
    });
  };

  const handleBulkDelete = async () => {
    if (selectedPackageIds.length === 0) return;
    setBulkDeleting(true);
    try {
      const response = await bulkDeleteSocialPackagesApi(selectedPackageIds);
      setBulkDeleteOpen(false);
      setBulkResult(response);
      setSelectedPackageIds([]);
      toast.success(`Eliminati ${response.deleted_ids.length} su ${response.requested}`);
      await refreshList();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore eliminazione bulk pacchetti social");
    } finally {
      setBulkDeleting(false);
    }
  };

  return (
    <div className="px-10 py-8 pb-20 max-w-[1600px] mx-auto w-full animate-fadeIn">
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="section-eyebrow">
            <Icon name="list" className="w-3.5 h-3.5" />
            Preventivatore
          </div>
          <h1 className="section-title">Pacchetti Social</h1>
          <p className="section-lead">
            {loadingList
              ? "Caricamento pacchetti social..."
              : `${currentPackageCount} pacchetti disponibili${selectedCompany ? ` per ${selectedCompany.name}` : ""}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {selectedPackageIds.length > 0 && (
            <Button
              variant="danger-ghost"
              onClick={() => setBulkDeleteOpen(true)}
              leftIcon={<Icon name="trash" className="w-4 h-4" />}
            >
              Elimina selezionati ({selectedPackageIds.length})
            </Button>
          )}
          <Button variant="secondary" onClick={handleCreateNew} leftIcon={<Icon name="plus" className="w-4 h-4" />}>
            Nuovo pacchetto
          </Button>
          <Button variant="primary" onClick={openPreview} disabled={!canEdit || servicesLoading} leftIcon={<Icon name="eye" className="w-4 h-4" />}>
            Anteprima preventivo
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[fit-content(420px)_minmax(0,1fr)]">
        <aside className="grid gap-5 self-start xl:sticky xl:top-6">
          <section className="rounded-2xl border border-line dark:border-[#2a2a2e] bg-paper dark:bg-[#131316] shadow-sm p-5">
            <button
              type="button"
              onClick={() => setFiltersOpen((open) => !open)}
              className="w-full flex items-center justify-between gap-3 text-left"
            >
              <div>
                <h2 className="font-display text-lg font-bold tracking-tight text-ink dark:text-paper">Filtri</h2>
                <p className="text-sm text-muted dark:text-[#9999a0]">Cerca, filtra per area e mostra anche gli elementi inattivi.</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={showInactive ? "warning" : "default"}>{showInactive ? "Inattivi visibili" : "Solo attivi"}</Badge>
                <Icon name="chevron-down" className={`w-4 h-4 text-muted dark:text-[#9999a0] transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
              </div>
            </button>
            {filtersOpen ? (
              <div className="mt-4 grid gap-3">
                <Input label="Cerca" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Titolo, slug, descrizione" />
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted dark:text-[#9999a0]">Area</span>
                  <SearchableSelect
                    value={areaFilter}
                    onChange={setAreaFilter}
                    options={[
                      { value: "", label: "Tutte le aree" },
                      ...areaOptions.map((area) => ({ value: area, label: area })),
                    ]}
                    placeholder="Tutte le aree"
                    searchPlaceholder="Cerca area…"
                  />
                </label>
                <label className="flex items-center gap-3 rounded-lg border border-line dark:border-[#2a2a2e] px-4 py-3 bg-cream/40 dark:bg-[#1c1c20]">
                  <Checkbox
                    checked={showInactive}
                    onChange={(v) => setShowInactive(v)}
                  />
                  <span className="text-sm font-body text-ink dark:text-[#f4f4f7]">Mostra pacchetti inattivi</span>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted dark:text-[#9999a0]">Azienda</span>
                  <SearchableSelect
                    value={companyId != null ? String(companyId) : ""}
                    onChange={(value) => {
                      const nextCompanyId = value ? Number(value) : null;
                      if (dirty && !window.confirm("Hai modifiche non salvate. Vuoi cambiare azienda?")) return;
                      setCompanyId(nextCompanyId);
                      setSelectedPackageId(null);
                      setSelectedPackage(null);
                      setEditorMode("edit");
                      setDirty(false);
                    }}
                    options={[
                      { value: "", label: "Seleziona azienda" },
                      ...companyOptions.map((company) => ({ value: String(company.id), label: company.name })),
                    ]}
                    placeholder="Seleziona azienda"
                    searchPlaceholder="Cerca azienda…"
                  />
                </label>
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-line dark:border-[#2a2a2e] bg-paper dark:bg-[#131316] shadow-sm p-5">
            <button
              type="button"
              onClick={() => setListOpen((open) => !open)}
              className="w-full flex items-center justify-between gap-3 text-left"
            >
              <div>
                <h2 className="font-display text-lg font-bold tracking-tight text-ink dark:text-paper">Elenco pacchetti</h2>
                <p className="text-sm text-muted dark:text-[#9999a0]">Seleziona un pacchetto per modificarlo o eliminarlo.</p>
              </div>
              <div className="flex items-center gap-2">
                {loadingList ? <Spinner className="w-5 h-5" /> : null}
                <Icon name="chevron-down" className={`w-4 h-4 text-muted dark:text-[#9999a0] transition-transform ${listOpen ? "rotate-180" : ""}`} />
              </div>
            </button>
            {listOpen ? (
              <div className="grid gap-3 mt-4">
                <label className="inline-flex items-center gap-2 rounded-lg border border-line dark:border-[#2a2a2e] px-3 py-2 text-[12px] text-muted dark:text-[#9999a0]">
                  <Checkbox checked={allVisibleSelected} onChange={toggleSelectAllVisible} />
                  Seleziona tutti visibili
                </label>
                {packages.map((item) => (
                  <PackageRow
                    key={item.id}
                    item={item}
                    active={item.id === selectedPackageId && editorMode === "edit"}
                    selected={selectedPackageIds.includes(item.id)}
                    onToggleSelected={(checked) => togglePackageSelection(item.id, checked)}
                    onSelect={() => handleSelectPackage(item)}
                    onDelete={() =>
                      setDeleteTarget({
                        kind: "package",
                        label: item.title,
                        run: async () => {
                          await deleteSocialPackageApi(item.id);
                          if (selectedPackageId === item.id) {
                            setSelectedPackageId(null);
                            setSelectedPackage(null);
                          }
                        },
                      })
                    }
                  />
                ))}
                {!loadingList && packages.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-line dark:border-[#2a2a2e] bg-cream/30 dark:bg-[#1c1c20] px-4 py-8 text-sm text-muted dark:text-[#9999a0]">
                    Nessun pacchetto trovato con i filtri correnti.
                  </div>
                )}
              </div>
            ) : null}
          </section>
        </aside>

        <main className="grid gap-6">
          <div className="rounded-2xl border border-line dark:border-[#2a2a2e] bg-paper dark:bg-[#131316] shadow-sm p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="font-display text-lg font-bold tracking-tight text-ink dark:text-paper">Riepilogo selezione</h2>
                <p className="text-sm text-muted dark:text-[#9999a0]">
                  {selectedPackage ? selectedPackage.slug : editorMode === "create" ? "Creazione pacchetto in corso" : "Seleziona un pacchetto da modificare"}
                </p>
              </div>
              {selectedPackageSummary && (
                <div className="flex flex-wrap gap-2 text-[11px] text-muted dark:text-[#9999a0]">
                  <span className="rounded-full border border-line dark:border-[#2a2a2e] px-3 py-1">{selectedPackageSummary.sections} sezioni</span>
                  <span className="rounded-full border border-line dark:border-[#2a2a2e] px-3 py-1">{selectedPackageSummary.badges} badge</span>
                  <span className="rounded-full border border-line dark:border-[#2a2a2e] px-3 py-1">{selectedPackageSummary.bullets} bullet</span>
                  <span className="rounded-full border border-line dark:border-[#2a2a2e] px-3 py-1">{selectedPackageSummary.catalog} righe</span>
                </div>
              )}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-line dark:border-[#2a2a2e] bg-cream/30 dark:bg-[#1c1c20] p-4">
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted dark:text-[#9999a0]">Stato</div>
                <div className="mt-2 text-sm font-semibold text-ink dark:text-paper">{selectedPackage ? (selectedPackage.is_active ? "Attivo" : "Disattivo") : "Nessuno"}</div>
              </div>
              <div className="rounded-xl border border-line dark:border-[#2a2a2e] bg-cream/30 dark:bg-[#1c1c20] p-4">
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted dark:text-[#9999a0]">Base</div>
                <div className="mt-2 text-sm font-semibold text-ink dark:text-paper">
                  {selectedPackage ? formatCurrency(selectedPackage.base_price, selectedPackage.currency) : "-"}
                </div>
              </div>
              <div className="rounded-xl border border-line dark:border-[#2a2a2e] bg-cream/30 dark:bg-[#1c1c20] p-4">
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted dark:text-[#9999a0]">Durata</div>
                <div className="mt-2 text-sm font-semibold text-ink dark:text-paper">{selectedPackage?.default_duration_months ?? "-"} mesi</div>
              </div>
              <div className="rounded-xl border border-line dark:border-[#2a2a2e] bg-cream/30 dark:bg-[#1c1c20] p-4">
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted dark:text-[#9999a0]">Ultimo aggiornamento</div>
                <div className="mt-2 text-sm font-semibold text-ink dark:text-paper">{selectedPackage?.updated_at ?? "-"}</div>
              </div>
            </div>
          </div>

          {loadingDetail ? (
            <div className="rounded-2xl border border-line dark:border-[#2a2a2e] bg-paper dark:bg-[#131316] p-8 shadow-sm flex items-center justify-center">
              <Spinner className="w-6 h-6" />
            </div>
          ) : (
            <PackageEditorPanel
              mode={editorMode}
              selectedPackage={selectedPackage}
              packageId={selectedPackageId}
              form={form}
              setForm={setFormPatch}
              dirty={dirty}
              saving={saving}
              onSave={handleSavePackage}
              onPreview={openPreview}
              onCreateSection={() => openSectionModal(null)}
              onEditSection={(section) => openSectionModal(section)}
              onDeleteSection={(section) =>
                setDeleteTarget({
                  kind: "section",
                  label: section.title,
                  run: async () => {
                    if (!selectedPackageId) return;
                            await deleteSocialPackageSectionApi(section.id);
                  },
                })
              }
              onCreateBadge={(section) => openBadgeModal(section, null)}
              onEditBadge={(section, badge) => openBadgeModal(section, badge)}
              onDeleteBadge={(_section, badge) =>
                setDeleteTarget({
                  kind: "badge",
                  label: badge.title,
                  run: async () => {
                    if (!selectedPackageId) return;
                    await deleteSocialPackageBadgeApi(badge.id);
                  },
                })
              }
              onCreateItem={(section, badge) => openItemModal(section, badge, null)}
              onEditItem={(section, badge, item) => openItemModal(section, badge, item)}
              onDeleteItem={(_section, _badge, item) =>
                setDeleteTarget({
                  kind: "item",
                  label: item.title,
                  run: async () => {
                    if (!selectedPackageId) return;
                    await deleteSocialPackageBadgeItemApi(item.id);
                  },
                })
              }
              onCreateCatalogItem={() => openCatalogModal(null)}
              onEditCatalogItem={(item) => openCatalogModal(item)}
              onDeleteCatalogItem={(item) =>
                setDeleteTarget({
                  kind: "catalog",
                  label: item.title,
                  run: async () => {
                    if (!selectedPackageId) return;
                    await deleteSocialPackageCatalogItemApi(item.id);
                  },
                })
              }
              sectionsSavingHint={sectionsSavingHint}
              catalogSavingHint={catalogSavingHint}
              companyOptions={companies}
              serviceOptions={serviceOptions}
            />
          )}
        </main>
      </div>

      <Modal
        open={sectionModalOpen}
        onClose={() => setSectionModalOpen(false)}
        title={sectionEditing ? "Modifica sezione" : "Nuova sezione"}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSectionModalOpen(false)}>
              Annulla
            </Button>
            <Button variant="primary" onClick={saveSection} loading={saving}>
              Salva
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <Input label="Titolo" value={sectionDraft.title} onChange={(e) => setSectionDraft((current) => ({ ...current, title: e.target.value, slug: current.slug || slugify(e.target.value) }))} />
          <Input label="Slug" value={sectionDraft.slug} onChange={(e) => setSectionDraft((current) => ({ ...current, slug: slugify(e.target.value) }))} />
          <Input label="Ordine" type="number" value={sectionDraft.sort_order} onChange={(e) => setSectionDraft((current) => ({ ...current, sort_order: e.target.value }))} />
          <div className="grid gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted dark:text-[#9999a0]">Descrizione</label>
            <Textarea
              rows={4}
              value={sectionDraft.description}
              onChange={(e) => setSectionDraft((current) => ({ ...current, description: e.target.value }))}
              className="w-full px-3.5 py-2.5 rounded-md text-[13px] font-body text-ink dark:text-[#f4f4f7] placeholder:text-muted/60 dark:placeholder:text-[#9999a0]/60 border border-line dark:border-[#2a2a2e] bg-paper dark:bg-[#1c1c20] outline-none transition-colors focus:border-ink dark:focus:border-[#f4f4f7] resize-none"
            />
          </div>
          <label className="flex items-center gap-3 rounded-lg border border-line dark:border-[#2a2a2e] px-4 py-3 bg-cream/40 dark:bg-[#1c1c20]">
            <Checkbox checked={sectionDraft.is_active} onChange={(v) => setSectionDraft((current) => ({ ...current, is_active: v }))} />
            <span className="text-sm font-body text-ink dark:text-[#f4f4f7]">Sezione attiva</span>
          </label>
        </div>
      </Modal>

      <Modal
        open={badgeModalOpen}
        onClose={() => setBadgeModalOpen(false)}
        title={badgeEditing?.badge ? "Modifica badge" : "Nuovo badge"}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setBadgeModalOpen(false)}>
              Annulla
            </Button>
            <Button variant="primary" onClick={saveBadge} loading={saving}>
              Salva
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <Input
            label="Titolo"
            value={badgeDraft.title}
            onChange={(e) => setBadgeDraft((current) => ({ ...current, title: e.target.value, slug: current.slug || slugify(e.target.value) }))}
          />
          <Input label="Slug" value={badgeDraft.slug} onChange={(e) => setBadgeDraft((current) => ({ ...current, slug: slugify(e.target.value) }))} />
          <Input label="Colore badge" value={badgeDraft.color} onChange={(e) => setBadgeDraft((current) => ({ ...current, color: e.target.value }))} placeholder="#c41284" />
          <Input label="Ordine" type="number" value={badgeDraft.sort_order} onChange={(e) => setBadgeDraft((current) => ({ ...current, sort_order: e.target.value }))} />
          <div className="grid gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted dark:text-[#9999a0]">Descrizione</label>
            <Textarea
              rows={4}
              value={badgeDraft.description}
              onChange={(e) => setBadgeDraft((current) => ({ ...current, description: e.target.value }))}
              className="w-full px-3.5 py-2.5 rounded-md text-[13px] font-body text-ink dark:text-[#f4f4f7] placeholder:text-muted/60 dark:placeholder:text-[#9999a0]/60 border border-line dark:border-[#2a2a2e] bg-paper dark:bg-[#1c1c20] outline-none transition-colors focus:border-ink dark:focus:border-[#f4f4f7] resize-none"
            />
          </div>
          <label className="flex items-center gap-3 rounded-lg border border-line dark:border-[#2a2a2e] px-4 py-3 bg-cream/40 dark:bg-[#1c1c20]">
            <Checkbox checked={badgeDraft.is_active} onChange={(v) => setBadgeDraft((current) => ({ ...current, is_active: v }))} />
            <span className="text-sm font-body text-ink dark:text-[#f4f4f7]">Badge attivo</span>
          </label>
        </div>
      </Modal>

      <Modal
        open={badgeItemModalOpen}
        onClose={() => setBadgeItemModalOpen(false)}
        title={badgeItemEditing?.item ? "Modifica bullet" : "Nuovo bullet"}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setBadgeItemModalOpen(false)}>
              Annulla
            </Button>
            <Button variant="primary" onClick={saveBadgeItem} loading={saving}>
              Salva
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <Input label="Titolo" value={badgeItemDraft.title} onChange={(e) => setBadgeItemDraft((current) => ({ ...current, title: e.target.value }))} />
          <Input label="Ordine" type="number" value={badgeItemDraft.sort_order} onChange={(e) => setBadgeItemDraft((current) => ({ ...current, sort_order: e.target.value }))} />
          <div className="grid gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted dark:text-[#9999a0]">Descrizione</label>
            <Textarea
              rows={4}
              value={badgeItemDraft.description}
              onChange={(e) => setBadgeItemDraft((current) => ({ ...current, description: e.target.value }))}
              className="w-full px-3.5 py-2.5 rounded-md text-[13px] font-body text-ink dark:text-[#f4f4f7] placeholder:text-muted/60 dark:placeholder:text-[#9999a0]/60 border border-line dark:border-[#2a2a2e] bg-paper dark:bg-[#1c1c20] outline-none transition-colors focus:border-ink dark:focus:border-[#f4f4f7] resize-none"
            />
          </div>
          <label className="flex items-center gap-3 rounded-lg border border-line dark:border-[#2a2a2e] px-4 py-3 bg-cream/40 dark:bg-[#1c1c20]">
            <Checkbox checked={badgeItemDraft.is_active} onChange={(v) => setBadgeItemDraft((current) => ({ ...current, is_active: v }))} />
            <span className="text-sm font-body text-ink dark:text-[#f4f4f7]">Bullet attivo</span>
          </label>
        </div>
      </Modal>

      <Modal
        open={catalogModalOpen}
        onClose={() => setCatalogModalOpen(false)}
        title={catalogEditing ? "Modifica riga catalogo" : "Nuova riga catalogo"}
        size="xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCatalogModalOpen(false)}>
              Annulla
            </Button>
            <Button variant="primary" onClick={saveCatalogItem} loading={saving}>
              Salva
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted dark:text-[#9999a0]">Servizio catalogo</span>
            <SearchableSelect
              value={catalogDraft.service_id}
              onChange={(value) => {
                const option = serviceOptions.find((service) => service.id === Number(value));
                setCatalogDraft((current) => ({
                  ...current,
                  service_id: value,
                  title: option?.label ?? current.title,
                }));
              }}
              options={[
                { value: "", label: "Seleziona servizio" },
                ...serviceOptions.map((service) => ({ value: String(service.id), label: service.label })),
              ]}
              placeholder="Seleziona servizio"
              searchPlaceholder="Cerca servizio…"
            />
          </label>
          <Input label="Titolo" value={catalogDraft.title} onChange={(e) => setCatalogDraft((current) => ({ ...current, title: e.target.value }))} />
          <Input label="Area" value={catalogDraft.area} onChange={(e) => setCatalogDraft((current) => ({ ...current, area: e.target.value }))} />
          <Input label="Categoria" value={catalogDraft.category} onChange={(e) => setCatalogDraft((current) => ({ ...current, category: e.target.value }))} />
          <Input label="Quantità" type="number" value={catalogDraft.quantity} onChange={(e) => setCatalogDraft((current) => ({ ...current, quantity: e.target.value }))} />
          <Input label="Importo unitario" type="number" value={catalogDraft.unit_amount} onChange={(e) => setCatalogDraft((current) => ({ ...current, unit_amount: e.target.value }))} />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted dark:text-[#9999a0]">Periodo</span>
              <SearchableSelect
                value={catalogDraft.billing_period}
                onChange={(value) => setCatalogDraft((current) => ({ ...current, billing_period: value as SocialPackageCatalogItemDraft["billing_period"] }))}
                options={[
                  { value: "", label: "Nessuno" },
                  { value: "oneoff", label: "Una tantum" },
                  { value: "monthly", label: "Mensile" },
                  { value: "yearly", label: "Annuale" },
                ]}
                placeholder="Nessuno"
                searchPlaceholder="Cerca periodo…"
              />
            </label>
            <Input label="Sconto %" type="number" value={catalogDraft.discount_pct} onChange={(e) => setCatalogDraft((current) => ({ ...current, discount_pct: e.target.value }))} />
            <Input label="Ordine" type="number" value={catalogDraft.sort_order} onChange={(e) => setCatalogDraft((current) => ({ ...current, sort_order: e.target.value }))} />
          </div>
          <div className="grid gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted dark:text-[#9999a0]">Descrizione</label>
            <Textarea
              rows={4}
              value={catalogDraft.description}
              onChange={(e) => setCatalogDraft((current) => ({ ...current, description: e.target.value }))}
              className="w-full px-3.5 py-2.5 rounded-md text-[13px] font-body text-ink dark:text-[#f4f4f7] placeholder:text-muted/60 dark:placeholder:text-[#9999a0]/60 border border-line dark:border-[#2a2a2e] bg-paper dark:bg-[#1c1c20] outline-none transition-colors focus:border-ink dark:focus:border-[#f4f4f7] resize-none"
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex items-center gap-3 rounded-lg border border-line dark:border-[#2a2a2e] px-4 py-3 bg-cream/40 dark:bg-[#1c1c20]">
              <Checkbox checked={catalogDraft.is_included} onChange={(v) => setCatalogDraft((current) => ({ ...current, is_included: v }))} />
              <span className="text-sm font-body text-ink dark:text-[#f4f4f7]">Inclusa nel prezzo</span>
            </label>
            <label className="flex items-center gap-3 rounded-lg border border-line dark:border-[#2a2a2e] px-4 py-3 bg-cream/40 dark:bg-[#1c1c20]">
              <Checkbox checked={catalogDraft.is_active} onChange={(v) => setCatalogDraft((current) => ({ ...current, is_active: v }))} />
              <span className="text-sm font-body text-ink dark:text-[#f4f4f7]">Riga attiva</span>
            </label>
          </div>
        </div>
      </Modal>

      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Conferma eliminazione"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Annulla
            </Button>
            <Button variant="danger" onClick={handleDelete}>
              Elimina
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink dark:text-[#f4f4f7]">
          Confermi l'eliminazione di <strong>{deleteTarget?.label}</strong>?
        </p>
      </Modal>

      <Modal
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        title="Elimina pacchetti selezionati"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setBulkDeleteOpen(false)} disabled={bulkDeleting}>
              Annulla
            </Button>
            <Button variant="danger" onClick={() => void handleBulkDelete()} loading={bulkDeleting}>
              Elimina selezionati
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink dark:text-[#f4f4f7]">
          Confermi l'eliminazione di <strong>{selectedPackageIds.length}</strong> pacchetti?
        </p>
      </Modal>

      <Modal
        open={bulkResult != null && bulkResult.errors.length > 0}
        onClose={() => setBulkResult(null)}
        title="Dettagli eliminazione bulk"
        size="md"
        footer={<Button variant="ghost" onClick={() => setBulkResult(null)}>Chiudi</Button>}
      >
        <p className="text-sm text-ink dark:text-[#f4f4f7] mb-3">
          Eliminati {bulkResult?.deleted_ids.length ?? 0} su {bulkResult?.requested ?? 0}.
        </p>
        <ul className="max-h-64 overflow-auto space-y-1 text-sm text-danger">
          {bulkResult?.errors.map((item) => (
            <li key={item.id}>#{item.id}: {item.detail}</li>
          ))}
        </ul>
      </Modal>

      <Modal
        open={previewRequestOpen}
        onClose={() => setPreviewRequestOpen(false)}
        title="Imposta anteprima preventivo"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPreviewRequestOpen(false)}>
              Annulla
            </Button>
            <Button variant="primary" onClick={generatePreview} loading={previewLoading}>
              Genera anteprima
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted dark:text-[#9999a0]">Cliente</span>
            <SearchableSelect
              value={previewRequest.client_id != null ? String(previewRequest.client_id) : ""}
              onChange={(value) => setPreviewRequest((current) => ({ ...current, client_id: value ? Number(value) : null }))}
              options={[
                { value: "", label: "Nessun cliente" },
                ...clients.map((client) => ({ value: String(client.id), label: client.name })),
              ]}
              placeholder="Nessun cliente"
              searchPlaceholder="Cerca cliente…"
            />
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Data" type="date" value={previewRequest.date} onChange={(e) => setPreviewRequest((current) => ({ ...current, date: e.target.value }))} />
            <Input label="Durata (mesi)" type="number" value={previewRequest.duration_months} onChange={(e) => setPreviewRequest((current) => ({ ...current, duration_months: e.target.value }))} />
          </div>
          <Input label="Tag" value={previewRequest.tag} onChange={(e) => setPreviewRequest((current) => ({ ...current, tag: e.target.value }))} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Sconto %" type="number" value={previewRequest.discount_pct} onChange={(e) => setPreviewRequest((current) => ({ ...current, discount_pct: e.target.value }))} />
            <Input label="Sconto €" type="number" value={previewRequest.discount_eur} onChange={(e) => setPreviewRequest((current) => ({ ...current, discount_eur: e.target.value }))} />
          </div>
          <div className="grid gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted dark:text-[#9999a0]">Note</label>
            <Textarea
              rows={4}
              value={previewRequest.notes}
              onChange={(e) => setPreviewRequest((current) => ({ ...current, notes: e.target.value }))}
              className="w-full px-3.5 py-2.5 rounded-md text-[13px] font-body text-ink dark:text-[#f4f4f7] placeholder:text-muted/60 dark:placeholder:text-[#9999a0]/60 border border-line dark:border-[#2a2a2e] bg-paper dark:bg-[#1c1c20] outline-none transition-colors focus:border-ink dark:focus:border-[#f4f4f7] resize-none"
            />
          </div>
        </div>
      </Modal>

      <SocialPackagePreviewModal open={previewOpen} preview={preview} loading={previewLoading} onClose={() => setPreviewOpen(false)} onConvert={convertPreview} />
      {companiesLoading && <div className="fixed bottom-6 right-6 rounded-full border border-line dark:border-[#2a2a2e] bg-paper dark:bg-[#131316] px-4 py-2 shadow-sm text-xs text-muted dark:text-[#9999a0]">Caricamento aziende…</div>}
      {servicesLoading && <div className="fixed bottom-6 left-6 rounded-full border border-line dark:border-[#2a2a2e] bg-paper dark:bg-[#131316] px-4 py-2 shadow-sm text-xs text-muted dark:text-[#9999a0]">Caricamento catalogo servizi…</div>}
      {packageError && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full border border-danger/30 bg-danger/10 px-4 py-2 shadow-sm text-xs text-danger">{packageError}</div>}
    </div>
  );
}
