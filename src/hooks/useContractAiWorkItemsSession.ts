import { useCallback, useMemo, useState } from "react";
import {
  saveBulkContractAiWorkItemsApi,
  saveBulkContractManualWorkItemsApi,
  saveOneContractAiWorkItemApi,
  saveOneContractManualWorkItemApi,
  type ContractAiSaveBulkWorkItemsResponse,
  type ContractAiSaveOneWorkItemResponse,
  type ContractManualSaveBulkWorkItemsResponse,
  type ContractManualSaveOneWorkItemResponse,
  type ContractAiWorkItemDraftUpsert,
} from "../api/contracts";
import type { ContractAiPreviewDraft, ContractAiPreviewSession } from "./useContractAiWorkItemsPreview";

export type ContractAiSlideState = "editing" | "saving" | "saved" | "error";

type DraftPatch = Partial<Omit<ContractAiPreviewDraft, "draft_id">>;

interface UseContractAiWorkItemsSessionResult {
  session: ContractAiPreviewSession | null;
  currentDraft: ContractAiPreviewDraft | null;
  currentIndex: number;
  totalDrafts: number;
  hasUnsavedDrafts: boolean;
  slideStates: Record<string, ContractAiSlideState>;
  draftErrors: Record<string, string>;
  isSavingOne: boolean;
  isSavingBulk: boolean;
  error: string | null;
  startSession: (nextSession: ContractAiPreviewSession) => void;
  clearSession: () => void;
  goPrev: () => void;
  goNext: () => void;
  setCurrentIndex: (index: number) => void;
  updateCurrentDraft: (patch: DraftPatch) => void;
  updateDraftById: (draftId: string, patch: DraftPatch) => void;
  deleteCurrentDraft: () => void;
  saveCurrentDraft: () => Promise<(ContractAiSaveOneWorkItemResponse | ContractManualSaveOneWorkItemResponse) | null>;
  saveBulkRemainingDrafts: () => Promise<(ContractAiSaveBulkWorkItemsResponse | ContractManualSaveBulkWorkItemsResponse) | null>;
}

function normalizeDraftForSave(draft: ContractAiPreviewDraft): ContractAiWorkItemDraftUpsert {
  const isRecurring = !!draft.is_recurring;
  const isLeftBehind = !!draft.is_left_behind;
  const isPed = !!draft.is_ped;
  const generateRecurrences = isRecurring && !!draft.generate_recurrences;
  return {
    draft_id: draft.draft_id,
    title: draft.title.trim(),
    description: draft.description,
    ped_configuration_id: isPed ? draft.ped_configuration_id : null,
    ped_configuration: isPed ? draft.ped_configuration : null,
    work_date: draft.work_date,
    estimated_hours: draft.estimated_hours,
    start_time: draft.start_time,
    deadline_date: draft.deadline_date,
    status: draft.status,
    task_type: draft.task_type,
    is_ped: isPed,
    assignee_ids: [...(draft.assignee_ids ?? [])],
    work_area_ids: [...(draft.work_area_ids ?? [])],
    tag_ids: [...(draft.tag_ids ?? [])],
    is_recurring: isRecurring,
    recurrence_type: isRecurring ? draft.recurrence_type : null,
    recurrence_interval_days: isRecurring ? draft.recurrence_interval_days : null,
    recurrence_day_of_month: isRecurring ? draft.recurrence_day_of_month : null,
    recurrence_until: isRecurring ? draft.recurrence_until : null,
    generate_recurrences: generateRecurrences,
    generation_end_date: generateRecurrences ? draft.generation_end_date : null,
    progress_percent: draft.progress_percent,
    is_completed: draft.is_completed,
    actual_hours_spent: draft.actual_hours_spent,
    affects_daily_load: draft.affects_daily_load,
    load_weight_factor: draft.load_weight_factor,
    is_left_behind: isLeftBehind,
    left_behind_reason: isLeftBehind ? draft.left_behind_reason : null,
    left_behind_note: isLeftBehind ? draft.left_behind_note : null,
    urgency_level: draft.urgency_level,
    is_priority: draft.is_priority,
    contract_ids: [...(draft.contract_ids ?? [])],
    time_slots: (draft.time_slots ?? []).map((slot) => ({
      starts_at: slot.starts_at,
      ends_at: slot.ends_at,
      description: slot.description,
      is_completed: slot.is_completed,
    })),
    checklists: (draft.checklists ?? []).map((checklist) => ({
      title: checklist.title,
      items: (checklist.items ?? []).map((item) => ({
        title: item.title,
        description: item.description,
        is_completed: item.is_completed,
        due_at: item.due_at,
        assignee_ids: item.assignee_ids,
        time_slots: (item.time_slots ?? []).map((slot) => ({
          starts_at: slot.starts_at,
          ends_at: slot.ends_at,
          description: slot.description,
          is_completed: slot.is_completed,
        })),
      })),
    })),
    billing_source: draft.billing_source ?? null,
  };
}

export function useContractAiWorkItemsSession(): UseContractAiWorkItemsSessionResult {
  const [session, setSession] = useState<ContractAiPreviewSession | null>(null);
  const [slideStates, setSlideStates] = useState<Record<string, ContractAiSlideState>>({});
  const [draftErrors, setDraftErrors] = useState<Record<string, string>>({});
  const [isSavingOne, setIsSavingOne] = useState(false);
  const [isSavingBulk, setIsSavingBulk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalDrafts = session?.drafts.length ?? 0;
  const currentIndex = session?.currentIndex ?? 0;
  const currentDraft = useMemo(() => {
    if (!session || session.drafts.length === 0) return null;
    const safeIndex = Math.min(Math.max(session.currentIndex, 0), session.drafts.length - 1);
    return session.drafts[safeIndex] ?? null;
  }, [session]);

  const hasUnsavedDrafts = totalDrafts > 0;

  const startSession = useCallback((nextSession: ContractAiPreviewSession) => {
    setSession({
      ...nextSession,
      drafts: nextSession.drafts.map((draft) => ({ ...draft })),
      savedDraftIds: new Set(nextSession.savedDraftIds),
      currentIndex: Math.min(Math.max(nextSession.currentIndex, 0), Math.max(nextSession.drafts.length - 1, 0)),
    });

    const nextStates: Record<string, ContractAiSlideState> = {};
    for (const draft of nextSession.drafts) nextStates[draft.draft_id] = "editing";
    setSlideStates(nextStates);
    setDraftErrors({});
    setError(null);
  }, []);

  const clearSession = useCallback(() => {
    setSession(null);
    setSlideStates({});
    setDraftErrors({});
    setError(null);
    setIsSavingOne(false);
    setIsSavingBulk(false);
  }, []);

  const setCurrentIndex = useCallback((index: number) => {
    setSession((prev) => {
      if (!prev || prev.drafts.length === 0) return prev;
      return {
        ...prev,
        currentIndex: Math.min(Math.max(index, 0), prev.drafts.length - 1),
      };
    });
  }, []);

  const goPrev = useCallback(() => {
    setSession((prev) => {
      if (!prev || prev.drafts.length === 0) return prev;
      return {
        ...prev,
        currentIndex: Math.max(prev.currentIndex - 1, 0),
      };
    });
  }, []);

  const goNext = useCallback(() => {
    setSession((prev) => {
      if (!prev || prev.drafts.length === 0) return prev;
      return {
        ...prev,
        currentIndex: Math.min(prev.currentIndex + 1, prev.drafts.length - 1),
      };
    });
  }, []);

  const updateDraftById = useCallback((draftId: string, patch: DraftPatch) => {
    setSession((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        drafts: prev.drafts.map((draft) => (
          draft.draft_id === draftId ? { ...draft, ...patch } : draft
        )),
      };
    });
    setSlideStates((prev) => ({ ...prev, [draftId]: "editing" }));
    setDraftErrors((prev) => {
      const next = { ...prev };
      delete next[draftId];
      return next;
    });
  }, []);

  const updateCurrentDraft = useCallback((patch: DraftPatch) => {
    if (!currentDraft) return;
    updateDraftById(currentDraft.draft_id, patch);
  }, [currentDraft, updateDraftById]);

  const deleteCurrentDraft = useCallback(() => {
    setSession((prev) => {
      if (!prev || prev.drafts.length === 0) return prev;

      const removedDraft = prev.drafts[prev.currentIndex];
      if (!removedDraft) return prev;

      const nextDrafts = prev.drafts.filter((draft) => draft.draft_id !== removedDraft.draft_id);
      const nextIndex = nextDrafts.length === 0 ? 0 : Math.min(prev.currentIndex, nextDrafts.length - 1);

      return {
        ...prev,
        drafts: nextDrafts,
        currentIndex: nextIndex,
      };
    });
  }, []);

  const saveCurrentDraft = useCallback(async () => {
    if (!session || session.drafts.length === 0) return null;
    const draft = session.drafts[session.currentIndex];
    if (!draft) return null;

    setIsSavingOne(true);
    setError(null);
    setSlideStates((prev) => ({ ...prev, [draft.draft_id]: "saving" }));

    try {
      const response = session.generationMode === "manual"
        ? await saveOneContractManualWorkItemApi(session.contractId, {
            manual_generation_job_id: session.generationJobId,
            manual_generation_job_item_id: draft.draft_id,
            draft: normalizeDraftForSave(draft),
            generation_source_type: session.generationSourceType,
          })
        : await saveOneContractAiWorkItemApi(session.contractId, {
            ai_generation_job_id: session.generationJobId,
            ai_generation_job_item_id: draft.draft_id,
            draft: normalizeDraftForSave(draft),
            ai_generation_source_type: session.generationSourceType,
          });

      setSession((prev) => {
        if (!prev) return prev;

        const nextDrafts = prev.drafts.filter((item) => item.draft_id !== draft.draft_id);
        const nextSavedDraftIds = new Set(prev.savedDraftIds);
        nextSavedDraftIds.add(draft.draft_id);

        return {
          ...prev,
          drafts: nextDrafts,
          savedDraftIds: nextSavedDraftIds,
          currentIndex: nextDrafts.length === 0 ? 0 : Math.min(prev.currentIndex, nextDrafts.length - 1),
        };
      });

      setSlideStates((prev) => ({ ...prev, [draft.draft_id]: "saved" }));
      setDraftErrors((prev) => {
        const next = { ...prev };
        delete next[draft.draft_id];
        return next;
      });

      return response;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Errore salvataggio draft";
      setError(message);
      setSlideStates((prev) => ({ ...prev, [draft.draft_id]: "error" }));
      setDraftErrors((prev) => ({ ...prev, [draft.draft_id]: message }));
      throw err;
    } finally {
      setIsSavingOne(false);
    }
  }, [session]);

  const saveBulkRemainingDrafts = useCallback(async () => {
    if (!session || session.drafts.length === 0) return null;

    setIsSavingBulk(true);
    setError(null);

    for (const draft of session.drafts) {
      setSlideStates((prev) => ({ ...prev, [draft.draft_id]: "saving" }));
    }

    try {
      const response = session.generationMode === "manual"
        ? await saveBulkContractManualWorkItemsApi(session.contractId, {
            manual_generation_job_id: session.generationJobId,
            generation_source_type: session.generationSourceType,
            drafts: session.drafts.map((draft) => ({
              manual_generation_job_id: session.generationJobId,
              manual_generation_job_item_id: draft.draft_id,
              draft: normalizeDraftForSave(draft),
              generation_source_type: session.generationSourceType,
            })),
          })
        : await saveBulkContractAiWorkItemsApi(session.contractId, {
            ai_generation_job_id: session.generationJobId,
            ai_generation_source_type: session.generationSourceType,
            drafts: session.drafts.map((draft) => ({
              ai_generation_job_id: session.generationJobId,
              ai_generation_job_item_id: draft.draft_id,
              draft: normalizeDraftForSave(draft),
              ai_generation_source_type: session.generationSourceType,
            })),
          });

      const createdIds = new Set(response.created_work_items.map((item) => item.draft_id));
      const errorMap: Record<string, string> = {};
      for (const item of response.errors) errorMap[item.draft_id] = item.error;

      setSession((prev) => {
        if (!prev) return prev;

        const nextSavedDraftIds = new Set(prev.savedDraftIds);
        for (const draftId of createdIds) nextSavedDraftIds.add(draftId);

        const remainingDrafts = prev.drafts.filter((draft) => !createdIds.has(draft.draft_id));

        return {
          ...prev,
          drafts: remainingDrafts,
          savedDraftIds: nextSavedDraftIds,
          currentIndex: remainingDrafts.length === 0 ? 0 : Math.min(prev.currentIndex, remainingDrafts.length - 1),
        };
      });

      setSlideStates((prev) => {
        const next = { ...prev };
        for (const draftId of createdIds) next[draftId] = "saved";
        for (const draftId of Object.keys(errorMap)) next[draftId] = "error";
        return next;
      });
      setDraftErrors((prev) => ({ ...prev, ...errorMap }));

      return response;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Errore salvataggio massivo draft";
      setError(message);
      throw err;
    } finally {
      setIsSavingBulk(false);
    }
  }, [session]);

  return {
    session,
    currentDraft,
    currentIndex,
    totalDrafts,
    hasUnsavedDrafts,
    slideStates,
    draftErrors,
    isSavingOne,
    isSavingBulk,
    error,
    startSession,
    clearSession,
    goPrev,
    goNext,
    setCurrentIndex,
    updateCurrentDraft,
    updateDraftById,
    deleteCurrentDraft,
    saveCurrentDraft,
    saveBulkRemainingDrafts,
  };
}
