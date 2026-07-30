import { useEffect, useState } from "react";
import {
  createSocialPlatformApi,
  deleteSocialPlatformApi,
  listSocialPlatformsApi,
  updateSocialPlatformApi,
  type CustomSocialPlatform,
} from "../../api/socialPlatforms";
import { BUILTIN_SOCIAL_PLATFORMS, SOCIAL_PLATFORM_LABELS } from "../../api/socialProfiles";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { ColorHexField } from "../../components/ui/ColorHexField";
import { Icon } from "../../components/ui/Icon";
import { Input } from "../../components/ui/Input";
import { Modal } from "../../components/ui/Modal";
import { SocialIcon } from "../../components/social/SocialIcon";
import { useToast } from "../../context/ToastContext";

type PlatformFormState = {
  name: string;
  slug: string;
  color: string;
};

const EMPTY_FORM: PlatformFormState = { name: "", slug: "", color: "" };

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface SocialPlatformsTabProps {
  companyId: number;
  isAdmin: boolean;
}

/** Registro dei TIPI di piattaforma social: le 5 di serie + quelle custom aziendali. */
export function SocialPlatformsTab({ companyId, isAdmin }: SocialPlatformsTabProps) {
  const toast = useToast();
  const [platforms, setPlatforms] = useState<CustomSocialPlatform[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CustomSocialPlatform | null>(null);
  const [deleting, setDeleting] = useState<CustomSocialPlatform | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);
  const [form, setForm] = useState<PlatformFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const refetch = async () => {
    try {
      setError(null);
      setPlatforms(await listSocialPlatformsApi(companyId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel caricamento delle piattaforme");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setIsLoading(true);
    void refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setSlugTouched(false);
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (platform: CustomSocialPlatform) => {
    setEditing(platform);
    setForm({ name: platform.name, slug: platform.slug, color: platform.color ?? "" });
    setSlugTouched(true);
    setFormError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditing(null);
    setFormError(null);
  };

  const updateName = (value: string) => {
    setForm((current) => ({
      ...current,
      name: value,
      slug: slugTouched ? current.slug : slugify(value),
    }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setFormError("Il nome è obbligatorio");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        name: form.name.trim(),
        slug: slugify(form.slug || form.name) || null,
        color: form.color.trim() || null,
      };
      if (editing) {
        await updateSocialPlatformApi(editing.id, payload);
        toast.success("Piattaforma aggiornata");
      } else {
        await createSocialPlatformApi({ company_id: companyId, ...payload });
        toast.success("Piattaforma creata");
      }
      setModalOpen(false);
      setEditing(null);
      await refetch();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setRemoving(true);
    try {
      await deleteSocialPlatformApi(deleting.id);
      toast.success("Piattaforma eliminata");
      setDeleting(null);
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nell'eliminazione");
    } finally {
      setRemoving(false);
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
            Piattaforme social
          </h2>
          <p className="font-body text-[13px] text-muted dark:text-[#9999a0]">
            I tipi di piattaforma disponibili per i profili social: le 5 di serie hanno il logo
            ufficiale, quelle custom un badge con iniziale e colore.
          </p>
        </div>

        {isAdmin && (
          <Button
            variant="primary"
            onClick={openCreate}
            leftIcon={<Icon name="plus" className="w-3.5 h-3.5" />}
          >
            Nuova piattaforma
          </Button>
        )}
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
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-y-2">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                <th className="px-3 py-1">Piattaforma</th>
                <th className="px-3 py-1">Slug</th>
                <th className="px-3 py-1">Tipo</th>
                {isAdmin && <th className="px-3 py-1 text-right">Azioni</th>}
              </tr>
            </thead>
            <tbody>
              {BUILTIN_SOCIAL_PLATFORMS.map((slug) => (
                <tr key={slug} className="align-top bg-cream/60 dark:bg-[#18181c]">
                  <td className="px-3 py-3 rounded-l-md">
                    <div className="flex items-center gap-2.5">
                      <SocialIcon platform={slug} className="h-7 w-7" />
                      <span className="text-[13.5px] font-bold text-ink dark:text-[#f4f4f7]">
                        {SOCIAL_PLATFORM_LABELS[slug]}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-[13px] text-muted dark:text-[#9999a0] font-mono">{slug}</td>
                  <td className="px-3 py-3">
                    <Badge>Di serie</Badge>
                  </td>
                  {isAdmin && <td className="px-3 py-3 rounded-r-md" />}
                </tr>
              ))}
              {platforms.map((platform) => (
                <tr key={platform.id} className="align-top bg-cream dark:bg-[#1c1c20]">
                  <td className="px-3 py-3 rounded-l-md">
                    <div className="flex items-center gap-2.5">
                      <SocialIcon
                        platform={platform.slug}
                        label={platform.name}
                        color={platform.color}
                        className="h-7 w-7"
                      />
                      <span className="text-[13.5px] font-bold text-ink dark:text-[#f4f4f7]">
                        {platform.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-[13px] text-muted dark:text-[#9999a0] font-mono">
                    {platform.slug}
                  </td>
                  <td className="px-3 py-3">
                    <Badge variant="info">Custom</Badge>
                  </td>
                  {isAdmin && (
                    <td className="px-3 py-3 rounded-r-md">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(platform)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink transition-colors hover:bg-paper dark:border-[#2a2a2e] dark:text-[#f4f4f7] dark:hover:bg-[#131316]"
                        >
                          <Icon name="pencil" className="w-3.5 h-3.5" />
                          Modifica
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleting(platform)}
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
        title={editing ? "Modifica piattaforma" : "Nuova piattaforma"}
        description="Nome, slug e colore del badge (l'icona è l'iniziale del nome)."
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

          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_132px] gap-3 items-start">
            <Input
              label="Nome"
              value={form.name}
              onChange={(event) => updateName(event.target.value)}
              placeholder="Threads"
            />
            <div className="w-[132px]">
              <ColorHexField
                label="Colore"
                value={form.color}
                onChange={(value) => setForm((current) => ({ ...current, color: value }))}
              />
            </div>
          </div>

          <Input
            label="Slug"
            value={form.slug}
            onChange={(event) => {
              setSlugTouched(true);
              setForm((current) => ({ ...current, slug: event.target.value }));
            }}
            placeholder="threads"
            hint="Minuscolo, con trattini al posto degli spazi."
          />

          <div className="flex items-center gap-2.5 rounded-md border border-line px-3 py-2.5 dark:border-[#2a2a2e]">
            <SocialIcon
              platform={slugify(form.slug || form.name) || "custom"}
              label={form.name}
              color={form.color.trim() || null}
              className="h-7 w-7"
            />
            <span className="text-[12.5px] text-muted dark:text-[#9999a0]">
              Anteprima del badge nei dropdown e nelle liste.
            </span>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Elimina piattaforma"
        description="Possibile solo se nessun profilo social la sta usando."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)} disabled={removing}>
              Annulla
            </Button>
            <Button variant="danger" onClick={handleDelete} loading={removing}>
              Elimina
            </Button>
          </>
        }
      >
        <p className="font-body text-sm text-ink dark:text-[#f4f4f7]">
          Sei sicuro di voler eliminare <strong>{deleting?.name}</strong>?
        </p>
      </Modal>
    </div>
  );
}
