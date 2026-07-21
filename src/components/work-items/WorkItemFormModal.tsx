import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import {
  createWorkItemApi,
  instantiateWorkItemTemplateApi,
  isWorkItemOverlapApiError,
  listWorkItemsApi,
  rescheduleNextAvailableWorkItemApi,
  updateWorkItemApi,
  listWorkTagsApi,
  createTimeSlotApi,
  updateTimeSlotApi,
  deleteTimeSlotApi,
  isReviewSendBack,
  type WorkItem,
  type WorkItemStatus,
  type UrgencyLevel,
  type LeftBehindReason,
  type WorkItemRecurrenceType,
  type TimeSlot,
  type CreateWorkItemPayload,
  type WorkTag,
  type WorkItemOverlapConflict,
  type WorkItemSuggestedSlot,
} from "../../api/workItems";
import {
  checkWorkItemOverbookingApi,
  type OverbookingCheckResponse,
} from "../../api/workload";
import { listWorkAreasApi, type WorkArea } from "../../api/workAreas";
import { getUsersApi, type User } from "../../api/users";
import { getClientsApi, type Client } from "../../api/clients";
import { listPedConfigurationsApi, type PedConfiguration } from "../../api/pedConfigurations";
import { ClientSelectorWithCreate } from "../clients/ClientSelectorWithCreate";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { Icon } from "../ui/Icon";
import { SectionCard } from "../ui/SectionCard";
import { FieldHelpPopover } from "../ui/FieldHelpPopover";
import { EstimatedHoursField } from "../ui/EstimatedHoursField";
import { LoadWeightField } from "../ui/LoadWeightField";
import { MultiSelect } from "../ui/MultiSelect";
import { SearchableSelect } from "../ui/SearchableSelect";
import { Checkbox } from "../ui/Checkbox";
import { Textarea } from "../ui/Textarea";
import { Linkify } from "../ui/Linkify";
import { WorkAreaCreateModal } from "../work-taxonomy/WorkAreaCreateModal";
import { WorkTagCreateModal } from "../work-taxonomy/WorkTagCreateModal";
import { OverbookingModal } from "./OverbookingModal";
import { useToast } from "../../context/ToastContext";
import { useWorkItemDetail } from "../../hooks/useWorkItemDetail";
import { ReviewTab, type ReviewTabHandle } from "../review/ReviewTab";
import { detectResourceType } from "../../utils/taskResources";
import { ResourceIcon } from "./ResourceIcon";

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

const WORKLOAD_FIELD_HELP = {
  client: {
    title: "Cliente",
    shortText: "Cliente a cui è associata la lavorazione.",
    longText:
      "Opzionale. Collega la task a un cliente per filtri, report e contratti.",
  },
  is_template: {
    title: "Salva come modello",
    shortText: "Salva la task come modello riutilizzabile invece di una lavorazione reale.",
    longText:
      "I modelli non finiscono in calendario: servono a creare velocemente nuove task con gli stessi campi precompilati.",
  },
  title: {
    title: "Titolo",
    shortText: "Nome breve e riconoscibile della lavorazione.",
    longText:
      "È l'etichetta mostrata in calendario e negli elenchi. Obbligatorio.",
  },
  is_priority: {
    title: "Priorità alta",
    shortText: "Segnala la task come prioritaria.",
    longText:
      "Evidenzia la lavorazione per distinguerla a colpo d'occhio; non cambia la pianificazione automatica.",
  },
  is_completed: {
    title: "Completata",
    shortText: "Segna la task come completata.",
    longText:
      "Una task completata non occupa più slot in calendario e non rientra nei calcoli di carico.",
  },
  work_date: {
    title: "Data lavorazione",
    shortText: "Giorno in cui si prevede di lavorare la task.",
    longText:
      "Se lasci vuoto l'orario di inizio, il sistema assegna automaticamente il primo slot libero di questo giorno (partendo dall'ora attuale se è oggi) e, se è pieno, spilla ai giorni successivi fino alla scadenza.",
  },
  start_time: {
    title: "Orario inizio",
    shortText: "Ora di inizio nel giorno di lavorazione.",
    longText:
      "Se lo imposti, l'orario è fisso (scelto da te). Se lo lasci vuoto viene assegnato automaticamente e resta riposizionabile.",
  },
  deadline_date: {
    title: "Scadenza",
    shortText: "Data entro cui la task deve essere completata.",
    longText:
      "Determina fin dove la pianificazione automatica può spostare la task sui giorni successivi. Superata la scadenza, la task risulta in ritardo.",
  },
  due_time_label: {
    title: "Orario di scadenza",
    shortText: "Orario entro cui la task deve essere completata nel giorno di scadenza (HH:MM).",
    longText:
      "Opzionale. Se valorizzato, nel giorno di scadenza la task risulta in ritardo solo dopo quell'orario.",
  },
  estimated_hours: {
    title: "Ore stimate",
    shortText: "Durata stimata della lavorazione.",
    longText:
      "Determina quanto spazio occupa in calendario e quanto pesa sul carico giornaliero dell'assegnatario.",
  },
  load_weight_factor: {
    title: "Peso della task",
    shortText: "Quanto la task pesa sul carico giornaliero (1× = pieno).",
    longText:
      "Moltiplicatore da 0 a 3× applicato alle ore stimate nel calcolo di carico/capacità: 0,5× conta metà delle ore, 2× il doppio. L'anteprima mostra le ore effettive occupate.",
  },
  affects_daily_load: {
    title: "Impatta il carico giornaliero",
    shortText: "Se attivo, la task conta nel carico/capacità del giorno.",
    longText:
      "Disattivalo per attività che non devono pesare sul calcolo della saturazione dell'operatore (es. promemoria).",
  },
  is_deadline_locked: {
    title: "Task non derogabile",
    shortText: "Rende non derogabile la scadenza della task evitando spostamenti automatici.",
    longText:
      "Quando attivo, la scadenza impostata viene mantenuta anche durante ricalcoli o ripianificazioni.",
  },
  is_left_behind: {
    title: "Task lasciata indietro",
    shortText: "Marca la task come arretrata, indicandone il motivo.",
    longText:
      "Usato quando una task non è stata svolta nel giorno previsto: permette di indicare la responsabilità e di gestirne il peso residuo.",
  },
  is_fractionable: {
    title: "Suddivisione attività",
    shortText: "Se attivo, la task può essere spezzata in più blocchi.",
    longText:
      "Attiva questa opzione quando il lavoro può essere distribuito su più giorni o slot. Disattivala per attività che richiedono continuità.",
  },
  status: {
    title: "Stato",
    shortText: "Stato di avanzamento della lavorazione.",
    longText:
      "Indica la fase corrente (es. pianificata, in corso, completata). Usato per filtri e viste.",
  },
  progress_percent: {
    title: "Avanzamento (%)",
    shortText: "Percentuale di completamento della task (0–100).",
    longText:
      "Indicativo dello stato di avanzamento, separato dallo stato.",
  },
  urgency_level: {
    title: "Urgenza",
    shortText: "Livello di urgenza della task.",
    longText:
      "Classifica quanto è urgente la lavorazione, a supporto di ordinamento e priorità visiva.",
  },
  assignee_ids: {
    title: "Assegnatari",
    shortText: "Operatori responsabili della lavorazione.",
    longText:
      "La pianificazione automatica cerca uno slot libero per tutti gli assegnatari. Senza assegnatari la task non riceve un orario automatico.",
  },
  work_area_ids: {
    title: "Aree di lavoro",
    shortText: "Aree/reparti a cui appartiene la task.",
    longText:
      "Servono a classificare e filtrare le lavorazioni per area operativa.",
  },
  tag_ids: {
    title: "Tag",
    shortText: "Etichette libere per classificare la task.",
    longText:
      "Usa i tag per raggruppare e filtrare le lavorazioni trasversalmente alle aree.",
  },
  status_comment: {
    title: "Commento cambio stato",
    shortText: "Nota opzionale registrata quando cambi lo stato della task.",
    longText:
      "Utile in revisione: admin/PM può rimandare la task in lavorazione o confermarla spiegando il motivo. Appare nella timeline accanto al passaggio di stato.",
  },
  reviewer: {
    title: "Revisore",
    shortText: "Chi revisiona la task. Lo nominano solo PM/Admin.",
    longText:
      "Default automatico: il PM dell'area della task. In revisione la lavorazione pesa 0.25 sul revisore (che diventa assegnatario) e 0 sull'operatore.",
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
  is_fractionable: boolean;
  is_deadline_locked: boolean;
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
  resources: ResourceFormState[];
}

/** Riga risorsa nel form (stessa forma del payload; l'ordine dell'array = ordine mostrato). */
interface ResourceFormState {
  type: string;
  title: string;
  url: string;
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
  is_fractionable: true,
  is_deadline_locked: false,
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
  resources: [],
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

function workItemEventLabel(eventType: string, fieldName?: string | null): string {
  switch (eventType) {
    case "work_item_created":
      return "Task creata";
    case "work_item_created_from_recurrence":
      return "Creata da ricorrenza";
    case "work_item_created_from_template":
      return "Creata da template";
    case "recurrence_generated":
      return "Ricorrenze generate";
    case "field_updated":
      if (fieldName === "load_weight_factor") return "Peso aggiornato";
      if (fieldName === "deadline_date") return "Scadenza riprogrammata";
      if (fieldName === "estimated_hours") return "Tempo stimato aggiornato";
      return "Campo aggiornato";
    case "review_comment_added":
      return "Commento in revisione";
    case "review_sent_to_client":
      return "Inviata al cliente";
    case "review_unsent_to_client":
      return "Consegna al cliente annullata";
    case "review_send_back":
      return "Rimandata a correggere";
    case "work_item_date_moved":
      return "Spostata di giorno";
    case "work_item_carried_forward":
      return "Trascinata in avanti";
    case "work_item_became_overdue":
      return "Diventata in ritardo";
    case "status_changed":
      return "Stato cambiato";
    case "comment":
      return "Commento";
    case "reviewer_assigned":
      return "Revisore aggiornato";
    case "work_item_rescheduled_next_available":
      return "Rischedulata (primo slot disponibile)";
    case "work_item_deleted":
      return "Task archiviata";
    default:
      return eventType;
  }
}

function formatHistoryValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

// Etichette stato in italiano per la timeline (es. "in_progress" → "In corso").
function statusHistoryLabel(value: unknown): string {
  const v = typeof value === "string" ? value : value == null ? "" : String(value);
  switch (v) {
    case "planned": return "Da fare";
    case "in_progress": return "In corso";
    case "review": return "Revisione";
    case "completed":
    case "done": return "Completato";
    case "blocked": return "Bloccata";
    case "cancelled": return "Annullata";
    default: return v;
  }
}

function applyLeftBehindDefaults(reason: LeftBehindReason): Pick<WorkItemFormState, "affects_daily_load" | "load_weight_factor"> {
  if (reason === "client_protection") return { affects_daily_load: false, load_weight_factor: "0" };
  if (reason === "justified_delay") return { affects_daily_load: true, load_weight_factor: "0.5" };
  return { affects_daily_load: true, load_weight_factor: "1" };
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
  /** PM/Admin: può nominare/cambiare il revisore. */
  canManageReviewer?: boolean;
  /** Pre-fill work_date when creating */
  defaultWorkDate?: string;
  /** Pre-fill start_time when creating */
  defaultStartTime?: string;
  /** Pre-fill estimated_hours when creating */
  defaultEstimatedHours?: number;
  /** Pre-fill assignee_ids when creating */
  defaultAssigneeIds?: number[];
  onOverlapConflict?: (
    message: string,
    conflicts: WorkItemOverlapConflict[],
    suggestedSlots: WorkItemSuggestedSlot[],
    onPickSlot: (slot: WorkItemSuggestedSlot) => void
  ) => void;
  /** savedItem valorizzato solo in CREAZIONE (serve per l'undo "elimina il creato"). */
  onSaved: (savedItem?: WorkItem) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function WorkItemFormModal({
  open,
  onClose,
  editingItem = null,
  instantiateTemplate = null,
  companyId,
  isAdmin,
  canManageReviewer = false,
  defaultWorkDate,
  defaultStartTime,
  defaultEstimatedHours,
  defaultAssigneeIds,
  onOverlapConflict,
  onSaved,
}: WorkItemFormModalProps) {
  const toast = useToast();
  const hydratedFormKeyRef = useRef<string | null>(null);
  // Traccia per quale task è già stata applicata l'apertura automatica sulla scheda Revisione.
  const reviewTabAppliedForRef = useRef<number | null>(null);
  const [activeWorkItemId, setActiveWorkItemId] = useState<number | null>(editingItem?.id ?? null);

  useEffect(() => {
    setActiveWorkItemId(editingItem?.id ?? null);
  }, [open, editingItem?.id]);

  const isInstantiateMode = editingItem == null && instantiateTemplate != null;

  const { workItem: detailedEditingItem, isLoading: isDetailLoading, error: detailError, refetch: refetchDetail } = useWorkItemDetail(
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

  // ── Overbooking check (mostrato dopo la creazione di una task)
  const [overbookingData, setOverbookingData] = useState<OverbookingCheckResponse | null>(null);
  const [overbookingItemId, setOverbookingItemId] = useState<number | null>(null);
  const [reassigningUserId, setReassigningUserId] = useState<number | null>(null);
  const [reschedulingOverbooking, setReschedulingOverbooking] = useState(false);

  // ── Scheda attiva nel layout di creazione singola
  const [createTab, setCreateTab] = useState<"dettagli" | "tag" | "template">("dettagli");
  // ── Scheda attiva nel layout di modifica (mostra tutto, diviso in schede)
  const [editTab, setEditTab] = useState<"dettagli" | "assegnazioni" | "checklist" | "revisione" | "timeline">("dettagli");
  // ── Commento opzionale per il cambio stato (salvato come nota nella timeline)
  const [statusComment, setStatusComment] = useState("");
  // ── Revisore selezionato (PM/Admin). Inizializzato dal dettaglio task.
  const [reviewerUserId, setReviewerUserId] = useState<number | null>(null);
  // ── Scheda Revisione: le azioni ("Rimanda indietro e correggi" / "Salva e concludi")
  //    vivono nel footer del modale e pilotano la ReviewTab via ref imperativo.
  const reviewRef = useRef<ReviewTabHandle>(null);
  const [reviewAction, setReviewAction] = useState<null | "sendback" | "conclude">(null);
  const runReviewAction = async (action: "sendback" | "conclude") => {
    setReviewAction(action);
    try {
      if (action === "sendback") await reviewRef.current?.sendBack();
      else await reviewRef.current?.saveConclude();
    } finally {
      setReviewAction(null);
    }
  };

  // ── Options
  const [users, setUsers] = useState<User[]>([]);
  const [workAreas, setWorkAreas] = useState<WorkArea[]>([]);
  const [workTags, setWorkTags] = useState<WorkTag[]>([]);
  const [templates, setTemplates] = useState<WorkItem[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [clients, setClients] = useState<Client[]>([]);
  const [pedConfigs, setPedConfigs] = useState<PedConfiguration[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);

  // Utente corrente: in creazione la task viene preassegnata a lui con le sue aree.
  // Ref per leggerlo nell'effetto di init senza farlo rientrare nelle dipendenze.
  const { user: currentUser } = useAuth();
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;
  const autofilledRef = useRef(false);

  // ── Form
  const [form, setForm] = useState<WorkItemFormState>(EMPTY_FORM);
  // Descrizione: vista in lettura (link cliccabili) di default quando c'è già del
  // testo; textarea in modifica. Impostata all'hydration del form.
  const [descEditing, setDescEditing] = useState(false);
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
      reviewTabAppliedForRef.current = null;
    } else {
      setCreateTab("dettagli");
      setEditTab("dettagli");
    }
  }, [open]);

  // Se la task è in revisione, apri direttamente sulla scheda Revisione (una sola
  // volta per task, quando il dettaglio è arrivato: non forza se poi l'utente cambia tab).
  useEffect(() => {
    if (!open || !sourceItem) return;
    if (reviewTabAppliedForRef.current === sourceItem.id) return;
    reviewTabAppliedForRef.current = sourceItem.id;
    if (sourceItem.status === "review") setEditTab("revisione");
  }, [open, sourceItem]);

  // ── Load options when modal opens
  useEffect(() => {
    if (!open) return;
    setOptionsLoading(true);
    Promise.all([
      getUsersApi(companyId).then(setUsers).catch(() => {}),
      listWorkAreasApi({ company_id: companyId }).then(setWorkAreas).catch(() => {}),
      listWorkTagsApi(companyId).then(setWorkTags).catch(() => {}),
      listWorkItemsApi({ company_id: companyId, only_templates: true }).then(setTemplates).catch(() => setTemplates([])),
      getClientsApi({ company_id: companyId, per_page: 1000 }).then((r) => setClients(r.data)).catch(() => {}),
      listPedConfigurationsApi(companyId).then(setPedConfigs).catch(() => setPedConfigs([])),
    ]).finally(() => setOptionsLoading(false));
  }, [open, companyId]);

  // Il commento del cambio stato è transitorio: si azzera ad ogni apertura/cambio task.
  useEffect(() => {
    setStatusComment("");
  }, [open, activeWorkItemId]);

  // Revisore: inizializzato dal dettaglio task (si aggiorna quando il dettaglio arriva).
  useEffect(() => {
    setReviewerUserId(sourceItem?.reviewer_user_id ?? null);
  }, [open, activeWorkItemId, sourceItem?.reviewer_user_id]);

  // Preselezione in CREAZIONE: operatore corrente + sue aree di lavoro, ma:
  // - solo se l'operatore appartiene all'azienda visualizzata (è tra gli utenti caricati);
  // - limitando le aree a quelle dell'azienda visualizzata (intersezione con le opzioni).
  // Gira dopo il load delle opzioni e riempie solo i campi ancora vuoti (non sovrascrive
  // assegnatari imposti dal chiamante né modifiche dell'utente).
  useEffect(() => {
    if (!open || optionsLoading) return;
    if (sourceItem || templateSeedItem || isInstantiateMode) return; // solo create puro
    if (autofilledRef.current) return;
    autofilledRef.current = true;
    const me = currentUserRef.current;
    if (!me || !users.some((u) => u.id === me.id)) return; // operatore non di questa azienda
    const validAreas = new Set(workAreas.map((a) => a.id));
    const myAreas = (me.work_area_ids ?? []).filter((id) => validAreas.has(id));
    setForm((current) => ({
      ...current,
      assignee_ids: current.assignee_ids.length ? current.assignee_ids : [me.id],
      work_area_ids: current.work_area_ids.length ? current.work_area_ids : myAreas,
    }));
  }, [open, optionsLoading, users, workAreas, sourceItem, templateSeedItem, isInstantiateMode]);

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
      !sourceItem && !templateSeedItem ? (defaultWorkDate ?? "none") : "skip-date",
      !sourceItem && !templateSeedItem ? (defaultStartTime ?? "none") : "skip-time",
      !sourceItem && !templateSeedItem ? String(defaultEstimatedHours ?? "none") : "skip-hours",
      !sourceItem && !templateSeedItem ? (defaultAssigneeIds ?? []).join(",") : "skip-assignees",
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
        is_fractionable: baseItem.is_fractionable ?? true,
        is_deadline_locked: baseItem.is_deadline_locked ?? false,
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
        resources: (baseItem.resources ?? [])
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((resource) => ({ type: resource.type, title: resource.title, url: resource.url })),
      });
      setSlots(isInstantiateMode ? [] : (baseItem.time_slots ?? []));
      // testo già presente → parti in lettura (link formattati); vuoto → modifica
      setDescEditing(!(baseItem.description ?? "").trim());
    } else {
      setForm({
        ...EMPTY_FORM,
        work_date: defaultWorkDate ?? "",
        start_time: defaultStartTime ?? "",
        estimated_hours: defaultEstimatedHours != null ? String(defaultEstimatedHours) : "",
        assignee_ids: defaultAssigneeIds ?? [],
        is_fractionable: true,
        is_deadline_locked: false,
      });
      // La preassegnazione (operatore corrente + sue aree) avviene dopo il caricamento
      // delle opzioni dell'azienda, così le aree sono filtrate su quella visualizzata.
      autofilledRef.current = false;
      setSlots([]);
      setDescEditing(true);
    }
    hydratedFormKeyRef.current = hydrationKey;
    setFormError(null);
    setSlotForm(EMPTY_SLOT);
    setAddingSlot(false);
    setSlotError(null);
  }, [sourceItem, templateSeedItem, open, defaultWorkDate, defaultStartTime, defaultEstimatedHours, defaultAssigneeIds, isInstantiateMode]);

  const updateForm = <K extends keyof WorkItemFormState>(key: K, value: WorkItemFormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const closeModal = () => {
    if (saving) return;
    onClose();
  };

  // ── Save
  const handleSave = async (scheduleOverride?: { work_date: string; start_time: string }) => {
    const isGeneratedRecurringItem = sourceItem?.recurrence_parent_id != null;
    const canEditRecurrence = !isGeneratedRecurringItem;

    if (!form.title.trim()) {
      setCreateTab("dettagli");
      setEditTab("dettagli");
      setFormError("Il titolo è obbligatorio");
      return;
    }
    if (form.is_left_behind && !form.left_behind_reason) {
      setEditTab("dettagli");
      setFormError("Seleziona il motivo per la task lasciata indietro");
      return;
    }
    if (form.load_weight_factor) {
      const weight = parseFloat(form.load_weight_factor);
      if (!Number.isFinite(weight) || weight < 0 || weight > 3) {
        setEditTab("dettagli");
        setFormError("Il fattore peso deve essere tra 0 e 3");
        return;
      }
    }

    if (canEditRecurrence && form.is_recurring) {
      setCreateTab("dettagli");
      setEditTab("dettagli");
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

    // La configurazione PED è facoltativa: spuntare "PED" marca la task come Piano
    // Editoriale Digitale, non obbliga a sceglierne/compilarne una. Validiamo i campi
    // solo se l'utente sta davvero creando una nuova configurazione (ha inserito le
    // pubblicazioni totali).
    if (form.is_ped && form.ped_mode === "new" && form.ped_monthly_publications_total.trim()) {
      const pedNumericFields = [
        { label: "Pubblicazioni totali/mese", value: form.ped_monthly_publications_total },
        { label: "Foto/mese", value: form.ped_photo_posts_per_month },
        { label: "Caroselli/mese", value: form.ped_carousels_per_month },
        { label: "Reel/mese", value: form.ped_reels_per_month },
        { label: "Storie/mese", value: form.ped_stories_per_month },
      ];
      for (const field of pedNumericFields) {
        if (!/^\d+$/.test(field.value.trim())) {
          setCreateTab("template");
          setEditTab("checklist");
          setFormError(`${field.label}: inserisci un intero maggiore o uguale a 0`);
          return;
        }
      }
    }

    for (const checklist of form.checklists) {
      if (!checklist.title.trim()) {
        setCreateTab("tag");
        setEditTab("checklist");
        setFormError("Ogni checklist deve avere un titolo");
        return;
      }
      for (const item of checklist.items) {
        if (!item.title.trim()) {
          setCreateTab("tag");
          setEditTab("checklist");
          setFormError("Ogni elemento checklist deve avere un titolo");
          return;
        }
        for (const slot of item.time_slots) {
          if (!slot.starts_at || !slot.ends_at) {
            setCreateTab("tag");
            setEditTab("checklist");
            setFormError("Ogni slot checklist deve avere inizio e fine");
            return;
          }
          if (new Date(slot.ends_at) <= new Date(slot.starts_at)) {
            setCreateTab("tag");
            setEditTab("checklist");
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
        work_date: scheduleOverride?.work_date || form.work_date || undefined,
        start_time: scheduleOverride?.start_time || form.start_time || undefined,
        deadline_date: form.deadline_date || undefined,
        due_time_label: form.due_time_label.trim(),
        estimated_hours: form.estimated_hours ? parseFloat(form.estimated_hours) : undefined,
        is_fractionable: form.is_fractionable,
        is_deadline_locked: form.is_deadline_locked,
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
        if (form.ped_mode === "existing") {
          // Config esistente facoltativa: se non selezionata, resta un PED senza config.
          payload.ped_configuration_id = form.ped_configuration_id ? parseInt(form.ped_configuration_id, 10) : null;
        } else if (form.ped_monthly_publications_total.trim()) {
          // Config nuova solo se l'utente l'ha compilata.
          payload.ped_configuration_id = null;
          payload.ped_configuration = {
            monthly_publications_total: parseInt(form.ped_monthly_publications_total, 10) || 0,
            tone_of_voice: form.ped_tone_of_voice.trim() || null,
            photo_posts_per_month: parseInt(form.ped_photo_posts_per_month, 10) || 0,
            carousels_per_month: parseInt(form.ped_carousels_per_month, 10) || 0,
            reels_per_month: parseInt(form.ped_reels_per_month, 10) || 0,
            stories_per_month: parseInt(form.ped_stories_per_month, 10) || 0,
          };
        } else {
          payload.ped_configuration_id = null;
        }
      } else {
        payload.ped_configuration_id = null;
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

      // Risorse: solo righe con URL non vuoto (il tipo, se assente, è dedotto dall'URL).
      // Gestite come le checklist: inviate quando presenti, sia in creazione sia in modifica.
      if (form.resources.length > 0) {
        payload.resources = form.resources
          .filter((resource) => resource.url.trim())
          .map((resource) => ({
            type: (resource.type || detectResourceType(resource.url)).trim(),
            title: resource.title.trim(),
            url: resource.url.trim(),
          }));
      }

      let createdItem: WorkItem | null = null;
      if (sourceItem) {
        await updateWorkItemApi(sourceItem.id, {
          ...payload,
          status_comment:
            (isReviewSendBack(sourceItem.status, form.status) && statusComment.trim()) || undefined,
          reviewer_user_id:
            canManageReviewer && reviewerUserId !== (sourceItem.reviewer_user_id ?? null)
              ? reviewerUserId
              : undefined,
        });
        toast.success("Lavorazione aggiornata");
      } else if (instantiateTemplate?.id != null) {
        const {
          company_id: _companyId,
          is_template: _isTemplate,
          ...instantiatePayload
        } = payload;
        void _companyId;
        void _isTemplate;
        createdItem = await instantiateWorkItemTemplateApi(instantiateTemplate.id, instantiatePayload);
        toast.success("Lavorazione creata da modello");
      } else if (selectedTemplateId) {
        const {
          company_id: _companyId,
          is_template: _isTemplate,
          ...instantiatePayload
        } = payload;
        void _companyId;
        void _isTemplate;
        createdItem = await instantiateWorkItemTemplateApi(Number(selectedTemplateId), instantiatePayload);
        toast.success("Lavorazione creata da modello");
      } else {
        createdItem = await createWorkItemApi(payload);
        toast.success("Lavorazione creata");
      }

      // Dopo la creazione, verifica se l'operatore assegnato va in overbooking:
      // in tal caso apri il modal di riassegnazione sopra a quello della task.
      if (createdItem && createdItem.assignee_ids?.length) {
        try {
          const check = await checkWorkItemOverbookingApi(createdItem.id, {
            company_id: createdItem.company_id,
          });
          if (check.is_overbooking) {
            setOverbookingItemId(createdItem.id);
            setOverbookingData(check);
            return; // tieni aperto il form; il flusso prosegue dal modal di overbooking
          }
        } catch {
          // se la verifica fallisce non blocchiamo il salvataggio
        }
      }

      onClose();
      onSaved(createdItem ?? undefined);
    } catch (err) {
      if (isWorkItemOverlapApiError(err)) {
        setFormError(err.backendMessage);
        onOverlapConflict?.(err.backendMessage, err.conflicts, err.suggestedSlots, (slot) => {
          // Allinea i campi visibili e re-invia con lo slot scelto.
          updateForm("work_date", slot.date);
          updateForm("start_time", slot.start_time);
          void handleSave({ work_date: slot.date, start_time: slot.start_time });
        });
      } else if (err instanceof Error && err.message.includes("[403]")) {
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

  // ── Overbooking: chiusura del flusso (riassegna oppure procedi in overbook) ──
  const finishAfterOverbooking = () => {
    setOverbookingData(null);
    setOverbookingItemId(null);
    setReassigningUserId(null);
    setReschedulingOverbooking(false);
    onClose();
    onSaved();
  };

  // Riprogramma la task creata al primo slot libero (stesso operatore), risolvendo l'overbooking.
  const handleOverbookingReschedule = async () => {
    if (overbookingItemId == null) return;
    setReschedulingOverbooking(true);
    try {
      await rescheduleNextAvailableWorkItemApi(overbookingItemId, {
        from_date: form.work_date || new Date().toISOString().slice(0, 10),
      });
      toast.success("Task riprogrammata al primo slot libero");
      finishAfterOverbooking();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossibile riprogrammare la task");
      setReschedulingOverbooking(false);
    }
  };

  const handleOverbookingReassign = async (userId: number) => {
    if (overbookingItemId == null) return;
    setReassigningUserId(userId);
    try {
      await updateWorkItemApi(overbookingItemId, { assignee_ids: [userId] });
      toast.success("Task riassegnata");
      finishAfterOverbooking();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nella riassegnazione");
      setReassigningUserId(null);
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
              // Vuoto: così appare il placeholder "Titolo elemento" (grigio) che sparisce
              // da solo appena scrivi, invece di un testo da cancellare a mano.
              title: "",
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

  // ── Risorse / Collegamenti handlers (il tipo è SEMPRE dedotto dall'URL: niente selettore)
  const addResource = () => {
    setForm((current) => ({
      ...current,
      resources: [...current.resources, { type: "link", title: "", url: "" }],
    }));
  };

  const removeResource = (index: number) => {
    setForm((current) => ({
      ...current,
      resources: current.resources.filter((_, i) => i !== index),
    }));
  };

  const updateResourceUrl = (index: number, url: string) => {
    setForm((current) => ({
      ...current,
      resources: current.resources.map((resource, i) =>
        i === index ? { ...resource, url, type: detectResourceType(url) } : resource
      ),
    }));
  };

  const updateResourceTitle = (index: number, title: string) => {
    setForm((current) => ({
      ...current,
      resources: current.resources.map((resource, i) => (i === index ? { ...resource, title } : resource)),
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
  const userOptions = users.map((u) => ({ id: u.id, label: u.full_name ?? u.username, avatarUrl: u.avatar_url }));
  const areaOptions = workAreas.map((a) => ({ id: a.id, label: a.name, color: a.color }));
  const tagOptions = workTags.map((t) => ({ id: t.id, label: t.name, color: t.color }));
  const isGeneratedRecurringItem = sourceItem?.recurrence_parent_id != null;
  const isTemplateItem = sourceItem?.is_template === true;
  const isFromTemplate = sourceItem?.template_source_id != null;
  // In creazione singola usiamo un layout a schede con i soli campi essenziali.
  const isSingleCreate = !sourceItem;

  // ── Sezioni riutilizzabili (usate sia nel layout completo di modifica sia nelle schede di creazione)
  const renderRecurrenceSection = () => (
    <SectionCard icon="refresh-cw" title="Ricorrenza">
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
    </SectionCard>
  );

  const renderChecklistSection = () => (
    <SectionCard
      icon="check-circle"
      title="Checklist"
      count={form.checklists.length}
      actions={
        <button
          type="button"
          onClick={addChecklist}
          className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-ink hover:text-muted dark:text-paper dark:hover:text-muted-dark"
        >
          <Icon name="plus" className="h-3 w-3" />
          Aggiungi checklist
        </button>
      }
    >
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
    </SectionCard>
  );

  const renderResourcesSection = () => (
    <SectionCard
      icon="link"
      title="Risorse / Collegamenti"
      count={form.resources.length}
      actions={
        <button
          type="button"
          onClick={addResource}
          className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-ink hover:text-muted dark:text-paper dark:hover:text-muted-dark"
        >
          <Icon name="plus" className="h-3 w-3" />
          Aggiungi risorsa
        </button>
      }
    >
      {form.resources.length === 0 ? (
        <p className="text-sm text-muted dark:text-muted-dark">
          Nessuna risorsa. Aggiungi link a Canva, Google Drive, percorsi NAS o altri collegamenti.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {form.resources.map((resource, index) => (
            <div
              key={`resource-${index}`}
              className="rounded-lg border border-line bg-cream p-3 dark:border-line-dark dark:bg-[#1c1c20]"
            >
              <div className="flex items-start gap-2">
                <span
                  className="mt-6 flex h-9 w-9 flex-none items-center justify-center rounded-md border border-line bg-paper dark:border-line-dark dark:bg-[#131316]"
                  title="Tipo rilevato automaticamente dall'URL"
                >
                  <ResourceIcon type={detectResourceType(resource.url)} className="h-4 w-4" />
                </span>
                <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
                  <Input
                    label="URL o percorso"
                    value={resource.url}
                    onChange={(event) => updateResourceUrl(index, event.target.value)}
                    placeholder="https://…  oppure  \\server\cartella"
                  />
                  <Input
                    label="Titolo"
                    value={resource.title}
                    onChange={(event) => updateResourceTitle(index, event.target.value)}
                    placeholder="Es. Canva post, Brief Drive…"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeResource(index)}
                  className="mt-6 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-danger/30 text-danger hover:bg-danger/10"
                  aria-label="Rimuovi risorsa"
                  title="Rimuovi risorsa"
                >
                  <Icon name="trash" className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );

  // Scorciatoia: se il titolo contiene "PED" (Piano Editoriale Digitale) come parola,
  // portiamo la sezione PED accanto al titolo per impostarla al volo senza cambiare tab.
  const titleSuggestsPed = /\bped\b/i.test(form.title);

  // Attivando il PED riportiamo "PED" nel titolo (se non c'è già), così è subito
  // evidente che la task è un Piano Editoriale Digitale.
  const handleTogglePed = (value: boolean) => {
    setForm((prev) => {
      if (!value) return { ...prev, is_ped: false };
      const title = /\bped\b/i.test(prev.title)
        ? prev.title
        : prev.title.trim()
          ? `PED ${prev.title.trim()}`
          : "PED";
      return { ...prev, is_ped: true, title };
    });
  };

  // Marcatore visibile che la task è un PED, mostrato accanto al titolo.
  // Campo Descrizione: in lettura mostra i link cliccabili (Linkify), con matita
  // per passare in modifica (textarea). Condiviso dai due layout del form.
  const renderDescriptionField = (rows: number) => {
    const hasDesc = !!form.description.trim();
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
            Descrizione
          </label>
          {hasDesc && (
            <button
              type="button"
              onClick={() => setDescEditing((v) => !v)}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-magenta hover:underline"
            >
              <Icon name={descEditing ? "eye" : "pencil"} className="h-3 w-3" /> {descEditing ? "Anteprima" : "Modifica"}
            </button>
          )}
        </div>
        {!descEditing && hasDesc ? (
          <div
            onClick={() => setDescEditing(true)}
            title="Clicca per modificare"
            className="min-h-[40px] cursor-text whitespace-pre-line break-words rounded-md border border-line bg-paper px-3 py-2.5 text-sm text-ink dark:border-line-dark dark:bg-ink-soft dark:text-paper"
          >
            <Linkify text={form.description} linkClassName="text-brand-magenta underline underline-offset-2 [overflow-wrap:anywhere]" />
          </div>
        ) : (
          <Textarea
            value={form.description}
            onChange={(e) => updateForm("description", e.target.value)}
            placeholder="Descrizione opzionale..."
            rows={rows}
            className="w-full rounded-md border border-line bg-paper px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none dark:border-line-dark dark:bg-ink-soft dark:text-paper dark:placeholder:text-muted-dark dark:focus:border-paper"
          />
        )}
      </div>
    );
  };

  const renderPedTitleBadge = () =>
    form.is_ped ? (
      <span className="inline-flex w-fit items-center gap-1 rounded-pill border border-info/30 bg-info/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-info">
        <Icon name="grid" className="h-3 w-3" />
        Task PED
      </span>
    ) : null;

  const renderPedShortcut = () =>
    titleSuggestsPed ? (
      <div className="flex flex-col gap-1.5">
        <p className="flex items-center gap-1.5 text-xs text-muted dark:text-muted-dark">
          <Icon name="grid" className="h-3.5 w-3.5 shrink-0" />
          Il titolo contiene “PED”: impostala come task PED qui sotto.
        </p>
        {renderPedSection()}
      </div>
    ) : null;

  const renderPedSection = () => (
    <SectionCard icon="grid" title="PED">
      {/* La checkbox è sempre disponibile, anche in modifica: si può rendere una task
          un PED (o toglierlo) e configurarlo dopo la creazione. */}
      <label className="flex cursor-pointer items-center gap-2 text-sm text-ink dark:text-paper">
        <Checkbox
          checked={form.is_ped}
          onChange={(value) => handleTogglePed(value)}
        />
        È una task PED (Piano Editoriale Digitale)
      </label>

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
    </SectionCard>
  );

  const CREATE_TABS = [
    { id: "dettagli", label: "Dettagli" },
    { id: "tag", label: "Tag & Checklist" },
    { id: "template", label: "Template & PED" },
  ] as const;

  const renderCreateLayout = () => (
    <div className="flex min-w-0 max-w-full flex-col gap-4 overflow-x-hidden">
      {formError && (
        <div className="rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
          {formError}
        </div>
      )}

      {/* Parti da un template */}
      {!isInstantiateMode && (
        <div className="flex flex-col gap-1 rounded-md border border-line bg-cream/50 px-3 py-2 dark:border-line-dark dark:bg-[#1c1c20]">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
            Parti da un template
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

      {/* Schede */}
      <div className="flex items-center gap-1 border-b border-line dark:border-line-dark">
        {CREATE_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setCreateTab(tab.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
              createTab === tab.id
                ? "border-ink text-ink dark:border-paper dark:text-paper"
                : "border-transparent text-muted hover:text-ink dark:text-muted-dark dark:hover:text-paper"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* — Dettagli — */}
      {createTab === "dettagli" && (
        <div className="flex flex-col gap-3">
          <Input
            label="Titolo *"
            labelIcon={<Icon name="pencil" className="h-3.5 w-3.5" />}
            value={form.title}
            onChange={(e) => updateForm("title", e.target.value)}
            placeholder="Titolo della lavorazione"
          />
          {renderPedTitleBadge()}
          {renderPedShortcut()}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1">
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
                menuLayer="portal"
                className="min-w-0 max-w-full"
              />
            </div>
            <MultiSelect
              label="Area"
              value={form.work_area_ids}
              onChange={(v) => updateForm("work_area_ids", v)}
              options={areaOptions}
              placeholder="Seleziona aree..."
              onCreateClick={isAdmin ? () => setWorkAreaModalOpen(true) : undefined}
              createActionLabel="Crea area"
            />
          </div>
          <MultiSelect
            label="Operatore"
            value={form.assignee_ids}
            onChange={(v) => updateForm("assignee_ids", v)}
            options={userOptions}
            placeholder="Seleziona operatori..."
          />
          {renderDescriptionField(3)}
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink dark:text-paper">
            <Checkbox
              checked={form.is_priority}
              onChange={(v) => updateForm("is_priority", v)}
            />
            🚩 Priorità alta
          </label>
        </div>
      )}

      {/* — Pianificazione (mostrata nella stessa scheda Dettagli) — */}
      {createTab === "dettagli" && (
        <div className="flex flex-col gap-3 border-t border-line pt-4 dark:border-line-dark">
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted dark:text-muted-dark">
            Pianificazione
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Input
              label="Giorno di lavoro"
              type="date"
              value={form.work_date}
              onChange={(e) => updateForm("work_date", e.target.value)}
              onPostpone={(iso) => updateForm("work_date", iso)}
            />
            <Input
              label="Orario di inizio (opz.)"
              type="time"
              value={form.start_time}
              onChange={(e) => updateForm("start_time", e.target.value)}
            />
            <EstimatedHoursField
              value={form.estimated_hours}
              onChange={(v) => updateForm("estimated_hours", v == null ? "" : String(v))}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label="Giorno di scadenza"
              type="date"
              value={form.deadline_date}
              onChange={(e) => updateForm("deadline_date", e.target.value)}
              onPostpone={(iso) => updateForm("deadline_date", iso)}
              disabled={form.is_deadline_locked}
              hint={form.is_deadline_locked ? "Scadenza bloccata: task non derogabile" : undefined}
              className={form.is_deadline_locked ? "cursor-not-allowed opacity-60" : ""}
            />
            <Input
              label="Orario di scadenza (opz.)"
              type="time"
              value={form.due_time_label}
              onChange={(e) => updateForm("due_time_label", e.target.value)}
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink dark:text-paper">
            <Checkbox
              checked={form.is_deadline_locked}
              onChange={(v) => updateForm("is_deadline_locked", v)}
            />
            Task non derogabile
            <FieldHelpPopover {...WORKLOAD_FIELD_HELP.is_deadline_locked} />
          </label>

          <div className="h-px bg-line dark:bg-line-dark" />
          {renderRecurrenceSection()}
        </div>
      )}

      {/* — Tag & Checklist — */}
      {createTab === "tag" && (
        <div className="flex flex-col gap-3">
          <MultiSelect
            label="Tag"
            value={form.tag_ids}
            onChange={(v) => updateForm("tag_ids", v)}
            options={tagOptions}
            placeholder="Seleziona tag..."
            onCreateClick={isAdmin ? () => setWorkTagModalOpen(true) : undefined}
            createActionLabel="Crea tag"
          />
          <div className="h-px bg-line dark:bg-line-dark" />
          {renderChecklistSection()}
          <div className="h-px bg-line dark:bg-line-dark" />
          {renderResourcesSection()}
        </div>
      )}

      {/* — Template & PED — */}
      {createTab === "template" && (
        <div className="flex flex-col gap-3">
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
              Questo elemento non apparirà nella lista operativa standard.
            </p>
          )}
          <div className="h-px bg-line dark:bg-line-dark" />
          {renderPedSection()}
        </div>
      )}
    </div>
  );

  // ── Render
  return (
    <>
    <Modal
      open={open}
      onClose={closeModal}
      icon={<Icon name="check-circle" className="h-5 w-5" />}
      title={sourceItem ? "Modifica lavorazione" : (isInstantiateMode ? "Nuova lavorazione da modello" : "Nuova lavorazione")}
      description="Compila i dati della lavorazione. I campi con * sono obbligatori."
      size="xl"
      dialogClassName="h-[85vh] !max-w-3xl"
      bodyClassName="overflow-x-hidden"
      footer={
        sourceItem && editTab === "revisione" ? (
          // Sul tab Revisione le azioni sono i due pulsanti gemelli, qui nel footer
          // accanto a "Chiudi": niente "Salva" generico.
          <>
            <Button variant="ghost" onClick={closeModal} disabled={saving || reviewAction != null}>
              Chiudi
            </Button>
            {canManageReviewer && (
              <>
                <Button
                  variant="secondary"
                  onClick={() => void runReviewAction("sendback")}
                  loading={reviewAction === "sendback"}
                  disabled={reviewAction != null}
                >
                  Rimanda indietro e correggi
                </Button>
                <Button
                  variant="primary"
                  onClick={() => void runReviewAction("conclude")}
                  loading={reviewAction === "conclude"}
                  disabled={reviewAction != null}
                >
                  Salva e concludi
                </Button>
              </>
            )}
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={closeModal} disabled={saving}>
              Annulla
            </Button>
            <Button variant="primary" onClick={() => handleSave()} loading={saving}>
              Salva
            </Button>
          </>
        )
      }
    >
      {optionsLoading || isDetailLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-ink dark:border-line-dark dark:border-t-paper" />
        </div>
      ) : isSingleCreate ? (
        renderCreateLayout()
      ) : (
        <div className="flex min-w-0 max-w-full flex-col gap-5 overflow-x-hidden">
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
                {sourceItem.schedule_state?.should_force_today && sourceItem.work_date && (
                  <span
                    className="inline-flex rounded-pill border border-[#c41284]/35 bg-[#c41284]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#a30f6e] dark:text-[#e91e8a]"
                    title="Non completata nel giorno pianificato: portata a oggi"
                  >
                    ↪ dal {sourceItem.work_date.slice(8, 10)}/{sourceItem.work_date.slice(5, 7)}
                  </span>
                )}
                {sourceItem.trello_card_url && (
                  <a
                    href={sourceItem.trello_card_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-pill border border-[#0079bf]/40 bg-[#0079bf]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#0079bf] hover:bg-[#0079bf]/20"
                    title="Apri la card su Trello"
                  >
                    <Icon name="trello" className="h-3 w-3" /> Vedi su Trello
                  </a>
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

          {/* Schede modifica */}
          <div className="flex flex-wrap items-center gap-1 border-b border-line dark:border-line-dark">
            {([
              { id: "dettagli", label: "Dettagli" },
              { id: "assegnazioni", label: "Assegnazioni & Tag" },
              { id: "checklist", label: "Checklist & PED" },
              { id: "revisione", label: "Revisione" },
              { id: "timeline", label: "Timeline eventi" },
            ] as const).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setEditTab(tab.id)}
                className={`-mb-px border-b-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                  editTab === tab.id
                    ? "border-ink text-ink dark:border-paper dark:text-paper"
                    : "border-transparent text-muted hover:text-ink dark:text-muted-dark dark:hover:text-paper"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {editTab === "revisione" && sourceItem && (
            <ReviewTab
              ref={reviewRef}
              workItemId={sourceItem.id}
              canManage={canManageReviewer}
              onChanged={() => void refetchDetail()}
              renderActionsInline={false}
            />
          )}

          {editTab === "timeline" && (
            <div className="rounded-md border border-line dark:border-line-dark p-3">
              <div className="mb-2 text-[11px] uppercase tracking-wider text-muted dark:text-muted-dark">Timeline eventi</div>
              {isDetailLoading ? (
                <div className="text-sm text-muted dark:text-muted-dark">Caricamento cronologia…</div>
              ) : (sourceItem?.history ?? []).length === 0 ? (
                <div className="text-sm text-muted dark:text-muted-dark">Nessun evento disponibile.</div>
              ) : (
                <div className="space-y-2">
                  {(sourceItem?.history ?? [])
                    .slice()
                    .sort((a, b) => b.created_at.localeCompare(a.created_at))
                    .map((event, index) => {
                      const isCarried = event.event_type === "work_item_carried_forward";
                      const isStatus = event.event_type === "status_changed";
                      const isComment = event.event_type === "comment";
                      // Il commento utente (status_changed / comment) va in un blocco a sé;
                      // le note di sistema (carried_forward, overdue) restano inline.
                      const showCommentBlock = (isStatus || isComment) && !!event.notes;
                      const boxClass = isCarried
                        ? "border-warning/40 bg-warning/10"
                        : isStatus
                          ? "border-info/45 bg-info/10"
                          : isComment
                            ? "border-brand-magenta/45 bg-brand-magenta/5"
                            : "border-line dark:border-line-dark";
                      const labelClass = isCarried
                        ? "text-warning"
                        : isStatus
                          ? "text-info"
                          : isComment
                            ? "text-brand-magenta"
                            : "text-ink dark:text-paper";
                      const fromStr = isStatus ? statusHistoryLabel(event.from_value) : formatHistoryValue(event.from_value);
                      const toStr = isStatus ? statusHistoryLabel(event.to_value) : formatHistoryValue(event.to_value);
                      const showField = !!event.field_name && event.event_type !== "work_item_date_moved" && !isStatus;
                      const segments: string[] = [];
                      if (fromStr || toStr) {
                        const change = toStr ? `${fromStr ? `${fromStr} ` : ""}→ ${toStr}` : fromStr;
                        segments.push(showField ? `${event.field_name}: ${change}` : change);
                      } else if (showField) {
                        segments.push(String(event.field_name));
                      }
                      if (!showCommentBlock && event.notes) segments.push(event.notes);
                      return (
                        <div key={`${event.event_type}-${event.created_at}-${index}`} className={`rounded-md border p-2 ${boxClass}`}>
                          <div className={`text-xs font-semibold ${labelClass}`}>{workItemEventLabel(event.event_type, event.field_name)}</div>
                          <div className="mt-0.5 text-[11px] text-muted dark:text-muted-dark">
                            {new Date(event.created_at).toLocaleString("it-IT")}
                            {event.actor_name ? ` · ${event.actor_name}` : ""}
                          </div>
                          {segments.length > 0 && (
                            <div className="mt-1 text-xs text-muted dark:text-muted-dark">{segments.join(" · ")}</div>
                          )}
                          {showCommentBlock && (
                            <div className="mt-2 rounded-md border-l-2 border-brand-magenta/60 bg-cream px-2.5 py-1.5 dark:bg-[#1c1c20]">
                              <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-magenta">Commento</div>
                              <div className="mt-0.5 whitespace-pre-line break-words text-xs text-ink dark:text-paper">{event.notes}</div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}

          {editTab === "dettagli" && (
          <div className="flex min-w-0 flex-col gap-5">
          {/* — Base — */}
          <SectionCard icon="document-text" title="Base">
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
              <div className="flex min-w-0 flex-col gap-1">
              <label className="flex items-center text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
                Cliente
                <FieldHelpPopover {...WORKLOAD_FIELD_HELP.client} />
              </label>
                <ClientSelectorWithCreate
                  value={form.client_id}
                  onChange={(v) => updateForm("client_id", v)}
                  clients={clients}
                  companyId={companyId}
                  placeholder="Nessun cliente"
                  includeEmptyOption
                  emptyOptionLabel="Nessun cliente"
                  menuLayer="portal"
                  className="min-w-0 max-w-full"
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-ink dark:text-paper">
              <Checkbox
                checked={form.is_template}
                onChange={(v) => updateForm("is_template", v)}
                disabled={isInstantiateMode}
              />
              Salva come modello riutilizzabile
              <FieldHelpPopover {...WORKLOAD_FIELD_HELP.is_template} />
            </label>
            {form.is_template && (
              <p className="text-xs text-muted dark:text-muted-dark">
                Questo elemento non apparira nella lista operativa standard.
              </p>
            )}
            <Input
              label="Titolo *"
              labelIcon={<Icon name="pencil" className="h-3.5 w-3.5" />}
              value={form.title}
              onChange={(e) => updateForm("title", e.target.value)}
              placeholder="Titolo della lavorazione"
            />
            {renderPedTitleBadge()}
            {renderPedShortcut()}
            {renderDescriptionField(2)}
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-ink dark:text-paper">
                <Checkbox
                  checked={form.is_priority}
                  onChange={(v) => updateForm("is_priority", v)}
                />
                🚩 Priorità alta
                <FieldHelpPopover {...WORKLOAD_FIELD_HELP.is_priority} />
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-ink dark:text-paper">
                <Checkbox
                  checked={form.is_completed}
                  onChange={(v) => updateForm("is_completed", v)}
                />
                Completata
                <FieldHelpPopover {...WORKLOAD_FIELD_HELP.is_completed} />
              </label>
            </div>
          </SectionCard>

          </div>
          )}

          {editTab === "dettagli" && (
          <div className="flex min-w-0 flex-col gap-5 border-t border-line pt-5 dark:border-line-dark">
          {/* — Pianificazione (mostrata nella stessa scheda Dettagli) — */}
          <SectionCard icon="calendar" title="Pianificazione">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Input
                label="Data lavorazione"
                labelIcon={<Icon name="calendar" className="h-3.5 w-3.5" />}
                help={WORKLOAD_FIELD_HELP.work_date}
                type="date"
                value={form.work_date}
                onChange={(e) => updateForm("work_date", e.target.value)}
                onPostpone={(iso) => updateForm("work_date", iso)}
              />
              <Input
                label="Orario inizio"
                labelIcon={<Icon name="clock" className="h-3.5 w-3.5" />}
                help={WORKLOAD_FIELD_HELP.start_time}
                type="time"
                value={form.start_time}
                onChange={(e) => updateForm("start_time", e.target.value)}
              />
              <Input
                label="Scadenza"
                labelIcon={<Icon name="calendar" className="h-3.5 w-3.5" />}
                help={WORKLOAD_FIELD_HELP.deadline_date}
                type="date"
                value={form.deadline_date}
                onChange={(e) => updateForm("deadline_date", e.target.value)}
                onPostpone={(iso) => updateForm("deadline_date", iso)}
                disabled={form.is_deadline_locked}
                hint={form.is_deadline_locked ? "Scadenza bloccata: task non derogabile" : undefined}
                className={form.is_deadline_locked ? "cursor-not-allowed opacity-60" : ""}
              />
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
                  Orario di scadenza
                  <FieldHelpPopover {...WORKLOAD_FIELD_HELP.due_time_label} />
                </label>
                <Input
                  type="time"
                  value={form.due_time_label}
                  onChange={(e) => updateForm("due_time_label", e.target.value)}
                />
              </div>
              <EstimatedHoursField
                value={form.estimated_hours}
                onChange={(v) => updateForm("estimated_hours", v == null ? "" : String(v))}
                help={WORKLOAD_FIELD_HELP.estimated_hours}
              />
                <LoadWeightField
                  value={form.load_weight_factor}
                  onChange={(w) => updateForm("load_weight_factor", String(w))}
                  estimatedHours={form.estimated_hours}
                  affectsDailyLoad={form.affects_daily_load}
                  help={WORKLOAD_FIELD_HELP.load_weight_factor}
                />
            </div>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-ink dark:text-paper">
                  <Checkbox
                    checked={form.affects_daily_load}
                    onChange={(v) => updateForm("affects_daily_load", v)}
                  />
                  Impatta il carico giornaliero
                  <FieldHelpPopover {...WORKLOAD_FIELD_HELP.affects_daily_load} />
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-ink dark:text-paper">
                  <Checkbox
                    checked={form.is_deadline_locked}
                    onChange={(v) => updateForm("is_deadline_locked", v)}
                  />
                  Task non derogabile
                  <FieldHelpPopover {...WORKLOAD_FIELD_HELP.is_deadline_locked} />
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-ink dark:text-paper">
                  <Checkbox
                    checked={form.is_left_behind}
                    onChange={handleLeftBehindToggle}
                  />
                  Task lasciata indietro
                  <FieldHelpPopover {...WORKLOAD_FIELD_HELP.is_left_behind} />
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-ink dark:text-paper">
                  <Checkbox
                    checked={form.is_fractionable}
                    onChange={(v) => updateForm("is_fractionable", v)}
                  />
                  Frazionabile
                  <FieldHelpPopover {...WORKLOAD_FIELD_HELP.is_fractionable} />
                </label>
              </div>
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
          </SectionCard>

          {/* — Ricorrenza — */}
          {renderRecurrenceSection()}

          {/* — Stato — */}
          <SectionCard icon="activity" title="Stato">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="flex flex-col gap-1">
                <label className="flex items-center text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
                  Stato
                  <FieldHelpPopover {...WORKLOAD_FIELD_HELP.status} />
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
                help={WORKLOAD_FIELD_HELP.progress_percent}
                type="number"
                min="0"
                max="100"
                value={form.progress_percent}
                onChange={(e) => updateForm("progress_percent", e.target.value)}
                placeholder="0"
              />
              <div className="flex flex-col gap-1">
                <label className="flex items-center text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
                  Urgenza
                  <FieldHelpPopover {...WORKLOAD_FIELD_HELP.urgency_level} />
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
            {sourceItem && isReviewSendBack(sourceItem.status, form.status) && (
              <div className="flex flex-col gap-1">
                <label className="flex items-center text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
                  Motivo del rimando (opzionale)
                  <FieldHelpPopover {...WORKLOAD_FIELD_HELP.status_comment} />
                </label>
                <Textarea
                  value={statusComment}
                  onChange={(e) => setStatusComment(e.target.value)}
                  placeholder="Es. rimandata in lavorazione: rivedere il claim…"
                  rows={2}
                  maxLength={2000}
                  className="w-full rounded-md border border-line bg-paper px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none dark:border-line-dark dark:bg-ink-soft dark:text-paper dark:placeholder:text-muted-dark dark:focus:border-paper"
                />
                <p className="text-[11px] text-muted dark:text-muted-dark">
                  Stai riportando indietro la task da {statusHistoryLabel(sourceItem.status)}: la nota finisce in timeline.
                </p>
              </div>
            )}
          </SectionCard>

          </div>
          )}

          {editTab === "assegnazioni" && (
          <div className="flex min-w-0 flex-col gap-5">
          {/* — Assegnazioni — */}
          <SectionCard icon="users" title="Assegnazioni">
            <MultiSelect
              label="Assegnatari"
              help={WORKLOAD_FIELD_HELP.assignee_ids}
              value={form.assignee_ids}
              onChange={(v) => updateForm("assignee_ids", v)}
              options={userOptions}
              placeholder="Seleziona operatori..."
            />
            <MultiSelect
              label="Aree di lavoro"
              help={WORKLOAD_FIELD_HELP.work_area_ids}
              value={form.work_area_ids}
              onChange={(v) => updateForm("work_area_ids", v)}
              options={areaOptions}
              placeholder="Seleziona aree..."
              onCreateClick={isAdmin ? () => setWorkAreaModalOpen(true) : undefined}
              createActionLabel="Crea area"
            />
            <div className="flex flex-col gap-1">
              <label className="flex items-center text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
                Revisore
                <FieldHelpPopover {...WORKLOAD_FIELD_HELP.reviewer} />
              </label>
              {canManageReviewer ? (
                <SearchableSelect
                  value={reviewerUserId != null ? String(reviewerUserId) : ""}
                  onChange={(v) => setReviewerUserId(v ? Number(v) : null)}
                  options={[
                    { value: "", label: "— nessuno —" },
                    ...users.map((u) => ({
                      value: String(u.id),
                      label: u.full_name ?? u.username,
                      avatarUrl: u.avatar_url,
                    })),
                  ]}
                  placeholder="— nessuno —"
                  searchPlaceholder="Cerca revisore…"
                  menuLayer="portal"
                />
              ) : (
                <div className="rounded-md border border-line bg-cream px-3 py-2.5 text-sm text-ink dark:border-line-dark dark:bg-[#1c1c20] dark:text-paper">
                  {sourceItem?.reviewer_name ?? "—"}
                </div>
              )}
              <p className="text-[11px] text-muted dark:text-muted-dark">
                Default: il PM dell'area. In revisione pesa 0.25 sul revisore, 0 sull'operatore.
              </p>
            </div>
          </SectionCard>

          {/* — Tag — */}
          <SectionCard icon="list" title="Tag">
            <MultiSelect
              label="Tag"
              help={WORKLOAD_FIELD_HELP.tag_ids}
              value={form.tag_ids}
              onChange={(v) => updateForm("tag_ids", v)}
              options={tagOptions}
              placeholder="Seleziona tag..."
              onCreateClick={isAdmin ? () => setWorkTagModalOpen(true) : undefined}
              createActionLabel="Crea tag"
            />
          </SectionCard>

          </div>
          )}

          {editTab === "checklist" && (
          <div className="flex min-w-0 flex-col gap-5">
          {/* — Checklist — */}
          {renderChecklistSection()}

          <div className="h-px bg-line dark:bg-line-dark" />

          {/* — Risorse / Collegamenti — */}
          {renderResourcesSection()}

          <div className="h-px bg-line dark:bg-line-dark" />

          {/* — PED — */}
          {renderPedSection()}

          {/* — Slot orari (edit only) — */}
          {sourceItem && (
            <>
              <SectionCard
                icon="clock"
                title="Slot orari"
                count={slots.length}
                actions={
                  !addingSlot ? (
                    <button
                      type="button"
                      onClick={() => setAddingSlot(true)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-ink hover:text-muted dark:text-paper dark:hover:text-muted-dark"
                    >
                      <Icon name="plus" className="h-3 w-3" />
                      Aggiungi
                    </button>
                  ) : undefined
                }
              >
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
              </SectionCard>
            </>
          )}
          </div>
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

    <OverbookingModal
      open={overbookingData != null}
      data={overbookingData}
      users={users}
      reassigningUserId={reassigningUserId}
      rescheduling={reschedulingOverbooking}
      onReassign={handleOverbookingReassign}
      onReschedule={handleOverbookingReschedule}
      onProceed={finishAfterOverbooking}
    />
    </>
  );
}
