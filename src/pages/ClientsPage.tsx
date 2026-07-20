import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useClients } from "../hooks/useClients";
import { useSelectedCompanyId } from "../hooks/useSelectedCompanyId";
import {
  bulkDeleteClientsApi,
  deleteClientApi,
  exportClientsCsvApi,
  type Client,
  type GetClientsParams,
} from "../api/clients";
import type { BulkDeleteResponse } from "../api/bulk";
import { getUiPreferencesApi, saveUiPreferenceApi } from "../api/preferences";
import { useToast } from "../context/ToastContext";
import { Button } from "../components/ui/Button";
import { Checkbox } from "../components/ui/Checkbox";
import { Modal } from "../components/ui/Modal";
import { Icon } from "../components/ui/Icon";
import { Spinner } from "../components/ui/Spinner";
import { SearchableSelect } from "../components/ui/SearchableSelect";
import { RightSidebarPanel } from "../components/ui/RightSidebarPanel";
import { ClientModal } from "../components/clients/ClientModal";
import { FicImportClientModal } from "../components/clients/FicImportClientModal";
import "./clients-page.css";

// ── Colonne configurabili ──────────────────────────────────────────────────────

type ClientColumn = {
  key: string;
  label: string;
  group: string;
  pin?: boolean;
  copy?: boolean;
  num?: boolean;
  get: (c: Client) => string | number | null | undefined;
};

const CLIENT_COLUMNS: ClientColumn[] = [
  { key: "rag", label: "Ragione sociale", group: "Anagrafica", pin: true, get: (c) => c.name },
  { key: "comm", label: "Nome commerciale", group: "Anagrafica", get: (c) => c.commercial_name },
  { key: "ref", label: "Referente", group: "Anagrafica", get: (c) => c.contact },
  { key: "tipo", label: "Tipo", group: "Anagrafica", get: (c) => (c.type === "company" ? "Azienda" : c.type === "person" ? "Persona" : "") },
  { key: "email", label: "Email", group: "Contatti", copy: true, get: (c) => c.email },
  { key: "tel", label: "Telefono", group: "Contatti", copy: true, get: (c) => c.phone },
  { key: "pec", label: "PEC", group: "Contatti", copy: true, get: (c) => c.pec },
  { key: "indirizzo", label: "Indirizzo", group: "Sede", get: (c) => c.addr },
  { key: "citta", label: "Città", group: "Sede", get: (c) => c.city },
  { key: "cap", label: "CAP", group: "Sede", copy: true, get: (c) => c.zip },
  { key: "prov", label: "Prov.", group: "Sede", get: (c) => c.prov },
  { key: "piva", label: "P.IVA", group: "Fiscale", copy: true, get: (c) => c.vat },
  { key: "cf", label: "Codice fiscale", group: "Fiscale", copy: true, get: (c) => c.cf },
  { key: "sdi", label: "Codice SDI", group: "Fiscale", copy: true, get: (c) => c.sdi },
  { key: "iban", label: "IBAN", group: "Fiscale", copy: true, get: (c) => c.bank_iban },
  { key: "attivi", label: "Contratti attivi", group: "Stato", num: true, get: (c) => c.active_contract_count ?? 0 },
  { key: "fic", label: "FIC", group: "Stato", get: (c) => (c.fic_id != null ? `#${c.fic_id}` : null) },
];

const COLMAP: Record<string, ClientColumn> = Object.fromEntries(CLIENT_COLUMNS.map((c) => [c.key, c]));

const CLIENT_PRESETS: { key: string; label: string; cols: string[] }[] = [
  { key: "default", label: "Predefinita", cols: ["rag", "comm", "ref", "email", "tel", "citta", "piva"] },
  { key: "fatt", label: "Fatturazione", cols: ["rag", "comm", "piva", "cf", "sdi", "pec", "iban"] },
  { key: "comm", label: "Comunicazioni", cols: ["rag", "comm", "ref", "email", "pec", "tel"] },
  { key: "sede", label: "Sede / logistica", cols: ["rag", "comm", "indirizzo", "cap", "citta", "tel"] },
];

const COLS_STORAGE_KEY = "clients.table.columns";
const PINNED_KEYS = CLIENT_COLUMNS.filter((c) => c.pin).map((c) => c.key);

/** Le colonne fissate stanno sempre in testa; niente duplicati né chiavi ignote. */
function normalizeCols(cols: string[]): string[] {
  const uniq = cols.filter((k, i) => cols.indexOf(k) === i && COLMAP[k]);
  const rest = uniq.filter((k) => !PINNED_KEYS.includes(k));
  return [...PINNED_KEYS, ...rest];
}

function loadCols(): string[] {
  try {
    const raw = localStorage.getItem(COLS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return normalizeCols(parsed as string[]);
    }
  } catch {
    /* ignora */
  }
  return normalizeCols(CLIENT_PRESETS[0].cols);
}

// ── Delete modal ─────────────────────────────────────────────────────────────

interface DeleteModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  client: Client | null;
  deleting: boolean;
}

function DeleteModal({ open, onClose, onConfirm, client, deleting }: DeleteModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Elimina cliente"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={deleting}>Annulla</Button>
          <Button variant="danger" onClick={onConfirm} loading={deleting}>Elimina</Button>
        </>
      }
    >
      <p className="font-body text-sm text-ink dark:text-[#f4f4f7]">
        Sei sicuro di voler eliminare <strong>{client?.commercial_name ?? client?.name}</strong>?
      </p>
      <p className="font-body text-sm text-muted dark:text-[#9999a0] mt-2">
        Il cliente verrà nascosto ma i preventivi collegati resteranno intatti.
      </p>
    </Modal>
  );
}

// ── Pannello personalizza colonne ──────────────────────────────────────────────

function ColumnsPanel({
  open,
  onClose,
  active,
  onToggle,
  onPreset,
}: {
  open: boolean;
  onClose: () => void;
  active: string[];
  onToggle: (key: string) => void;
  onPreset: (cols: string[]) => void;
}) {
  const groups = [...new Set(CLIENT_COLUMNS.map((c) => c.group))];
  return (
    <RightSidebarPanel
      open={open}
      onClose={onClose}
      title="Personalizza colonne"
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] text-muted dark:text-[#9999a0]">{active.length} colonne attive</span>
          <Button variant="primary" onClick={onClose}>Fatto</Button>
        </div>
      }
    >
      {/* Preset rapidi */}
      <div className="mb-4 flex flex-wrap gap-2">
        {CLIENT_PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => onPreset(p.cols)}
            className="h-8 rounded-md border border-line px-3 text-[12px] font-semibold text-ink transition-colors hover:border-brand-magenta hover:text-brand-magenta dark:border-[#2a2a2e] dark:text-[#f4f4f7]"
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {groups.map((g) => (
          <div key={g}>
            <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted dark:text-[#9999a0]">{g}</div>
            <div className="space-y-0.5">
              {CLIENT_COLUMNS.filter((c) => c.group === g).map((c) => (
                <label
                  key={c.key}
                  className={`flex items-center gap-3 rounded-md px-2 py-2 ${c.pin ? "opacity-70" : "cursor-pointer hover:bg-cream dark:hover:bg-[#1c1c20]"}`}
                >
                  <Checkbox checked={active.includes(c.key)} disabled={c.pin} onChange={() => onToggle(c.key)} />
                  <span className="flex-1 text-[13px] text-ink dark:text-[#f4f4f7]">{c.label}</span>
                  {c.pin && (
                    <span className="rounded-pill bg-line px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted dark:bg-[#2a2a2e] dark:text-[#9999a0]">fissa</span>
                  )}
                  {c.copy && (
                    <span className="rounded-pill bg-success/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-success">copia</span>
                  )}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </RightSidebarPanel>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const PER_PAGE = 50;

export function ClientsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { selectedCompanyId } = useSelectedCompanyId(user?.company_id ?? null);
  const { clients, total, page, pages, isLoading, error, refetch } = useClients();
  const toast = useToast();

  // ── Filters & pagination ──
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"" | "person" | "company">("");
  const [cityFilter, setCityFilter] = useState("");
  const [provFilter, setProvFilter] = useState("");
  const [eInvoiceFilter, setEInvoiceFilter] = useState<"" | "true" | "false">("");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // ── Colonne / viste / export ──
  const [activeCols, setActiveCols] = useState<string[]>(loadCols);
  const [cpOpen, setCpOpen] = useState(false);
  const [viewsOpen, setViewsOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Salva le colonne (ordine + scelta) su localStorage e sul server (best-effort).
  const persistCols = useCallback((cols: string[]) => {
    const next = normalizeCols(cols);
    setActiveCols(next);
    try {
      localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignora */
    }
    void saveUiPreferenceApi({ clients_columns: next }).catch(() => {});
  }, []);

  // Al mount, prova a caricare le colonne salvate sul server (fallback: localStorage).
  useEffect(() => {
    let cancelled = false;
    getUiPreferencesApi()
      .then((prefs) => {
        if (cancelled) return;
        const saved = (prefs as { clients_columns?: unknown }).clients_columns;
        if (Array.isArray(saved) && saved.length > 0) {
          setActiveCols(normalizeCols(saved as string[]));
        }
      })
      .catch(() => {
        /* endpoint non disponibile: resta il localStorage */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [createOpen, setCreateOpen] = useState(false);
  const [editClient, setEditClient] = useState<Client | null>(null);
  const [deleteClient, setDeleteClient] = useState<Client | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedClientIds, setSelectedClientIds] = useState<number[]>([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkDeleteResponse | null>(null);
  const [ficImportOpen, setFicImportOpen] = useState(false);

  // Build params from current state + optional overrides
  const buildParams = useCallback(
    (overrides: Partial<GetClientsParams> = {}): GetClientsParams => ({
      q: search || undefined,
      company_id: selectedCompanyId ?? undefined,
      type: typeFilter || undefined,
      city: cityFilter || undefined,
      prov: provFilter || undefined,
      e_invoice: eInvoiceFilter === "" ? undefined : eInvoiceFilter === "true",
      sort_by: sortBy || undefined,
      sort_dir: sortBy ? sortDir : undefined,
      page: currentPage,
      per_page: PER_PAGE,
      ...overrides,
    }),
    [search, selectedCompanyId, typeFilter, cityFilter, provFilter, eInvoiceFilter, sortBy, sortDir, currentPage]
  );

  useEffect(() => {
    refetch(buildParams({ page: 1 }));
    setCurrentPage(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompanyId]);

  // Debounced search
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearch = (v: string) => {
    setSearch(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setCurrentPage(1);
      refetch(buildParams({ q: v || undefined, page: 1 }));
    }, 350);
  };

  const handleTypeFilter = (v: "" | "person" | "company") => {
    setTypeFilter(v);
    setCurrentPage(1);
    refetch(buildParams({ type: v || undefined, page: 1 }));
  };

  const cityDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleCityFilter = (v: string) => {
    setCityFilter(v);
    if (cityDebounceRef.current) clearTimeout(cityDebounceRef.current);
    cityDebounceRef.current = setTimeout(() => {
      setCurrentPage(1);
      refetch(buildParams({ city: v || undefined, page: 1 }));
    }, 350);
  };

  const provDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleProvFilter = (v: string) => {
    const up = v.toUpperCase();
    setProvFilter(up);
    if (provDebounceRef.current) clearTimeout(provDebounceRef.current);
    provDebounceRef.current = setTimeout(() => {
      setCurrentPage(1);
      refetch(buildParams({ prov: up || undefined, page: 1 }));
    }, 350);
  };

  const handleEInvoiceFilter = (v: "" | "true" | "false") => {
    setEInvoiceFilter(v);
    setCurrentPage(1);
    refetch(buildParams({ e_invoice: v === "" ? undefined : v === "true", page: 1 }));
  };

  const handlePage = (p: number) => {
    setCurrentPage(p);
    refetch(buildParams({ page: p }));
  };

  // ── Colonne ──
  const applyCols = (cols: string[]) => persistCols(cols);
  const toggleCol = (key: string) => {
    if (COLMAP[key]?.pin) return;
    applyCols(activeCols.includes(key) ? activeCols.filter((k) => k !== key) : [...activeCols, key]);
  };
  // ── Ordinamento dati (click sull'intestazione) ──
  const handleSort = (key: string) => {
    const dir: "asc" | "desc" = sortBy === key && sortDir === "asc" ? "desc" : "asc";
    setSortBy(key);
    setSortDir(dir);
    setCurrentPage(1);
    refetch(buildParams({ sort_by: key, sort_dir: dir, page: 1 }));
  };
  const activePreset = useMemo(
    () => CLIENT_PRESETS.find((p) => normalizeCols(p.cols).join(",") === activeCols.join(",")),
    [activeCols]
  );

  // ── Copia ──
  const copyVal = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copiato`);
    } catch {
      toast.error("Copia non riuscita");
    }
  };
  const copyRow = async (c: Client) => {
    const line = activeCols
      .map((k) => {
        const v = COLMAP[k].get(c);
        return v == null ? "" : String(v);
      })
      .join("\t");
    try {
      await navigator.clipboard.writeText(line);
      toast.success("Riga copiata (incolla in Excel/Sheets)");
    } catch {
      toast.error("Copia non riuscita");
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportClientsCsvApi(buildParams());
      toast.success("Export CSV avviato");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore export CSV");
    } finally {
      setExporting(false);
    }
  };

  const allVisibleSelected = clients.length > 0 && clients.every((client) => selectedClientIds.includes(client.id));

  const toggleSelectAllVisible = (checked: boolean) => {
    setSelectedClientIds((current) => {
      if (checked) {
        const merged = new Set([...current, ...clients.map((client) => client.id)]);
        return Array.from(merged);
      }
      const visibleIds = new Set(clients.map((client) => client.id));
      return current.filter((id) => !visibleIds.has(id));
    });
  };

  const toggleClientSelection = (clientId: number, checked: boolean) => {
    setSelectedClientIds((current) => {
      if (checked) return Array.from(new Set([...current, clientId]));
      return current.filter((id) => id !== clientId);
    });
  };

  const handleDelete = useCallback(async () => {
    if (!deleteClient) return;
    setDeleting(true);
    try {
      await deleteClientApi(deleteClient.id);
      toast.success("Cliente eliminato");
      refetch(buildParams());
      setDeleteClient(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore");
    } finally {
      setDeleting(false);
    }
  }, [deleteClient, refetch, buildParams, toast]);

  const handleBulkDelete = useCallback(async () => {
    if (selectedClientIds.length === 0) return;
    setBulkDeleting(true);
    try {
      const response = await bulkDeleteClientsApi(selectedClientIds);
      setBulkDeleteOpen(false);
      setBulkResult(response);
      setSelectedClientIds([]);
      toast.success(`Eliminati ${response.deleted_ids.length} su ${response.requested}`);
      refetch(buildParams());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore eliminazione bulk clienti");
    } finally {
      setBulkDeleting(false);
    }
  }, [buildParams, refetch, selectedClientIds, toast]);

  const cols = activeCols;

  return (
    <div className="cl-scope flex h-full min-h-0 flex-col overflow-hidden px-6 py-6 mx-auto w-full animate-fadeIn">

      {/* ── Header ── */}
      <div className="mb-6 flex shrink-0 items-start justify-between gap-4">
        <div>
          <div className="section-eyebrow">
            <Icon name="users" className="w-3.5 h-3.5" />
            Anagrafica
          </div>
          <h1 className="section-title">Clienti</h1>
          <p className="section-lead">
            Anagrafica clienti — dati pronti per il copia/incolla. Personalizza le colonne in base a ciò che ti serve.
          </p>
        </div>
        <Button
          variant="primary"
          leftIcon={<Icon name="plus" className="w-4 h-4" />}
          onClick={() => setCreateOpen(true)}
        >
          Nuovo cliente
        </Button>
      </div>

      {/* ── Toolbar ── */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 mb-4">
        {/* Search */}
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Icon
            name="search"
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted dark:text-[#9999a0] pointer-events-none"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Cerca ragione sociale, nome commerciale, referente, P.IVA…"
            className="w-full pl-9 pr-4 py-2 rounded-md text-[13px] font-body text-ink dark:text-[#f4f4f7] bg-paper dark:bg-[#1c1c20] border border-line dark:border-[#2a2a2e] placeholder:text-muted/60 dark:placeholder:text-[#9999a0]/60 outline-none focus:border-ink dark:focus:border-[#f4f4f7] transition-colors"
          />
        </div>
        <span className="cl-count">{isLoading ? "…" : `${total} client${total === 1 ? "e" : "i"}`}</span>
        {/* Type filter */}
        <SearchableSelect
          className="w-40"
          value={typeFilter}
          onChange={(nextValue) => handleTypeFilter(nextValue as "" | "person" | "company")}
          options={[
            { value: "", label: "Tutti i tipi" },
            { value: "company", label: "Aziende" },
            { value: "person", label: "Persone fisiche" },
          ]}
          placeholder="Tutti i tipi"
          searchPlaceholder="Cerca tipo..."
        />
        {/* City filter */}
        <input
          type="text"
          value={cityFilter}
          onChange={(e) => handleCityFilter(e.target.value)}
          placeholder="Città"
          className="h-9 w-28 rounded-pill border border-line bg-paper px-3 text-[12px] font-semibold text-ink outline-none transition-colors placeholder:text-muted/60 focus:border-ink dark:border-[#2a2a2e] dark:bg-[#1c1c20] dark:text-[#f4f4f7]"
        />
        {/* Prov filter */}
        <input
          type="text"
          value={provFilter}
          onChange={(e) => handleProvFilter(e.target.value)}
          placeholder="Prov."
          maxLength={2}
          className="h-9 w-20 rounded-pill border border-line bg-paper px-3 text-[12px] font-semibold text-ink outline-none transition-colors placeholder:text-muted/60 focus:border-ink dark:border-[#2a2a2e] dark:bg-[#1c1c20] dark:text-[#f4f4f7]"
        />
        {/* E-invoice filter */}
        <SearchableSelect
          className="w-40"
          value={eInvoiceFilter}
          onChange={(nextValue) => handleEInvoiceFilter(nextValue as "" | "true" | "false")}
          options={[
            { value: "", label: "Fatt. elettronica" },
            { value: "true", label: "Sì" },
            { value: "false", label: "No" },
          ]}
          placeholder="Fatt. elettronica"
          searchPlaceholder="Cerca..."
        />

        <div className="flex-1" />

        {selectedClientIds.length > 0 && (
          <Button
            variant="danger-ghost"
            leftIcon={<Icon name="trash" className="w-4 h-4" />}
            onClick={() => setBulkDeleteOpen(true)}
          >
            Elimina ({selectedClientIds.length})
          </Button>
        )}

        {/* Viste (preset colonne) */}
        <div className="cl-views">
          <button type="button" className={"cl-viewbtn" + (viewsOpen ? " on" : "")} onClick={() => setViewsOpen((v) => !v)}>
            <Icon name="grid" className="w-4 h-4" /> {activePreset ? activePreset.label : "Vista personalizzata"} <Icon name="chevron-down" className="w-3.5 h-3.5" />
          </button>
          {viewsOpen && (
            <>
              <div className="cl-views-back" onClick={() => setViewsOpen(false)} />
              <div className="cl-views-menu">
                <div className="cl-views-h">Viste salvate</div>
                {CLIENT_PRESETS.map((p) => {
                  const on = normalizeCols(p.cols).join(",") === cols.join(",");
                  return (
                    <button
                      key={p.key}
                      type="button"
                      className={"cl-views-opt" + (on ? " on" : "")}
                      onClick={() => {
                        applyCols(p.cols);
                        setViewsOpen(false);
                      }}
                    >
                      <span>{p.label}</span>
                      <span className="cl-views-n">{p.cols.length}</span>
                      {on && <Icon name="check" className="w-3.5 h-3.5" />}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Personalizza colonne */}
        <button
          type="button"
          className={"cl-iconbtn" + (cpOpen ? " on" : "")}
          onClick={() => setCpOpen(true)}
          title="Personalizza colonne"
          aria-label="Personalizza colonne"
        >
          <Icon name="settings" className="w-4 h-4" />
          <span className="cl-iconbtn-n">{cols.length}</span>
        </button>

        {/* Export CSV */}
        <button
          type="button"
          className="cl-iconbtn"
          onClick={() => void handleExport()}
          disabled={exporting}
          title="Esporta CSV"
          aria-label="Esporta CSV"
        >
          <Icon name="download" className="w-4 h-4" />
        </button>

        {user?.is_admin && (
          <Button
            variant="ghost"
            leftIcon={<Icon name="upload" className="w-4 h-4" />}
            onClick={() => setFicImportOpen(true)}
          >
            Importa da FiC
          </Button>
        )}
      </div>

      {/* ── Tabella ── */}
      <div className="cl-board min-h-0 flex-1">
        <div className="cl-tablewrap">
          {isLoading ? (
            <div className="flex items-center justify-center h-full py-20">
              <Spinner size="lg" />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full py-20">
              <p className="font-body text-sm text-danger">{error}</p>
            </div>
          ) : clients.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-20 text-muted dark:text-[#9999a0]">
              <Icon name="users" className="w-10 h-10 mb-3 opacity-30" />
              <p className="font-body text-sm">{search ? "Nessun risultato per questa ricerca" : "Nessun cliente"}</p>
            </div>
          ) : (
            <table className="cl-table">
              <thead>
                <tr>
                  <th className="cl-th chk">
                    <Checkbox checked={allVisibleSelected} onChange={toggleSelectAllVisible} />
                  </th>
                  {cols.map((k) => {
                    const c = COLMAP[k];
                    const active = sortBy === k;
                    return (
                      <th
                        key={k}
                        className={"cl-th sortable" + (c.pin ? " pin" : "") + (c.num ? " num" : "")}
                        style={{ minWidth: c.num ? 130 : 160 }}
                        onClick={() => handleSort(k)}
                        title={`Ordina per ${c.label}`}
                      >
                        <span className="cl-th-label">{c.label}</span>
                        <span className={"cl-th-sort" + (active ? "" : " idle")}>
                          <Icon name="chevron-down" className={"w-3 h-3" + (active && sortDir === "asc" ? " rotate-180" : "")} />
                        </span>
                      </th>
                    );
                  })}
                  <th className="cl-th act" />
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr key={client.id} onClick={() => navigate(`/clients/${client.id}`)}>
                    <td className="cl-td chk" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedClientIds.includes(client.id)}
                        onChange={(checked: boolean) => toggleClientSelection(client.id, checked)}
                      />
                    </td>
                    {cols.map((k) => {
                      const c = COLMAP[k];
                      const value = c.get(client);
                      const empty = value == null || value === "";
                      if (c.num) {
                        return (
                          <td key={k} className="cl-td num">
                            <span className="cl-num">{value ?? 0}</span>
                          </td>
                        );
                      }
                      return (
                        <td key={k} className={"cl-td" + (c.pin ? " pin" : "") + (c.copy ? " copyable" : "")}>
                          <span className="cl-val" title={empty ? undefined : String(value)}>
                            {empty ? <i className="cl-empty">—</i> : String(value)}
                          </span>
                          {c.copy && !empty && (
                            <button
                              type="button"
                              className="cl-copy"
                              title="Copia"
                              onClick={(e) => {
                                e.stopPropagation();
                                void copyVal(String(value), c.label);
                              }}
                            >
                              <Icon name="copy" className="w-3 h-3" />
                            </button>
                          )}
                        </td>
                      );
                    })}
                    <td className="cl-td act" onClick={(e) => e.stopPropagation()}>
                      <div className="cl-rowact">
                        <button type="button" className="cl-rowbtn" title="Copia riga (TSV)" onClick={() => void copyRow(client)}>
                          <Icon name="copy" className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" className="cl-rowbtn" title="Modifica" onClick={() => setEditClient(client)}>
                          <Icon name="pencil" className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" className="cl-rowbtn danger" title="Elimina" onClick={() => setDeleteClient(client)}>
                          <Icon name="trash" className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Pagination ── */}
      {pages > 1 && (
        <div className="flex shrink-0 items-center justify-between mt-3 px-1">
          <span className="text-[12px] text-muted dark:text-[#9999a0] font-body">
            Pagina {page} di {pages} · {total} clienti
          </span>
          <div className="flex items-center gap-1">
            <button
              disabled={page <= 1}
              onClick={() => handlePage(page - 1)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line bg-paper text-ink transition-colors hover:bg-cream disabled:opacity-40 dark:border-[#2a2a2e] dark:bg-[#1c1c20] dark:text-[#f4f4f7] dark:hover:bg-[#252529]"
            >
              <Icon name="chevron-right" className="w-4 h-4 rotate-180" />
            </button>
            {Array.from({ length: pages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === pages || Math.abs(p - page) <= 1)
              .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("...");
                acc.push(p);
                return acc;
              }, [])
              .map((p, idx) =>
                p === "..." ? (
                  <span key={`ellipsis-${idx}`} className="px-1 text-[12px] text-muted">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => handlePage(p as number)}
                    className={`inline-flex h-8 min-w-[32px] px-2 items-center justify-center rounded-md text-[12px] font-semibold transition-colors border ${
                      p === page
                        ? "border-ink bg-ink text-paper dark:border-[#f4f4f7] dark:bg-[#f4f4f7] dark:text-ink"
                        : "border-line bg-paper text-ink hover:bg-cream dark:border-[#2a2a2e] dark:bg-[#1c1c20] dark:text-[#f4f4f7] dark:hover:bg-[#252529]"
                    }`}
                  >
                    {p}
                  </button>
                )
              )}
            <button
              disabled={page >= pages}
              onClick={() => handlePage(page + 1)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line bg-paper text-ink transition-colors hover:bg-cream disabled:opacity-40 dark:border-[#2a2a2e] dark:bg-[#1c1c20] dark:text-[#f4f4f7] dark:hover:bg-[#252529]"
            >
              <Icon name="chevron-right" className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <ColumnsPanel open={cpOpen} onClose={() => setCpOpen(false)} active={cols} onToggle={toggleCol} onPreset={applyCols} />

      {/* ── Modals ── */}
      <ClientModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={() => refetch(buildParams())}
        isAdmin={!!user?.is_admin}
        companyId={selectedCompanyId ?? user?.company_id ?? null}
      />
      <ClientModal
        open={!!editClient}
        onClose={() => setEditClient(null)}
        onSaved={() => refetch(buildParams())}
        client={editClient}
        isAdmin={!!user?.is_admin}
      />
      <FicImportClientModal
        open={ficImportOpen}
        companyId={selectedCompanyId ?? user?.company_id ?? null}
        onClose={() => setFicImportOpen(false)}
        onImported={() => {
          setFicImportOpen(false);
          refetch(buildParams());
        }}
      />
      <DeleteModal
        open={!!deleteClient}
        onClose={() => setDeleteClient(null)}
        onConfirm={handleDelete}
        client={deleteClient}
        deleting={deleting}
      />

      <Modal
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        title="Elimina clienti selezionati"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setBulkDeleteOpen(false)} disabled={bulkDeleting}>Annulla</Button>
            <Button variant="danger" onClick={() => void handleBulkDelete()} loading={bulkDeleting}>Elimina selezionati</Button>
          </>
        }
      >
        <p className="font-body text-sm text-ink dark:text-[#f4f4f7]">
          Confermi l'eliminazione di <strong>{selectedClientIds.length}</strong> clienti?
        </p>
        <p className="font-body text-sm text-muted dark:text-[#9999a0] mt-2">
          Operazione in soft delete con modalità best effort.
        </p>
      </Modal>

      <Modal
        open={bulkResult != null && bulkResult.errors.length > 0}
        onClose={() => setBulkResult(null)}
        title="Dettagli eliminazione bulk"
        size="md"
        footer={<Button variant="ghost" onClick={() => setBulkResult(null)}>Chiudi</Button>}
      >
        <p className="text-sm text-ink dark:text-[#f4f4f7] mb-3">
          Eliminati {bulkResult?.deleted_ids.length ?? 0} su {bulkResult?.requested ?? 0}.
        </p>
        <div className="max-h-64 overflow-auto rounded-md border border-line dark:border-[#2a2a2e] p-3">
          <ul className="space-y-1 text-sm text-danger">
            {bulkResult?.errors.map((item) => (
              <li key={item.id}>#{item.id}: {item.detail}</li>
            ))}
          </ul>
        </div>
      </Modal>
    </div>
  );
}
