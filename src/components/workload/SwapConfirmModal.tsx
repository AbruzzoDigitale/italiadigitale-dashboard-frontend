import { useEffect, useState } from "react";
import type { WorkItemSwapPreviewResponse } from "../../api/workItems";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { Icon } from "../ui/Icon";

interface SwapConfirmModalProps {
  open: boolean;
  preview: WorkItemSwapPreviewResponse | null;
  submitting?: boolean;
  onConfirm: (dontShowAgain: boolean) => void;
  onCancel: () => void;
}

/** Avviso di conferma per lo scambio di due task. La spunta "Non mostrare più"
 *  disattiva il warning (PATCH /users/me) a carico del chiamante. */
export function SwapConfirmModal({ open, preview, submitting, onConfirm, onCancel }: SwapConfirmModalProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  useEffect(() => {
    if (open) setDontShowAgain(false);
  }, [open]);

  const positions = preview?.positions ?? [];

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title="Conferma scambio"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={submitting}>
            Annulla
          </Button>
          <Button variant="primary" onClick={() => onConfirm(dontShowAgain)} loading={submitting}>
            Conferma scambio
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-2 text-sm text-ink dark:text-paper">
          <Icon name="refresh-cw" className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-magenta" />
          <p>
            Stai per scambiare la posizione di queste due lavorazioni. Controlla i nuovi orari e conferma.
          </p>
        </div>

        <div className="rounded-md border border-line dark:border-line-dark divide-y divide-line dark:divide-line-dark">
          {positions.map((p) => (
            <div key={p.work_item_id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="min-w-0 truncate text-[13px] font-medium text-ink dark:text-paper" title={p.title}>
                {p.title}
              </span>
              <span className="flex flex-shrink-0 items-center gap-1.5 text-[12px] font-semibold tabular-nums">
                <span className="text-muted dark:text-muted-dark line-through">{p.old_start_time ?? "—"}</span>
                <Icon name="chevron-right" className="h-3.5 w-3.5 text-muted dark:text-muted-dark" />
                <span className="text-ink dark:text-paper">{p.new_start_time}</span>
                <span className="text-muted dark:text-muted-dark">–{p.new_end_time}</span>
              </span>
            </div>
          ))}
          {positions.length === 0 && (
            <div className="px-3 py-2 text-[12px] text-muted dark:text-muted-dark">Nessun dettaglio disponibile.</div>
          )}
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-[13px] text-muted dark:text-muted-dark">
          <Checkbox checked={dontShowAgain} onChange={setDontShowAgain} />
          Non mostrare più questo avviso
        </label>
      </div>
    </Modal>
  );
}
