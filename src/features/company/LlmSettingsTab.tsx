import { useMemo, useState } from "react";
import {
  deleteCompanyLlmOperationBindingApi,
  deleteCompanyLlmProfileApi,
  isValidLlmCode,
  normalizeLlmSlug,
  upsertCompanyLlmOperationBindingApi,
  upsertCompanyLlmProfileApi,
  type LlmProfile,
} from "../../api/llm";
import { useCompanyLlmBindings } from "../../hooks/useCompanyLlmBindings";
import { useCompanyLlmProfiles } from "../../hooks/useCompanyLlmProfiles";
import { useToast } from "../../context/ToastContext";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Checkbox } from "../../components/ui/Checkbox";
import { Icon } from "../../components/ui/Icon";
import { Input } from "../../components/ui/Input";
import { Modal } from "../../components/ui/Modal";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import { Spinner } from "../../components/ui/Spinner";

interface LlmSettingsTabProps {
  companyId: number;
  isAdmin: boolean;
}

interface ProfileFormState {
  slug: string;
  provider: string;
  model_name: string;
  api_base_url: string;
  api_key: string;
  update_api_key: boolean;
  default_params_text: string;
  is_active: boolean;
}

const EMPTY_PROFILE_FORM: ProfileFormState = {
  slug: "",
  provider: "",
  model_name: "",
  api_base_url: "",
  api_key: "",
  update_api_key: false,
  default_params_text: "",
  is_active: true,
};

function mapErrorMessage(message: string): string {
  if (message.includes("[403]")) return "Non autorizzato";
  if (message.includes("[404]")) return "Elemento non trovato";
  if (message.includes("[400]")) return "Campi non validi";
  if (message.includes("[422]")) return message.replace(/^\[422\]\s*/, "");
  return message;
}

function toProfileForm(profile: LlmProfile): ProfileFormState {
  return {
    slug: profile.slug,
    provider: profile.provider,
    model_name: profile.model_name,
    api_base_url: profile.api_base_url ?? "",
    api_key: "",
    update_api_key: false,
    default_params_text: profile.default_params ? JSON.stringify(profile.default_params, null, 2) : "",
    is_active: profile.is_active,
  };
}

export function LlmSettingsTab({ companyId, isAdmin }: LlmSettingsTabProps) {
  const toast = useToast();
  const [showSecretValues, setShowSecretValues] = useState(false);
  const {
    profiles,
    isLoading: profilesLoading,
    error: profilesError,
    refetch: refetchProfiles,
  } = useCompanyLlmProfiles(companyId, {
    includeSecretValues: isAdmin && showSecretValues,
  });

  const {
    bindings,
    isLoading: bindingsLoading,
    error: bindingsError,
    refetch: refetchBindings,
  } = useCompanyLlmBindings(companyId);

  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [editingProfileSlug, setEditingProfileSlug] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState<ProfileFormState>(EMPTY_PROFILE_FORM);
  const [savingProfile, setSavingProfile] = useState(false);
  const [deletingProfileSlug, setDeletingProfileSlug] = useState<string | null>(null);

  const [bindingOperationCode, setBindingOperationCode] = useState("");
  const [bindingProfileSlug, setBindingProfileSlug] = useState("");
  const [savingBindingCode, setSavingBindingCode] = useState<string | null>(null);
  const [deletingBindingCode, setDeletingBindingCode] = useState<string | null>(null);
  const [bindingDrafts, setBindingDrafts] = useState<Record<string, string>>({});

  if (!isAdmin) {
    return (
      <div className="bg-paper dark:bg-[#131316] rounded-lg border border-line dark:border-[#2a2a2e] p-6">
        <div className="rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
          Non autorizzato
        </div>
      </div>
    );
  }

  const profileOptions = useMemo(
    () => profiles
      .filter((item) => item.is_active)
      .map((item) => ({ slug: item.slug, label: `${item.slug} · ${item.provider}/${item.model_name}` })),
    [profiles]
  );

  const refreshAll = async () => {
    refetchProfiles();
    refetchBindings();
  };

  const openCreateProfile = () => {
    setEditingProfileSlug(null);
    setProfileForm(EMPTY_PROFILE_FORM);
    setProfileModalOpen(true);
  };

  const openEditProfile = (profile: LlmProfile) => {
    setEditingProfileSlug(profile.slug);
    setProfileForm(toProfileForm(profile));
    setProfileModalOpen(true);
  };

  const validateProfileForm = (): string | null => {
    const slug = normalizeLlmSlug(profileForm.slug);
    if (!slug || !isValidLlmCode(slug)) {
      return "Slug non valido: usa solo lettere minuscole, numeri e trattino";
    }
    if (!profileForm.provider.trim()) return "Provider obbligatorio";
    if (!profileForm.model_name.trim()) return "Modello obbligatorio";

    if (profileForm.default_params_text.trim()) {
      try {
        const parsed = JSON.parse(profileForm.default_params_text);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          return "default_params deve essere un oggetto JSON valido";
        }
      } catch {
        return "default_params deve essere JSON valido";
      }
    }

    return null;
  };

  const handleSaveProfile = async () => {
    const validation = validateProfileForm();
    if (validation) {
      toast.error(validation);
      return;
    }

    const normalizedSlug = normalizeLlmSlug(profileForm.slug);
    let defaultParams: Record<string, unknown> | null = null;
    if (profileForm.default_params_text.trim()) {
      defaultParams = JSON.parse(profileForm.default_params_text) as Record<string, unknown>;
    }

    setSavingProfile(true);
    try {
      await upsertCompanyLlmProfileApi(companyId, normalizedSlug, {
        provider: profileForm.provider,
        model_name: profileForm.model_name,
        api_base_url: profileForm.api_base_url || null,
        ...(profileForm.update_api_key ? { api_key: profileForm.api_key || null } : {}),
        default_params: defaultParams,
        is_active: profileForm.is_active,
      });
      await refreshAll();
      setProfileModalOpen(false);
      toast.success(editingProfileSlug ? "Profilo LLM aggiornato" : "Profilo LLM creato");
    } catch (err) {
      const message = err instanceof Error ? mapErrorMessage(err.message) : "Errore salvataggio profilo LLM";
      toast.error(message);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleDeleteProfile = async (slug: string) => {
    setDeletingProfileSlug(slug);
    try {
      await deleteCompanyLlmProfileApi(companyId, slug);
      await refreshAll();
      toast.success("Profilo LLM eliminato");
    } catch (err) {
      const message = err instanceof Error ? mapErrorMessage(err.message) : "Errore eliminazione profilo LLM";
      toast.error(message);
    } finally {
      setDeletingProfileSlug(null);
    }
  };

  const handleQuickToggleProfile = async (profile: LlmProfile) => {
    setSavingProfile(true);
    try {
      await upsertCompanyLlmProfileApi(companyId, profile.slug, {
        provider: profile.provider,
        model_name: profile.model_name,
        api_base_url: profile.api_base_url,
        default_params: profile.default_params,
        is_active: !profile.is_active,
      });
      await refreshAll();
      toast.success(profile.is_active ? "Profilo disattivato" : "Profilo attivato");
    } catch (err) {
      const message = err instanceof Error ? mapErrorMessage(err.message) : "Errore aggiornamento stato profilo";
      toast.error(message);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleCreateBinding = async () => {
    const operationCode = normalizeLlmSlug(bindingOperationCode);
    if (!operationCode || !isValidLlmCode(operationCode)) {
      toast.error("operation_code non valido: usa solo lettere minuscole, numeri e trattino");
      return;
    }
    if (!bindingProfileSlug) {
      toast.error("Seleziona un profilo LLM");
      return;
    }

    setSavingBindingCode(operationCode);
    try {
      await upsertCompanyLlmOperationBindingApi(companyId, operationCode, {
        profile_slug: bindingProfileSlug,
      });
      refetchBindings();
      setBindingOperationCode("");
      setBindingProfileSlug("");
      toast.success("Binding salvato");
    } catch (err) {
      const message = err instanceof Error ? mapErrorMessage(err.message) : "Errore salvataggio binding";
      toast.error(message);
    } finally {
      setSavingBindingCode(null);
    }
  };

  const handleSaveBindingRow = async (operationCode: string) => {
    const selected = bindingDrafts[operationCode] ?? "";
    if (!selected) {
      toast.error("Seleziona un profilo LLM");
      return;
    }

    setSavingBindingCode(operationCode);
    try {
      await upsertCompanyLlmOperationBindingApi(companyId, operationCode, {
        profile_slug: selected,
      });
      refetchBindings();
      toast.success("Binding aggiornato");
    } catch (err) {
      const message = err instanceof Error ? mapErrorMessage(err.message) : "Errore aggiornamento binding";
      toast.error(message);
    } finally {
      setSavingBindingCode(null);
    }
  };

  const handleDeleteBinding = async (operationCode: string) => {
    setDeletingBindingCode(operationCode);
    try {
      await deleteCompanyLlmOperationBindingApi(companyId, operationCode);
      refetchBindings();
      toast.success("Binding eliminato");
    } catch (err) {
      const message = err instanceof Error ? mapErrorMessage(err.message) : "Errore eliminazione binding";
      toast.error(message);
    } finally {
      setDeletingBindingCode(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-paper dark:bg-[#131316] rounded-lg border border-line dark:border-[#2a2a2e] p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-5">
          <div>
            <h2 className="font-display font-bold tracking-tight text-ink dark:text-[#f4f4f7] mb-1" style={{ fontSize: "17px" }}>
              Profili LLM
            </h2>
            <p className="font-body text-[13px] text-muted dark:text-[#9999a0]">
              Configura provider, modello, endpoint e parametri default per azienda.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && (
              <button
                type="button"
                onClick={() => setShowSecretValues((current) => !current)}
                className="inline-flex items-center gap-2 rounded-pill border border-line px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink transition-colors hover:bg-cream dark:border-[#2a2a2e] dark:text-[#f4f4f7] dark:hover:bg-[#1c1c20]"
              >
                <Icon name={showSecretValues ? "eye-off" : "eye"} className="w-3.5 h-3.5" />
                {showSecretValues ? "Nascondi segreti" : "Mostra segreti"}
              </button>
            )}

            <Button variant="primary" onClick={openCreateProfile} leftIcon={<Icon name="plus" className="w-3.5 h-3.5" />}>
              Nuovo profilo
            </Button>
          </div>
        </div>

        {profilesError && (
          <div className="mb-4 rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
            {mapErrorMessage(profilesError)}
          </div>
        )}

        {profilesLoading ? (
          <div className="flex items-center justify-center py-10">
            <Spinner size="md" />
          </div>
        ) : profiles.length === 0 ? (
          <div className="rounded-md border border-dashed border-line dark:border-[#2a2a2e] px-4 py-8 text-sm text-muted dark:text-[#9999a0]">
            Nessun profilo LLM configurato.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-2">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                  <th className="px-3 py-1">Slug</th>
                  <th className="px-3 py-1">Provider / Modello</th>
                  <th className="px-3 py-1">Endpoint</th>
                  <th className="px-3 py-1">Chiave API</th>
                  <th className="px-3 py-1">Stato</th>
                  <th className="px-3 py-1 text-right">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((profile) => (
                  <tr key={profile.slug} className="align-top bg-cream dark:bg-[#1c1c20]">
                    <td className="px-3 py-3 rounded-l-md font-mono text-[13px] text-ink dark:text-[#f4f4f7]">
                      {profile.slug}
                    </td>
                    <td className="px-3 py-3 text-[13px] text-muted dark:text-[#9999a0]">
                      <div className="font-semibold text-ink dark:text-[#f4f4f7]">{profile.provider}</div>
                      <div>{profile.model_name}</div>
                    </td>
                    <td className="px-3 py-3 text-[13px] text-muted dark:text-[#9999a0] break-all">
                      {profile.api_base_url ?? "—"}
                    </td>
                    <td className="px-3 py-3 text-[13px] text-muted dark:text-[#9999a0]">
                      {profile.has_api_key ? (
                        <span>{showSecretValues ? (profile.api_key ?? "••••••") : "Chiave configurata"}</span>
                      ) : "Non configurata"}
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant={profile.is_active ? "success" : "default"}>
                        {profile.is_active ? "Attivo" : "Disattivo"}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 rounded-r-md">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEditProfile(profile)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink transition-colors hover:bg-paper dark:border-[#2a2a2e] dark:text-[#f4f4f7] dark:hover:bg-[#131316]"
                        >
                          <Icon name="pencil" className="w-3.5 h-3.5" />
                          Modifica
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleQuickToggleProfile(profile)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink transition-colors hover:bg-paper dark:border-[#2a2a2e] dark:text-[#f4f4f7] dark:hover:bg-[#131316]"
                          disabled={savingProfile}
                        >
                          {profile.is_active ? "Disattiva" : "Attiva"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteProfile(profile.slug)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-danger/20 bg-danger/5 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-danger transition-colors hover:bg-danger/10"
                          disabled={deletingProfileSlug === profile.slug}
                        >
                          <Icon name="trash" className="w-3.5 h-3.5" />
                          Elimina
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-paper dark:bg-[#131316] rounded-lg border border-line dark:border-[#2a2a2e] p-6">
        <div className="flex flex-col gap-2 mb-5">
          <h2 className="font-display font-bold tracking-tight text-ink dark:text-[#f4f4f7]" style={{ fontSize: "17px" }}>
            Associazione operazioni
          </h2>
          <p className="font-body text-[13px] text-muted dark:text-[#9999a0]">
            Seleziona quale profilo LLM usare per ogni operation_code aziendale.
          </p>
        </div>

        {bindingsError && (
          <div className="mb-4 rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
            {mapErrorMessage(bindingsError)}
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1.2fr_1fr_auto] mb-4">
          <Input
            label="Codice operazione"
            value={bindingOperationCode}
            onChange={(event) => setBindingOperationCode(normalizeLlmSlug(event.target.value))}
            placeholder="es. quote-summary"
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
              Profilo LLM
            </label>
            <SearchableSelect
              value={bindingProfileSlug}
              onChange={setBindingProfileSlug}
              options={[
                { value: "", label: "Seleziona profilo" },
                ...profileOptions.map((option) => ({ value: option.slug, label: option.label })),
              ]}
              placeholder="Seleziona profilo"
              searchPlaceholder="Cerca profilo..."
              menuLayer="portal"
            />
          </div>

          <div className="flex items-end">
            <Button
              variant="primary"
              onClick={() => void handleCreateBinding()}
              loading={savingBindingCode === normalizeLlmSlug(bindingOperationCode) && savingBindingCode !== null}
            >
              Salva binding
            </Button>
          </div>
        </div>

        {bindingsLoading ? (
          <div className="flex items-center justify-center py-10">
            <Spinner size="md" />
          </div>
        ) : bindings.length === 0 ? (
          <div className="rounded-md border border-dashed border-line dark:border-[#2a2a2e] px-4 py-8 text-sm text-muted dark:text-[#9999a0]">
            Nessun binding operazione configurato.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-2">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                  <th className="px-3 py-1">Operation code</th>
                  <th className="px-3 py-1">Profilo</th>
                  <th className="px-3 py-1">Provider / Modello</th>
                  <th className="px-3 py-1 text-right">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {bindings.map((binding) => {
                  const draftValue = bindingDrafts[binding.operation_code] ?? binding.profile_slug;
                  return (
                    <tr key={binding.operation_code} className="align-top bg-cream dark:bg-[#1c1c20]">
                      <td className="px-3 py-3 rounded-l-md font-mono text-[13px] text-ink dark:text-[#f4f4f7]">
                        {binding.operation_code}
                      </td>
                      <td className="px-3 py-3">
                        <SearchableSelect
                          value={draftValue}
                          onChange={(value) => setBindingDrafts((current) => ({
                            ...current,
                            [binding.operation_code]: value,
                          }))}
                          options={[
                            { value: "", label: "Seleziona profilo" },
                            ...profileOptions.map((option) => ({ value: option.slug, label: option.label })),
                          ]}
                          placeholder="Seleziona profilo"
                          searchPlaceholder="Cerca profilo..."
                          menuLayer="portal"
                        />
                      </td>
                      <td className="px-3 py-3 text-[13px] text-muted dark:text-[#9999a0]">
                        <div className="font-semibold text-ink dark:text-[#f4f4f7]">{binding.provider}</div>
                        <div>{binding.model_name}</div>
                      </td>
                      <td className="px-3 py-3 rounded-r-md">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => void handleSaveBindingRow(binding.operation_code)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink transition-colors hover:bg-paper dark:border-[#2a2a2e] dark:text-[#f4f4f7] dark:hover:bg-[#131316]"
                            disabled={savingBindingCode === binding.operation_code}
                          >
                            Salva
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteBinding(binding.operation_code)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-danger/20 bg-danger/5 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-danger transition-colors hover:bg-danger/10"
                            disabled={deletingBindingCode === binding.operation_code}
                          >
                            <Icon name="trash" className="w-3.5 h-3.5" />
                            Elimina
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        title={editingProfileSlug ? "Modifica profilo LLM" : "Nuovo profilo LLM"}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setProfileModalOpen(false)} disabled={savingProfile}>Annulla</Button>
            <Button variant="primary" onClick={() => void handleSaveProfile()} loading={savingProfile}>Salva profilo</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input
            label="Slug"
            value={profileForm.slug}
            onChange={(event) => setProfileForm((current) => ({
              ...current,
              slug: normalizeLlmSlug(event.target.value),
            }))}
            placeholder="es. openai-main"
            disabled={!!editingProfileSlug}
          />
          <Input
            label="Provider"
            value={profileForm.provider}
            onChange={(event) => setProfileForm((current) => ({ ...current, provider: event.target.value }))}
            placeholder="es. openai"
          />
          <Input
            label="Nome modello"
            value={profileForm.model_name}
            onChange={(event) => setProfileForm((current) => ({ ...current, model_name: event.target.value }))}
            placeholder="es. gpt-4o-mini"
          />
          <Input
            label="Endpoint API"
            value={profileForm.api_base_url}
            onChange={(event) => setProfileForm((current) => ({ ...current, api_base_url: event.target.value }))}
            placeholder="https://api.openai.com/v1"
          />

          <div className="md:col-span-2 rounded-md border border-line dark:border-[#2a2a2e] px-3 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
              <div>
                <p className="text-sm font-semibold text-ink dark:text-[#f4f4f7]">API key</p>
                <p className="text-xs text-muted dark:text-[#9999a0]">Lascia vuoto per mantenerla invariata.</p>
              </div>
              <label className="inline-flex items-center gap-2">
                <Checkbox
                  checked={profileForm.update_api_key}
                  onChange={(checked) => setProfileForm((current) => ({
                    ...current,
                    update_api_key: checked,
                    api_key: checked ? current.api_key : "",
                  }))}
                />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">Aggiorna chiave</span>
              </label>
            </div>
            <Input
              label="Nuova API key"
              value={profileForm.api_key}
              onChange={(event) => setProfileForm((current) => ({ ...current, api_key: event.target.value }))}
              placeholder="Inserisci la nuova chiave API"
              type="password"
              disabled={!profileForm.update_api_key}
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
              Parametri default (JSON)
            </label>
            <textarea
              value={profileForm.default_params_text}
              onChange={(event) => setProfileForm((current) => ({ ...current, default_params_text: event.target.value }))}
              placeholder='{"temperature": 0.2, "max_tokens": 1200}'
              rows={7}
              className="mt-1.5 w-full rounded-md border px-3 py-2.5 text-sm font-mono bg-paper text-ink border-line focus:border-ink focus:outline-none transition-colors dark:bg-ink-soft dark:text-paper dark:border-line-dark dark:focus:border-paper"
            />
          </div>

          <label className="md:col-span-2 inline-flex items-center gap-2 rounded-md border border-line dark:border-[#2a2a2e] px-3 py-2.5">
            <Checkbox
              checked={profileForm.is_active}
              onChange={(checked) => setProfileForm((current) => ({ ...current, is_active: checked }))}
            />
            <span className="text-sm font-semibold text-ink dark:text-[#f4f4f7]">Profilo attivo</span>
          </label>
        </div>
      </Modal>
    </div>
  );
}
