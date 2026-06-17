import { useEffect, useMemo, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Icon } from "../../components/ui/Icon";
import { Input } from "../../components/ui/Input";
import { EmojiPickerField } from "../../components/ui/EmojiPickerField";
import { ColorHexField } from "../../components/ui/ColorHexField";
import { Modal } from "../../components/ui/Modal";
import { Checkbox } from "../../components/ui/Checkbox";
import { Textarea } from "../../components/ui/Textarea";
import { useToast } from "../../context/ToastContext";
import {
  createWorkAreaApi,
  deleteWorkAreaApi,
  type CreateWorkAreaPayload,
  type UpdateWorkAreaPayload,
  updateWorkAreaApi,
  type WorkArea,
} from "../../api/workAreas";
import { useWorkAreas } from "../../hooks/useWorkAreas";
import { WorkAreaBadge, isBuiltInWorkAreaIcon } from "../../components/work-areas/WorkAreaBadge";

type WorkAreaFormState = {
  name: string;
  slug: string;
  description: string;
  icon: string;
  color: string;
  is_active: boolean;
};

const EMPTY_FORM: WorkAreaFormState = {
  name: "",
  slug: "",
  description: "",
  icon: "",
  color: "",
  is_active: true,
};

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeHex(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("#") ? trimmed.toUpperCase() : `#${trimmed.toUpperCase()}`;
}

function isValidHex(value: string) {
  return /^#[0-9A-F]{6}$/.test(value.toUpperCase());
}

function toNullableText(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function isAreaError(error: unknown, code: number) {
  return error instanceof Error && error.message.includes(`[${code}]`);
}

interface WorkAreasTabProps {
  companyId: number;
  isAdmin: boolean;
}

export function WorkAreasTab({ companyId, isAdmin }: WorkAreasTabProps) {
  const toast = useToast();
  const [showInactive, setShowInactive] = useState(isAdmin);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingArea, setEditingArea] = useState<WorkArea | null>(null);
  const [deletingArea, setDeletingArea] = useState<WorkArea | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);
  const [form, setForm] = useState<WorkAreaFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const { workAreas, isLoading, error, refetch } = useWorkAreas(isAdmin ? showInactive : false, companyId);

  useEffect(() => {
    if (!modalOpen) return;
    if (editingArea) {
      setForm({
        name: editingArea.name,
        slug: editingArea.slug,
        description: editingArea.description ?? "",
        icon: editingArea.icon ?? "",
        color: editingArea.color ?? "",
        is_active: editingArea.is_active,
      });
      setSlugTouched(true);
    } else {
      setForm(EMPTY_FORM);
      setSlugTouched(false);
    }
    setFormError(null);
  }, [editingArea, modalOpen]);

  const filteredAreas = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workAreas.filter((area) => {
      if (!q) return true;
      return `${area.name} ${area.slug}`.toLowerCase().includes(q);
    });
  }, [search, workAreas]);

  const openCreate = () => {
    setEditingArea(null);
    setModalOpen(true);
  };

  const openEdit = (area: WorkArea) => {
    setEditingArea(area);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditingArea(null);
    setFormError(null);
  };

  const updateName = (value: string) => {
    setForm((current) => ({
      ...current,
      name: value,
      slug: slugTouched ? current.slug : slugify(value),
    }));
  };

  const updateSlug = (value: string) => {
    setSlugTouched(true);
    setForm((current) => ({ ...current, slug: value }));
  };

  const validateForm = () => {
    if (!form.name.trim()) {
      return "Il nome è obbligatorio";
    }
    const normalizedSlug = slugify(form.slug || form.name);
    if (!normalizedSlug) {
      return "Slug non valido";
    }
    const normalizedColor = normalizeHex(form.color);
    if (normalizedColor && !isValidHex(normalizedColor)) {
      return "Colore non valido, usa il formato #RRGGBB";
    }
    return null;
  };

  const handleSave = async () => {
    const validationError = validateForm();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      const payloadBase: CreateWorkAreaPayload = {
        company_id: companyId,
        name: form.name.trim(),
        slug: slugify(form.slug || form.name),
        description: toNullableText(form.description),
        icon: toNullableText(form.icon),
        color: normalizeHex(form.color) || undefined,
        is_active: form.is_active,
      };

      if (editingArea) {
        const payload: UpdateWorkAreaPayload = payloadBase;
        await updateWorkAreaApi(editingArea.id, payload);
        toast.success("Area aggiornata");
      } else {
        await createWorkAreaApi(payloadBase);
        toast.success("Area creata");
      }

      setModalOpen(false);
      setEditingArea(null);
      await refetch();
    } catch (error) {
      if (isAreaError(error, 403)) {
        toast.error("Operazione non consentita");
      } else if (isAreaError(error, 404)) {
        toast.error("Area non trovata o non attiva");
      } else if (isAreaError(error, 409)) {
        toast.error("Slug già in uso");
      } else if (isAreaError(error, 422)) {
        toast.error("Payload non valido");
      } else {
        toast.error(error instanceof Error ? error.message : "Errore nel salvataggio area");
      }
    } finally {
      setSaving(false);
    }
  };

  const askDelete = (area: WorkArea) => {
    setDeletingArea(area);
  };

  const handleDelete = async () => {
    if (!deletingArea) return;
    setDeleting(true);
    try {
      await deleteWorkAreaApi(deletingArea.id);
      toast.success("Area eliminata");
      setDeletingArea(null);
      await refetch();
    } catch (error) {
      if (isAreaError(error, 403)) {
        toast.error("Operazione non consentita");
      } else if (isAreaError(error, 404)) {
        toast.error("Area non trovata");
      } else {
        toast.error(error instanceof Error ? error.message : "Errore nell'eliminazione area");
      }
    } finally {
      setDeleting(false);
    }
  };

  const showInactiveToggle = isAdmin;

  return (
    <div className="bg-paper dark:bg-[#131316] rounded-lg border border-line dark:border-[#2a2a2e] p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-5">
        <div>
          <h2
            className="font-display font-bold tracking-tight text-ink dark:text-[#f4f4f7] mb-1"
            style={{ fontSize: "17px" }}
          >
            Aree di lavoro
          </h2>
          <p className="font-body text-[13px] text-muted dark:text-[#9999a0]">
            Gestisci le aree e le assegnazioni agli operatori.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {showInactiveToggle && (
            <button
              type="button"
              onClick={() => setShowInactive((current) => !current)}
              className={`inline-flex items-center gap-2 rounded-pill border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors ${showInactive ? "border-ink bg-cream text-ink dark:border-[#f4f4f7] dark:bg-[#1c1c20] dark:text-[#f4f4f7]" : "border-line text-muted hover:bg-cream dark:border-[#2a2a2e] dark:text-[#9999a0] dark:hover:bg-[#1c1c20]"}`}
            >
              <Icon name={showInactive ? "eye-off" : "eye"} className="w-3.5 h-3.5" />
              {showInactive ? "Nascondi disattive" : "Mostra disattive"}
            </button>
          )}

          {isAdmin && (
            <Button
              variant="primary"
              onClick={openCreate}
              leftIcon={<Icon name="plus" className="w-3.5 h-3.5" />}
            >
              Nuova area
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cerca per nome o slug..."
            className="pl-9"
          />
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-14 rounded-md border border-line bg-cream/60 animate-pulse dark:border-[#2a2a2e] dark:bg-[#1c1c20]"
            />
          ))}
        </div>
      ) : filteredAreas.length === 0 ? (
        <div className="rounded-md border border-dashed border-line dark:border-[#2a2a2e] px-4 py-8 text-sm text-muted dark:text-[#9999a0]">
          {isAdmin ? "Nessuna area: crea la prima." : "Nessuna area disponibile."}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-y-2">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                <th className="px-3 py-1">Nome</th>
                <th className="px-3 py-1">Slug</th>
                <th className="px-3 py-1">Icona</th>
                <th className="px-3 py-1">Colore</th>
                <th className="px-3 py-1">Stato</th>
                {isAdmin && <th className="px-3 py-1 text-right">Azioni</th>}
              </tr>
            </thead>
            <tbody>
              {filteredAreas.map((area) => {
                const normalizedColor = area.color ? (area.color.startsWith("#") ? area.color : `#${area.color}`) : null;
                return (
                  <tr key={area.id} className="align-top bg-cream dark:bg-[#1c1c20]">
                    <td className="px-3 py-3 rounded-l-md">
                      <div className="flex items-center gap-2">
                        <WorkAreaBadge area={area} />
                      </div>
                    </td>
                    <td className="px-3 py-3 text-[13px] text-muted dark:text-[#9999a0] font-mono">
                      {area.slug}
                    </td>
                    <td className="px-3 py-3 text-[13px] text-muted dark:text-[#9999a0]">
                      <div className="inline-flex items-center gap-2">
                        {area.icon ? (
                          isBuiltInWorkAreaIcon(area.icon) ? (
                            <>
                              <Icon name={area.icon} className="w-4 h-4" />
                              <span>{area.icon}</span>
                            </>
                          ) : (
                            <span className="text-base leading-none">{area.icon}</span>
                          )
                        ) : (
                          <span className="opacity-50">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-[13px] text-muted dark:text-[#9999a0]">
                      {normalizedColor ? (
                        <div className="flex items-center gap-2">
                          <span
                            className="h-4 w-4 rounded-full border border-black/10"
                            style={{ backgroundColor: normalizedColor }}
                          />
                          <span className="font-mono">{normalizedColor}</span>
                        </div>
                      ) : (
                        <span className="opacity-50">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant={area.is_active ? "success" : "default"}>
                        {area.is_active ? "Attiva" : "Disattiva"}
                      </Badge>
                    </td>
                    {isAdmin && (
                      <td className="px-3 py-3 rounded-r-md">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openEdit(area)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink transition-colors hover:bg-paper dark:border-[#2a2a2e] dark:text-[#f4f4f7] dark:hover:bg-[#131316]"
                          >
                            <Icon name="pencil" className="w-3.5 h-3.5" />
                            Modifica
                          </button>
                          <button
                            type="button"
                            onClick={() => askDelete(area)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-danger/20 bg-danger/5 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-danger transition-colors hover:bg-danger/10"
                          >
                            <Icon name="trash" className="w-3.5 h-3.5" />
                            Elimina
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editingArea ? "Modifica area" : "Nuova area"}
        description="Nome, slug, icona, colore e stato dell'area di lavoro."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={closeModal} disabled={saving}>
              Annulla
            </Button>
            <Button variant="primary" onClick={handleSave} loading={saving}>
              Salva
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {formError && (
            <div className="rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_92px_132px] gap-3 items-start">
            <Input
              label="Nome"
              value={form.name}
              onChange={(event) => updateName(event.target.value)}
              placeholder="Social"
            />

            <div className="w-[92px]">
              <EmojiPickerField
                label="Emoji"
                value={form.icon}
                onChange={(value) => setForm((current) => ({ ...current, icon: value }))}
                searchPlaceholder="Cerca emoji..."
              />
            </div>

            <div className="w-[132px]">
              <ColorHexField
                label="Colore"
                value={form.color}
                onChange={(value) => setForm((current) => ({ ...current, color: value }))}

              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-3 md:items-end">
            <Input
              label="Slug"
              value={form.slug}
              onChange={(event) => updateSlug(event.target.value)}
              placeholder="social"
              hint="Minuscolo, con trattini al posto degli spazi."
            />

            <label className="h-[42px] md:mb-[21px] flex items-center gap-2.5 cursor-pointer select-none rounded-md border border-line px-3 dark:border-[#2a2a2e]">
              <Checkbox
                checked={form.is_active}
                onChange={(v) => setForm((current) => ({ ...current, is_active: v }))}
              />
              <span className="text-sm font-semibold text-ink dark:text-[#f4f4f7]">Attiva</span>
            </label>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
              Descrizione
            </label>
            <Textarea
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              rows={4}
              placeholder="Area social media"
              className="w-full rounded-md border border-line bg-paper px-3 py-2.5 text-sm font-body text-ink outline-none transition-colors focus:border-ink dark:border-line-dark dark:bg-ink-soft dark:text-paper dark:focus:border-paper"
            />
          </div>

        </div>
      </Modal>

      <Modal
        open={!!deletingArea}
        onClose={() => setDeletingArea(null)}
        title="Elimina area"
        description="L'operazione non è reversibile."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeletingArea(null)} disabled={deleting}>
              Annulla
            </Button>
            <Button variant="danger" onClick={handleDelete} loading={deleting}>
              Elimina
            </Button>
          </>
        }
      >
        <p className="font-body text-sm text-ink dark:text-[#f4f4f7]">
          Sei sicuro di voler eliminare <strong>{deletingArea?.name}</strong>?
        </p>
      </Modal>
    </div>
  );
}