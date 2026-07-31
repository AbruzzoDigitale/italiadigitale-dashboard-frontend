import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import "./work-items-page.css";
import { createPortal } from "react-dom";
import { useAuth } from "../hooks/useAuth";
import { useSelectedCompanyId } from "../hooks/useSelectedCompanyId";
import { useWorkItems } from "../hooks/useWorkItems";
import { subscribeRealtime } from "../features/realtime/realtimeBus";
import { useToast } from "../context/ToastContext";
import { useUndo } from "../context/UndoContext";
import {
  bulkDeleteWorkItemsApi,
  bulkRestoreWorkItemsApi,
  deleteWorkItemApi,
  generateWorkItemRecurrencesApi,
  getWorkItemApi,
  listArchivedWorkItemsApi,
  listWorkItemsApi,
  restoreWorkItemApi,
  updateWorkItemApi,
  listWorkTagsApi,
  isReviewSendBack,
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
import type { QuoteLineItem } from "../api/quotes";
import { Button } from "../components/ui/Button";
import { DropdownMenu } from "../components/ui/DropdownMenu";
import { SegmentedSwitch } from "../components/ui/SegmentedSwitch";
import { Badge } from "../components/ui/Badge";
import { Modal } from "../components/ui/Modal";
import { Checkbox } from "../components/ui/Checkbox";
import { Spinner } from "../components/ui/Spinner";
import { Icon } from "../components/ui/Icon";
import { Avatar } from "../components/ui/Avatar";
import { SearchableSelect } from "../components/ui/SearchableSelect";
import { RightSidebarPanel } from "../components/ui/RightSidebarPanel";
import { PageSectionHeader } from "../components/ui/PageSectionHeader";
import { WorkAreaBadge } from "../components/work-areas/WorkAreaBadge";
import { QuickTaskModal } from "../components/work-items/QuickTaskModal";
import { TrelloImportModal } from "../components/work-items/TrelloImportModal";
import { WorkItemFormModal } from "../components/work-items/WorkItemFormModal";
import { ReviewTab } from "../components/review/ReviewTab";
import { WorkItemCard } from "../components/work-items/WorkItemCard";
import { ContractDetailModal } from "../components/contracts/ContractDetailModal";
import { ContractAiWorkItemsSliderModal, type ContractQuoteLinePrecompile } from "../components/work-items/ContractAiWorkItemsSliderModal";
import { getCommercialStageTone } from "../utils/commercialStageTone";
import {
  getWorkboardPreferencesApi,
  updateWorkboardPreferencesApi,
  type BoardSortMode,
  type ColumnSort,
} from "../api/workboardPreferences";
import { sortColumnItems, DEFAULT_SORT_MODE } from "../utils/workboardSort";
import { formatDurationHuman } from "../utils/duration";
import type { IconName } from "../components/ui/Icon";

// ── Constants ──────────────────────────────────────────────────────────────────

const KANBAN_COLUMNS: { id: WorkItemStatus; label: string; color: string }[] = [
  { id: "planned", label: "Da fare", color: "#888780" },
  { id: "in_progress", label: "In corso", color: "#378ADD" },
  { id: "review", label: "Revisione", color: "#EF9F27" },
  { id: "completed", label: "Completato", color: "#639922" },
];

// Modalità di ordinamento colonna (etichette + icone per il menu in testata).
const SORT_MODE_META: { mode: BoardSortMode; label: string; icon: IconName }[] = [
  { mode: "recent", label: "Ultima aggiunta (più recenti)", icon: "clock" },
  { mode: "deadline_asc", label: "Scadenza ↑ (prima le vicine)", icon: "calendar" },
  { mode: "deadline_desc", label: "Scadenza ↓ (prima le lontane)", icon: "calendar" },
  { mode: "urgency", label: "Per urgenza", icon: "alert-triangle" },
  { mode: "custom", label: "Manuale (trascina)", icon: "arrows-v" },
];
const SORT_MODE_SHORT: Record<BoardSortMode, string> = {
  recent: "Recenti",
  deadline_asc: "Scadenza ↑",
  deadline_desc: "Scadenza ↓",
  urgency: "Urgenza",
  custom: "Manuale",
};

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
  return formatDurationHuman(n);
}

function effectiveHoursLabel(item: WorkItem): string {
  if (!item.affects_daily_load) return "0min effettive";
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
  // Ordinamento colonna (mostrato solo in vista globale).
  sortMode?: BoardSortMode;
  showSortControl?: boolean;
  onSetSortMode?: (status: WorkItemStatus, mode: BoardSortMode) => void;
  /** Status della card attualmente trascinata (per abilitare il riordino intra-colonna). */
  draggingStatus?: WorkItemStatus | null;
  /** Riordino manuale: inserisce i trascinati prima di `beforeId` (null = in coda). */
  onReorderCustom?: (status: WorkItemStatus, beforeId: number | null) => void;
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
  sortMode = DEFAULT_SORT_MODE,
  showSortControl = false,
  onSetSortMode,
  draggingStatus = null,
  onReorderCustom,
}: KanbanColumnProps) {
  const [isDropTarget, setIsDropTarget] = useState(false);
  // Indice di inserimento durante il riordino manuale (custom).
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  // Riordino intra-colonna abilitato solo quando: modalità manuale, il controllo
  // è visibile (vista globale) e si sta trascinando una card DELLA STESSA colonna.
  const canReorder = showSortControl && sortMode === "custom" && draggingStatus === column.id && !!onReorderCustom;

  const clearReorder = () => setDropIndex(null);

  return (
    <div
      className={`lv-col${compact ? " lv-col--grid" : ""}${isDropTarget ? " drop" : ""}`}
      data-stage={column.id}
      onDragOver={(e) => {
        if (!hasWorkItemDragType(e.dataTransfer?.types)) return;
        e.preventDefault();
        if (canReorder) return; // durante il riordino non evidenziare il drop di stato
        setIsDropTarget(true);
      }}
      onDragLeave={() => setIsDropTarget(false)}
      onDrop={() => {
        setIsDropTarget(false);
        if (canReorder) return; // il drop di riordino è gestito nel body
        onDrop(column.id);
      }}
    >
      <div className="lv-col-head">
        <span className="lv-col-dot" style={{ background: column.color }} />
        <span className="lv-col-name">{column.label}</span>
        <span className="lv-col-count">{items.length}</span>
        {showSortControl && onSetSortMode && (
          <DropdownMenu
            label={`Ordina: ${SORT_MODE_SHORT[sortMode]}`}
            icon="arrows-v"
            variant="ghost"
            size="sm"
            align="right"
            className="lv-col-sort"
            items={SORT_MODE_META.map((m) => ({
              key: m.mode,
              label: m.label,
              icon: m.icon,
              active: sortMode === m.mode,
              onClick: () => onSetSortMode(column.id, m.mode),
            }))}
          />
        )}
      </div>
      <div
        className="lv-col-body"
        onDragOver={canReorder ? (e) => { e.preventDefault(); e.stopPropagation(); setDropIndex(items.length); } : undefined}
        onDrop={canReorder ? (e) => {
          e.preventDefault();
          e.stopPropagation();
          const idx = dropIndex ?? items.length;
          onReorderCustom?.(column.id, idx < items.length ? items[idx].id : null);
          clearReorder();
        } : undefined}
      >
        {items.map((item, idx) => (
          <div
            key={item.id}
            className={`lv-reorder-slot${canReorder && dropIndex === idx ? " insert-before" : ""}${canReorder && dropIndex === items.length && idx === items.length - 1 ? " insert-after" : ""}`}
            onDragOver={canReorder ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              const r = e.currentTarget.getBoundingClientRect();
              setDropIndex(e.clientY > r.top + r.height / 2 ? idx + 1 : idx);
            } : undefined}
          >
            <WorkItemCard
              item={item}
              clientName={item.client_id != null ? (clientsById.get(item.client_id)?.commercial_name ?? clientsById.get(item.client_id)?.name) : undefined}
              users={users}
              workAreas={workAreas}
              workTags={workTags}
              isAdmin={isAdmin}
              isSelected={selectedItemIds.includes(item.id)}
              onToggleSelect={onToggleSelect}
              onDragStartItem={onDragStartItem}
              onDragEndItem={(e) => { onDragEndItem(e); clearReorder(); }}
              onEdit={onEdit}
              onDelete={onDelete}
              onRegenerateRecurrences={onRegenerateRecurrences}
              onInstantiateFromTemplate={onInstantiateFromTemplate}
              onOpenAiSourceContract={onOpenAiSourceContract}
            />
          </div>
        ))}
        {items.length === 0 && <div className="lv-col-empty">Nessuna lavorazione</div>}
      </div>
    </div>
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
  const { registerUndo } = useUndo();
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
  // Drag&drop board: trascinamento anche MULTIPLO (se la card è nella selezione).
  const dragIdsRef = useRef<number[]>([]);
  // Ghost "fisico" per il drag multiplo: pila di card che segue il cursore.
  const [dragCount, setDragCount] = useState(0);
  const dragGhostRef = useRef<HTMLDivElement | null>(null);
  const dragStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const setDragGhost = (el: HTMLDivElement | null) => {
    dragGhostRef.current = el;
    if (el) {
      const { x, y } = dragStartPosRef.current;
      el.style.transform = `translate3d(${x + 16}px, ${y + 16}px, 0)`;
    }
  };

  // ── Archivio (task soft-deleted) — solo admin/PM
  const [archivePanelOpen, setArchivePanelOpen] = useState(false);
  const [archivedItems, setArchivedItems] = useState<WorkItem[]>([]);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [archivedError, setArchivedError] = useState<string | null>(null);
  // Ricerca dentro l'archivio (pannello) e corrispondenze archiviate per la
  // ricerca generale della pagina.
  const [archiveQuery, setArchiveQuery] = useState("");
  const [archivedMatches, setArchivedMatches] = useState<WorkItem[]>([]);
  const [selectedArchivedIds, setSelectedArchivedIds] = useState<number[]>([]);
  const [restoringArchive, setRestoringArchive] = useState(false);

  // ── Clients list (for toolbar filter)
  const [clients, setClients] = useState<Client[]>([]);
  useEffect(() => {
    getClientsApi({ company_id: companyId ?? undefined, per_page: 1000 })
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
  // Realtime: quando lo stream SSE spinge un evento (task modificata/cambio stato/commento),
  // ricarica in silenzio le lavorazioni senza refresh di pagina.
  useEffect(() => subscribeRealtime(() => { void refetch(true); }), [refetch]);
  const [displayedWorkItems, setDisplayedWorkItems] = useState<WorkItem[]>([]);
  // Ordinamento delle colonne (per operatore × azienda) + status della card trascinata.
  const [boardSort, setBoardSort] = useState<Record<string, ColumnSort>>({});
  const [draggingStatus, setDraggingStatus] = useState<WorkItemStatus | null>(null);
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
  // Cambio stato via drag con commento opzionale (timeline).
  const [pendingStatusChange, setPendingStatusChange] = useState<{ items: WorkItem[]; newStatus: WorkItemStatus } | null>(null);
  const [statusChangeComment, setStatusChangeComment] = useState("");
  const [statusChangeSaving, setStatusChangeSaving] = useState(false);
  // Rimando da revisione (drag di una singola task): mostra SOLO la scheda Revisione.
  const [reviewItem, setReviewItem] = useState<WorkItem | null>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<number[]>([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const [quickTaskModalOpen, setQuickTaskModalOpen] = useState(false);
  const [trelloImportOpen, setTrelloImportOpen] = useState(false);
  const [taskAiSourceContractId, setTaskAiSourceContractId] = useState<number | null>(null);
  const [aiContractId, setAiContractId] = useState<number | null>(null);
  const [aiSplitOpen, setAiSplitOpen] = useState(false);
  const [aiCompactPane, setAiCompactPane] = useState<"contract" | "ai">("ai");
  const [precompileLine, setPrecompileLine] = useState<ContractQuoteLinePrecompile | null>(null);
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
    setPrecompileLine(null);
  };

  // Chiave stabile della voce: regge i re-save del preventivo (che ricreano i quote_items).
  const buildLineKey = (line: QuoteLineItem, quoteId: number): string =>
    [quoteId, line.area ?? "", line.name.trim().toLowerCase(), line.period ?? "", line.net].join("|");

  const handleQuoteLinePrecompile = (line: QuoteLineItem, quoteId: number) => {
    setPrecompileLine({
      name: line.name,
      desc: line.desc ?? null,
      // Snapshot della voce sorgente: base della fatturazione per-voce.
      billing_source: {
        quote_id: quoteId,
        line_key: buildLineKey(line, quoteId),
        label: line.name,
        description: line.desc ?? null,
        billing_period: line.period ?? null,
        unit_net: line.net,
        quantity: line.quantity ?? 1,
        discount_pct: line.discountPct ?? 0,
        vat: line.vat ?? null,
        area_id: null,
        area_name: line.area ?? null,
      },
    });
    if (!isWideAiSplitLayout) setAiCompactPane("ai");
  };

  const splitContractDialogClassName = isWideAiSplitLayout
    ? "w-full max-w-none h-full max-h-none rounded-2xl"
    : "pt-16 sm:pt-20 xl:pt-0";

  const splitAiDialogClassName = isWideAiSplitLayout
    ? "w-full max-w-none h-full max-h-none rounded-2xl"
    : "pt-16 sm:pt-20 xl:pt-0";

  // Deep-link condivisibile: `?task=<id>` apre (e mantiene in URL) il modal della
  // lavorazione, così copiando il link chi lo apre vede subito la task aperta.
  // Retrocompatibilità: `?open=create` (nuova) e il vecchio `?open=<id>` → `?task`.
  const deepLinkedRef = useRef<number | null>(null);

  const clearTaskParam = () => {
    deepLinkedRef.current = null;
    const next = new URLSearchParams(searchParams);
    if (!next.has("task")) return;
    next.delete("task");
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    const openParam = searchParams.get("open");
    if (openParam === "create") {
      const next = new URLSearchParams(searchParams);
      next.delete("open");
      setSearchParams(next, { replace: true });
      setEditingItem(null);
      setInstantiateTemplateItem(null);
      setModalOpen(true);
      return;
    }
    // Normalizza il vecchio ?open=<id> nel nuovo link condivisibile ?task=<id>.
    if (openParam && !Number.isNaN(Number(openParam))) {
      const next = new URLSearchParams(searchParams);
      next.delete("open");
      next.set("task", openParam);
      setSearchParams(next, { replace: true });
      return;
    }

    const taskParam = searchParams.get("task");
    if (!taskParam) {
      deepLinkedRef.current = null;
      return;
    }
    const id = Number(taskParam);
    if (Number.isNaN(id) || deepLinkedRef.current === id) return;

    // Evita di riscaricare se la task è già quella aperta (es. apertura dalla board).
    deepLinkedRef.current = id;
    getWorkItemApi(id)
      .then((item) => {
        setEditingItem(item);
        setInstantiateTemplateItem(null);
        setModalOpen(true);
        // Allinea il company_id per caricare il contesto board giusto.
        if (item.company_id != null && searchParams.get("company_id") !== String(item.company_id)) {
          const next = new URLSearchParams(searchParams);
          next.set("company_id", String(item.company_id));
          setSearchParams(next, { replace: true });
        }
      })
      .catch(() => {
        deepLinkedRef.current = null;
        clearTaskParam();
        toast.error("Lavorazione non trovata o non accessibile");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, setSearchParams, toast]);

  const openEdit = (item: WorkItem) => {
    deepLinkedRef.current = item.id; // già "gestita": l'effetto non riscaricherà
    setEditingItem(item);
    setInstantiateTemplateItem(null);
    setModalOpen(true);
    const next = new URLSearchParams(searchParams);
    next.set("task", String(item.id));
    setSearchParams(next, { replace: true });
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingItem(null);
    setInstantiateTemplateItem(null);
    clearTaskParam();
    // Le azioni della scheda Revisione (consegna al cliente, peso, scadenza) salvano
    // fuori dal "Salva" del modale: rinfresca la board alla chiusura per rifletterle.
    void refetch(true);
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
      await refetch(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nell'eliminazione bulk");
    } finally {
      setBulkDeleting(false);
    }
  };

  // ── Delete item
  const handleDelete = async () => {
    if (!deletingItem) return;
    const { id, title } = deletingItem;
    setDeleting(true);
    try {
      await deleteWorkItemApi(id);
      setDeletingItem(null);
      await refetch(true);
      registerUndo({
        label: `Lavorazione "${title}" eliminata`,
        undo: async () => {
          await restoreWorkItemApi(id);
          await refetch(true);
        },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nell'eliminazione");
    } finally {
      setDeleting(false);
    }
  };

  // ── Archivio: carica le task archiviate dell'azienda (con ricerca opzionale)
  const loadArchived = async (q?: string) => {
    if (companyId == null) {
      setArchivedItems([]);
      return;
    }
    setArchivedLoading(true);
    setArchivedError(null);
    try {
      const term = (q ?? "").trim();
      const items = await listArchivedWorkItemsApi({ company_id: companyId, ...(term ? { q: term } : {}) });
      setArchivedItems(items);
    } catch (err) {
      setArchivedError(err instanceof Error ? err.message : "Impossibile recuperare l'archivio");
      setArchivedItems([]);
    } finally {
      setArchivedLoading(false);
    }
  };

  const openArchive = (initialQuery = "") => {
    setSelectedArchivedIds([]);
    setArchiveQuery(initialQuery);
    setArchivePanelOpen(true);
    void loadArchived(initialQuery);
  };

  // Ricerca dentro il pannello archivio (debounce).
  useEffect(() => {
    if (!archivePanelOpen) return;
    const t = window.setTimeout(() => void loadArchived(archiveQuery), 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archiveQuery, archivePanelOpen, companyId]);

  // Ricerca GENERALE della pagina: cerca anche tra le archiviate, così i
  // risultati non "spariscono" quando una task viene archiviata.
  useEffect(() => {
    const term = search.trim();
    if (!term || companyId == null) {
      setArchivedMatches([]);
      return;
    }
    let alive = true;
    const t = window.setTimeout(() => {
      listArchivedWorkItemsApi({ company_id: companyId, q: term })
        .then((items) => { if (alive) setArchivedMatches(items); })
        .catch(() => { if (alive) setArchivedMatches([]); });
    }, 350);
    return () => { alive = false; window.clearTimeout(t); };
  }, [search, companyId]);

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
      await refetch(true);
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
      await refetch(true);
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
      await refetch(true);
    } catch (err) {
      if (isWorkItemError(err, 422)) {
        toast.error(err instanceof Error ? err.message.replace(/^\[422\]\s*/, "") : "Dati non validi");
      } else {
        toast.error(err instanceof Error ? err.message : "Errore rigenerazione occorrenze");
      }
    }
  };

  // ── Drag and drop
  // Applica il cambio stato (con commento opzionale) ottimisticamente, con rollback.
  const commitStatusChange = async (item: WorkItem, newStatus: WorkItemStatus, comment: string): Promise<boolean> => {
    const previousStatus = item.status;
    setDisplayedWorkItems((current) => current.map((w) => (w.id === item.id ? { ...w, status: newStatus } : w)));
    try {
      const updated = await updateWorkItemApi(item.id, {
        status: newStatus,
        status_comment: comment.trim() || undefined,
      });
      setDisplayedWorkItems((current) => current.map((w) => (w.id === item.id ? updated : w)));
      const colLabel = KANBAN_COLUMNS.find((c) => c.id === newStatus)?.label ?? newStatus;
      registerUndo({
        label: `"${item.title}" spostata in ${colLabel}`,
        undo: async () => {
          const reverted = await updateWorkItemApi(item.id, { status: previousStatus });
          setDisplayedWorkItems((current) => current.map((w) => (w.id === item.id ? reverted : w)));
          void refetch(true);
        },
      });
      return true;
    } catch {
      setDisplayedWorkItems((current) => current.map((w) => (w.id === item.id ? { ...w, status: previousStatus } : w)));
      toast.error("Impossibile cambiare lo stato");
      return false;
    }
  };

  // Il ghost segue il cursore durante il drag multiplo (con leggero trailing "fisico").
  useEffect(() => {
    if (dragCount === 0) return;
    const onDragOver = (e: DragEvent) => {
      const g = dragGhostRef.current;
      if (g) g.style.transform = `translate3d(${e.clientX + 16}px, ${e.clientY + 16}px, 0)`;
    };
    document.addEventListener("dragover", onDragOver);
    return () => document.removeEventListener("dragover", onDragOver);
  }, [dragCount]);

  // Drop su una colonna. Chiede un commento SOLO quando si torna indietro da
  // "revisione"/"completato" (rimando indietro); altrimenti applica subito.
  const handleDrop = (newStatus: WorkItemStatus) => {
    const ids = dragIdsRef.current;
    dragIdsRef.current = [];
    setDragCount(0);
    if (ids.length === 0) return;
    // Solo le task che cambiano davvero stato.
    const items = ids
      .map((id) => displayedWorkItems.find((w) => w.id === id))
      .filter((w): w is WorkItem => !!w && w.status !== newStatus);
    if (items.length === 0) return;
    // Rimando indietro da revisione: per UNA task apri direttamente la scheda
    // Revisione (la task è ancora in "review" → il modale si apre su quella tab),
    // dove "Rimanda a correggere" applica la logica corretta (contatori + thread).
    // Per più task insieme resta il modale rapido con il motivo condiviso.
    const sendBacks = items.filter((it) => isReviewSendBack(it.status, newStatus));
    if (sendBacks.length > 0) {
      // Rimando indietro da REVISIONE di una singola task → scheda Revisione
      // (logica corretta: contatori/peso + thread commenti).
      // Riapertura da COMPLETATO (o rimando multiplo) → modale rapido con commento
      // OPZIONALE: la scheda Revisione non offre azioni per una task già completata.
      if (items.length === 1 && items[0].status === "review") {
        setReviewItem(items[0]);
        return;
      }
      setStatusChangeComment("");
      setPendingStatusChange({ items, newStatus });
    } else {
      void Promise.all(items.map((it) => commitStatusChange(it, newStatus, "")));
    }
  };

  const applyStatusChange = async () => {
    if (!pendingStatusChange) return;
    const { items, newStatus } = pendingStatusChange;
    setStatusChangeSaving(true);
    const results = await Promise.all(items.map((it) => commitStatusChange(it, newStatus, statusChangeComment)));
    setStatusChangeSaving(false);
    if (results.every(Boolean)) {
      setPendingStatusChange(null);
      setStatusChangeComment("");
    }
  };

  const handleDragStartItem = (event: React.DragEvent<HTMLDivElement>, itemId: number) => {
    // Se la card trascinata è nella selezione multipla, sposta tutta la selezione.
    const ids = selectedItemIds.includes(itemId) && selectedItemIds.length > 1 ? [...selectedItemIds] : [itemId];
    dragIdsRef.current = ids;
    setDraggingStatus(displayedWorkItems.find((w) => w.id === itemId)?.status ?? null);
    if (event.dataTransfer) {
      event.dataTransfer.setData("application/work-item-id", String(itemId));
      event.dataTransfer.setData("text/plain", String(itemId));
      event.dataTransfer.effectAllowed = "move";
    }
    if (ids.length > 1) {
      // Nasconde l'immagine di drag nativa: usiamo il ghost custom animato.
      const blank = document.createElement("div");
      blank.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;";
      document.body.appendChild(blank);
      event.dataTransfer.setDragImage(blank, 0, 0);
      setTimeout(() => document.body.removeChild(blank), 0);
      dragStartPosRef.current = { x: event.clientX, y: event.clientY };
      setDragCount(ids.length);
    }
    event.currentTarget.style.opacity = "0.45";
  };

  const handleDragEndItem = (event: React.DragEvent<HTMLDivElement>) => {
    dragIdsRef.current = [];
    setDragCount(0);
    setDraggingStatus(null);
    event.currentTarget.style.opacity = "";
  };

  // ── Ordinamento board (per operatore × azienda) ──────────────────────────────
  useEffect(() => {
    if (companyId == null) return;
    let alive = true;
    getWorkboardPreferencesApi(companyId)
      .then((p) => { if (alive) setBoardSort(p.column_sort ?? {}); })
      .catch(() => { if (alive) setBoardSort({}); });
    return () => { alive = false; };
  }, [companyId]);

  const persistBoardSort = (next: Record<string, ColumnSort>) => {
    setBoardSort(next);
    if (companyId == null) return;
    void updateWorkboardPreferencesApi({ company_id: companyId, column_sort: next }).catch((e: Error) =>
      toast.error(e.message),
    );
  };

  const setColumnSortMode = (status: WorkItemStatus, mode: BoardSortMode) => {
    const prevConf = boardSort[status] ?? { mode: DEFAULT_SORT_MODE, order: [] };
    let order = prevConf.order ?? [];
    if (mode === "custom") {
      // Alla prima attivazione del manuale, "congela" l'ordine attualmente mostrato.
      order = sortColumnItems(
        displayedWorkItems.filter((w) => w.status === status && !w.is_template),
        prevConf,
      ).map((w) => w.id);
    }
    persistBoardSort({ ...boardSort, [status]: { mode, order } });
  };

  const reorderColumnCustom = (status: WorkItemStatus, beforeId: number | null) => {
    const dragged = dragIdsRef.current.length ? [...dragIdsRef.current] : [];
    if (!dragged.length) return;
    const conf = boardSort[status] ?? { mode: "custom" as BoardSortMode, order: [] };
    // Ordine completo (non filtrato) della colonna, così i filtri non perdono posizioni.
    const fullOrder = sortColumnItems(
      displayedWorkItems.filter((w) => w.status === status && !w.is_template),
      conf,
    ).map((w) => w.id);
    const draggingSet = new Set(dragged);
    const draggedOrdered = fullOrder.filter((id) => draggingSet.has(id));
    const without = fullOrder.filter((id) => !draggingSet.has(id));
    // Àncora = primo id NON trascinato a partire da beforeId (se beforeId è a sua
    // volta trascinato, scorri avanti fino al prossimo stabile).
    let anchorId: number | null = beforeId;
    if (anchorId != null && draggingSet.has(anchorId)) {
      anchorId = null;
      for (let i = fullOrder.indexOf(beforeId as number); i < fullOrder.length; i++) {
        if (!draggingSet.has(fullOrder[i])) { anchorId = fullOrder[i]; break; }
      }
    }
    const anchor = anchorId != null ? without.indexOf(anchorId) : -1;
    const insertPos = anchor === -1 ? without.length : anchor;
    const newOrder = [...without.slice(0, insertPos), ...draggedOrdered, ...without.slice(insertPos)];
    persistBoardSort({ ...boardSort, [status]: { mode: "custom", order: newOrder } });
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
  const formCompanyId = editingItem?.company_id ?? companyId;

  // ── Render
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden px-6 py-6 mx-auto w-full animate-fadeIn">
      <PageSectionHeader
        icon={<Icon name="list" className="w-6 h-6" />}
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
            ...users.map((u) => ({ value: String(u.id), label: u.full_name ?? u.username, avatarUrl: u.avatar_url })),
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
        <SegmentedSwitch
          value={viewMode}
          onChange={setViewMode}
          ariaLabel="Vista lavorazioni"
          options={[
            { value: "global", label: <><Icon name="list" className="h-3.5 w-3.5" />Globale</> },
            { value: "by_client", label: <><Icon name="building" className="h-3.5 w-3.5" />Per cliente</> },
          ]}
        />
        {/* Filtri secondari: sola icona; variante "secondary" quando ce ne sono di attivi. */}
        <Button
          variant={secondaryFiltersCount > 0 ? "secondary" : "ghost"}
          iconOnly
          onClick={() => setFiltersPanelOpen(true)}
          title={secondaryFiltersCount > 0 ? `Filtri (${secondaryFiltersCount})` : "Filtri"}
          aria-label="Filtri"
          leftIcon={<Icon name="filter" className="w-4 h-4" />}
        />
        {/* Azioni secondarie accorpate: evita righe di bottoni in testata. */}
        <DropdownMenu
          label="Altre azioni"
          items={[
            {
              key: "quick",
              label: "Task rapida",
              icon: "plus",
              onClick: () => setQuickTaskModalOpen(true),
              disabled: companyId == null,
            },
            isAdmin && {
              key: "template",
              label: "Template",
              icon: "document-text",
              onClick: openTemplatePanel,
              disabled: companyId == null,
            },
            canManageWorkItems && {
              key: "trello-import",
              label: "Importa da Trello",
              icon: "trello",
              onClick: () => setTrelloImportOpen(true),
              disabled: companyId == null,
            },
            {
              // Archivio consultabile da tutti: ognuno vede solo le task che
              // vedrebbe comunque (gli operatori le proprie).
              key: "archive",
              label: "Archivio",
              icon: "trash",
              onClick: openArchive,
              separatorBefore: true,
            },
            canManageWorkItems && selectedItemIds.length > 0 && {
              key: "bulk-archive",
              label: "Archivia selezionate",
              icon: "trash",
              danger: true,
              trailing: String(selectedItemIds.length),
              onClick: () => setBulkDeleteOpen(true),
              separatorBefore: true,
            },
          ]}
        />
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

      {/* La ricerca generale trova anche tra le ARCHIVIATE: qui la scorciatoia. */}
      {search.trim() && archivedMatches.length > 0 && (
        <button
          type="button"
          onClick={() => openArchive(search)}
          className="mb-3 flex w-full items-center gap-2 rounded-md border border-line bg-cream/60 px-3 py-2 text-left text-[13px] text-ink transition-colors hover:border-brand-magenta dark:border-line-dark dark:bg-[#1c1c20] dark:text-paper"
        >
          <Icon name="trash" className="h-4 w-4 flex-none text-muted dark:text-muted-dark" />
          <span className="min-w-0 flex-1">
            <b>{archivedMatches.length}</b> lavorazion{archivedMatches.length === 1 ? "e" : "i"} archiviat
            {archivedMatches.length === 1 ? "a" : "e"} corrispond{archivedMatches.length === 1 ? "e" : "ono"} a “{search.trim()}”
          </span>
          <span className="flex-none text-[12px] font-semibold text-brand-magenta">Apri archivio →</span>
        </button>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="wi-page flex min-h-0 flex-1 items-stretch gap-3">
        {canManageWorkItems && (
        <aside
          className={`shrink-0 ct-side ${contractsPanelCollapsed ? "ct-rail" : "ct-panel"}`}
          onClick={contractsPanelCollapsed ? () => setContractsPanelCollapsed(false) : undefined}
          role={contractsPanelCollapsed ? "button" : undefined}
          tabIndex={contractsPanelCollapsed ? 0 : undefined}
          title={contractsPanelCollapsed ? "Espandi contratti" : undefined}
        >
          {contractsPanelCollapsed ? (
            <>
              <span className="ct-rail-exp" aria-hidden="true">
                <Icon name="chevron-right" className="h-4 w-4" />
              </span>
              <div className="ct-rail-label">Contratti</div>
              <div className="ct-rail-stats">
                <div className="ct-rail-stat" title="Firmati">
                  <i style={{ background: "var(--mint)" }} />
                  <b>{signedContracts.length}</b>
                </div>
                <div className="ct-rail-stat" title="In produzione">
                  <i style={{ background: "var(--ct-accent)" }} />
                  <b>{inProductionContracts.length}</b>
                </div>
                <div className="ct-rail-stat" title="Completati">
                  <i style={{ background: "oklch(0.64 0.15 142)" }} />
                  <b>{completedContracts.length}</b>
                </div>
              </div>
            </>
          ) : (
            <div className="ct-panel-head">
              <span className="ct-col-dot" style={{ background: "var(--ct-accent)" }} />
              <span className="ct-panel-name">Contratti</span>
              <span className="ct-panel-count">{focusContracts.length}</span>
              <button
                type="button"
                className="ct-collapse"
                onClick={() => setContractsPanelCollapsed(true)}
                aria-label="Comprimi"
              >
                <Icon name="chevron-right" className="h-4 w-4 rotate-180" />
              </button>
            </div>
          )}

          {!contractsPanelCollapsed && (
            <div className="ct-panel-body">
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
        )}

        <div className="min-w-0 flex-1 flex flex-col min-h-0">
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
            <div ref={boardRef} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
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
                            items={sortColumnItems(group.items.filter((w) => w.status === col.id), boardSort[col.id])}
                            sortMode={boardSort[col.id]?.mode ?? DEFAULT_SORT_MODE}
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
            /* Kanban board — layout orizzontale (stile prototipo) */
            <div ref={boardRef} className="wi-board">
              <div className="wi-board-inner">
                {KANBAN_COLUMNS.map((col) => {
                  const colItems = sortColumnItems(filteredItems.filter((w) => w.status === col.id), boardSort[col.id]);
                  return (
                    <KanbanColumn
                      key={col.id}
                      column={col}
                      items={colItems}
                      sortMode={boardSort[col.id]?.mode ?? DEFAULT_SORT_MODE}
                      showSortControl
                      onSetSortMode={setColumnSortMode}
                      draggingStatus={draggingStatus}
                      onReorderCustom={reorderColumnCustom}
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
            </div>
          )}
        </div>
      </div>

      {/* Footer hint — fuori dalla riga board così Contratti e colonne restano alla stessa altezza */}
      {!isLoading && (
        <p className="mt-3 shrink-0 text-center text-[11px] text-muted dark:text-muted-dark">
          Trascina una card tra le colonne per cambiare stato.
        </p>
      )}

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
          {/* Ricerca dentro l'archivio (titolo, descrizione, cliente) */}
          <div className="relative mb-1">
            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={archiveQuery}
              onChange={(e) => setArchiveQuery(e.target.value)}
              placeholder="Cerca nelle archiviate…"
              className="w-full rounded-md border border-line bg-paper py-2.5 pl-9 pr-3 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none dark:border-line-dark dark:bg-ink-soft dark:text-paper"
            />
          </div>
          {archivedLoading ? (
            <div className="flex justify-center py-10"><Spinner size="md" /></div>
          ) : archivedError ? (
            <div className="rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">{archivedError}</div>
          ) : archivedItems.length === 0 ? (
            <div className="rounded-md border border-dashed border-line dark:border-line-dark px-4 py-10 text-center text-sm text-muted dark:text-muted-dark">
              {archiveQuery.trim() ? "Nessun risultato in archivio." : "Nessuna task archiviata."}
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
                  onQuoteLineClick={handleQuoteLinePrecompile}
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
                  precompileLine={precompileLine}
                  onPrecompileConsumed={() => setPrecompileLine(null)}
                  onCreated={() => {
                    void refetch(true);
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
            onQuoteLineClick={handleQuoteLinePrecompile}
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
            precompileLine={precompileLine}
            onPrecompileConsumed={() => setPrecompileLine(null)}
            onCreated={() => {
              void refetch(true);
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
          canManageReviewer={canManageWorkItems}
          onSaved={(savedItem) => {
            const prev = editingItem; // snapshot pre-modifica (null in creazione)
            setModalOpen(false);
            setEditingItem(null);
            setInstantiateTemplateItem(null);
            clearTaskParam();
            void refetch(true);
            if (prev) {
              // MODIFICA → undo = rimetti i valori precedenti (best-effort sui campi principali).
              registerUndo({
                label: `Modifiche a "${prev.title}"`,
                undo: async () => {
                  await updateWorkItemApi(prev.id, {
                    title: prev.title,
                    description: prev.description ?? null,
                    work_date: prev.work_date ?? null,
                    start_time: prev.start_time ?? null,
                    deadline_date: prev.deadline_date ?? null,
                    due_time_label: prev.due_time_label ?? null,
                    estimated_hours: prev.estimated_hours ?? null,
                    load_weight_factor: prev.load_weight_factor,
                    affects_daily_load: prev.affects_daily_load,
                    status: prev.status,
                    progress_percent: prev.progress_percent,
                    urgency_level: prev.urgency_level ?? null,
                    is_priority: prev.is_priority,
                    is_deadline_locked: prev.is_deadline_locked,
                    is_fractionable: prev.is_fractionable,
                    is_left_behind: prev.is_left_behind,
                    left_behind_reason: prev.left_behind_reason ?? null,
                    left_behind_note: prev.left_behind_note ?? null,
                    client_id: prev.client_id ?? null,
                    is_PED: prev.is_PED,
                    assignee_ids: prev.assignee_ids ?? [],
                    work_area_ids: prev.work_area_ids ?? [],
                    tag_ids: prev.tag_ids ?? [],
                  });
                  await refetch(true);
                },
              });
            } else if (savedItem) {
              // CREAZIONE → undo = elimina la lavorazione creata.
              registerUndo({
                label: `Lavorazione "${savedItem.title}" creata`,
                undo: async () => {
                  await deleteWorkItemApi(savedItem.id);
                  await refetch(true);
                },
              });
            }
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

      <Modal
        open={!!pendingStatusChange}
        onClose={() => {
          if (statusChangeSaving) return;
          setPendingStatusChange(null);
          setStatusChangeComment("");
        }}
        title="Rimanda indietro"
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => { setPendingStatusChange(null); setStatusChangeComment(""); }}
              disabled={statusChangeSaving}
            >
              Annulla
            </Button>
            <Button variant="primary" onClick={applyStatusChange} loading={statusChangeSaving}>
              Conferma
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-2">
          <p className="text-sm text-ink dark:text-paper">
            Sposti{" "}
            <strong>
              {pendingStatusChange && pendingStatusChange.items.length === 1
                ? `"${pendingStatusChange.items[0].title}"`
                : `${pendingStatusChange?.items.length ?? 0} lavorazioni`}
            </strong>{" "}
            in{" "}
            <strong>
              {KANBAN_COLUMNS.find((c) => c.id === pendingStatusChange?.newStatus)?.label ?? pendingStatusChange?.newStatus}
            </strong>
            .
          </p>
          <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
            Motivo del rimando (opzionale)
          </label>
          <textarea
            value={statusChangeComment}
            onChange={(e) => setStatusChangeComment(e.target.value)}
            placeholder="Es. rimandata in lavorazione: rivedere il claim…"
            rows={3}
            maxLength={2000}
            autoFocus
            className="w-full rounded-md border border-line bg-paper px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none dark:border-line-dark dark:bg-ink-soft dark:text-paper dark:placeholder:text-muted-dark dark:focus:border-paper"
          />
          <p className="text-[11px] text-muted dark:text-muted-dark">
            Verrà salvato nella timeline della lavorazione, accanto al cambio di stato.
          </p>
        </div>
      </Modal>

      {/* Rimando da revisione (drag di una singola task): solo la scheda Revisione. */}
      <Modal
        open={!!reviewItem}
        onClose={() => { setReviewItem(null); void refetch(true); }}
        title={reviewItem ? `Revisione · ${reviewItem.title}` : "Revisione"}
        size="xl"
      >
        {reviewItem ? (
          <ReviewTab
            workItemId={reviewItem.id}
            canManage={canManageWorkItems}
            companyId={companyId ?? undefined}
            onChanged={() => void refetch(true)}
            onSentBack={() => { setReviewItem(null); void refetch(true); }}
          />
        ) : null}
      </Modal>

      {companyId != null && (
        <TrelloImportModal
          open={trelloImportOpen}
          onClose={() => setTrelloImportOpen(false)}
          companyId={companyId}
          users={users}
          onImported={() => void refetch(true)}
        />
      )}

      <QuickTaskModal
        open={quickTaskModalOpen}
        onClose={() => setQuickTaskModalOpen(false)}
        companyId={companyId}
        onCreated={(response) => {
          void refetch(true);
          const created = response.item;
          if (created) {
            registerUndo({
              label: `Task rapida "${created.title}" creata`,
              undo: async () => {
                await deleteWorkItemApi(created.id);
                await refetch(true);
              },
            });
          }
        }}
      />

      {dragCount > 1 &&
        createPortal(
          <div ref={setDragGhost} className="wl-drag-ghost" aria-hidden>
            <span className="wl-drag-ghost-stack">
              <span className="wl-drag-ghost-card c3" />
              <span className="wl-drag-ghost-card c2" />
              <span className="wl-drag-ghost-card c1">
                <Icon name="list" className="h-3.5 w-3.5" /> {dragCount} lavorazioni
              </span>
              <span className="wl-drag-ghost-badge">{dragCount}</span>
            </span>
          </div>,
          document.body
        )}
    </div>
  );
}
