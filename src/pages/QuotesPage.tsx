import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useQuotes } from "../hooks/useQuotes";
import { useSelectedCompanyId } from "../hooks/useSelectedCompanyId";
import {
  bulkDeleteQuotesApi,
  updateQuoteStatusApi,
  duplicateQuoteApi,
  deleteQuoteApi,
  getAllowedTransitions,
  formatEur,
  STATUS_LABELS,
  STATUS_ACTIONS,
  STATUS_VARIANT,
  type QuoteSortBy,
  type QuoteSortDir,
  type Quote,
  type QuoteStatus,
} from "../api/quotes";
import type { BulkDeleteResponse } from "../api/bulk";
import { useToast } from "../context/ToastContext";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Checkbox } from "../components/ui/Checkbox";
import { Modal } from "../components/ui/Modal";
import { SearchableSelect } from "../components/ui/SearchableSelect";
import { Icon } from "../components/ui/Icon";
import { Spinner } from "../components/ui/Spinner";
import { usePushQuoteToFic } from "../hooks/usePushQuoteToFic";

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

// ── Status action dropdown ────────────────────────────────────────────────────

interface StatusMenuProps {
  quote: Quote;
  isAdmin: boolean;
  onTransition: (id: number, status: QuoteStatus) => void;
  transitioning: boolean;
}

function StatusMenu({ quote, isAdmin, onTransition, transitioning }: StatusMenuProps) {
  const [open, setOpen] = useState(false);
  const allowed = getAllowedTransitions(quote.status, isAdmin);

  if (allowed.length === 0) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={transitioning}
        className="p-1.5 rounded-md text-muted dark:text-[#9999a0] hover:text-ink dark:hover:text-[#f4f4f7] hover:bg-line dark:hover:bg-[#2a2a2e] transition-colors disabled:opacity-40"
        title="Cambia stato"
      >
        <Icon name="chevron-down" className="w-4 h-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 min-w-[180px] bg-paper dark:bg-[#1c1c20] rounded-lg border border-line dark:border-[#2a2a2e] shadow-lg overflow-hidden">
            {allowed.map((s) => (
              <button
                key={s}
                onClick={() => { onTransition(quote.id, s); setOpen(false); }}
                className="w-full px-4 py-2.5 text-left text-[13px] font-body text-ink dark:text-[#f4f4f7] hover:bg-cream dark:hover:bg-[#2a2a2e] transition-colors"
              >
                {STATUS_ACTIONS[s]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
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
        Sei sicuro di voler eliminare il preventivo{" "}
        <strong>{quote?.title ?? quote?.number}</strong>
        {quote?.number ? ` (${quote.number})` : ""}?
      </p>
      <p className="font-body text-sm text-muted dark:text-[#9999a0] mt-2">
        Il preventivo verrà nascosto ma i dati resteranno nel database.
      </p>
    </Modal>
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

  const handleSortBy = (value: string) => {
    const next = value as QuoteSortBy;
    setSortBy(next);
    setCurrentPage(1);
    doRefetch(search, statusFilter, 1, next, sortDir);
  };

  const handleSortDir = (value: string) => {
    const next = value as QuoteSortDir;
    setSortDir(next);
    setCurrentPage(1);
    doRefetch(search, statusFilter, 1, sortBy, next);
  };

  const handlePage = (nextPage: number) => {
    setCurrentPage(nextPage);
    doRefetch(search, statusFilter, nextPage);
  };

  useEffect(() => {
    setCurrentPage(1);
    doRefetch(search, statusFilter, 1);
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

  // canDelete: operatori solo su propri in bozza
  const canDelete = (q: Quote) =>
    isAdmin || (q.created_by === user?.id && q.status === "bozza");

  const formatFicSyncDate = (value: string | null): string => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

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

  return (
    <div className="px-10 py-8 pb-20 max-w-[1440px] mx-auto w-full animate-fadeIn">

      {/* ── Header ── */}
      <div className="mb-8">
        <div className="section-eyebrow">
          <Icon name="activity" className="w-3.5 h-3.5" />
          Commerciale
        </div>
        <h1 className="section-title">
          Preventivi
        </h1>
        <p className="section-lead">
          {isLoading ? "Caricamento…" : `${total} preventiv${total === 1 ? "o" : "i"}`}
        </p>
      </div>

      {/* ── Toolbar ── */}
      <div className="flex flex-col gap-3 mb-5">
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Icon
              name="search"
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted dark:text-[#9999a0] pointer-events-none"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Cerca per titolo, numero, tag, note…"
              className="w-full pl-9 pr-4 py-2 rounded-md text-[13px] font-body text-ink dark:text-[#f4f4f7] bg-paper dark:bg-[#1c1c20] border border-line dark:border-[#2a2a2e] placeholder:text-muted/60 dark:placeholder:text-[#9999a0]/60 outline-none focus:border-ink dark:focus:border-[#f4f4f7] transition-colors"
            />
          </div>
          <div className="flex-1" />
          {selectedQuoteIds.length > 0 && (
            <Button
              variant="danger-ghost"
              leftIcon={<Icon name="trash" className="w-4 h-4" />}
              onClick={() => setBulkDeleteOpen(true)}
            >
              Elimina selezionati ({selectedQuoteIds.length})
            </Button>
          )}
          <Button
            leftIcon={<Icon name="plus" className="w-4 h-4" />}
            onClick={handleCreateNew}
          >
            Nuovo preventivo
          </Button>
        </div>

        {/* Status tabs */}
        <div className="flex gap-1 flex-wrap">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => handleStatusFilter(tab.value)}
              className={`px-3 py-1.5 rounded-pill text-[11px] font-semibold uppercase tracking-wider transition-colors font-body ${
                statusFilter === tab.value
                  ? "bg-ink dark:bg-[#f4f4f7] text-paper dark:text-ink"
                  : "border border-line dark:border-[#2a2a2e] text-muted dark:text-[#9999a0] hover:border-ink dark:hover:border-[#f4f4f7] hover:text-ink dark:hover:text-[#f4f4f7]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <SearchableSelect
            className="w-44"
            value={sortBy}
            onChange={handleSortBy}
            options={[
              { value: "date", label: "Ordina per data" },
              { value: "created_at", label: "Creato il" },
              { value: "updated_at", label: "Aggiornato il" },
              { value: "number", label: "Numero" },
              { value: "title", label: "Titolo" },
            ]}
            placeholder="Ordina per"
            searchPlaceholder="Cerca ordinamento..."
          />
          <SearchableSelect
            className="w-36"
            value={sortDir}
            onChange={handleSortDir}
            options={[
              { value: "desc", label: "Decrescente" },
              { value: "asc", label: "Crescente" },
            ]}
            placeholder="Direzione"
            searchPlaceholder="Cerca direzione..."
          />
        </div>
      </div>

      {/* ── Table ── */}
      <div className="bg-paper dark:bg-[#131316] rounded-lg border border-line dark:border-[#2a2a2e] overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Spinner size="lg" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-20">
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
          <div className="flex flex-col items-center justify-center py-20 text-muted dark:text-[#9999a0]">
            <Icon name="activity" className="w-10 h-10 mb-3 opacity-30" />
            <p className="font-body text-sm">
              {search || statusFilter ? "Nessun risultato" : "Nessun preventivo"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm font-body">
              <thead>
                <tr className="border-b border-line dark:border-[#2a2a2e]">
                  <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                    <Checkbox checked={allSelectableVisibleSelected} onChange={toggleSelectAllVisible} />
                  </th>
                  {[
                    "Titolo",
                    "Numero",
                    "Data",
                    "Tag",
                    "ID FIC",
                    "Azienda FIC",
                    "Ultimo sync FIC",
                    ...(isAdmin ? ["Totale"] : []),
                    "Stato",
                    ...(showFicActions ? ["Apri su FIC"] : []),
                    "",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted dark:text-[#9999a0]"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line dark:divide-[#2a2a2e]">
                {quotes.map((q) => (
                  <tr
                    key={q.id}
                    className="hover:bg-cream dark:hover:bg-[#1c1c20] transition-colors duration-100"
                  >
                    <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                      <Checkbox
                        checked={selectedQuoteIds.includes(q.id)}
                        onChange={(checked) => toggleQuoteSelection(q.id, checked)}
                        disabled={!canDelete(q)}
                      />
                    </td>
                    {/* Titolo */}
                    <td className="px-6 py-3">
                      <span className="font-semibold text-ink dark:text-[#f4f4f7]">
                        {q.title}
                      </span>
                    </td>
                    {/* Numero */}
                    <td className="px-6 py-3">
                      <span className="font-mono font-semibold text-ink dark:text-[#f4f4f7]">
                        {q.number}
                      </span>
                      {q.duplicated_from && (
                        <span className="ml-2 text-[10px] text-muted dark:text-[#9999a0]">
                          da {q.duplicated_from}
                        </span>
                      )}
                    </td>
                    {/* Data */}
                    <td className="px-6 py-3 text-ink dark:text-[#f4f4f7] whitespace-nowrap">
                      {new Date(q.date).toLocaleDateString("it-IT")}
                    </td>
                    {/* Tag */}
                    <td className="px-6 py-3 text-ink dark:text-[#f4f4f7] max-w-[220px] truncate">
                      {q.tag ?? <span className="text-muted dark:text-[#9999a0]">—</span>}
                    </td>
                    {/* ID FIC */}
                    <td className="px-6 py-3 text-ink dark:text-[#f4f4f7] font-mono text-[12px] whitespace-nowrap">
                      {q.fic_id ?? <span className="text-muted dark:text-[#9999a0]">—</span>}
                    </td>
                    {/* Azienda FIC */}
                    <td className="px-6 py-3 text-ink dark:text-[#f4f4f7] whitespace-nowrap">
                      {q.fic_company_id ?? <span className="text-muted dark:text-[#9999a0]">—</span>}
                    </td>
                    {/* Ultimo sync FIC */}
                    <td className="px-6 py-3 text-ink dark:text-[#f4f4f7] whitespace-nowrap">
                      {q.fic_pushed_at ? formatFicSyncDate(q.fic_pushed_at) : <span className="text-muted dark:text-[#9999a0]">—</span>}
                    </td>
                    {isAdmin && (
                      <td className="px-6 py-3 whitespace-nowrap">
                        {q.totals ? (
                          <div>
                            <span className="font-semibold text-ink dark:text-[#f4f4f7]">
                              {formatEur(q.totals.total)}
                            </span>
                            {q.totals.monthly > 0 && (
                              <span className="block text-[10px] text-muted dark:text-[#9999a0]">
                                {formatEur(q.totals.monthly)}/mese
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted dark:text-[#9999a0]">—</span>
                        )}
                      </td>
                    )}
                    {/* Stato */}
                    <td className="px-6 py-3">
                      <Badge variant={STATUS_VARIANT[q.status]}>
                        {STATUS_LABELS[q.status]}
                      </Badge>
                    </td>
                    {/* Apri su FIC */}
                    {showFicActions && (
                      <td className="px-6 py-3">
                        {q.fic_document_url ? (
                          <a
                            href={q.fic_document_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(event) => event.stopPropagation()}
                            className="inline-flex items-center gap-1 rounded-md border border-success/30 bg-success/10 px-2.5 py-1 text-[11px] font-semibold text-success transition-colors hover:bg-success/20"
                          >
                            Apri
                          </a>
                        ) : (
                          <span className="text-muted dark:text-[#9999a0]">—</span>
                        )}
                      </td>
                    )}
                    {/* Actions */}
                    <td className="px-6 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {/* Invia a FIC */}
                        {showFicActions && (
                          <button
                            onClick={() => pushToFic(q, () => doRefetch(search, statusFilter))}
                            disabled={ficPushing === q.id || !q.client_id}
                            className="p-1.5 rounded-md text-muted dark:text-[#9999a0] hover:text-success hover:bg-success/10 transition-colors disabled:opacity-40"
                            title={
                              !q.client_id
                                ? 'Associa un cliente al preventivo per inviarlo a FIC'
                                : q.fic_id
                                ? `Invia di nuovo a FIC (già inviato: #${q.fic_id})`
                                : 'Invia a Fatture in Cloud'
                            }
                          >
                            {ficPushing === q.id ? (
                              <Spinner size="sm" />
                            ) : (
                              <Icon name="upload" className="w-4 h-4" />
                            )}
                          </button>
                        )}
                        {/* Cambia stato */}
                        <StatusMenu
                          quote={q}
                          isAdmin={isAdmin}
                          onTransition={handleTransition}
                          transitioning={transitioning === q.id}
                        />
                        {/* Duplica */}
                        <button
                          onClick={() => handleDuplicate(q.id)}
                          className="p-1.5 rounded-md text-muted dark:text-[#9999a0] hover:text-ink dark:hover:text-[#f4f4f7] hover:bg-line dark:hover:bg-[#2a2a2e] transition-colors"
                          title="Duplica"
                        >
                          <Icon name="plus" className="w-4 h-4" />
                        </button>
                        {/* Modifica */}
                        <button
                          onClick={() => {
                            const nextSearch = new URLSearchParams(location.search);
                            nextSearch.set("quote_id", String(q.id));
                            navigate({ pathname: "/preventivo", search: `?${nextSearch.toString()}` }, { state: { quoteId: q.id } });
                          }}
                          className="p-1.5 rounded-md text-muted dark:text-[#9999a0] hover:text-ink dark:hover:text-[#f4f4f7] hover:bg-line dark:hover:bg-[#2a2a2e] transition-colors"
                          title="Modifica"
                        >
                          <Icon name="pencil" className="w-4 h-4" />
                        </button>
                        {/* Elimina */}
                        {canDelete(q) && (
                          <button
                            onClick={() => setDeleteQuote(q)}
                            className="p-1.5 rounded-md text-muted dark:text-[#9999a0] hover:text-danger hover:bg-danger/10 transition-colors"
                            title="Elimina"
                          >
                            <Icon name="trash" className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 px-1">
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

      {/* ── Modals ── */}
      <DeleteModal
        open={!!deleteQuote}
        onClose={() => setDeleteQuote(null)}
        onConfirm={handleDelete}
        quote={deleteQuote}
        deleting={deleting}
      />

      {showFicActions && (
        <>
          {/* ── FIC duplicate confirm ── */}
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

          {/* ── FIC result link ── */}
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
