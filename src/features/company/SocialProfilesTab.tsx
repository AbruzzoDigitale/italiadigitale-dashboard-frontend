import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
  verifySocialProfileMetaApi,
  verifySocialProfilesBulkApi,
} from "../../api/socialProfiles";
import {
  createSocialPlatformApi,
  listSocialPlatformsApi,
  type CustomSocialPlatform,
} from "../../api/socialPlatforms";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Checkbox } from "../../components/ui/Checkbox";
import { Icon } from "../../components/ui/Icon";
import { Input } from "../../components/ui/Input";
import { Modal } from "../../components/ui/Modal";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import { Textarea } from "../../components/ui/Textarea";
import { SocialIcon } from "../../components/social/SocialIcon";
import { ProfileFeed } from "../social/ProfileFeed";
import { SegmentedSwitch } from "../../components/ui/SegmentedSwitch";
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

// Opzioni "quanti profili per pagina" (Infinity = tutti).
const PAGE_SIZE_OPTIONS = [12, 24, 48] as const;
const DEFAULT_PAGE_SIZE = 12;

/** Numeri di pagina da mostrare: tutti fino a 7, altrimenti finestra con ellissi. */
function pageNumbers(current: number, total: number): Array<number | "…"> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const wanted = new Set([1, 2, current - 1, current, current + 1, total - 1, total]);
  const list = [...wanted].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: Array<number | "…"> = [];
  list.forEach((p, i) => {
    if (i > 0 && p - (list[i - 1] as number) > 1) out.push("…");
    out.push(p);
  });
  return out;
}

interface SocialProfilesTabProps {
  companyId: number;
  /** Gestione profili (crea/modifica/elimina): aperta a tutti gli utenti. */
  canManage: boolean;
  /** Creazione di NUOVI tipi di piattaforma dal dropdown: solo admin/PM. */
  canCreatePlatforms?: boolean;
  /**
   * Occupa tutta l'altezza disponibile e confina lo scroll alla sola zona dei
   * profili: testata, filtri e paginazione restano fissi, la lista scorre dentro.
   */
  fillHeight?: boolean;
}

export function SocialProfilesTab({ companyId, canManage, canCreatePlatforms = false, fillHeight = false }: SocialProfilesTabProps) {
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
  const [verifyingId, setVerifyingId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkVerifying, setBulkVerifying] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggleExpand = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Filtro/deep-link: /profili-social?only=6,45 mostra SOLO quelle pagine, espanse.
  const [searchParams, setSearchParams] = useSearchParams();
  const onlyIds = useMemo(() => {
    const raw = searchParams.get("only");
    if (!raw) return null;
    const ids = raw.split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
    return ids.length ? new Set(ids) : null;
  }, [searchParams]);
  useEffect(() => {
    if (onlyIds) setExpanded(new Set(onlyIds));
  }, [onlyIds]);
  const clearOnly = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("only");
    setSearchParams(next, { replace: true });
    setExpanded(new Set());
  };
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
      if (onlyIds && !onlyIds.has(p.id)) return false;
      if (platformFilter && p.platform !== platformFilter) return false;
      if (!q) return true;
      return `${p.name} ${p.url} ${p.client_name ?? ""}`.toLowerCase().includes(q);
    });
  }, [search, platformFilter, profiles, onlyIds]);

  // Vista lista/griglia (preferenza ricordata per browser) + paginazione client-side.
  const [view, setView] = useState<"list" | "grid">(() =>
    typeof localStorage !== "undefined" && localStorage.getItem("social_profiles_view") === "grid"
      ? "grid"
      : "list"
  );
  const changeView = (v: "list" | "grid") => {
    setView(v);
    try {
      localStorage.setItem("social_profiles_view", v);
    } catch {
      /* storage non disponibile: ignora */
    }
  };
  // Quanti profili per pagina (0 = tutti), preferenza ricordata per browser.
  const [pageSize, setPageSize] = useState<number>(() => {
    const raw = typeof localStorage !== "undefined" ? Number(localStorage.getItem("social_profiles_page_size")) : NaN;
    return raw === 0 || (PAGE_SIZE_OPTIONS as readonly number[]).includes(raw) ? raw : DEFAULT_PAGE_SIZE;
  });
  const changePageSize = (size: number) => {
    setPageSize(size);
    setPage(1);
    try {
      localStorage.setItem("social_profiles_page_size", String(size));
    } catch {
      /* storage non disponibile: ignora */
    }
  };
  const [page, setPage] = useState(1);
  useEffect(() => {
    setPage(1);
  }, [search, platformFilter, companyId]);
  const effectiveSize = pageSize === 0 ? Math.max(1, filteredProfiles.length) : pageSize;
  const totalPages = Math.max(1, Math.ceil(filteredProfiles.length / effectiveSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = useMemo(
    () => filteredProfiles.slice((safePage - 1) * effectiveSize, safePage * effectiveSize),
    [filteredProfiles, safePage, effectiveSize]
  );

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

  const isMetaPlatform = (p: SocialProfile) => p.platform === "instagram" || p.platform === "facebook";

  const handleVerify = async (profile: SocialProfile) => {
    setVerifyingId(profile.id);
    try {
      const updated = await verifySocialProfileMetaApi(profile.id);
      setProfiles((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      if (updated.meta_verified_at) toast.success("Profilo raggiungibile via API Meta");
      else toast.error(updated.meta_verify_error ?? "Profilo non raggiungibile");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore durante la verifica");
    } finally {
      setVerifyingId(null);
    }
  };

  const copyId = (id: string) => {
    navigator.clipboard
      ?.writeText(id)
      .then(() => toast.success("ID copiato"))
      .catch(() => {});
  };

  /** Colonna "Verifica API": badge stato animato + id copiabile + bottone (solo IG/FB). */
  const renderVerify = (profile: SocialProfile) => {
    if (!isMetaPlatform(profile)) {
      return <span className="text-muted dark:text-[#9999a0] opacity-50">—</span>;
    }
    const verified = !!profile.meta_verified_at;
    const loading = verifyingId === profile.id;
    // ID risolto: per IG l'account business, per FB la pagina.
    const resolvedId =
      profile.platform === "instagram" ? profile.meta_ig_business_id : profile.meta_page_id;
    return (
      <div className="flex flex-wrap items-center gap-2">
        {verified ? (
          <span
            // key sul timestamp: rilancia l'animazione a ogni nuova verifica.
            key={profile.meta_verified_at ?? "v"}
            className="sp-verified-pop inline-flex items-center gap-1.5 rounded-pill border border-success/20 bg-success/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-success"
          >
            <span className="sp-verified-ring inline-flex h-4 w-4 items-center justify-center rounded-full bg-success/15">
              <svg viewBox="0 0 10 8" fill="none" className="h-2.5 w-2.5 text-success" aria-hidden="true">
                <path
                  className="sp-check-draw"
                  d="M1 4l2.5 2.5L9 1"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            Verificato
          </span>
        ) : (
          <span title={profile.meta_verify_error ?? undefined}>
            <Badge variant="warning">Da verificare</Badge>
          </span>
        )}
        {verified && resolvedId && (
          <button
            type="button"
            onClick={() => copyId(resolvedId)}
            title="Copia ID"
            className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-0.5 font-mono text-[11px] text-muted transition-colors hover:bg-cream hover:text-ink dark:border-[#2a2a2e] dark:text-[#9999a0] dark:hover:bg-[#1c1c20] dark:hover:text-[#f4f4f7]"
          >
            <span className="max-w-[130px] truncate">{resolvedId}</span>
            <Icon name="copy" className="h-3 w-3 flex-none opacity-60" />
          </button>
        )}
        <button
          type="button"
          onClick={() => handleVerify(profile)}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink transition-colors hover:bg-cream disabled:opacity-50 dark:border-[#2a2a2e] dark:text-[#f4f4f7] dark:hover:bg-[#1c1c20]"
        >
          <Icon name="refresh-cw" className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Verifica…" : verified ? "Verifica di nuovo" : "Verifica"}
        </button>
      </div>
    );
  };

  // ── Selezione multipla + verifica in bulk ─────────────────────────────────
  const toggleSelect = (id: number) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const clearSelection = () => setSelectedIds(new Set());
  const selectablePageItems = pageItems.filter(isMetaPlatform);
  const allPageSelected =
    selectablePageItems.length > 0 && selectablePageItems.every((p) => selectedIds.has(p.id));
  const toggleSelectAllPage = () =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) selectablePageItems.forEach((p) => next.delete(p.id));
      else selectablePageItems.forEach((p) => next.add(p.id));
      return next;
    });

  const handleBulkVerify = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setBulkVerifying(true);
    try {
      const updated = await verifySocialProfilesBulkApi(ids);
      const map = new Map(updated.map((p) => [p.id, p]));
      setProfiles((prev) => prev.map((p) => map.get(p.id) ?? p));
      const okCount = updated.filter((p) => p.meta_verified_at).length;
      const koCount = updated.length - okCount;
      toast.success(`Verifica completata: ${okCount} raggiungibili, ${koCount} da verificare`);
      clearSelection();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nella verifica in blocco");
    } finally {
      setBulkVerifying(false);
    }
  };

  return (
    <div
      className={`bg-paper dark:bg-[#131316] rounded-lg border border-line dark:border-[#2a2a2e] p-6 ${
        fillHeight ? "flex flex-col h-full min-h-0" : ""
      }`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-5 flex-none">
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

      <div className="flex flex-wrap items-center gap-3 mb-5 flex-none">
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
        <div className="ml-auto">
          <SegmentedSwitch
            value={view}
            onChange={changeView}
            ariaLabel="Vista profili social"
            options={[
              { value: "list", label: <><Icon name="list" className="w-3.5 h-3.5" />Lista</> },
              { value: "grid", label: <><Icon name="grid" className="w-3.5 h-3.5" />Griglia</> },
            ]}
          />
        </div>
      </div>

      {onlyIds && (
        <div className="mb-4 flex flex-none items-center gap-3 rounded-md border border-info/25 bg-info/5 px-3 py-2 text-sm">
          <Icon name="eye" className="h-4 w-4 text-info" />
          <span className="text-ink dark:text-[#f4f4f7]">
            Filtro attivo: {filteredProfiles.length} {filteredProfiles.length === 1 ? "pagina" : "pagine"} selezionate.
          </span>
          <button
            type="button"
            onClick={clearOnly}
            className="ml-auto text-[12px] font-semibold text-brand-magenta hover:underline"
          >
            Mostra tutte
          </button>
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-brand-magenta/30 bg-brand-magenta/5 px-3 py-2 flex-none">
          <span className="text-[13px] font-semibold text-ink dark:text-[#f4f4f7]">
            {selectedIds.size} selezionati
          </span>
          <Button
            variant="primary"
            onClick={handleBulkVerify}
            loading={bulkVerifying}
            leftIcon={<Icon name="refresh-cw" className="w-3.5 h-3.5" />}
          >
            Verifica selezionati
          </Button>
          <button
            type="button"
            onClick={clearSelection}
            className="text-[12px] font-semibold text-muted hover:text-ink dark:text-[#9999a0] dark:hover:text-[#f4f4f7]"
          >
            Deseleziona
          </button>
        </div>
      )}

      {error && (
        <div className="mb-4 flex-none rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <div className={fillHeight ? "flex-1 min-h-0 overflow-y-auto -mr-3 pr-3" : ""}>
      {isLoading ? (
        view === "grid" ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={index}
                className="sp-pop-in sp-skeleton h-40 rounded-xl border border-line dark:border-[#2a2a2e]"
                style={{ animationDelay: `${index * 45}ms` }}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="sp-pop-in sp-skeleton h-14 rounded-md border border-line dark:border-[#2a2a2e]"
                style={{ animationDelay: `${index * 45}ms` }}
              />
            ))}
          </div>
        )
      ) : filteredProfiles.length === 0 ? (
        <div className="rounded-md border border-dashed border-line dark:border-[#2a2a2e] px-4 py-8 text-sm text-muted dark:text-[#9999a0]">
          {canManage ? "Nessun profilo social: crea il primo." : "Nessun profilo social disponibile."}
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {pageItems.map((profile, index) => (
            <div
              key={profile.id}
              className="sp-pop-in flex flex-col gap-3 rounded-xl border border-line bg-cream p-4 transition-colors hover:border-brand-magenta/50 dark:border-[#2a2a2e] dark:bg-[#1c1c20]"
              style={{ animationDelay: `${Math.min(index, 11) * 40}ms` }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  {isMetaPlatform(profile) && (
                    <Checkbox
                      checked={selectedIds.has(profile.id)}
                      onChange={() => toggleSelect(profile.id)}
                    />
                  )}
                  <SocialIcon
                    platform={profile.platform}
                    label={profile.platform_label}
                    color={profile.platform_color}
                    className="h-9 w-9"
                  />
                  <div className="min-w-0">
                    <p
                      className="truncate text-[13.5px] font-bold text-ink dark:text-[#f4f4f7]"
                      title={socialProfileLabel(profile)}
                    >
                      {socialProfileLabel(profile)}
                    </p>
                    <p className="truncate text-[11px] text-muted dark:text-[#9999a0]">{profile.platform_label}</p>
                  </div>
                </div>
                {canManage && (
                  <div className="flex flex-none items-center gap-1">
                    <button
                      type="button"
                      title="Modifica"
                      aria-label="Modifica"
                      onClick={() => openEdit(profile)}
                      className="inline-grid h-7 w-7 place-items-center rounded-md border border-line text-ink transition-colors hover:bg-paper dark:border-[#2a2a2e] dark:text-[#f4f4f7] dark:hover:bg-[#131316]"
                    >
                      <Icon name="pencil" className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Elimina"
                      aria-label="Elimina"
                      onClick={() => setDeletingProfile(profile)}
                      className="inline-grid h-7 w-7 place-items-center rounded-md border border-danger/20 bg-danger/5 text-danger transition-colors hover:bg-danger/10"
                    >
                      <Icon name="trash" className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {profile.client_name && (
                <Badge variant="info" className="max-w-full self-start">
                  <span className="min-w-0 truncate" title={profile.client_name}>
                    {profile.client_name}
                  </span>
                </Badge>
              )}

              <a
                href={profile.url}
                target="_blank"
                rel="noreferrer"
                title={profile.url}
                className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-brand-magenta hover:underline"
              >
                <Icon name="link" className="h-3.5 w-3.5 flex-none" />
                <span className="min-w-0 flex-1 truncate">{profile.url.replace(/^https?:\/\/(www\.)?/, "")}</span>
              </a>

              {profile.notes && (
                <p className="line-clamp-2 break-words text-[12px] text-muted dark:text-[#9999a0]" title={profile.notes}>
                  {profile.notes}
                </p>
              )}

              {isMetaPlatform(profile) && (
                <div className="mt-auto border-t border-line/60 pt-3 dark:border-[#2a2a2e]">
                  {renderVerify(profile)}
                  <button
                    type="button"
                    onClick={() => toggleExpand(profile.id)}
                    className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-magenta hover:underline"
                  >
                    <Icon
                      name="chevron-right"
                      className={`h-3 w-3 transition-transform ${expanded.has(profile.id) ? "rotate-90" : ""}`}
                    />
                    {expanded.has(profile.id) ? "Nascondi feed" : "Ultimi post e storie"}
                  </button>
                  {expanded.has(profile.id) && (
                    <div className="mt-3">
                      <ProfileFeed
                        profileId={profile.id}
                        platform={profile.platform}
                        name={socialProfileLabel(profile)}
                        url={profile.url}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto overflow-y-hidden">
          {/* table-fixed: le colonne hanno larghezza stabile e gli URL/nomi lunghi
              vengono troncati con ellissi invece di sfondare sulle celle vicine. */}
          <table className="w-full min-w-[1120px] table-fixed border-separate border-spacing-y-2">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                <th className="px-3 py-1 w-[40px]">
                  <Checkbox
                    checked={allPageSelected}
                    onChange={toggleSelectAllPage}
                    className="align-middle"
                  />
                </th>
                <th className="px-3 py-1 w-[24%]">Profilo</th>
                <th className="px-3 py-1 w-[15%]">Cliente</th>
                <th className="px-3 py-1 w-[22%]">URL</th>
                <th className="px-3 py-1">Note</th>
                <th className="px-3 py-1 w-[210px]">Verifica API</th>
                {canManage && <th className="px-3 py-1 w-[205px] text-right">Azioni</th>}
              </tr>
            </thead>
            <tbody>
              {pageItems.map((profile, index) => (
                <Fragment key={profile.id}>
                <tr
                  className="sp-pop-in align-top bg-cream dark:bg-[#1c1c20]"
                  style={{ animationDelay: `${Math.min(index, 11) * 30}ms` }}
                >
                  <td className="px-3 py-3 rounded-l-md align-middle">
                    {isMetaPlatform(profile) && (
                      <Checkbox
                        checked={selectedIds.has(profile.id)}
                        onChange={() => toggleSelect(profile.id)}
                      />
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <SocialIcon
                        platform={profile.platform}
                        label={profile.platform_label}
                        color={profile.platform_color}
                        className="h-8 w-8"
                      />
                      <div className="min-w-0">
                        <p
                          className="truncate text-[13.5px] font-bold text-ink dark:text-[#f4f4f7]"
                          title={socialProfileLabel(profile)}
                        >
                          {socialProfileLabel(profile)}
                        </p>
                        <p className="truncate text-[11px] text-muted dark:text-[#9999a0]">
                          {profile.platform_label}
                        </p>
                      </div>
                    </div>
                    {isMetaPlatform(profile) && (
                      <button
                        type="button"
                        onClick={() => toggleExpand(profile.id)}
                        className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-magenta hover:underline"
                      >
                        <Icon
                          name="chevron-right"
                          className={`h-3 w-3 transition-transform ${expanded.has(profile.id) ? "rotate-90" : ""}`}
                        />
                        {expanded.has(profile.id) ? "Nascondi feed" : "Ultimi post e storie"}
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-3 text-[13px]">
                    {profile.client_name ? (
                      <Badge variant="info" className="max-w-full">
                        <span className="min-w-0 truncate" title={profile.client_name}>
                          {profile.client_name}
                        </span>
                      </Badge>
                    ) : (
                      <span className="text-muted dark:text-[#9999a0] opacity-60">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-[13px]">
                    <a
                      href={profile.url}
                      target="_blank"
                      rel="noreferrer"
                      title={profile.url}
                      className="flex min-w-0 items-center gap-1.5 text-brand-magenta hover:underline"
                    >
                      <Icon name="link" className="w-3.5 h-3.5 flex-none" />
                      <span className="min-w-0 flex-1 truncate">
                        {profile.url.replace(/^https?:\/\/(www\.)?/, "")}
                      </span>
                    </a>
                  </td>
                  <td className="px-3 py-3 text-[12.5px] text-muted dark:text-[#9999a0]">
                    <span className="line-clamp-2 break-words" title={profile.notes ?? undefined}>
                      {profile.notes || "—"}
                    </span>
                  </td>
                  <td className={`px-3 py-3 ${canManage ? "" : "rounded-r-md"}`}>
                    {renderVerify(profile)}
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
                {expanded.has(profile.id) && (
                  <tr>
                    <td colSpan={canManage ? 7 : 6} className="px-3 pb-4">
                      <ProfileFeed
                        profileId={profile.id}
                        platform={profile.platform}
                        name={socialProfileLabel(profile)}
                        url={profile.url}
                      />
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      </div>

      {!isLoading && filteredProfiles.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 flex-none">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[12px] text-muted dark:text-[#9999a0]">
              {filteredProfiles.length} {filteredProfiles.length === 1 ? "profilo" : "profili"}
              {totalPages > 1 && ` · pagina ${safePage} di ${totalPages}`}
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                Mostra
              </span>
              {[...PAGE_SIZE_OPTIONS, 0].map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => changePageSize(size)}
                  className={`inline-grid h-7 min-w-8 place-items-center rounded-md border px-1.5 text-[11.5px] font-semibold transition-colors ${
                    pageSize === size
                      ? "border-ink bg-ink text-paper dark:border-[#f4f4f7] dark:bg-[#f4f4f7] dark:text-ink"
                      : "border-line text-muted hover:bg-cream hover:text-ink dark:border-[#2a2a2e] dark:text-[#9999a0] dark:hover:bg-[#1c1c20] dark:hover:text-[#f4f4f7]"
                  }`}
                >
                  {size === 0 ? "Tutti" : size}
                </button>
              ))}
            </div>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Pagina precedente"
                disabled={safePage === 1}
                onClick={() => setPage(safePage - 1)}
                className="inline-grid h-8 w-8 place-items-center rounded-md border border-line text-ink transition-colors hover:bg-cream disabled:opacity-40 disabled:hover:bg-transparent dark:border-[#2a2a2e] dark:text-[#f4f4f7] dark:hover:bg-[#1c1c20]"
              >
                <Icon name="chevron-right" className="h-3.5 w-3.5 rotate-180" />
              </button>
              {pageNumbers(safePage, totalPages).map((p, i) =>
                p === "…" ? (
                  <span key={`gap-${i}`} className="px-1 text-[12px] text-muted dark:text-[#9999a0]">
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPage(p)}
                    className={`inline-grid h-8 min-w-8 place-items-center rounded-md border px-1.5 text-[12px] font-semibold transition-colors ${
                      p === safePage
                        ? "border-ink bg-ink text-paper dark:border-[#f4f4f7] dark:bg-[#f4f4f7] dark:text-ink"
                        : "border-line text-ink hover:bg-cream dark:border-[#2a2a2e] dark:text-[#f4f4f7] dark:hover:bg-[#1c1c20]"
                    }`}
                  >
                    {p}
                  </button>
                )
              )}
              <button
                type="button"
                aria-label="Pagina successiva"
                disabled={safePage === totalPages}
                onClick={() => setPage(safePage + 1)}
                className="inline-grid h-8 w-8 place-items-center rounded-md border border-line text-ink transition-colors hover:bg-cream disabled:opacity-40 disabled:hover:bg-transparent dark:border-[#2a2a2e] dark:text-[#f4f4f7] dark:hover:bg-[#1c1c20]"
              >
                <Icon name="chevron-right" className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
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
