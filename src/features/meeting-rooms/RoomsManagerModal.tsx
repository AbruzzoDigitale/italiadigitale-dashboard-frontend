import { useMemo, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Checkbox } from "../../components/ui/Checkbox";
import { ColorHexField } from "../../components/ui/ColorHexField";
import { Icon } from "../../components/ui/Icon";
import { Input } from "../../components/ui/Input";
import { Modal } from "../../components/ui/Modal";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import { useToast } from "../../context/ToastContext";
import {
  createRoomApi,
  deleteRoomApi,
  updateRoomApi,
  type MeetingRoom,
  type RoomSettings,
} from "../../api/meetingRooms";
import { DOW_SHORT, fmtMinute } from "./roomsTime";

// Anagrafica delle sale: creazione, modifica, disattivazione. Riservata agli
// admin — è la configurazione dell'ufficio, non un'operazione di calendario.

const TEXTAREA_CLASS =
  "w-full rounded-md border px-3 py-2.5 text-sm font-body bg-paper text-ink placeholder:text-muted " +
  "border-line focus:border-ink focus:outline-none transition-colors duration-150 resize-y " +
  "dark:bg-ink-soft dark:text-paper dark:border-line-dark dark:placeholder:text-muted-dark dark:focus:border-paper";

const COLORI = ["#c41284", "#2ec3f3", "#16a34a", "#f59e0b", "#4a1d6e", "#dc2626", "#0ea5e9", "#64748b"];

const PASSI = [
  { value: "15", label: "15 minuti" },
  { value: "30", label: "30 minuti" },
  { value: "60", label: "1 ora" },
];

/** "09:30" ⇄ 570: il campo ora parla in stringhe, il modello in minuti. */
function toTimeValue(minute: number): string {
  return fmtMinute(minute);
}

function fromTimeValue(value: string, fallback: number): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return fallback;
  const minuti = Number(m[1]) * 60 + Number(m[2]);
  return Number.isFinite(minuti) ? Math.min(Math.max(minuti, 0), 24 * 60) : fallback;
}

const NUOVA: RoomSettings = {
  name: "",
  short_name: null,
  capacity: 4,
  location: null,
  color: COLORI[0],
  features: [],
  notes: null,
  open_minute: 8 * 60,
  close_minute: 20 * 60,
  work_start_minute: 9 * 60 + 30,
  work_end_minute: 18 * 60 + 30,
  slot_minutes: 30,
  weekdays: [1, 2, 3, 4, 5],
  max_duration_minutes: null,
  is_active: true,
  sort_order: 0,
};

interface RoomsManagerModalProps {
  open: boolean;
  onClose: () => void;
  companyId: number;
  rooms: MeetingRoom[];
  onChanged: () => void;
}

export function RoomsManagerModal({
  open,
  onClose,
  companyId,
  rooms,
  onChanged,
}: RoomsManagerModalProps) {
  const toast = useToast();
  const [editing, setEditing] = useState<MeetingRoom | null>(null);
  const [form, setForm] = useState<RoomSettings | null>(null);
  const [saving, setSaving] = useState(false);

  const ordinate = useMemo(
    () => [...rooms].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
    [rooms],
  );

  const patch = (changes: Partial<RoomSettings>) =>
    setForm((prev) => (prev ? { ...prev, ...changes } : prev));

  const apriNuova = () => {
    setEditing(null);
    setForm({ ...NUOVA, sort_order: ordinate.length });
  };

  const apriModifica = (room: MeetingRoom) => {
    setEditing(room);
    // Solo i campi configurabili: id/azienda/data restano fuori dal form.
    setForm({
      name: room.name,
      short_name: room.short_name,
      capacity: room.capacity,
      location: room.location,
      color: room.color,
      features: room.features,
      notes: room.notes,
      open_minute: room.open_minute,
      close_minute: room.close_minute,
      work_start_minute: room.work_start_minute,
      work_end_minute: room.work_end_minute,
      slot_minutes: room.slot_minutes,
      weekdays: room.weekdays,
      max_duration_minutes: room.max_duration_minutes,
      is_active: room.is_active,
      sort_order: room.sort_order,
    });
  };

  const chiudiForm = () => {
    setEditing(null);
    setForm(null);
  };

  const salva = async () => {
    if (!form) return;
    if (!form.name.trim()) {
      toast.error("Dai un nome alla sala");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateRoomApi(editing.id, form);
        toast.success("Sala aggiornata");
      } else {
        await createRoomApi({ ...form, company_id: companyId });
        toast.success("Sala creata");
      }
      onChanged();
      chiudiForm();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  };

  const elimina = async (room: MeetingRoom) => {
    if (!window.confirm(`Eliminare la sala «${room.name}»?`)) return;
    try {
      await deleteRoomApi(room.id);
      toast.success("Sala eliminata");
      onChanged();
    } catch (e) {
      const messaggio = e instanceof Error ? e.message : "Errore nell'eliminazione";
      // Il 409 arriva con l'elenco delle prenotazioni future: la scelta di
      // travolgerle resta esplicita.
      if (messaggio.includes("prenotazioni future")) {
        if (!window.confirm(`${messaggio}\n\nEliminare comunque sala e prenotazioni?`)) return;
        try {
          await deleteRoomApi(room.id, true);
          toast.success("Sala e prenotazioni eliminate");
          onChanged();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Errore nell'eliminazione");
        }
        return;
      }
      toast.error(messaggio);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="2xl"
      title="Sale dell'azienda"
      description="Capienza, orari di apertura e giorni prenotabili di ogni sala."
      icon={<Icon name="building" className="h-5 w-5" />}
      footer={
        <div className="flex w-full items-center gap-2">
          {form ? (
            <>
              <span className="flex-1" />
              <Button variant="ghost" onClick={chiudiForm}>
                Annulla
              </Button>
              <Button onClick={salva} loading={saving}>
                {editing ? "Salva sala" : "Crea sala"}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="secondary"
                onClick={apriNuova}
                leftIcon={<Icon name="plus" className="h-4 w-4" />}
              >
                Nuova sala
              </Button>
              <span className="flex-1" />
              <Button variant="ghost" onClick={onClose}>
                Chiudi
              </Button>
            </>
          )}
        </div>
      }
    >
      {!form ? (
        <div className="mr-roomlist">
          {ordinate.map((room) => (
            <div
              key={room.id}
              className={`mr-roomrow${room.is_active ? "" : " off"}`}
              style={{ ["--mr-room" as string]: room.color }}
            >
              <div className="mr-roomrow-main">
                <b>
                  {room.name}
                  {!room.is_active && " · disattivata"}
                </b>
                <span>
                  {room.capacity > 0 ? `${room.capacity} posti` : "posti n.d."}
                  {room.location ? ` · ${room.location}` : ""} ·{" "}
                  {fmtMinute(room.open_minute)}–{fmtMinute(room.close_minute)} ·{" "}
                  {room.weekdays.map((d) => DOW_SHORT[d - 1]).join(", ")}
                </span>
              </div>
              <div className="mr-roomrow-actions">
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  title="Modifica sala"
                  aria-label="Modifica sala"
                  onClick={() => apriModifica(room)}
                >
                  <Icon name="pencil" className="h-4 w-4" />
                </Button>
                <Button
                  variant="danger-ghost"
                  size="sm"
                  iconOnly
                  title="Elimina sala"
                  aria-label="Elimina sala"
                  onClick={() => elimina(room)}
                >
                  <Icon name="trash" className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          {!ordinate.length && (
            <div className="mr-empty">
              <Icon name="building" className="h-6 w-6" />
              <b>Nessuna sala configurata</b>
              <span>
                Crea la prima sala: bastano un nome e gli orari di apertura, il resto si può
                sistemare dopo.
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="mr-form">
          <div className="mr-grid2">
            <label className="mr-field">
              <span className="mr-lab">
                Nome<i>*</i>
              </span>
              <Input
                value={form.name}
                placeholder="Es. Sala Riunioni"
                onChange={(e) => patch({ name: e.target.value })}
              />
            </label>
            <label className="mr-field">
              <span className="mr-lab">Nome corto</span>
              <Input
                value={form.short_name ?? ""}
                placeholder="Riunioni"
                onChange={(e) => patch({ short_name: e.target.value || null })}
              />
            </label>
            <label className="mr-field">
              <span className="mr-lab">Posti</span>
              <Input
                type="number"
                min={0}
                value={form.capacity}
                onChange={(e) => patch({ capacity: Number(e.target.value) || 0 })}
              />
            </label>
            <label className="mr-field">
              <span className="mr-lab">Dove si trova</span>
              <Input
                value={form.location ?? ""}
                placeholder="Piano 1"
                onChange={(e) => patch({ location: e.target.value || null })}
              />
            </label>

            <div className="mr-field full">
              <span className="mr-lab">Colore</span>
              <div className="mr-swatches">
                {COLORI.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`mr-swatch${form.color.toLowerCase() === c.toLowerCase() ? " on" : ""}`}
                    style={{ background: c }}
                    title={c}
                    aria-label={`Colore ${c}`}
                    onClick={() => patch({ color: c })}
                  />
                ))}
              </div>
              <ColorHexField value={form.color} onChange={(v) => patch({ color: v })} />
            </div>

            <label className="mr-field">
              <span className="mr-lab">Apertura</span>
              <Input
                type="time"
                value={toTimeValue(form.open_minute)}
                onChange={(e) => patch({ open_minute: fromTimeValue(e.target.value, form.open_minute) })}
              />
            </label>
            <label className="mr-field">
              <span className="mr-lab">Chiusura</span>
              <Input
                type="time"
                value={toTimeValue(form.close_minute)}
                onChange={(e) => patch({ close_minute: fromTimeValue(e.target.value, form.close_minute) })}
              />
            </label>
            <label className="mr-field">
              <span className="mr-lab">Inizio orario di lavoro</span>
              <Input
                type="time"
                value={toTimeValue(form.work_start_minute)}
                onChange={(e) =>
                  patch({ work_start_minute: fromTimeValue(e.target.value, form.work_start_minute) })
                }
              />
            </label>
            <label className="mr-field">
              <span className="mr-lab">Fine orario di lavoro</span>
              <Input
                type="time"
                value={toTimeValue(form.work_end_minute)}
                onChange={(e) =>
                  patch({ work_end_minute: fromTimeValue(e.target.value, form.work_end_minute) })
                }
              />
            </label>

            <div className="mr-field">
              <span className="mr-lab">Passo degli slot</span>
              <SearchableSelect
                value={String(form.slot_minutes)}
                onChange={(v) => patch({ slot_minutes: Number(v) })}
                showAvatar={false}
                options={PASSI}
              />
            </div>
            <label className="mr-field">
              <span className="mr-lab">Durata massima (ore)</span>
              <Input
                type="number"
                min={0}
                step={0.5}
                placeholder="Nessun limite"
                value={form.max_duration_minutes ? form.max_duration_minutes / 60 : ""}
                onChange={(e) =>
                  patch({
                    max_duration_minutes: e.target.value
                      ? Math.round(Number(e.target.value) * 60)
                      : null,
                  })
                }
              />
            </label>

            <div className="mr-field full">
              <span className="mr-lab">Giorni prenotabili</span>
              <div className="mr-daypicker">
                {DOW_SHORT.map((label, i) => {
                  const giorno = i + 1;
                  const attivo = form.weekdays.includes(giorno);
                  return (
                    <button
                      key={label}
                      type="button"
                      className={attivo ? "on" : ""}
                      onClick={() =>
                        patch({
                          weekdays: attivo
                            ? form.weekdays.filter((d) => d !== giorno)
                            : [...form.weekdays, giorno].sort((a, b) => a - b),
                        })
                      }
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="mr-field full">
              <span className="mr-lab">Dotazioni (una per riga)</span>
              <textarea
                className={TEXTAREA_CLASS}
                rows={3}
                value={form.features.join("\n")}
                placeholder={'Schermo 65"\nWhiteboard\nTavolo 8 posti'}
                onChange={(e) => patch({ features: e.target.value.split("\n") })}
              />
            </label>

            <label className="mr-field full">
              <span className="mr-lab">Note</span>
              <textarea
                className={TEXTAREA_CLASS}
                rows={2}
                value={form.notes ?? ""}
                placeholder="Indicazioni per chi prenota"
                onChange={(e) => patch({ notes: e.target.value || null })}
              />
            </label>

            <label className="mr-field full flex-row items-center gap-2.5">
              <Checkbox checked={form.is_active} onChange={(v) => patch({ is_active: v })} />
              <span className="text-sm text-ink dark:text-paper">
                Sala attiva (visibile nel calendario)
              </span>
            </label>
          </div>
        </div>
      )}
    </Modal>
  );
}
