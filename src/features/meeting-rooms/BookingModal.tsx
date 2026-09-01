import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { Input } from "../../components/ui/Input";
import { Modal } from "../../components/ui/Modal";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import { Spinner } from "../../components/ui/Spinner";
import { useToast } from "../../context/ToastContext";
import {
  createBookingApi,
  deleteBookingApi,
  getRoomAvailabilityApi,
  updateBookingApi,
  type AvailabilitySlot,
  type MeetingRoom,
  type RoomAvailability,
} from "../../api/meetingRooms";
import type { User } from "../../api/users";
import { dayInfo, fmtDuration, fmtMinute } from "./roomsTime";

/** La prenotazione in lavorazione: `id` nullo = nuova. */
export interface BookingDraft {
  id: number | null;
  room_id: number;
  day: string;
  start_minute: number;
  end_minute: number;
  title: string;
  organizer_user_id: number | null;
  notes: string;
  guest_user_ids: number[];
  can_edit: boolean;
  /** Solo per la vista in sola lettura. */
  organizer_name?: string;
  room_name?: string;
  /** Link «Aggiungi a Google Calendar» (solo su prenotazioni già salvate). */
  google_calendar_url?: string;
}

/** Bottone «Aggiungi a Google Calendar»: è un semplice link, apre Google col
 *  modulo evento già compilato e lascia a chi clicca il salvataggio. */
function CalendarLink({ url, variant = "solid" }: { url: string; variant?: "solid" | "soft" }) {
  const base =
    "inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-[13px] font-bold no-underline transition-colors";
  const stile =
    variant === "solid"
      ? "bg-brand-magenta text-white hover:bg-[#a30f6e]"
      : "border border-line bg-paper text-ink hover:border-ink dark:border-line-dark dark:bg-ink-soft dark:text-paper dark:hover:border-paper";
  return (
    <a href={url} target="_blank" rel="noreferrer noopener" className={`${base} ${stile}`}>
      <Icon name="calendar" className="h-4 w-4" />
      Aggiungi a Google Calendar
    </a>
  );
}

const TEXTAREA_CLASS =
  "w-full rounded-md border px-3 py-2.5 text-sm font-body bg-paper text-ink placeholder:text-muted " +
  "border-line focus:border-ink focus:outline-none transition-colors duration-150 resize-y " +
  "dark:bg-ink-soft dark:text-paper dark:border-line-dark dark:placeholder:text-muted-dark dark:focus:border-paper";

function initials(u: User): string {
  const nome = (u.full_name || u.username || "").trim();
  const parti = nome.split(" ").filter(Boolean);
  if (!parti.length) return (u.email || "?")[0].toUpperCase();
  return parti.slice(0, 2).map((p) => p[0].toUpperCase()).join("");
}

function userLabel(u: User): string {
  return u.full_name || u.username || u.email;
}

/**
 * Uno slot è utilizzabile se il server lo dà libero, oppure se è occupato dalla
 * prenotazione che stiamo modificando: spostarla di mezz'ora non deve sbattere
 * contro sé stessa.
 */
function usable(slot: AvailabilitySlot, editingId: number | null): boolean {
  return slot.is_free || (editingId != null && slot.booking_id === editingId);
}

interface BookingModalProps {
  draft: BookingDraft | null;
  rooms: MeetingRoom[];
  users: User[];
  onClose: () => void;
  onSaved: () => void;
}

export function BookingModal({ draft, rooms, users, onClose, onSaved }: BookingModalProps) {
  const toast = useToast();
  const [form, setForm] = useState<BookingDraft | null>(draft);
  const [availability, setAvailability] = useState<RoomAvailability | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setForm(draft);
  }, [draft]);

  const room = useMemo(
    () => rooms.find((r) => r.id === form?.room_id) ?? null,
    [rooms, form?.room_id],
  );
  const soloLettura = !!form?.id && !form.can_edit;

  // Disponibilità della sala nel giorno scelto: è ciò che rende selezionabili
  // solo gli orari davvero liberi, invece di scoprire il conflitto al salvataggio.
  useEffect(() => {
    if (!form || soloLettura || !form.room_id || !form.day) {
      setAvailability(null);
      return;
    }
    let annullato = false;
    setLoadingSlots(true);
    getRoomAvailabilityApi(form.room_id, form.day)
      .then((res) => {
        if (!annullato) setAvailability(res);
      })
      .catch(() => {
        if (!annullato) setAvailability(null);
      })
      .finally(() => {
        if (!annullato) setLoadingSlots(false);
      });
    return () => {
      annullato = true;
    };
    // Solo sala e giorno: rimettere `form` fra le dipendenze farebbe ripartire
    // la chiamata a ogni carattere digitato nel titolo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form?.id, form?.room_id, form?.day, soloLettura]);

  const startOptions = useMemo(() => {
    if (!availability || !form) return [];
    const liberi = availability.slots
      .filter((s) => usable(s, form.id))
      .map((s) => s.start_minute);
    // L'orario attuale resta sempre selezionabile, anche se il server lo
    // considera passato: altrimenti una prenotazione di stamattina non si tocca più.
    if (!liberi.includes(form.start_minute)) liberi.push(form.start_minute);
    return liberi.sort((a, b) => a - b);
  }, [availability, form]);

  /** Fine possibile: fino al primo slot non utilizzabile dopo l'inizio scelto. */
  const endOptions = useMemo(() => {
    if (!form) return [];
    const passo = availability?.slot_minutes ?? room?.slot_minutes ?? 30;
    if (!availability) {
      const chiusura = room?.close_minute ?? 20 * 60;
      const out: number[] = [];
      for (let m = form.start_minute + passo; m <= chiusura; m += passo) out.push(m);
      return out.length ? out : [form.end_minute];
    }
    const out: number[] = [];
    for (const slot of availability.slots) {
      if (slot.start_minute < form.start_minute) continue;
      if (!usable(slot, form.id)) break;
      out.push(slot.end_minute);
      if (room?.max_duration_minutes && slot.end_minute - form.start_minute >= room.max_duration_minutes) break;
    }
    if (!out.includes(form.end_minute)) out.push(form.end_minute);
    return out.sort((a, b) => a - b);
  }, [availability, form, room]);

  const patch = useCallback((changes: Partial<BookingDraft>) => {
    setForm((prev) => (prev ? { ...prev, ...changes } : prev));
  }, []);

  // Cambio sala o giorno: se la fascia scelta non è più libera, la si riporta
  // al primo slot disponibile invece di lasciare un orario che il server rifiuterà.
  useEffect(() => {
    if (!form || !availability || loadingSlots) return;
    const passo = availability.slot_minutes;
    const inizioOk = availability.slots.some(
      (s) => s.start_minute === form.start_minute && usable(s, form.id),
    );
    if (inizioOk) return;
    const primo = availability.slots.find((s) => usable(s, form.id));
    if (!primo) return;
    const durata = Math.max(form.end_minute - form.start_minute, passo);
    patch({ start_minute: primo.start_minute, end_minute: primo.start_minute + durata });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availability, loadingSlots]);

  if (!form) return null;

  const info = dayInfo(form.day);
  const durata = form.end_minute - form.start_minute;
  const fuoriOrario =
    !!availability &&
    (form.start_minute < availability.work_start_minute ||
      form.end_minute > availability.work_end_minute);
  const giornoChiuso = !!room && !room.weekdays.includes(info.weekday);
  const selezionati = form.guest_user_ids
    .map((id) => users.find((u) => u.id === id))
    .filter((u): u is User => !!u);
  const invitabili = users
    .filter((u) => u.is_active && u.id !== form.organizer_user_id)
    // I selezionati in cima: restano sott'occhio anche con l'elenco lungo.
    .sort((a, b) => {
      const sa = form.guest_user_ids.includes(a.id) ? 0 : 1;
      const sb = form.guest_user_ids.includes(b.id) ? 0 : 1;
      return sa - sb || userLabel(a).localeCompare(userLabel(b));
    });

  const togglePartecipante = (userId: number) =>
    patch({
      guest_user_ids: form.guest_user_ids.includes(userId)
        ? form.guest_user_ids.filter((g) => g !== userId)
        : [...form.guest_user_ids, userId],
    });

  const salva = async () => {
    if (!form.title.trim()) {
      toast.error("Dai un titolo alla prenotazione");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        room_id: form.room_id,
        title: form.title.trim(),
        day: form.day,
        start_minute: form.start_minute,
        end_minute: form.end_minute,
        organizer_user_id: form.organizer_user_id,
        notes: form.notes.trim() || null,
        guest_user_ids: form.guest_user_ids,
      };
      if (form.id) {
        await updateBookingApi(form.id, payload);
        toast.success("Prenotazione aggiornata");
      } else {
        await createBookingApi(payload);
        toast.success("Sala prenotata");
      }
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  };

  const annulla = async () => {
    if (!form.id) return;
    if (!window.confirm(`Annullare la prenotazione «${form.title}»?`)) return;
    setDeleting(true);
    try {
      await deleteBookingApi(form.id);
      toast.success("Prenotazione annullata");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore nell'annullamento");
    } finally {
      setDeleting(false);
    }
  };

  const titolo = form.id
    ? soloLettura
      ? "Prenotazione"
      : "Modifica prenotazione"
    : "Prenota sala";

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={titolo}
      description={`${room?.name ?? form.room_name ?? "Sala"} · ${info.label}`}
      icon={<Icon name="calendar" className="h-5 w-5" />}
      footer={
        soloLettura ? (
          <div className="flex w-full justify-end">
            <Button variant="secondary" onClick={onClose}>
              Chiudi
            </Button>
          </div>
        ) : (
          <div className="flex w-full items-center gap-2">
            {form.id && (
              <Button
                variant="danger-ghost"
                onClick={annulla}
                loading={deleting}
                leftIcon={<Icon name="trash" className="h-4 w-4" />}
              >
                Annulla prenotazione
              </Button>
            )}
            <span className="flex-1" />
            <Button variant="ghost" onClick={onClose}>
              Chiudi
            </Button>
            <Button
              onClick={salva}
              loading={saving}
              disabled={giornoChiuso}
              leftIcon={<Icon name="check-circle" className="h-4 w-4" />}
            >
              {form.id ? "Salva" : "Prenota"}
            </Button>
          </div>
        )
      }
    >
      {soloLettura ? (
        <div className="mr-readonly">
          <dl>
            <dt>Titolo</dt>
            <dd>{form.title}</dd>
            <dt>Sala</dt>
            <dd>{form.room_name ?? room?.name}</dd>
            <dt>Quando</dt>
            <dd className="capitalize">
              {info.label} · {fmtMinute(form.start_minute)}–{fmtMinute(form.end_minute)} (
              {fmtDuration(durata)})
            </dd>
            <dt>Organizzatore</dt>
            <dd>{form.organizer_name ?? "—"}</dd>
            <dt>Partecipanti</dt>
            <dd>
              {form.guest_user_ids.length
                ? form.guest_user_ids
                    .map((id) => users.find((u) => u.id === id))
                    .map((u) => (u ? userLabel(u) : "—"))
                    .join(", ")
                : "Nessuno"}
            </dd>
            {form.notes && (
              <>
                <dt>Note</dt>
                <dd className="whitespace-pre-wrap">{form.notes}</dd>
              </>
            )}
          </dl>
          {form.google_calendar_url && (
            <div>
              <CalendarLink url={form.google_calendar_url} />
            </div>
          )}
          <div className="mr-note">
            <Icon name="information-circle" className="h-4 w-4" />
            Solo l'organizzatore (o un admin/PM) può modificare o annullare questa prenotazione.
          </div>
        </div>
      ) : (
        <div className="mr-form">
          <div className="mr-grid2">
            <label className="mr-field full">
              <span className="mr-lab">
                Titolo<i>*</i>
              </span>
              <Input
                value={form.title}
                placeholder="Es. Review PED settembre"
                onChange={(e) => patch({ title: e.target.value })}
              />
            </label>

            <div className="mr-field">
              <span className="mr-lab">Sala</span>
              <SearchableSelect
                value={String(form.room_id)}
                onChange={(v) => patch({ room_id: Number(v) })}
                showAvatar={false}
                options={rooms.map((r) => ({
                  value: String(r.id),
                  label: r.capacity > 0 ? `${r.name} · ${r.capacity} posti` : r.name,
                  keywords: r.location ?? "",
                }))}
              />
            </div>

            <div className="mr-field">
              <span className="mr-lab">Organizzatore</span>
              <SearchableSelect
                value={form.organizer_user_id ? String(form.organizer_user_id) : ""}
                onChange={(v) =>
                  patch({
                    organizer_user_id: v ? Number(v) : null,
                    guest_user_ids: form.guest_user_ids.filter((g) => String(g) !== v),
                  })
                }
                options={users
                  .filter((u) => u.is_active)
                  .map((u) => ({
                    value: String(u.id),
                    label: userLabel(u),
                    keywords: u.email,
                    avatarUrl: u.avatar_url ?? null,
                  }))}
              />
            </div>

            <label className="mr-field">
              <span className="mr-lab">
                Giorno<i>*</i>
              </span>
              <Input type="date" value={form.day} onChange={(e) => patch({ day: e.target.value })} />
            </label>

            <div className="mr-field">
              <span className="mr-lab">Orario</span>
              <div className="flex items-center gap-2">
                <SearchableSelect
                  className="flex-1"
                  value={String(form.start_minute)}
                  onChange={(v) => {
                    const inizio = Number(v);
                    const passo = availability?.slot_minutes ?? room?.slot_minutes ?? 30;
                    patch({
                      start_minute: inizio,
                      end_minute: Math.max(form.end_minute, inizio + passo),
                    });
                  }}
                  showAvatar={false}
                  disabled={loadingSlots}
                  options={startOptions.map((m) => ({ value: String(m), label: fmtMinute(m) }))}
                  emptyMessage="Nessuno slot libero"
                />
                <span className="text-xs text-muted dark:text-muted-dark">→</span>
                <SearchableSelect
                  className="flex-1"
                  value={String(form.end_minute)}
                  onChange={(v) => patch({ end_minute: Number(v) })}
                  showAvatar={false}
                  disabled={loadingSlots}
                  options={endOptions
                    .filter((m) => m > form.start_minute)
                    .map((m) => ({ value: String(m), label: fmtMinute(m) }))}
                  emptyMessage="Nessuno slot libero"
                />
              </div>
            </div>

            <div className={`mr-durtag${fuoriOrario ? " warn" : ""}`}>
              {loadingSlots ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner className="h-3 w-3" /> Controllo gli slot liberi…
                </span>
              ) : (
                <>
                  Durata <b>{fmtDuration(durata)}</b>
                  {availability && (
                    <>
                      {" · "}
                      {fmtDuration(availability.free_minutes)} ancora liberi in giornata
                    </>
                  )}
                  {fuoriOrario && " · fuori dall'orario di lavoro"}
                </>
              )}
            </div>
          </div>

          {form.id && form.google_calendar_url && (
            <div className="mr-calrow">
              <CalendarLink url={form.google_calendar_url} variant="soft" />
              <span>
                Il link apre Google col modulo evento già compilato. Ogni partecipante lo riceve
                anche via email.
              </span>
            </div>
          )}

          {giornoChiuso && (
            <div className="mr-note warn">
              <Icon name="alert-triangle" className="h-4 w-4" />
              {room?.name} non è prenotabile di {info.label.split(" ")[0]}. Scegli un altro giorno o
              un'altra sala.
            </div>
          )}
          {!giornoChiuso && availability && !availability.slots.some((s) => usable(s, form.id)) && (
            <div className="mr-note warn">
              <Icon name="alert-triangle" className="h-4 w-4" />
              Nessuno slot libero in questa sala per il giorno scelto.
            </div>
          )}

          <div className="mr-field full">
            <span className="mr-lab">
              Partecipanti
              {selezionati.length > 0 && (
                <b className="mr-lab-count">{selezionati.length} selezionati</b>
              )}
            </span>

            {/* Chi è stato scelto sta in cima, in chiaro: nell'elenco lungo un
                chip acceso in mezzo agli altri si perde. */}
            {selezionati.length > 0 && (
              <div className="mr-picked">
                {selezionati.map((u) => (
                  <span key={u.id} className="mr-picked-item" title={u.email}>
                    <span className="mr-picked-av">{initials(u)}</span>
                    {userLabel(u)}
                    <button
                      type="button"
                      className="mr-picked-x"
                      aria-label={`Togli ${userLabel(u)}`}
                      title={`Togli ${userLabel(u)}`}
                      onClick={() => togglePartecipante(u.id)}
                    >
                      <Icon name="x" className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <button type="button" className="mr-picked-clear" onClick={() => patch({ guest_user_ids: [] })}>
                  Togli tutti
                </button>
              </div>
            )}

            <div className="mr-people">
              {invitabili.map((u) => {
                const attivo = form.guest_user_ids.includes(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    className={`mr-chip${attivo ? " on" : ""}`}
                    title={u.email}
                    aria-pressed={attivo}
                    onClick={() => togglePartecipante(u.id)}
                  >
                    <span className="mr-chip-av">
                      {attivo ? <Icon name="check-circle" className="h-3 w-3" /> : initials(u)}
                    </span>
                    {userLabel(u)}
                  </button>
                );
              })}
              {!invitabili.length && (
                <span className="text-xs text-muted dark:text-muted-dark">
                  Nessun altro utente in questa azienda.
                </span>
              )}
            </div>
            {selezionati.length > 0 && (
              <div className="mr-note">
                <Icon name="bell" className="h-3.5 w-3.5" />
                <span>
                  {selezionati.length === 1
                    ? "1 partecipante riceverà"
                    : `${selezionati.length} partecipanti riceveranno`}{" "}
                  una notifica nel gestionale e un'email con il link per aggiungere la riunione al
                  proprio Google Calendar, all'indirizzo del profilo
                  {selezionati.length === 1 ? ` (${selezionati[0].email}).` : "."}
                </span>
              </div>
            )}
          </div>

          <label className="mr-field full">
            <span className="mr-lab">Note</span>
            <textarea
              className={TEXTAREA_CLASS}
              rows={3}
              value={form.notes}
              placeholder="Ordine del giorno, link, materiali…"
              onChange={(e) => patch({ notes: e.target.value })}
            />
          </label>
        </div>
      )}
    </Modal>
  );
}
