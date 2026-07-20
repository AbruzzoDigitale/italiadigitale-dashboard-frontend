import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import type { WorkItemOverlapConflict, WorkItemSuggestedSlot } from "../../api/workItems";

function formatSlotDayLabel(iso: string): string {
  // "lun 28 giu" — senza punti abbreviazione
  return new Date(`${iso}T00:00:00`)
    .toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "short" })
    .replace(/\./g, "");
}

interface TaskConflictModalProps {
  open: boolean;
  message: string;
  conflicts: WorkItemOverlapConflict[];
  suggestedSlots: WorkItemSuggestedSlot[];
  /** Data richiesta in origine: distingue gli slot "stesso giorno" dai rimandi. */
  requestedDate: string | null;
  /** Chiave (`${date}T${start_time}`) dello slot in corso di riprogrammazione, per il loading. */
  retryingSlotKey: string | null;
  /** Riprogramma la task allo slot scelto. Se assente, gli slot non vengono mostrati. */
  onPickSlot?: (slot: WorkItemSuggestedSlot) => void;
  /** Apre la task in conflitto (opzionale). */
  onOpenTask?: (workItemId: number) => void;
  onClose: () => void;
}

export function TaskConflictModal({
  open,
  message,
  conflicts,
  suggestedSlots,
  requestedDate,
  retryingSlotKey,
  onPickSlot,
  onOpenTask,
  onClose,
}: TaskConflictModalProps) {
  const sameDay = suggestedSlots.filter((s) => s.date === requestedDate);
  const otherDays = suggestedSlots.filter((s) => s.date !== requestedDate);
  const busy = retryingSlotKey !== null;

  const renderSlot = (slot: WorkItemSuggestedSlot) => {
    const key = `${slot.date}T${slot.start_time}`;
    return (
      <Button
        key={key}
        size="sm"
        variant="secondary"
        loading={retryingSlotKey === key}
        disabled={busy && retryingSlotKey !== key}
        onClick={() => onPickSlot?.(slot)}
        leftIcon={<Icon name="clock" className="h-3.5 w-3.5" />}
      >
        {slot.start_time}–{slot.end_time}
      </Button>
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Slot orario occupato"
      description={message || "Una o più task si sovrappongono allo slot selezionato."}
      size="lg"
      footer={
        <Button variant="primary" onClick={onClose}>
          Ho capito
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        {conflicts.map((conflict) => (
          <div
            key={`${conflict.work_item_id}-${conflict.overlap_start_time}`}
            className="rounded-md border border-warning/35 bg-warning/10 px-3 py-2"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink dark:text-paper">{conflict.title}</p>
                <p className="mt-1 text-xs text-muted dark:text-muted-dark">
                  Occupa {conflict.start_time ?? "—"} - {conflict.end_time ?? "—"}
                </p>
                <p className="mt-1 text-xs font-semibold text-warning">
                  Accavallamento: {conflict.overlap_start_time} - {conflict.overlap_end_time} ({conflict.overlap_minutes} min)
                </p>
              </div>
              {onOpenTask && (
                <Button size="sm" variant="ghost" onClick={() => onOpenTask(conflict.work_item_id)}>
                  Apri task
                </Button>
              )}
            </div>
          </div>
        ))}

        {/* Slot liberi consigliati per la riprogrammazione */}
        {onPickSlot && (
          <div className="mt-1 rounded-md border border-line bg-cream/40 px-3 py-2.5 dark:border-line-dark dark:bg-ink-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
              Slot liberi consigliati
            </p>
            {suggestedSlots.length === 0 ? (
              <p className="mt-2 text-xs text-muted dark:text-muted-dark">
                Nessuno slot libero disponibile per l'operatore entro la scadenza.
              </p>
            ) : (
              <div className="mt-2 flex flex-col gap-3">
                {sameDay.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-medium text-ink dark:text-paper">Stesso giorno</span>
                    <div className="flex flex-wrap gap-2">{sameDay.map(renderSlot)}</div>
                  </div>
                )}
                {otherDays.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-medium text-ink dark:text-paper">Prossimi giorni disponibili</span>
                    <div className="flex flex-col gap-1.5">
                      {otherDays.map((slot) => (
                        <div key={`${slot.date}T${slot.start_time}`} className="flex items-center gap-2">
                          <span className="w-28 shrink-0 text-xs capitalize text-muted dark:text-muted-dark">
                            {formatSlotDayLabel(slot.date)}
                          </span>
                          {renderSlot(slot)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
