import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Avatar } from "../ui/Avatar";
import { Icon } from "../ui/Icon";
import type { OverbookingCheckResponse } from "../../api/workload";
import type { User } from "../../api/users";

interface OverbookingModalProps {
  open: boolean;
  data: OverbookingCheckResponse | null;
  users: User[];
  /** id dell'operatore in corso di riassegnazione (per lo stato di loading) */
  reassigningUserId: number | null;
  onReassign: (userId: number) => void;
  /** Riprogramma la task al primo slot libero (stesso operatore). */
  onReschedule?: () => void;
  /** true mentre è in corso la riprogrammazione. */
  rescheduling?: boolean;
  /** Procedi mantenendo l'assegnatario attuale (overbook). Anche la chiusura usa questa. */
  onProceed: () => void;
}

const fmtH = (value: number) => `${value.toFixed(1)}h`;

const AVAILABILITY_LABELS: Record<string, string> = {
  active: "Attivo",
  vacation: "In ferie",
  sick: "Malattia",
  unavailable: "Non disponibile",
  part_time: "Part-time",
};

export function OverbookingModal({
  open,
  data,
  users,
  reassigningUserId,
  onReschedule,
  rescheduling = false,
  onProceed,
  onReassign,
}: OverbookingModalProps) {
  const nameFor = (userId: number) => {
    const user = users.find((u) => u.id === userId);
    return user?.full_name ?? user?.username ?? `Operatore #${userId}`;
  };

  const targetName = data ? nameFor(data.target_user_id) : "";
  const busy = reassigningUserId !== null || rescheduling;

  return (
    <Modal
      open={open && !!data}
      onClose={onProceed}
      title="Operatore in overbooking"
      description="L'operatore assegnato supera la capacità del giorno. Puoi riprogrammare la task al primo slot libero, riassegnarla a un operatore della stessa area, oppure procedere comunque (in overbooking). Chiudendo, la task resta assegnata in overbooking."
      size="lg"
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {onReschedule && (
            <Button
              variant="primary"
              onClick={onReschedule}
              loading={rescheduling}
              disabled={busy}
              leftIcon={<Icon name="refresh-cw" className="h-4 w-4" />}
            >
              Riprogramma al primo slot libero
            </Button>
          )}
          <Button variant="ghost" onClick={onProceed} disabled={busy}>
            Procedi su {targetName} (overbook)
          </Button>
        </div>
      }
    >
      {data && (
        <div className="flex flex-col gap-4">
          {/* Riepilogo overbooking operatore target */}
          <div className="flex items-start gap-2 rounded-md border border-danger/35 bg-danger/10 px-3 py-2.5 text-sm text-ink dark:text-paper">
            <Icon name="alert-triangle" className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <p className="leading-5">
              Assegnando questa task, <b>{targetName}</b> arriva a{" "}
              <b>{fmtH(data.target_occupied_hours)}</b> su {fmtH(data.target_capacity_hours)}{" "}
              <span className="font-bold text-danger">
                (+{fmtH(data.target_overflow_hours)} oltre la capacità)
              </span>
              .
            </p>
          </div>

          {/* Suggerimento */}
          {data.suggested_user_id != null ? (
            <p className="text-xs leading-5 text-muted dark:text-muted-dark">
              💡 Suggerito: <b>{nameFor(data.suggested_user_id)}</b> ha spazio sufficiente quel
              giorno.
            </p>
          ) : (
            <p className="text-xs leading-5 text-muted dark:text-muted-dark">
              ⚠ Nessun altro operatore ha spazio sufficiente quel giorno: puoi comunque riassegnare
              o procedere in overbooking.
            </p>
          )}

          {/* Lista operatori alternativi */}
          {data.alternatives.length === 0 ? (
            <div className="rounded-md border border-dashed border-line px-3 py-6 text-center text-sm text-muted dark:border-line-dark dark:text-muted-dark">
              Nessun operatore alternativo nella stessa area.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {data.alternatives.map((op) => {
                const isSuggested = op.user_id === data.suggested_user_id;
                const name = op.full_name ?? op.username;
                return (
                  <div
                    key={op.user_id}
                    className={`flex items-center gap-3 rounded-md border px-3 py-2 ${
                      isSuggested
                        ? "border-brand-magenta/50 bg-brand-magenta/5"
                        : "border-line dark:border-line-dark"
                    }`}
                  >
                    <Avatar name={name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-semibold text-ink dark:text-paper">
                          {name}
                        </span>
                        {isSuggested && (
                          <span className="rounded bg-brand-magenta/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-brand-magenta">
                            Suggerito
                          </span>
                        )}
                        {op.shared_work_area_ids.length > 0 && (
                          <span className="rounded border border-line px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-muted dark:border-line-dark dark:text-muted-dark">
                            Stessa area
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-muted dark:text-muted-dark">
                        <span>
                          {AVAILABILITY_LABELS[op.availability_status] ?? op.availability_status}
                        </span>
                        <span>
                          {fmtH(op.occupied_hours)} / {fmtH(op.capacity_hours)}
                        </span>
                        {op.fits ? (
                          <span className="font-semibold text-success">
                            {fmtH(op.remaining_hours)} libere
                          </span>
                        ) : (
                          <span className="font-semibold text-warning">Pieno</span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant={isSuggested ? "primary" : "secondary"}
                      size="sm"
                      loading={reassigningUserId === op.user_id}
                      disabled={busy}
                      onClick={() => onReassign(op.user_id)}
                    >
                      Assegna
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
