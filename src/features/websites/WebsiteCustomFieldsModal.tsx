import { useEffect, useState } from "react";
import {
  CUSTOM_FIELD_TYPE_LABELS,
  createWebsiteCustomFieldApi,
  deleteWebsiteCustomFieldApi,
  updateWebsiteCustomFieldApi,
  type WebsiteCustomField,
  type WebsiteCustomFieldType,
} from "../../api/websites";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { Input } from "../../components/ui/Input";
import { Modal } from "../../components/ui/Modal";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import { SegmentedSwitch } from "../../components/ui/SegmentedSwitch";
import { useToast } from "../../context/ToastContext";

type FieldFormState = {
  label: string;
  field_type: WebsiteCustomFieldType;
  options: string;
  help_text: string;
  visibility: "private" | "company";
};

const EMPTY_FORM: FieldFormState = {
  label: "",
  field_type: "text",
  options: "",
  help_text: "",
  visibility: "private",
};

const TYPE_OPTIONS = (Object.keys(CUSTOM_FIELD_TYPE_LABELS) as WebsiteCustomFieldType[]).map((value) => ({
  value,
  label: CUSTOM_FIELD_TYPE_LABELS[value],
}));

interface WebsiteCustomFieldsModalProps {
  open: boolean;
  onClose: () => void;
  companyId: number;
  fields: WebsiteCustomField[];
  /** Ricarica i campi (e i siti) dopo una modifica. */
  onChanged: () => void | Promise<void>;
  /** Solo PM e admin possono condividere un campo con tutta l'azienda. */
  canShare: boolean;
}

/**
 * Gestione dei campi personalizzati della scheda sito.
 *
 * Chiunque può crearne: un operatore ottiene sempre un campo personale, mentre
 * PM e admin scelgono se condividerlo. Un campo condiviso creato da un livello
 * più alto si vede ma non si tocca: il backend applica la stessa regola.
 */
export function WebsiteCustomFieldsModal({
  open,
  onClose,
  companyId,
  fields,
  onChanged,
  canShare,
}: WebsiteCustomFieldsModalProps) {
  const toast = useToast();
  const [form, setForm] = useState<FieldFormState>(EMPTY_FORM);
  const [editing, setEditing] = useState<WebsiteCustomField | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setFormOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
      setFormError(null);
    }
  }, [open]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, visibility: canShare ? "company" : "private" });
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (field: WebsiteCustomField) => {
    setEditing(field);
    setForm({
      label: field.label,
      field_type: field.field_type,
      options: (field.options ?? []).join("\n"),
      help_text: field.help_text ?? "",
      visibility: field.visibility,
    });
    setFormError(null);
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.label.trim()) {
      setFormError("L'etichetta è obbligatoria");
      return;
    }
    const options = form.options
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (form.field_type === "select" && options.length === 0) {
      setFormError("Un elenco di scelte richiede almeno un'opzione (una per riga)");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        label: form.label.trim(),
        field_type: form.field_type,
        options: form.field_type === "select" ? options : null,
        help_text: form.help_text.trim() || null,
        visibility: form.visibility,
      };
      if (editing) {
        await updateWebsiteCustomFieldApi(editing.id, payload);
        toast.success("Campo aggiornato");
      } else {
        await createWebsiteCustomFieldApi({ company_id: companyId, ...payload });
        toast.success("Campo creato");
      }
      setFormOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
      await onChanged();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (field: WebsiteCustomField) => {
    setDeletingId(field.id);
    try {
      await deleteWebsiteCustomFieldApi(field.id);
      toast.success("Campo eliminato");
      await onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nell'eliminazione");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Campi personalizzati"
      description="Colonne in più nella scheda sito. I campi personali li vedi solo tu; quelli condivisi valgono per tutta l'azienda."
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Chiudi
          </Button>
          {!formOpen && (
            <Button variant="primary" onClick={openCreate} leftIcon={<Icon name="plus" className="w-3.5 h-3.5" />}>
              Nuovo campo
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {formOpen && (
          <div className="flex flex-col gap-3 rounded-md border border-line bg-cream p-4 dark:border-[#2a2a2e] dark:bg-[#1c1c20]">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
              {editing ? "Modifica campo" : "Nuovo campo"}
            </p>

            {formError && (
              <div className="rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
                {formError}
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Input
                label="Etichetta"
                value={form.label}
                onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))}
                placeholder="Tempo di aggiornamento automatico"
              />
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                  Tipo di campo
                </label>
                <SearchableSelect
                  value={form.field_type}
                  onChange={(value) =>
                    setForm((current) => ({ ...current, field_type: (value || "text") as WebsiteCustomFieldType }))
                  }
                  options={TYPE_OPTIONS}
                  showAvatar={false}
                  menuLayer="portal"
                />
              </div>
            </div>

            {form.field_type === "select" && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                  Opzioni (una per riga)
                </label>
                <textarea
                  value={form.options}
                  onChange={(event) => setForm((current) => ({ ...current, options: event.target.value }))}
                  rows={4}
                  placeholder={"Attivi\nTolti\nDa controllare"}
                  className="w-full rounded-md border border-line bg-paper px-3 py-2.5 text-sm font-body text-ink outline-none transition-colors focus:border-ink dark:border-line-dark dark:bg-ink-soft dark:text-paper dark:focus:border-paper"
                />
              </div>
            )}

            <Input
              label="Testo di aiuto"
              value={form.help_text}
              onChange={(event) => setForm((current) => ({ ...current, help_text: event.target.value }))}
              placeholder="Compare sotto il campo nella scheda sito"
            />

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                Visibilità
              </label>
              {canShare ? (
                <SegmentedSwitch
                  value={form.visibility}
                  onChange={(value) => setForm((current) => ({ ...current, visibility: value }))}
                  ariaLabel="Visibilità del campo"
                  options={[
                    { value: "private", label: "Solo per me" },
                    { value: "company", label: "Tutta l'azienda" },
                  ]}
                />
              ) : (
                <p className="text-[12px] text-muted dark:text-[#9999a0]">
                  Il campo resta personale: solo project manager e admin possono condividerlo con tutta l'azienda.
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setFormOpen(false);
                  setEditing(null);
                }}
                disabled={saving}
              >
                Annulla
              </Button>
              <Button variant="primary" onClick={handleSave} loading={saving}>
                Salva
              </Button>
            </div>
          </div>
        )}

        {fields.length === 0 ? (
          <div className="rounded-md border border-dashed border-line px-4 py-8 text-sm text-muted dark:border-[#2a2a2e] dark:text-[#9999a0]">
            Nessun campo personalizzato: creane uno per aggiungere informazioni alla scheda sito.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {fields.map((field) => (
              <div
                key={field.id}
                className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-cream px-3 py-2.5 dark:border-[#2a2a2e] dark:bg-[#1c1c20]"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-bold text-ink dark:text-[#f4f4f7]">{field.label}</p>
                  <p className="truncate text-[11px] text-muted dark:text-[#9999a0]">
                    {CUSTOM_FIELD_TYPE_LABELS[field.field_type]}
                    {field.help_text ? ` · ${field.help_text}` : ""}
                  </p>
                </div>
                {field.visibility === "company" ? (
                  <Badge variant="info">Tutta l'azienda</Badge>
                ) : (
                  <Badge variant="user">Solo per me</Badge>
                )}
                {field.owner_name && field.visibility === "company" && (
                  <span className="text-[11px] text-muted dark:text-[#9999a0]">di {field.owner_name}</span>
                )}
                <div className="flex flex-none items-center gap-1">
                  <button
                    type="button"
                    title={field.can_manage ? "Modifica" : "Creato da un utente di livello superiore"}
                    aria-label="Modifica"
                    disabled={!field.can_manage}
                    onClick={() => openEdit(field)}
                    className="inline-grid h-7 w-7 place-items-center rounded-md border border-line text-ink transition-colors hover:bg-paper disabled:opacity-30 dark:border-[#2a2a2e] dark:text-[#f4f4f7] dark:hover:bg-[#131316]"
                  >
                    <Icon name="pencil" className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title={field.can_manage ? "Elimina" : "Creato da un utente di livello superiore"}
                    aria-label="Elimina"
                    disabled={!field.can_manage || deletingId === field.id}
                    onClick={() => handleDelete(field)}
                    className="inline-grid h-7 w-7 place-items-center rounded-md border border-danger/20 bg-danger/5 text-danger transition-colors hover:bg-danger/10 disabled:opacity-30"
                  >
                    <Icon name="trash" className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
