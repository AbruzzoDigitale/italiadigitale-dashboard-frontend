import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createWebsiteThemeApi,
  deleteWebsiteThemeApi,
  listWebsiteCategoriesApi,
  listWebsiteThemesApi,
  listWebsiteTypesApi,
  updateWebsiteThemeApi,
  type PhpVariable,
  type WebsiteCategory,
  type WebsiteTheme,
  type WebsiteType,
} from "../../api/websites";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Checkbox } from "../../components/ui/Checkbox";
import { Icon } from "../../components/ui/Icon";
import { Input } from "../../components/ui/Input";
import { Modal } from "../../components/ui/Modal";
import { MultiSelect } from "../../components/ui/MultiSelect";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import { useToast } from "../../context/ToastContext";

type ThemeFormState = {
  name: string;
  website_type_id: string;
  php_variables: PhpVariable[];
  documentation_url: string;
  download_url: string;
  cost: string;
  woocommerce_compatible: boolean;
  category_ids: number[];
  notes: string;
};

const EMPTY_FORM: ThemeFormState = {
  name: "",
  website_type_id: "",
  php_variables: [],
  documentation_url: "",
  download_url: "",
  cost: "",
  woocommerce_compatible: false,
  category_ids: [],
  notes: "",
};

// Direttive PHP che i temi pesanti chiedono più spesso: una riga già pronta
// invece di ricordarsi i nomi a memoria.
const SUGGESTED_PHP_VARIABLES = [
  "memory_limit",
  "max_execution_time",
  "upload_max_filesize",
  "post_max_size",
  "max_input_vars",
  "max_input_time",
];

function formatCost(cost: string | number | null): string {
  if (cost == null || cost === "") return "—";
  const value = typeof cost === "number" ? cost : Number(cost);
  if (Number.isNaN(value)) return String(cost);
  return value.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
}

interface WebsiteThemesTabProps {
  companyId: number;
  /** Occupa tutta l'altezza disponibile e confina lo scroll alla lista. */
  fillHeight?: boolean;
}

/**
 * Registro dei temi: nome, tipo di sito a cui appartengono, valori PHP
 * consigliati, link a documentazione e download, costo, categorie adatte,
 * compatibilità WooCommerce e note. Gestibile anche dagli operatori.
 */
export function WebsiteThemesTab({ companyId, fillHeight = false }: WebsiteThemesTabProps) {
  const toast = useToast();
  const [themes, setThemes] = useState<WebsiteTheme[]>([]);
  const [types, setTypes] = useState<WebsiteType[]>([]);
  const [categories, setCategories] = useState<WebsiteCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<WebsiteTheme | null>(null);
  const [deleting, setDeleting] = useState<WebsiteTheme | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [form, setForm] = useState<ThemeFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    try {
      setError(null);
      setThemes(await listWebsiteThemesApi({ companyId }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel caricamento dei temi");
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  useEffect(() => {
    listWebsiteTypesApi(companyId)
      .then(setTypes)
      .catch(() => setTypes([]));
    listWebsiteCategoriesApi(companyId)
      .then(setCategories)
      .catch(() => setCategories([]));
  }, [companyId]);

  // Solo i tipi che prevedono i temi possono ospitarne uno.
  const themeableTypes = useMemo(() => types.filter((t) => t.uses_themes), [types]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return themes.filter((theme) => {
      if (typeFilter && String(theme.website_type_id ?? "") !== typeFilter) return false;
      if (!q) return true;
      return `${theme.name} ${theme.website_type_name ?? ""} ${theme.category_names.join(" ")} ${
        theme.notes ?? ""
      }`
        .toLowerCase()
        .includes(q);
    });
  }, [themes, search, typeFilter]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      ...EMPTY_FORM,
      website_type_id: themeableTypes.length === 1 ? String(themeableTypes[0].id) : "",
    });
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (theme: WebsiteTheme) => {
    setEditing(theme);
    setForm({
      name: theme.name,
      website_type_id: theme.website_type_id != null ? String(theme.website_type_id) : "",
      php_variables: theme.php_variables.map((v) => ({ ...v })),
      documentation_url: theme.documentation_url ?? "",
      download_url: theme.download_url ?? "",
      cost: theme.cost == null ? "" : String(theme.cost),
      woocommerce_compatible: theme.woocommerce_compatible,
      category_ids: [...theme.category_ids],
      notes: theme.notes ?? "",
    });
    setFormError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditing(null);
    setFormError(null);
  };

  const setVariable = (index: number, patch: Partial<PhpVariable>) =>
    setForm((current) => ({
      ...current,
      php_variables: current.php_variables.map((v, i) => (i === index ? { ...v, ...patch } : v)),
    }));

  const addVariable = (name = "") =>
    setForm((current) => ({ ...current, php_variables: [...current.php_variables, { name, value: "" }] }));

  const removeVariable = (index: number) =>
    setForm((current) => ({
      ...current,
      php_variables: current.php_variables.filter((_, i) => i !== index),
    }));

  const handleSave = async () => {
    if (!form.name.trim()) {
      setFormError("Il nome del tema è obbligatorio");
      return;
    }
    const variables = form.php_variables
      .map((v) => ({ name: v.name.trim(), value: v.value.trim() }))
      .filter((v) => v.name);
    const cost = form.cost.trim() === "" ? null : Number(form.cost.replace(",", "."));
    if (cost != null && Number.isNaN(cost)) {
      setFormError("Il costo deve essere un numero");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const common = {
        website_type_id: form.website_type_id ? Number(form.website_type_id) : null,
        name: form.name.trim(),
        php_variables: variables,
        documentation_url: form.documentation_url.trim() || null,
        download_url: form.download_url.trim() || null,
        cost,
        woocommerce_compatible: form.woocommerce_compatible,
        notes: form.notes.trim() || null,
        category_ids: form.category_ids,
      };
      if (editing) {
        await updateWebsiteThemeApi(editing.id, common);
        toast.success("Tema aggiornato");
      } else {
        await createWebsiteThemeApi({ company_id: companyId, ...common });
        toast.success("Tema creato");
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
      await deleteWebsiteThemeApi(deleting.id);
      toast.success("Tema eliminato");
      setDeleting(null);
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nell'eliminazione");
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div
      className={`bg-paper dark:bg-[#131316] rounded-lg border border-line dark:border-[#2a2a2e] p-6 ${
        fillHeight ? "flex flex-col h-full min-h-0" : ""
      }`}
    >
      <div className="mb-5 flex flex-none flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2
            className="mb-1 font-display font-bold tracking-tight text-ink dark:text-[#f4f4f7]"
            style={{ fontSize: "17px" }}
          >
            Temi
          </h2>
          <p className="font-body text-[13px] text-muted dark:text-[#9999a0]">
            I temi utilizzabili sui siti, con i valori PHP consigliati, i link e il costo. Ogni tema
            appartiene a un tipo di sito che prevede i temi.
          </p>
        </div>

        <Button variant="primary" onClick={openCreate} leftIcon={<Icon name="plus" className="w-3.5 h-3.5" />}>
          Nuovo tema
        </Button>
      </div>

      {themeableTypes.length === 0 && (
        <div className="mb-4 flex-none rounded-md border border-warning/25 bg-warning/5 px-3 py-2 text-[12.5px] text-ink dark:text-[#f4f4f7]">
          Nessun tipo di sito prevede i temi: attiva l'opzione «usa i temi» su un tipo dal pannello
          Azienda → Siti web.
        </div>
      )}

      <div className="mb-5 flex flex-none flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] max-w-sm flex-1">
          <Icon name="search" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cerca per nome, tipo, categoria o note..."
            className="pl-9"
          />
        </div>
        <div className="w-44">
          <SearchableSelect
            value={typeFilter}
            onChange={setTypeFilter}
            options={[
              { value: "", label: "Tutti i tipi" },
              ...types.map((t) => ({ value: String(t.id), label: t.name })),
            ]}
            placeholder="Tipo"
            showAvatar={false}
            menuLayer="portal"
          />
        </div>
      </div>

      {error && (
        <div className="mb-4 flex-none rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <div className={fillHeight ? "-mr-3 min-h-0 flex-1 overflow-y-auto pr-3" : ""}>
        {isLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="sp-pop-in sp-skeleton h-44 rounded-xl border border-line dark:border-[#2a2a2e]"
                style={{ animationDelay: `${index * 45}ms` }}
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-md border border-dashed border-line px-4 py-8 text-sm text-muted dark:border-[#2a2a2e] dark:text-[#9999a0]">
            {themes.length === 0 ? "Nessun tema registrato: aggiungi il primo." : "Nessun tema corrisponde ai filtri."}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((theme, index) => (
              <div
                key={theme.id}
                className="sp-pop-in flex flex-col gap-3 rounded-xl border border-line bg-cream p-4 transition-colors hover:border-brand-magenta/50 dark:border-[#2a2a2e] dark:bg-[#1c1c20]"
                style={{ animationDelay: `${Math.min(index, 11) * 40}ms` }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-bold text-ink dark:text-[#f4f4f7]" title={theme.name}>
                      {theme.name}
                    </p>
                    <p className="truncate text-[11px] text-muted dark:text-[#9999a0]">
                      {theme.website_type_name ?? "Nessun tipo collegato"}
                    </p>
                  </div>
                  <div className="flex flex-none items-center gap-1">
                    <button
                      type="button"
                      title="Modifica"
                      aria-label="Modifica"
                      onClick={() => openEdit(theme)}
                      className="inline-grid h-7 w-7 place-items-center rounded-md border border-line text-ink transition-colors hover:bg-paper dark:border-[#2a2a2e] dark:text-[#f4f4f7] dark:hover:bg-[#131316]"
                    >
                      <Icon name="pencil" className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Elimina"
                      aria-label="Elimina"
                      onClick={() => setDeleting(theme)}
                      className="inline-grid h-7 w-7 place-items-center rounded-md border border-danger/20 bg-danger/5 text-danger transition-colors hover:bg-danger/10"
                    >
                      <Icon name="trash" className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="default">{formatCost(theme.cost)}</Badge>
                  {theme.woocommerce_compatible && <Badge variant="success">WooCommerce</Badge>}
                  {theme.websites_count > 0 && (
                    <Badge variant="info">
                      {theme.websites_count} {theme.websites_count === 1 ? "sito" : "siti"}
                    </Badge>
                  )}
                </div>

                {theme.category_names.length > 0 && (
                  <p className="text-[12px] text-muted dark:text-[#9999a0]">
                    Adatto a: {theme.category_names.join(", ")}
                  </p>
                )}

                {theme.php_variables.length > 0 && (
                  <div className="rounded-md border border-line bg-paper px-2.5 py-2 dark:border-[#2a2a2e] dark:bg-[#131316]">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                      Valori PHP consigliati
                    </p>
                    <ul className="flex flex-col gap-0.5">
                      {theme.php_variables.map((variable) => (
                        <li key={variable.name} className="flex justify-between gap-2 font-mono text-[11.5px]">
                          <span className="truncate text-muted dark:text-[#9999a0]">{variable.name}</span>
                          <span className="flex-none text-ink dark:text-[#f4f4f7]">{variable.value || "—"}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mt-auto flex flex-wrap items-center gap-3 pt-1">
                  {theme.documentation_url && (
                    <a
                      href={theme.documentation_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[12px] text-brand-magenta hover:underline"
                    >
                      <Icon name="document-text" className="h-3.5 w-3.5" />
                      Documentazione
                    </a>
                  )}
                  {theme.download_url && (
                    <a
                      href={theme.download_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[12px] text-brand-magenta hover:underline"
                    >
                      <Icon name="download" className="h-3.5 w-3.5" />
                      Download
                    </a>
                  )}
                </div>

                {theme.notes && (
                  <p className="line-clamp-3 whitespace-pre-wrap break-words text-[12px] text-muted dark:text-[#9999a0]">
                    {theme.notes}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editing ? "Modifica tema" : "Nuovo tema"}
        description="Il tema si collega a un tipo di sito che prevede i temi (es. WordPress)."
        size="xl"
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

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Input
              label="Nome del tema"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Astra Pro, Divi, Flatsome..."
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                Tipo di sito
              </label>
              <SearchableSelect
                value={form.website_type_id}
                onChange={(value) => setForm((current) => ({ ...current, website_type_id: value }))}
                options={[
                  { value: "", label: "Nessun tipo" },
                  ...themeableTypes.map((t) => ({ value: String(t.id), label: t.name })),
                ]}
                showAvatar={false}
                menuLayer="portal"
              />
              <p className="text-[11.5px] text-muted dark:text-[#9999a0]">
                Compaiono solo i tipi con l'opzione «usa i temi» attiva.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Input
              label="Link alla documentazione"
              value={form.documentation_url}
              onChange={(event) => setForm((current) => ({ ...current, documentation_url: event.target.value }))}
              placeholder="https://..."
            />
            <Input
              label="Link al download"
              value={form.download_url}
              onChange={(event) => setForm((current) => ({ ...current, download_url: event.target.value }))}
              placeholder="https://..."
            />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Input
              label="Costo (€)"
              value={form.cost}
              onChange={(event) => setForm((current) => ({ ...current, cost: event.target.value }))}
              placeholder="59,00"
            />
            <div className="flex items-end">
              <button
                type="button"
                onClick={() =>
                  setForm((current) => ({ ...current, woocommerce_compatible: !current.woocommerce_compatible }))
                }
                className="inline-flex items-center gap-2 py-2.5 text-sm text-ink dark:text-[#f4f4f7]"
              >
                <Checkbox
                  checked={form.woocommerce_compatible}
                  onChange={(checked) => setForm((current) => ({ ...current, woocommerce_compatible: checked }))}
                />
                Compatibile con WooCommerce
              </button>
            </div>
          </div>

          <MultiSelect
            label="Categorie di sito adatte"
            value={form.category_ids}
            onChange={(value) => setForm((current) => ({ ...current, category_ids: value }))}
            options={categories.map((c) => ({ id: c.id, label: c.name, color: c.color }))}
            placeholder="Nessuna categoria"
          />

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                Valori PHP consigliati
              </label>
              <div className="flex flex-wrap items-center gap-1">
                {SUGGESTED_PHP_VARIABLES.filter(
                  (name) => !form.php_variables.some((v) => v.name === name)
                ).map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => addVariable(name)}
                    className="rounded-md border border-line px-2 py-0.5 font-mono text-[11px] text-muted transition-colors hover:bg-cream hover:text-ink dark:border-[#2a2a2e] dark:text-[#9999a0] dark:hover:bg-[#1c1c20] dark:hover:text-[#f4f4f7]"
                  >
                    + {name}
                  </button>
                ))}
              </div>
            </div>

            {form.php_variables.length === 0 ? (
              <p className="text-[12px] text-muted dark:text-[#9999a0]">
                Nessuna variabile: aggiungine una dai suggerimenti qui sopra o con «Aggiungi variabile».
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {form.php_variables.map((variable, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <div className="flex-1">
                      <Input
                        value={variable.name}
                        onChange={(event) => setVariable(index, { name: event.target.value })}
                        placeholder="memory_limit"
                      />
                    </div>
                    <div className="flex-1">
                      <Input
                        value={variable.value}
                        onChange={(event) => setVariable(index, { value: event.target.value })}
                        placeholder="512M"
                      />
                    </div>
                    <button
                      type="button"
                      title="Rimuovi"
                      aria-label="Rimuovi variabile"
                      onClick={() => removeVariable(index)}
                      className="inline-grid h-8 w-8 flex-none place-items-center rounded-md border border-danger/20 bg-danger/5 text-danger transition-colors hover:bg-danger/10"
                    >
                      <Icon name="trash" className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <Button
              variant="secondary"
              onClick={() => addVariable()}
              leftIcon={<Icon name="plus" className="w-3.5 h-3.5" />}
              className="self-start"
            >
              Aggiungi variabile
            </Button>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
              Note
            </label>
            <textarea
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              rows={3}
              placeholder="Plugin richiesti, licenza, particolarità di installazione, ..."
              className="w-full rounded-md border border-line bg-paper px-3 py-2.5 text-sm font-body text-ink outline-none transition-colors focus:border-ink dark:border-line-dark dark:bg-ink-soft dark:text-paper dark:focus:border-paper"
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Elimina tema"
        description="Un tema ancora usato da qualche sito non può essere eliminato."
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
