import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listClientOptionsApi } from "../../api/clients";
import {
  createWebsiteApi,
  deleteWebsiteApi,
  getWebsiteScanSettingsApi,
  listWebsiteCategoriesApi,
  listWebsiteCustomFieldsApi,
  listWebsiteStatusesApi,
  listWebsiteThemesApi,
  listWebsiteTypesApi,
  listWebsitesApi,
  queueWebsiteScansApi,
  refreshWebsiteWhoisApi,
  scanIntervalLabel,
  scanWebsiteApi,
  updateWebsiteApi,
  websiteLabel,
  type Website,
  type WebsiteCategory,
  type WebsiteCustomField,
  type WebsiteStatus,
  type WebsiteTheme,
  type WebsiteType,
} from "../../api/websites";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Checkbox } from "../../components/ui/Checkbox";
import { Icon } from "../../components/ui/Icon";
import { Input } from "../../components/ui/Input";
import { Modal } from "../../components/ui/Modal";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import { SegmentedSwitch } from "../../components/ui/SegmentedSwitch";
import { useToast } from "../../context/ToastContext";
import { ScanDetail, ScoresRow } from "./WebsiteMetrics";
import { WebsiteCustomFieldsModal } from "./WebsiteCustomFieldsModal";

type WebsiteFormState = {
  url: string;
  name: string;
  client_id: string; // "" = nessun cliente
  website_type_id: string;
  theme_id: string;
  category_id: string;
  status_id: string;
  requires_maintenance: boolean;
  launched_on: string;
  last_update_on: string;
  scan_enabled: boolean;
  notes: string;
  custom: Record<string, string>;
};

const EMPTY_FORM: WebsiteFormState = {
  url: "",
  name: "",
  client_id: "",
  website_type_id: "",
  theme_id: "",
  category_id: "",
  status_id: "",
  requires_maintenance: false,
  launched_on: "",
  last_update_on: "",
  scan_enabled: true,
  notes: "",
  custom: {},
};

const PAGE_SIZE_OPTIONS = [15, 30, 60] as const;
const DEFAULT_PAGE_SIZE = 15;

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

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("it-IT");
}

function formatDateTime(value: string | null): string {
  if (!value) return "mai";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "mai"
    : date.toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
}

/** Pastiglia colorata per tipo / categoria / stato: usa il colore della tassonomia. */
function TaxonomyChip({ label, color }: { label: string | null; color: string | null }) {
  if (!label) return <span className="text-muted dark:text-[#9999a0] opacity-50">—</span>;
  if (!color) return <Badge variant="default">{label}</Badge>;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-pill border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider"
      style={{ borderColor: `${color}40`, backgroundColor: `${color}1a`, color }}
    >
      {label}
    </span>
  );
}

/** Un campo personalizzato nella scheda sito, reso secondo il suo tipo. */
function CustomFieldInput({
  field,
  value,
  onChange,
}: {
  field: WebsiteCustomField;
  value: string;
  onChange: (value: string) => void;
}) {
  if (field.field_type === "boolean") {
    return (
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
          {field.label}
        </label>
        <button
          type="button"
          onClick={() => onChange(value === "true" ? "" : "true")}
          className="inline-flex items-center gap-2 self-start rounded-md border border-line px-3 py-2 text-sm text-ink transition-colors hover:bg-cream dark:border-[#2a2a2e] dark:text-[#f4f4f7] dark:hover:bg-[#1c1c20]"
        >
          <Checkbox checked={value === "true"} onChange={() => onChange(value === "true" ? "" : "true")} />
          {value === "true" ? "Sì" : "No"}
        </button>
        {field.help_text && (
          <p className="text-[11.5px] text-muted dark:text-[#9999a0]">{field.help_text}</p>
        )}
      </div>
    );
  }

  if (field.field_type === "select") {
    return (
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
          {field.label}
        </label>
        <SearchableSelect
          value={value}
          onChange={onChange}
          options={[
            { value: "", label: "Non impostato" },
            ...(field.options ?? []).map((option) => ({ value: option, label: option })),
          ]}
          showAvatar={false}
          menuLayer="portal"
        />
        {field.help_text && (
          <p className="text-[11.5px] text-muted dark:text-[#9999a0]">{field.help_text}</p>
        )}
      </div>
    );
  }

  if (field.field_type === "textarea") {
    return (
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
          {field.label}
        </label>
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={3}
          className="w-full rounded-md border border-line bg-paper px-3 py-2.5 text-sm font-body text-ink outline-none transition-colors focus:border-ink dark:border-line-dark dark:bg-ink-soft dark:text-paper dark:focus:border-paper"
        />
        {field.help_text && (
          <p className="text-[11.5px] text-muted dark:text-[#9999a0]">{field.help_text}</p>
        )}
      </div>
    );
  }

  const inputType =
    field.field_type === "number"
      ? "number"
      : field.field_type === "date"
      ? "date"
      : field.field_type === "email"
      ? "email"
      : field.field_type === "url"
      ? "url"
      : "text";

  return (
    <Input
      label={field.label}
      type={inputType}
      value={value}
      hint={field.help_text ?? undefined}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

interface WebsitesTabProps {
  companyId: number;
  /** Gestione dei siti (crea/modifica/elimina). */
  canManage: boolean;
  /** Solo PM e admin possono condividere un campo personalizzato con l'azienda. */
  canShareFields: boolean;
  /** Occupa tutta l'altezza disponibile e confina lo scroll alla lista. */
  fillHeight?: boolean;
}

/**
 * Registro dei siti web dei clienti: anagrafica, tassonomie, campi
 * personalizzati e i dati automatici (WHOIS + punteggi PageSpeed).
 */
export function WebsitesTab({ companyId, canManage, canShareFields, fillHeight = false }: WebsitesTabProps) {
  const toast = useToast();
  const [websites, setWebsites] = useState<Website[]>([]);
  const [clients, setClients] = useState<Array<{ id: number; name: string }>>([]);
  const [types, setTypes] = useState<WebsiteType[]>([]);
  const [categories, setCategories] = useState<WebsiteCategory[]>([]);
  const [statuses, setStatuses] = useState<WebsiteStatus[]>([]);
  const [themes, setThemes] = useState<WebsiteTheme[]>([]);
  const [customFields, setCustomFields] = useState<WebsiteCustomField[]>([]);
  // Cadenza scelta dall'azienda: serve solo a scrivere l'etichetta giusta.
  const [scanIntervalDays, setScanIntervalDays] = useState<number | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [maintenanceFilter, setMaintenanceFilter] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [fieldsModalOpen, setFieldsModalOpen] = useState(false);
  const [editing, setEditing] = useState<Website | null>(null);
  const [deleting, setDeleting] = useState<Website | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [form, setForm] = useState<WebsiteFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const [scanningId, setScanningId] = useState<number | null>(null);
  const [whoisId, setWhoisId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [queueing, setQueueing] = useState(false);
  // Analisi immediata di più siti: gira nel browser, un sito per volta, perché
  // una sola richiesta per decine di siti supererebbe di molto il timeout del
  // server (ogni analisi dura circa un minuto fra mobile e desktop).
  const [bulkScan, setBulkScan] = useState<{
    total: number;
    done: number;
    errors: number;
    current: string | null;
    /** Stima già calcolata: il render deve restare puro, niente Date.now() qui. */
    eta: string;
  } | null>(null);
  const stopBulkRef = useRef(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  // Righe in chiusura: restano montate finché l'animazione d'uscita non finisce,
  // altrimenti il pannello sparirebbe di scatto invece di richiudersi.
  const [closing, setClosing] = useState<Set<number>>(new Set());
  const closeTimers = useRef<Map<number, number>>(new Map());

  const CLOSE_MS = 240; // deve combaciare con .wb-detail-out in index.css

  const toggleExpand = (id: number) => {
    if (expanded.has(id)) {
      setExpanded((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setClosing((prev) => new Set(prev).add(id));
      const timer = window.setTimeout(() => {
        setClosing((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        closeTimers.current.delete(id);
      }, CLOSE_MS);
      closeTimers.current.set(id, timer);
      return;
    }
    // Riapertura durante la chiusura: annulla l'uscita a metà strada.
    const pending = closeTimers.current.get(id);
    if (pending) {
      window.clearTimeout(pending);
      closeTimers.current.delete(id);
      setClosing((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
    setExpanded((prev) => new Set(prev).add(id));
  };

  // Se la scheda viene lasciata mentre un pannello si sta chiudendo.
  useEffect(() => {
    const timers = closeTimers.current;
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    try {
      setError(null);
      setWebsites(await listWebsitesApi({ companyId }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel caricamento dei siti");
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  const refetchFields = useCallback(async () => {
    const [fields] = await Promise.all([listWebsiteCustomFieldsApi(companyId)]);
    setCustomFields(fields);
    await refetch();
  }, [companyId, refetch]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  useEffect(() => {
    listClientOptionsApi(companyId)
      .then(setClients)
      .catch(() => setClients([]));
    listWebsiteTypesApi(companyId)
      .then(setTypes)
      .catch(() => setTypes([]));
    listWebsiteCategoriesApi(companyId)
      .then(setCategories)
      .catch(() => setCategories([]));
    listWebsiteStatusesApi(companyId)
      .then(setStatuses)
      .catch(() => setStatuses([]));
    listWebsiteThemesApi({ companyId })
      .then(setThemes)
      .catch(() => setThemes([]));
    listWebsiteCustomFieldsApi(companyId)
      .then(setCustomFields)
      .catch(() => setCustomFields([]));
    getWebsiteScanSettingsApi(companyId)
      .then((settings) => setScanIntervalDays(settings.scan_interval_days))
      .catch(() => setScanIntervalDays(null));
  }, [companyId]);

  const clientOptions = useMemo(
    () => [
      { value: "", label: "Nessun cliente" },
      ...clients.map((c) => ({ value: String(c.id), label: c.name })),
    ],
    [clients]
  );

  const selectedType = useMemo(
    () => types.find((t) => String(t.id) === form.website_type_id) ?? null,
    [types, form.website_type_id]
  );

  // Temi proposti: solo quelli del tipo scelto (più quelli senza tipo, riusabili).
  const themeOptions = useMemo(() => {
    const available = themes.filter(
      (theme) => theme.website_type_id == null || String(theme.website_type_id) === form.website_type_id
    );
    return [
      { value: "", label: "Nessun tema" },
      ...available.map((theme) => ({ value: String(theme.id), label: theme.name })),
    ];
  }, [themes, form.website_type_id]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return websites.filter((site) => {
      if (typeFilter && String(site.website_type_id ?? "") !== typeFilter) return false;
      if (categoryFilter && String(site.category_id ?? "") !== categoryFilter) return false;
      if (statusFilter && String(site.status_id ?? "") !== statusFilter) return false;
      if (maintenanceFilter && String(site.requires_maintenance) !== maintenanceFilter) return false;
      if (!q) return true;
      return `${site.name} ${site.url} ${site.client_name ?? ""} ${site.registrar ?? ""}`
        .toLowerCase()
        .includes(q);
    });
  }, [websites, search, typeFilter, categoryFilter, statusFilter, maintenanceFilter]);

  // Vista lista/schede: preferenza ricordata per browser, come per i profili social.
  const [view, setView] = useState<"list" | "grid">(() =>
    typeof localStorage !== "undefined" && localStorage.getItem("websites_view") === "grid"
      ? "grid"
      : "list"
  );
  const changeView = (next: "list" | "grid") => {
    setView(next);
    try {
      localStorage.setItem("websites_view", next);
    } catch {
      /* storage non disponibile: ignora */
    }
  };

  const [pageSize, setPageSize] = useState<number>(() => {
    const raw = typeof localStorage !== "undefined" ? Number(localStorage.getItem("websites_page_size")) : NaN;
    return raw === 0 || (PAGE_SIZE_OPTIONS as readonly number[]).includes(raw) ? raw : DEFAULT_PAGE_SIZE;
  });
  const changePageSize = (size: number) => {
    setPageSize(size);
    setPage(1);
    try {
      localStorage.setItem("websites_page_size", String(size));
    } catch {
      /* storage non disponibile: ignora */
    }
  };
  const [page, setPage] = useState(1);
  useEffect(() => {
    setPage(1);
  }, [search, typeFilter, categoryFilter, statusFilter, maintenanceFilter, companyId]);

  const effectiveSize = pageSize === 0 ? Math.max(1, filtered.length) : pageSize;
  const totalPages = Math.max(1, Math.ceil(filtered.length / effectiveSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = useMemo(
    () => filtered.slice((safePage - 1) * effectiveSize, safePage * effectiveSize),
    [filtered, safePage, effectiveSize]
  );

  const openCreate = () => {
    setEditing(null);
    const defaultStatus = statuses.find((s) => s.is_default);
    setForm({ ...EMPTY_FORM, status_id: defaultStatus ? String(defaultStatus.id) : "", custom: {} });
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (site: Website) => {
    setEditing(site);
    const custom: Record<string, string> = {};
    customFields.forEach((field) => {
      custom[field.key] = site.custom_values[field.key] ?? "";
    });
    setForm({
      url: site.url,
      name: site.name,
      client_id: site.client_id != null ? String(site.client_id) : "",
      website_type_id: site.website_type_id != null ? String(site.website_type_id) : "",
      theme_id: site.theme_id != null ? String(site.theme_id) : "",
      category_id: site.category_id != null ? String(site.category_id) : "",
      status_id: site.status_id != null ? String(site.status_id) : "",
      requires_maintenance: site.requires_maintenance,
      launched_on: site.launched_on ?? "",
      last_update_on: site.last_update_on ?? "",
      scan_enabled: site.scan_enabled,
      notes: site.notes ?? "",
      custom,
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

  const handleSave = async () => {
    if (!form.url.trim()) {
      setFormError("L'URL del sito è obbligatoria");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const customValues: Record<string, string | null> = {};
      customFields.forEach((field) => {
        customValues[field.key] = form.custom[field.key]?.trim() || null;
      });
      const common = {
        url: form.url.trim(),
        name: form.name.trim(),
        client_id: form.client_id ? Number(form.client_id) : null,
        website_type_id: form.website_type_id ? Number(form.website_type_id) : null,
        // Un tipo senza temi non porta tema, anche se ne era rimasto uno scelto prima.
        theme_id: selectedType?.uses_themes && form.theme_id ? Number(form.theme_id) : null,
        category_id: form.category_id ? Number(form.category_id) : null,
        status_id: form.status_id ? Number(form.status_id) : null,
        requires_maintenance: form.requires_maintenance,
        launched_on: form.launched_on || null,
        last_update_on: form.last_update_on || null,
        scan_enabled: form.scan_enabled,
        notes: form.notes.trim() || null,
        custom_values: customValues,
      };
      if (editing) {
        await updateWebsiteApi(editing.id, common);
        toast.success("Sito aggiornato");
      } else {
        await createWebsiteApi({ company_id: companyId, ...common });
        toast.success("Sito creato");
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
      await deleteWebsiteApi(deleting.id);
      toast.success("Sito eliminato");
      setDeleting(null);
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nell'eliminazione");
    } finally {
      setRemoving(false);
    }
  };

  const handleScan = async (site: Website) => {
    setScanningId(site.id);
    try {
      const updated = await scanWebsiteApi(site.id);
      setWebsites((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      const failed = [updated.latest_mobile, updated.latest_desktop].filter(
        (scan) => scan && scan.status !== "ok"
      );
      if (failed.length) toast.error(failed[0]?.error ?? "Analisi non riuscita");
      else toast.success("Analisi completata");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore durante l'analisi");
    } finally {
      setScanningId(null);
    }
  };

  const handleWhois = async (site: Website) => {
    setWhoisId(site.id);
    try {
      const updated = await refreshWebsiteWhoisApi(site.id);
      setWebsites((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      if (updated.whois_error) toast.error(updated.whois_error);
      else toast.success("Dati dominio aggiornati");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore durante il controllo del dominio");
    } finally {
      setWhoisId(null);
    }
  };

  const toggleSelect = (id: number) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const clearSelection = () => setSelectedIds(new Set());
  const allPageSelected = pageItems.length > 0 && pageItems.every((s) => selectedIds.has(s.id));
  const toggleSelectAllPage = () =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) pageItems.forEach((s) => next.delete(s.id));
      else pageItems.forEach((s) => next.add(s.id));
      return next;
    });

  const handleQueueScans = async () => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    setQueueing(true);
    try {
      const result = await queueWebsiteScansApi(ids);
      const skipped = result.skipped
        ? ` · ${result.skipped} con analisi automatica sospesa, usa «Analizza ora»`
        : "";
      toast.success(
        `${result.queued} ${result.queued === 1 ? "sito messo" : "siti messi"} in coda: l'analisi parte col prossimo giro automatico${skipped}`
      );
      clearSelection();
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nell'accodamento");
    } finally {
      setQueueing(false);
    }
  };

  /** Tempo che manca, stimato sui siti già analizzati in questa sessione. */
  const etaLabel = (startedAt: number, done: number, total: number): string => {
    if (done === 0) return "";
    const perSite = (Date.now() - startedAt) / done;
    const remaining = Math.round((perSite * (total - done)) / 1000);
    if (remaining <= 0) return "";
    if (remaining < 60) return `circa ${remaining} secondi rimanenti`;
    return `circa ${Math.round(remaining / 60)} minuti rimanenti`;
  };

  const handleScanSelected = async () => {
    const targets = websites.filter((site) => selectedIds.has(site.id));
    if (!targets.length) return;

    stopBulkRef.current = false;
    const startedAt = Date.now();
    let done = 0;
    let errors = 0;
    setBulkScan({ total: targets.length, done, errors, current: null, eta: "" });

    for (const site of targets) {
      if (stopBulkRef.current) break;
      setBulkScan({
        total: targets.length,
        done,
        errors,
        current: websiteLabel(site),
        eta: etaLabel(startedAt, done, targets.length),
      });
      try {
        const updated = await scanWebsiteApi(site.id);
        // Il risultato entra in tabella subito: si vede l'avanzamento riga per riga.
        setWebsites((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
        if ([updated.latest_mobile, updated.latest_desktop].some((scan) => scan && scan.status !== "ok")) {
          errors += 1;
        }
      } catch {
        // Un sito che fallisce non ferma gli altri: lo contiamo e si prosegue.
        errors += 1;
      }
      done += 1;
      setBulkScan({
        total: targets.length,
        done,
        errors,
        current: null,
        eta: etaLabel(startedAt, done, targets.length),
      });
    }

    const interrupted = stopBulkRef.current;
    setBulkScan(null);
    stopBulkRef.current = false;
    const esito = `${done} ${done === 1 ? "sito analizzato" : "siti analizzati"}${
      errors ? ` · ${errors} con errori` : ""
    }`;
    if (interrupted) toast.success(`Analisi interrotta: ${esito}`);
    else if (errors) toast.error(`Analisi completata: ${esito}`);
    else toast.success(`Analisi completata: ${esito}`);
    if (!interrupted) clearSelection();
  };

  /**
   * Pannello «Dettagli e metriche», condiviso da tabella e schede: dominio,
   * anagrafica, campi personalizzati e le due letture PageSpeed.
   * `compact` tiene le colonne impilate quando lo spazio è quello di una scheda.
   */
  const renderDetail = (site: Website, compact = false) => (
    <div
      className={`wb-detail ${closing.has(site.id) ? "wb-detail-out" : "wb-detail-in"}`}
    >
      {/* Figlio diretto: è questo che .wb-detail ritaglia mentre si apre. */}
      <div className={`grid grid-cols-1 gap-4 ${compact ? "" : "lg:grid-cols-2"}`}>
        <div className="flex flex-col gap-3">
          <div
            className="wb-card-in rounded-md border border-line bg-paper p-3 dark:border-[#2a2a2e] dark:bg-[#131316]"
            style={{ animationDelay: "60ms" }}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                Dominio
              </p>
              <button
                type="button"
                onClick={() => handleWhois(site)}
                disabled={whoisId === site.id || !!bulkScan}
                className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-ink transition-colors hover:bg-cream disabled:opacity-50 dark:border-[#2a2a2e] dark:text-[#f4f4f7] dark:hover:bg-[#1c1c20]"
              >
                <Icon
                  name="refresh-cw"
                  className={`h-3 w-3 ${whoisId === site.id ? "animate-spin" : ""}`}
                />
                Aggiorna
              </button>
            </div>
            <dl
              className={`grid grid-cols-1 gap-1.5 text-[12.5px] ${compact ? "" : "sm:grid-cols-2"}`}
            >
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                  Registrar
                </dt>
                <dd className="break-words text-ink dark:text-[#f4f4f7]">{site.registrar ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                  Scadenza dominio
                </dt>
                <dd className="text-ink dark:text-[#f4f4f7]">
                  {formatDate(site.domain_expires_on)}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                  Name server
                </dt>
                <dd className="break-words text-ink dark:text-[#f4f4f7]">
                  {site.nameservers ?? "—"}
                </dd>
              </div>
            </dl>
            {site.whois_error && (
              <p className="mt-2 text-[11.5px] text-danger">{site.whois_error}</p>
            )}
          </div>

          <div
            className="wb-card-in rounded-md border border-line bg-paper p-3 dark:border-[#2a2a2e] dark:bg-[#131316]"
            style={{ animationDelay: "120ms" }}
          >
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
              Scheda
            </p>
            <dl className={`grid gap-1.5 text-[12.5px] ${compact ? "grid-cols-1" : "grid-cols-2"}`}>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                  Creazione sito
                </dt>
                <dd className="text-ink dark:text-[#f4f4f7]">{formatDate(site.launched_on)}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                  Ultimo aggiornamento
                </dt>
                <dd className="text-ink dark:text-[#f4f4f7]">
                  {formatDate(site.last_update_on)}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                  Manutenzione
                </dt>
                <dd className="text-ink dark:text-[#f4f4f7]">
                  {site.requires_maintenance ? "Sì" : "No"}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                  Ultima analisi
                </dt>
                <dd className="text-ink dark:text-[#f4f4f7]">
                  {formatDateTime(site.last_scan_at)}
                  {!site.scan_enabled && " · automatismo sospeso"}
                </dd>
              </div>
              {customFields.map((field) => (
                <div key={field.key}>
                  <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                    {field.label}
                    {field.visibility === "private" && " (personale)"}
                  </dt>
                  <dd className="break-words text-ink dark:text-[#f4f4f7]">
                    {field.field_type === "boolean"
                      ? site.custom_values[field.key] === "true"
                        ? "Sì"
                        : "No"
                      : site.custom_values[field.key] || "—"}
                  </dd>
                </div>
              ))}
            </dl>
            {site.notes && (
              <p className="mt-2 whitespace-pre-wrap break-words text-[12.5px] text-muted dark:text-[#9999a0]">
                {site.notes}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
            Analisi PageSpeed
          </p>
          <div
            className="wb-card-in rounded-md border border-line bg-paper p-3 dark:border-[#2a2a2e] dark:bg-[#131316]"
            style={{ animationDelay: "180ms" }}
          >
            <ScanDetail scan={site.latest_mobile} title="Mobile" />
          </div>
          <div
            className="wb-card-in rounded-md border border-line bg-paper p-3 dark:border-[#2a2a2e] dark:bg-[#131316]"
            style={{ animationDelay: "240ms" }}
          >
            <ScanDetail scan={site.latest_desktop} title="Desktop" />
          </div>
        </div>
      </div>
    </div>
  );

  /** Scheda di un sito per la vista a griglia (stessi dati della riga in tabella). */
  const renderCard = (site: Website, index: number) => (
    <div
      key={site.id}
      className="sp-pop-in flex flex-col gap-3 rounded-xl border border-line bg-cream p-4 transition-colors hover:border-brand-magenta/50 dark:border-[#2a2a2e] dark:bg-[#1c1c20]"
      style={{ animationDelay: `${Math.min(index, 11) * 40}ms` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <Checkbox checked={selectedIds.has(site.id)} onChange={() => toggleSelect(site.id)} />
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1.5">
              <p
                className="truncate text-[13.5px] font-bold text-ink dark:text-[#f4f4f7]"
                title={websiteLabel(site)}
              >
                {websiteLabel(site)}
              </p>
              {site.requires_maintenance && (
                <span title="Richiede manutenzione">
                  <Icon name="tools" className="h-3.5 w-3.5 flex-none text-warning" />
                </span>
              )}
            </div>
            <a
              href={site.url.startsWith("http") ? site.url : `https://${site.url}`}
              target="_blank"
              rel="noreferrer"
              title={site.url}
              className="flex min-w-0 items-center gap-1.5 text-[12px] text-brand-magenta hover:underline"
            >
              <Icon name="link" className="h-3 w-3 flex-none" />
              <span className="min-w-0 flex-1 truncate">
                {site.url.replace(/^https?:\/\/(www\.)?/, "")}
              </span>
            </a>
          </div>
        </div>
        {canManage && (
          <div className="flex flex-none items-center gap-1">
            <button
              type="button"
              title="Analizza ora (richiede qualche decina di secondi)"
              aria-label="Analizza ora"
              disabled={scanningId === site.id || !!bulkScan}
              onClick={() => handleScan(site)}
              className="inline-grid h-7 w-7 place-items-center rounded-md border border-line text-ink transition-colors hover:bg-paper disabled:opacity-40 dark:border-[#2a2a2e] dark:text-[#f4f4f7] dark:hover:bg-[#131316]"
            >
              <Icon
                name="refresh-cw"
                className={`h-3.5 w-3.5 ${scanningId === site.id ? "animate-spin" : ""}`}
              />
            </button>
            <button
              type="button"
              title="Modifica"
              aria-label="Modifica"
              onClick={() => openEdit(site)}
              className="inline-grid h-7 w-7 place-items-center rounded-md border border-line text-ink transition-colors hover:bg-paper dark:border-[#2a2a2e] dark:text-[#f4f4f7] dark:hover:bg-[#131316]"
            >
              <Icon name="pencil" className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="Elimina"
              aria-label="Elimina"
              onClick={() => setDeleting(site)}
              className="inline-grid h-7 w-7 place-items-center rounded-md border border-danger/20 bg-danger/5 text-danger transition-colors hover:bg-danger/10"
            >
              <Icon name="trash" className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {site.website_type_name && (
          <TaxonomyChip label={site.website_type_name} color={site.website_type_color} />
        )}
        {site.category_name && <TaxonomyChip label={site.category_name} color={site.category_color} />}
        {site.status_name && <TaxonomyChip label={site.status_name} color={site.status_color} />}
      </div>

      {site.theme_name && (
        <p className="truncate text-[11.5px] text-muted dark:text-[#9999a0]" title={site.theme_name}>
          Tema: {site.theme_name}
        </p>
      )}

      {site.client_name && (
        <Badge variant="info" className="max-w-full self-start">
          <span className="min-w-0 truncate" title={site.client_name}>
            {site.client_name}
          </span>
        </Badge>
      )}

      <div className="flex flex-col gap-1.5 border-t border-line/60 pt-3 dark:border-[#2a2a2e]">
        <div className="flex items-center gap-2">
          <span className="w-14 flex-none text-[10px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
            Mobile
          </span>
          <ScoresRow scan={site.latest_mobile} />
        </div>
        <div className="flex items-center gap-2">
          <span className="w-14 flex-none text-[10px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
            Desktop
          </span>
          <ScoresRow scan={site.latest_desktop} />
        </div>
      </div>

      <div className="mt-auto">
        <button
          type="button"
          onClick={() => toggleExpand(site.id)}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-magenta hover:underline"
        >
          <Icon
            name="chevron-right"
            className={`h-3 w-3 transition-transform ${expanded.has(site.id) ? "rotate-90" : ""}`}
          />
          {expanded.has(site.id) ? "Nascondi dettagli" : "Dettagli e metriche"}
        </button>
        {(expanded.has(site.id) || closing.has(site.id)) && (
          <div className="mt-3">{renderDetail(site, true)}</div>
        )}
      </div>
    </div>
  );

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
            Siti web
          </h2>
          <p className="font-body text-[13px] text-muted dark:text-[#9999a0]">
            Tutti i siti gestiti dall'azienda. Registrar, name server e punteggi PageSpeed si
            aggiornano da soli{scanIntervalDays ? ` ${scanIntervalLabel(scanIntervalDays)}` : ""}.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => setFieldsModalOpen(true)}
            leftIcon={<Icon name="settings" className="w-3.5 h-3.5" />}
          >
            Campi personalizzati
          </Button>
          {canManage && (
            <Button
              variant="primary"
              onClick={openCreate}
              leftIcon={<Icon name="plus" className="w-3.5 h-3.5" />}
            >
              Nuovo sito
            </Button>
          )}
        </div>
      </div>

      <div className="mb-5 flex flex-none flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] max-w-sm flex-1">
          <Icon name="search" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cerca per URL, nome, cliente o registrar..."
            className="pl-9"
          />
        </div>
        <div className="w-40">
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
        <div className="w-44">
          <SearchableSelect
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={[
              { value: "", label: "Tutte le categorie" },
              ...categories.map((c) => ({ value: String(c.id), label: c.name })),
            ]}
            placeholder="Categoria"
            showAvatar={false}
            menuLayer="portal"
          />
        </div>
        <div className="w-40">
          <SearchableSelect
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "", label: "Tutti gli stati" },
              ...statuses.map((s) => ({ value: String(s.id), label: s.name })),
            ]}
            placeholder="Stato"
            showAvatar={false}
            menuLayer="portal"
          />
        </div>
        <div className="w-44">
          <SearchableSelect
            value={maintenanceFilter}
            onChange={setMaintenanceFilter}
            options={[
              { value: "", label: "Manutenzione: tutti" },
              { value: "true", label: "Con manutenzione" },
              { value: "false", label: "Senza manutenzione" },
            ]}
            placeholder="Manutenzione"
            showAvatar={false}
            menuLayer="portal"
          />
        </div>
        <div className="ml-auto">
          <SegmentedSwitch
            value={view}
            onChange={changeView}
            ariaLabel="Vista siti web"
            options={[
              { value: "list", label: <><Icon name="list" className="w-3.5 h-3.5" />Lista</> },
              { value: "grid", label: <><Icon name="grid" className="w-3.5 h-3.5" />Schede</> },
            ]}
          />
        </div>
      </div>

      {bulkScan ? (
        <div className="mb-4 flex flex-none flex-col gap-2 rounded-md border border-brand-magenta/30 bg-brand-magenta/5 px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-3">
            <Icon name="refresh-cw" className="h-4 w-4 animate-spin text-brand-magenta" />
            <span className="text-[13px] font-semibold text-ink dark:text-[#f4f4f7]">
              Analisi in corso: {bulkScan.done} di {bulkScan.total}
            </span>
            {bulkScan.current && (
              <span className="min-w-0 truncate text-[12px] text-muted dark:text-[#9999a0]">
                {bulkScan.current}
              </span>
            )}
            <span className="text-[12px] text-muted dark:text-[#9999a0]">{bulkScan.eta}</span>
            <button
              type="button"
              onClick={() => {
                stopBulkRef.current = true;
              }}
              className="ml-auto text-[12px] font-semibold text-danger hover:underline"
            >
              Interrompi
            </button>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-line dark:bg-[#2a2a2e]">
            <div
              className="h-full rounded-full bg-brand-magenta transition-all duration-300"
              style={{ width: `${Math.round((bulkScan.done / bulkScan.total) * 100)}%` }}
            />
          </div>
          <p className="text-[11.5px] text-muted dark:text-[#9999a0]">
            L'analisi gira da questa pagina: se la chiudi si ferma, ma i siti già analizzati
            restano aggiornati.
          </p>
        </div>
      ) : (
        selectedIds.size > 0 && (
          <div className="mb-4 flex flex-none flex-wrap items-center gap-3 rounded-md border border-brand-magenta/30 bg-brand-magenta/5 px-3 py-2">
            <span className="text-[13px] font-semibold text-ink dark:text-[#f4f4f7]">
              {selectedIds.size} selezionati
            </span>
            <Button
              variant="primary"
              onClick={handleScanSelected}
              leftIcon={<Icon name="activity" className="w-3.5 h-3.5" />}
            >
              {/* Il costo in tempo è dichiarato prima del clic: un'analisi dura
                  circa un minuto a sito e su molti siti diventa lunga. */}
              Analizza ora ({selectedIds.size} · ~{selectedIds.size} min)
            </Button>
            <Button
              variant="secondary"
              onClick={handleQueueScans}
              loading={queueing}
              leftIcon={<Icon name="clock" className="w-3.5 h-3.5" />}
            >
              Metti in coda
            </Button>
            <span className="text-[11.5px] text-muted dark:text-[#9999a0]">
              «Analizza ora» gira subito da questa pagina e si può interrompere; «Metti in coda»
              lascia fare al controllo automatico.
            </span>
            <button
              type="button"
              onClick={clearSelection}
              className="text-[12px] font-semibold text-muted hover:text-ink dark:text-[#9999a0] dark:hover:text-[#f4f4f7]"
            >
              Deseleziona
            </button>
          </div>
        )
      )}

      {error && (
        <div className="mb-4 flex-none rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <div className={fillHeight ? "-mr-3 min-h-0 flex-1 overflow-y-auto pr-3" : ""}>
        {isLoading ? (
          view === "grid" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="sp-pop-in sp-skeleton h-52 rounded-xl border border-line dark:border-[#2a2a2e]"
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
        ) : filtered.length === 0 ? (
          <div className="rounded-md border border-dashed border-line px-4 py-8 text-sm text-muted dark:border-[#2a2a2e] dark:text-[#9999a0]">
            {websites.length === 0
              ? canManage
                ? "Nessun sito nel registro: aggiungi il primo."
                : "Nessun sito nel registro."
              : "Nessun sito corrisponde ai filtri."}
          </div>
        ) : view === "grid" ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {pageItems.map((site, index) => renderCard(site, index))}
          </div>
        ) : (
          <div className="overflow-x-auto overflow-y-hidden">
            <table className="w-full min-w-[1200px] table-fixed border-separate border-spacing-y-2">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                  <th className="w-[40px] px-3 py-1">
                    <Checkbox checked={allPageSelected} onChange={toggleSelectAllPage} className="align-middle" />
                  </th>
                  <th className="w-[22%] px-3 py-1">Sito</th>
                  <th className="w-[13%] px-3 py-1">Cliente</th>
                  <th className="w-[12%] px-3 py-1">Tipo e tema</th>
                  <th className="w-[11%] px-3 py-1">Categoria</th>
                  <th className="w-[10%] px-3 py-1">Stato</th>
                  <th className="w-[13%] px-3 py-1">Mobile</th>
                  <th className="w-[13%] px-3 py-1">Desktop</th>
                  {canManage && <th className="w-[120px] px-3 py-1 text-right">Azioni</th>}
                </tr>
              </thead>
              <tbody>
                {pageItems.map((site, index) => (
                  <Fragment key={site.id}>
                    <tr
                      className="sp-pop-in bg-cream align-top dark:bg-[#1c1c20]"
                      style={{ animationDelay: `${Math.min(index, 11) * 30}ms` }}
                    >
                      <td className="rounded-l-md px-3 py-3 align-middle">
                        <Checkbox checked={selectedIds.has(site.id)} onChange={() => toggleSelect(site.id)} />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <p
                            className="truncate text-[13.5px] font-bold text-ink dark:text-[#f4f4f7]"
                            title={websiteLabel(site)}
                          >
                            {websiteLabel(site)}
                          </p>
                          {site.requires_maintenance && (
                            <span title="Richiede manutenzione">
                              <Icon name="tools" className="h-3.5 w-3.5 flex-none text-warning" />
                            </span>
                          )}
                        </div>
                        <a
                          href={site.url.startsWith("http") ? site.url : `https://${site.url}`}
                          target="_blank"
                          rel="noreferrer"
                          title={site.url}
                          className="flex min-w-0 items-center gap-1.5 text-[12px] text-brand-magenta hover:underline"
                        >
                          <Icon name="link" className="h-3 w-3 flex-none" />
                          <span className="min-w-0 flex-1 truncate">
                            {site.url.replace(/^https?:\/\/(www\.)?/, "")}
                          </span>
                        </a>
                        <button
                          type="button"
                          onClick={() => toggleExpand(site.id)}
                          className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-magenta hover:underline"
                        >
                          <Icon
                            name="chevron-right"
                            className={`h-3 w-3 transition-transform ${expanded.has(site.id) ? "rotate-90" : ""}`}
                          />
                          {expanded.has(site.id) ? "Nascondi dettagli" : "Dettagli e metriche"}
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        {site.client_name ? (
                          <Badge variant="info" className="max-w-full">
                            <span className="min-w-0 truncate" title={site.client_name}>
                              {site.client_name}
                            </span>
                          </Badge>
                        ) : (
                          <span className="text-muted dark:text-[#9999a0] opacity-50">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <TaxonomyChip label={site.website_type_name} color={site.website_type_color} />
                        {site.theme_name && (
                          <p className="mt-1 truncate text-[11px] text-muted dark:text-[#9999a0]" title={site.theme_name}>
                            {site.theme_name}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <TaxonomyChip label={site.category_name} color={site.category_color} />
                      </td>
                      <td className="px-3 py-3">
                        <TaxonomyChip label={site.status_name} color={site.status_color} />
                      </td>
                      <td className="px-3 py-3">
                        <ScoresRow scan={site.latest_mobile} />
                      </td>
                      <td className={`px-3 py-3 ${canManage ? "" : "rounded-r-md"}`}>
                        <ScoresRow scan={site.latest_desktop} />
                      </td>
                      {canManage && (
                        <td className="rounded-r-md px-3 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              title="Analizza ora (richiede qualche decina di secondi)"
                              aria-label="Analizza ora"
                              disabled={scanningId === site.id || !!bulkScan}
                              onClick={() => handleScan(site)}
                              className="inline-grid h-7 w-7 place-items-center rounded-md border border-line text-ink transition-colors hover:bg-paper disabled:opacity-40 dark:border-[#2a2a2e] dark:text-[#f4f4f7] dark:hover:bg-[#131316]"
                            >
                              <Icon
                                name="refresh-cw"
                                className={`h-3.5 w-3.5 ${scanningId === site.id ? "animate-spin" : ""}`}
                              />
                            </button>
                            <button
                              type="button"
                              title="Modifica"
                              aria-label="Modifica"
                              onClick={() => openEdit(site)}
                              className="inline-grid h-7 w-7 place-items-center rounded-md border border-line text-ink transition-colors hover:bg-paper dark:border-[#2a2a2e] dark:text-[#f4f4f7] dark:hover:bg-[#131316]"
                            >
                              <Icon name="pencil" className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              title="Elimina"
                              aria-label="Elimina"
                              onClick={() => setDeleting(site)}
                              className="inline-grid h-7 w-7 place-items-center rounded-md border border-danger/20 bg-danger/5 text-danger transition-colors hover:bg-danger/10"
                            >
                              <Icon name="trash" className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>

                    {(expanded.has(site.id) || closing.has(site.id)) && (
                      <tr className="bg-cream dark:bg-[#1c1c20]">
                        <td colSpan={canManage ? 9 : 8} className="rounded-md px-3 pb-4">
                          {renderDetail(site)}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!isLoading && filtered.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[12px] text-muted dark:text-[#9999a0]">
              <span>
                {filtered.length} {filtered.length === 1 ? "sito" : "siti"}
              </span>
              <span className="opacity-40">·</span>
              <span>per pagina</span>
              {[...PAGE_SIZE_OPTIONS, 0].map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => changePageSize(size)}
                  className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                    pageSize === size
                      ? "border-ink bg-ink text-paper dark:border-[#f4f4f7] dark:bg-[#f4f4f7] dark:text-ink"
                      : "border-line text-ink hover:bg-cream dark:border-[#2a2a2e] dark:text-[#f4f4f7] dark:hover:bg-[#1c1c20]"
                  }`}
                >
                  {size === 0 ? "Tutti" : size}
                </button>
              ))}
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
                {pageNumbers(safePage, totalPages).map((p, index) =>
                  p === "…" ? (
                    <span key={`gap-${index}`} className="px-1 text-[12px] text-muted dark:text-[#9999a0]">
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
      </div>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editing ? "Modifica sito" : "Nuovo sito"}
        description="URL, cliente e classificazione. Registrar, name server e punteggi si compilano da soli."
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
              label="URL del sito"
              value={form.url}
              onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))}
              placeholder="https://www.esempio.it"
            />
            <Input
              label="Nome"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Come chiamarlo in elenco (facoltativo)"
            />
          </div>

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
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                Tipo di sito
              </label>
              <SearchableSelect
                value={form.website_type_id}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    website_type_id: value,
                    // Cambiando tipo il tema precedente non vale più.
                    theme_id: "",
                  }))
                }
                options={[
                  { value: "", label: "Non impostato" },
                  ...types.map((t) => ({ value: String(t.id), label: t.name })),
                ]}
                showAvatar={false}
                menuLayer="portal"
              />
              <p className="text-[11.5px] text-muted dark:text-[#9999a0]">
                I tipi si configurano dal pannello Azienda → Siti web.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                Tema
              </label>
              <SearchableSelect
                value={form.theme_id}
                onChange={(value) => setForm((current) => ({ ...current, theme_id: value }))}
                options={themeOptions}
                disabled={!selectedType?.uses_themes}
                showAvatar={false}
                menuLayer="portal"
              />
              <p className="text-[11.5px] text-muted dark:text-[#9999a0]">
                {selectedType?.uses_themes
                  ? "Scegli fra i temi registrati per questo tipo."
                  : "Disponibile solo per i tipi che prevedono i temi."}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                Categoria
              </label>
              <SearchableSelect
                value={form.category_id}
                onChange={(value) => setForm((current) => ({ ...current, category_id: value }))}
                options={[
                  { value: "", label: "Non impostata" },
                  ...categories.map((c) => ({ value: String(c.id), label: c.name })),
                ]}
                showAvatar={false}
                menuLayer="portal"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                Stato
              </label>
              <SearchableSelect
                value={form.status_id}
                onChange={(value) => setForm((current) => ({ ...current, status_id: value }))}
                options={[
                  { value: "", label: "Non impostato" },
                  ...statuses.map((s) => ({ value: String(s.id), label: s.name })),
                ]}
                showAvatar={false}
                menuLayer="portal"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Input
              label="Data di creazione del sito"
              type="date"
              value={form.launched_on}
              onChange={(event) => setForm((current) => ({ ...current, launched_on: event.target.value }))}
            />
            <Input
              label="Ultimo aggiornamento del sito"
              type="date"
              value={form.last_update_on}
              onChange={(event) => setForm((current) => ({ ...current, last_update_on: event.target.value }))}
            />
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() =>
                setForm((current) => ({ ...current, requires_maintenance: !current.requires_maintenance }))
              }
              className="inline-flex items-center gap-2 text-sm text-ink dark:text-[#f4f4f7]"
            >
              <Checkbox
                checked={form.requires_maintenance}
                onChange={(checked) => setForm((current) => ({ ...current, requires_maintenance: checked }))}
              />
              Richiede manutenzione
            </button>
            <button
              type="button"
              onClick={() => setForm((current) => ({ ...current, scan_enabled: !current.scan_enabled }))}
              className="inline-flex items-center gap-2 text-sm text-ink dark:text-[#f4f4f7]"
            >
              <Checkbox
                checked={form.scan_enabled}
                onChange={(checked) => setForm((current) => ({ ...current, scan_enabled: checked }))}
              />
              Analisi automatica{scanIntervalDays ? ` ${scanIntervalLabel(scanIntervalDays)}` : ""}
            </button>
          </div>

          {customFields.length > 0 && (
            <div className="flex flex-col gap-3 rounded-md border border-line bg-cream p-3 dark:border-[#2a2a2e] dark:bg-[#1c1c20]">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                Campi personalizzati
              </p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {customFields.map((field) => (
                  <CustomFieldInput
                    key={field.key}
                    field={field}
                    value={form.custom[field.key] ?? ""}
                    onChange={(value) =>
                      setForm((current) => ({ ...current, custom: { ...current.custom, [field.key]: value } }))
                    }
                  />
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
              Note
            </label>
            <textarea
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              rows={3}
              placeholder="Accessi, referente, particolarità dell'hosting, ..."
              className="w-full rounded-md border border-line bg-paper px-3 py-2.5 text-sm font-body text-ink outline-none transition-colors focus:border-ink dark:border-line-dark dark:bg-ink-soft dark:text-paper dark:focus:border-paper"
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Elimina sito"
        description="Vengono eliminati anche lo storico delle analisi e i valori dei campi personalizzati. L'operazione non è reversibile."
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
          Sei sicuro di voler eliminare <strong>{deleting ? websiteLabel(deleting) : ""}</strong>?
        </p>
      </Modal>

      <WebsiteCustomFieldsModal
        open={fieldsModalOpen}
        onClose={() => setFieldsModalOpen(false)}
        companyId={companyId}
        fields={customFields}
        onChanged={refetchFields}
        canShare={canShareFields}
      />
    </div>
  );
}
