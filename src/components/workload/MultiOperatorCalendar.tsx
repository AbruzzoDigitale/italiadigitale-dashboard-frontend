import { useCallback, useEffect, useRef, useState } from "react";
import {
  getWorkloadUserCalendarDayApi,
  type WorkloadTimelineItem,
  type WorkloadUserCalendarDayResponse,
} from "../../api/workload";
import {
  isSwapConfirmationRequiredError,
  isWorkItemOverlapApiError,
  moveWorkItemApi,
  rescheduleNextAvailableWorkItemApi,
  swapWorkItemsApi,
  swapWorkItemsPreviewApi,
  updateWorkItemApi,
  type MoveWorkItemPayload,
  type WorkItemOverlapApiError,
  type WorkItemOverlapConflict,
  type WorkItemSuggestedSlot,
  type WorkItemSwapPreviewResponse,
  type WorkItemSwapEffectivePosition,
} from "../../api/workItems";
import { updateMeApi } from "../../api/users";
import { Icon } from "../ui/Icon";
import { Spinner } from "../ui/Spinner";
import { TaskConflictModal } from "../work-items/TaskConflictModal";
import { SwapConfirmModal } from "./SwapConfirmModal";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../hooks/useAuth";
import { CALENDAR_CREATE_SLOT_MINUTES, hhmmToMinutes } from "./calendarUtils";
import {
  OperatorCalendarColumn,
  type CalendarTaskUiState,
  type OperatorCalendarColumnBounds,
} from "./OperatorCalendarColumn";

export interface MultiOperatorMeta {
  id: number;
  name: string;
  avatarUrl: string | null;
}

interface MultiOperatorCalendarProps {
  operators: MultiOperatorMeta[];
  selectedDate: string;
  companyId: number;
  bounds: OperatorCalendarColumnBounds;
  nowMinutes: number;
  onOpenTask: (workItemId: number) => void;
  onCreateTask: (args: { day: string; userId: number; startTime: string; estimatedHours: number }) => void;
  /** Invocata dopo una mutazione, per aggiornare heatmap/strip nel parent. */
  onAfterChange?: () => void;
  /** Cambiando questo valore il componente forza un refetch completo. */
  reloadToken?: number;
  /** Mostra/nascondi le task in revisione. */
  showReview?: boolean;
}

function isDoneTask(item: WorkloadTimelineItem): boolean {
  return item.kind === "task" && (item.status === "completed" || item.status === "done");
}

export function MultiOperatorCalendar({
  operators,
  selectedDate,
  companyId,
  bounds,
  nowMinutes,
  onOpenTask,
  onCreateTask,
  onAfterChange,
  reloadToken,
  showReview = true,
}: MultiOperatorCalendarProps) {
  const toast = useToast();
  const { refreshSession } = useAuth();
  const [swapConfirm, setSwapConfirm] = useState<
    { operatorId: number; sourceId: number; targetIds: number[]; positions?: WorkItemSwapEffectivePosition[]; preview: WorkItemSwapPreviewResponse } | null
  >(null);
  const [swapConfirmSubmitting, setSwapConfirmSubmitting] = useState(false);
  const [dataByOperator, setDataByOperator] = useState<Record<number, WorkloadUserCalendarDayResponse | null>>({});
  const [loading, setLoading] = useState(true);
  const [dragged, setDragged] = useState<{ taskId: number; fromOperatorId: number } | null>(null);
  const [taskUiState, setTaskUiState] = useState<Record<number, CalendarTaskUiState>>({});
  const [reschedulingTaskId, setReschedulingTaskId] = useState<number | null>(null);
  const [conflictModal, setConflictModal] = useState<{
    message: string;
    conflicts: WorkItemOverlapConflict[];
    suggestedSlots: WorkItemSuggestedSlot[];
    requestedDate: string | null;
    onPickSlot: (slot: WorkItemSuggestedSlot) => void;
  } | null>(null);
  const [conflictRetrySlot, setConflictRetrySlot] = useState<string | null>(null);
  const requestSeqRef = useRef(0);

  const operatorIdsKey = operators.map((o) => o.id).join(",");

  const fetchOne = useCallback((operatorId: number) => {
    return getWorkloadUserCalendarDayApi(operatorId, {
      range_mode: "day",
      selected_date: selectedDate,
      anchor_date: selectedDate,
      company_id: companyId,
      include_completed: true,
    });
  }, [companyId, selectedDate]);

  const loadAll = useCallback(async () => {
    if (operators.length === 0) {
      setDataByOperator({});
      setLoading(false);
      return;
    }
    const seq = ++requestSeqRef.current;
    setLoading(true);
    const results = await Promise.all(
      operators.map((op) =>
        fetchOne(op.id).then((data) => ({ id: op.id, data })).catch(() => ({ id: op.id, data: null }))
      )
    );
    if (seq !== requestSeqRef.current) return;
    const next: Record<number, WorkloadUserCalendarDayResponse | null> = {};
    results.forEach(({ id, data }) => { next[id] = data; });
    setDataByOperator(next);
    setLoading(false);
  }, [operators, fetchOne]);

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operatorIdsKey, selectedDate, companyId, reloadToken]);

  const reloadOperators = useCallback(async (ids: number[]) => {
    const unique = [...new Set(ids)];
    const results = await Promise.all(
      unique.map((id) => fetchOne(id).then((data) => ({ id, data })).catch(() => ({ id, data: null })))
    );
    setDataByOperator((current) => {
      const next = { ...current };
      results.forEach(({ id, data }) => { next[id] = data; });
      return next;
    });
    onAfterChange?.();
  }, [fetchOne, onAfterChange]);

  const setSaving = useCallback((taskId: number, saving: boolean) => {
    setTaskUiState((current) => {
      const next = { ...current };
      if (saving) next[taskId] = "saving";
      else delete next[taskId];
      return next;
    });
  }, []);

  // ── Gestione conflitti (409) con slot consigliati ──
  // Riprogramma (sposta) la task allo slot scelto; un nuovo 409 riapre il modal.
  const retryMoveRef = useRef<((taskId: number, payload: MoveWorkItemPayload, reloadIds: number[]) => void) | null>(null);
  const openOverlapModal = useCallback(
    (err: WorkItemOverlapApiError, requestedDate: string | null, makeRetry: (slot: WorkItemSuggestedSlot) => void) => {
      setConflictRetrySlot(null);
      setConflictModal({
        message: err.backendMessage,
        conflicts: err.conflicts,
        suggestedSlots: err.suggestedSlots,
        requestedDate,
        onPickSlot: makeRetry,
      });
    },
    [],
  );
  const retryMoveToSlot = useCallback(async (taskId: number, payload: MoveWorkItemPayload, reloadIds: number[]) => {
    const slotKey = `${payload.work_date ?? ""}T${payload.start_time ?? ""}`;
    setConflictRetrySlot(slotKey);
    setSaving(taskId, true);
    try {
      await moveWorkItemApi(taskId, payload);
      await reloadOperators(reloadIds);
      setConflictModal(null);
      toast.success("Task riprogrammata allo slot scelto");
    } catch (err) {
      if (isWorkItemOverlapApiError(err)) {
        openOverlapModal(err, payload.work_date ?? null, (slot) =>
          retryMoveRef.current?.(taskId, { ...payload, work_date: slot.date, start_time: slot.start_time }, reloadIds));
      } else {
        toast.error(err instanceof Error ? err.message : "Impossibile riprogrammare la task");
      }
    } finally {
      setConflictRetrySlot(null);
      setSaving(taskId, false);
    }
  }, [openOverlapModal, reloadOperators, setSaving, toast]);
  useEffect(() => { retryMoveRef.current = retryMoveToSlot; }, [retryMoveToSlot]);

  // ── Mutazioni (eseguono API + reload dell'operatore/i interessati) ──
  const moveTo = useCallback(async (taskId: number, targetOperatorId: number, startTime: string, alsoReload: number[] = []) => {
    setSaving(taskId, true);
    try {
      await moveWorkItemApi(taskId, { assignee_id: targetOperatorId, work_date: selectedDate, start_time: startTime });
      await reloadOperators([targetOperatorId, ...alsoReload]);
    } catch (err) {
      if (isWorkItemOverlapApiError(err)) {
        const reloadIds = [targetOperatorId, ...alsoReload];
        openOverlapModal(err, selectedDate, (slot) =>
          retryMoveRef.current?.(taskId, { assignee_id: targetOperatorId, work_date: slot.date, start_time: slot.start_time }, reloadIds));
      } else {
        toast.error(err instanceof Error ? err.message : "Impossibile spostare la task");
      }
    } finally {
      setSaving(taskId, false);
      setDragged(null);
    }
  }, [openOverlapModal, reloadOperators, selectedDate, setSaving, toast]);

  const performSwap = useCallback(async (operatorId: number, sourceId: number, targetIds: number[], confirm: boolean, positions?: WorkItemSwapEffectivePosition[]) => {
    setSaving(sourceId, true);
    try {
      const res = await swapWorkItemsApi({ source_work_item_ids: [sourceId], target_work_item_ids: targetIds, confirm, effective_positions: positions });
      if (res?.can_swap) {
        await reloadOperators([operatorId]);
        toast.success("Posizioni scambiate");
      } else {
        toast.error("Scambio non possibile");
      }
    } catch (err) {
      if (isSwapConfirmationRequiredError(err)) {
        setSwapConfirm({ operatorId, sourceId, targetIds, positions, preview: err.preview });
        return;
      }
      if (isWorkItemOverlapApiError(err)) toast.error(err.backendMessage);
      else toast.error(err instanceof Error ? err.message : "Scambio non possibile");
    } finally {
      setSaving(sourceId, false);
      setDragged(null);
    }
  }, [reloadOperators, setSaving, toast]);

  const swap = useCallback((operatorId: number, sourceId: number, targetIds: number[], positions?: WorkItemSwapEffectivePosition[]) => {
    void performSwap(operatorId, sourceId, targetIds, false, positions);
  }, [performSwap]);

  const confirmSwap = useCallback(async (dontShowAgain: boolean) => {
    if (!swapConfirm) return;
    const { operatorId, sourceId, targetIds, positions } = swapConfirm;
    setSwapConfirmSubmitting(true);
    try {
      if (dontShowAgain) {
        try { await updateMeApi({ swap_confirmation_disabled: true }); await refreshSession(); } catch { /* la preferenza non blocca lo swap */ }
      }
      setSwapConfirm(null);
      await performSwap(operatorId, sourceId, targetIds, true, positions);
    } finally {
      setSwapConfirmSubmitting(false);
    }
  }, [swapConfirm, performSwap, refreshSession]);

  const previewSwap = useCallback(async (sourceId: number, targetIds: number[], positions?: WorkItemSwapEffectivePosition[]): Promise<boolean> => {
    try {
      const res = await swapWorkItemsPreviewApi({ source_work_item_ids: [sourceId], target_work_item_ids: targetIds, effective_positions: positions });
      return res?.can_swap ?? false;
    } catch {
      return false;
    }
  }, []);

  const resize = useCallback(async (operatorId: number, taskId: number, endTime: string) => {
    const data = dataByOperator[operatorId];
    const item = data?.timeline.find((i) => i.kind === "task" && i.work_item_id === taskId);
    const startMinutes = hhmmToMinutes(item?.start_time ?? null) ?? 0;
    const endMinutes = hhmmToMinutes(endTime) ?? startMinutes + CALENDAR_CREATE_SLOT_MINUTES;
    const durationHours = Math.max(CALENDAR_CREATE_SLOT_MINUTES / 60, (endMinutes - startMinutes) / 60);
    setSaving(taskId, true);
    try {
      await updateWorkItemApi(taskId, { estimated_hours: durationHours });
      await reloadOperators([operatorId]);
    } catch (err) {
      if (isWorkItemOverlapApiError(err)) toast.error(err.backendMessage);
      else toast.error(err instanceof Error ? err.message : "Impossibile ridimensionare la task");
    } finally {
      setSaving(taskId, false);
    }
  }, [dataByOperator, reloadOperators, setSaving, toast]);

  const toggleComplete = useCallback(async (operatorId: number, item: WorkloadTimelineItem) => {
    if (item.kind !== "task" || !item.work_item_id) return;
    const taskId = item.work_item_id;
    const done = isDoneTask(item);
    setSaving(taskId, true);
    try {
      await updateWorkItemApi(taskId, { status: done ? "planned" : "completed", is_completed: !done });
      await reloadOperators([operatorId]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossibile aggiornare la task");
    } finally {
      setSaving(taskId, false);
    }
  }, [reloadOperators, setSaving, toast]);

  const completeOverCapacity = useCallback(async (operatorId: number, taskId: number) => {
    setSaving(taskId, true);
    try {
      await updateWorkItemApi(taskId, { status: "completed", is_completed: true });
      await reloadOperators([operatorId]);
      toast.success("Task completata");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossibile completare la task");
    } finally {
      setSaving(taskId, false);
    }
  }, [reloadOperators, setSaving, toast]);

  const rescheduleOverflow = useCallback(async (operatorId: number, taskId: number) => {
    setReschedulingTaskId(taskId);
    try {
      await rescheduleNextAvailableWorkItemApi(taskId, { from_date: selectedDate });
      await reloadOperators([operatorId]);
      toast.success("Task riprogrammata");
    } catch (err) {
      if (isWorkItemOverlapApiError(err)) {
        openOverlapModal(err, selectedDate, (slot) =>
          retryMoveRef.current?.(taskId, { assignee_id: operatorId, work_date: slot.date, start_time: slot.start_time }, [operatorId]));
      } else {
        toast.error(err instanceof Error ? err.message : "Impossibile riprogrammare la task");
      }
    } finally {
      setReschedulingTaskId(null);
    }
  }, [openOverlapModal, reloadOperators, selectedDate, toast]);

  if (loading && Object.keys(dataByOperator).length === 0) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-line dark:border-line-dark bg-paper dark:bg-ink-soft py-16">
        <Spinner size="md" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[11px] text-muted dark:text-muted-dark">
        <Icon name="info" className="h-3.5 w-3.5" />
        Trascina una task in un'altra colonna per riassegnarla all'operatore e posizionarla nello slot.
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {operators.map((op) => {
          const data = dataByOperator[op.id];
          if (!data) {
            return (
              <div key={op.id} className="flex min-w-[320px] flex-1 items-center justify-center rounded-lg border border-dashed border-line dark:border-line-dark py-16 text-sm text-muted dark:text-muted-dark">
                {op.name}: nessun dato
              </div>
            );
          }
          return (
            <OperatorCalendarColumn
              key={op.id}
              compact
              data={data}
              bounds={bounds}
              nowMinutes={nowMinutes}
              showReview={showReview}
              draggedTaskId={dragged?.taskId ?? null}
              draggedFromOperatorId={dragged?.fromOperatorId ?? null}
              onTaskDragStart={(taskId, fromOperatorId) => setDragged({ taskId, fromOperatorId })}
              onTaskDragEnd={() => setDragged(null)}
              onOpenEdit={onOpenTask}
              onCreateByDrag={({ startTime, estimatedHours }) => onCreateTask({ day: selectedDate, userId: op.id, startTime, estimatedHours })}
              onMove={(taskId, startTime) => { void moveTo(taskId, op.id, startTime); }}
              onReassign={(taskId, fromOperatorId, startTime) => { void moveTo(taskId, op.id, startTime, [fromOperatorId]); }}
              previewSwap={previewSwap}
              onSwap={(sourceId, targetIds, positions) => { void swap(op.id, sourceId, targetIds, positions); }}
              onResize={(taskId, endTime) => { void resize(op.id, taskId, endTime); }}
              onToggleComplete={(item) => { void toggleComplete(op.id, item); }}
              onCompleteOverCapacity={(taskId) => { void completeOverCapacity(op.id, taskId); }}
              onRescheduleOverflow={(taskId) => { void rescheduleOverflow(op.id, taskId); }}
              reschedulingTaskId={reschedulingTaskId}
              taskUiState={taskUiState}
            />
          );
        })}
      </div>

      <TaskConflictModal
        open={!!conflictModal}
        message={conflictModal?.message ?? ""}
        conflicts={conflictModal?.conflicts ?? []}
        suggestedSlots={conflictModal?.suggestedSlots ?? []}
        requestedDate={conflictModal?.requestedDate ?? null}
        retryingSlotKey={conflictRetrySlot}
        onPickSlot={conflictModal?.onPickSlot}
        onOpenTask={onOpenTask}
        onClose={() => { setConflictModal(null); setConflictRetrySlot(null); }}
      />

      <SwapConfirmModal
        open={swapConfirm != null}
        preview={swapConfirm?.preview ?? null}
        submitting={swapConfirmSubmitting}
        onConfirm={(dontShowAgain) => { void confirmSwap(dontShowAgain); }}
        onCancel={() => setSwapConfirm(null)}
      />
    </div>
  );
}
