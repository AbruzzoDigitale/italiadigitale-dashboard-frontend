import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  createWorkItemApi,
  instantiateWorkItemTemplateApi,
  listWorkItemsApi,
  updateWorkItemApi,
  listWorkTagsApi,
  createTimeSlotApi,
  updateTimeSlotApi,
  deleteTimeSlotApi,
  type WorkItem,
  type WorkItemStatus,
  type UrgencyLevel,
  type LeftBehindReason,
  type WorkItemRecurrenceType,
  type TimeSlot,
  type CreateWorkItemPayload,
  type WorkTag,
} from "../../api/workItems";
import { listCompanyWorkloadPoliciesApi, type CompanyWorkloadPolicy } from "../../api/companies";
import { listWorkAreasApi, type WorkArea } from "../../api/workAreas";
import { getUsersApi, type User } from "../../api/users";
import { getClientsApi, type Client } from "../../api/clients";
import { listPedConfigurationsApi, type PedConfiguration } from "../../api/pedConfigurations";
import { ClientSelectorWithCreate } from "../clients/ClientSelectorWithCreate";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { Icon } from "../ui/Icon";
import { MultiSelect } from "../ui/MultiSelect";
import { SearchableSelect } from "../ui/SearchableSelect";
import { Checkbox } from "../ui/Checkbox";
import { Textarea } from "../ui/Textarea";
import { WorkAreaCreateModal } from "../work-taxonomy/WorkAreaCreateModal";
import { WorkTagCreateModal } from "../work-taxonomy/WorkTagCreateModal";
import { useToast } from "../../context/ToastContext";
import { useWorkItemDetail } from "../../hooks/useWorkItemDetail";

// ── Constants ──────────────────────────────────────────────────────────────────

const URGENCY_OPTIONS: { value: UrgencyLevel; label: string }[] = [
  { value: "low", label: "Bassa" },
  { value: "normal", label: "Normale" },
  { value: "high", label: "Alta" },
  { value: "critical", label: "Critica" },
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

const WORKLOAD_STRATEGY_OPTIONS: { value: string; label: string }[] = [
  { value: "spread_by_deadline", label: "Distribuzione per scadenza" },
  { value: "fifo", label: "FIFO" },
  { value: "balanced", label: "Bilanciata" },
];

const WORKLOAD_FIELD_HELP = {
  due_time_label: {
    title: "Fascia oraria preferita",
    shortText: "Indica quando la task dovrebbe essere completata durante la giornata.",
    longText:
      "Serve a dare una priorità temporale leggibile al team. Non cambia la data di scadenza, ma aiuta il motore workload a ordinare meglio le attività.",
  },
  workload_strategy: {
    title: "Strategia di distribuzione",
    shortText: "Definisce come distribuire le ore stimate nel tempo.",
    longText:
      "La strategia guida il calcolo della pianificazione. In genere viene proposta dalla policy aziendale per mantenere coerenza tra tutti i team.",
  },
  workload_strategy_version: {
    title: "Versione regole",
    shortText: "Indica quale versione delle regole di calcolo è stata applicata.",
    longText:
      "Utile per tracciabilità e confronti storici: a parità di task, versioni diverse possono produrre allocazioni differenti.",
  },
  is_fractionable: {
    title: "Suddivisione attività",
    shortText: "Se attivo, la task può essere spezzata in più blocchi.",
    longText:
      "Attiva questa opzione quando il lavoro può essere distribuito su più giorni o slot. Disattivala per attività che richiedono continuità.",
  },
  force_today: {
    title: "Forzato a oggi",
    shortText: "Se attivo, il motore pianifica questa task solo nella giornata corrente.",
    longText:
      "Ignora work_date, deadline e planning window. Anche se la task è frazionabile, tutte le ore vengono allocate su oggi con possibile overload.",
  },
  workload_conflict_code: {
    title: "Stato conflitto workload",
    shortText: "Segnala eventuali problemi nel rispetto della capacità.",
    longText:
      "Compare quando il carico pianificato supera i vincoli disponibili o viola una regola di scheduling.",
  },
  workload_overload_hours: {
    title: "Ore oltre capacità",
    shortText: "Quantifica di quante ore si supera il limite giornaliero.",
    longText:
      "Valore utile per decidere se riassegnare, rinviare o frazionare la task. Se è zero, la pianificazione è dentro capacità.",
  },
  workload_result_json: {
    title: "Dettaglio calcolo",
    shortText: "Contiene il risultato tecnico della pianificazione.",
    longText:
      "Include informazioni diagnostiche e decisioni del motore workload. È pensato per analisi avanzate, non per uso operativo quotidiano.",
  },
} as const;

// ── Form types ────────────────────────────────────────────────────────────────

interface WorkItemFormState {
  is_template: boolean;
  title: string;
  description: string;
  work_date: string;
  start_time: string;
  deadline_date: string;
  due_time_label: string;
  estimated_hours: string;
  workload_strategy: string;
  workload_strategy_version: string;
  is_fractionable: boolean;
  force_today: boolean;
  workload_conflict_code: string;
  workload_overload_hours: string;
  workload_result_json: string;
  affects_daily_load: boolean;
  load_weight_factor: string;
  is_left_behind: boolean;
  left_behind_reason: "" | LeftBehindReason;
  left_behind_note: string;
  status: WorkItemStatus;
  progress_percent: string;
  is_completed: boolean;
  urgency_level: UrgencyLevel | "";
  is_priority: boolean;
  assignee_ids: number[];
  work_area_ids: number[];
  tag_ids: number[];
  client_id: string;
  is_recurring: boolean;
  recurrence_type: "" | WorkItemRecurrenceType;
  recurrence_interval_days: string;
  recurrence_day_of_month: string;
  recurrence_until: string;
  generate_recurrences: boolean;
  generation_end_date: string;
  is_ped: boolean;
  ped_mode: "existing" | "new";
  ped_configuration_id: string;
  ped_monthly_publications_total: string;
  ped_tone_of_voice: string;
  ped_photo_posts_per_month: string;
  ped_carousels_per_month: string;
  ped_reels_per_month: string;
  ped_stories_per_month: string;
  checklists: ChecklistFormState[];
}

interface ChecklistItemSlotFormState {
  starts_at: string;
  ends_at: string;
  description: string | null;
  is_completed: boolean;
}

interface ChecklistItemFormState {
  title: string;
  description: string | null;
  is_completed: boolean;
  due_at: string | null;
  assignee_ids: number[] | null;
  time_slots: ChecklistItemSlotFormState[];
}

interface ChecklistFormState {
  title: string;
  items: ChecklistItemFormState[];
}

const EMPTY_FORM: WorkItemFormState = {
  is_template: false,
  title: "",
  description: "",
  work_date: "",
  start_time: "",
  deadline_date: "",
  due_time_label: "",
  estimated_hours: "",
  workload_strategy: "",
  workload_strategy_version: "",
  is_fractionable: true,
  force_today: false,
  workload_conflict_code: "",
  workload_overload_hours: "",
  workload_result_json: "",
  affects_daily_load: true,
  load_weight_factor: "1",
  is_left_behind: false,
  left_behind_reason: "",
  left_behind_note: "",
  status: "planned",
  progress_percent: "0",
  is_completed: false,
  urgency_level: "",
  is_priority: false,
  assignee_ids: [],
  work_area_ids: [],
  tag_ids: [],
  client_id: "",
  is_recurring: false,
  recurrence_type: "",
  recurrence_interval_days: "",
  recurrence_day_of_month: "",
  recurrence_until: "",
  generate_recurrences: false,
  generation_end_date: "",
  is_ped: false,
  ped_mode: "existing",
  ped_configuration_id: "",
  ped_monthly_publications_total: "",
  ped_tone_of_voice: "",
  ped_photo_posts_per_month: "0",
  ped_carousels_per_month: "0",
  ped_reels_per_month: "0",
  ped_stories_per_month: "0",
  checklists: [],
};

// ── Slot form ─────────────────────────────────────────────────────────────────

interface SlotFormState {
  starts_at: string;
  ends_at: string;
  description: string;
  is_completed: boolean;
}

const EMPTY_SLOT: SlotFormState = {
  starts_at: "",
  ends_at: "",
  description: "",
  is_completed: false,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtHours(n: number): string {
  return n % 1 === 0 ? `${n}h` : `${n.toFixed(1)}h`;
}

function applyLeftBehindDefaults(reason: LeftBehindReason): Pick<WorkItemFormState, "affects_daily_load" | "load_weight_factor"> {
  if (reason === "client_protection") return { affects_daily_load: false, load_weight_factor: "0" };
  if (reason === "justified_delay") return { affects_daily_load: true, load_weight_factor: "0.5" };
  return { affects_daily_load: true, load_weight_factor: "1" };
}

function formatJsonPreview(value: string): string {
  if (!value.trim()) return "—";
  try {
    const parsed = JSON.parse(value) as unknown;
    return JSON.stringify(parsed, null, 2);
  } catch {
    return value;
  }
}

interface FieldHelpPopoverProps {
  title: string;
  shortText: string;
  longText: string;
}

function FieldHelpPopover({ title, shortText, longText }: FieldHelpPopoverProps) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(320, window.innerWidth - 24);
      const left = Math.min(Math.max(12, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 12);
      const top = Math.min(rect.bottom + 10, window.innerHeight - 160);
      setPosition({ top, left, width });
    };

    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || popupRef.current?.contains(target)) return;
      setOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <span className="inline-flex items-center">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="ml-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line bg-paper text-[10px] font-bold text-muted transition-colors hover:border-ink hover:text-ink dark:border-line-dark dark:bg-[#1c1c20] dark:text-muted-dark dark:hover:border-paper dark:hover:text-paper"
        aria-label={title}
        aria-expanded={open}
      >
        ?
      </button>
      {open && position && createPortal(
        <div
          ref={popupRef}
          className="fixed z-[4000] rounded-lg border border-line bg-paper px-3 py-2.5 text-left shadow-xl dark:border-line-dark dark:bg-[#131316]"
          style={{ top: position.top, left: position.left, width: position.width }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink dark:text-paper">{title}</p>
          <p className="mt-1 text-[12px] text-muted dark:text-muted-dark">{shortText}</p>
          <p className="mt-2 text-[11px] leading-5 text-muted dark:text-muted-dark">{longText}</p>
        </div>,
        document.body
      )}
    </span>
  );
}

// ── TimeSlotRow ───────────────────────────────────────────────────────────────

interface TimeSlotRowProps {
  slot: TimeSlot;
  canEdit: boolean;
  onToggleComplete: (slot: TimeSlot) => void;
  onDelete: (slot: TimeSlot) => void;
}

function TimeSlotRow({ slot, canEdit, onToggleComplete, onDelete }: TimeSlotRowProps) {
  const start = new Date(slot.starts_at);
  const end = new Date(slot.ends_at);
  const diffMs = end.getTime() - start.getTime();
  const diffH = diffMs / 1000 / 3600;
  const fmt = (d: Date) =>
    d.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex items-center gap-3 rounded-md border border-line bg-cream p-2 text-[12px] dark:border-line-dark dark:bg-[#1c1c20]">
      <Checkbox
        checked={slot.is_completed}
        onChange={() => { if (canEdit) onToggleComplete(slot); }}
        disabled={!canEdit}
      />
      <div className="flex flex-1 flex-col gap-0.5">
        <span className="text-ink dark:text-paper">
          {fmt(start)} → {fmt(end)}
          <span className="ml-2 text-muted dark:text-muted-dark">({fmtHours(diffH)})</span>
        </span>
        {slot.description && (
          <span className="text-muted dark:text-muted-dark">{slot.description}</span>
        )}
      </div>
      {canEdit && (
        <button
          type="button"
          onClick={() => onDelete(slot)}
          className="text-muted hover:text-danger dark:text-muted-dark dark:hover:text-danger"
        >
          <Icon name="trash" className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface WorkItemFormModalProps {
  open: boolean;
  onClose: () => void;
  editingItem?: WorkItem | null;
  instantiateTemplate?: WorkItem | null;
  companyId: number;
  isAdmin: boolean;
  /** Pre-fill work_date when creating */
  defaultWorkDate?: string;
  /** Pre-fill assignee_ids when creating */
  defaultAssigneeIds?: number[];
  onSaved: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function WorkItemFormModal({
  open,
  onClose,
  editingItem = null,
  instantiateTemplate = null,
  companyId,
  isAdmin,
  defaultWorkDate,
  defaultAssigneeIds,
  onSaved,
}: WorkItemFormModalProps) {
  const toast = useToast();
  const hydratedFormKeyRef = useRef<string | null>(null);
  const [activeWorkItemId, setActiveWorkItemId] = useState<number | null>(editingItem?.id ?? null);

  useEffect(() => {
    setActiveWorkItemId(editingItem?.id ?? null);
  }, [open, editingItem?.id]);

  const isInstantiateMode = editingItem == null && instantiateTemplate != null;

  const { workItem: detailedEditingItem, isLoading: isDetailLoading, error: detailError } = useWorkItemDetail(
    activeWorkItemId,
    open && activeWorkItemId != null
  );
  const sourceItem = detailedEditingItem ?? (editingItem?.id === activeWorkItemId ? editingItem : null);
  const templateSourceId = sourceItem?.template_source_id ?? null;
  const recurrenceSourceId = sourceItem?.recurrence_parent_id ?? null;
  const { workItem: templateSourceItem, isLoading: isTemplateSourceLoading } = useWorkItemDetail(
    templateSourceId,
    open && templateSourceId != null
  );
  const { workItem: recurrenceSourceItem, isLoading: isRecurrenceSourceLoading } = useWorkItemDetail(
    recurrenceSourceId,
    open && recurrenceSourceId != null
  );

  // ── Options
  const [users, setUsers] = useState<User[]>([]);
  const [workAreas, setWorkAreas] = useState<WorkArea[]>([]);
  const [workTags, setWorkTags] = useState<WorkTag[]>([]);
  const [templates, setTemplates] = useState<WorkItem[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [clients, setClients] = useState<Client[]>([]);
  const [pedConfigs, setPedConfigs] = useState<PedConfiguration[]>([]);
  const [activeWorkloadPolicy, setActiveWorkloadPolicy] = useState<CompanyWorkloadPolicy | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(false);

  // ── Form
  const [form, setForm] = useState<WorkItemFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // ── Taxonomy creation modals
  const [workTagModalOpen, setWorkTagModalOpen] = useState(false);
  const [workAreaModalOpen, setWorkAreaModalOpen] = useState(false);

  // ── Slots (edit only)
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [slotForm, setSlotForm] = useState<SlotFormState>(EMPTY_SLOT);
  const [addingSlot, setAddingSlot] = useState(false);
  const [slotError, setSlotError] = useState<string | null>(null);
  const [slotSaving, setSlotSaving] = useState(false);
  const [expandedChecklistItems, setExpandedChecklistItems] = useState<Record<string, boolean>>({});

  const selectedTemplate = selectedTemplateId
    ? templates.find((item) => item.id === Number(selectedTemplateId)) ?? null
    : null;
  const templateSeedItem = isInstantiateMode ? instantiateTemplate : selectedTemplate;

  useEffect(() => {
    if (!open) return;
    setSelectedTemplateId("");
  }, [open]);

  useEffect(() => {
    if (!open) {
      hydratedFormKeyRef.current = null;
    }
  }, [open]);

  // ── Load options when modal opens
  useEffect(() => {
    if (!open) return;
    setOptionsLoading(true);
    Promise.all([
      getUsersApi(companyId).then(setUsers).catch(() => {}),
      listWorkAreasApi({ company_id: companyId }).then(setWorkAreas).catch(() => {}),
      listWorkTagsApi(companyId).then(setWorkTags).catch(() => {}),
      listWorkItemsApi({ company_id: companyId, only_templates: true }).then(setTemplates).catch(() => setTemplates([])),
      getClientsApi({ company_id: companyId, per_page: 200 }).then((r) => setClients(r.data)).catch(() => {}),
      listPedConfigurationsApi(companyId).then(setPedConfigs).catch(() => setPedConfigs([])),
      listCompanyWorkloadPoliciesApi(companyId)
        .then((policies) => setActiveWorkloadPolicy(policies.find((policy) => policy.is_active) ?? null))
        .catch(() => setActiveWorkloadPolicy(null)),
    ]).finally(() => setOptionsLoading(false));
  }, [open, companyId]);

  useEffect(() => {
    if (!open || activeWorkItemId == null) return;
    if (!detailError) return;
    toast.error(`Dettagli lavorazione non disponibili: ${detailError}`);
  }, [open, activeWorkItemId, detailError, toast]);

  // ── Populate form from detail/edit source/template seed
  useEffect(() => {
    if (!open) return;
    const hydrationKey = [
      isInstantiateMode ? "instantiate" : "normal",
      sourceItem?.id ?? "none",
      templateSeedItem?.id ?? "none",
      !sourceItem && !templateSeedItem ? String(activeWorkloadPolicy?.id ?? "none") : "skip",
    ].join(":");

    if (hydratedFormKeyRef.current === hydrationKey) {
      return;
    }

    if (sourceItem || templateSeedItem) {
      const baseItem = sourceItem ?? templateSeedItem;
      if (!baseItem) return;
      setForm({
        is_template: isInstantiateMode ? false : (baseItem.is_template ?? false),
        title: baseItem.title,
        description: baseItem.description ?? "",
        work_date: isInstantiateMode ? "" : (baseItem.work_date ?? ""),
        start_time: isInstantiateMode ? "" : (baseItem.start_time ?? ""),
        deadline_date: isInstantiateMode ? "" : (baseItem.deadline_date ?? ""),
        due_time_label: isInstantiateMode ? "" : (baseItem.due_time_label ?? ""),
        estimated_hours: baseItem.estimated_hours != null ? String(baseItem.estimated_hours) : "",
        workload_strategy: baseItem.workload_strategy ?? "",
        workload_strategy_version: baseItem.workload_strategy_version ?? "",
        is_fractionable: baseItem.is_fractionable ?? true,
        force_today: baseItem.force_today ?? false,
        workload_conflict_code: baseItem.workload_conflict_code ?? "",
        workload_overload_hours: baseItem.workload_overload_hours != null ? String(baseItem.workload_overload_hours) : "",
        workload_result_json: baseItem.workload_result_json ? JSON.stringify(baseItem.workload_result_json, null, 2) : "",
        affects_daily_load: baseItem.affects_daily_load,
        load_weight_factor: String(baseItem.load_weight_factor),
        is_left_behind: baseItem.is_left_behind,
        left_behind_reason: baseItem.left_behind_reason ?? "",
        left_behind_note: baseItem.left_behind_note ?? "",
        status: baseItem.status,
        progress_percent: String(baseItem.progress_percent),
        is_completed: baseItem.is_completed,
        urgency_level: baseItem.urgency_level ?? "",
        is_priority: baseItem.is_priority,
        assignee_ids: baseItem.assignee_ids ?? [],
        work_area_ids: baseItem.work_area_ids ?? [],
        tag_ids: baseItem.tag_ids ?? [],
        client_id: baseItem.client_id != null ? String(baseItem.client_id) : "",
        is_recurring: baseItem.is_recurring,
        recurrence_type: baseItem.recurrence_type ?? "",
        recurrence_interval_days: baseItem.recurrence_interval_days != null ? String(baseItem.recurrence_interval_days) : "",
        recurrence_day_of_month: baseItem.recurrence_day_of_month != null ? String(baseItem.recurrence_day_of_month) : "",
        recurrence_until: baseItem.recurrence_until ?? "",
        generate_recurrences: false,
        generation_end_date: "",
        is_ped: baseItem.is_PED ?? false,
        ped_mode: baseItem.ped_configuration_id != null ? "existing" : "new",
        ped_configuration_id: baseItem.ped_configuration_id != null ? String(baseItem.ped_configuration_id) : "",
        ped_monthly_publications_total: baseItem.ped_configuration?.monthly_publications_total != null ? String(baseItem.ped_configuration.monthly_publications_total) : "",
        ped_tone_of_voice: baseItem.ped_configuration?.tone_of_voice ?? "",
        ped_photo_posts_per_month: baseItem.ped_configuration?.photo_posts_per_month != null ? String(baseItem.ped_configuration.photo_posts_per_month) : "0",
        ped_carousels_per_month: baseItem.ped_configuration?.carousels_per_month != null ? String(baseItem.ped_configuration.carousels_per_month) : "0",
        ped_reels_per_month: baseItem.ped_configuration?.reels_per_month != null ? String(baseItem.ped_configuration.reels_per_month) : "0",
        ped_stories_per_month: baseItem.ped_configuration?.stories_per_month != null ? String(baseItem.ped_configuration.stories_per_month) : "0",
        checklists: (baseItem.checklists ?? []).map((checklist) => ({
          title: checklist.title,
          items: (checklist.items ?? []).map((item) => ({
            title: item.title,
            description: item.description ?? null,
            is_completed: item.is_completed,
            due_at: item.due_at ?? null,
            assignee_ids: item.assignee_ids?.length ? [...item.assignee_ids] : null,
            time_slots: (item.time_slots ?? []).map((slot) => ({
              starts_at: slot.starts_at,
              ends_at: slot.ends_at,
              description: slot.description ?? null,
              is_completed: slot.is_completed,
            })),
          })),
        })),
      });
      setSlots(isInstantiateMode ? [] : (baseItem.time_slots ?? []));
    } else {
      setForm({
        ...EMPTY_FORM,
        work_date: defaultWorkDate ?? "",
        assignee_ids: defaultAssigneeIds ?? [],
        workload_strategy: activeWorkloadPolicy?.strategy ?? "spread_by_deadline",
        workload_strategy_version: activeWorkloadPolicy?.strategy_version ?? "v1",
        is_fractionable: activeWorkloadPolicy?.default_is_fractionable ?? true,
      });
      setSlots([]);
    }
    hydratedFormKeyRef.current = hydrationKey;
    setFormError(null);
    setSlotForm(EMPTY_SLOT);
    setAddingSlot(false);
    setSlotError(null);
  }, [sourceItem, templateSeedItem, open, defaultWorkDate, defaultAssigneeIds, isInstantiateMode, activeWorkloadPolicy]);

  const updateForm = <K extends keyof WorkItemFormState>(key: K, value: WorkItemFormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const closeModal = () => {
    if (saving) return;
    onClose();
  };

  // ── Save
  const handleSave = async () => {
    const isGeneratedRecurringItem = sourceItem?.recurrence_parent_id != null;
    const canEditRecurrence = !isGeneratedRecurringItem;

    if (!form.title.trim()) {
      setFormError("Il titolo è obbligatorio");
      return;
    }
    if (form.is_left_behind && !form.left_behind_reason) {
      setFormError("Seleziona il motivo per la task lasciata indietro");
      return;
    }
    if (form.load_weight_factor) {
      const weight = parseFloat(form.load_weight_factor);
      if (!Number.isFinite(weight) || weight < 0 || weight > 3) {
        setFormError("Il fattore peso deve essere tra 0 e 3");
        return;
      }
    }

    let parsedWorkloadResultJson: Record<string, unknown> | null | undefined;
    if (form.workload_result_json.trim()) {
      try {
        const parsed = JSON.parse(form.workload_result_json) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          setFormError("workload_result_json deve essere un oggetto JSON valido");
          return;
        }
        parsedWorkloadResultJson = parsed as Record<string, unknown>;
      } catch {
        setFormError("workload_result_json non è un JSON valido");
        return;
      }
    }

    if (form.workload_overload_hours) {
      const overloadHours = parseFloat(form.workload_overload_hours);
      if (!Number.isFinite(overloadHours) || overloadHours < 0) {
        setFormError("Le ore di sovraccarico devono essere un numero >= 0");
        return;
      }
    }

    if (canEditRecurrence && form.is_recurring) {
      if (!form.work_date) {
        setFormError("work_date obbligatoria per task ricorrenti");
        return;
      }
      if (form.recurrence_type !== "daily_interval" && form.recurrence_type !== "monthly_day") {
        setFormError("recurrence_type non valido");
        return;
      }

      if (form.recurrence_type === "daily_interval") {
        const intervalDays = Number(form.recurrence_interval_days);
        if (!Number.isInteger(intervalDays) || intervalDays < 1) {
          setFormError("recurrence_interval_days obbligatorio per daily_interval");
          return;
        }
      }

      if (form.recurrence_type === "monthly_day") {
        const dayOfMonth = Number(form.recurrence_day_of_month);
        if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
          setFormError("recurrence_day_of_month obbligatorio per monthly_day");
          return;
        }
      }

      if (form.recurrence_until && form.recurrence_until < form.work_date) {
        setFormError("recurrence_until deve essere maggiore o uguale a work_date");
        return;
      }

      if (form.generation_end_date && form.generation_end_date <= form.work_date) {
        setFormError("generation_end_date deve essere > work_date");
        return;
      }

      if (form.generate_recurrences) {
        const effectiveGenerationEndDate = form.generation_end_date || form.recurrence_until;
        if (!effectiveGenerationEndDate) {
          setFormError("Per autogenerare le occorrenze, inserisci una data fine generazione o recurrence_until");
          return;
        }
      }
    }

    if (form.is_ped) {
      if (form.ped_mode === "existing") {
        if (!form.ped_configuration_id) {
          setFormError("Seleziona una configurazione PED esistente");
          return;
        }
      } else {
        const pedNumericFields = [
          { label: "Pubblicazioni totali/mese", value: form.ped_monthly_publications_total },
          { label: "Foto/mese", value: form.ped_photo_posts_per_month },
          { label: "Caroselli/mese", value: form.ped_carousels_per_month },
          { label: "Reel/mese", value: form.ped_reels_per_month },
          { label: "Storie/mese", value: form.ped_stories_per_month },
        ];
        for (const field of pedNumericFields) {
          if (!/^\d+$/.test(field.value.trim())) {
            setFormError(`${field.label}: inserisci un intero maggiore o uguale a 0`);
            return;
          }
        }
      }
    }

    for (const checklist of form.checklists) {
      if (!checklist.title.trim()) {
        setFormError("Ogni checklist deve avere un titolo");
        return;
      }
      for (const item of checklist.items) {
        if (!item.title.trim()) {
          setFormError("Ogni elemento checklist deve avere un titolo");
          return;
        }
        for (const slot of item.time_slots) {
          if (!slot.starts_at || !slot.ends_at) {
            setFormError("Ogni slot checklist deve avere inizio e fine");
            return;
          }
          if (new Date(slot.ends_at) <= new Date(slot.starts_at)) {
            setFormError("Ogni slot checklist deve avere fine successiva all'inizio");
            return;
          }
        }
      }
    }

    setSaving(true);
    setFormError(null);
    try {
      const effectiveGenerationEndDate = form.generation_end_date || form.recurrence_until || null;
      const payload: CreateWorkItemPayload = {
        company_id: sourceItem?.company_id ?? companyId,
        is_template: form.is_template,
        client_id: form.client_id ? parseInt(form.client_id, 10) : null,
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        work_date: form.work_date || undefined,
        start_time: form.start_time || undefined,
        deadline_date: form.deadline_date || undefined,
        due_time_label: form.due_time_label.trim() || undefined,
        estimated_hours: form.estimated_hours ? parseFloat(form.estimated_hours) : undefined,
        workload_strategy: form.workload_strategy.trim() || undefined,
        workload_strategy_version: form.workload_strategy_version.trim() || undefined,
        is_fractionable: form.is_fractionable,
        force_today: form.force_today,
        workload_conflict_code: form.workload_conflict_code.trim() || undefined,
        workload_overload_hours: form.workload_overload_hours ? parseFloat(form.workload_overload_hours) : undefined,
        workload_result_json: parsedWorkloadResultJson,
        affects_daily_load: form.affects_daily_load,
        load_weight_factor: form.load_weight_factor ? parseFloat(form.load_weight_factor) : undefined,
        is_left_behind: form.is_left_behind,
        left_behind_reason: form.is_left_behind ? (form.left_behind_reason as LeftBehindReason) : null,
        left_behind_note: form.is_left_behind ? (form.left_behind_note.trim() || null) : null,
        status: form.status,
        progress_percent: parseInt(form.progress_percent, 10) || 0,
        is_completed: form.is_completed,
        urgency_level: (form.urgency_level as UrgencyLevel) || undefined,
        is_priority: form.is_priority,
        assignee_ids: form.assignee_ids,
        work_area_ids: form.work_area_ids,
        tag_ids: form.tag_ids,
        ...(canEditRecurrence
          ? {
              is_recurring: form.is_recurring,
              recurrence_type: form.is_recurring ? (form.recurrence_type as WorkItemRecurrenceType) : null,
              recurrence_interval_days:
                form.is_recurring && form.recurrence_type === "daily_interval"
                  ? Number(form.recurrence_interval_days)
                  : null,
              recurrence_day_of_month:
                form.is_recurring && form.recurrence_type === "monthly_day"
                  ? Number(form.recurrence_day_of_month)
                  : null,
              recurrence_until: form.is_recurring ? (form.recurrence_until || null) : null,
              generate_recurrences: form.is_recurring ? form.generate_recurrences : false,
              generation_end_date:
                form.is_recurring && form.generate_recurrences
                  ? effectiveGenerationEndDate
                  : null,
            }
          : {}),
      };

      payload.is_PED = form.is_ped;
      if (form.is_ped) {
        if (form.ped_mode === "existing" && form.ped_configuration_id) {
          payload.ped_configuration_id = parseInt(form.ped_configuration_id, 10);
        } else if (form.ped_mode === "new") {
          payload.ped_configuration_id = null;
          payload.ped_configuration = {
            monthly_publications_total: parseInt(form.ped_monthly_publications_total, 10) || 0,
            tone_of_voice: form.ped_tone_of_voice.trim() || null,
            photo_posts_per_month: parseInt(form.ped_photo_posts_per_month, 10) || 0,
            carousels_per_month: parseInt(form.ped_carousels_per_month, 10) || 0,
            reels_per_month: parseInt(form.ped_reels_per_month, 10) || 0,
            stories_per_month: parseInt(form.ped_stories_per_month, 10) || 0,
          };
        }
      } else {
        payload.ped_configuration_id = null;
      }

      if (parsedWorkloadResultJson == null && !form.workload_result_json.trim()) {
        payload.workload_result_json = undefined;
      }

      if (form.checklists.length > 0) {
        payload.checklists = form.checklists.map((checklist) => ({
          title: checklist.title.trim(),
          items: checklist.items.map((item) => ({
            title: item.title.trim(),
            description: item.description?.trim() ? item.description.trim() : null,
            is_completed: item.is_completed,
            due_at: item.due_at || null,
            assignee_ids: item.assignee_ids?.length ? [...item.assignee_ids] : null,
            time_slots: item.time_slots.map((slot) => ({
              starts_at: slot.starts_at,
              ends_at: slot.ends_at,
              description: slot.description?.trim() ? slot.description.trim() : null,
              is_completed: slot.is_completed,
            })),
          })),
        }));
      }

      if (sourceItem) {
        await updateWorkItemApi(sourceItem.id, payload);
        toast.success("Lavorazione aggiornata");
      } else if (instantiateTemplate?.id != null) {
        const {
          company_id: _companyId,
          is_template: _isTemplate,
          ...instantiatePayload
        } = payload;
        void _companyId;
        void _isTemplate;
        await instantiateWorkItemTemplateApi(instantiateTemplate.id, instantiatePayload);
        toast.success("Lavorazione creata da modello");
      } else if (selectedTemplateId) {
        const {
          company_id: _companyId,
          is_template: _isTemplate,
          ...instantiatePayload
        } = payload;
        void _companyId;
        void _isTemplate;
        await instantiateWorkItemTemplateApi(Number(selectedTemplateId), instantiatePayload);
        toast.success("Lavorazione creata da modello");
      } else {
        await createWorkItemApi(payload);
        toast.success("Lavorazione creata");
      }
      onClose();
      onSaved();
    } catch (err) {
      if (err instanceof Error && err.message.includes("[403]")) {
        setFormError("Operazione non consentita");
      } else if (err instanceof Error && err.message.includes("[422]")) {
        setFormError(err.message.replace(/^\[422\]\s*/, ""));
      } else {
        setFormError(err instanceof Error ? err.message : "Errore nel salvataggio");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleLeftBehindToggle = (checked: boolean) => {
    if (!checked) {
      setForm((current) => ({
        ...current,
        is_left_behind: false,
        left_behind_reason: "",
        left_behind_note: "",
        affects_daily_load: true,
        load_weight_factor: "1",
      }));
      return;
    }
    setForm((current) => ({
      ...current,
      is_left_behind: true,
    }));
  };

  const handleLeftBehindReasonChange = (value: string) => {
    const reason = value as LeftBehindReason;
    const defaults = applyLeftBehindDefaults(reason);
    setForm((current) => ({
      ...current,
      left_behind_reason: reason,
      affects_daily_load: defaults.affects_daily_load,
      load_weight_factor: defaults.load_weight_factor,
    }));
  };

  const addChecklist = () => {
    setForm((current) => ({
      ...current,
      checklists: [
        ...current.checklists,
        {
          title: `Checklist ${current.checklists.length + 1}`,
          items: [],
        },
      ],
    }));
  };

  const updateChecklist = (checklistIndex: number, patch: Partial<ChecklistFormState>) => {
    setForm((current) => ({
      ...current,
      checklists: current.checklists.map((checklist, index) => (
        index === checklistIndex ? { ...checklist, ...patch } : checklist
      )),
    }));
  };

  const removeChecklist = (checklistIndex: number) => {
    setForm((current) => ({
      ...current,
      checklists: current.checklists.filter((_, index) => index !== checklistIndex),
    }));
  };

  const addChecklistItem = (checklistIndex: number) => {
    setForm((current) => ({
      ...current,
      checklists: current.checklists.map((checklist, index) => {
        if (index !== checklistIndex) return checklist;
        return {
          ...checklist,
          items: [
            ...checklist.items,
            {
              title: "Nuovo elemento",
              description: null,
              is_completed: false,
              due_at: null,
              assignee_ids: null,
              time_slots: [],
            },
          ],
        };
      }),
    }));
  };

  const updateChecklistItem = (
    checklistIndex: number,
    itemIndex: number,
    patch: Partial<ChecklistItemFormState>
  ) => {
    setForm((current) => ({
      ...current,
      checklists: current.checklists.map((checklist, index) => {
        if (index !== checklistIndex) return checklist;
        return {
          ...checklist,
          items: checklist.items.map((item, i) => (i === itemIndex ? { ...item, ...patch } : item)),
        };
      }),
    }));
  };

  const removeChecklistItem = (checklistIndex: number, itemIndex: number) => {
    setForm((current) => ({
      ...current,
      checklists: current.checklists.map((checklist, index) => {
        if (index !== checklistIndex) return checklist;
        return {
          ...checklist,
          items: checklist.items.filter((_, i) => i !== itemIndex),
        };
      }),
    }));
  };

  const addChecklistItemTimeSlot = (checklistIndex: number, itemIndex: number) => {
    setForm((current) => ({
      ...current,
      checklists: current.checklists.map((checklist, index) => {
        if (index !== checklistIndex) return checklist;
        return {
          ...checklist,
          items: checklist.items.map((item, i) => {
            if (i !== itemIndex) return item;
            return {
              ...item,
              time_slots: [
                ...item.time_slots,
                {
                  starts_at: "",
                  ends_at: "",
                  description: null,
                  is_completed: false,
                },
              ],
            };
          }),
        };
      }),
    }));
  };

  const updateChecklistItemTimeSlot = (
    checklistIndex: number,
    itemIndex: number,
    slotIndex: number,
    patch: Partial<ChecklistItemSlotFormState>
  ) => {
    setForm((current) => ({
      ...current,
      checklists: current.checklists.map((checklist, index) => {
        if (index !== checklistIndex) return checklist;
        return {
          ...checklist,
          items: checklist.items.map((item, i) => {
            if (i !== itemIndex) return item;
            return {
              ...item,
              time_slots: item.time_slots.map((slot, s) => (s === slotIndex ? { ...slot, ...patch } : slot)),
            };
          }),
        };
      }),
    }));
  };

  const removeChecklistItemTimeSlot = (checklistIndex: number, itemIndex: number, slotIndex: number) => {
    setForm((current) => ({
      ...current,
      checklists: current.checklists.map((checklist, index) => {
        if (index !== checklistIndex) return checklist;
        return {
          ...checklist,
          items: checklist.items.map((item, i) => {
            if (i !== itemIndex) return item;
            return {
              ...item,
              time_slots: item.time_slots.filter((_, s) => s !== slotIndex),
            };
          }),
        };
      }),
    }));
  };

  // ── Slot handlers
  const handleAddSlot = async () => {
    if (!sourceItem) return;
    if (!slotForm.starts_at || !slotForm.ends_at) {
      setSlotError("Orario di inizio e fine obbligatori");
      return;
    }
    if (new Date(slotForm.ends_at) <= new Date(slotForm.starts_at)) {
      setSlotError("L'orario di fine deve essere dopo quello di inizio");
      return;
    }
    setSlotSaving(true);
    setSlotError(null);
    try {
      const created = await createTimeSlotApi(sourceItem.id, {
        starts_at: new Date(slotForm.starts_at).toISOString(),
        ends_at: new Date(slotForm.ends_at).toISOString(),
        description: slotForm.description || undefined,
        is_completed: slotForm.is_completed,
      });
      setSlots((prev) => [...prev, created]);
      setSlotForm(EMPTY_SLOT);
      setAddingSlot(false);
    } catch (err) {
      setSlotError(err instanceof Error ? err.message : "Errore nell'aggiunta slot");
    } finally {
      setSlotSaving(false);
    }
  };

  const handleToggleSlot = async (slot: TimeSlot) => {
    try {
      const updated = await updateTimeSlotApi(slot.id, { is_completed: !slot.is_completed });
      setSlots((prev) => prev.map((s) => (s.id === slot.id ? updated : s)));
    } catch {
      toast.error("Impossibile aggiornare lo slot");
    }
  };

  const handleDeleteSlot = async (slot: TimeSlot) => {
    try {
      await deleteTimeSlotApi(slot.id);
      setSlots((prev) => prev.filter((s) => s.id !== slot.id));
    } catch {
      toast.error("Impossibile eliminare lo slot");
    }
  };

  // ── Options for selectors
  const userOptions = users.map((u) => ({ id: u.id, label: u.full_name ?? u.username }));
  const areaOptions = workAreas.map((a) => ({ id: a.id, label: a.name, color: a.color }));
  const tagOptions = workTags.map((t) => ({ id: t.id, label: t.name, color: t.color }));
  const isGeneratedRecurringItem = sourceItem?.recurrence_parent_id != null;
  const isTemplateItem = sourceItem?.is_template === true;
  const isFromTemplate = sourceItem?.template_source_id != null;

  // ── Render
  return (
    <>
    <Modal
      open={open}
      onClose={closeModal}
      title={sourceItem ? "Modifica lavorazione" : (isInstantiateMode ? "Nuova lavorazione da modello" : "Nuova lavorazione")}
      description="Compila i dati della lavorazione. I campi con * sono obbligatori."
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={closeModal} disabled={saving}>
            Annulla
          </Button>
          <Button variant="primary" onClick={handleSave} loading={saving}>
            Salva
          </Button>
        </>
      }
    >
      {optionsLoading || isDetailLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-ink dark:border-line-dark dark:border-t-paper" />
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {formError && (
            <div className="rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
              {formError}
            </div>
          )}

          {sourceItem && (
            <div className="rounded-md border border-line/80 bg-cream/60 px-3 py-2 dark:border-line-dark/80 dark:bg-[#1c1c20]">
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                {isTemplateItem ? (
                  <span className="inline-flex rounded-pill border border-info/30 bg-info/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-info">
                    Modello
                  </span>
                ) : (
                  <span className="inline-flex rounded-pill border border-line px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted dark:border-line-dark dark:text-muted-dark">
                    Task normale
                  </span>
                )}
                {isFromTemplate && (
                  <span className="inline-flex rounded-pill border border-info/30 bg-info/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-info">
                    Da modello
                  </span>
                )}
                {isGeneratedRecurringItem && (
                  <span className="inline-flex rounded-pill border border-warning/30 bg-warning/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-warning">
                    Occorrenza da ricorrenza
                  </span>
                )}
              </div>

              {(isFromTemplate || isGeneratedRecurringItem) && (
                <div className="flex flex-wrap items-center gap-2">
                  {isFromTemplate && (
                    <>
                      <span className="text-xs font-semibold text-muted dark:text-muted-dark">
                        Da modello:{" "}
                        {isTemplateSourceLoading
                          ? "caricamento..."
                          : templateSourceItem
                            ? `#${String(templateSourceItem.id).padStart(3, "0")} ${templateSourceItem.title}`
                            : templateSourceId != null
                              ? `#${String(templateSourceId).padStart(3, "0")}`
                              : "non disponibile"}
                      </span>
                      {templateSourceId != null && (
                        <button
                          type="button"
                          onClick={() => setActiveWorkItemId(templateSourceId)}
                          className="inline-flex items-center gap-1 rounded-md border border-info/30 bg-paper px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-info transition-colors hover:bg-info/10 dark:bg-[#131316]"
                        >
                          <Icon name="pencil" className="h-3 w-3" />
                          Apri modello
                        </button>
                      )}
                    </>
                  )}

                  {isGeneratedRecurringItem && recurrenceSourceId != null && (
                    <button
                      type="button"
                      onClick={() => setActiveWorkItemId(recurrenceSourceId)}
                      className="inline-flex items-center gap-1 rounded-md border border-warning/30 bg-paper px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-warning transition-colors hover:bg-warning/10 dark:bg-[#131316]"
                    >
                      <Icon name="refresh-cw" className="h-3 w-3" />
                      Apri task sorgente ricorrenza
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* — Base — */}
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-[11px] font-bold uppercase tracking-widest text-muted dark:text-muted-dark">
              Base
            </legend>
            {!sourceItem && !isInstantiateMode && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
                  Template di partenza
                </label>
                <SearchableSelect
                  value={selectedTemplateId}
                  onChange={(value) => setSelectedTemplateId(value)}
                  options={[
                    { value: "", label: "Nessun template" },
                    ...templates.map((item) => ({
                      value: String(item.id),
                      label: `#${String(item.id).padStart(3, "0")} ${item.title}`,
                    })),
                  ]}
                  placeholder="Nessun template"
                  searchPlaceholder="Cerca template..."
                />
              </div>
            )}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
                Cliente
              </label>
                <ClientSelectorWithCreate
                value={form.client_id}
                onChange={(v) => updateForm("client_id", v)}
                  clients={clients}
                  companyId={companyId}
                placeholder="Nessun cliente"
                  includeEmptyOption
                  emptyOptionLabel="Nessun cliente"
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-ink dark:text-paper">
              <Checkbox
                checked={form.is_template}
                onChange={(v) => updateForm("is_template", v)}
                disabled={isInstantiateMode}
              />
              Salva come modello riutilizzabile
            </label>
            {form.is_template && (
              <p className="text-xs text-muted dark:text-muted-dark">
                Questo elemento non apparira nella lista operativa standard.
              </p>
            )}
            <Input
              label="Titolo *"
              value={form.title}
              onChange={(e) => updateForm("title", e.target.value)}
              placeholder="Titolo della lavorazione"
            />
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
                Descrizione
              </label>
              <Textarea
                value={form.description}
                onChange={(e) => updateForm("description", e.target.value)}
                placeholder="Descrizione opzionale..."
                rows={2}
                className="w-full rounded-md border border-line bg-paper px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none dark:border-line-dark dark:bg-ink-soft dark:text-paper dark:placeholder:text-muted-dark dark:focus:border-paper"
              />
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-ink dark:text-paper">
                <Checkbox
                  checked={form.is_priority}
                  onChange={(v) => updateForm("is_priority", v)}
                />
                🚩 Priorità alta
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-ink dark:text-paper">
                <Checkbox
                  checked={form.is_completed}
                  onChange={(v) => updateForm("is_completed", v)}
                />
                Completata
              </label>
            </div>
          </fieldset>

          <div className="h-px bg-line dark:bg-line-dark" />

          {/* — Pianificazione — */}
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-[11px] font-bold uppercase tracking-widest text-muted dark:text-muted-dark">
              Pianificazione
            </legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Input
                label="Data lavorazione"
                type="date"
                value={form.work_date}
                onChange={(e) => updateForm("work_date", e.target.value)}
              />
              <Input
                label="Orario inizio"
                type="time"
                value={form.start_time}
                onChange={(e) => updateForm("start_time", e.target.value)}
              />
              <Input
                label="Scadenza"
                type="date"
                value={form.deadline_date}
                onChange={(e) => updateForm("deadline_date", e.target.value)}
              />
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
                  Etichetta oraria
                  <FieldHelpPopover {...WORKLOAD_FIELD_HELP.due_time_label} />
                </label>
                <Input
                  value={form.due_time_label}
                  onChange={(e) => updateForm("due_time_label", e.target.value)}
                  placeholder="Mattina, entro le 12..."
                />
              </div>
              <Input
                label="Ore stimate"
                type="number"
                min="0"
                step="0.5"
                value={form.estimated_hours}
                onChange={(e) => updateForm("estimated_hours", e.target.value)}
                placeholder="es. 4"
              />
                <Input
                  label="Fattore peso"
                  type="number"
                  min="0"
                  max="3"
                  step="0.1"
                  value={form.load_weight_factor}
                  onChange={(e) => updateForm("load_weight_factor", e.target.value)}
                  placeholder="1.0"
                />
            </div>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-ink dark:text-paper">
                  <Checkbox
                    checked={form.affects_daily_load}
                    onChange={(v) => updateForm("affects_daily_load", v)}
                  />
                  Impatta il carico giornaliero
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-ink dark:text-paper">
                  <Checkbox
                    checked={form.force_today}
                    onChange={(v) => updateForm("force_today", v)}
                  />
                  Forzato a oggi
                  <FieldHelpPopover {...WORKLOAD_FIELD_HELP.force_today} />
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-ink dark:text-paper">
                  <Checkbox
                    checked={form.is_left_behind}
                    onChange={handleLeftBehindToggle}
                  />
                  Task lasciata indietro
                </label>
              </div>
                {form.force_today && (
                  <div className="rounded-md border border-warning/25 bg-warning/10 px-3 py-2 text-xs text-warning">
                    Questa task sarà pianificata esclusivamente nella giornata di oggi. Se le ore superano la capacità giornaliera, verrà segnalato overload.
                  </div>
                )}
              {form.is_left_behind && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
                      Motivo *
                    </label>
                    <SearchableSelect
                      value={form.left_behind_reason}
                      onChange={handleLeftBehindReasonChange}
                      options={LEFT_BEHIND_REASON_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
                      placeholder="Seleziona motivo"
                      searchPlaceholder="Cerca motivo..."
                    />
                  </div>
                  <Input
                    label="Nota"
                    value={form.left_behind_note}
                    onChange={(e) => updateForm("left_behind_note", e.target.value)}
                    placeholder="Nota libera"
                  />
                </div>
              )}
          </fieldset>

          <div className="h-px bg-line dark:bg-line-dark" />

          {/* — Ricorrenza — */}
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-[11px] font-bold uppercase tracking-widest text-muted dark:text-muted-dark">
              Ricorrenza
            </legend>

            {isGeneratedRecurringItem && (
              <div className="rounded-md border border-info/25 bg-info/10 px-3 py-2 text-xs text-info">
                <p>Questa task è generata da ricorrenza. La configurazione ricorrenza è gestibile solo sulla task sorgente.</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="font-semibold">
                    Task sorgente:{" "}
                    {isRecurrenceSourceLoading
                      ? "caricamento..."
                      : recurrenceSourceItem
                        ? `#${String(recurrenceSourceItem.id).padStart(3, "0")} ${recurrenceSourceItem.title}`
                        : recurrenceSourceId != null
                          ? `#${String(recurrenceSourceId).padStart(3, "0")}`
                          : "non disponibile"}
                  </span>
                  {recurrenceSourceId != null && (
                    <button
                      type="button"
                      onClick={() => setActiveWorkItemId(recurrenceSourceId)}
                      className="inline-flex items-center gap-1 rounded-md border border-info/30 bg-paper px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-info transition-colors hover:bg-info/10 dark:bg-[#131316]"
                    >
                      <Icon name="pencil" className="h-3 w-3" />
                      Apri task sorgente
                    </button>
                  )}
                  {editingItem?.id != null && activeWorkItemId !== editingItem.id && (
                    <button
                      type="button"
                      onClick={() => setActiveWorkItemId(editingItem.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted transition-colors hover:border-ink hover:text-ink dark:border-line-dark dark:text-muted-dark dark:hover:border-paper dark:hover:text-paper"
                    >
                      Torna alla task iniziale
                    </button>
                  )}
                </div>
              </div>
            )}

            <label className="flex cursor-pointer items-center gap-2 text-sm text-ink dark:text-paper">
              <Checkbox
                checked={form.is_recurring}
                onChange={(value) => {
                  if (!value) {
                    setForm((current) => ({
                      ...current,
                      is_recurring: false,
                      recurrence_type: "",
                      recurrence_interval_days: "",
                      recurrence_day_of_month: "",
                      recurrence_until: "",
                      generate_recurrences: false,
                      generation_end_date: "",
                    }));
                    return;
                  }
                  setForm((current) => ({ ...current, is_recurring: true }));
                }}
                disabled={isGeneratedRecurringItem}
              />
              Attiva ricorrenza
            </label>

            {form.is_recurring && (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
                      Frequenza
                    </label>
                    <SearchableSelect
                      value={form.recurrence_type}
                      onChange={(value) => {
                        const next = value as "" | WorkItemRecurrenceType;
                        setForm((current) => ({
                          ...current,
                          recurrence_type: next,
                          recurrence_interval_days: next === "daily_interval" ? current.recurrence_interval_days : "",
                          recurrence_day_of_month: next === "monthly_day" ? current.recurrence_day_of_month : "",
                        }));
                      }}
                      options={[
                        { value: "", label: "Seleziona frequenza" },
                        { value: "daily_interval", label: "Ogni N giorni" },
                        { value: "monthly_day", label: "Giorno fisso del mese" },
                      ]}
                      placeholder="Seleziona frequenza"
                      searchPlaceholder="Cerca frequenza..."
                      disabled={isGeneratedRecurringItem}
                    />
                  </div>

                  {form.recurrence_type === "daily_interval" && (
                    <Input
                      label="Intervallo giorni *"
                      type="number"
                      min="1"
                      step="1"
                      value={form.recurrence_interval_days}
                      onChange={(e) => updateForm("recurrence_interval_days", e.target.value)}
                      placeholder="es. 7"
                      disabled={isGeneratedRecurringItem}
                    />
                  )}

                  {form.recurrence_type === "monthly_day" && (
                    <Input
                      label="Giorno del mese *"
                      type="number"
                      min="1"
                      max="31"
                      step="1"
                      value={form.recurrence_day_of_month}
                      onChange={(e) => updateForm("recurrence_day_of_month", e.target.value)}
                      placeholder="1-31"
                      disabled={isGeneratedRecurringItem}
                    />
                  )}

                  <Input
                    label="Data fine ricorrenza"
                    type="date"
                    value={form.recurrence_until}
                    onChange={(e) => updateForm("recurrence_until", e.target.value)}
                    disabled={isGeneratedRecurringItem}
                  />

                  <Input
                    label="Data fine generazione immediata"
                    type="date"
                    value={form.generation_end_date}
                    onChange={(e) => updateForm("generation_end_date", e.target.value)}
                    disabled={isGeneratedRecurringItem || !form.generate_recurrences}
                  />
                </div>

                <label className="flex cursor-pointer items-center gap-2 text-sm text-ink dark:text-paper">
                  <Checkbox
                    checked={form.generate_recurrences}
                    onChange={(value) => {
                      setForm((current) => ({
                        ...current,
                        generate_recurrences: value,
                        generation_end_date: value ? current.generation_end_date : "",
                      }));
                    }}
                    disabled={isGeneratedRecurringItem}
                  />
                  Genera subito le occorrenze al salvataggio
                </label>
              </>
            )}
          </fieldset>

          <div className="h-px bg-line dark:bg-line-dark" />

          {/* — Stato — */}
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-[11px] font-bold uppercase tracking-widest text-muted dark:text-muted-dark">
              Stato
            </legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
                  Stato
                </label>
                <SearchableSelect
                  value={form.status}
                  onChange={(v) => updateForm("status", v as WorkItemStatus)}
                  options={STATUS_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
                  placeholder="Seleziona stato"
                  searchPlaceholder="Cerca stato…"
                />
              </div>
              <Input
                label="Avanzamento (%)"
                type="number"
                min="0"
                max="100"
                value={form.progress_percent}
                onChange={(e) => updateForm("progress_percent", e.target.value)}
                placeholder="0"
              />
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
                  Urgenza
                </label>
                <SearchableSelect
                  value={form.urgency_level}
                  onChange={(v) => updateForm("urgency_level", v as UrgencyLevel | "")}
                  options={[
                    { value: "", label: "— nessuna —" },
                    ...URGENCY_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label })),
                  ]}
                  placeholder="— nessuna —"
                  searchPlaceholder="Cerca urgenza…"
                />
              </div>
            </div>
          </fieldset>

          <div className="h-px bg-line dark:bg-line-dark" />

          <details className="rounded-lg border border-line bg-cream/60 dark:border-line-dark dark:bg-[#1c1c20]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-left">
              <span>
                <span className="block text-[11px] font-bold uppercase tracking-widest text-muted dark:text-muted-dark">Workload</span>
                <span className="mt-1 block text-xs text-muted dark:text-muted-dark">Strategie, frazionabilità e dettagli di calcolo</span>
              </span>
              <Icon name="chevron-down" className="h-4 w-4 shrink-0 text-muted transition-transform duration-150 dark:text-muted-dark" />
            </summary>
            <div className="border-t border-line px-4 py-4 dark:border-line-dark">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
                    <span>Etichetta oraria</span>
                    <FieldHelpPopover {...WORKLOAD_FIELD_HELP.due_time_label} />
                  </label>
                  <Input
                    value={form.due_time_label}
                    onChange={(e) => updateForm("due_time_label", e.target.value)}
                    placeholder="Mattina, entro le 12..."
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
                    <span>Strategia workload</span>
                    <FieldHelpPopover {...WORKLOAD_FIELD_HELP.workload_strategy} />
                  </label>
                  {(() => {
                    const customStrategyOption = form.workload_strategy && !WORKLOAD_STRATEGY_OPTIONS.some((option) => option.value === form.workload_strategy)
                      ? [{ value: form.workload_strategy, label: `${form.workload_strategy} (custom)` }]
                      : [];
                    return (
                      <div className="flex flex-col gap-2">
                        <SearchableSelect
                          value={form.workload_strategy}
                          onChange={(value) => updateForm("workload_strategy", value)}
                          options={[...customStrategyOption, ...WORKLOAD_STRATEGY_OPTIONS]}
                          placeholder="Seleziona strategia"
                          searchPlaceholder="Cerca strategia..."
                        />
                        <Input
                          label="Oppure testo libero"
                          value={form.workload_strategy}
                          onChange={(event) => updateForm("workload_strategy", event.target.value)}
                          placeholder="spread_by_deadline"
                        />
                      </div>
                    );
                  })()}
                </div>

                <div className="flex flex-col gap-1">
                  <label className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
                    <span>Versione strategia</span>
                    <FieldHelpPopover {...WORKLOAD_FIELD_HELP.workload_strategy_version} />
                  </label>
                  <Input
                    value={form.workload_strategy_version}
                    onChange={(e) => updateForm("workload_strategy_version", e.target.value)}
                    placeholder="v1"
                  />
                </div>

                <div className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2.5 dark:border-line-dark">
                  <label className="flex items-center gap-2 text-sm font-medium text-ink dark:text-paper">
                    <Checkbox checked={form.is_fractionable} onChange={(value) => updateForm("is_fractionable", value)} />
                    Task frazionabile
                  </label>
                  <FieldHelpPopover {...WORKLOAD_FIELD_HELP.is_fractionable} />
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-muted dark:text-muted-dark">Esito workload</p>
                  <p className="mt-1 text-xs text-muted dark:text-muted-dark">Campi normalmente gestiti dal backend. Se presenti, servono per leggere il risultato del calcolo.</p>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <label className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
                      <span>Codice conflitto</span>
                      <FieldHelpPopover {...WORKLOAD_FIELD_HELP.workload_conflict_code} />
                    </label>
                    <Input
                      value={form.workload_conflict_code}
                      onChange={(e) => updateForm("workload_conflict_code", e.target.value)}
                      placeholder="over_capacity"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
                      <span>Ore in sovraccarico</span>
                      <FieldHelpPopover {...WORKLOAD_FIELD_HELP.workload_overload_hours} />
                    </label>
                    <Input
                      type="number"
                      min="0"
                      step="0.25"
                      value={form.workload_overload_hours}
                      onChange={(e) => updateForm("workload_overload_hours", e.target.value)}
                      placeholder="0"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
                    <span>Dettaglio risultato</span>
                    <FieldHelpPopover {...WORKLOAD_FIELD_HELP.workload_result_json} />
                  </label>
                  <textarea
                    value={form.workload_result_json}
                    onChange={(e) => updateForm("workload_result_json", e.target.value)}
                    placeholder='{"slots": [], "notes": []}'
                    rows={5}
                    className="w-full rounded-md border border-line bg-paper px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none dark:border-line-dark dark:bg-ink-soft dark:text-paper dark:placeholder:text-muted-dark dark:focus:border-paper"
                  />
                  <p className="text-[11px] text-muted dark:text-muted-dark">Preview: <span className="font-mono">{formatJsonPreview(form.workload_result_json)}</span></p>
                </div>
              </div>
            </div>
          </details>

          <div className="h-px bg-line dark:bg-line-dark" />

          {/* — Assegnazioni — */}
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-[11px] font-bold uppercase tracking-widest text-muted dark:text-muted-dark">
              Assegnazioni
            </legend>
            <MultiSelect
              label="Assegnatari"
              value={form.assignee_ids}
              onChange={(v) => updateForm("assignee_ids", v)}
              options={userOptions}
              placeholder="Seleziona operatori..."
            />
            <MultiSelect
              label="Aree di lavoro"
              value={form.work_area_ids}
              onChange={(v) => updateForm("work_area_ids", v)}
              options={areaOptions}
              placeholder="Seleziona aree..."
              onCreateClick={isAdmin ? () => setWorkAreaModalOpen(true) : undefined}
              createActionLabel="Crea area"
            />
          </fieldset>

          <div className="h-px bg-line dark:bg-line-dark" />

          {/* — Tag — */}
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-[11px] font-bold uppercase tracking-widest text-muted dark:text-muted-dark">
              Tag
            </legend>

            <MultiSelect
              label="Tag"
              value={form.tag_ids}
              onChange={(v) => updateForm("tag_ids", v)}
              options={tagOptions}
              placeholder="Seleziona tag..."
              onCreateClick={isAdmin ? () => setWorkTagModalOpen(true) : undefined}
              createActionLabel="Crea tag"
            />
          </fieldset>

          <div className="h-px bg-line dark:bg-line-dark" />

          {/* — Checklist — */}
          <fieldset className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <legend className="text-[11px] font-bold uppercase tracking-widest text-muted dark:text-muted-dark">
                Checklist ({form.checklists.length})
              </legend>
              <button
                type="button"
                onClick={addChecklist}
                className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-ink hover:text-muted dark:text-paper dark:hover:text-muted-dark"
              >
                <Icon name="plus" className="h-3 w-3" />
                Aggiungi checklist
              </button>
            </div>

            {form.checklists.length === 0 ? (
              <p className="text-sm text-muted dark:text-muted-dark">Nessuna checklist aggiunta.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {form.checklists.map((checklist, checklistIndex) => (
                  <div key={`checklist-${checklistIndex}`} className="rounded-lg border border-line bg-cream p-3 dark:border-line-dark dark:bg-[#1c1c20]">
                    <div className="flex items-center gap-2">
                      <Input
                        label={`Checklist ${checklistIndex + 1}`}
                        value={checklist.title}
                        onChange={(event) => updateChecklist(checklistIndex, { title: event.target.value })}
                        placeholder="Titolo checklist"
                      />
                      <button
                        type="button"
                        onClick={() => removeChecklist(checklistIndex)}
                        className="mt-6 inline-flex items-center gap-1 rounded-md border border-danger/30 px-2 py-2 text-xs font-semibold text-danger hover:bg-danger/10"
                      >
                        <Icon name="trash" className="h-3.5 w-3.5" />
                        Rimuovi
                      </button>
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
                        Elementi ({checklist.items.length})
                      </span>
                      <Button size="sm" variant="secondary" onClick={() => addChecklistItem(checklistIndex)}>
                        Aggiungi elemento
                      </Button>
                    </div>

                    <div className="mt-2 flex flex-col gap-3">
                      {checklist.items.length === 0 ? (
                        <p className="text-xs text-muted dark:text-muted-dark">Nessun elemento.</p>
                      ) : checklist.items.map((item, itemIndex) => (
                        <div key={`checklist-${checklistIndex}-item-${itemIndex}`} className="rounded-md border border-line/80 bg-paper p-3 dark:border-line-dark/80 dark:bg-[#131316]">
                          {(() => {
                            const itemKey = `${checklistIndex}-${itemIndex}`;
                            const isExpanded = !!expandedChecklistItems[itemKey];
                            return (
                              <>
                                <div className="flex items-start gap-2">
                                  <Checkbox
                                    checked={item.is_completed}
                                    onChange={(checked) => updateChecklistItem(checklistIndex, itemIndex, { is_completed: checked })}
                                    className="mt-2.5"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <Input
                                      label=""
                                      value={item.title}
                                      onChange={(event) => updateChecklistItem(checklistIndex, itemIndex, { title: event.target.value })}
                                      placeholder="Titolo elemento"
                                      className={item.is_completed ? "line-through opacity-70" : ""}
                                    />
                                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                      {item.due_at && (
                                        <span className="inline-flex items-center gap-1 rounded-pill border border-info/30 bg-info/10 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-info">
                                          <Icon name="calendar" className="h-3 w-3" />
                                          {new Date(item.due_at).toLocaleString("it-IT", {
                                            day: "2-digit",
                                            month: "2-digit",
                                            hour: "2-digit",
                                            minute: "2-digit",
                                          })}
                                        </span>
                                      )}
                                      <span className="inline-flex items-center gap-1 rounded-pill border border-line px-2 py-0.5 text-[10px] font-semibold tracking-wider text-muted dark:border-line-dark dark:text-muted-dark">
                                        <Icon name="clock" className="h-3 w-3" />
                                        {item.time_slots.length} slot
                                      </span>
                                      <span className="inline-flex items-center gap-1 rounded-pill border border-line px-2 py-0.5 text-[10px] font-semibold tracking-wider text-muted dark:border-line-dark dark:text-muted-dark">
                                        <Icon name="users" className="h-3 w-3" />
                                        {item.assignee_ids?.length ?? 0} assegn.
                                      </span>
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setExpandedChecklistItems((current) => ({ ...current, [itemKey]: !isExpanded }))}
                                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line text-muted transition-colors hover:border-ink hover:text-ink dark:border-line-dark dark:text-muted-dark dark:hover:border-paper dark:hover:text-paper"
                                    aria-label={isExpanded ? "Chiudi dettagli" : "Apri dettagli"}
                                    title={isExpanded ? "Chiudi dettagli" : "Apri dettagli"}
                                  >
                                    <Icon name={isExpanded ? "chevron-down" : "chevron-right"} className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeChecklistItem(checklistIndex, itemIndex)}
                                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-danger/30 text-danger hover:bg-danger/10"
                                    aria-label="Rimuovi elemento"
                                    title="Rimuovi elemento"
                                  >
                                    <Icon name="trash" className="h-3.5 w-3.5" />
                                  </button>
                                </div>

                                {isExpanded && (
                                  <div className="mt-3 space-y-3">
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                      <Input
                                        label="Scadenza elemento"
                                        type="datetime-local"
                                        value={item.due_at ?? ""}
                                        onChange={(event) => updateChecklistItem(checklistIndex, itemIndex, { due_at: event.target.value || null })}
                                      />
                                      <MultiSelect
                                        label="Assegnatari elemento"
                                        value={item.assignee_ids ?? []}
                                        onChange={(value) => updateChecklistItem(checklistIndex, itemIndex, { assignee_ids: value.length ? value : null })}
                                        options={userOptions}
                                        placeholder="Fallback assegnatari task"
                                      />
                                    </div>

                                    <Input
                                      label="Descrizione elemento"
                                      value={item.description ?? ""}
                                      onChange={(event) => updateChecklistItem(checklistIndex, itemIndex, { description: event.target.value || null })}
                                      placeholder="Descrizione opzionale"
                                    />

                                    <div className="rounded-md border border-line/70 p-2 dark:border-line-dark/70">
                                      <div className="mb-2 flex items-center justify-between">
                                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
                                          Slot elemento ({item.time_slots.length})
                                        </span>
                                        <Button size="sm" variant="ghost" onClick={() => addChecklistItemTimeSlot(checklistIndex, itemIndex)}>
                                          Aggiungi slot
                                        </Button>
                                      </div>

                                      <div className="flex flex-col gap-2">
                                        {item.time_slots.length === 0 ? (
                                          <p className="text-xs text-muted dark:text-muted-dark">Nessuno slot.</p>
                                        ) : item.time_slots.map((slot, slotIndex) => (
                                          <div key={`checklist-${checklistIndex}-item-${itemIndex}-slot-${slotIndex}`} className="rounded-md border border-line p-2 dark:border-line-dark">
                                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                              <Input
                                                label="Inizio slot *"
                                                type="datetime-local"
                                                value={slot.starts_at}
                                                onChange={(event) => updateChecklistItemTimeSlot(checklistIndex, itemIndex, slotIndex, { starts_at: event.target.value })}
                                              />
                                              <Input
                                                label="Fine slot *"
                                                type="datetime-local"
                                                value={slot.ends_at}
                                                onChange={(event) => updateChecklistItemTimeSlot(checklistIndex, itemIndex, slotIndex, { ends_at: event.target.value })}
                                              />
                                            </div>
                                            <Input
                                              label="Descrizione slot"
                                              value={slot.description ?? ""}
                                              onChange={(event) => updateChecklistItemTimeSlot(checklistIndex, itemIndex, slotIndex, { description: event.target.value || null })}
                                              placeholder="Descrizione opzionale"
                                            />
                                            <div className="mt-2 flex items-center justify-between">
                                              <label className="inline-flex items-center gap-2 text-sm text-ink dark:text-paper">
                                                <Checkbox
                                                  checked={slot.is_completed}
                                                  onChange={(checked) => updateChecklistItemTimeSlot(checklistIndex, itemIndex, slotIndex, { is_completed: checked })}
                                                />
                                                Slot completato
                                              </label>
                                              <button
                                                type="button"
                                                onClick={() => removeChecklistItemTimeSlot(checklistIndex, itemIndex, slotIndex)}
                                                className="inline-flex items-center gap-1 rounded-md border border-danger/30 px-2 py-1 text-xs font-semibold text-danger hover:bg-danger/10"
                                              >
                                                <Icon name="trash" className="h-3.5 w-3.5" />
                                                Rimuovi slot
                                              </button>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </fieldset>

          <div className="h-px bg-line dark:bg-line-dark" />

          {/* — PED — */}
          <fieldset className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <legend className="text-[11px] font-bold uppercase tracking-widest text-muted dark:text-muted-dark">
                PED
              </legend>
            </div>

            {!sourceItem ? (
              <label className="flex cursor-pointer items-center gap-2 text-sm text-ink dark:text-paper">
                <Checkbox
                  checked={form.is_ped}
                  onChange={(value) => updateForm("is_ped", value)}
                />
                È una task PED (Piano Editoriale Digitale)
              </label>
            ) : (
              <p className="text-sm text-ink dark:text-paper">Task PED attiva: puoi modificare la configurazione.</p>
            )}

            {form.is_ped && (
              <div className="flex flex-col gap-3 rounded-lg border border-line bg-cream p-3 dark:border-line-dark dark:bg-[#1c1c20]">
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => updateForm("ped_mode", "existing")}
                    className={`flex-1 rounded-md border px-3 py-2 text-xs font-semibold transition-colors ${form.ped_mode === "existing" ? "border-ink bg-ink text-paper dark:border-paper dark:bg-paper dark:text-ink" : "border-line text-muted hover:border-ink hover:text-ink dark:border-line-dark dark:text-muted-dark dark:hover:border-paper dark:hover:text-paper"}`}
                  >
                    Usa configurazione esistente
                  </button>
                  <button
                    type="button"
                    onClick={() => updateForm("ped_mode", "new")}
                    className={`flex-1 rounded-md border px-3 py-2 text-xs font-semibold transition-colors ${form.ped_mode === "new" ? "border-ink bg-ink text-paper dark:border-paper dark:bg-paper dark:text-ink" : "border-line text-muted hover:border-ink hover:text-ink dark:border-line-dark dark:text-muted-dark dark:hover:border-paper dark:hover:text-paper"}`}
                  >
                    Crea nuova configurazione
                  </button>
                </div>

                {form.ped_mode === "existing" ? (
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
                      Configurazione PED
                    </label>
                    {pedConfigs.length === 0 ? (
                      <p className="text-xs text-muted dark:text-muted-dark">Nessuna configurazione PED disponibile. Crea una nuova configurazione.</p>
                    ) : (
                      <SearchableSelect
                        value={form.ped_configuration_id}
                        onChange={(value) => updateForm("ped_configuration_id", value)}
                        options={[
                          { value: "", label: "— seleziona configurazione —" },
                          ...pedConfigs.map((configuration) => ({
                            value: String(configuration.id),
                            label: configuration.name ?? `Config #${configuration.id} (${configuration.monthly_publications_total} pubbl./mese)`,
                          })),
                        ]}
                        placeholder="— seleziona configurazione —"
                        searchPlaceholder="Cerca configurazione..."
                      />
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      <Input
                        label="Pubbl. totali/mese *"
                        type="number"
                        min="0"
                        step="1"
                        value={form.ped_monthly_publications_total}
                        onChange={(e) => updateForm("ped_monthly_publications_total", e.target.value)}
                        placeholder="es. 12"
                      />
                      <Input
                        label="Foto/mese"
                        type="number"
                        min="0"
                        step="1"
                        value={form.ped_photo_posts_per_month}
                        onChange={(e) => updateForm("ped_photo_posts_per_month", e.target.value)}
                      />
                      <Input
                        label="Caroselli/mese"
                        type="number"
                        min="0"
                        step="1"
                        value={form.ped_carousels_per_month}
                        onChange={(e) => updateForm("ped_carousels_per_month", e.target.value)}
                      />
                      <Input
                        label="Reel/mese"
                        type="number"
                        min="0"
                        step="1"
                        value={form.ped_reels_per_month}
                        onChange={(e) => updateForm("ped_reels_per_month", e.target.value)}
                      />
                      <Input
                        label="Storie/mese"
                        type="number"
                        min="0"
                        step="1"
                        value={form.ped_stories_per_month}
                        onChange={(e) => updateForm("ped_stories_per_month", e.target.value)}
                      />
                    </div>

                    <Input
                      label="Tone of voice"
                      value={form.ped_tone_of_voice}
                      onChange={(e) => updateForm("ped_tone_of_voice", e.target.value)}
                      placeholder="es. professionale, vicino, tecnico"
                    />
                  </div>
                )}
              </div>
            )}
          </fieldset>

          {/* — Slot orari (edit only) — */}
          {sourceItem && (
            <>
              <div className="h-px bg-line dark:bg-line-dark" />
              <fieldset className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <legend className="text-[11px] font-bold uppercase tracking-widest text-muted dark:text-muted-dark">
                    Slot orari ({slots.length})
                  </legend>
                  {!addingSlot && (
                    <button
                      type="button"
                      onClick={() => setAddingSlot(true)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-ink hover:text-muted dark:text-paper dark:hover:text-muted-dark"
                    >
                      <Icon name="plus" className="h-3 w-3" />
                      Aggiungi
                    </button>
                  )}
                </div>

                {slots.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    {slots
                      .slice()
                      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
                      .map((slot) => (
                        <TimeSlotRow
                          key={slot.id}
                          slot={slot}
                          canEdit
                          onToggleComplete={handleToggleSlot}
                          onDelete={handleDeleteSlot}
                        />
                      ))}
                  </div>
                )}

                {addingSlot && (
                  <div className="flex flex-col gap-2 rounded-lg border border-line bg-cream p-3 dark:border-line-dark dark:bg-[#1c1c20]">
                    {slotError && (
                      <p className="text-xs text-danger">{slotError}</p>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        label="Inizio *"
                        type="datetime-local"
                        value={slotForm.starts_at}
                        onChange={(e) => setSlotForm((s) => ({ ...s, starts_at: e.target.value }))}
                      />
                      <Input
                        label="Fine *"
                        type="datetime-local"
                        value={slotForm.ends_at}
                        onChange={(e) => setSlotForm((s) => ({ ...s, ends_at: e.target.value }))}
                      />
                    </div>
                    <Input
                      label="Descrizione"
                      value={slotForm.description}
                      onChange={(e) => setSlotForm((s) => ({ ...s, description: e.target.value }))}
                      placeholder="Opzionale"
                    />
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-ink dark:text-paper">
                      <Checkbox
                        checked={slotForm.is_completed}
                        onChange={(v) => setSlotForm((s) => ({ ...s, is_completed: v }))}
                      />
                      Completato
                    </label>
                    <div className="flex gap-2">
                      <Button size="sm" variant="primary" onClick={handleAddSlot} loading={slotSaving}>
                        Aggiungi
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setAddingSlot(false); setSlotForm(EMPTY_SLOT); setSlotError(null); }}
                        disabled={slotSaving}
                      >
                        Annulla
                      </Button>
                    </div>
                  </div>
                )}
              </fieldset>
            </>
          )}
        </div>
      )}
    </Modal>

    <WorkTagCreateModal
      open={workTagModalOpen}
      companyId={sourceItem?.company_id ?? companyId}
      onClose={() => setWorkTagModalOpen(false)}
      onCreated={(tag) => {
        setWorkTags((current) => (current.some((item) => item.id === tag.id) ? current : [...current, tag]));
        setForm((current) => ({
          ...current,
          tag_ids: current.tag_ids.includes(tag.id) ? current.tag_ids : [...current.tag_ids, tag.id],
        }));
        setWorkTagModalOpen(false);
        toast.success("Tag creato");
      }}
    />

    <WorkAreaCreateModal
      open={workAreaModalOpen}
      companyId={sourceItem?.company_id ?? companyId}
      onClose={() => setWorkAreaModalOpen(false)}
      onCreated={(area) => {
        setWorkAreas((current) => (current.some((item) => item.id === area.id) ? current : [...current, area]));
        setForm((current) => ({
          ...current,
          work_area_ids: current.work_area_ids.includes(area.id)
            ? current.work_area_ids
            : [...current.work_area_ids, area.id],
        }));
        setWorkAreaModalOpen(false);
        toast.success("Area creata");
      }}
    />
    </>
  );
}
