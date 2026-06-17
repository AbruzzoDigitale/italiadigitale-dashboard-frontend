import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { Input } from "../../components/ui/Input";
import { ColorHexField } from "../../components/ui/ColorHexField";
import { Modal } from "../../components/ui/Modal";
import { useToast } from "../../context/ToastContext";
import {
  createWorkTagApi,
  deleteWorkTagApi,
  listWorkTagsApi,
  updateWorkTagApi,
  type WorkTag,
} from "../../api/workTags";

interface WorkTagsTabProps {
  companyId: number;
  isAdmin: boolean;
}

type TagFormState = {
  name: string;
  slug: string;
  color: string;
};

const EMPTY_FORM: TagFormState = { name: "", slug: "", color: "" };

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isTagError(error: unknown, code: number) {
  return error instanceof Error && error.message.includes(`[${code}]`);
}

export function WorkTagsTab({ companyId, isAdmin }: WorkTagsTabProps) {
  const toast = useToast();
  const [tags, setTags] = useState<WorkTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<WorkTag | null>(null);
  const [deletingTag, setDeletingTag] = useState<WorkTag | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);
  const [form, setForm] = useState<TagFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listWorkTagsApi({ company_id: companyId });
      setTags(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore caricamento tag");
    } finally {
      setLoading(false);
    }
  }, [companyId, toast]);

  useEffect(() => { void load(); }, [load]);

  const filteredTags = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tags;
    return tags.filter((tag) => `${tag.name} ${tag.slug}`.toLowerCase().includes(q));
  }, [tags, search]);

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

  const openCreate = () => {
    setEditingTag(null);
    setForm(EMPTY_FORM);
    setSlugTouched(false);
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (tag: WorkTag) => {
    setEditingTag(tag);
    setForm({ name: tag.name, slug: tag.slug, color: tag.color ?? "" });
    setSlugTouched(true);
    setFormError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditingTag(null);
    setFormError(null);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setFormError("Il nome è obbligatorio");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editingTag) {
        const updated = await updateWorkTagApi(editingTag.id, {
          name: form.name.trim(),
          slug: form.slug.trim() || null,
          color: form.color.trim() || null,
        });
        setTags((current) => current.map((tag) => (tag.id === updated.id ? updated : tag)));
        toast.success("Tag aggiornato");
      } else {
        const created = await createWorkTagApi({
          company_id: companyId,
          name: form.name.trim(),
          slug: form.slug.trim() || undefined,
          color: form.color.trim() || null,
        });
        setTags((current) => [...current, created]);
        toast.success("Tag creato");
      }
      setModalOpen(false);
    } catch (err) {
      if (isTagError(err, 409)) {
        setFormError("Slug già in uso per questa azienda — cambia nome o slug");
      } else if (isTagError(err, 403)) {
        setFormError("Non hai i permessi per questa operazione");
      } else if (isTagError(err, 422)) {
        setFormError("Dati non validi — controlla nome e slug");
      } else {
        setFormError(err instanceof Error ? err.message : "Errore nel salvataggio");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingTag) return;
    setDeleting(true);
    try {
      await deleteWorkTagApi(deletingTag.id);
      setTags((current) => current.filter((tag) => tag.id !== deletingTag.id));
      toast.success("Tag eliminato");
      setDeletingTag(null);
    } catch (err) {
      if (isTagError(err, 403)) {
        toast.error("Operazione non consentita");
      } else {
        toast.error(err instanceof Error ? err.message : "Errore eliminazione tag");
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="bg-paper dark:bg-[#131316] rounded-lg border border-line dark:border-[#2a2a2e] p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-5">
        <div>
          <h2
            className="font-display font-bold tracking-tight text-ink dark:text-[#f4f4f7] mb-1"
            style={{ fontSize: "17px" }}
          >
            Tag lavorazioni
          </h2>
          <p className="font-body text-[13px] text-muted dark:text-[#9999a0]">
            Gestisci i tag usati per classificare le lavorazioni.
          </p>
        </div>

        {isAdmin && (
          <Button
            variant="primary"
            onClick={openCreate}
            leftIcon={<Icon name="plus" className="w-3.5 h-3.5" />}
          >
            Nuovo tag
          </Button>
        )}
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

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-14 rounded-md border border-line bg-cream/60 animate-pulse dark:border-[#2a2a2e] dark:bg-[#1c1c20]"
            />
          ))}
        </div>
      ) : filteredTags.length === 0 ? (
        <div className="rounded-md border border-dashed border-line dark:border-[#2a2a2e] px-4 py-8 text-sm text-muted dark:text-[#9999a0]">
          {isAdmin ? "Nessun tag: crea il primo." : "Nessun tag disponibile."}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-y-2">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                <th className="px-3 py-1">Nome</th>
                <th className="px-3 py-1">Slug</th>
                <th className="px-3 py-1">Colore</th>
                {isAdmin && <th className="px-3 py-1 text-right">Azioni</th>}
              </tr>
            </thead>
            <tbody>
              {filteredTags.map((tag) => {
                const color = tag.color ? (tag.color.startsWith("#") ? tag.color : `#${tag.color}`) : null;
                return (
                  <tr key={tag.id} className="align-middle bg-cream dark:bg-[#1c1c20]">
                    <td className="px-3 py-3 rounded-l-md">
                      <div className="flex items-center gap-2">
                        {color && (
                          <span
                            className="h-3 w-3 rounded-full flex-shrink-0 border border-black/10 dark:border-white/10"
                            style={{ backgroundColor: color }}
                          />
                        )}
                        <span className="text-[13px] font-semibold text-ink dark:text-[#f4f4f7]">{tag.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-[13px] text-muted dark:text-[#9999a0] font-mono">
                      {tag.slug}
                    </td>
                    <td className="px-3 py-3 text-[13px] text-muted dark:text-[#9999a0]">
                      {color ? (
                        <div className="flex items-center gap-2">
                          <span
                            className="h-4 w-4 rounded-full border border-black/10 dark:border-white/10"
                            style={{ backgroundColor: color }}
                          />
                          <span className="font-mono">{color}</span>
                        </div>
                      ) : (
                        <span className="opacity-50">—</span>
                      )}
                    </td>
                    {isAdmin && (
                      <td className="px-3 py-3 rounded-r-md">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openEdit(tag)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink transition-colors hover:bg-paper dark:border-[#2a2a2e] dark:text-[#f4f4f7] dark:hover:bg-[#131316]"
                          >
                            <Icon name="pencil" className="w-3.5 h-3.5" />
                            Modifica
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingTag(tag)}
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
        title={editingTag ? "Modifica tag" : "Nuovo tag"}
        description="Nome, slug e colore del tag."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={closeModal} disabled={saving}>
              Annulla
            </Button>
            <Button variant="primary" onClick={() => void handleSave()} loading={saving}>
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

          <Input
            label="Nome"
            value={form.name}
            onChange={(event) => updateName(event.target.value)}
            placeholder="Es. Urgente"
          />

          <Input
            label="Slug"
            value={form.slug}
            onChange={(event) => updateSlug(event.target.value)}
            placeholder="es. urgente"
            hint="Minuscolo, con trattini al posto degli spazi. Generato automaticamente se vuoto."
          />

          <ColorHexField
            label="Colore"
            value={form.color}
            onChange={(value) => setForm((current) => ({ ...current, color: value }))}
          />
        </div>
      </Modal>

      <Modal
        open={!!deletingTag}
        onClose={() => setDeletingTag(null)}
        title="Elimina tag"
        description="L'operazione non è reversibile."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeletingTag(null)} disabled={deleting}>
              Annulla
            </Button>
            <Button variant="danger" onClick={() => void handleDelete()} loading={deleting}>
              Elimina
            </Button>
          </>
        }
      >
        <p className="font-body text-sm text-ink dark:text-[#f4f4f7]">
          Sei sicuro di voler eliminare <strong>{deletingTag?.name}</strong>?
        </p>
      </Modal>
    </div>
  );
}
