import { useCallback, useEffect, useMemo, useState } from "react";
import { listClientOptionsApi } from "../../api/clients";
import {
  createSocialProfileApi,
  deleteSocialProfileApi,
  listSocialProfilesApi,
  BUILTIN_SOCIAL_PLATFORMS,
  SOCIAL_PLATFORM_LABELS,
  socialProfileLabel,
  type SocialPlatform,
  type SocialProfile,
  updateSocialProfileApi,
} from "../../api/socialProfiles";
import {
  createSocialPlatformApi,
  listSocialPlatformsApi,
  type CustomSocialPlatform,
} from "../../api/socialPlatforms";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { Input } from "../../components/ui/Input";
import { Modal } from "../../components/ui/Modal";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import { Textarea } from "../../components/ui/Textarea";
import { SocialIcon } from "../../components/social/SocialIcon";
import { useToast } from "../../context/ToastContext";

type SocialProfileFormState = {
  platform: SocialPlatform;
  name: string;
  url: string;
  client_id: string; // "" = nessun cliente
  notes: string;
};

const EMPTY_FORM: SocialProfileFormState = {
  platform: "instagram",
  name: "",
  url: "",
  client_id: "",
  notes: "",
};

interface SocialProfilesTabProps {
  companyId: number;
  /** Gestione profili (crea/modifica/elimina): aperta a tutti gli utenti. */
  canManage: boolean;
  /** Creazione di NUOVI tipi di piattaforma dal dropdown: solo admin/PM. */
  canCreatePlatforms?: boolean;
}

export function SocialProfilesTab({ companyId, canManage, canCreatePlatforms = false }: SocialProfilesTabProps) {
  const toast = useToast();
  const [profiles, setProfiles] = useState<SocialProfile[]>([]);
  const [clients, setClients] = useState<Array<{ id: number; name: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState<string>("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<SocialProfile | null>(null);
  const [deletingProfile, setDeletingProfile] = useState<SocialProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState<SocialProfileFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    try {
      setError(null);
      const rows = await listSocialProfilesApi({ companyId });
      setProfiles(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel caricamento dei profili social");
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    setIsLoading(true);
    void refetch();
  }, [refetch]);

  useEffect(() => {
    listClientOptionsApi(companyId)
      .then(setClients)
      .catch(() => setClients([]));
  }, [companyId]);

  // Piattaforme custom aziendali (oltre alle 5 di serie).
  const [customPlatforms, setCustomPlatforms] = useState<CustomSocialPlatform[]>([]);
  const [creatingPlatform, setCreatingPlatform] = useState(false);
  useEffect(() => {
    listSocialPlatformsApi(companyId)
      .then(setCustomPlatforms)
      .catch(() => setCustomPlatforms([]));
  }, [companyId]);

  const handleCreatePlatform = async (name: string) => {
    setCreatingPlatform(true);
    try {
      const created = await createSocialPlatformApi({ company_id: companyId, name });
      setCustomPlatforms((prev) => (prev.some((p) => p.id === created.id) ? prev : [...prev, created]));
      setForm((current) => ({ ...current, platform: created.slug }));
    } finally {
      setCreatingPlatform(false);
    }
  };

  const clientOptions = useMemo(
    () => [
      { value: "", label: "Nessun cliente" },
      ...clients.map((c) => ({ value: String(c.id), label: c.name })),
    ],
    [clients]
  );

  const platformOptions = useMemo(
    () => [
      ...BUILTIN_SOCIAL_PLATFORMS.map((p) => ({
        value: p as string,
        label: SOCIAL_PLATFORM_LABELS[p],
        icon: <SocialIcon platform={p} className="h-5 w-5" />,
      })),
      ...customPlatforms.map((p) => ({
        value: p.slug,
        label: p.name,
        icon: <SocialIcon platform={p.slug} label={p.name} color={p.color} className="h-5 w-5" />,
      })),
    ],
    [customPlatforms]
  );

  const filteredProfiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return profiles.filter((p) => {
      if (platformFilter && p.platform !== platformFilter) return false;
      if (!q) return true;
      return `${p.name} ${p.url} ${p.client_name ?? ""}`.toLowerCase().includes(q);
    });
  }, [search, platformFilter, profiles]);

  const openCreate = () => {
    setEditingProfile(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (profile: SocialProfile) => {
    setEditingProfile(profile);
    setForm({
      platform: profile.platform,
      name: profile.name,
      url: profile.url,
      client_id: profile.client_id != null ? String(profile.client_id) : "",
      notes: profile.notes ?? "",
    });
    setFormError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditingProfile(null);
    setFormError(null);
  };

  const handleSave = async () => {
    if (!form.url.trim()) {
      setFormError("L'URL del profilo è obbligatoria");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const common = {
        platform: form.platform,
        name: form.name.trim(),
        url: form.url.trim(),
        client_id: form.client_id ? Number(form.client_id) : null,
        notes: form.notes.trim() || null,
      };
      if (editingProfile) {
        await updateSocialProfileApi(editingProfile.id, common);
        toast.success("Profilo social aggiornato");
      } else {
        await createSocialProfileApi({ company_id: companyId, ...common });
        toast.success("Profilo social creato");
      }
      setModalOpen(false);
      setEditingProfile(null);
      await refetch();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingProfile) return;
    setDeleting(true);
    try {
      await deleteSocialProfileApi(deletingProfile.id);
      toast.success("Profilo social eliminato");
      setDeletingProfile(null);
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nell'eliminazione");
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
            Profili social
          </h2>
          <p className="font-body text-[13px] text-muted dark:text-[#9999a0]">
            Tutti i profili social gestiti dall'azienda. Collegali ai clienti per selezionarli
            nelle task e nei contratti.
          </p>
        </div>

        {canManage && (
          <Button
            variant="primary"
            onClick={openCreate}
            leftIcon={<Icon name="plus" className="w-3.5 h-3.5" />}
          >
            Nuovo profilo
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-sm min-w-[220px]">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cerca per nome, URL o cliente..."
            className="pl-9"
          />
        </div>
        <div className="w-44">
          <SearchableSelect
            value={platformFilter}
            onChange={setPlatformFilter}
            options={[
              { value: "", label: "Tutti i social", icon: <Icon name="globe" className="h-4 w-4 opacity-60" /> },
              ...platformOptions,
            ]}
            placeholder="Piattaforma"
            menuLayer="portal"
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
      ) : filteredProfiles.length === 0 ? (
        <div className="rounded-md border border-dashed border-line dark:border-[#2a2a2e] px-4 py-8 text-sm text-muted dark:text-[#9999a0]">
          {canManage ? "Nessun profilo social: crea il primo." : "Nessun profilo social disponibile."}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-y-2">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                <th className="px-3 py-1">Profilo</th>
                <th className="px-3 py-1">Cliente</th>
                <th className="px-3 py-1">URL</th>
                <th className="px-3 py-1">Note</th>
                {canManage && <th className="px-3 py-1 text-right">Azioni</th>}
              </tr>
            </thead>
            <tbody>
              {filteredProfiles.map((profile) => (
                <tr key={profile.id} className="align-top bg-cream dark:bg-[#1c1c20]">
                  <td className="px-3 py-3 rounded-l-md">
                    <div className="flex items-center gap-2.5">
                      <SocialIcon
                        platform={profile.platform}
                        label={profile.platform_label}
                        color={profile.platform_color}
                        className="h-8 w-8"
                      />
                      <div>
                        <p className="text-[13.5px] font-bold text-ink dark:text-[#f4f4f7]">
                          {socialProfileLabel(profile)}
                        </p>
                        <p className="text-[11px] text-muted dark:text-[#9999a0]">
                          {profile.platform_label}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-[13px]">
                    {profile.client_name ? (
                      <Badge variant="info">{profile.client_name}</Badge>
                    ) : (
                      <span className="text-muted dark:text-[#9999a0] opacity-60">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-[13px] max-w-[260px]">
                    <a
                      href={profile.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-brand-magenta hover:underline break-all"
                    >
                      <Icon name="link" className="w-3.5 h-3.5 flex-none" />
                      <span className="truncate">{profile.url.replace(/^https?:\/\/(www\.)?/, "")}</span>
                    </a>
                  </td>
                  <td className="px-3 py-3 text-[12.5px] text-muted dark:text-[#9999a0] max-w-[220px]">
                    <span className="line-clamp-2">{profile.notes || "—"}</span>
                  </td>
                  {canManage && (
                    <td className="px-3 py-3 rounded-r-md">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(profile)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink transition-colors hover:bg-paper dark:border-[#2a2a2e] dark:text-[#f4f4f7] dark:hover:bg-[#131316]"
                        >
                          <Icon name="pencil" className="w-3.5 h-3.5" />
                          Modifica
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingProfile(profile)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-danger/20 bg-danger/5 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-danger transition-colors hover:bg-danger/10"
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
        title={editingProfile ? "Modifica profilo social" : "Nuovo profilo social"}
        description="Piattaforma, URL e cliente collegato: l'icona è automatica in base al social."
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                Piattaforma
              </label>
              <SearchableSelect
                value={form.platform}
                onChange={(value) =>
                  setForm((current) => ({ ...current, platform: (value || "instagram") as SocialPlatform }))
                }
                options={platformOptions}
                placeholder="Piattaforma"
                menuLayer="portal"
                onCreateOption={canCreatePlatforms ? handleCreatePlatform : undefined}
                createLoading={creatingPlatform}
                createActionLabel="Crea piattaforma"
              />
            </div>
            <Input
              label="Nome profilo"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="@nomeprofilo o nome pagina"
            />
          </div>

          <Input
            label="URL"
            value={form.url}
            onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))}
            placeholder="https://www.instagram.com/nomeprofilo"
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
              Cliente collegato
            </label>
            <SearchableSelect
              value={form.client_id}
              onChange={(value) => setForm((current) => ({ ...current, client_id: value }))}
              options={clientOptions}
              placeholder="Nessun cliente"
              menuLayer="portal"
            />
            <p className="text-[11.5px] text-muted dark:text-[#9999a0]">
              Il profilo diventa selezionabile nelle task e nei contratti di questo cliente.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
              Note
            </label>
            <Textarea
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              rows={3}
              placeholder="Credenziali su NAS, referente lato cliente, ..."
              className="w-full rounded-md border border-line bg-paper px-3 py-2.5 text-sm font-body text-ink outline-none transition-colors focus:border-ink dark:border-line-dark dark:bg-ink-soft dark:text-paper dark:focus:border-paper"
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={!!deletingProfile}
        onClose={() => setDeletingProfile(null)}
        title="Elimina profilo social"
        description="Il profilo verrà scollegato anche da task e contratti. L'operazione non è reversibile."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeletingProfile(null)} disabled={deleting}>
              Annulla
            </Button>
            <Button variant="danger" onClick={handleDelete} loading={deleting}>
              Elimina
            </Button>
          </>
        }
      >
        <p className="font-body text-sm text-ink dark:text-[#f4f4f7]">
          Sei sicuro di voler eliminare{" "}
          <strong>{deletingProfile ? socialProfileLabel(deletingProfile) : ""}</strong>?
        </p>
      </Modal>
    </div>
  );
}
