import { useEffect, useMemo, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Checkbox } from "../../components/ui/Checkbox";
import { ColorHexField } from "../../components/ui/ColorHexField";
import { EmojiPickerField } from "../../components/ui/EmojiPickerField";
import { Icon } from "../../components/ui/Icon";
import { Input } from "../../components/ui/Input";
import { Modal } from "../../components/ui/Modal";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import { Textarea } from "../../components/ui/Textarea";
import { useToast } from "../../context/ToastContext";
import {
  createRoleApi,
  deleteRoleApi,
  listRolesApi,
  type Role,
  updateRoleApi,
} from "../../api/roles";

interface RolesTabProps {
  companyId: number;
  canManageRoles: boolean;
}

type RoleFormState = {
  name: string;
  slug: string;
  description: string;
  icon: string;
  color: string;
  is_active: boolean;
  is_system: boolean;
};

const EMPTY_FORM: RoleFormState = {
  name: "",
  slug: "",
  description: "",
  icon: "",
  color: "",
  is_active: true,
  is_system: false,
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

function toNullableText(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function isRoleError(error: unknown, code: number) {
  return error instanceof Error && error.message.includes(`[${code}]`);
}

export function RolesTab({ companyId, canManageRoles }: RolesTabProps) {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [deletingRole, setDeletingRole] = useState<Role | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);
  const [form, setForm] = useState<RoleFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const loadRoles = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const next = await listRolesApi({
        company_id: companyId,
        ...(statusFilter === "active" ? { is_active: true } : {}),
        ...(statusFilter === "inactive" ? { is_active: false } : {}),
      });
      setRoles(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel caricamento ruoli");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRoles();
  }, [companyId, statusFilter]);

  useEffect(() => {
    if (!modalOpen) return;
    if (editingRole) {
      setForm({
        name: editingRole.name,
        slug: editingRole.slug,
        description: editingRole.description ?? "",
        icon: editingRole.icon ?? "",
        color: editingRole.color ?? "",
        is_active: editingRole.is_active,
        is_system: editingRole.is_system,
      });
      setSlugTouched(true);
    } else {
      setForm(EMPTY_FORM);
      setSlugTouched(false);
    }
    setFormError(null);
  }, [editingRole, modalOpen]);

  const filteredRoles = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return roles;
    return roles.filter((role) =>
      `${role.name} ${role.slug} ${role.description ?? ""}`.toLowerCase().includes(q)
    );
  }, [roles, search]);

  const openCreate = () => {
    setEditingRole(null);
    setModalOpen(true);
  };

  const openEdit = (role: Role) => {
    setEditingRole(role);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditingRole(null);
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

  const handleSave = async () => {
    if (!form.name.trim()) {
      setFormError("Il nome è obbligatorio");
      return;
    }

    const normalizedSlug = slugify(form.slug || form.name);
    if (!normalizedSlug) {
      setFormError("Slug non valido");
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      const payload = {
        company_id: companyId,
        name: form.name.trim(),
        slug: normalizedSlug,
        description: toNullableText(form.description),
        icon: toNullableText(form.icon),
        color: toNullableText(form.color),
        is_active: form.is_active,
        is_system: form.is_system,
      };

      if (editingRole) {
        await updateRoleApi(editingRole.id, payload);
        toast.success("Ruolo aggiornato");
      } else {
        await createRoleApi(payload);
        toast.success("Ruolo creato");
      }

      setModalOpen(false);
      setEditingRole(null);
      await loadRoles();
    } catch (err) {
      if (isRoleError(err, 403)) {
        setFormError("Operazione non consentita");
      } else if (isRoleError(err, 409)) {
        setFormError("Slug già in uso in questa azienda");
      } else if (isRoleError(err, 422)) {
        setFormError("Dati non validi");
      } else {
        setFormError(err instanceof Error ? err.message : "Errore nel salvataggio ruolo");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingRole) return;
    setDeleting(true);
    try {
      await deleteRoleApi(deletingRole.id);
      toast.success("Ruolo eliminato");
      setDeletingRole(null);
      await loadRoles();
    } catch (err) {
      if (isRoleError(err, 403)) {
        toast.error("Operazione non consentita");
      } else {
        toast.error(err instanceof Error ? err.message : "Errore nell'eliminazione ruolo");
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
            Ruoli
          </h2>
          <p className="font-body text-[13px] text-muted dark:text-[#9999a0]">
            Gestisci i ruoli per questa azienda e assegnali agli utenti.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SearchableSelect
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as "all" | "active" | "inactive")}
            options={[
              { value: "all", label: "Tutti" },
              { value: "active", label: "Solo attivi" },
              { value: "inactive", label: "Solo inattivi" },
            ]}
            className="w-44"
            placeholder="Tutti"
            searchPlaceholder="Cerca stato…"
          />

          {canManageRoles && (
            <Button
              variant="primary"
              onClick={openCreate}
              leftIcon={<Icon name="plus" className="w-3.5 h-3.5" />}
            >
              Nuovo ruolo
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
      ) : filteredRoles.length === 0 ? (
        <div className="rounded-md border border-dashed border-line dark:border-[#2a2a2e] px-4 py-8 text-sm text-muted dark:text-[#9999a0]">
          Nessun ruolo disponibile.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-y-2">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                <th className="px-3 py-1">Nome</th>
                <th className="px-3 py-1">Slug</th>
                <th className="px-3 py-1">Colore</th>
                <th className="px-3 py-1">Icona</th>
                <th className="px-3 py-1">Stato</th>
                <th className="px-3 py-1">Sistema</th>
                {canManageRoles && <th className="px-3 py-1 text-right">Azioni</th>}
              </tr>
            </thead>
            <tbody>
              {filteredRoles.map((role) => (
                <tr key={role.id} className="align-top bg-cream dark:bg-[#1c1c20]">
                  <td className="px-3 py-3 rounded-l-md text-[13px] font-semibold text-ink dark:text-[#f4f4f7]">
                    {role.name}
                  </td>
                  <td className="px-3 py-3 text-[13px] text-muted dark:text-[#9999a0] font-mono">
                    {role.slug}
                  </td>
                  <td className="px-3 py-3 text-[13px] text-muted dark:text-[#9999a0]">
                    {role.color ? (
                      <div className="inline-flex items-center gap-2">
                        <span className="h-4 w-4 rounded-full border border-black/10" style={{ backgroundColor: role.color }} />
                        <span className="font-mono">{role.color}</span>
                      </div>
                    ) : (
                      <span className="opacity-50">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-[13px] text-muted dark:text-[#9999a0]">
                    {role.icon ? <span>{role.icon}</span> : <span className="opacity-50">—</span>}
                  </td>
                  <td className="px-3 py-3">
                    <Badge variant={role.is_active ? "success" : "default"}>
                      {role.is_active ? "Attivo" : "Disattivo"}
                    </Badge>
                  </td>
                  <td className="px-3 py-3">
                    {role.is_system ? <Badge variant="warning">Sistema</Badge> : <span className="text-muted dark:text-[#9999a0]">—</span>}
                  </td>
                  {canManageRoles && (
                    <td className="px-3 py-3 rounded-r-md">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(role)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink transition-colors hover:bg-paper dark:border-[#2a2a2e] dark:text-[#f4f4f7] dark:hover:bg-[#131316]"
                        >
                          <Icon name="pencil" className="w-3.5 h-3.5" />
                          Modifica
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingRole(role)}
                          disabled={role.is_system}
                          className="inline-flex items-center gap-1.5 rounded-md border border-danger/20 bg-danger/5 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-danger transition-colors hover:bg-danger/10 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Icon name="trash" className="w-3.5 h-3.5" />
                          Elimina
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editingRole ? "Modifica ruolo" : "Nuovo ruolo"}
        size="lg"
        footer={(
          <>
            <Button variant="ghost" onClick={closeModal} disabled={saving}>Annulla</Button>
            <Button variant="primary" onClick={handleSave} loading={saving}>Salva</Button>
          </>
        )}
      >
        <div className="flex flex-col gap-4">
          {formError && (
            <div className="rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Nome *" value={form.name} onChange={(e) => updateName(e.target.value)} placeholder="SEO Manager" />
            <Input label="Slug" value={form.slug} onChange={(e) => updateSlug(e.target.value)} placeholder="seo-manager" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[92px_132px] gap-3 items-start">
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

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">Descrizione</label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))}
              rows={3}
              className="w-full rounded-md border border-line bg-paper px-3 py-2.5 text-sm text-ink focus:border-ink focus:outline-none dark:border-[#2a2a2e] dark:bg-[#1c1c20] dark:text-[#f4f4f7]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex items-center gap-2 rounded-md border border-line dark:border-[#2a2a2e] px-3 py-2.5">
              <Checkbox
                checked={form.is_active}
                onChange={(v) => setForm((current) => ({ ...current, is_active: v }))}
              />
              <span className="text-sm font-semibold text-ink dark:text-[#f4f4f7]">Attivo</span>
            </label>
            <label className="flex items-center gap-2 rounded-md border border-line dark:border-[#2a2a2e] px-3 py-2.5">
              <Checkbox
                checked={form.is_system}
                onChange={(v) => setForm((current) => ({ ...current, is_system: v }))}
              />
              <span className="text-sm font-semibold text-ink dark:text-[#f4f4f7]">Ruolo sistema</span>
            </label>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!deletingRole}
        onClose={() => setDeletingRole(null)}
        title="Elimina ruolo"
        description="L'operazione rimuove il ruolo dalla configurazione aziendale."
        size="sm"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setDeletingRole(null)} disabled={deleting}>Annulla</Button>
            <Button variant="danger" onClick={handleDelete} loading={deleting}>Elimina</Button>
          </>
        )}
      >
        <p className="text-sm text-ink dark:text-[#f4f4f7]">
          Confermi l'eliminazione del ruolo <strong>{deletingRole?.name}</strong>?
        </p>
      </Modal>
    </div>
  );
}
