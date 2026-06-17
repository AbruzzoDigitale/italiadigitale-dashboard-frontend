import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getClientsApi, type Client } from "../api/clients";
import {
  bulkDeleteContractsApi,
  CONTRACT_STAGE_LABELS,
  CONTRACT_STAGE_ORDER,
  advanceContractStageApi,
  deleteContractApi,
  moveContractStageApi,
  regressContractStageApi,
  type CommercialPipelineItem,
  type ContractCommercialStage,
  type ContractEngagementType,
  type ContractPricingMode,
  type PipelineEntityFilter,
} from "../api/contracts";
import type { BulkDeleteResponse } from "../api/bulk";
import {
  acceptAndContractDryRunApi,
  confirmQuoteContractAutomationApi,
  contractAutomationDryRunApi,
  deleteQuoteApi,
  formatEur,
  getQuoteApi,
  updateQuoteStatusApi,
  type Quote,
  type QuoteContractAutomationDryRunResponse,
  type QuoteContractAutomationPayload,
} from "../api/quotes";
import { createWorkAreaApi, listWorkAreasApi, type WorkArea } from "../api/workAreas";
import { createWorkTagApi, listWorkTagsApi, type WorkTag } from "../api/workTags";
import { ContractDetailModal } from "../components/contracts/ContractDetailModal";
import { ContractCreateModal } from "../components/contracts/ContractCreateModal";
import { ContractFromQuoteModal } from "../components/contracts/ContractFromQuoteModal";
import { QuoteQuickCreateModal } from "../components/contracts/QuoteQuickCreateModal";
import { ClientSelectorWithCreate } from "../components/clients/ClientSelectorWithCreate";
import { Icon } from "../components/ui/Icon";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Checkbox } from "../components/ui/Checkbox";
import { Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { MultiSelect } from "../components/ui/MultiSelect";
import { SearchableSelect } from "../components/ui/SearchableSelect";
import { Textarea } from "../components/ui/Textarea";
import { Spinner } from "../components/ui/Spinner";
import { PageSectionHeader } from "../components/ui/PageSectionHeader";
import { KanbanColumnShell } from "../components/ui/KanbanColumnShell";
import { WorkAreaCreateModal } from "../components/work-taxonomy/WorkAreaCreateModal";
import { WorkTagCreateModal } from "../components/work-taxonomy/WorkTagCreateModal";
import { useToast } from "../context/ToastContext";
import { useCommercialPipeline } from "../hooks/useCommercialPipeline";
import { useAuth } from "../hooks/useAuth";
import { useSelectedCompanyId } from "../hooks/useSelectedCompanyId";
import { getCommercialStageTone } from "../utils/commercialStageTone";

function stageTone(stage: ContractCommercialStage): string {
  return getCommercialStageTone(stage);
}

const CARD_ICON_ACTION_CLASS =
  "inline-flex h-7 w-7 items-center justify-center rounded-md border border-line text-muted transition-colors hover:text-ink hover:bg-cream dark:border-line-dark dark:text-muted-dark dark:hover:text-paper dark:hover:bg-[#1e1e22]";

const CARD_ICON_DANGER_ACTION_CLASS =
  "inline-flex h-7 w-7 items-center justify-center rounded-md border border-danger/30 text-danger transition-colors hover:bg-danger/10";

const QUOTE_BRANCH_ACTION_CLASS =
  "inline-flex items-center gap-1 rounded-md border border-line bg-paper px-2.5 py-1 text-[11px] font-semibold text-ink transition-colors hover:bg-cream dark:border-line-dark dark:bg-[#131316] dark:text-paper dark:hover:bg-[#1e1e22]";

type PipelineQuoteStatus =
  | "bozza"
  | "da_approvare"
  | "in_revisione"
  | "inviato"
  | "in_trattativa"
  | "accettato"
  | "perso"
  | "rifiutato";

type DragPayload = {
  entity_type: "contract" | "quote";
  id: number;
};

type ContractAutomationFormState = {
  title: string;
  company_id: string;
  client_id: string;
  engagement_type: "" | ContractEngagementType;
  commercial_stage: ContractCommercialStage;
  pricing_view_mode: ContractPricingMode;
  tag_ids: number[];
  work_area_ids: number[];
  include_quote_in_total: boolean;
  is_primary_quote: boolean;
  display_order: string;
  label: string;
};

type DeleteTarget = {
  entity_type: "contract" | "quote";
  id: number;
  title: string;
  source_number?: string | null;
};

const QUOTE_PIPELINE_TARGET_STAGES = new Set<ContractCommercialStage>([
  "bozza",
  "inviato",
  "in_trattativa",
  "accettato",
  "perso",
]);

const QUOTE_PIPELINE_ORDER: PipelineQuoteStatus[] = [
  "bozza",
  "inviato",
  "in_trattativa",
  "accettato",
  "perso",
];

const QUOTE_TRANSITIONS: Record<PipelineQuoteStatus, PipelineQuoteStatus[]> = {
  bozza: ["da_approvare", "inviato"],
  da_approvare: ["in_revisione", "inviato", "bozza"],
  in_revisione: ["da_approvare", "inviato", "bozza"],
  inviato: ["in_trattativa", "accettato", "perso", "rifiutato", "bozza"],
  in_trattativa: ["accettato", "perso", "inviato", "bozza"],
  accettato: ["bozza"],
  perso: ["bozza"],
  rifiutato: ["bozza", "perso"],
};

function parsePipelineDropPayload(raw: string): DragPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<DragPayload>;
    const parsedId = parsed.id;
    if (
      (parsed.entity_type === "contract" || parsed.entity_type === "quote") &&
      typeof parsedId === "number" &&
      Number.isInteger(parsedId) &&
      parsedId > 0
    ) {
      return { entity_type: parsed.entity_type, id: parsedId };
    }
  } catch {
    const legacyId = Number(raw);
    if (Number.isInteger(legacyId) && legacyId > 0) {
      return { entity_type: "contract", id: legacyId };
    }
  }
  return null;
}

function pipelineStageToQuoteStatus(stage: ContractCommercialStage): PipelineQuoteStatus | null {
  if (stage === "bozza" || stage === "inviato" || stage === "in_trattativa" || stage === "accettato" || stage === "perso") {
    return stage;
  }
  return null;
}

function normalizeQuoteStatus(status: string | null): PipelineQuoteStatus | null {
  if (
    status === "bozza" ||
    status === "da_approvare" ||
    status === "in_revisione" ||
    status === "inviato" ||
    status === "in_trattativa" ||
    status === "accettato" ||
    status === "perso" ||
    status === "rifiutato"
  ) {
    return status;
  }
  return null;
}

function getQuoteCurrentStatus(item: CommercialPipelineItem): PipelineQuoteStatus | null {
  if (item.entity_type !== "quote") return null;
  return normalizeQuoteStatus(item.source_status) ?? pipelineStageToQuoteStatus(item.commercial_stage);
}

function getQuoteArrowTargets(item: CommercialPipelineItem): {
  previous: PipelineQuoteStatus | null;
  next: PipelineQuoteStatus | null;
} {
  const currentStatus = getQuoteCurrentStatus(item);
  if (!currentStatus) return { previous: null, next: null };

  const currentPipelineStatus = pipelineStageToQuoteStatus(item.commercial_stage) ?? "bozza";
  const currentIndex = QUOTE_PIPELINE_ORDER.indexOf(currentPipelineStatus);
  const allowedTargets = (QUOTE_TRANSITIONS[currentStatus] ?? []).filter((status) =>
    QUOTE_PIPELINE_ORDER.includes(status)
  );

  let previous: PipelineQuoteStatus | null = null;
  let next: PipelineQuoteStatus | null = null;

  for (const status of allowedTargets) {
    const targetIndex = QUOTE_PIPELINE_ORDER.indexOf(status);
    if (targetIndex < 0) continue;
    if (targetIndex < currentIndex && (!previous || targetIndex > QUOTE_PIPELINE_ORDER.indexOf(previous))) {
      previous = status;
    }
    if (targetIndex > currentIndex && (!next || targetIndex < QUOTE_PIPELINE_ORDER.indexOf(next))) {
      next = status;
    }
  }

  return { previous, next };
}

function toAutomationForm(response: QuoteContractAutomationDryRunResponse): ContractAutomationFormState {
  const payload = response.contract_payload ?? {};
  const readString = (key: string) => {
    const value = payload[key];
    return typeof value === "string" ? value : "";
  };
  const readNumber = (key: string) => {
    const value = payload[key];
    return typeof value === "number" ? value : null;
  };
  const readNumberArray = (key: string) => {
    const value = payload[key];
    if (!Array.isArray(value)) return [];
    return value.filter((entry): entry is number => typeof entry === "number");
  };
  const readBoolean = (key: string, fallback: boolean) => {
    const value = payload[key];
    return typeof value === "boolean" ? value : fallback;
  };

  const engagementRaw = readString("engagement_type");
  const engagement_type: "" | ContractEngagementType =
    engagementRaw === "one_time" || engagementRaw === "ongoing" ? engagementRaw : "";

  const commercial_stage: ContractCommercialStage = "accettato";

  const pricingRaw = readString("pricing_view_mode");
  const pricing_view_mode: ContractPricingMode =
    pricingRaw === "single_quote" ? "single_quote" : "aggregated";

  return {
    title: readString("title"),
    company_id: readNumber("company_id") != null ? String(readNumber("company_id")) : "",
    client_id: readNumber("client_id") != null ? String(readNumber("client_id")) : "",
    engagement_type,
    commercial_stage,
    pricing_view_mode,
    tag_ids: readNumberArray("tag_ids"),
    work_area_ids: readNumberArray("work_area_ids"),
    include_quote_in_total: readBoolean("include_quote_in_total", true),
    is_primary_quote: readBoolean("is_primary_quote", true),
    display_order: readNumber("display_order") != null ? String(readNumber("display_order")) : "0",
    label: readString("label"),
  };
}

function buildAutomationPayload(form: ContractAutomationFormState): QuoteContractAutomationPayload {
  const displayOrder = Number(form.display_order);
  return {
    title: form.title.trim() || null,
    company_id: form.company_id ? Number(form.company_id) : null,
    client_id: form.client_id ? Number(form.client_id) : null,
    engagement_type: form.engagement_type || null,
    pricing_view_mode: form.pricing_view_mode,
    commercial_stage: form.commercial_stage,
    tag_ids: form.tag_ids,
    work_area_ids: form.work_area_ids,
    include_quote_in_total: form.include_quote_in_total,
    is_primary_quote: form.is_primary_quote,
    display_order: Number.isFinite(displayOrder) ? displayOrder : 0,
    label: form.label.trim() || null,
  };
}

export function ContractsPipelinePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, permissions, activeCompanyId, myCompanies } = useAuth();
  const { selectedCompanyId } = useSelectedCompanyId(activeCompanyId ?? user?.company_id ?? null);
  const toast = useToast();
  const isAdmin = !!permissions?.is_admin;
  const currentCompanyId = selectedCompanyId ?? activeCompanyId ?? user?.company_id ?? null;

  const [clients, setClients] = useState<Client[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadSeq, setReloadSeq] = useState(0);

  const [clientFilter, setClientFilter] = useState("");
  const [stageFilter, setStageFilter] = useState<"" | ContractCommercialStage>("");
  const [entityTypeFilter, setEntityTypeFilter] = useState<PipelineEntityFilter>("all");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [includeDeleted, setIncludeDeleted] = useState(false);

  const [draggingContractId, setDraggingContractId] = useState<number | null>(null);
  const [dropStage, setDropStage] = useState<ContractCommercialStage | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedContractId, setSelectedContractId] = useState<number | null>(null);
  const [lostMoveModalOpen, setLostMoveModalOpen] = useState(false);
  const [lostMoveContractId, setLostMoveContractId] = useState<number | null>(null);
  const [lostMoveNotes, setLostMoveNotes] = useState("");
  const [quoteLostMoveModalOpen, setQuoteLostMoveModalOpen] = useState(false);
  const [lostMoveQuoteId, setLostMoveQuoteId] = useState<number | null>(null);
  const [lostMoveQuoteNotes, setLostMoveQuoteNotes] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [selectedContractIds, setSelectedContractIds] = useState<number[]>([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);
  const [bulkDeleteResult, setBulkDeleteResult] = useState<BulkDeleteResponse | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createQuoteOpen, setCreateQuoteOpen] = useState(false);
  const [editQuoteOpen, setEditQuoteOpen] = useState(false);
  const [editQuoteData, setEditQuoteData] = useState<Quote | null>(null);
  const [editQuoteLoadingId, setEditQuoteLoadingId] = useState<number | null>(null);
  const [createFromQuoteOpen, setCreateFromQuoteOpen] = useState(false);
  const [quoteContractPreviewOpen, setQuoteContractPreviewOpen] = useState(false);
  const [quoteContractPreviewLoading, setQuoteContractPreviewLoading] = useState(false);
  const [quoteContractConfirmLoading, setQuoteContractConfirmLoading] = useState(false);
  const [quoteContractPreviewQuoteId, setQuoteContractPreviewQuoteId] = useState<number | null>(null);
  const [quoteContractPreviewSource, setQuoteContractPreviewSource] = useState<
    QuoteContractAutomationDryRunResponse["quote"] | null
  >(null);
  const [quoteContractPreviewWarnings, setQuoteContractPreviewWarnings] = useState<string[]>([]);
  const [quoteContractForm, setQuoteContractForm] = useState<ContractAutomationFormState | null>(null);
  const [availableWorkTags, setAvailableWorkTags] = useState<WorkTag[]>([]);
  const [availableWorkAreas, setAvailableWorkAreas] = useState<WorkArea[]>([]);
  const [taxonomyLoading, setTaxonomyLoading] = useState(false);
  const [creatingWorkTag, setCreatingWorkTag] = useState(false);
  const [creatingWorkArea, setCreatingWorkArea] = useState(false);
  const [workTagModalOpen, setWorkTagModalOpen] = useState(false);
  const [workAreaModalOpen, setWorkAreaModalOpen] = useState(false);

  const {
    items: pipelineItems,
    isLoading: pipelineLoading,
    error: pipelineError,
    refetch: refetchPipeline,
  } = useCommercialPipeline(
    {
      company_id: currentCompanyId ?? undefined,
      client_id: clientFilter ? Number(clientFilter) : undefined,
      commercial_stage: stageFilter || undefined,
      entity_type: entityTypeFilter,
      include_inactive: includeInactive,
      include_deleted: includeDeleted,
    },
    { enabled: !!currentCompanyId }
  );

  const [displayedItems, setDisplayedItems] = useState<CommercialPipelineItem[]>([]);

  const clientOptions = useMemo(
    () => clients.map((client) => ({
      value: String(client.id),
      label: client.commercial_name ?? client.name,
      keywords: `${client.commercial_name ?? ""} ${client.name} ${client.email ?? ""}`,
    })),
    [clients]
  );

  const clientDisplayNameById = useMemo(() => {
    const map = new Map<number, string>();
    clients.forEach((client) => {
      map.set(client.id, client.commercial_name?.trim() || client.name);
    });
    return map;
  }, [clients]);

  const companyOptions = useMemo(
    () => myCompanies.map((company) => ({
      value: String(company.id),
      label: company.name,
      keywords: `${company.name} ${company.slug}`,
    })),
    [myCompanies]
  );

  const stageOptions = useMemo(
    () => CONTRACT_STAGE_ORDER.map((stage) => ({ value: stage, label: CONTRACT_STAGE_LABELS[stage] })),
    []
  );

  const entityTypeOptions = useMemo(
    () => [
      { value: "all", label: "Tutti i record" },
      { value: "quote", label: "Solo preventivi" },
      { value: "contract", label: "Solo contratti" },
    ],
    []
  );

  const workTagOptions = useMemo(
    () => availableWorkTags.map((tag) => ({ id: tag.id, label: tag.name, color: tag.color })),
    [availableWorkTags]
  );

  const workAreaOptions = useMemo(
    () => availableWorkAreas.map((area) => ({ id: area.id, label: area.name, color: area.color })),
    [availableWorkAreas]
  );

  const updateQuoteContractForm = <K extends keyof ContractAutomationFormState>(
    key: K,
    value: ContractAutomationFormState[K]
  ) => {
    setQuoteContractForm((current) => {
      if (!current) return current;
      return { ...current, [key]: value };
    });
  };

  const handleCreateWorkTag = async (name: string) => {
    const targetCompanyId = quoteContractForm?.company_id ? Number(quoteContractForm.company_id) : currentCompanyId;
    if (!targetCompanyId || !name.trim()) return;
    setCreatingWorkTag(true);
    try {
      const created = await createWorkTagApi({
        company_id: targetCompanyId,
        name: name.trim(),
        color: "#6366f1",
      });
      setAvailableWorkTags((prev) => (prev.some((item) => item.id === created.id) ? prev : [...prev, created]));
      setQuoteContractForm((current) => {
        if (!current) return current;
        return {
          ...current,
          tag_ids: current.tag_ids.includes(created.id) ? current.tag_ids : [...current.tag_ids, created.id],
        };
      });
      toast.success("Tag creato");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore creazione tag");
      throw err;
    } finally {
      setCreatingWorkTag(false);
    }
  };

  const handleCreateWorkArea = async (name: string) => {
    const targetCompanyId = quoteContractForm?.company_id ? Number(quoteContractForm.company_id) : currentCompanyId;
    if (!targetCompanyId || !name.trim()) return;
    setCreatingWorkArea(true);
    try {
      const created = await createWorkAreaApi({
        company_id: targetCompanyId,
        name: name.trim(),
      });
      setAvailableWorkAreas((prev) => (prev.some((item) => item.id === created.id) ? prev : [...prev, created]));
      setQuoteContractForm((current) => {
        if (!current) return current;
        return {
          ...current,
          work_area_ids: current.work_area_ids.includes(created.id)
            ? current.work_area_ids
            : [...current.work_area_ids, created.id],
        };
      });
      toast.success("Area creata");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore creazione area");
      throw err;
    } finally {
      setCreatingWorkArea(false);
    }
  };


  const pipelineByStage = useMemo(() => {
    const groups = new Map<ContractCommercialStage, CommercialPipelineItem[]>();
    CONTRACT_STAGE_ORDER.forEach((stage) => groups.set(stage, []));
    displayedItems.forEach((item) => {
      const bucket = groups.get(item.commercial_stage);
      if (bucket) bucket.push(item);
    });
    return groups;
  }, [displayedItems]);

  useEffect(() => {
    setDisplayedItems(pipelineItems);
  }, [pipelineItems]);

  useEffect(() => {
    const visibleContractIds = new Set(displayedItems.filter((item) => item.entity_type === "contract").map((item) => item.id));
    setSelectedContractIds((current) => current.filter((id) => visibleContractIds.has(id)));
  }, [displayedItems]);

  useEffect(() => {
    if (!currentCompanyId) {
      setClients([]);
      setClientsLoading(false);
      return;
    }

    let active = true;
    setClientsLoading(true);
    void getClientsApi({ company_id: currentCompanyId, per_page: 500 })
      .then((clientData) => {
        if (active) setClients(clientData.data);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Errore caricamento clienti");
      })
      .finally(() => {
        if (!active) return;
        setClientsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [currentCompanyId, reloadSeq]);

  useEffect(() => {
    if (!quoteContractPreviewOpen) return;
    const targetCompanyId = quoteContractForm?.company_id ? Number(quoteContractForm.company_id) : currentCompanyId;
    if (!targetCompanyId) {
      setAvailableWorkTags([]);
      setAvailableWorkAreas([]);
      return;
    }

    let cancelled = false;
    setTaxonomyLoading(true);
    Promise.all([
      listWorkTagsApi({ company_id: targetCompanyId }),
      listWorkAreasApi({ company_id: targetCompanyId }),
    ])
      .then(([tags, areas]) => {
        if (cancelled) return;
        setAvailableWorkTags(tags);
        setAvailableWorkAreas(areas);
      })
      .catch((err) => {
        if (cancelled) return;
        setAvailableWorkTags([]);
        setAvailableWorkAreas([]);
        toast.error(err instanceof Error ? err.message : "Errore caricamento tag e aree");
      })
      .finally(() => {
        if (cancelled) return;
        setTaxonomyLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentCompanyId, quoteContractForm?.company_id, quoteContractPreviewOpen, toast]);

  useEffect(() => {
    const tagSet = new Set(workTagOptions.map((option) => option.id));
    const areaSet = new Set(workAreaOptions.map((option) => option.id));
    setQuoteContractForm((current) => {
      if (!current) return current;
      return {
        ...current,
        tag_ids: current.tag_ids.filter((id) => tagSet.has(id)),
        work_area_ids: current.work_area_ids.filter((id) => areaSet.has(id)),
      };
    });
  }, [workAreaOptions, workTagOptions]);

  const reload = () => setReloadSeq((n) => n + 1);
  const reloadPipeline = () => {
    refetchPipeline();
    reload();
  };

  const openDetail = (contractId: number) => {
    setSelectedContractId(contractId);
    setDetailOpen(true);
  };

  useEffect(() => {
    const rawContractId = searchParams.get("open_contract_id");
    if (!rawContractId) return;
    const contractId = Number(rawContractId);
    if (!Number.isInteger(contractId) || contractId <= 0) return;

    openDetail(contractId);

    const next = new URLSearchParams(searchParams);
    next.delete("open_contract_id");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const executeContractStageMove = async (contractId: number, toStage: ContractCommercialStage, notes?: string | null) => {
    const current = displayedItems.find((item) => item.entity_type === "contract" && item.id === contractId);
    if (!current || current.commercial_stage === toStage) return;

    setDisplayedItems((items) =>
      items.map((item) =>
        item.entity_type === "contract" && item.id === contractId
          ? { ...item, commercial_stage: toStage, updated_at: new Date().toISOString() }
          : item
      )
    );
    setActionLoadingId(contractId);
    try {
      await moveContractStageApi(contractId, {
        to_stage: toStage,
        notes: notes?.trim() ? notes.trim() : null,
      });
      toast.success(`Contratto spostato in ${CONTRACT_STAGE_LABELS[toStage]}`);
    } catch (err) {
      setDisplayedItems((items) =>
        items.map((item) =>
          item.entity_type === "contract" && item.id === contractId
            ? { ...item, commercial_stage: current.commercial_stage, updated_at: current.updated_at }
            : item
        )
      );
      toast.error(err instanceof Error ? err.message : "Errore spostamento stage");
    } finally {
      setActionLoadingId(null);
      setDropStage(null);
    }
  };

  const openQuoteContractPreview = async (quoteId: number, acceptBeforePreview: boolean) => {
    setQuoteContractPreviewLoading(true);
    setQuoteContractPreviewQuoteId(quoteId);
    try {
      const response = acceptBeforePreview
        ? await acceptAndContractDryRunApi(quoteId)
        : await contractAutomationDryRunApi(quoteId);

      setQuoteContractPreviewSource(response.quote);
      setQuoteContractPreviewWarnings(response.warnings ?? []);
      setQuoteContractForm(toAutomationForm(response));
      setQuoteContractPreviewOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossibile preparare l'anteprima del contratto");
    } finally {
      setQuoteContractPreviewLoading(false);
    }
  };

  const executeQuoteStageMove = async (
    item: CommercialPipelineItem,
    toStage: ContractCommercialStage,
    notes?: string | null,
    skipLossPrompt = false
  ) => {
    const toStatus = pipelineStageToQuoteStatus(toStage);
    if (!toStatus || !QUOTE_PIPELINE_TARGET_STAGES.has(toStage)) {
      toast.error("I preventivi possono essere spostati solo in Bozza, Inviato, In trattativa, Accettato o Perso");
      setDropStage(null);
      return;
    }

    const currentStatus = getQuoteCurrentStatus(item);
    if (!currentStatus) {
      toast.error("Impossibile determinare lo stato attuale del preventivo");
      setDropStage(null);
      return;
    }

    if (toStatus === "accettato") {
      await openQuoteContractPreview(item.id, currentStatus !== "accettato");
      setDropStage(null);
      return;
    }

    if (toStatus === "perso" && !skipLossPrompt) {
      setLostMoveQuoteId(item.id);
      setLostMoveQuoteNotes("");
      setQuoteLostMoveModalOpen(true);
      setDropStage(null);
      return;
    }

    if (currentStatus === toStatus) {
      setDropStage(null);
      return;
    }

    const allowedTargets = QUOTE_TRANSITIONS[currentStatus] ?? [];
    if (!allowedTargets.includes(toStatus)) {
      toast.error(`Transizione non consentita: ${currentStatus} -> ${toStatus}`);
      setDropStage(null);
      return;
    }

    setDisplayedItems((items) =>
      items.map((entry) =>
        entry.entity_type === "quote" && entry.id === item.id
          ? {
              ...entry,
              commercial_stage: toStage,
              source_status: toStatus,
              updated_at: new Date().toISOString(),
            }
          : entry
      )
    );
    setActionLoadingId(item.id);
    try {
      await updateQuoteStatusApi(item.id, toStatus as Parameters<typeof updateQuoteStatusApi>[1], notes ?? null);
      toast.success(`Preventivo spostato in ${CONTRACT_STAGE_LABELS[toStage]}`);
    } catch (err) {
      setDisplayedItems((items) =>
        items.map((entry) =>
          entry.entity_type === "quote" && entry.id === item.id
            ? {
                ...entry,
                commercial_stage: item.commercial_stage,
                source_status: item.source_status,
                updated_at: item.updated_at,
              }
            : entry
        )
      );
      toast.error(err instanceof Error ? err.message : "Errore spostamento preventivo");
    } finally {
      setActionLoadingId(null);
      setDropStage(null);
    }
  };

  const handleContractStageMove = async (contractId: number, toStage: ContractCommercialStage) => {
    if (toStage === "perso") {
      setLostMoveContractId(contractId);
      setLostMoveNotes("");
      setLostMoveModalOpen(true);
      setDropStage(null);
      return;
    }

    await executeContractStageMove(contractId, toStage);
  };

  const handlePipelineDrop = async (payload: DragPayload, toStage: ContractCommercialStage) => {
    try {
      if (payload.entity_type === "contract") {
        await handleContractStageMove(payload.id, toStage);
        return;
      }

      const quoteItem = displayedItems.find((item) => item.entity_type === "quote" && item.id === payload.id);
      if (!quoteItem) {
        toast.error("Preventivo non trovato nella board corrente");
        return;
      }

      await executeQuoteStageMove(quoteItem, toStage);
    } finally {
      setDraggingContractId(null);
    }
  };

  const confirmMoveToLost = async (withNotes: boolean) => {
    if (!lostMoveContractId) return;
    const notes = withNotes ? lostMoveNotes : null;
    await executeContractStageMove(lostMoveContractId, "perso", notes);
    setLostMoveModalOpen(false);
    setLostMoveContractId(null);
    setLostMoveNotes("");
  };

  const confirmQuoteMoveToLost = async (withNotes: boolean) => {
    if (!lostMoveQuoteId) return;
    const item = displayedItems.find((entry) => entry.entity_type === "quote" && entry.id === lostMoveQuoteId);
    if (!item) return;
    const notes = withNotes ? lostMoveQuoteNotes : null;
    await executeQuoteStageMove(item, "perso", notes, true);
    setQuoteLostMoveModalOpen(false);
    setLostMoveQuoteId(null);
    setLostMoveQuoteNotes("");
  };

  const handleAdvance = async (contractId: number) => {
    const current = displayedItems.find((item) => item.entity_type === "contract" && item.id === contractId);
    if (!current) return;

    setActionLoadingId(contractId);
    try {
      const updated = await advanceContractStageApi(contractId);
      setDisplayedItems((items) =>
        items.map((item) =>
          item.entity_type === "contract" && item.id === contractId
            ? {
                ...item,
                commercial_stage: updated.commercial_stage,
                updated_at: updated.updated_at,
              }
            : item
        )
      );
      toast.success("Stage avanzato");
    } catch (err) {
      setDisplayedItems((items) =>
        items.map((item) =>
          item.entity_type === "contract" && item.id === contractId
            ? {
                ...item,
                commercial_stage: current.commercial_stage,
                updated_at: current.updated_at,
              }
            : item
        )
      );
      toast.error(err instanceof Error ? err.message : "Errore avanzamento stage");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRegress = async (contractId: number) => {
    const current = displayedItems.find((item) => item.entity_type === "contract" && item.id === contractId);
    if (!current) return;

    setActionLoadingId(contractId);
    try {
      const updated = await regressContractStageApi(contractId);
      setDisplayedItems((items) =>
        items.map((item) =>
          item.entity_type === "contract" && item.id === contractId
            ? {
                ...item,
                commercial_stage: updated.commercial_stage,
                updated_at: updated.updated_at,
              }
            : item
        )
      );
      toast.success("Stage retrocesso");
    } catch (err) {
      setDisplayedItems((items) =>
        items.map((item) =>
          item.entity_type === "contract" && item.id === contractId
            ? {
                ...item,
                commercial_stage: current.commercial_stage,
                updated_at: current.updated_at,
              }
            : item
        )
      );
      toast.error(err instanceof Error ? err.message : "Errore retrocessione stage");
    } finally {
      setActionLoadingId(null);
    }
  };

  const closeQuoteContractPreview = () => {
    if (quoteContractPreviewLoading) return;
    setQuoteContractPreviewOpen(false);
    setQuoteContractPreviewQuoteId(null);
    setQuoteContractPreviewSource(null);
    setQuoteContractPreviewWarnings([]);
    setQuoteContractForm(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      if (deleteTarget.entity_type === "contract") {
        await deleteContractApi(deleteTarget.id);
      } else {
        await deleteQuoteApi(deleteTarget.id);
      }

      setDisplayedItems((items) =>
        items.filter((item) => !(item.entity_type === deleteTarget.entity_type && item.id === deleteTarget.id))
      );
      toast.success(deleteTarget.entity_type === "contract" ? "Contratto archiviato" : "Preventivo archiviato");
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore archiviazione");
    } finally {
      setDeleteLoading(false);
    }
  };

  const confirmQuoteContractCreation = async () => {
    if (!quoteContractPreviewQuoteId || !quoteContractForm) return;
    setQuoteContractConfirmLoading(true);
    try {
      const created = await confirmQuoteContractAutomationApi(
        quoteContractPreviewQuoteId,
        buildAutomationPayload(quoteContractForm)
      );
      toast.success("Contratto creato dal preventivo");
      closeQuoteContractPreview();
      refetchPipeline();
      setSelectedContractId(created.id);
      setDetailOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore creazione contratto da preventivo");
    } finally {
      setQuoteContractConfirmLoading(false);
    }
  };

  const toggleContractSelection = (contractId: number, checked: boolean) => {
    setSelectedContractIds((current) => {
      if (checked) return Array.from(new Set([...current, contractId]));
      return current.filter((id) => id !== contractId);
    });
  };

  const handleBulkDeleteContracts = async () => {
    if (selectedContractIds.length === 0) return;
    setBulkDeleteLoading(true);
    try {
      const response = await bulkDeleteContractsApi(selectedContractIds);
      setBulkDeleteOpen(false);
      setBulkDeleteResult(response);
      setSelectedContractIds([]);
      setDisplayedItems((items) =>
        items.filter((item) => !(item.entity_type === "contract" && response.deleted_ids.includes(item.id)))
      );
      toast.success(`Eliminati ${response.deleted_ids.length} su ${response.requested}`);
      refetchPipeline();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore eliminazione bulk contratti");
    } finally {
      setBulkDeleteLoading(false);
    }
  };

  const handleOpenEditQuote = async (quoteId: number) => {
    setEditQuoteLoadingId(quoteId);
    try {
      const quote = await getQuoteApi(quoteId);
      setEditQuoteData(quote);
      setEditQuoteOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore apertura modifica preventivo");
    } finally {
      setEditQuoteLoadingId(null);
    }
  };

  const boardTotal = displayedItems.reduce((acc, item) => acc + (item.pricing?.selected_total ?? 0), 0);
  const boardMonthly = displayedItems.reduce((acc, item) => acc + (item.pricing?.selected_monthly ?? 0), 0);
  const boardOneTime = displayedItems.reduce((acc, item) => acc + (item.pricing?.selected_one_time ?? 0), 0);
  const isLoading = pipelineLoading;
  const boardError = error ?? pipelineError;

  return (
    <div className="px-10 py-8 pb-20 max-w-[1440px] mx-auto w-full animate-fadeIn">
      <PageSectionHeader
        eyebrow="Contratti"
        eyebrowIcon={<Icon name="document-text" className="w-3.5 h-3.5" />}
        title="Pipeline commerciale"
        lead={isLoading ? "Caricamento in corso..." : `${displayedItems.length} elementi · Tot ${formatEur(boardTotal)} · Mese ${formatEur(boardMonthly)} · Una tantum ${formatEur(boardOneTime)}`}
        actions={isAdmin ? (
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setCreateOpen(true)}
              leftIcon={<Icon name="plus" className="w-4 h-4" />}
            >
              Nuovo contratto
            </Button>
          </div>
        ) : null}
      />

      <div className="flex flex-wrap items-center gap-3 mb-3">
          <SearchableSelect
            className="w-52"
            value={clientFilter}
            onChange={(value) => setClientFilter(value)}
            options={[{ value: "", label: clientsLoading ? "Caricamento clienti..." : "Tutti i clienti" }, ...clientOptions]}
            placeholder={clientsLoading ? "Caricamento clienti..." : "Filtra cliente"}
            disabled={clientsLoading}
          />

          <SearchableSelect
            className="w-52"
            value={stageFilter}
            onChange={(value) => setStageFilter(value as "" | ContractCommercialStage)}
            options={[{ value: "", label: "Tutti gli stage" }, ...stageOptions]}
            placeholder="Filtra stage"
          />

          <SearchableSelect
            className="w-52"
            value={entityTypeFilter}
            onChange={(value) => setEntityTypeFilter(value as PipelineEntityFilter)}
            options={entityTypeOptions}
            placeholder="Filtra tipo"
          />

          <label className="inline-flex items-center gap-2 rounded-md border border-line dark:border-line-dark px-3 py-2.5 text-sm text-ink dark:text-paper">
            <Checkbox checked={includeInactive} onChange={setIncludeInactive} />
            Include inattivi
          </label>

          <label className="inline-flex items-center gap-2 rounded-md border border-line dark:border-line-dark px-3 py-2.5 text-sm text-ink dark:text-paper">
            <Checkbox checked={includeDeleted} onChange={setIncludeDeleted} />
            Include eliminati
          </label>

          <Button variant="ghost" onClick={reloadPipeline} leftIcon={<Icon name="refresh-cw" className="w-4 h-4" />}>
            Aggiorna
          </Button>

          {isAdmin && (
            <Button
              variant="danger-ghost"
              onClick={() => setBulkDeleteOpen(true)}
              leftIcon={<Icon name="trash" className="w-4 h-4" />}
              disabled={selectedContractIds.length === 0}
            >
              Elimina contratti selezionati ({selectedContractIds.length})
            </Button>
          )}
      </div>

      {boardError && (
        <div className="mb-4 rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
          {boardError}
        </div>
      )}

      {isLoading ? (
        <div className="py-10 flex items-center justify-center">
          <Spinner size="md" />
        </div>
      ) : (
        <div className="overflow-x-auto p-1">
          <div className="flex items-start gap-3 w-max min-w-full">
            {CONTRACT_STAGE_ORDER.map((stage) => {
              const items = pipelineByStage.get(stage) ?? [];
              const stageTotal = items.reduce((acc, contract) => acc + (contract.pricing?.selected_total ?? 0), 0);
              const stageMonthly = items.reduce((acc, contract) => acc + (contract.pricing?.selected_monthly ?? 0), 0);
              const stageOneTime = items.reduce((acc, contract) => acc + (contract.pricing?.selected_one_time ?? 0), 0);
              const isDropTarget = dropStage === stage;

              return (
                <div key={stage} className="w-[320px] flex-none">
                <KanbanColumnShell
                  label={CONTRACT_STAGE_LABELS[stage]}
                  count={items.length}
                  minHeightClassName="min-h-[520px]"
                  isDropTarget={isDropTarget}
                  className=""
                  headerClassName={`border-b dark:border-line-dark ${stageTone(stage)}`}
                  bodyClassName="p-2"
                  onDragOver={(event) => {
                    if (!isAdmin) return;
                    event.preventDefault();
                    setDropStage(stage);
                  }}
                  onDragLeave={() => {
                    if (!isAdmin) return;
                    setDropStage((current) => (current === stage ? null : current));
                  }}
                  onDrop={(event) => {
                    if (!isAdmin) return;
                    event.preventDefault();
                    setDraggingContractId(null);
                    const raw = event.dataTransfer.getData("text/plain");
                    const payload = parsePipelineDropPayload(raw);
                    if (!payload) return;
                    void handlePipelineDrop(payload, stage);
                  }}
                >
                  <div className="mb-1 px-1.5 text-xs text-muted dark:text-muted-dark">Tot {formatEur(stageTotal)}</div>
                  <div className="mb-2 px-1.5 text-[11px] text-muted dark:text-muted-dark">Mese {formatEur(stageMonthly)} · Una tantum {formatEur(stageOneTime)}</div>
                  <div className="space-y-2 flex-1">
                    {stage === "bozza" && isAdmin && (
                      <div className="space-y-2">
                        <button
                          type="button"
                          onClick={() => setCreateQuoteOpen(true)}
                          className="w-full rounded-lg border border-dashed border-success/40 bg-success/5 px-3 py-3 text-left transition-colors hover:bg-success/10"
                        >
                          <div className="flex items-center gap-2">
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-success/15 text-success">
                              <Icon name="plus" className="w-3.5 h-3.5" />
                            </span>
                            <span className="text-sm font-semibold text-ink dark:text-paper">Nuovo preventivo</span>
                          </div>
                          <p className="mt-1 text-xs text-muted dark:text-muted-dark">
                            Crea rapidamente un preventivo senza uscire dalla pipeline.
                          </p>
                        </button>

                        <button
                          type="button"
                          onClick={() => setCreateFromQuoteOpen(true)}
                          className="w-full rounded-lg border border-dashed border-info/40 bg-info/5 px-3 py-3 text-left transition-colors hover:bg-info/10"
                        >
                          <div className="flex items-center gap-2">
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-info/15 text-info">
                              <Icon name="plus" className="w-3.5 h-3.5" />
                            </span>
                            <span className="text-sm font-semibold text-ink dark:text-paper">Genera contratto da preventivo</span>
                          </div>
                          <p className="mt-1 text-xs text-muted dark:text-muted-dark">
                            Anteprima guidata, avvisi e conferma finale senza uscire dalla pipeline.
                          </p>
                        </button>
                      </div>
                    )}

                    {items.length === 0 && (
                      <div className="rounded-md border border-dashed border-line dark:border-line-dark px-2 py-3 text-center text-xs text-muted dark:text-muted-dark">
                        Nessun elemento
                      </div>
                    )}

                    {items.map((item) => (
                      (() => {
                        const clientLabel = item.client_id != null
                          ? (clientDisplayNameById.get(item.client_id) ?? `Cliente #${item.client_id}`)
                          : "Cliente non associato";

                        return (
                      <button
                        key={`${item.entity_type}-${item.id}`}
                        type="button"
                        draggable={isAdmin}
                        onDragStart={(event) => {
                          if (!isAdmin) return;
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", JSON.stringify({
                            entity_type: item.entity_type,
                            id: item.id,
                          }));
                          setDraggingContractId(item.id);
                        }}
                        onDragEnd={() => {
                          if (!isAdmin) return;
                          setDraggingContractId(null);
                          setDropStage(null);
                        }}
                        onClick={() => {
                          if (item.entity_type === "contract") {
                            void openDetail(item.id);
                          }
                        }}
                        className={`group w-full text-left rounded-lg border border-line dark:border-line-dark bg-paper dark:bg-[#131316] p-3 transition-all hover:-translate-y-px hover:shadow-md hover:border-ink/30 dark:hover:border-paper/30 ${draggingContractId === item.id ? "opacity-60" : ""}`}
                      >
                          {isAdmin && item.entity_type === "contract" && (
                            <div className="mb-2" onClick={(event) => event.stopPropagation()}>
                              <label className="inline-flex items-center gap-2 text-[11px] font-semibold text-muted dark:text-muted-dark">
                                <Checkbox
                                  checked={selectedContractIds.includes(item.id)}
                                  onChange={(checked) => toggleContractSelection(item.id, checked)}
                                />
                                Seleziona
                              </label>
                            </div>
                          )}

                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex items-center gap-1.5">
                              <span className="shrink-0 font-variant-numeric text-[10px] tabular-nums text-muted dark:text-muted-dark">#{String(item.id).padStart(3, "0")}</span>
                              <span
                                className="truncate max-w-[170px] text-[11px] text-muted dark:text-muted-dark"
                                title={clientLabel}
                              >
                                {clientLabel}
                              </span>
                            </div>
                            <Badge variant={item.entity_type === "quote" ? "info" : "default"}>
                              {item.entity_type === "quote" ? "Preventivo" : "Contratto"}
                            </Badge>
                          </div>

                          <div className="mt-1 flex items-start justify-between gap-2">
                          <div className="text-sm font-semibold text-ink dark:text-paper line-clamp-2">{item.title}</div>
                          <Badge variant={item.pricing.mode === "single_quote" ? "info" : "default"}>
                            {item.pricing.mode === "single_quote" ? "single" : "agg"}
                          </Badge>
                        </div>

                        <div className="mt-1 text-xs text-muted dark:text-muted-dark">
                          {item.entity_type === "quote"
                            ? `${item.source_number ?? "Preventivo"}${item.source_status ? ` · ${item.source_status}` : ""}`
                            : `${item.contract_type} · ${item.engagement_type}`}
                        </div>

                        {((item.tags?.length ?? 0) > 0 || (item.work_areas?.length ?? 0) > 0) && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {(item.work_areas ?? []).map((area) => (
                              <span
                                key={`area-${item.id}-${area.id}`}
                                className="inline-flex items-center rounded-pill border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                                style={area.color ? { borderColor: `${area.color}55`, color: area.color, backgroundColor: `${area.color}1A` } : undefined}
                              >
                                {area.name}
                              </span>
                            ))}
                            {(item.tags ?? []).map((tag) => (
                              <span
                                key={`tag-${item.id}-${tag.id}`}
                                className="inline-flex items-center rounded-pill border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                                style={tag.color ? { borderColor: `${tag.color}55`, color: tag.color, backgroundColor: `${tag.color}1A` } : undefined}
                              >
                                #{tag.name}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="mt-2 text-sm font-semibold text-ink dark:text-paper">
                          {formatEur(item.pricing.selected_total)}
                        </div>

                        <div className="mt-0.5 text-[11px] text-muted dark:text-muted-dark">
                          Mese {formatEur(item.pricing.selected_monthly ?? 0)} · Una tantum {formatEur(item.pricing.selected_one_time ?? 0)}
                        </div>

                        <div className="mt-2 text-[10px] uppercase tracking-wider text-muted dark:text-muted-dark">
                          Aggiornato {new Date(item.updated_at).toLocaleDateString("it-IT")}
                        </div>

                        {isAdmin && item.entity_type === "contract" && (
                          <div className="mt-2 flex items-center gap-2">
                            <button
                              type="button"
                              title="Indietro"
                              aria-label="Indietro"
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleRegress(item.id);
                              }}
                              className={CARD_ICON_ACTION_CLASS}
                              disabled={actionLoadingId === item.id}
                            >
                              <Icon name="chevron-right" className="h-4 w-4 rotate-180" />
                            </button>
                            <button
                              type="button"
                              title="Avanti"
                              aria-label="Avanti"
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleAdvance(item.id);
                              }}
                              className={CARD_ICON_ACTION_CLASS}
                              disabled={actionLoadingId === item.id}
                            >
                              <Icon name="chevron-right" className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              title="Archivia"
                              aria-label="Archivia"
                              onClick={(event) => {
                                event.stopPropagation();
                                setDeleteTarget({
                                  entity_type: "contract",
                                  id: item.id,
                                  title: item.title,
                                });
                              }}
                              className={CARD_ICON_DANGER_ACTION_CLASS}
                              disabled={actionLoadingId === item.id}
                            >
                              <Icon name="trash" className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}

                        {isAdmin && item.entity_type === "quote" && (
                          <div className="mt-2 flex items-center gap-2">
                            {(() => {
                              const quoteStatus = getQuoteCurrentStatus(item);
                              const { previous, next } = getQuoteArrowTargets(item);

                              if (quoteStatus === "in_trattativa") {
                                return (
                                  <>
                                    <button
                                      type="button"
                                      title="Visualizza preventivo"
                                      aria-label="Visualizza preventivo"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        void handleOpenEditQuote(item.id);
                                      }}
                                      className={CARD_ICON_ACTION_CLASS}
                                      disabled={editQuoteLoadingId === item.id}
                                    >
                                      <Icon name="eye" className="h-4 w-4" />
                                    </button>
                                    <div className="group/quote-branch relative py-5 -my-5">
                                      <button
                                        type="button"
                                        className={QUOTE_BRANCH_ACTION_CLASS}
                                        onClick={(event) => event.stopPropagation()}
                                      >
                                        Esito
                                      </button>

                                      <div className="pointer-events-none absolute left-full top-1/2 z-10 ml-2 h-32 w-44 -translate-y-1/2">
                                        <div className="absolute left-0 top-1/2 h-px w-7 -translate-y-1/2 origin-left scale-x-0 bg-line transition-transform duration-200 group-hover/quote-branch:scale-x-100 dark:bg-line-dark" />

                                        <div className="absolute left-7 top-1/2 flex -translate-y-11 items-center">
                                          <div className="h-7 w-8 -translate-y-0.5 rounded-tr-[999px] border-r border-t border-success/60 opacity-0 transition-opacity duration-150 delay-75 group-hover/quote-branch:opacity-100" />
                                          <button
                                            type="button"
                                            className="pointer-events-auto ml-2 inline-flex items-center rounded-md border border-success/30 bg-paper px-2.5 py-1 text-[11px] font-semibold text-success opacity-0 translate-x-2 transition-all duration-200 delay-200 hover:bg-success/10 group-hover/quote-branch:translate-x-0 group-hover/quote-branch:opacity-100 dark:bg-[#131316]"
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              void openQuoteContractPreview(item.id, true);
                                            }}
                                            disabled={quoteContractPreviewLoading && quoteContractPreviewQuoteId === item.id}
                                          >
                                            Accettato
                                          </button>
                                        </div>

                                        <div className="absolute left-7 top-1/2 flex -translate-y-1/2 items-center">
                                          <div className="h-px w-8 bg-info/60 opacity-0 transition-opacity duration-150 delay-75 group-hover/quote-branch:opacity-100" />
                                          <button
                                            type="button"
                                            className="pointer-events-auto ml-2 inline-flex items-center rounded-md border border-info/30 bg-paper px-2.5 py-1 text-[11px] font-semibold text-info opacity-0 translate-x-2 transition-all duration-200 delay-200 hover:bg-info/10 group-hover/quote-branch:translate-x-0 group-hover/quote-branch:opacity-100 dark:bg-[#131316]"
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              void handleOpenEditQuote(item.id);
                                            }}
                                            disabled={editQuoteLoadingId === item.id}
                                          >
                                            Modifica
                                          </button>
                                        </div>

                                        <div className="absolute left-7 top-1/2 flex translate-y-4 items-center">
                                          <div className="h-7 w-8 translate-y-0.5 rounded-br-[999px] border-b border-r border-danger/60 opacity-0 transition-opacity duration-150 delay-75 group-hover/quote-branch:opacity-100" />
                                          <button
                                            type="button"
                                            className="pointer-events-auto ml-2 inline-flex items-center rounded-md border border-danger/30 bg-paper px-2.5 py-1 text-[11px] font-semibold text-danger opacity-0 translate-x-2 transition-all duration-200 delay-200 hover:bg-danger/10 group-hover/quote-branch:translate-x-0 group-hover/quote-branch:opacity-100 dark:bg-[#131316]"
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              void executeQuoteStageMove(item, "perso");
                                            }}
                                            disabled={actionLoadingId === item.id}
                                          >
                                            Perso
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  </>
                                );
                              }

                              return (
                                <>
                                  <button
                                    type="button"
                                    title="Visualizza preventivo"
                                    aria-label="Visualizza preventivo"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void handleOpenEditQuote(item.id);
                                    }}
                                    className={CARD_ICON_ACTION_CLASS}
                                    disabled={editQuoteLoadingId === item.id}
                                  >
                                    <Icon name="eye" className="h-4 w-4" />
                                  </button>
                                  {previous && (
                                    <button
                                      type="button"
                                      title="Indietro"
                                      aria-label="Indietro"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        void executeQuoteStageMove(item, previous as ContractCommercialStage);
                                      }}
                                      className={CARD_ICON_ACTION_CLASS}
                                      disabled={actionLoadingId === item.id}
                                    >
                                      <Icon name="chevron-right" className="h-4 w-4 rotate-180" />
                                    </button>
                                  )}
                                  {next && (
                                    <button
                                      type="button"
                                      title="Avanti"
                                      aria-label="Avanti"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        void executeQuoteStageMove(item, next as ContractCommercialStage);
                                      }}
                                      className={CARD_ICON_ACTION_CLASS}
                                      disabled={actionLoadingId === item.id}
                                    >
                                      <Icon name="chevron-right" className="h-4 w-4" />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    title="Archivia"
                                    aria-label="Archivia"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setDeleteTarget({
                                        entity_type: "quote",
                                        id: item.id,
                                        title: item.title,
                                        source_number: item.source_number,
                                      });
                                    }}
                                    className={CARD_ICON_DANGER_ACTION_CLASS}
                                    disabled={actionLoadingId === item.id}
                                  >
                                    <Icon name="trash" className="h-3.5 w-3.5" />
                                  </button>
                                </>
                              );
                            })()}
                          </div>
                        )}
                      </button>
                        );
                      })()
                    ))}
                  </div>
                </KanbanColumnShell>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!isLoading && (
        <p className="mt-4 text-center text-[11px] text-muted dark:text-muted-dark">
          Trascina una card tra le colonne per cambiare stage.
        </p>
      )}

      <ContractDetailModal
        open={detailOpen}
        contractId={selectedContractId}
        companyId={currentCompanyId}
        isAdmin={isAdmin}
        onClose={() => {
          setDetailOpen(false);
          setSelectedContractId(null);
        }}
        onContractUpdated={(updated) => {
          // Only contract cards can reach this modal, so the update stays contract-scoped.
          void updated;
          refetchPipeline();
        }}
      />

      <Modal
        open={quoteContractPreviewOpen}
        onClose={closeQuoteContractPreview}
        title="Anteprima creazione contratto da preventivo"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={closeQuoteContractPreview} disabled={quoteContractConfirmLoading}>
              Annulla
            </Button>
            <Button onClick={() => void confirmQuoteContractCreation()} loading={quoteContractConfirmLoading}>
              Crea contratto
            </Button>
          </>
        }
      >
        {!quoteContractForm ? (
          <div className="py-8 flex items-center justify-center">
            <Spinner size="md" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-md border border-line dark:border-line-dark bg-cream/60 dark:bg-[#1a1a1d] px-3 py-2 text-xs text-muted dark:text-muted-dark">
              Preventivo origine: <strong>{quoteContractPreviewSource?.number ?? `#${quoteContractPreviewQuoteId ?? "-"}`}</strong>
              {quoteContractPreviewSource?.status ? ` · Stato ${quoteContractPreviewSource.status}` : ""}
            </div>

            {quoteContractPreviewWarnings.length > 0 && (
              <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                <div className="font-semibold mb-1">Attenzioni da verificare</div>
                <ul className="list-disc pl-4 space-y-0.5">
                  {quoteContractPreviewWarnings.map((warning, index) => (
                    <li key={`${index}-${warning}`}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input
                label="Titolo"
                value={quoteContractForm.title}
                onChange={(event) => updateQuoteContractForm("title", event.target.value)}
              />

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Azienda</label>
                <SearchableSelect
                  value={quoteContractForm.company_id}
                  onChange={(value) => updateQuoteContractForm("company_id", value)}
                  options={companyOptions}
                  placeholder="Seleziona azienda"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Cliente</label>
                <ClientSelectorWithCreate
                  value={quoteContractForm.client_id}
                  onChange={(value) => updateQuoteContractForm("client_id", value)}
                  clients={clients}
                  companyId={quoteContractForm.company_id ? Number(quoteContractForm.company_id) : currentCompanyId}
                  placeholder="Seleziona cliente"
                  includeEmptyOption
                  emptyOptionLabel="Nessun cliente"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Tipo rapporto</label>
                <SearchableSelect
                  value={quoteContractForm.engagement_type}
                  onChange={(value) => updateQuoteContractForm("engagement_type", value as "" | ContractEngagementType)}
                  options={[
                    { value: "", label: "Non impostato" },
                    { value: "one_time", label: "Una tantum" },
                    { value: "ongoing", label: "Continuativo" },
                  ]}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Stage commerciale</label>
                <SearchableSelect
                  value={quoteContractForm.commercial_stage}
                  onChange={(value) => updateQuoteContractForm("commercial_stage", value as ContractCommercialStage)}
                  options={stageOptions}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Modalita pricing</label>
                <SearchableSelect
                  value={quoteContractForm.pricing_view_mode}
                  onChange={(value) => updateQuoteContractForm("pricing_view_mode", value as ContractPricingMode)}
                  options={[
                    { value: "aggregated", label: "Aggregated" },
                    { value: "single_quote", label: "Single quote" },
                  ]}
                />
              </div>

              <Input
                label="Ordine visualizzazione"
                type="number"
                value={quoteContractForm.display_order}
                onChange={(event) => updateQuoteContractForm("display_order", event.target.value)}
              />

              <Input
                label="Label collegamento"
                value={quoteContractForm.label}
                onChange={(event) => updateQuoteContractForm("label", event.target.value)}
                placeholder="Es. Offerta principale"
              />

              <label className="inline-flex items-center gap-2 rounded-md border border-line dark:border-line-dark px-3 py-2.5 text-sm text-ink dark:text-paper">
                <Checkbox
                  checked={quoteContractForm.include_quote_in_total}
                  onChange={(value) => updateQuoteContractForm("include_quote_in_total", value)}
                />
                Includi il preventivo nel totale
              </label>

              <label className="inline-flex items-center gap-2 rounded-md border border-line dark:border-line-dark px-3 py-2.5 text-sm text-ink dark:text-paper">
                <Checkbox
                  checked={quoteContractForm.is_primary_quote}
                  onChange={(value) => updateQuoteContractForm("is_primary_quote", value)}
                />
                Imposta come preventivo principale
              </label>

              <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                <MultiSelect
                  label="work areas"
                  value={quoteContractForm.work_area_ids}
                  onChange={(value) => updateQuoteContractForm("work_area_ids", value)}
                  options={workAreaOptions}
                  placeholder={taxonomyLoading ? "Caricamento aree..." : "Seleziona aree"}
                  onCreateClick={isAdmin ? () => setWorkAreaModalOpen(true) : undefined}
                  onCreateOption={isAdmin ? handleCreateWorkArea : undefined}
                  createLoading={creatingWorkArea}
                  createActionLabel="Crea area"
                />
                <MultiSelect
                  label="tags"
                  value={quoteContractForm.tag_ids}
                  onChange={(value) => updateQuoteContractForm("tag_ids", value)}
                  options={workTagOptions}
                  placeholder={taxonomyLoading ? "Caricamento tag..." : "Seleziona tag"}
                  onCreateClick={isAdmin ? () => setWorkTagModalOpen(true) : undefined}
                  onCreateOption={isAdmin ? handleCreateWorkTag : undefined}
                  createLoading={creatingWorkTag}
                  createActionLabel="Crea tag"
                />
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={deleteTarget != null}
        onClose={() => {
          if (deleteLoading) return;
          setDeleteTarget(null);
        }}
        title={deleteTarget?.entity_type === "contract" ? "Archivia contratto" : "Archivia preventivo"}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)} disabled={deleteLoading}>
              Annulla
            </Button>
            <Button variant="danger" onClick={() => void confirmDelete()} loading={deleteLoading}>
              Archivia
            </Button>
          </>
        }
      >
        <p className="font-body text-sm text-ink dark:text-paper">
          {deleteTarget?.entity_type === "contract"
            ? <>Sei sicuro di voler archiviare il contratto <strong>{deleteTarget?.title}</strong>?</>
            : <>Sei sicuro di voler archiviare il preventivo <strong>{deleteTarget?.title || deleteTarget?.source_number}</strong>{deleteTarget?.source_number ? ` (${deleteTarget.source_number})` : ""}?</>}
        </p>
        <p className="mt-2 font-body text-sm text-muted dark:text-muted-dark">
          L'elemento verrà nascosto dalla pipeline ma i dati resteranno nel database.
        </p>
      </Modal>

      <WorkTagCreateModal
        open={workTagModalOpen}
        companyId={quoteContractForm?.company_id ? Number(quoteContractForm.company_id) : currentCompanyId}
        onClose={() => setWorkTagModalOpen(false)}
        onCreated={(tag) => {
          setAvailableWorkTags((current) => (current.some((item) => item.id === tag.id) ? current : [...current, tag]));
          setQuoteContractForm((current) => {
            if (!current) return current;
            return {
              ...current,
              tag_ids: current.tag_ids.includes(tag.id) ? current.tag_ids : [...current.tag_ids, tag.id],
            };
          });
          setWorkTagModalOpen(false);
          toast.success("Tag creato");
        }}
      />

      <WorkAreaCreateModal
        open={workAreaModalOpen}
        companyId={quoteContractForm?.company_id ? Number(quoteContractForm.company_id) : currentCompanyId}
        onClose={() => setWorkAreaModalOpen(false)}
        onCreated={(area) => {
          setAvailableWorkAreas((current) => (current.some((item) => item.id === area.id) ? current : [...current, area]));
          setQuoteContractForm((current) => {
            if (!current) return current;
            return {
              ...current,
              work_area_ids: current.work_area_ids.includes(area.id)
                ? current.work_area_ids
                : [...current.work_area_ids, area.id],
            };
          });
          setWorkAreaModalOpen(false);
          toast.success("Area creata");
        }}
      />

      <Modal
        open={lostMoveModalOpen}
        onClose={() => {
          setLostMoveModalOpen(false);
          setLostMoveContractId(null);
          setLostMoveNotes("");
        }}
        title="Sposta contratto in Perso"
        size="md"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setLostMoveModalOpen(false);
                setLostMoveContractId(null);
                setLostMoveNotes("");
              }}
            >
              Annulla
            </Button>
            <Button variant="secondary" onClick={() => void confirmMoveToLost(false)}>
              Sposta senza note
            </Button>
            <Button onClick={() => void confirmMoveToLost(true)}>
              Sposta e salva note
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-muted dark:text-muted-dark">
            Vuoi inserire delle note sul motivo della perdita?
          </p>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Lost notes (opzionale)</label>
            <Textarea
              value={lostMoveNotes}
              onChange={(event) => setLostMoveNotes(event.target.value)}
              rows={3}
              className="w-full rounded-md border px-3 py-2.5 text-sm font-body bg-paper text-ink border-line focus:border-ink focus:outline-none transition-colors duration-150 dark:bg-ink-soft dark:text-paper dark:border-line-dark dark:focus:border-paper"
              placeholder="Es. Perso per prezzo / scelta competitor / tempi troppo stretti"
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={quoteLostMoveModalOpen}
        onClose={() => {
          setQuoteLostMoveModalOpen(false);
          setLostMoveQuoteId(null);
          setLostMoveQuoteNotes("");
        }}
        title="Sposta preventivo in Perso"
        size="md"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setQuoteLostMoveModalOpen(false);
                setLostMoveQuoteId(null);
                setLostMoveQuoteNotes("");
              }}
            >
              Annulla
            </Button>
            <Button variant="secondary" onClick={() => void confirmQuoteMoveToLost(false)}>
              Sposta senza note
            </Button>
            <Button onClick={() => void confirmQuoteMoveToLost(true)}>
              Sposta e salva note
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-muted dark:text-muted-dark">
            Vuoi inserire delle note sul motivo della perdita?
          </p>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Nota perdita (opzionale)</label>
            <Textarea
              value={lostMoveQuoteNotes}
              onChange={(event) => setLostMoveQuoteNotes(event.target.value)}
              rows={3}
              className="w-full rounded-md border px-3 py-2.5 text-sm font-body bg-paper text-ink border-line focus:border-ink focus:outline-none transition-colors duration-150 dark:bg-ink-soft dark:text-paper dark:border-line-dark dark:focus:border-paper"
              placeholder="Es. Perso per budget insufficiente / scelta competitor / timing"
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        title="Elimina contratti selezionati"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setBulkDeleteOpen(false)} disabled={bulkDeleteLoading}>
              Annulla
            </Button>
            <Button variant="danger" onClick={() => void handleBulkDeleteContracts()} loading={bulkDeleteLoading}>
              Elimina selezionati
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink dark:text-paper">
          Confermi l'eliminazione di <strong>{selectedContractIds.length}</strong> contratti?
        </p>
        <p className="mt-2 text-sm text-muted dark:text-muted-dark">
          Operazione in soft delete con modalità best effort.
        </p>
      </Modal>

      <Modal
        open={bulkDeleteResult != null && bulkDeleteResult.errors.length > 0}
        onClose={() => setBulkDeleteResult(null)}
        title="Dettagli eliminazione bulk"
        size="md"
        footer={<Button variant="ghost" onClick={() => setBulkDeleteResult(null)}>Chiudi</Button>}
      >
        <p className="text-sm text-ink dark:text-paper mb-3">
          Eliminati {bulkDeleteResult?.deleted_ids.length ?? 0} su {bulkDeleteResult?.requested ?? 0}.
        </p>
        <ul className="max-h-64 overflow-auto space-y-1 text-sm text-danger">
          {bulkDeleteResult?.errors.map((item) => (
            <li key={item.id}>#{item.id}: {item.detail}</li>
          ))}
        </ul>
      </Modal>

      <ContractCreateModal
        open={createOpen}
        companyId={currentCompanyId}
        clients={clients}
        canCreateTaxonomy={isAdmin}
        onClose={() => setCreateOpen(false)}
        onCreated={() => reloadPipeline()}
      />

      <QuoteQuickCreateModal
        open={createQuoteOpen || editQuoteOpen}
        companyId={currentCompanyId}
        clients={clients}
        clientsLoading={clientsLoading}
        canSyncFromFic={isAdmin}
        quoteToEdit={editQuoteOpen ? editQuoteData : null}
        onClose={() => {
          setCreateQuoteOpen(false);
          setEditQuoteOpen(false);
          setEditQuoteData(null);
        }}
        onCreated={() => {
          setCreateQuoteOpen(false);
          setEditQuoteOpen(false);
          setEditQuoteData(null);
          reloadPipeline();
        }}
      />

      <ContractFromQuoteModal
        open={createFromQuoteOpen}
        companyId={currentCompanyId}
        clients={clients}
        clientsLoading={clientsLoading}
        canSyncFromFic={isAdmin}
        onClose={() => setCreateFromQuoteOpen(false)}
        onCreated={(created) => {
          setCreateFromQuoteOpen(false);
          reloadPipeline();
          setSelectedContractId(created.id);
          setDetailOpen(true);
        }}
      />
    </div>
  );
}
