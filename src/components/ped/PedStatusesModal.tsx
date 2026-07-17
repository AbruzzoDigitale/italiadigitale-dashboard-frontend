import { useEffect, useState } from "react";
import {
  createPedStatusApi,
  deletePedStatusApi,
  updatePedStatusApi,
  type PedStatus,
} from "../../api/pedControl";
import { useToast } from "../../context/ToastContext";
import { Button } from "../ui/Button";
import { ColorHexField } from "../ui/ColorHexField";
import { Icon } from "../ui/Icon";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";

interface Draft {
  label: string;
  short_label: string;
  color: string;
}

const EMPTY_DRAFT: Draft = { label: "", short_label: "", color: "#7c6bd6" };

export function PedStatusesModal({
  open,
  onClose,
  companyId,
  statuses,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  companyId: number;
  statuses: PedStatus[];
  onChanged: () => void;
}) {
  const toast = useToast();
  const [creating, setCreating] = useState<Draft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setCreating(EMPTY_DRAFT);
      setEditingId(null);
    }
  }, [open]);

  const sorted = [...statuses].sort((a, b) => a.sort_order - b.sort_order);

  const handleCreate = async () => {
    if (!creating.label.trim()) {
      toast.error("Inserisci un'etichetta");
      return;
    }
    setBusy(true);
    try {
      await createPedStatusApi({
        company_id: companyId,
        label: creating.label.trim(),
        short_label: creating.short_label.trim() || null,
        color: creating.color,
      });
      toast.success("Stato creato");
      setCreating(EMPTY_DRAFT);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore creazione stato");
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (s: PedStatus) => {
    setEditingId(s.id);
    setEditDraft({ label: s.label, short_label: s.short_label, color: s.color });
  };

  const handleUpdate = async (id: number) => {
    if (!editDraft.label.trim()) {
      toast.error("Inserisci un'etichetta");
      return;
    }
    setBusy(true);
    try {
      await updatePedStatusApi(id, {
        label: editDraft.label.trim(),
        short_label: editDraft.short_label.trim() || editDraft.label.trim(),
        color: editDraft.color,
      });
      toast.success("Stato aggiornato");
      setEditingId(null);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore aggiornamento stato");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (s: PedStatus) => {
    if (!window.confirm(`Eliminare lo stato "${s.label}"? Le task che lo usano resteranno senza stato.`)) return;
    setBusy(true);
    try {
      await deletePedStatusApi(s.id);
      toast.success("Stato eliminato");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore eliminazione stato");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Stati PED"
      description="Gli stati di sistema sono condivisi e non modificabili. Puoi creare stati personalizzati per l'azienda."
      icon={<Icon name="grid" className="h-5 w-5" />}
      size="lg"
      footer={<Button variant="ghost" onClick={onClose}>Chiudi</Button>}
    >
      <div className="flex flex-col gap-4">
        {/* Elenco stati */}
        <div className="flex flex-col divide-y divide-line dark:divide-line-dark rounded-lg border border-line dark:border-line-dark">
          {sorted.map((s) => {
            const isEditing = editingId === s.id;
            return (
              <div key={s.id} className={`flex gap-3 px-3 py-2.5 ${isEditing ? "flex-wrap items-end" : "items-center"}`}>
                {isEditing ? (
                  <>
                    <div className="min-w-0 flex-1">
                      <Input label="Etichetta" value={editDraft.label} onChange={(e) => setEditDraft((d) => ({ ...d, label: e.target.value }))} placeholder="Etichetta" />
                    </div>
                    <div className="w-24">
                      <Input label="Sigla" value={editDraft.short_label} onChange={(e) => setEditDraft((d) => ({ ...d, short_label: e.target.value }))} placeholder="Sigla" />
                    </div>
                    <ColorHexField label="Colore" value={editDraft.color} onChange={(color) => setEditDraft((d) => ({ ...d, color }))} />
                    <Button size="sm" variant="primary" onClick={() => void handleUpdate(s.id)} disabled={busy}>Salva</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} disabled={busy}>Annulla</Button>
                  </>
                ) : (
                  <>
                    <span className="h-4 w-4 shrink-0 rounded" style={{ background: s.color }} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink dark:text-paper">{s.label}</span>
                    <span className="shrink-0 text-xs text-muted dark:text-muted-dark">{s.short_label}</span>
                    {s.is_system ? (
                      <span className="shrink-0 rounded-pill border border-line dark:border-line-dark px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
                        Sistema
                      </span>
                    ) : (
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => startEdit(s)}
                          disabled={busy}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-line dark:border-line-dark text-muted transition-colors hover:border-brand-magenta hover:text-brand-magenta"
                          title="Modifica"
                        >
                          <Icon name="pencil" className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(s)}
                          disabled={busy}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-line dark:border-line-dark text-muted transition-colors hover:border-danger hover:text-danger"
                          title="Elimina"
                        >
                          <Icon name="trash" className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Nuovo stato */}
        <div className="flex flex-col gap-2 rounded-lg border border-line dark:border-line-dark bg-cream dark:bg-[#0e0f0e] p-3">
          <span className="text-xs font-bold uppercase tracking-wide text-muted dark:text-muted-dark">Nuovo stato</span>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1">
              <Input label="Etichetta" value={creating.label} onChange={(e) => setCreating((d) => ({ ...d, label: e.target.value }))} placeholder="Es. Da inviare" />
            </div>
            <div className="w-28">
              <Input label="Sigla" value={creating.short_label} onChange={(e) => setCreating((d) => ({ ...d, short_label: e.target.value }))} placeholder="Facolt." />
            </div>
            <ColorHexField label="Colore" value={creating.color} onChange={(color) => setCreating((d) => ({ ...d, color }))} />
            <Button variant="primary" onClick={() => void handleCreate()} loading={busy} leftIcon={<Icon name="plus" className="h-4 w-4" />}>
              Aggiungi
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
