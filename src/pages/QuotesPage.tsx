import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useQuotes } from "../hooks/useQuotes";
import { useSelectedCompanyId } from "../hooks/useSelectedCompanyId";
import {
  bulkDeleteQuotesApi,
  updateQuoteStatusApi,
  duplicateQuoteApi,
  deleteQuoteApi,
  exportQuotesCsvApi,
  formatEur,
  STATUS_LABELS,
  STATUS_VARIANT,
  type QuoteSortBy,
  type QuoteSortDir,
  type Quote,
  type QuoteStatus,
} from "../api/quotes";
import { StatusMenu } from "../components/quotes/StatusMenu";
import type { BulkDeleteResponse } from "../api/bulk";
import { getUiPreferencesApi, saveUiPreferenceApi } from "../api/preferences";
import { useToast } from "../context/ToastContext";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Checkbox } from "../components/ui/Checkbox";
import { Modal } from "../components/ui/Modal";
import { RightSidebarPanel } from "../components/ui/RightSidebarPanel";
import { Icon } from "../components/ui/Icon";
import { Spinner } from "../components/ui/Spinner";
import { usePushQuoteToFic } from "../hooks/usePushQuoteToFic";
import "./clients-page.css";

// ── Status filter tabs ────────────────────────────────────────────────────────

const STATUS_TABS: { label: string; value: QuoteStatus | "" }[] = [
  { label: "Tutti", value: "" },
  { label: "Bozza", value: "bozza" },
  { label: "Da approvare", value: "da_approvare" },
  { label: "In revisione", value: "in_revisione" },
  { label: "Inviato", value: "inviato" },
  { label: "Accettato", value: "accettato" },
  { label: "Rifiutato", value: "rifiutato" },
];

// ── Colonne configurabili ──────────────────────────────────────────────────────

type QuoteColumn = {
  key: string;
  label: string;
  group: string;
  pin?: boolean;
  copy?: boolean;
  num?: boolean;
  badge?: boolean;
  euro?: boolean;
  sortKey?: QuoteSortBy;
  get: (q: Quote) => string | number | null | undefined;
};

function fmtDate(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString("it-IT");
}

const QUOTE_COLUMNS: QuoteColumn[] = [
  { key: "codice", label: "Codice", group: "Generale", pin: true, copy: true, sortKey: "number", get: (q) => q.number },
  { key: "titolo", label: "Titolo", group: "Generale", sortKey: "title", get: (q) => q.title },
  { key: "cliente", label: "Cliente", group: "Generale", sortKey: "client", get: (q) => q.client_name },
  { key: "comm", label: "Nome commerciale", group: "Generale", get: (q) => q.client_commercial_name },
  { key: "stato", label: "Stato", group: "Generale", badge: true, sortKey: "status", get: (q) => STATUS_LABELS[q.status] },
  { key: "tag", label: "Tag", group: "Generale", get: (q) => q.tag },
  { key: "data", label: "Data", group: "Date", sortKey: "date", get: (q) => fmtDate(q.date) },
  { key: "aggiornato", label: "Aggiornato", group: "Date", sortKey: "updated_at", get: (q) => fmtDate(q.updated_at) },
  { key: "mese", label: "Mese", group: "Importi", num: true, euro: true, get: (q) => q.totals?.monthly ?? null },
  { key: "tantum", label: "Una tantum", group: "Importi", num: true, euro: true, get: (q) => q.totals?.one_time ?? null },
  { key: "totale", label: "Totale", group: "Importi", num: true, euro: true, get: (q) => q.totals?.total ?? null },
];

const QCOLMAP: Record<string, QuoteColumn> = Object.fromEntries(QUOTE_COLUMNS.map((c) => [c.key, c]));

const QUOTE_PRESETS: { key: string; label: string; cols: string[] }[] = [
  { key: "default", label: "Predefinita", cols: ["codice", "titolo", "cliente", "stato", "data", "totale"] },
  { key: "tratt", label: "Trattativa", cols: ["codice", "titolo", "cliente", "stato", "aggiornato", "totale"] },
  { key: "importi", label: "Importi", cols: ["codice", "cliente", "stato", "mese", "tantum", "totale"] },
];

const QCOLS_STORAGE_KEY = "quotes.table.columns";
const QPINNED = QUOTE_COLUMNS.filter((c) => c.pin).map((c) => c.key);

function normalizeQCols(cols: string[]): string[] {
  const uniq = cols.filter((k, i) => cols.indexOf(k) === i && QCOLMAP[k]);
  const rest = uniq.filter((k) => !QPINNED.includes(k));
  return [...QPINNED, ...rest];
}

function loadQCols(): string[] {
  try {
    const raw = localStorage.getItem(QCOLS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return normalizeQCols(parsed as string[]);
    }
  } catch {
    /* ignora */
  }
  return normalizeQCols(QUOTE_PRESETS[0].cols);
}

// ── Delete modal ──────────────────────────────────────────────────────────────

interface DeleteModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  quote: Quote | null;
  deleting: boolean;
}

function DeleteModal({ open, onClose, onConfirm, quote, deleting }: DeleteModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Elimina preventivo"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={deleting}>Annulla</Button>
          <Button variant="danger" onClick={onConfirm} loading={deleting}>Elimina</Button>
        </>
      }
    >
      <p className="font-body text-sm text-ink dark:text-[#f4f4f7]">
        Sei sicuro di voler eliminare il preventivo <strong>{quote?.title ?? quote?.number}</strong>
        {quote?.number ? ` (${quote.number})` : ""}?
      </p>
      <p className="font-body text-sm text-muted dark:text-[#9999a0] mt-2">
        Il preventivo verrà nascosto ma i dati resteranno nel database.
      </p>
    </Modal>
  );
}

// ── Pannello personalizza colonne ──────────────────────────────────────────────

function QColumnsPanel({
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
  const groups = [...new Set(QUOTE_COLUMNS.map((c) => c.group))];
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
      <div className="mb-4 flex flex-wrap gap-2">
        {QUOTE_PRESETS.map((p) => (
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
              {QUOTE_COLUMNS.filter((c) => c.group === g).map((c) => (
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

export function QuotesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, activeCompanyId } = useAuth();
  const isAdmin = !!user?.is_admin;
  const { selectedCompanyId } = useSelectedCompanyId(activeCompanyId ?? user?.company_id ?? null);
  const { quotes, total, page, totalPages, isLoading, error, refetch } = useQuotes();
  const isForbiddenError = (error ?? "").includes("[403]");
  const showFicActions = isAdmin;
  const toast = useToast();
  const currentCompanyId = selectedCompanyId ?? activeCompanyId ?? user?.company_id ?? null;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<QuoteStatus | "">("");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState<QuoteSortBy>("date");
  const [sortDir, setSortDir] = useState<QuoteSortDir>("desc");
  const [deleteQuote, setDeleteQuote] = useState<Quote | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [transitioning, setTransitioning] = useState<number | null>(null);
  const [selectedQuoteIds, setSelectedQuoteIds] = useState<number[]>([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkDeleteResponse | null>(null);

  // ── Colonne / viste / export ──
  const [activeCols, setActiveCols] = useState<string[]>(loadQCols);
  const [cpOpen, setCpOpen] = useState(false);
  const [viewsOpen, setViewsOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const persistCols = useCallback((cols: string[]) => {
    const next = normalizeQCols(cols);
    setActiveCols(next);
    try {
      localStorage.setItem(QCOLS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignora */
    }
    void saveUiPreferenceApi({ quotes_columns: next }).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    getUiPreferencesApi()
      .then((prefs) => {
        if (cancelled) return;
        const saved = (prefs as { quotes_columns?: unknown }).quotes_columns;
        if (Array.isArray(saved) && saved.length > 0) setActiveCols(normalizeQCols(saved as string[]));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const applyCols = (cols: string[]) => persistCols(cols);
  const toggleCol = (key: string) => {
    if (QCOLMAP[key]?.pin) return;
    applyCols(activeCols.includes(key) ? activeCols.filter((k) => k !== key) : [...activeCols, key]);
  };
  const activePreset = useMemo(
    () => QUOTE_PRESETS.find((p) => normalizeQCols(p.cols).join(",") === activeCols.join(",")),
    [activeCols]
  );

  const { push: pushToFic, isPushing: ficPushing, confirmPending: ficConfirm, confirmPush: ficConfirmPush, cancelConfirm: ficCancelConfirm, lastResult: ficResult, lastFicUrl, clearResult: ficClearResult } = usePushQuoteToFic();

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doRefetch = useCallback((q?: string, st?: QuoteStatus | "", nextPage = currentPage, nextSortBy = sortBy, nextSortDir = sortDir) => {
    refetch({
      q: q || undefined,
      status: (st || undefined) as QuoteStatus | undefined,
      company_id: currentCompanyId ?? undefined,
      page: nextPage,
      per_page: 20,
      sort_by: nextSortBy,
      sort_dir: nextSortDir,
    });
  }, [currentCompanyId, currentPage, sortBy, sortDir, refetch]);

  const handleSearch = (v: string) => {
    setSearch(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setCurrentPage(1);
    debounceRef.current = setTimeout(() => doRefetch(v, statusFilter, 1), 350);
  };

  const handleStatusFilter = (s: QuoteStatus | "") => {
    setStatusFilter(s);
    setCurrentPage(1);
    doRefetch(search, s, 1);
  };

  // Ordinamento tramite click sull'intestazione
  const handleSort = (key: QuoteSortBy) => {
    const dir: QuoteSortDir = sortBy === key && sortDir === "asc" ? "desc" : "asc";
    setSortBy(key);
    setSortDir(dir);
    setCurrentPage(1);
    doRefetch(search, statusFilter, 1, key, dir);
  };

  const handlePage = (nextPage: number) => {
    setCurrentPage(nextPage);
    doRefetch(search, statusFilter, nextPage);
  };

  useEffect(() => {
    setCurrentPage(1);
    doRefetch(search, statusFilter, 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCompanyId, location.search]);

  const handleTransition = useCallback(async (id: number, status: QuoteStatus) => {
    setTransitioning(id);
    try {
      await updateQuoteStatusApi(id, status);
      toast.success(`Preventivo → ${STATUS_LABELS[status]}`);
      doRefetch(search, statusFilter, currentPage);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore");
    } finally {
      setTransitioning(null);
    }
  }, [search, statusFilter, currentPage, doRefetch, toast]);

  const handleDuplicate = useCallback(async (id: number) => {
    try {
      const q = await duplicateQuoteApi(id);
      toast.success(`Duplicato come ${q.number}`);
      doRefetch(search, statusFilter, currentPage);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore");
    }
  }, [search, statusFilter, currentPage, doRefetch, toast]);

  const handleDelete = useCallback(async () => {
    if (!deleteQuote) return;
    setDeleting(true);
    try {
      await deleteQuoteApi(deleteQuote.id);
      toast.success("Preventivo eliminato");
      setDeleteQuote(null);
      doRefetch(search, statusFilter, currentPage);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore");
    } finally {
      setDeleting(false);
    }
  }, [deleteQuote, search, statusFilter, currentPage, doRefetch, toast]);

  const handleCreateNew = useCallback(() => {
    navigate({ pathname: "/preventivo", search: "?new=1" });
  }, [navigate]);

  const openEdit = useCallback((q: Quote) => {
    const nextSearch = new URLSearchParams(location.search);
    nextSearch.set("quote_id", String(q.id));
    navigate({ pathname: "/preventivo", search: `?${nextSearch.toString()}` }, { state: { quoteId: q.id } });
  }, [navigate, location.search]);

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportQuotesCsvApi({
        q: search || undefined,
        status: (statusFilter || undefined) as QuoteStatus | undefined,
        company_id: currentCompanyId ?? undefined,
      });
      toast.success("Export CSV avviato");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore export CSV");
    } finally {
      setExporting(false);
    }
  };

  // canDelete: operatori solo su propri in bozza
  const canDelete = (q: Quote) => isAdmin || (q.created_by === user?.id && q.status === "bozza");

  const selectableQuotes = quotes.filter((quote) => canDelete(quote));
  const allSelectableVisibleSelected =
    selectableQuotes.length > 0 && selectableQuotes.every((quote) => selectedQuoteIds.includes(quote.id));

  const toggleSelectAllVisible = (checked: boolean) => {
    setSelectedQuoteIds((current) => {
      if (checked) {
        const merged = new Set([...current, ...selectableQuotes.map((quote) => quote.id)]);
        return Array.from(merged);
      }
      const selectableIds = new Set(selectableQuotes.map((quote) => quote.id));
      return current.filter((id) => !selectableIds.has(id));
    });
  };

  const toggleQuoteSelection = (quoteId: number, checked: boolean) => {
    setSelectedQuoteIds((current) => {
      if (checked) return Array.from(new Set([...current, quoteId]));
      return current.filter((id) => id !== quoteId);
    });
  };

  const handleBulkDelete = async () => {
    if (selectedQuoteIds.length === 0) return;
    setBulkDeleting(true);
    try {
      const response = await bulkDeleteQuotesApi(selectedQuoteIds);
      setBulkDeleteOpen(false);
      setBulkResult(response);
      setSelectedQuoteIds([]);
      toast.success(`Eliminati ${response.deleted_ids.length} su ${response.requested}`);
      doRefetch(search, statusFilter, currentPage);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore eliminazione bulk preventivi");
    } finally {
      setBulkDeleting(false);
    }
  };

  const cols = activeCols;

  // Valore da mostrare/copiare per una cella (rispetta euro e mascheramento non-admin)
  const displayValue = (col: QuoteColumn, q: Quote): string => {
    if (col.euro) {
      const v = col.get(q);
      if (!isAdmin || v == null) return "";
      return formatEur(v as number);
    }
    const v = col.get(q);
    return v == null ? "" : String(v);
  };

  const copyVal = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copiato`);
    } catch {
      toast.error("Copia non riuscita");
    }
  };
  const copyRow = async (q: Quote) => {
    const line = cols.map((k) => displayValue(QCOLMAP[k], q)).join("\t");
    try {
      await navigator.clipboard.writeText(line);
      toast.success("Riga copiata (incolla in Excel/Sheets)");
    } catch {
      toast.error("Copia non riuscita");
    }
  };

  return (
    <div className="cl-scope flex h-full min-h-0 flex-col overflow-hidden px-6 py-6 mx-auto w-full animate-fadeIn">

      {/* ── Header ── */}
      <div className="mb-6 flex shrink-0 items-start justify-between gap-4">
        <div>
          <div className="section-eyebrow">
            <Icon name="activity" className="w-3.5 h-3.5" />
            Commerciale
          </div>
          <h1 className="section-title">Preventivi</h1>
          <p className="section-lead">
            {isLoading ? "Caricamento…" : `${total} preventiv${total === 1 ? "o" : "i"}`}
          </p>
        </div>
        <Button variant="primary" leftIcon={<Icon name="plus" className="w-4 h-4" />} onClick={handleCreateNew}>
          Nuovo preventivo
        </Button>
      </div>

      {/* ── Toolbar ── */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted dark:text-[#9999a0] pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Cerca codice, titolo, cliente, tag…"
            className="w-full pl-9 pr-4 py-2 rounded-md text-[13px] font-body text-ink dark:text-[#f4f4f7] bg-paper dark:bg-[#1c1c20] border border-line dark:border-[#2a2a2e] placeholder:text-muted/60 dark:placeholder:text-[#9999a0]/60 outline-none focus:border-ink dark:focus:border-[#f4f4f7] transition-colors"
          />
        </div>

        {/* Status tabs */}
        <div className="seg-switch">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => handleStatusFilter(tab.value)}
              className={statusFilter === tab.value ? "is-active" : ""}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {selectedQuoteIds.length > 0 && (
          <Button variant="danger-ghost" leftIcon={<Icon name="trash" className="w-4 h-4" />} onClick={() => setBulkDeleteOpen(true)}>
            Elimina ({selectedQuoteIds.length})
          </Button>
        )}

        {/* Viste */}
        <div className="cl-views">
          <button type="button" className={"cl-viewbtn" + (viewsOpen ? " on" : "")} onClick={() => setViewsOpen((v) => !v)}>
            <Icon name="grid" className="w-4 h-4" /> {activePreset ? activePreset.label : "Vista personalizzata"} <Icon name="chevron-down" className="w-3.5 h-3.5" />
          </button>
          {viewsOpen && (
            <>
              <div className="cl-views-back" onClick={() => setViewsOpen(false)} />
              <div className="cl-views-menu">
                <div className="cl-views-h">Viste salvate</div>
                {QUOTE_PRESETS.map((p) => {
                  const on = normalizeQCols(p.cols).join(",") === cols.join(",");
                  return (
                    <button
                      key={p.key}
                      type="button"
                      className={"cl-views-opt" + (on ? " on" : "")}
                      onClick={() => { applyCols(p.cols); setViewsOpen(false); }}
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
        <button type="button" className="cl-iconbtn" onClick={() => void handleExport()} disabled={exporting} title="Esporta CSV" aria-label="Esporta CSV">
          <Icon name="download" className="w-4 h-4" />
        </button>
      </div>

      {/* ── Tabella ── */}
      <div className="cl-board min-h-0 flex-1">
        <div className="cl-tablewrap">
          {isLoading ? (
            <div className="flex items-center justify-center h-full py-20"><Spinner size="lg" /></div>
          ) : error ? (
            <div className="flex items-center justify-center h-full py-20">
              {isForbiddenError ? (
                <div className="flex flex-col items-center text-muted dark:text-[#9999a0]">
                  <Icon name="shield" className="w-10 h-10 mb-3 opacity-40" />
                  <p className="font-body text-sm">Non hai accesso ai preventivi.</p>
                </div>
              ) : (
                <p className="font-body text-sm text-danger">{error}</p>
              )}
            </div>
          ) : quotes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-20 text-muted dark:text-[#9999a0]">
              <Icon name="activity" className="w-10 h-10 mb-3 opacity-30" />
              <p className="font-body text-sm">{search || statusFilter ? "Nessun risultato" : "Nessun preventivo"}</p>
            </div>
          ) : (
            <table className="cl-table">
              <thead>
                <tr>
                  <th className="cl-th chk">
                    <Checkbox checked={allSelectableVisibleSelected} onChange={toggleSelectAllVisible} />
                  </th>
                  {cols.map((k) => {
                    const c = QCOLMAP[k];
                    const sortable = !!c.sortKey;
                    const active = sortable && sortBy === c.sortKey;
                    return (
                      <th
                        key={k}
                        className={"cl-th" + (sortable ? " sortable" : "") + (c.pin ? " pin" : "") + (c.num ? " num" : "")}
                        style={{ minWidth: c.num ? 120 : 150 }}
                        onClick={sortable ? () => handleSort(c.sortKey!) : undefined}
                        title={sortable ? `Ordina per ${c.label}` : undefined}
                      >
                        <span className="cl-th-label">{c.label}</span>
                        {sortable && (
                          <span className={"cl-th-sort" + (active ? "" : " idle")}>
                            <Icon name="chevron-down" className={"w-3 h-3" + (active && sortDir === "asc" ? " rotate-180" : "")} />
                          </span>
                        )}
                      </th>
                    );
                  })}
                  <th className="cl-th act" />
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => (
                  <tr key={q.id} onClick={() => openEdit(q)}>
                    <td className="cl-td chk" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedQuoteIds.includes(q.id)}
                        onChange={(checked) => toggleQuoteSelection(q.id, checked)}
                        disabled={!canDelete(q)}
                      />
                    </td>
                    {cols.map((k) => {
                      const c = QCOLMAP[k];
                      if (c.badge) {
                        return (
                          <td key={k} className="cl-td">
                            <Badge variant={STATUS_VARIANT[q.status]}>{STATUS_LABELS[q.status]}</Badge>
                          </td>
                        );
                      }
                      if (c.euro) {
                        const shown = displayValue(c, q);
                        return (
                          <td key={k} className="cl-td num">
                            {shown ? shown : <i className="cl-empty">—</i>}
                          </td>
                        );
                      }
                      const value = c.get(q);
                      const empty = value == null || value === "";
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
                              onClick={(e) => { e.stopPropagation(); void copyVal(String(value), c.label); }}
                            >
                              <Icon name="copy" className="w-3 h-3" />
                            </button>
                          )}
                        </td>
                      );
                    })}
                    <td className="cl-td act" onClick={(e) => e.stopPropagation()}>
                      <div className="cl-rowact">
                        <button type="button" className="cl-rowbtn" title="Copia riga (TSV)" onClick={() => void copyRow(q)}>
                          <Icon name="copy" className="w-3.5 h-3.5" />
                        </button>
                        {showFicActions && (
                          <button
                            type="button"
                            className="cl-rowbtn"
                            onClick={() => pushToFic(q, () => doRefetch(search, statusFilter))}
                            disabled={ficPushing === q.id || !q.client_id}
                            title={!q.client_id ? "Associa un cliente per inviarlo a FIC" : q.fic_id ? `Reinvia a FIC (#${q.fic_id})` : "Invia a Fatture in Cloud"}
                          >
                            {ficPushing === q.id ? <Spinner size="sm" /> : <Icon name="upload" className="w-3.5 h-3.5" />}
                          </button>
                        )}
                        <StatusMenu quote={q} isAdmin={isAdmin} onTransition={handleTransition} transitioning={transitioning === q.id} />
                        <button type="button" className="cl-rowbtn" title="Duplica" onClick={() => handleDuplicate(q.id)}>
                          <Icon name="plus" className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" className="cl-rowbtn" title="Modifica" onClick={() => openEdit(q)}>
                          <Icon name="pencil" className="w-3.5 h-3.5" />
                        </button>
                        {canDelete(q) && (
                          <button type="button" className="cl-rowbtn danger" title="Elimina" onClick={() => setDeleteQuote(q)}>
                            <Icon name="trash" className="w-3.5 h-3.5" />
                          </button>
                        )}
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
      {totalPages > 1 && (
        <div className="flex shrink-0 items-center justify-between mt-3 px-1">
          <span className="text-[12px] text-muted dark:text-[#9999a0] font-body">
            Pagina {page} di {totalPages} · {total} preventivi
          </span>
          <div className="flex items-center gap-1">
            <button
              disabled={page <= 1}
              onClick={() => handlePage(page - 1)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line bg-paper text-ink transition-colors hover:bg-cream disabled:opacity-40 dark:border-[#2a2a2e] dark:bg-[#1c1c20] dark:text-[#f4f4f7] dark:hover:bg-[#252529]"
            >
              <Icon name="chevron-right" className="w-4 h-4 rotate-180" />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
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
              disabled={page >= totalPages}
              onClick={() => handlePage(page + 1)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line bg-paper text-ink transition-colors hover:bg-cream disabled:opacity-40 dark:border-[#2a2a2e] dark:bg-[#1c1c20] dark:text-[#f4f4f7] dark:hover:bg-[#252529]"
            >
              <Icon name="chevron-right" className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <QColumnsPanel open={cpOpen} onClose={() => setCpOpen(false)} active={cols} onToggle={toggleCol} onPreset={applyCols} />

      {/* ── Modals ── */}
      <DeleteModal open={!!deleteQuote} onClose={() => setDeleteQuote(null)} onConfirm={handleDelete} quote={deleteQuote} deleting={deleting} />

      {showFicActions && (
        <>
          <Modal
            open={!!ficConfirm}
            onClose={ficCancelConfirm}
            title="Preventivo già inviato a FIC"
            size="sm"
            footer={
              <>
                <Button variant="ghost" onClick={ficCancelConfirm}>Annulla</Button>
                <Button variant="primary" onClick={ficConfirmPush}>Invia copia</Button>
              </>
            }
          >
            <p className="text-sm font-body text-ink dark:text-[#f4f4f7]">
              Questo preventivo è già stato inviato a FIC{ficConfirm ? ` (doc #${ficConfirm.ficId})` : ""}.
            </p>
            <p className="text-sm font-body text-muted dark:text-[#9999a0] mt-2">
              Vuoi crearne una nuova copia su Fatture in Cloud?
            </p>
          </Modal>

          <Modal
            open={!!lastFicUrl}
            onClose={ficClearResult}
            title="Inviato a Fatture in Cloud"
            size="sm"
            footer={<Button variant="ghost" onClick={ficClearResult}>Chiudi</Button>}
          >
            <p className="text-sm font-body text-ink dark:text-[#f4f4f7] mb-4">
              Documento FIC #{ficResult?.fic_document_id} creato con successo.
            </p>
            {lastFicUrl && (
              <a
                href={lastFicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-md bg-success/10 text-success px-4 py-2 text-sm font-semibold hover:bg-success/20 transition-colors"
              >
                <Icon name="upload" className="w-4 h-4" />
                Apri su Fatture in Cloud
              </a>
            )}
          </Modal>
        </>
      )}

      <Modal
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        title="Elimina preventivi selezionati"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setBulkDeleteOpen(false)} disabled={bulkDeleting}>Annulla</Button>
            <Button variant="danger" onClick={() => void handleBulkDelete()} loading={bulkDeleting}>Elimina selezionati</Button>
          </>
        }
      >
        <p className="text-sm font-body text-ink dark:text-[#f4f4f7]">
          Confermi l'eliminazione di <strong>{selectedQuoteIds.length}</strong> preventivi?
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
        <ul className="max-h-64 overflow-auto space-y-1 text-sm text-danger">
          {bulkResult?.errors.map((item) => (
            <li key={item.id}>#{item.id}: {item.detail}</li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}
