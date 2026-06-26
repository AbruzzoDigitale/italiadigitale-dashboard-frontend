import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { createPortal } from "react-dom";
import { useAuth } from "../hooks/useAuth";
import { useSelectedCompanyId } from "../hooks/useSelectedCompanyId";
import { useWorkItems } from "../hooks/useWorkItems";
import { useToast } from "../context/ToastContext";
import {
  bulkDeleteWorkItemsApi,
  bulkRestoreWorkItemsApi,
  deleteWorkItemApi,
  generateWorkItemRecurrencesApi,
  listArchivedWorkItemsApi,
  listWorkItemsApi,
  restoreWorkItemApi,
  updateWorkItemApi,
  listWorkTagsApi,
  type WorkItem,
  type WorkItemStatus,
  type LeftBehindReason,
  type BulkDeleteWorkItemsResponse,
} from "../api/workItems";
import { listWorkAreasApi, type WorkArea } from "../api/workAreas";
import { getUsersApi, type User } from "../api/users";
import { getClientsApi, type Client } from "../api/clients";
import {
  CONTRACT_STAGE_LABELS,
  listContractsApi,
  type ContractListItemResponse,
} from "../api/contracts";
import type { WorkTag } from "../api/workItems";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Modal } from "../components/ui/Modal";
import { Checkbox } from "../components/ui/Checkbox";
import { Spinner } from "../components/ui/Spinner";
import { Icon } from "../components/ui/Icon";
import { Avatar } from "../components/ui/Avatar";
import { SearchableSelect } from "../components/ui/SearchableSelect";
import { RightSidebarPanel } from "../components/ui/RightSidebarPanel";
import { PageSectionHeader } from "../components/ui/PageSectionHeader";
import { KanbanColumnShell } from "../components/ui/KanbanColumnShell";
import { WorkAreaBadge } from "../components/work-areas/WorkAreaBadge";
import { QuickTaskModal } from "../components/work-items/QuickTaskModal";
import { WorkItemFormModal } from "../components/work-items/WorkItemFormModal";
import { WorkItemCard } from "../components/work-items/WorkItemCard";
import { ContractDetailModal } from "../components/contracts/ContractDetailModal";
import { ContractAiWorkItemsSliderModal } from "../components/work-items/ContractAiWorkItemsSliderModal";
import { getCommercialStageTone } from "../utils/commercialStageTone";

// ── Constants ──────────────────────────────────────────────────────────────────

const KANBAN_COLUMNS: { id: WorkItemStatus; label: string; color: string }[] = [
  { id: "planned", label: "Da fare", color: "#888780" },
  { id: "in_progress", label: "In corso", color: "#378ADD" },
  { id: "review", label: "Revisione", color: "#EF9F27" },
  { id: "completed", label: "Completato", color: "#639922" },
];

const STATUS_OPTIONS: { value: WorkItemStatus; label: string }[] = [
  { value: "planned", label: "Da fare" },
  { value: "in_progress", label: "In corso" },
  { value: "review", label: "Revisione" },
  { value: "completed", label: "Completato" },
];

const LEFT_BEHIND_REASON_OPTIONS: { value: LeftBehindReason; label: string }[] = [
  { value: "operator_responsibility", label: "Responsabilità operatore" },
  { value: "client_protection", label: "Protezione cliente" },
  { value: "justified_delay", label: "Ritardo giustificato" },
  { value: "other", label: "Altro" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtHours(n: number | null): string {
  if (n == null) return "—";
  return n % 1 === 0 ? `${n}h` : `${n.toFixed(1)}h`;
}

function effectiveHoursLabel(item: WorkItem): string {
  if (!item.affects_daily_load) return "0h effettive";
  return `${fmtHours(item.effective_load_hours)} effettive`;
}

function hoursWeightClass(h: number | null): string {
  if (h == null) return "bg-cream text-muted dark:bg-[#2a2a2e] dark:text-muted-dark";
  if (h <= 4) return "bg-cream text-muted dark:bg-[#2a2a2e] dark:text-muted-dark";
  if (h <= 8) return "bg-[#FAEEDA] text-[#854F0B] dark:bg-[#3a2a10] dark:text-[#EF9F27]";
  return "bg-[#F7C1C1] text-[#791F1F] dark:bg-[#3a1010] dark:text-[#f87171]";
}

function isOverdue(deadline: string | null): boolean {
  if (!deadline) return false;
  return new Date(deadline) < new Date();
}

function formatDate(d: string | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
}

function engagementTypeLabel(type: ContractListItemResponse["engagement_type"]): string {
  if (type === "ongoing") return "Continuativo";
  if (type === "one_time") return "Una tantum";
  return "-";
}

function formatEuro(value: number): string {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

function isWorkItemError(err: unknown, code: number): boolean {
  return err instanceof Error && err.message.includes(`[${code}]`);
}

function taskTypeLabel(taskType?: WorkItem["task_type"]): string {
  return taskType === "quick" ? "Quick" : "Standard";
}

function taskTypeBadgeClass(taskType?: WorkItem["task_type"]): string {
  if (taskType === "quick") {
    return "bg-[#E91E8A]/12 text-[#E91E8A] border border-[#E91E8A]/35";
  }
  return "bg-info/10 text-info border border-info/25";
}

function hasWorkItemDragType(types: DataTransfer["types"] | undefined): boolean {
  if (!types) return true;
  const list = Array.from(types as ArrayLike<string>);
  return list.includes("application/work-item-id") || list.includes("text/plain");
}


// ── Column ────────────────────────────────────────────────────────────────────

interface KanbanColumnProps {
  column: (typeof KANBAN_COLUMNS)[number];
  items: WorkItem[];
  users: User[];
  workAreas: WorkArea[];
  workTags: WorkTag[];
  clientsById: Map<number, Client>;
  isAdmin: boolean;
  selectedItemIds: number[];
  onToggleSelect: (itemId: number, checked: boolean) => void;
  onDragStartItem: (event: React.DragEvent<HTMLDivElement>, itemId: number) => void;
  onDragEndItem: (event: React.DragEvent<HTMLDivElement>) => void;
  compact?: boolean;
  onEdit: (item: WorkItem) => void;
  onDelete: (item: WorkItem) => void;
  onRegenerateRecurrences: (item: WorkItem) => void;
  onInstantiateFromTemplate: (item: WorkItem) => void;
  onOpenAiSourceContract: (contractId: number) => void;
  onDrop: (status: WorkItemStatus) => void;
}

interface TemplateSidebarCardProps {
  item: WorkItem;
  users: User[];
  workAreas: WorkArea[];
  workTags: WorkTag[];
  isSelected: boolean;
  onSelect: (itemId: number) => void;
}

function TemplateSidebarCard({
  item,
  users,
  workAreas,
  workTags,
  isSelected,
  onSelect,
}: TemplateSidebarCardProps) {
  const assigneeIds = item.assignee_ids ?? [];
  const workAreaIds = item.work_area_ids ?? [];
  const tagIds = item.tag_ids ?? [];
  const assignees = users.filter((u) => assigneeIds.includes(u.id));
  const areas = workAreas.filter((a) => workAreaIds.includes(a.id));
  const tags = workTags.filter((t) => tagIds.includes(t.id));
  const overdue = !item.is_completed && isOverdue(item.deadline_date);

  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      className={`group relative flex w-full flex-col gap-2 rounded-lg border bg-paper p-3 text-left transition-all hover:-translate-y-px hover:shadow-md
        ${isSelected ? "border-info ring-2 ring-info/25" : "border-line dark:border-line-dark"}
        ${item.is_PED ? "bg-info/5 dark:bg-info/10" : ""}
        dark:bg-[#131316]`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <span className="font-variant-numeric text-[10px] tabular-nums text-muted dark:text-muted-dark">
            #{String(item.id).padStart(3, "0")}
          </span>
          <span className={`inline-flex rounded-pill px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${taskTypeBadgeClass(item.task_type)}`}>
            {taskTypeLabel(item.task_type)}
          </span>
          <span className="inline-flex rounded-pill border border-info/30 bg-info/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-info">
            Modello
          </span>
          {item.recurrence_parent_id != null ? (
            <span
              className="inline-flex cursor-help items-center rounded-pill border border-info/30 bg-info/10 px-1.5 py-0.5 text-info"
              title="Task creata automaticamente da una ricorrenza della task sorgente"
              aria-label="Generata da ricorrenza"
            >
              <Icon name="info" className="h-3 w-3" />
            </span>
          ) : item.is_recurring ? (
            <span className="inline-flex rounded-pill border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-warning">
              Ricorrente
            </span>
          ) : null}
          {item.is_PED && (
            <span className="inline-flex rounded-pill border border-info/30 bg-info/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-info">
              PED
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {overdue && (
            <span title={`Scaduto il ${formatDate(item.deadline_date)}`}>
              <Icon name="alert-triangle" className="h-3 w-3 text-danger" />
            </span>
          )}
          {isSelected && <Icon name="check-circle" className="h-3.5 w-3.5 text-info" />}
        </div>
      </div>

      <p className="text-[13px] font-medium leading-snug text-ink dark:text-paper">{item.title}</p>

      {areas.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {areas.map((area) => (
            <WorkAreaBadge key={area.id} area={area} className="text-[10px] px-2 py-0.5" />
          ))}
        </div>
      )}

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex rounded-pill px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
              style={
                tag.color
                  ? { backgroundColor: `${tag.color}22`, color: tag.color, border: `1px solid ${tag.color}44` }
                  : { backgroundColor: "var(--color-cream)", color: "var(--color-muted)" }
              }
            >
              {tag.name}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${hoursWeightClass(item.estimated_hours)}`}
          >
            <Icon name="activity" className="h-3 w-3" />
            {fmtHours(item.estimated_hours)}
          </span>
          {item.deadline_date && (
            <span className={`text-[11px] ${overdue ? "font-semibold text-danger" : "text-muted dark:text-muted-dark"}`}>
              {formatDate(item.deadline_date)}
            </span>
          )}
          <span className="text-[11px] text-muted dark:text-muted-dark">{effectiveHoursLabel(item)}</span>
        </div>

        {assignees.length > 0 && (
          <div className="flex -space-x-1.5">
            {assignees.slice(0, 3).map((u) => (
              <Avatar
                key={u.id}
                name={u.full_name ?? u.username}
                src={u.avatar_url}
                size="sm"
                className="h-6 w-6 text-[9px] ring-2 ring-paper dark:ring-[#131316]"
              />
            ))}
            {assignees.length > 3 && (
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cream text-[9px] font-bold text-muted ring-2 ring-paper dark:bg-[#2a2a2e] dark:text-muted-dark dark:ring-[#131316]">
                +{assignees.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
    </button>
  );
}

function KanbanColumn({
  column,
  items,
  users,
  workAreas,
  workTags,
  clientsById,
  isAdmin,
  selectedItemIds,
  onToggleSelect,
  onDragStartItem,
  onDragEndItem,
  compact = false,
  onEdit,
  onDelete,
  onRegenerateRecurrences,
  onInstantiateFromTemplate,
  onOpenAiSourceContract,
  onDrop,
}: KanbanColumnProps) {
  const [isDropTarget, setIsDropTarget] = useState(false);

  return (
    <KanbanColumnShell
      label={column.label}
      color={column.color}
      count={items.length}
      compact={compact}
      maxHeightClassName={compact ? "max-h-[460px]" : "max-h-[calc(100vh-300px)]"}
      isDropTarget={isDropTarget}
      onDragOver={(e) => {
        if (!hasWorkItemDragType(e.dataTransfer?.types)) return;
        e.preventDefault();
        setIsDropTarget(true);
      }}
      onDragLeave={() => setIsDropTarget(false)}
      onDrop={() => {
        setIsDropTarget(false);
        onDrop(column.id);
      }}
    >
      {items.map((item) => (
        <WorkItemCard
          key={item.id}
          item={item}
          clientName={item.client_id != null ? (clientsById.get(item.client_id)?.commercial_name ?? clientsById.get(item.client_id)?.name) : undefined}
          users={users}
          workAreas={workAreas}
          workTags={workTags}
          isAdmin={isAdmin}
          isSelected={selectedItemIds.includes(item.id)}
          onToggleSelect={onToggleSelect}
          onDragStartItem={onDragStartItem}
          onDragEndItem={onDragEndItem}
          onEdit={onEdit}
          onDelete={onDelete}
          onRegenerateRecurrences={onRegenerateRecurrences}
          onInstantiateFromTemplate={onInstantiateFromTemplate}
          onOpenAiSourceContract={onOpenAiSourceContract}
        />
      ))}
      {items.length === 0 && (
        <div className={`flex flex-1 items-center justify-center rounded-lg border border-dashed border-line ${compact ? "py-4 text-[11px]" : "py-8 text-[12px]"} text-muted dark:border-line-dark dark:text-muted-dark`}>
          Nessuna lavorazione
        </div>
      )}
    </KanbanColumnShell>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function WorkItemsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, permissions } = useAuth();
  const isAdmin = !!permissions?.is_admin;
  // Archiviazione (soft-delete) e selezione multipla: admin e Project Manager (non operatori).
  const canManageWorkItems = isAdmin || !!permissions?.is_project_manager;
  const canUseAiTasks = isAdmin || !!permissions?.can_use_llm;
  const canUseManualTasks = isAdmin || !!permissions?.can_generate_manual_tasks;
  const canOpenTaskGenerator = canUseAiTasks || canUseManualTasks;
  const { selectedCompanyId } = useSelectedCompanyId(user?.company_id ?? null);
  const companyId = selectedCompanyId ?? user?.company_id ?? null;
  const toast = useToast();
  const contractFilterId = useMemo(() => {
    const raw = searchParams.get("contract_id");
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }, [searchParams]);

  // ── Board state
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"global" | "by_client">("global");
  const [clientFilter, setClientFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [workAreaFilter, setWorkAreaFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | WorkItemStatus>("");
  const [isCompletedFilter, setIsCompletedFilter] = useState<"" | "true" | "false">("");
  const [affectsDailyLoadFilter, setAffectsDailyLoadFilter] = useState<"" | "true" | "false">("");
  const [leftBehindFilter, setLeftBehindFilter] = useState<"" | "true" | "false">("");
  const [leftBehindReasonFilter, setLeftBehindReasonFilter] = useState<"" | LeftBehindReason>("");
  const [fromDateFilter, setFromDateFilter] = useState("");
  const [toDateFilter, setToDateFilter] = useState("");
  const [singleDateFilter, setSingleDateFilter] = useState("");
  const [filtersPanelOpen, setFiltersPanelOpen] = useState(false);
  const [contractsPanelCollapsed, setContractsPanelCollapsed] = useState(true);
  const dragItemId = useRef<number | null>(null);

  // ── Archivio (task soft-deleted) — solo admin/PM
  const [archivePanelOpen, setArchivePanelOpen] = useState(false);
  const [archivedItems, setArchivedItems] = useState<WorkItem[]>([]);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [archivedError, setArchivedError] = useState<string | null>(null);
  const [selectedArchivedIds, setSelectedArchivedIds] = useState<number[]>([]);
  const [restoringArchive, setRestoringArchive] = useState(false);

  // ── Clients list (for toolbar filter)
  const [clients, setClients] = useState<Client[]>([]);
  useEffect(() => {
    getClientsApi({ company_id: companyId ?? undefined, per_page: 200 })
      .then((res) => setClients(res.data))
      .catch(() => {});
  }, [companyId]);

  // ── Work items data
  const effectiveFromDate = singleDateFilter || fromDateFilter;
  const effectiveToDate = singleDateFilter || toDateFilter;
  const filterParams = useMemo(
    () => ({
      ...(companyId != null ? { company_id: companyId } : {}),
      ...(assigneeFilter ? { assignee_id: parseInt(assigneeFilter, 10) } : {}),
      ...(effectiveFromDate ? { from_date: effectiveFromDate } : {}),
      ...(effectiveToDate ? { to_date: effectiveToDate } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(isCompletedFilter !== "" ? { is_completed: isCompletedFilter === "true" } : {}),
      ...(affectsDailyLoadFilter !== "" ? { affects_daily_load: affectsDailyLoadFilter === "true" } : {}),
      ...(leftBehindFilter !== "" ? { is_left_behind: leftBehindFilter === "true" } : {}),
      ...(leftBehindReasonFilter ? { left_behind_reason: leftBehindReasonFilter } : {}),
    }),
    [companyId, assigneeFilter, effectiveFromDate, effectiveToDate, statusFilter, isCompletedFilter, affectsDailyLoadFilter, leftBehindFilter, leftBehindReasonFilter]
  );
  const { workItems, isLoading, error, refetch } = useWorkItems(filterParams);
  const [displayedWorkItems, setDisplayedWorkItems] = useState<WorkItem[]>([]);
  const [focusContracts, setFocusContracts] = useState<ContractListItemResponse[]>([]);
  const [contractsLoading, setContractsLoading] = useState(false);
  const [contractsError, setContractsError] = useState<string | null>(null);

  useEffect(() => {
    if (companyId == null) {
      setFocusContracts([]);
      setContractsError(null);
      setContractsLoading(false);
      return;
    }
    let cancelled = false;
    setContractsLoading(true);
    setContractsError(null);

    void listContractsApi({ company_id: companyId, include_inactive: false, include_deleted: false })
      .then((items) => {
        if (cancelled) return;
        setFocusContracts(
          items.filter(
            (item) =>
              item.commercial_stage === "firmato" ||
              item.commercial_stage === "in_produzione" ||
              item.commercial_stage === "completato"
          )
        );
      })
      .catch((err) => {
        if (cancelled) return;
        setFocusContracts([]);
        setContractsError(err instanceof Error ? err.message : "Errore caricamento contratti");
      })
      .finally(() => {
        if (!cancelled) setContractsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const signedContracts = useMemo(
    () => focusContracts.filter((item) => item.commercial_stage === "firmato"),
    [focusContracts]
  );

  const inProductionContracts = useMemo(
    () => focusContracts.filter((item) => item.commercial_stage === "in_produzione"),
    [focusContracts]
  );

  const completedContracts = useMemo(
    () => focusContracts.filter((item) => item.commercial_stage === "completato"),
    [focusContracts]
  );

  const clientsById = useMemo(() => {
    const map = new Map<number, Client>();
    for (const client of clients) map.set(client.id, client);
    return map;
  }, [clients]);

  const contractsColumnMinHeightClass = viewMode === "by_client" ? "min-h-[220px]" : "min-h-[480px]";

  const [users, setUsers] = useState<User[]>([]);
  const [workAreas, setWorkAreas] = useState<WorkArea[]>([]);
  const [workTags, setWorkTags] = useState<WorkTag[]>([]);

  useEffect(() => {
    getUsersApi(companyId ?? undefined).then(setUsers).catch(() => {});
  }, [companyId]);

  useEffect(() => {
    listWorkAreasApi({ company_id: companyId ?? undefined }).then(setWorkAreas).catch(() => {});
  }, [companyId]);

  useEffect(() => {
    listWorkTagsApi(companyId ?? undefined).then(setWorkTags).catch(() => {});
  }, [companyId]);

  // ── Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<WorkItem | null>(null);
  const [instantiateTemplateItem, setInstantiateTemplateItem] = useState<WorkItem | null>(null);
  const [templatePanelOpen, setTemplatePanelOpen] = useState(false);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateOptions, setTemplateOptions] = useState<WorkItem[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");

  // ── Delete confirm
  const [deletingItem, setDeletingItem] = useState<WorkItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<number[]>([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const [quickTaskModalOpen, setQuickTaskModalOpen] = useState(false);
  const [taskAiSourceContractId, setTaskAiSourceContractId] = useState<number | null>(null);
  const [aiContractId, setAiContractId] = useState<number | null>(null);
  const [aiSplitOpen, setAiSplitOpen] = useState(false);
  const [aiCompactPane, setAiCompactPane] = useState<"contract" | "ai">("ai");
  const [isWideAiSplitLayout, setIsWideAiSplitLayout] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.innerWidth >= 768;
  });

  useEffect(() => {
    if (!templatePanelOpen || companyId == null) return;
    let cancelled = false;
    setTemplateLoading(true);
    void listWorkItemsApi({ company_id: companyId, only_templates: true })
      .then((items) => {
        if (cancelled) return;
        setTemplateOptions(items);
      })
      .catch(() => {
        if (cancelled) return;
        setTemplateOptions([]);
      })
      .finally(() => {
        if (!cancelled) setTemplateLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [templatePanelOpen, companyId]);

  useEffect(() => {
    setDisplayedWorkItems(workItems);
  }, [workItems]);

  useEffect(() => {
    const updateViewportMode = () => {
      setIsWideAiSplitLayout(window.innerWidth >= 768);
    };

    updateViewportMode();
    window.addEventListener("resize", updateViewportMode);
    return () => window.removeEventListener("resize", updateViewportMode);
  }, []);

  const openCreate = () => {
    setEditingItem(null);
    setInstantiateTemplateItem(null);
    setModalOpen(true);
  };

  const openTemplatePanel = () => {
    setSelectedTemplateId("");
    setTemplatePanelOpen(true);
  };

  const handleUseTemplateFromPanel = () => {
    if (!selectedTemplateId) {
      toast.error("Seleziona un template");
      return;
    }
    const selectedTemplate = templateOptions.find((item) => item.id === Number(selectedTemplateId));
    if (!selectedTemplate) {
      toast.error("Template non disponibile");
      return;
    }
    setTemplatePanelOpen(false);
    openInstantiateFromTemplate(selectedTemplate);
  };

  const openInstantiateFromTemplate = (item: WorkItem) => {
    setEditingItem(null);
    setInstantiateTemplateItem(item);
    setModalOpen(true);
  };

  const openAiSplitForContract = (contractId: number) => {
    if (!canOpenTaskGenerator) {
      toast.error("Non hai i permessi per generare task");
      return;
    }
    setAiContractId(contractId);
    setAiCompactPane("ai");
    setAiSplitOpen(true);
  };

  const openContractDetailFromAiTask = (contractId: number) => {
    setTaskAiSourceContractId(contractId);
  };

  const closeContractDetailFromAiTask = () => {
    setTaskAiSourceContractId(null);
  };

  const closeAiSplit = () => {
    setAiSplitOpen(false);
    setAiContractId(null);
    setAiCompactPane("ai");
  };

  const splitContractDialogClassName = isWideAiSplitLayout
    ? "w-full max-w-none h-full max-h-none rounded-2xl"
    : "pt-16 sm:pt-20 xl:pt-0";

  const splitAiDialogClassName = isWideAiSplitLayout
    ? "w-full max-w-none h-full max-h-none rounded-2xl"
    : "pt-16 sm:pt-20 xl:pt-0";

  useEffect(() => {
    if (searchParams.get("open") !== "create") return;
    setEditingItem(null);
    setModalOpen(true);

    const next = new URLSearchParams(searchParams);
    next.delete("open");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const openEdit = (item: WorkItem) => {
    setEditingItem(item);
    setInstantiateTemplateItem(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingItem(null);
    setInstantiateTemplateItem(null);
  };

  const toggleItemSelection = (itemId: number, checked: boolean) => {
    setSelectedItemIds((current) => {
      if (checked) return current.includes(itemId) ? current : [...current, itemId];
      return current.filter((id) => id !== itemId);
    });
  };

  const handleBulkDelete = async () => {
    if (selectedItemIds.length === 0) return;
    setBulkDeleting(true);
    try {
      const result: BulkDeleteWorkItemsResponse = await bulkDeleteWorkItemsApi(selectedItemIds);
      const deletedCount = result.deleted.length;
      const errorCount = result.errors.length;
      if (deletedCount > 0) {
        toast.success(
          errorCount > 0
            ? `Eliminate ${deletedCount} lavorazioni, ${errorCount} con errore`
            : `${deletedCount} lavorazioni eliminate`
        );
      } else if (errorCount > 0) {
        toast.error(result.errors[0]?.detail || "Nessuna lavorazione eliminata");
      }
      setBulkDeleteOpen(false);
      setSelectedItemIds((current) => current.filter((id) => !result.deleted.includes(id)));
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nell'eliminazione bulk");
    } finally {
      setBulkDeleting(false);
    }
  };

  // ── Delete item
  const handleDelete = async () => {
    if (!deletingItem) return;
    setDeleting(true);
    try {
      await deleteWorkItemApi(deletingItem.id);
      toast.success("Lavorazione eliminata");
      setDeletingItem(null);
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nell'eliminazione");
    } finally {
      setDeleting(false);
    }
  };

  // ── Archivio: carica le task archiviate dell'azienda
  const loadArchived = async () => {
    if (companyId == null) {
      setArchivedItems([]);
      return;
    }
    setArchivedLoading(true);
    setArchivedError(null);
    try {
      const items = await listArchivedWorkItemsApi({ company_id: companyId });
      setArchivedItems(items);
    } catch (err) {
      setArchivedError(err instanceof Error ? err.message : "Impossibile recuperare l'archivio");
      setArchivedItems([]);
    } finally {
      setArchivedLoading(false);
    }
  };

  const openArchive = () => {
    setSelectedArchivedIds([]);
    setArchivePanelOpen(true);
    void loadArchived();
  };

  const toggleArchivedSelection = (itemId: number, checked: boolean) => {
    setSelectedArchivedIds((current) => {
      if (checked) return current.includes(itemId) ? current : [...current, itemId];
      return current.filter((id) => id !== itemId);
    });
  };

  const handleRestoreOne = async (item: WorkItem) => {
    setRestoringArchive(true);
    try {
      await restoreWorkItemApi(item.id);
      setArchivedItems((current) => current.filter((i) => i.id !== item.id));
      setSelectedArchivedIds((current) => current.filter((id) => id !== item.id));
      toast.success("Task ripristinata");
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossibile ripristinare la task");
    } finally {
      setRestoringArchive(false);
    }
  };

  const handleRestoreSelected = async () => {
    if (selectedArchivedIds.length === 0) return;
    setRestoringArchive(true);
    try {
      const result = await bulkRestoreWorkItemsApi(selectedArchivedIds);
      const restored = result.restored_ids;
      if (restored.length > 0) {
        toast.success(
          result.errors.length > 0
            ? `Ripristinate ${restored.length} task, ${result.errors.length} con errore`
            : `${restored.length} task ripristinate`
        );
      } else {
        toast.error(result.errors[0]?.detail || "Nessuna task ripristinata");
      }
      setArchivedItems((current) => current.filter((i) => !restored.includes(i.id)));
      setSelectedArchivedIds([]);
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossibile ripristinare le task");
    } finally {
      setRestoringArchive(false);
    }
  };

  const handleRegenerateRecurrences = async (item: WorkItem) => {
    if (!item.is_recurring || item.recurrence_parent_id != null) {
      toast.error("L'azione è disponibile solo sulle task sorgente ricorrenti");
      return;
    }

    const generationEndDate = item.recurrence_until ?? null;
    if (!generationEndDate) {
      toast.error("Configura una data fine ricorrenza per rigenerare le occorrenze");
      return;
    }

    try {
      const result = await generateWorkItemRecurrencesApi(item.id, { generation_end_date: generationEndDate });
      toast.success(`Ricorrenze rigenerate: ${result.generated_count}`);
      await refetch();
    } catch (err) {
      if (isWorkItemError(err, 422)) {
        toast.error(err instanceof Error ? err.message.replace(/^\[422\]\s*/, "") : "Dati non validi");
      } else {
        toast.error(err instanceof Error ? err.message : "Errore rigenerazione occorrenze");
      }
    }
  };

  // ── Drag and drop
  const handleDrop = async (newStatus: WorkItemStatus) => {
    const id = dragItemId.current;
    dragItemId.current = null;
    if (!id) return;
    const item = displayedWorkItems.find((w) => w.id === id);
    if (!item || item.status === newStatus) return;
    const previousStatus = item.status;
    setDisplayedWorkItems((current) => current.map((workItem) => (
      workItem.id === id ? { ...workItem, status: newStatus } : workItem
    )));
    try {
      const updated = await updateWorkItemApi(id, { status: newStatus });
      setDisplayedWorkItems((current) => current.map((workItem) => (
        workItem.id === id ? updated : workItem
      )));
    } catch {
      setDisplayedWorkItems((current) => current.map((workItem) => (
        workItem.id === id ? { ...workItem, status: previousStatus } : workItem
      )));
      toast.error("Impossibile cambiare lo stato");
    }
  };

  const handleDragStartItem = (event: React.DragEvent<HTMLDivElement>, itemId: number) => {
    dragItemId.current = itemId;
    if (event.dataTransfer) {
      event.dataTransfer.setData("application/work-item-id", String(itemId));
      event.dataTransfer.setData("text/plain", String(itemId));
      event.dataTransfer.effectAllowed = "move";
    }
    event.currentTarget.style.opacity = "0.45";
  };

  const handleDragEndItem = (event: React.DragEvent<HTMLDivElement>) => {
    dragItemId.current = null;
    event.currentTarget.style.opacity = "";
  };

  // ── Filtered items
  const filteredItems = useMemo(() => {
    let items = displayedWorkItems;
    if (contractFilterId != null) {
      items = items.filter((item) => (item.contract_ids ?? []).includes(contractFilterId));
    }
    if (clientFilter) {
      const cid = parseInt(clientFilter, 10);
      items = items.filter((item) => item.client_id === cid);
    }
    if (workAreaFilter) {
      const areaId = parseInt(workAreaFilter, 10);
      items = items.filter((item) => (item.work_area_ids ?? []).includes(areaId));
    }
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      `${item.title} ${item.description ?? ""}`.toLowerCase().includes(q)
    );
  }, [displayedWorkItems, search, clientFilter, workAreaFilter, contractFilterId]);

  const clientGroups = useMemo(() => {
    const byClient = new Map<string, { label: string; items: WorkItem[] }>();
    for (const item of filteredItems) {
      const client = clients.find((c) => c.id === item.client_id);
      const label = client ? (client.commercial_name ?? client.name) : "— Senza cliente —";
      const key = client ? String(client.id) : "none";
      if (!byClient.has(key)) byClient.set(key, { label, items: [] });
      byClient.get(key)!.items.push(item);
    }
    return [...byClient.values()].sort((a, b) => b.items.length - a.items.length);
  }, [filteredItems, clients]);

  const resetFilters = () => {
    setSearch("");
    setClientFilter("");
    setAssigneeFilter("");
    setWorkAreaFilter("");
    setStatusFilter("");
    setIsCompletedFilter("");
    setAffectsDailyLoadFilter("");
    setLeftBehindFilter("");
    setLeftBehindReasonFilter("");
    setFromDateFilter("");
    setToDateFilter("");
    setSingleDateFilter("");
  };

  useEffect(() => {
    const allowedIds = new Set(displayedWorkItems.map((item) => item.id));
    setSelectedItemIds((current) => current.filter((id) => allowedIds.has(id)));
  }, [displayedWorkItems]);

  const secondaryFiltersCount = [
    statusFilter,
    isCompletedFilter,
    affectsDailyLoadFilter,
    leftBehindFilter,
    leftBehindReasonFilter,
    singleDateFilter,
    fromDateFilter,
    toDateFilter,
    workAreaFilter,
  ].filter(Boolean).length;

  const boardRef = useRef<HTMLDivElement>(null);
  const [boardMeasuredHeight, setBoardMeasuredHeight] = useState<number | null>(null);
  const formCompanyId = editingItem?.company_id ?? companyId;

  useEffect(() => {
    if (isLoading) {
      setBoardMeasuredHeight(null);
      return;
    }
    const node = boardRef.current;
    if (!node) {
      setBoardMeasuredHeight(null);
      return;
    }

    const measure = () => {
      const next = Math.ceil(node.getBoundingClientRect().height);
      setBoardMeasuredHeight(next > 0 ? next : null);
    };

    measure();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(node);
    return () => observer.disconnect();
  }, [isLoading, viewMode, filteredItems.length, clientGroups.length]);

  // ── Render
  return (
    <div className="px-6 py-8 pb-20 mx-auto w-full animate-fadeIn overflow-x-hidden">
      <PageSectionHeader
        eyebrow="Operazioni"
        eyebrowIcon={<Icon name="list" className="w-3.5 h-3.5" />}
        title="Lavorazioni"
        lead={isLoading ? "Caricamento…" : `${filteredItems.length} lavorazion${filteredItems.length === 1 ? "e" : "i"}${search ? " trovate" : " totali"}`}
      />

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="relative flex-1 max-w-sm">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca lavorazioni…"
            className="w-full pl-9 pr-4 py-2.5 rounded-md border border-line dark:border-[#2a2a2e] bg-paper dark:bg-[#131316] text-sm font-body text-ink dark:text-[#f4f4f7] placeholder:text-muted dark:placeholder:text-[#9999a0] focus:outline-none focus:border-ink dark:focus:border-white transition-colors"
          />
        </div>
        <SearchableSelect
          className="w-52"
          value={assigneeFilter}
          onChange={setAssigneeFilter}
          options={[
            { value: "", label: "Tutti gli assegnatari" },
            ...users.map((u) => ({ value: String(u.id), label: u.full_name ?? u.username })),
          ]}
          placeholder="Tutti gli assegnatari"
          searchPlaceholder="Cerca assegnatario…"
        />
        <SearchableSelect
          className="w-52"
          value={clientFilter}
          onChange={setClientFilter}
          options={[
            { value: "", label: "Tutti i clienti" },
            ...clients.map((c) => ({
              value: String(c.id),
                label: c.commercial_name ?? c.name,
              keywords: `${c.commercial_name ?? ""} ${c.name} ${c.email ?? ""} ${c.vat ?? ""}`,
            })),
          ]}
          placeholder="Tutti i clienti"
          searchPlaceholder="Cerca cliente…"
        />
        <div className="seg-switch">
          <button
            type="button"
            onClick={() => setViewMode("global")}
            className={viewMode === "global" ? "is-active" : ""}
          >
            <Icon name="list" className="h-3.5 w-3.5" />
            Globale
          </button>
          <button
            type="button"
            onClick={() => setViewMode("by_client")}
            className={viewMode === "by_client" ? "is-active" : ""}
          >
            <Icon name="building" className="h-3.5 w-3.5" />
            Per cliente
          </button>
        </div>
        <Button
          variant="ghost"
          leftIcon={<Icon name="tools" className="w-4 h-4" />}
          onClick={() => setFiltersPanelOpen(true)}
        >
          Filtri {secondaryFiltersCount > 0 ? `(${secondaryFiltersCount})` : ""}
        </Button>
        {canManageWorkItems && (
          <Button
            variant="ghost"
            leftIcon={<Icon name="trash" className="w-4 h-4" />}
            onClick={openArchive}
          >
            Archivio
          </Button>
        )}
                <Button
                  variant="secondary"
                  leftIcon={<Icon name="plus" className="w-4 h-4" />}
                  onClick={() => setQuickTaskModalOpen(true)}
                  disabled={companyId == null}
                >
                  Task rapida
                </Button>
        {canManageWorkItems && selectedItemIds.length > 0 && (
          <Button
            variant="danger-ghost"
            leftIcon={<Icon name="trash" className="w-4 h-4" />}
            onClick={() => setBulkDeleteOpen(true)}
          >
            Archivia selezionate ({selectedItemIds.length})
          </Button>
        )}
        {isAdmin && (
          <Button
            variant="secondary"
            leftIcon={<Icon name="document-text" className="w-4 h-4" />}
            onClick={openTemplatePanel}
            disabled={companyId == null}
          >
            Template
          </Button>
        )}
        {canUseManualTasks && (
          <Button
            variant="primary"
            leftIcon={<Icon name="plus" className="w-4 h-4" />}
            onClick={openCreate}
            disabled={companyId == null}
          >
            Nuova lavorazione
          </Button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="flex items-stretch gap-3">
        <aside
          className={`shrink-0 flex ${contractsColumnMinHeightClass} flex-col rounded-xl border border-[#4C8DFF]/35 bg-[#EEF5FF] p-2.5 transition-all dark:border-[#4C8DFF]/45 dark:bg-[#112034] ${contractsPanelCollapsed ? "w-20" : "w-80"}`}
          style={boardMeasuredHeight != null ? { height: `${boardMeasuredHeight}px` } : undefined}
        >
          <button
            type="button"
            onClick={() => setContractsPanelCollapsed((current) => !current)}
            className={`mb-2 flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[11px] font-bold uppercase tracking-wider text-[#123A72] transition-colors hover:bg-white/70 dark:text-[#CFE0FF] dark:hover:bg-[#0C182A] ${contractsPanelCollapsed ? "justify-center" : ""}`}
          >
            <span className="h-2 w-2 shrink-0 rounded-full bg-[#2E6CE6]" />
            <span className="flex-1">{contractsPanelCollapsed ? "CTR" : "Contratti"}</span>
            {!contractsPanelCollapsed && (
              <span className="rounded-pill bg-white px-2 py-0.5 text-[11px] text-[#2E6CE6] dark:bg-[#0C182A] dark:text-[#8CB1FF]">
                {focusContracts.length}
              </span>
            )}
            <Icon name="chevron-right" className={`h-4 w-4 shrink-0 text-[#2E6CE6] transition-transform dark:text-[#8CB1FF] ${contractsPanelCollapsed ? "" : "rotate-180"}`} />
          </button>

          {contractsPanelCollapsed && (
            <div className="flex flex-1 flex-col items-center gap-2 px-1 py-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-[10px] font-semibold text-[#174D9B] dark:bg-[#0C182A] dark:text-[#CFE0FF]">
                {focusContracts.length}
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <span className="inline-flex items-center gap-1 text-[9px] text-[#2A4E85] dark:text-[#9BB5E7]">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {signedContracts.length}
                </span>
                <span className="inline-flex items-center gap-1 text-[9px] text-[#2A4E85] dark:text-[#9BB5E7]">
                  <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                  {inProductionContracts.length}
                </span>
                <span className="inline-flex items-center gap-1 text-[9px] text-[#2A4E85] dark:text-[#9BB5E7]">
                  <span className="h-1.5 w-1.5 rounded-full bg-success" />
                  {completedContracts.length}
                </span>
              </div>
            </div>
          )}

          {!contractsPanelCollapsed && (
            <div className="no-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-1.5 pb-1">
              {contractsLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((item) => (
                    <div key={item} className="h-12 animate-pulse rounded-md border border-line bg-cream dark:border-[#2a2a2e] dark:bg-[#1c1c20]" />
                  ))}
                </div>
              ) : contractsError ? (
                <p className="text-xs text-danger">{contractsError}</p>
              ) : (
                <>
                  <div>
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#2A4E85] dark:text-[#9BB5E7]">
                      Firmati ({signedContracts.length})
                    </p>
                    <div className="space-y-1.5">
                      {signedContracts.length === 0 ? (
                        <div className="rounded-md border border-dashed border-[#4C8DFF]/35 px-2 py-2 text-xs text-[#2A4E85] dark:border-[#4C8DFF]/45 dark:text-[#9BB5E7]">Nessun contratto firmato</div>
                      ) : signedContracts.map((contract) => (
                        <div key={contract.id} className="rounded-md border border-[#4C8DFF]/35 bg-white/85 px-2 py-2 dark:border-[#4C8DFF]/45 dark:bg-[#0C182A]/85">
                          <div className="line-clamp-2 text-xs font-semibold text-[#123A72] dark:text-[#DBE7FF]">{contract.title}</div>
                          <div className="mt-1 text-[11px] text-[#395D92] dark:text-[#9BB5E7]">{contract.client_name || (contract.client_id != null ? clientsById.get(contract.client_id)?.name : null) || "Cliente non assegnato"}</div>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            <Badge variant="info" className="text-[10px]">{engagementTypeLabel(contract.engagement_type)}</Badge>
                            <span
                              className={`inline-flex items-center rounded-pill border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${getCommercialStageTone(contract.commercial_stage)}`}
                            >
                              {CONTRACT_STAGE_LABELS[contract.commercial_stage]}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[#395D92] dark:text-[#9BB5E7]">
                            <span>Firma: {formatDate(contract.signed_at) || "-"}</span>
                            <span>Inizio: {formatDate(contract.start_date) || "-"}</span>
                            <span>Fine: {formatDate(contract.end_date) || "-"}</span>
                          </div>
                          <div className="mt-1.5 min-w-0 space-y-1">
                            <div className="flex min-w-0 flex-wrap items-center gap-1">
                              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-[#395D92] dark:text-[#9BB5E7]">Aree</span>
                              {(contract.work_areas?.length ?? 0) === 0 ? (
                                <span className="text-[10px] text-muted dark:text-muted-dark">Nessuna area</span>
                              ) : (
                                (contract.work_areas ?? []).map((area) => (
                                  <span
                                    key={`contract-focus-area-${contract.id}-${area.id}`}
                                    className="inline-flex max-w-full min-w-0 items-center rounded-pill border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                                    style={area.color ? { borderColor: `${area.color}55`, color: area.color, backgroundColor: `${area.color}1A` } : undefined}
                                  >
                                    <span className="truncate">{area.name}</span>
                                  </span>
                                ))
                              )}
                            </div>
                            <div className="flex min-w-0 flex-wrap items-center gap-1">
                              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-[#395D92] dark:text-[#9BB5E7]">Tag</span>
                              {(contract.tags?.length ?? 0) === 0 ? (
                                <span className="text-[10px] text-muted dark:text-muted-dark">Nessun tag</span>
                              ) : (
                                (contract.tags ?? []).slice(0, 3).map((tag) => (
                                  <span
                                    key={`contract-focus-tag-${contract.id}-${tag.id}`}
                                    className="inline-flex max-w-full min-w-0 items-center rounded-pill border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                                    style={tag.color ? { borderColor: `${tag.color}55`, color: tag.color, backgroundColor: `${tag.color}1A` } : undefined}
                                  >
                                    <span className="truncate">#{tag.name}</span>
                                  </span>
                                ))
                              )}
                              {(contract.tags?.length ?? 0) > 3 && (
                                <span className="inline-flex items-center rounded-pill border border-[#4C8DFF]/35 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#395D92] dark:border-[#4C8DFF]/45 dark:text-[#9BB5E7]">
                                  ...
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="mt-1 flex min-w-0 flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0 text-[10px] font-semibold text-[#174D9B] dark:text-[#B8D0FF]">
                              {isAdmin ? `Valore: ${formatEuro(contract.pricing.selected_total)}` : " "}
                            </div>
                            <button
                              type="button"
                              onClick={() => openAiSplitForContract(contract.id)}
                              disabled={!canOpenTaskGenerator}
                              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[#4C8DFF]/45 bg-white/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#174D9B] transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#4C8DFF]/45 dark:bg-[#0C182A] dark:text-[#B8D0FF] dark:hover:bg-[#0F2036]"
                            >
                              <Icon name="tools" className="h-3 w-3" />
                              Task
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#2A4E85] dark:text-[#9BB5E7]">
                      In produzione ({inProductionContracts.length})
                    </p>
                    <div className="space-y-1.5">
                      {inProductionContracts.length === 0 ? (
                        <div className="rounded-md border border-dashed border-[#4C8DFF]/35 px-2 py-2 text-xs text-[#2A4E85] dark:border-[#4C8DFF]/45 dark:text-[#9BB5E7]">Nessun contratto in produzione</div>
                      ) : inProductionContracts.map((contract) => (
                        <div key={contract.id} className="rounded-md border border-[#4C8DFF]/35 bg-white/85 px-2 py-2 dark:border-[#4C8DFF]/45 dark:bg-[#0C182A]/85">
                          <div className="line-clamp-2 text-xs font-semibold text-[#123A72] dark:text-[#DBE7FF]">{contract.title}</div>
                          <div className="mt-1 text-[11px] text-[#395D92] dark:text-[#9BB5E7]">{contract.client_name || (contract.client_id != null ? clientsById.get(contract.client_id)?.name : null) || "Cliente non assegnato"}</div>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            <Badge variant="info" className="text-[10px]">{engagementTypeLabel(contract.engagement_type)}</Badge>
                            <span
                              className={`inline-flex items-center rounded-pill border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${getCommercialStageTone(contract.commercial_stage)}`}
                            >
                              {CONTRACT_STAGE_LABELS[contract.commercial_stage]}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[#395D92] dark:text-[#9BB5E7]">
                            <span>Firma: {formatDate(contract.signed_at) || "-"}</span>
                            <span>Inizio: {formatDate(contract.start_date) || "-"}</span>
                            <span>Fine: {formatDate(contract.end_date) || "-"}</span>
                          </div>
                          <div className="mt-1.5 min-w-0 space-y-1">
                            <div className="flex min-w-0 flex-wrap items-center gap-1">
                              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-[#395D92] dark:text-[#9BB5E7]">Aree</span>
                              {(contract.work_areas?.length ?? 0) === 0 ? (
                                <span className="text-[10px] text-muted dark:text-muted-dark">Nessuna area</span>
                              ) : (
                                (contract.work_areas ?? []).map((area) => (
                                  <span
                                    key={`contract-focus-area-${contract.id}-${area.id}`}
                                    className="inline-flex max-w-full min-w-0 items-center rounded-pill border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                                    style={area.color ? { borderColor: `${area.color}55`, color: area.color, backgroundColor: `${area.color}1A` } : undefined}
                                  >
                                    <span className="truncate">{area.name}</span>
                                  </span>
                                ))
                              )}
                            </div>
                            <div className="flex min-w-0 flex-wrap items-center gap-1">
                              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-[#395D92] dark:text-[#9BB5E7]">Tag</span>
                              {(contract.tags?.length ?? 0) === 0 ? (
                                <span className="text-[10px] text-muted dark:text-muted-dark">Nessun tag</span>
                              ) : (
                                (contract.tags ?? []).slice(0, 3).map((tag) => (
                                  <span
                                    key={`contract-focus-tag-${contract.id}-${tag.id}`}
                                    className="inline-flex max-w-full min-w-0 items-center rounded-pill border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                                    style={tag.color ? { borderColor: `${tag.color}55`, color: tag.color, backgroundColor: `${tag.color}1A` } : undefined}
                                  >
                                    <span className="truncate">#{tag.name}</span>
                                  </span>
                                ))
                              )}
                              {(contract.tags?.length ?? 0) > 3 && (
                                <span className="inline-flex items-center rounded-pill border border-[#4C8DFF]/35 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#395D92] dark:border-[#4C8DFF]/45 dark:text-[#9BB5E7]">
                                  ...
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="mt-1 flex min-w-0 flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0 text-[10px] font-semibold text-[#174D9B] dark:text-[#B8D0FF]">
                              {isAdmin ? `Valore: ${formatEuro(contract.pricing.selected_total)}` : " "}
                            </div>
                            <button
                              type="button"
                              onClick={() => openAiSplitForContract(contract.id)}
                              disabled={!canOpenTaskGenerator}
                              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[#4C8DFF]/45 bg-white/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#174D9B] transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#4C8DFF]/45 dark:bg-[#0C182A] dark:text-[#B8D0FF] dark:hover:bg-[#0F2036]"
                            >
                              <Icon name="tools" className="h-3 w-3" />
                              Task
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#2A4E85] dark:text-[#9BB5E7]">
                      Completati ({completedContracts.length})
                    </p>
                    <div className="space-y-1.5">
                      {completedContracts.length === 0 ? (
                        <div className="rounded-md border border-dashed border-[#4C8DFF]/35 px-2 py-2 text-xs text-[#2A4E85] dark:border-[#4C8DFF]/45 dark:text-[#9BB5E7]">Nessun contratto completato</div>
                      ) : completedContracts.map((contract) => (
                        <div key={contract.id} className="rounded-md border border-[#4C8DFF]/35 bg-white/85 px-2 py-2 dark:border-[#4C8DFF]/45 dark:bg-[#0C182A]/85">
                          <div className="line-clamp-2 text-xs font-semibold text-[#123A72] dark:text-[#DBE7FF]">{contract.title}</div>
                          <div className="mt-1 text-[11px] text-[#395D92] dark:text-[#9BB5E7]">{contract.client_name || (contract.client_id != null ? clientsById.get(contract.client_id)?.name : null) || "Cliente non assegnato"}</div>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            <Badge variant="info" className="text-[10px]">{engagementTypeLabel(contract.engagement_type)}</Badge>
                            <span
                              className={`inline-flex items-center rounded-pill border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${getCommercialStageTone(contract.commercial_stage)}`}
                            >
                              {CONTRACT_STAGE_LABELS[contract.commercial_stage]}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[#395D92] dark:text-[#9BB5E7]">
                            <span>Firma: {formatDate(contract.signed_at) || "-"}</span>
                            <span>Inizio: {formatDate(contract.start_date) || "-"}</span>
                            <span>Fine: {formatDate(contract.end_date) || "-"}</span>
                          </div>
                          <div className="mt-1.5 min-w-0 space-y-1">
                            <div className="flex min-w-0 flex-wrap items-center gap-1">
                              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-[#395D92] dark:text-[#9BB5E7]">Aree</span>
                              {(contract.work_areas?.length ?? 0) === 0 ? (
                                <span className="text-[10px] text-muted dark:text-muted-dark">Nessuna area</span>
                              ) : (
                                (contract.work_areas ?? []).map((area) => (
                                  <span
                                    key={`contract-focus-area-${contract.id}-${area.id}`}
                                    className="inline-flex max-w-full min-w-0 items-center rounded-pill border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                                    style={area.color ? { borderColor: `${area.color}55`, color: area.color, backgroundColor: `${area.color}1A` } : undefined}
                                  >
                                    <span className="truncate">{area.name}</span>
                                  </span>
                                ))
                              )}
                            </div>
                            <div className="flex min-w-0 flex-wrap items-center gap-1">
                              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-[#395D92] dark:text-[#9BB5E7]">Tag</span>
                              {(contract.tags?.length ?? 0) === 0 ? (
                                <span className="text-[10px] text-muted dark:text-muted-dark">Nessun tag</span>
                              ) : (
                                (contract.tags ?? []).slice(0, 3).map((tag) => (
                                  <span
                                    key={`contract-focus-tag-${contract.id}-${tag.id}`}
                                    className="inline-flex max-w-full min-w-0 items-center rounded-pill border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                                    style={tag.color ? { borderColor: `${tag.color}55`, color: tag.color, backgroundColor: `${tag.color}1A` } : undefined}
                                  >
                                    <span className="truncate">#{tag.name}</span>
                                  </span>
                                ))
                              )}
                              {(contract.tags?.length ?? 0) > 3 && (
                                <span className="inline-flex items-center rounded-pill border border-[#4C8DFF]/35 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#395D92] dark:border-[#4C8DFF]/45 dark:text-[#9BB5E7]">
                                  ...
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="mt-1 flex min-w-0 flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0 text-[10px] font-semibold text-[#174D9B] dark:text-[#B8D0FF]">
                              {isAdmin ? `Valore: ${formatEuro(contract.pricing.selected_total)}` : " "}
                            </div>
                            <button
                              type="button"
                              onClick={() => openAiSplitForContract(contract.id)}
                              disabled={!canOpenTaskGenerator}
                              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[#4C8DFF]/45 bg-white/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#174D9B] transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#4C8DFF]/45 dark:bg-[#0C182A] dark:text-[#B8D0FF] dark:hover:bg-[#0F2036]"
                            >
                              <Icon name="tools" className="h-3 w-3" />
                              Task
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </aside>

        <div className="min-w-0 flex-1">
          {/* Board skeleton */}
          {isLoading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {KANBAN_COLUMNS.map((col) => (
                <div key={col.id} className="rounded-xl bg-cream p-2.5 dark:bg-[#1c1c20]">
                  <div className="mb-2 flex items-center gap-2 px-1.5 py-1">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: col.color }} />
                    <span className="text-[11px] font-bold uppercase tracking-wider text-ink dark:text-paper">
                      {col.label}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {[1, 2].map((i) => (
                      <div
                        key={i}
                        className="h-20 animate-pulse rounded-lg border border-line bg-paper dark:border-line-dark dark:bg-[#131316]"
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : viewMode === "by_client" ? (
            <div ref={boardRef} className="flex flex-col gap-4">
              {clientGroups.length === 0 ? (
                <div className="rounded-lg border border-dashed border-line dark:border-line-dark px-4 py-8 text-center text-sm text-muted dark:text-muted-dark">
                  Nessuna lavorazione trovata con i filtri correnti.
                </div>
              ) : (
                clientGroups.map((group) => {
                  const totalHours = group.items.reduce((sum, item) => sum + (item.estimated_hours ?? 0), 0);
                  return (
                    <div key={group.label} className="rounded-xl border border-line bg-paper dark:bg-[#131316] dark:border-[#2a2a2e] p-3">
                      <div className="mb-2 flex items-center justify-between gap-2 px-1">
                        <h3 className="inline-flex items-center gap-2 text-sm font-display font-bold tracking-tight text-ink dark:text-[#f4f4f7]"><Icon name="building" className="h-4 w-4 text-muted dark:text-[#9999a0]" />{group.label}</h3>
                        <span className="text-[11px] font-body text-muted dark:text-[#9999a0]">
                          <span className="inline-flex items-center gap-1"><Icon name="list" className="h-3 w-3" /> {group.items.length} task</span>
                          <span className="mx-1">·</span>
                          <span className="inline-flex items-center gap-1"><Icon name="activity" className="h-3 w-3" /> {fmtHours(totalHours)}</span>
                        </span>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {KANBAN_COLUMNS.map((col) => (
                          <KanbanColumn
                            key={`${group.label}-${col.id}`}
                            column={col}
                            compact
                            items={group.items.filter((w) => w.status === col.id)}
                            users={users}
                            workAreas={workAreas}
                            workTags={workTags}
                            clientsById={clientsById}
                            isAdmin={canManageWorkItems}
                            selectedItemIds={selectedItemIds}
                            onToggleSelect={toggleItemSelection}
                            onDragStartItem={handleDragStartItem}
                            onDragEndItem={handleDragEndItem}
                            onEdit={openEdit}
                            onDelete={(item) => setDeletingItem(item)}
                            onRegenerateRecurrences={handleRegenerateRecurrences}
                            onInstantiateFromTemplate={openInstantiateFromTemplate}
                            onOpenAiSourceContract={openContractDetailFromAiTask}
                            onDrop={handleDrop}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            /* Kanban board */
            <div
              ref={boardRef}
              className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
            >
              {KANBAN_COLUMNS.map((col) => {
                const colItems = filteredItems.filter((w) => w.status === col.id);
                return (
                  <KanbanColumn
                    key={col.id}
                    column={col}
                    items={colItems}
                    users={users}
                    workAreas={workAreas}
                    workTags={workTags}
                    clientsById={clientsById}
                    isAdmin={canManageWorkItems}
                    selectedItemIds={selectedItemIds}
                    onToggleSelect={toggleItemSelection}
                    onDragStartItem={handleDragStartItem}
                    onDragEndItem={handleDragEndItem}
                    onEdit={openEdit}
                    onDelete={(item) => setDeletingItem(item)}
                    onRegenerateRecurrences={handleRegenerateRecurrences}
                    onInstantiateFromTemplate={openInstantiateFromTemplate}
                    onOpenAiSourceContract={openContractDetailFromAiTask}
                    onDrop={handleDrop}
                  />
                );
              })}
            </div>
          )}

          {/* Footer hint */}
          {!isLoading && (
            <p className="mt-4 text-center text-[11px] text-muted dark:text-muted-dark">
              Trascina una card tra le colonne per cambiare stato.
            </p>
          )}
        </div>
      </div>

      <RightSidebarPanel
        open={templatePanelOpen}
        onClose={() => setTemplatePanelOpen(false)}
        title="Crea da template"
        footer={(
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              onClick={() => setTemplatePanelOpen(false)}
            >
              Annulla
            </Button>
            <Button
              variant="primary"
              onClick={handleUseTemplateFromPanel}
              disabled={templateLoading || !selectedTemplateId}
            >
              Usa template
            </Button>
          </div>
        )}
      >
        <div className="flex flex-col gap-3">
          {templateLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-ink dark:border-line-dark dark:border-t-paper" />
            </div>
          ) : templateOptions.length === 0 ? (
            <p className="text-sm text-muted dark:text-muted-dark">Nessun template disponibile.</p>
          ) : (
            <div className="flex max-h-[68vh] flex-col gap-2 overflow-y-auto pr-1">
              {templateOptions.map((item) => (
                <TemplateSidebarCard
                  key={item.id}
                  item={item}
                  users={users}
                  workAreas={workAreas}
                  workTags={workTags}
                  isSelected={selectedTemplateId === String(item.id)}
                  onSelect={(itemId) => setSelectedTemplateId(String(itemId))}
                />
              ))}
            </div>
          )}
        </div>
      </RightSidebarPanel>

      <RightSidebarPanel
        open={filtersPanelOpen}
        onClose={() => setFiltersPanelOpen(false)}
        title="Filtri lavorazioni"
        footer={(
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              onClick={resetFilters}
            >
              Reset
            </Button>
            <Button
              variant="primary"
              onClick={() => setFiltersPanelOpen(false)}
            >
              Applica
            </Button>
          </div>
        )}
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">Stato</label>
            <SearchableSelect
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as "" | WorkItemStatus)}
              options={[
                { value: "", label: "Tutti gli stati" },
                ...STATUS_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label })),
              ]}
              placeholder="Tutti gli stati"
              searchPlaceholder="Cerca stato…"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">Completate</label>
            <SearchableSelect
              value={isCompletedFilter}
              onChange={(v) => setIsCompletedFilter(v as "" | "true" | "false")}
              options={[
                { value: "", label: "Tutte" },
                { value: "false", label: "Aperte" },
                { value: "true", label: "Completate" },
              ]}
              placeholder="Tutte"
              searchPlaceholder="Cerca opzione…"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">Impatto carico</label>
            <SearchableSelect
              value={affectsDailyLoadFilter}
              onChange={(v) => setAffectsDailyLoadFilter(v as "" | "true" | "false")}
              options={[
                { value: "", label: "Tutte" },
                { value: "true", label: "Impatta" },
                { value: "false", label: "Non impatta" },
              ]}
              placeholder="Tutte"
              searchPlaceholder="Cerca opzione..."
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">Lasciata indietro</label>
            <SearchableSelect
              value={leftBehindFilter}
              onChange={(v) => setLeftBehindFilter(v as "" | "true" | "false")}
              options={[
                { value: "", label: "Tutte" },
                { value: "true", label: "Si" },
                { value: "false", label: "No" },
              ]}
              placeholder="Tutte"
              searchPlaceholder="Cerca opzione..."
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">Motivo ritardo</label>
            <SearchableSelect
              value={leftBehindReasonFilter}
              onChange={(v) => setLeftBehindReasonFilter(v as "" | LeftBehindReason)}
              options={[
                { value: "", label: "Tutti i motivi" },
                ...LEFT_BEHIND_REASON_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label })),
              ]}
              placeholder="Tutti i motivi"
              searchPlaceholder="Cerca motivo..."
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">Data singola</label>
            <input
              type="date"
              value={singleDateFilter}
              onChange={(e) => setSingleDateFilter(e.target.value)}
              className="h-[42px] rounded-md border border-line dark:border-[#2a2a2e] bg-paper dark:bg-[#131316] px-3 text-sm font-body text-ink dark:text-[#f4f4f7]"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">Da</label>
              <input
                type="date"
                value={fromDateFilter}
                onChange={(e) => setFromDateFilter(e.target.value)}
                disabled={!!singleDateFilter}
                className="h-[42px] rounded-md border border-line dark:border-[#2a2a2e] bg-paper dark:bg-[#131316] px-3 text-sm font-body text-ink dark:text-[#f4f4f7] disabled:opacity-50"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">A</label>
              <input
                type="date"
                value={toDateFilter}
                onChange={(e) => setToDateFilter(e.target.value)}
                disabled={!!singleDateFilter}
                className="h-[42px] rounded-md border border-line dark:border-[#2a2a2e] bg-paper dark:bg-[#131316] px-3 text-sm font-body text-ink dark:text-[#f4f4f7] disabled:opacity-50"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">Area di lavoro</label>
            <SearchableSelect
              value={workAreaFilter}
              onChange={setWorkAreaFilter}
              options={[
                { value: "", label: "Tutte le aree" },
                ...workAreas.map((a) => ({ value: String(a.id), label: a.name })),
              ]}
              placeholder="Tutte le aree"
              searchPlaceholder="Cerca area…"
            />
          </div>
        </div>
      </RightSidebarPanel>

      <RightSidebarPanel
        open={archivePanelOpen}
        onClose={() => setArchivePanelOpen(false)}
        title="Archivio lavorazioni"
        footer={selectedArchivedIds.length > 0 ? (
          <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" onClick={() => setSelectedArchivedIds([])}>Deseleziona</Button>
            <Button
              variant="primary"
              onClick={() => void handleRestoreSelected()}
              loading={restoringArchive}
              disabled={restoringArchive}
              leftIcon={<Icon name="refresh-cw" className="w-4 h-4" />}
            >
              Ripristina selezionate ({selectedArchivedIds.length})
            </Button>
          </div>
        ) : undefined}
      >
        <div className="flex flex-col gap-2">
          {archivedLoading ? (
            <div className="flex justify-center py-10"><Spinner size="md" /></div>
          ) : archivedError ? (
            <div className="rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">{archivedError}</div>
          ) : archivedItems.length === 0 ? (
            <div className="rounded-md border border-dashed border-line dark:border-line-dark px-4 py-10 text-center text-sm text-muted dark:text-muted-dark">
              Nessuna task archiviata.
            </div>
          ) : (
            archivedItems.map((item) => {
              const archivedClient = item.client_id != null
                ? (clientsById.get(item.client_id)?.commercial_name ?? clientsById.get(item.client_id)?.name)
                : null;
              const archivedAt = item.deleted_at
                ? new Date(item.deleted_at).toLocaleString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
                : null;
              const checked = selectedArchivedIds.includes(item.id);
              return (
                <div key={item.id} className="flex items-start gap-2 rounded-lg border border-line dark:border-line-dark bg-paper p-2.5 dark:bg-[#131316]">
                  <span className="pt-0.5">
                    <Checkbox checked={checked} onChange={(c) => toggleArchivedSelection(item.id, c)} />
                  </span>
                  <div className="min-w-0 flex-1">
                    {archivedClient && (
                      <div className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">{archivedClient}</div>
                    )}
                    <div className="truncate text-[13px] font-medium text-ink dark:text-paper">{item.title}</div>
                    {archivedAt && (
                      <div className="mt-0.5 text-[11px] text-muted dark:text-muted-dark">Archiviata il {archivedAt}</div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void handleRestoreOne(item)}
                    disabled={restoringArchive}
                    leftIcon={<Icon name="refresh-cw" className="w-3.5 h-3.5" />}
                  >
                    Ripristina
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </RightSidebarPanel>

      {aiSplitOpen && isWideAiSplitLayout && typeof document !== "undefined" && createPortal(
        <>
          <div className="fixed inset-0 z-[12000] bg-ink/60 backdrop-blur-sm" onClick={closeAiSplit} aria-hidden="true" />
          <div className="fixed inset-0 z-[12010] flex items-center justify-center p-4">
            <div className="relative flex h-[88dvh] max-h-[88dvh] w-full max-w-[78rem] items-stretch gap-4">
              <button
                type="button"
                onClick={closeAiSplit}
                className="absolute right-0 top-0 z-[12020] inline-flex h-10 w-10 translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-paper/95 text-muted shadow-lg backdrop-blur transition-colors hover:text-ink dark:border-line-dark dark:bg-[#131316]/95 dark:text-muted-dark dark:hover:text-paper"
                aria-label="Chiudi editor AI contratto"
              >
                <Icon name="x" className="h-5 w-5" />
              </button>

              <div className="min-w-0 flex-[1.1]">
                <ContractDetailModal
                  open={aiSplitOpen}
                  contractId={aiContractId}
                  onClose={closeAiSplit}
                  isAdmin={isAdmin}
                  companyId={companyId}
                  modalPosition="center"
                  modalShowOverlay={false}
                  modalMobileFullscreen={false}
                  modalContainerClassName=""
                  modalDialogClassName={splitContractDialogClassName}
                  modalBodyClassName="overscroll-contain"
                  modalHideCloseButton
                  modalInline
                />
              </div>

              <div className="min-w-0 flex-[0.95]">
                <ContractAiWorkItemsSliderModal
                  open={aiSplitOpen}
                  contractId={aiContractId}
                  companyId={companyId}
                  users={users}
                  workAreas={workAreas}
                  workTags={workTags}
                  allowAi={canUseAiTasks}
                  allowManual={canUseManualTasks}
                  onClose={closeAiSplit}
                  modalPosition="center"
                  modalShowOverlay={false}
                  modalMobileFullscreen={false}
                  modalContainerClassName=""
                  modalDialogClassName={splitAiDialogClassName}
                  modalHideCloseButton
                  modalInline
                  onCreated={() => {
                    void refetch();
                  }}
                />
              </div>
            </div>
          </div>
        </>,
        document.body
      )}

      {aiSplitOpen && !isWideAiSplitLayout && (
        <div className="fixed inset-x-0 top-3 z-[3200] px-3 sm:px-4">
          <div className="mx-auto flex w-full max-w-md items-center justify-between rounded-full border border-line bg-paper/95 p-1 shadow-lg backdrop-blur dark:border-line-dark dark:bg-[#131316]/95">
            <button
              type="button"
              onClick={() => setAiCompactPane("contract")}
              className={`flex-1 rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${aiCompactPane === "contract" ? "bg-ink text-paper dark:bg-paper dark:text-ink" : "text-muted hover:bg-cream dark:text-muted-dark dark:hover:bg-[#1c1c20]"}`}
            >
              Contratto
            </button>
            <button
              type="button"
              onClick={() => setAiCompactPane("ai")}
              className={`flex-1 rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${aiCompactPane === "ai" ? "bg-ink text-paper dark:bg-paper dark:text-ink" : "text-muted hover:bg-cream dark:text-muted-dark dark:hover:bg-[#1c1c20]"}`}
            >
              Task
            </button>
          </div>
        </div>
      )}

      {!isWideAiSplitLayout && (
        <>
          <ContractDetailModal
            open={aiSplitOpen}
            contractId={aiContractId}
            onClose={closeAiSplit}
            isAdmin={isAdmin}
            companyId={companyId}
            modalPosition="center"
            modalShowOverlay={aiCompactPane === "contract"}
            modalMobileFullscreen
            modalContainerClassName={aiCompactPane === "contract" ? "z-[3010]" : "pointer-events-none opacity-0 z-[2990]"}
            modalDialogClassName={splitContractDialogClassName}
            modalHideCloseButton={aiSplitOpen}
          />

          <ContractAiWorkItemsSliderModal
            open={aiSplitOpen}
            contractId={aiContractId}
            companyId={companyId}
            users={users}
            workAreas={workAreas}
            workTags={workTags}
            allowAi={canUseAiTasks}
            allowManual={canUseManualTasks}
            onClose={closeAiSplit}
            modalPosition="center"
            modalShowOverlay={aiCompactPane === "ai"}
            modalMobileFullscreen
            modalContainerClassName={aiCompactPane === "ai" ? "z-[3010]" : "pointer-events-none opacity-0 z-[2990]"}
            modalDialogClassName={splitAiDialogClassName}
            modalHideCloseButton={aiSplitOpen}
            onCreated={() => {
              void refetch();
            }}
          />
        </>
      )}

      {formCompanyId != null && (
        <WorkItemFormModal
          open={modalOpen}
          onClose={closeModal}
          editingItem={editingItem}
          instantiateTemplate={instantiateTemplateItem}
          companyId={formCompanyId}
          isAdmin={isAdmin}
          onSaved={() => {
            setModalOpen(false);
            setEditingItem(null);
            setInstantiateTemplateItem(null);
            void refetch();
          }}
        />
      )}

      <ContractDetailModal
        open={taskAiSourceContractId != null}
        contractId={taskAiSourceContractId}
        onClose={closeContractDetailFromAiTask}
        isAdmin={isAdmin}
        companyId={companyId}
      />

      {/* ── Delete confirm modal ── */}
      <Modal
        open={bulkDeleteOpen}
        onClose={() => {
          if (!bulkDeleting) setBulkDeleteOpen(false);
        }}
        title="Elimina lavorazioni selezionate"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setBulkDeleteOpen(false)} disabled={bulkDeleting}>
              Annulla
            </Button>
            <Button variant="danger" onClick={handleBulkDelete} loading={bulkDeleting}>
              Elimina selezionate
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink dark:text-paper">
          Stai per eliminare <strong>{selectedItemIds.length}</strong> lavorazioni. L'azione è irreversibile.
        </p>
      </Modal>

      <Modal
        open={!!deletingItem}
        onClose={() => setDeletingItem(null)}
        title="Elimina lavorazione"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeletingItem(null)} disabled={deleting}>
              Annulla
            </Button>
            <Button variant="danger" onClick={handleDelete} loading={deleting}>
              Elimina
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink dark:text-paper">
          Stai per eliminare{" "}
          <strong>&quot;{deletingItem?.title}&quot;</strong>. L'azione è irreversibile.
        </p>
      </Modal>

      <QuickTaskModal
        open={quickTaskModalOpen}
        onClose={() => setQuickTaskModalOpen(false)}
        companyId={companyId}
        onCreated={() => {
          refetch();
        }}
      />

    </div>
  );
}
