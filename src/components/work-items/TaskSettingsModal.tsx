import { useEffect, useState } from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Checkbox } from "../ui/Checkbox";
import { useToast } from "../../context/ToastContext";
import { saveWorkItemSettingsApi, type WorkItem, type TrelloSyncDirection } from "../../api/workItems";

// ─────────────────────────────────────────────────────────────────────────────
// Impostazioni per-task (riutilizzabile ed estensibile): ogni impostazione è una
// "sezione". Oggi c'è solo la Sincronizzazione Trello; per aggiungerne altre
// basta aggiungere una <section> qui e una chiave in workItem.settings.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  workItem: WorkItem;
  onSaved?: (updated: WorkItem) => void;
}

const DIRECTIONS: { value: TrelloSyncDirection; title: string; desc: string; icon: "upload" | "download" }[] = [
  {
    value: "push",
    title: "Il gestionale comanda",
    desc: "Le modifiche fatte qui aggiornano automaticamente la card Trello.",
    icon: "upload",
  },
  {
    value: "pull",
    title: "Trello comanda",
    desc: "Le modifiche fatte su Trello aggiornano automaticamente questa task.",
    icon: "download",
  },
];

export function TaskSettingsModal({ open, onClose, workItem, onSaved }: Props) {
  const toast = useToast();
  const [enabled, setEnabled] = useState(false);
  const [direction, setDirection] = useState<TrelloSyncDirection>("push");
  const [saving, setSaving] = useState(false);

  // (Re)inizializza dallo stato salvato a ogni apertura / cambio task.
  useEffect(() => {
    if (!open) return;
    const s = workItem.settings?.trello_sync;
    setEnabled(!!s?.enabled);
    setDirection(s?.direction === "pull" ? "pull" : "push");
  }, [open, workItem]);

  const hasTrello = !!workItem.trello_card_id;

  const save = async () => {
    setSaving(true);
    try {
      const updated = await saveWorkItemSettingsApi(workItem.id, {
        trello_sync: { enabled, direction },
      });
      toast.success("Impostazioni salvate.");
      onSaved?.(updated);
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Impostazioni task"
      icon={<Icon name="settings" className="h-5 w-5" />}
      size="lg"
      footer={
        <div className="flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Annulla</Button>
          <Button variant="primary" onClick={() => void save()} loading={saving}>Salva</Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {/* ── Sezione: Sincronizzazione Trello ───────────────────────────────── */}
        {hasTrello ? (
          <section className="flex flex-col gap-3 rounded-lg border border-line p-4 dark:border-line-dark">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 flex-none place-items-center rounded-md bg-[#0079bf]/10 text-[#0079bf]">
                  <Icon name="trello" className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-ink dark:text-paper">Sincronizzazione Trello</h3>
                  <p className="text-[12px] text-muted dark:text-muted-dark">Tieni allineata questa task con la card Trello collegata.</p>
                </div>
              </div>
              <label className="inline-flex flex-none cursor-pointer items-center gap-2">
                <Checkbox checked={enabled} onChange={setEnabled} />
                <span className="text-[12px] font-semibold text-ink dark:text-paper">{enabled ? "Attiva" : "Off"}</span>
              </label>
            </div>

            {enabled && (
              <div className="flex flex-col gap-2 border-t border-line pt-3 dark:border-line-dark">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Chi comanda</span>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {DIRECTIONS.map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => setDirection(d.value)}
                      className={`flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors ${
                        direction === d.value
                          ? "border-brand-magenta bg-brand-magenta/5"
                          : "border-line hover:border-brand-magenta/60 dark:border-line-dark"
                      }`}
                    >
                      <span className="flex items-center gap-1.5 text-[13px] font-semibold text-ink dark:text-paper">
                        <Icon name={d.icon} className="h-3.5 w-3.5" /> {d.title}
                      </span>
                      <span className="text-[11px] text-muted dark:text-muted-dark">{d.desc}</span>
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted dark:text-muted-dark">
                  La sincronizzazione avviene automaticamente a ogni modifica.
                </p>
              </div>
            )}
          </section>
        ) : (
          <p className="text-[13px] text-muted dark:text-muted-dark">
            Questa task non è collegata a Trello: non ci sono impostazioni di sincronizzazione.
          </p>
        )}
      </div>
    </Modal>
  );
}
