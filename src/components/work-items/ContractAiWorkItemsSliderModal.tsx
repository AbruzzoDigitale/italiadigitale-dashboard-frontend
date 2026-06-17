import { useEffect, useMemo, useState } from "react";
import { listPedConfigurationsApi, type PedConfiguration } from "../../api/pedConfigurations";
import type { User } from "../../api/users";
import type { WorkArea } from "../../api/workAreas";
import type { WorkTag } from "../../api/workTags";
import type { LeftBehindReason, UrgencyLevel, WorkItemStatus, WorkItemTaskType } from "../../api/workItems";
import { useToast } from "../../context/ToastContext";
import { type ContractAiPreviewDraft, type ContractTaskGenerationMode, useContractAiWorkItemsPreview } from "../../hooks/useContractAiWorkItemsPreview";
import { useContractAiWorkItemsSession } from "../../hooks/useContractAiWorkItemsSession";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { Icon } from "../ui/Icon";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { MultiSelect } from "../ui/MultiSelect";
import { SearchableSelect } from "../ui/SearchableSelect";
import { Spinner } from "../ui/Spinner";

interface ContractAiWorkItemsSliderModalProps {
  open: boolean;
  contractId: number | null;
  companyId?: number | null;
  users: User[];
  workAreas: WorkArea[];
  workTags: WorkTag[];
  onClose: () => void;
  onCreated?: () => void;
  modalPosition?: "center" | "left" | "right";
  modalShowOverlay?: boolean;
  modalMobileFullscreen?: boolean;
  modalContainerClassName?: string;
  modalDialogClassName?: string;
  modalBodyClassName?: string;
  modalHideCloseButton?: boolean;
  modalInline?: boolean;
  allowAi?: boolean;
  allowManual?: boolean;
}

type TaskGenerationPreset = "single" | "multiple";
type TaskWizardStep = "preset" | "count" | "mode";

const TASK_GENERATION_COUNT_OPTIONS = [2, 4, 8, 12] as const;

type BulkSaveErrorItem = {
  draft_id: string;
  error: string;
};

const STATUS_OPTIONS: { value: WorkItemStatus; label: string }[] = [
  { value: "planned", label: "Da fare" },
  { value: "in_progress", label: "In corso" },
  { value: "review", label: "Revisione" },
  { value: "completed", label: "Completato" },
];

const TASK_TYPE_OPTIONS: { value: WorkItemTaskType; label: string }[] = [
  { value: "standard", label: "Standard" },
  { value: "quick", label: "Quick" },
];

const URGENCY_OPTIONS: { value: UrgencyLevel; label: string }[] = [
  { value: "low", label: "Bassa" },
  { value: "normal", label: "Normale" },
  { value: "high", label: "Alta" },
  { value: "critical", label: "Critica" },
];

const LEFT_BEHIND_REASON_OPTIONS: { value: LeftBehindReason; label: string }[] = [
  { value: "operator_responsibility", label: "Responsabilità operatore" },
  { value: "client_protection", label: "Protezione cliente" },
  { value: "justified_delay", label: "Ritardo giustificato" },
  { value: "other", label: "Altro" },
];

const RECURRENCE_TYPE_OPTIONS = [
  { value: "", label: "Seleziona frequenza" },
  { value: "daily_interval", label: "Ogni N giorni" },
  { value: "monthly_day", label: "Giorno del mese" },
] as const;

function createManualDraftId(): string {
  return `manual_${Date.now()}_${Math.floor(Math.random() * 10_000)}`;
}

function buildDefaultPedConfiguration() {
  return {
    monthly_publications_total: 0,
    tone_of_voice: null,
    photo_posts_per_month: 0,
    carousels_per_month: 0,
    reels_per_month: 0,
    stories_per_month: 0,
  };
}

function buildEmptyEditableDraft(): ContractAiPreviewDraft {
  return {
    draft_id: createManualDraftId(),
    title: "Nuova task",
    description: null,
    ped_configuration_id: null,
    ped_configuration: null,
    work_date: null,
    estimated_hours: null,
    start_time: null,
    deadline_date: null,
    status: "planned",
    task_type: "standard",
    is_ped: false,
    assignee_ids: [],
    work_area_ids: [],
    tag_ids: [],
    is_recurring: false,
    recurrence_type: null,
    recurrence_interval_days: null,
    recurrence_day_of_month: null,
    recurrence_until: null,
    generate_recurrences: false,
    generation_end_date: null,
    progress_percent: 0,
    is_completed: false,
    actual_hours_spent: null,
    affects_daily_load: true,
    load_weight_factor: 1,
    is_left_behind: false,
    left_behind_reason: null,
    left_behind_note: null,
    urgency_level: null,
    is_priority: false,
    contract_ids: [],
    time_slots: [],
    checklists: [],
    rationale: "Draft aggiunta manualmente.",
    suggested_assignee_ids: [],
    suggested_work_area_ids: [],
    suggested_tag_ids: [],
  };
}

function toNumberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDraftInput(draft: ContractAiPreviewDraft): Partial<ContractAiPreviewDraft> {
  const next: Partial<ContractAiPreviewDraft> = {};

  if (!draft.is_ped) {
    next.ped_configuration_id = null;
    next.ped_configuration = null;
  }
  if (draft.is_ped && draft.ped_configuration_id != null) {
    next.ped_configuration = null;
  }
  if (!draft.is_recurring) {
    next.recurrence_type = null;
    next.recurrence_interval_days = null;
    next.recurrence_day_of_month = null;
    next.recurrence_until = null;
    next.generate_recurrences = false;
    next.generation_end_date = null;
  }
  if (!draft.generate_recurrences) {
    next.generation_end_date = null;
  }
  if (!draft.is_left_behind) {
    next.left_behind_reason = null;
    next.left_behind_note = null;
  }

  return next;
}

function validateDraft(draft: ContractAiPreviewDraft): string | null {
  if (!draft.title.trim()) return "Il titolo è obbligatorio";
  if (draft.estimated_hours != null && draft.estimated_hours < 0) return "estimated_hours deve essere >= 0";
  if (draft.actual_hours_spent != null && draft.actual_hours_spent < 0) return "actual_hours_spent deve essere >= 0";
  if (draft.progress_percent < 0 || draft.progress_percent > 100) return "progress_percent deve essere tra 0 e 100";
  if (draft.load_weight_factor != null && (draft.load_weight_factor < 0 || draft.load_weight_factor > 3)) return "load_weight_factor deve essere tra 0 e 3";
  if (draft.is_ped && draft.ped_configuration_id != null && draft.ped_configuration != null) {
    return "Seleziona una configurazione PED oppure compilala manualmente, non entrambe";
  }
  if (draft.is_recurring) {
    if (!draft.work_date) return "work_date obbligatoria per task ricorrenti";
    if (!draft.recurrence_type) return "recurrence_type obbligatorio per task ricorrenti";
    if (draft.recurrence_type === "daily_interval" && (!draft.recurrence_interval_days || draft.recurrence_interval_days < 1)) {
      return "recurrence_interval_days obbligatorio per Ogni N giorni";
    }
    if (draft.recurrence_type === "monthly_day" && (!draft.recurrence_day_of_month || draft.recurrence_day_of_month < 1 || draft.recurrence_day_of_month > 31)) {
      return "recurrence_day_of_month obbligatorio per Giorno del mese";
    }
    if (draft.recurrence_until && draft.work_date && draft.recurrence_until < draft.work_date) {
      return "recurrence_until deve essere >= work_date";
    }
    if (draft.generate_recurrences) {
      if (!draft.generation_end_date) return "generation_end_date obbligatoria se generi ricorrenze";
      if (draft.work_date && draft.generation_end_date <= draft.work_date) {
        return "generation_end_date deve essere > work_date";
      }
    }
  }
  if (draft.is_left_behind && !draft.left_behind_reason) {
    return "left_behind_reason obbligatorio se la task è lasciata indietro";
  }
  for (const slot of draft.time_slots) {
    if (!slot.starts_at || !slot.ends_at) return "Ogni fascia oraria deve avere inizio e fine";
    if (new Date(slot.ends_at) <= new Date(slot.starts_at)) {
      return "Ogni fascia oraria deve avere ends_at successivo a starts_at";
    }
  }
  for (const checklist of draft.checklists ?? []) {
    if (!checklist.title.trim()) return "Ogni checklist deve avere un titolo";
    for (const item of checklist.items ?? []) {
      if (!item.title.trim()) return "Ogni elemento checklist deve avere un titolo";
      for (const slot of item.time_slots ?? []) {
        if (!slot.starts_at || !slot.ends_at) return "Ogni slot checklist deve avere inizio e fine";
        if (new Date(slot.ends_at) <= new Date(slot.starts_at)) {
          return "Ogni slot checklist deve avere fine successiva all'inizio";
        }
      }
    }
  }
  return null;
}

export function ContractAiWorkItemsSliderModal({
  open,
  contractId,
  companyId,
  users,
  workAreas,
  workTags,
  onClose,
  onCreated,
  modalPosition = "right",
  modalShowOverlay = false,
  modalMobileFullscreen = false,
  modalContainerClassName = "",
  modalDialogClassName = "",
  modalBodyClassName = "",
  modalHideCloseButton = false,
  modalInline = false,
  allowAi = true,
  allowManual = true,
}: ContractAiWorkItemsSliderModalProps) {
  const toast = useToast();
  const { generatePreview, isGenerating, error: previewError, reset } = useContractAiWorkItemsPreview();
  const {
    session,
    currentDraft,
    currentIndex,
    totalDrafts,
    hasUnsavedDrafts,
    slideStates,
    draftErrors,
    isSavingOne,
    isSavingBulk,
    error: sessionError,
    startSession,
    clearSession,
    goPrev,
    goNext,
    updateCurrentDraft,
    deleteCurrentDraft,
    saveCurrentDraft,
    saveBulkRemainingDrafts,
  } = useContractAiWorkItemsSession();

  const [taskPreset, setTaskPreset] = useState<TaskGenerationPreset | null>(null);
  const [taskCount, setTaskCount] = useState<number | null>(null);
  const [wizardStep, setWizardStep] = useState<TaskWizardStep>("preset");
  const [generateRequested, setGenerateRequested] = useState(false);
  const [pedConfigs, setPedConfigs] = useState<PedConfiguration[]>([]);
  const [pedConfigsLoading, setPedConfigsLoading] = useState(false);
  const [bulkErrors, setBulkErrors] = useState<BulkSaveErrorItem[]>([]);

  const assigneeOptions = useMemo(
    () => users.map((user) => ({ id: user.id, label: user.full_name ?? user.username })),
    [users]
  );
  const workAreaOptions = useMemo(
    () => workAreas.map((area) => ({ id: area.id, label: area.name, color: area.color })),
    [workAreas]
  );
  const workTagOptions = useMemo(
    () => workTags.map((tag) => ({ id: tag.id, label: tag.name, color: tag.color })),
    [workTags]
  );
  const pedConfigOptions = useMemo(
    () => pedConfigs.map((config) => ({ value: String(config.id), label: config.name?.trim() || `PED #${config.id}` })),
    [pedConfigs]
  );

  useEffect(() => {
    if (!open || companyId == null) return;
    let cancelled = false;
    setPedConfigsLoading(true);
    void listPedConfigurationsApi(companyId)
      .then((items) => {
        if (!cancelled) setPedConfigs(items);
      })
      .catch(() => {
        if (!cancelled) setPedConfigs([]);
      })
      .finally(() => {
        if (!cancelled) setPedConfigsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, open]);

  useEffect(() => {
    if (open) return;
    setGenerateRequested(false);
    setBulkErrors([]);
    setTaskPreset(null);
    setTaskCount(null);
    setWizardStep("preset");
    clearSession();
    reset();
  }, [clearSession, open, reset]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrev();
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goNext, goPrev, open]);

  const openModeStep = (preset: TaskGenerationPreset, count: number | null) => {
    setTaskPreset(preset);
    setTaskCount(count);
    setWizardStep("mode");
  };

  const handleGenerate = async (nextMode: ContractTaskGenerationMode) => {
    if (contractId == null) return;
    if (nextMode === "ai" && !allowAi) return;
    if (nextMode === "manual" && !allowManual) return;
    if (!taskPreset) return;
    setGenerateRequested(true);
    setBulkErrors([]);
    try {
      const nextSession = await generatePreview(
        contractId as number,
        nextMode === "manual" ? { count: taskPreset === "single" ? 1 : taskCount ?? 8 } : { max_items: taskPreset === "single" ? 1 : taskCount ?? 8 },
        nextMode
      );
      startSession(nextSession);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore generazione task");
    }
  };

  const handleClose = () => {
    if (hasUnsavedDrafts) {
      const confirmed = window.confirm("Ci sono draft non salvati. Vuoi chiudere e scartare le modifiche?");
      if (!confirmed) return;
    }
    onClose();
  };

  const handleDraftPatch = (patch: Partial<ContractAiPreviewDraft>) => {
    if (!currentDraft) return;
    const merged = { ...currentDraft, ...patch };
    updateCurrentDraft({ ...patch, ...normalizeDraftInput(merged) });
  };

  const handleSaveCurrent = async () => {
    if (!currentDraft) return;
    const validationError = validateDraft(currentDraft);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    const wasLastDraft = totalDrafts === 1;
    try {
      const result = await saveCurrentDraft();
      if (!result) return;
      toast.success("Task salvata");
      onCreated?.();
      if (wasLastDraft) onClose();
    } catch {
      // handled in hook state
    }
  };

  const handleBulkSave = async () => {
    if (!session || session.drafts.length === 0) return;
    for (const draft of session.drafts) {
      const validationError = validateDraft(draft);
      if (validationError) {
        toast.error(`Draft ${draft.draft_id}: ${validationError}`);
        return;
      }
    }
    try {
      const result = await saveBulkRemainingDrafts();
      if (!result) return;
      setBulkErrors(result.errors.map((item) => ({ draft_id: item.draft_id, error: item.error })));
      if (result.created_work_items.length > 0) {
        toast.success(`Create ${result.created_work_items.length} task`);
        onCreated?.();
      }
      if (result.errors.length === 0) {
        onClose();
        return;
      }
      toast.error(`${result.errors.length} draft non salvati`);
    } catch {
      // handled in hook state
    }
  };

  const handleDeleteCurrent = () => {
    if (!currentDraft) return;
    deleteCurrentDraft();
    toast.success("Draft scartata");
  };

  const handleAddDraft = () => {
    if (!session) return;
    startSession({
      ...session,
      drafts: [...session.drafts, buildEmptyEditableDraft()],
      currentIndex: session.drafts.length,
      savedDraftIds: new Set(session.savedDraftIds),
    });
  };

  const addChecklist = () => {
    if (!currentDraft) return;
    const nextIndex = (currentDraft.checklists?.length ?? 0) + 1;
    handleDraftPatch({
      checklists: [
        ...(currentDraft.checklists ?? []),
        {
          title: `Checklist ${nextIndex}`,
          items: [],
        },
      ],
    });
  };

  const updateChecklist = (checklistIndex: number, patch: Partial<{ title: string }>) => {
    if (!currentDraft) return;
    handleDraftPatch({
      checklists: (currentDraft.checklists ?? []).map((checklist, index) => (
        index === checklistIndex ? { ...checklist, ...patch } : checklist
      )),
    });
  };

  const removeChecklist = (checklistIndex: number) => {
    if (!currentDraft) return;
    handleDraftPatch({
      checklists: (currentDraft.checklists ?? []).filter((_, index) => index !== checklistIndex),
    });
  };

  const addChecklistItem = (checklistIndex: number) => {
    if (!currentDraft) return;
    handleDraftPatch({
      checklists: (currentDraft.checklists ?? []).map((checklist, index) => {
        if (index !== checklistIndex) return checklist;
        return {
          ...checklist,
          items: [
            ...(checklist.items ?? []),
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
    });
  };

  const updateChecklistItem = (
    checklistIndex: number,
    itemIndex: number,
    patch: Partial<{ title: string; description: string | null; is_completed: boolean; due_at: string | null; assignee_ids: number[] | null }>
  ) => {
    if (!currentDraft) return;
    handleDraftPatch({
      checklists: (currentDraft.checklists ?? []).map((checklist, index) => {
        if (index !== checklistIndex) return checklist;
        return {
          ...checklist,
          items: (checklist.items ?? []).map((item, i) => (i === itemIndex ? { ...item, ...patch } : item)),
        };
      }),
    });
  };

  const removeChecklistItem = (checklistIndex: number, itemIndex: number) => {
    if (!currentDraft) return;
    handleDraftPatch({
      checklists: (currentDraft.checklists ?? []).map((checklist, index) => {
        if (index !== checklistIndex) return checklist;
        return {
          ...checklist,
          items: (checklist.items ?? []).filter((_, i) => i !== itemIndex),
        };
      }),
    });
  };

  const addChecklistItemTimeSlot = (checklistIndex: number, itemIndex: number) => {
    if (!currentDraft) return;
    const starts_at = window.prompt("Inizio slot (YYYY-MM-DDTHH:mm)", "");
    if (!starts_at) return;
    const ends_at = window.prompt("Fine slot (YYYY-MM-DDTHH:mm)", "");
    if (!ends_at) return;
    if (new Date(ends_at) <= new Date(starts_at)) {
      toast.error("La fine slot deve essere successiva all'inizio");
      return;
    }
    const description = window.prompt("Descrizione slot (opzionale)", "") || null;
    handleDraftPatch({
      checklists: (currentDraft.checklists ?? []).map((checklist, index) => {
        if (index !== checklistIndex) return checklist;
        return {
          ...checklist,
          items: (checklist.items ?? []).map((item, i) => {
            if (i !== itemIndex) return item;
            return {
              ...item,
              time_slots: [
                ...(item.time_slots ?? []),
                {
                  starts_at,
                  ends_at,
                  description,
                  is_completed: false,
                },
              ],
            };
          }),
        };
      }),
    });
  };

  const removeChecklistItemTimeSlot = (checklistIndex: number, itemIndex: number, slotIndex: number) => {
    if (!currentDraft) return;
    handleDraftPatch({
      checklists: (currentDraft.checklists ?? []).map((checklist, index) => {
        if (index !== checklistIndex) return checklist;
        return {
          ...checklist,
          items: (checklist.items ?? []).map((item, i) => {
            if (i !== itemIndex) return item;
            return {
              ...item,
              time_slots: (item.time_slots ?? []).filter((_, j) => j !== slotIndex),
            };
          }),
        };
      }),
    });
  };

  const title = generateRequested && totalDrafts > 0
    ? `Editor task (${currentIndex + 1} di ${totalDrafts})`
    : "Genera task";
  const currentState = currentDraft ? slideStates[currentDraft.draft_id] : undefined;
  const isEditorReady = generateRequested && !!currentDraft;
  const contentHeightClass = "min-h-[26rem] md:min-h-[34rem]";
  const progressPercent = totalDrafts > 0 ? ((currentIndex + 1) / totalDrafts) * 100 : 0;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={title}
      size="2xl"
      position={modalPosition}
      showOverlay={modalShowOverlay}
      mobileFullscreen={modalMobileFullscreen}
      containerClassName={modalContainerClassName}
      dialogClassName={modalDialogClassName}
      bodyClassName={modalBodyClassName}
      hideCloseButton={modalHideCloseButton}
      inline={modalInline}
      draftId={contractId ? `contract-ai-work-items:${contractId}` : "contract-ai-work-items"}
      footer={(
        <div className="w-full">
          {isEditorReady && totalDrafts > 0 && (
            <div className="-mx-6 -mt-4 mb-3 h-[3px] overflow-hidden bg-cream dark:bg-[#2a2a2e]">
              <div
                className="h-full bg-info transition-[width] duration-200"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          )}
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center justify-between gap-3 sm:justify-start">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={goPrev}
                  disabled={!currentDraft || currentIndex === 0 || isSavingOne || isSavingBulk}
                  aria-label="Draft precedente"
                  title="Draft precedente"
                >
                  <Icon name="chevron-right" className="h-4 w-4 rotate-180" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={goNext}
                  disabled={!currentDraft || currentIndex >= totalDrafts - 1 || isSavingOne || isSavingBulk}
                  aria-label="Draft successiva"
                  title="Draft successiva"
                >
                  <Icon name="chevron-right" className="h-4 w-4" />
                </Button>
              </div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
                {totalDrafts > 0 ? `${currentIndex + 1}/${totalDrafts}` : "0/0"}
              </span>
              <Button variant="secondary" size="sm" onClick={handleAddDraft} disabled={!session || isSavingOne || isSavingBulk}>
                Aggiungi
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button variant="danger-ghost" size="sm" onClick={handleDeleteCurrent} disabled={!currentDraft || isSavingOne || isSavingBulk}>
                Scarta
              </Button>
              <Button variant="secondary" size="sm" onClick={handleSaveCurrent} loading={isSavingOne} disabled={!currentDraft || isSavingBulk}>
                Salva questa
              </Button>
              <Button variant="primary" size="sm" onClick={handleBulkSave} loading={isSavingBulk} disabled={!currentDraft || isSavingOne}>
                Salva tutte
              </Button>
            </div>
          </div>
        </div>
      )}
    >
      <div className={`flex flex-col ${contentHeightClass}`}>
        {!generateRequested && (
          <div className="flex h-full flex-col justify-between gap-4">
            <div className="flex flex-1 flex-col justify-center gap-6">
              {wizardStep === "preset" && (
                <div className="space-y-4 text-center">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Step 1</p>
                    <h3 className="mt-1 text-lg font-semibold text-ink dark:text-paper">Scegli il formato delle task</h3>
                  </div>
                  <div className="flex justify-center gap-3 flex-wrap">
                    <Button variant="secondary" onClick={() => openModeStep("single", 1)}>
                      Task singola
                    </Button>
                    <Button variant="secondary" onClick={() => setWizardStep("count")}>
                      Task multipla
                    </Button>
                  </div>
                </div>
              )}

              {wizardStep === "count" && (
                <div className="space-y-4 text-center">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Step 2</p>
                    <h3 className="mt-1 text-lg font-semibold text-ink dark:text-paper">Quante task vuoi creare?</h3>
                  </div>
                  <div className="flex justify-center gap-3 flex-wrap">
                    {TASK_GENERATION_COUNT_OPTIONS.map((count) => (
                      <Button key={count} variant="secondary" onClick={() => openModeStep("multiple", count)}>
                        {count} task
                      </Button>
                    ))}
                  </div>
                  <div className="flex justify-center">
                    <Button variant="ghost" onClick={() => setWizardStep("preset")}>Indietro</Button>
                  </div>
                </div>
              )}

              {wizardStep === "mode" && (
                <div className="space-y-4 text-center">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Step 3</p>
                    <h3 className="mt-1 text-lg font-semibold text-ink dark:text-paper">Scegli come generarle</h3>
                    <p className="mt-1 text-sm text-muted dark:text-muted-dark">
                      {taskPreset === "single"
                        ? "Hai scelto una task singola. Ora seleziona il metodo di generazione."
                        : `Hai scelto ${taskCount ?? 8} task. Ora seleziona il metodo di generazione.`}
                    </p>
                  </div>
                  <div className="flex justify-center gap-3 flex-wrap">
                    {allowAi && (
                      <Button variant="secondary" onClick={() => void handleGenerate("ai")} loading={isGenerating} disabled={contractId == null}>
                        AI
                      </Button>
                    )}
                    {allowManual && (
                      <Button variant="secondary" onClick={() => void handleGenerate("manual")} loading={isGenerating} disabled={contractId == null}>
                        Manuale
                      </Button>
                    )}
                  </div>
                  <div className="flex justify-center">
                    <Button variant="ghost" onClick={() => setWizardStep(taskPreset === "single" ? "preset" : "count")}>Indietro</Button>
                  </div>
                </div>
              )}

              {previewError && <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{previewError}</div>}
            </div>
          </div>
        )}

        {generateRequested && isGenerating && (
          <div className="flex h-full items-center justify-center">
            <Spinner size="md" />
          </div>
        )}

        {generateRequested && !isGenerating && !currentDraft && (
          <div className="flex h-full flex-col justify-between gap-4">
            <div className="space-y-3">
              <p className="text-sm text-muted dark:text-muted-dark">Nessuna task da mostrare.</p>
              {sessionError && <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{sessionError}</div>}
            </div>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => setGenerateRequested(false)}>
                Torna alla generazione
              </Button>
            </div>
          </div>
        )}

        {isEditorReady && currentDraft && (
          <div className="flex h-full flex-col gap-4 overflow-hidden">
            <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-line bg-paper/95 pb-3 dark:border-line-dark dark:bg-ink-soft/95">
              <span className="inline-flex items-center rounded-pill border border-info/30 bg-info/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-info">
                Draft {currentDraft.draft_id}
              </span>
              {currentState === "saved" && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
                  <Icon name="check-circle" className="h-3.5 w-3.5" /> Salvata
                </span>
              )}
              {currentState === "error" && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-danger">
                  <Icon name="alert-triangle" className="h-3.5 w-3.5" /> Errore
                </span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto pr-1">
              <div className="flex flex-col gap-5 pb-2">
                {(sessionError || draftErrors[currentDraft.draft_id]) && (
                  <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                    {draftErrors[currentDraft.draft_id] ?? sessionError}
                  </div>
                )}

                <fieldset className="flex flex-col gap-3">
                  <legend className="mb-1 text-[11px] font-bold uppercase tracking-widest text-muted dark:text-muted-dark">Base task</legend>
                  <Input label="Titolo *" value={currentDraft.title} onChange={(event) => handleDraftPatch({ title: event.target.value })} placeholder="Titolo task" />
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Descrizione</label>
                    <textarea
                      value={currentDraft.description ?? ""}
                      onChange={(event) => handleDraftPatch({ description: event.target.value || null })}
                      rows={4}
                      className="min-h-[108px] w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none dark:border-line-dark dark:bg-ink-soft dark:text-paper dark:placeholder:text-muted-dark dark:focus:border-paper"
                      placeholder="Descrizione task"
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <SearchableSelect value={currentDraft.status} onChange={(value) => handleDraftPatch({ status: (value || "planned") as WorkItemStatus })} options={STATUS_OPTIONS.map((option) => ({ value: option.value, label: option.label }))} placeholder="Stato" />
                    <SearchableSelect value={currentDraft.task_type} onChange={(value) => handleDraftPatch({ task_type: (value || "standard") as WorkItemTaskType })} options={TASK_TYPE_OPTIONS.map((option) => ({ value: option.value, label: option.label }))} placeholder="Tipo task" />
                    <SearchableSelect value={currentDraft.urgency_level ?? ""} onChange={(value) => handleDraftPatch({ urgency_level: (value || null) as UrgencyLevel | null })} options={[{ value: "", label: "Nessuna urgenza" }, ...URGENCY_OPTIONS.map((option) => ({ value: option.value, label: option.label }))]} placeholder="Urgenza" />
                    <label className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm dark:border-line-dark">
                      <Checkbox checked={currentDraft.is_priority} onChange={(checked) => handleDraftPatch({ is_priority: checked })} />
                      Priorità alta
                    </label>
                  </div>
                </fieldset>

                <fieldset className="flex flex-col gap-3">
                  <legend className="mb-1 text-[11px] font-bold uppercase tracking-widest text-muted dark:text-muted-dark">Pianificazione</legend>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Input label="Data lavoro" type="date" value={currentDraft.work_date ?? ""} onChange={(event) => handleDraftPatch({ work_date: event.target.value || null })} />
                    <Input label="Ora inizio" type="time" value={currentDraft.start_time ?? ""} onChange={(event) => handleDraftPatch({ start_time: event.target.value || null })} />
                    <Input label="Scadenza" type="date" value={currentDraft.deadline_date ?? ""} onChange={(event) => handleDraftPatch({ deadline_date: event.target.value || null })} />
                    <Input label="Ore stimate" type="number" min={0} step="0.5" value={currentDraft.estimated_hours ?? ""} onChange={(event) => handleDraftPatch({ estimated_hours: toNumberOrNull(event.target.value) })} />
                  </div>
                </fieldset>

                <fieldset className="flex flex-col gap-3">
                  <legend className="mb-1 text-[11px] font-bold uppercase tracking-widest text-muted dark:text-muted-dark">Relazioni</legend>
                  <MultiSelect label="Assegnatari" value={currentDraft.assignee_ids} onChange={(value) => handleDraftPatch({ assignee_ids: value })} options={assigneeOptions} placeholder="Seleziona assegnatari" />
                  <MultiSelect label="Aree di lavoro" value={currentDraft.work_area_ids} onChange={(value) => handleDraftPatch({ work_area_ids: value })} options={workAreaOptions} placeholder="Seleziona aree" />
                  <MultiSelect label="Tag" value={currentDraft.tag_ids} onChange={(value) => handleDraftPatch({ tag_ids: value })} options={workTagOptions} placeholder="Seleziona tag" />
                </fieldset>

                <fieldset className="flex flex-col gap-3">
                  <legend className="mb-1 text-[11px] font-bold uppercase tracking-widest text-muted dark:text-muted-dark">PED</legend>
                  <label className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm dark:border-line-dark">
                    <Checkbox checked={currentDraft.is_ped} onChange={(checked) => handleDraftPatch({ is_ped: checked })} />
                    Configurazione PED
                  </label>
                  {currentDraft.is_ped && (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <SearchableSelect value={currentDraft.ped_configuration_id != null ? String(currentDraft.ped_configuration_id) : ""} onChange={(value) => handleDraftPatch({ ped_configuration_id: value ? Number(value) : null, ped_configuration: value ? null : currentDraft.ped_configuration })} options={[{ value: "", label: pedConfigsLoading ? "Caricamento configurazioni..." : "Nessuna configurazione selezionata" }, ...pedConfigOptions]} placeholder="Configurazione PED esistente" />
                      <div className="rounded-md border border-line p-3 dark:border-line-dark">
                        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Configurazione PED manuale</div>
                        <div className="grid grid-cols-1 gap-3">
                          <Input label="Pubblicazioni/mese" type="number" min={0} value={currentDraft.ped_configuration?.monthly_publications_total ?? ""} onChange={(event) => handleDraftPatch({ ped_configuration_id: null, ped_configuration: { ...(currentDraft.ped_configuration ?? buildDefaultPedConfiguration()), monthly_publications_total: Number(event.target.value || 0) } })} />
                          <Input label="Tone of voice" value={currentDraft.ped_configuration?.tone_of_voice ?? ""} onChange={(event) => handleDraftPatch({ ped_configuration_id: null, ped_configuration: { ...(currentDraft.ped_configuration ?? buildDefaultPedConfiguration()), tone_of_voice: event.target.value || null } })} />
                          <div className="grid grid-cols-2 gap-3">
                            <Input label="Foto/mese" type="number" min={0} value={currentDraft.ped_configuration?.photo_posts_per_month ?? 0} onChange={(event) => handleDraftPatch({ ped_configuration_id: null, ped_configuration: { ...(currentDraft.ped_configuration ?? buildDefaultPedConfiguration()), photo_posts_per_month: Number(event.target.value || 0) } })} />
                            <Input label="Caroselli/mese" type="number" min={0} value={currentDraft.ped_configuration?.carousels_per_month ?? 0} onChange={(event) => handleDraftPatch({ ped_configuration_id: null, ped_configuration: { ...(currentDraft.ped_configuration ?? buildDefaultPedConfiguration()), carousels_per_month: Number(event.target.value || 0) } })} />
                            <Input label="Reel/mese" type="number" min={0} value={currentDraft.ped_configuration?.reels_per_month ?? 0} onChange={(event) => handleDraftPatch({ ped_configuration_id: null, ped_configuration: { ...(currentDraft.ped_configuration ?? buildDefaultPedConfiguration()), reels_per_month: Number(event.target.value || 0) } })} />
                            <Input label="Stories/mese" type="number" min={0} value={currentDraft.ped_configuration?.stories_per_month ?? 0} onChange={(event) => handleDraftPatch({ ped_configuration_id: null, ped_configuration: { ...(currentDraft.ped_configuration ?? buildDefaultPedConfiguration()), stories_per_month: Number(event.target.value || 0) } })} />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </fieldset>

                <fieldset className="flex flex-col gap-3">
                  <legend className="mb-1 text-[11px] font-bold uppercase tracking-widest text-muted dark:text-muted-dark">Ricorrenza</legend>
                  <label className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm dark:border-line-dark">
                    <Checkbox checked={currentDraft.is_recurring} onChange={(checked) => handleDraftPatch({ is_recurring: checked, recurrence_type: checked ? (currentDraft.recurrence_type ?? "daily_interval") : null, recurrence_interval_days: checked ? (currentDraft.recurrence_interval_days ?? 7) : null })} />
                    Task ricorrente
                  </label>
                  {currentDraft.is_recurring && (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <SearchableSelect value={currentDraft.recurrence_type ?? ""} onChange={(value) => handleDraftPatch({ recurrence_type: (value || null) as ContractAiPreviewDraft["recurrence_type"] })} options={[...RECURRENCE_TYPE_OPTIONS]} placeholder="Frequenza" />
                      <Input label="Intervallo giorni" type="number" min={1} value={currentDraft.recurrence_interval_days ?? ""} onChange={(event) => handleDraftPatch({ recurrence_interval_days: toNumberOrNull(event.target.value) })} disabled={currentDraft.recurrence_type !== "daily_interval"} />
                      <Input label="Giorno del mese" type="number" min={1} max={31} value={currentDraft.recurrence_day_of_month ?? ""} onChange={(event) => handleDraftPatch({ recurrence_day_of_month: toNumberOrNull(event.target.value) })} disabled={currentDraft.recurrence_type !== "monthly_day"} />
                      <Input label="Fine ricorrenza" type="date" value={currentDraft.recurrence_until ?? ""} onChange={(event) => handleDraftPatch({ recurrence_until: event.target.value || null })} />
                      <label className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm dark:border-line-dark md:col-span-2">
                        <Checkbox checked={currentDraft.generate_recurrences} onChange={(checked) => handleDraftPatch({ generate_recurrences: checked })} />
                        Genera automaticamente le occorrenze
                      </label>
                      {currentDraft.generate_recurrences && <Input label="Fine generazione" type="date" value={currentDraft.generation_end_date ?? ""} onChange={(event) => handleDraftPatch({ generation_end_date: event.target.value || null })} />}
                    </div>
                  )}
                </fieldset>

                <fieldset className="flex flex-col gap-3">
                  <legend className="mb-1 text-[11px] font-bold uppercase tracking-widest text-muted dark:text-muted-dark">Carico operativo</legend>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm dark:border-line-dark">
                      <Checkbox checked={currentDraft.affects_daily_load ?? false} onChange={(checked) => handleDraftPatch({ affects_daily_load: checked })} />
                      Impatta il carico giornaliero
                    </label>
                    <Input label="Fattore peso" type="number" min={0} max={3} step="0.1" value={currentDraft.load_weight_factor ?? ""} onChange={(event) => handleDraftPatch({ load_weight_factor: toNumberOrNull(event.target.value) })} />
                    <label className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm dark:border-line-dark">
                      <Checkbox checked={currentDraft.is_left_behind} onChange={(checked) => handleDraftPatch({ is_left_behind: checked })} />
                      Lasciata indietro
                    </label>
                    <SearchableSelect value={currentDraft.left_behind_reason ?? ""} onChange={(value) => handleDraftPatch({ left_behind_reason: (value || null) as LeftBehindReason | null })} options={[{ value: "", label: "Nessun motivo" }, ...LEFT_BEHIND_REASON_OPTIONS.map((option) => ({ value: option.value, label: option.label }))]} placeholder="Motivo ritardo" disabled={!currentDraft.is_left_behind} />
                  </div>
                  {currentDraft.is_left_behind && (
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Nota ritardo</label>
                      <textarea value={currentDraft.left_behind_note ?? ""} onChange={(event) => handleDraftPatch({ left_behind_note: event.target.value || null })} rows={3} className="min-h-[96px] w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none dark:border-line-dark dark:bg-ink-soft dark:text-paper dark:placeholder:text-muted-dark dark:focus:border-paper" placeholder="Dettaglia il motivo del ritardo" />
                    </div>
                  )}
                </fieldset>

                <fieldset className="flex flex-col gap-3">
                  <legend className="mb-1 text-[11px] font-bold uppercase tracking-widest text-muted dark:text-muted-dark">Tracking</legend>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <Input label="Avanzamento %" type="number" min={0} max={100} value={currentDraft.progress_percent} onChange={(event) => handleDraftPatch({ progress_percent: Number(event.target.value || 0) })} />
                    <Input label="Ore effettive" type="number" min={0} step="0.5" value={currentDraft.actual_hours_spent ?? ""} onChange={(event) => handleDraftPatch({ actual_hours_spent: toNumberOrNull(event.target.value) })} />
                    <label className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm dark:border-line-dark">
                      <Checkbox checked={currentDraft.is_completed} onChange={(checked) => handleDraftPatch({ is_completed: checked })} />
                      Completata
                    </label>
                  </div>
                </fieldset>

                <fieldset className="flex flex-col gap-3">
                  <legend className="mb-1 text-[11px] font-bold uppercase tracking-widest text-muted dark:text-muted-dark">Checklist</legend>
                  <div className="flex justify-end">
                    <Button variant="secondary" onClick={addChecklist}>Aggiungi checklist</Button>
                  </div>
                  {(currentDraft.checklists ?? []).length === 0 ? (
                    <p className="text-sm text-muted dark:text-muted-dark">Nessuna checklist. Aggiungi una checklist per tracciare elementi stile Trello.</p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {(currentDraft.checklists ?? []).map((checklist, checklistIndex) => (
                        <div key={`checklist-${checklistIndex}`} className="rounded-md border border-line p-3 dark:border-line-dark">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                            <div className="flex-1">
                              <Input
                                label={`Checklist ${checklistIndex + 1}`}
                                value={checklist.title}
                                onChange={(event) => updateChecklist(checklistIndex, { title: event.target.value })}
                                placeholder="Titolo checklist"
                              />
                            </div>
                            <div className="flex gap-2">
                              <Button variant="secondary" size="sm" onClick={() => addChecklistItem(checklistIndex)}>Aggiungi elemento</Button>
                              <Button variant="danger-ghost" size="sm" onClick={() => removeChecklist(checklistIndex)}>Rimuovi</Button>
                            </div>
                          </div>

                          {(checklist.items ?? []).length === 0 ? (
                            <p className="mt-3 text-sm text-muted dark:text-muted-dark">Nessun elemento in questa checklist.</p>
                          ) : (
                            <div className="mt-3 flex flex-col gap-3">
                              {(checklist.items ?? []).map((item, itemIndex) => (
                                <div key={`checklist-${checklistIndex}-item-${itemIndex}`} className="rounded-md border border-line p-3 dark:border-line-dark">
                                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                    <Input
                                      label="Titolo elemento *"
                                      value={item.title}
                                      onChange={(event) => updateChecklistItem(checklistIndex, itemIndex, { title: event.target.value })}
                                      placeholder="Titolo elemento"
                                    />
                                    <Input
                                      label="Scadenza (data e ora)"
                                      type="datetime-local"
                                      value={item.due_at ?? ""}
                                      onChange={(event) => updateChecklistItem(checklistIndex, itemIndex, { due_at: event.target.value || null })}
                                    />
                                    <div className="md:col-span-2">
                                      <MultiSelect
                                        label="Assegnatari elemento"
                                        value={item.assignee_ids ?? []}
                                        onChange={(value) => updateChecklistItem(checklistIndex, itemIndex, { assignee_ids: value.length ? value : null })}
                                        options={assigneeOptions}
                                        placeholder="Se vuoto, usa assegnatari task"
                                      />
                                    </div>
                                    <div className="md:col-span-2">
                                      <Input
                                        label="Descrizione elemento"
                                        value={item.description ?? ""}
                                        onChange={(event) => updateChecklistItem(checklistIndex, itemIndex, { description: event.target.value || null })}
                                      />
                                    </div>
                                    <label className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm dark:border-line-dark">
                                      <Checkbox
                                        checked={item.is_completed}
                                        onChange={(checked) => updateChecklistItem(checklistIndex, itemIndex, { is_completed: checked })}
                                      />
                                      Elemento completato
                                    </label>
                                  </div>

                                  <div className="mt-3 rounded-md border border-dashed border-line p-2 dark:border-line-dark">
                                    <div className="mb-2 flex items-center justify-between">
                                      <span className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Slot lavoro elemento</span>
                                      <Button variant="secondary" size="sm" onClick={() => addChecklistItemTimeSlot(checklistIndex, itemIndex)}>Aggiungi slot</Button>
                                    </div>
                                    {(item.time_slots ?? []).length === 0 ? (
                                      <p className="text-xs text-muted dark:text-muted-dark">Nessuno slot. Aggiungilo per tracciare il lavoro svolto su questo elemento.</p>
                                    ) : (
                                      <div className="flex flex-col gap-2">
                                        {(item.time_slots ?? []).map((slot, slotIndex) => (
                                          <div key={`checklist-${checklistIndex}-item-${itemIndex}-slot-${slotIndex}`} className="flex flex-col gap-2 rounded border border-line px-2 py-1.5 text-xs dark:border-line-dark sm:flex-row sm:items-center sm:justify-between">
                                            <div>
                                              <div>{slot.starts_at} → {slot.ends_at}</div>
                                              {slot.description && <div className="text-muted dark:text-muted-dark">{slot.description}</div>}
                                            </div>
                                            <Button variant="danger-ghost" size="sm" onClick={() => removeChecklistItemTimeSlot(checklistIndex, itemIndex, slotIndex)}>Rimuovi</Button>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>

                                  <div className="mt-3 flex justify-end">
                                    <Button variant="danger-ghost" size="sm" onClick={() => removeChecklistItem(checklistIndex, itemIndex)}>Rimuovi elemento</Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </fieldset>

                <div className="rounded-md border border-info/30 bg-info/5 px-3 py-2 dark:bg-info/10">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-info">
                    {session?.generationMode === "manual" ? "Dettaglio generazione" : "Perché proposta da AI"}
                  </div>
                  <p className="mt-1 text-sm text-ink dark:text-paper">
                    {currentDraft.rationale || (session?.generationMode === "manual" ? "Bozza manuale pronta alla compilazione." : "Nessuna spiegazione disponibile.")}
                  </p>
                </div>

                {bulkErrors.length > 0 && (
                  <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-3 text-sm text-ink dark:text-paper">
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-warning">Errori salvataggio bulk</div>
                    <div className="flex flex-col gap-2">
                      {bulkErrors.map((item) => (
                        <div key={`${item.draft_id}-${item.error}`} className="rounded border border-warning/30 px-2 py-1.5 text-xs">
                          <strong>{item.draft_id}</strong>: {item.error}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
