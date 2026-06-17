import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useRequests } from "../hooks/useRequests";
import { useSelectedCompanyId } from "../hooks/useSelectedCompanyId";
import {
  bulkDeleteRequestsApi,
  createRequestApi,
  deleteRequestApi,
  duplicateRequestApi,
  updateRequestStatusApi,
} from "../api/requests";
import type { BulkDeleteResponse } from "../api/bulk";
import { formatEur, getAllowedTransitions, STATUS_ACTIONS, STATUS_LABELS, STATUS_VARIANT, type Quote, type QuoteSortBy, type QuoteSortDir, type QuoteStatus } from "../api/quotes";
import { useToast } from "../context/ToastContext";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Checkbox } from "../components/ui/Checkbox";
import { Modal } from "../components/ui/Modal";
import { SearchableSelect } from "../components/ui/SearchableSelect";
import { Icon } from "../components/ui/Icon";
import { Spinner } from "../components/ui/Spinner";
import { normalizeCompanyPayload } from "../utils/companyPayload";

const STATUS_TABS: { label: string; value: QuoteStatus | "" }[] = [
  { label: "Tutti", value: "" },
  { label: "Bozza", value: "bozza" },
  { label: "Da approvare", value: "da_approvare" },
  { label: "In revisione", value: "in_revisione" },
  { label: "Inviato", value: "inviato" },
  { label: "Accettato", value: "accettato" },
  { label: "Rifiutato", value: "rifiutato" },
];

interface StatusMenuProps {
  request: Quote;
  isAdmin: boolean;
  onTransition: (id: number, status: QuoteStatus) => void;
  transitioning: boolean;
}

function StatusMenu({ request, isAdmin, onTransition, transitioning }: StatusMenuProps) {
  const [open, setOpen] = useState(false);
  const allowed = getAllowedTransitions(request.status, isAdmin);

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
            {allowed.map((status) => (
              <button
                key={status}
                onClick={() => {
                  onTransition(request.id, status);
                  setOpen(false);
                }}
                className="w-full px-4 py-2.5 text-left text-[13px] font-body text-ink dark:text-[#f4f4f7] hover:bg-cream dark:hover:bg-[#2a2a2e] transition-colors"
              >
                {STATUS_ACTIONS[status]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

interface DeleteModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  request: Quote | null;
  deleting: boolean;
}

function DeleteModal({ open, onClose, onConfirm, request, deleting }: DeleteModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Elimina richiesta"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={deleting}>Annulla</Button>
          <Button variant="danger" onClick={onConfirm} loading={deleting}>Elimina</Button>
        </>
      }
    >
      <p className="font-body text-sm text-ink dark:text-[#f4f4f7]">
        Sei sicuro di voler eliminare la richiesta <strong>{request?.title ?? request?.number}</strong>{request?.number ? ` (${request.number})` : ""}?
      </p>
      <p className="font-body text-sm text-muted dark:text-[#9999a0] mt-2">
        La richiesta verrà nascosta ma i dati resteranno nel database.
      </p>
    </Modal>
  );
}

export function RequestsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, activeCompanyId } = useAuth();
  const isAdmin = !!user?.is_admin;
  const { selectedCompanyId } = useSelectedCompanyId(activeCompanyId ?? user?.company_id ?? null);
  const { requests, total, page, totalPages, isLoading, error, refetch } = useRequests();
  const isForbiddenError = (error ?? "").includes("[403]");
  const toast = useToast();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<QuoteStatus | "">("");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState<QuoteSortBy>("date");
  const [sortDir, setSortDir] = useState<QuoteSortDir>("desc");
  const [creating, setCreating] = useState(false);
  const [deleteRequest, setDeleteRequest] = useState<Quote | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [transitioning, setTransitioning] = useState<number | null>(null);
  const [selectedRequestIds, setSelectedRequestIds] = useState<number[]>([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkDeleteResponse | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentCompanyId = selectedCompanyId ?? activeCompanyId ?? user?.company_id ?? null;

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

  const handleSearch = (value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setCurrentPage(1);
    debounceRef.current = setTimeout(() => doRefetch(value, statusFilter, 1), 350);
  };

  const handleStatusFilter = (value: QuoteStatus | "") => {
    setStatusFilter(value);
    setCurrentPage(1);
    doRefetch(search, value, 1);
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
      await updateRequestStatusApi(id, status);
      toast.success(`Richiesta → ${STATUS_LABELS[status]}`);
      doRefetch(search, statusFilter, currentPage);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore");
    } finally {
      setTransitioning(null);
    }
  }, [doRefetch, search, statusFilter, currentPage, toast]);

  const handleDuplicate = useCallback(async (id: number) => {
    try {
      const item = await duplicateRequestApi(id);
      toast.success(`Duplicata come ${item.number}`);
      doRefetch(search, statusFilter, currentPage);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore");
    }
  }, [doRefetch, search, statusFilter, currentPage, toast]);

  const handleDelete = useCallback(async () => {
    if (!deleteRequest) return;
    setDeleting(true);
    try {
      await deleteRequestApi(deleteRequest.id);
      toast.success("Richiesta eliminata");
      setDeleteRequest(null);
      doRefetch(search, statusFilter, currentPage);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore");
    } finally {
      setDeleting(false);
    }
  }, [deleteRequest, doRefetch, search, statusFilter, currentPage, toast]);

  const handleCreateNew = useCallback(async () => {
    setCreating(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const companyPayload = normalizeCompanyPayload(
        currentCompanyId,
        user?.company_ids ?? (currentCompanyId != null ? [currentCompanyId] : [])
      );
      const request = await createRequestApi({
        date: today,
        tag: null,
        notes: null,
        discount_pct: 0,
        discount_eur: 0,
        client_id: null,
        kind: "richiesta",
        ...companyPayload,
      });
      const nextSearch = new URLSearchParams(location.search);
      nextSearch.set("quote_id", String(request.id));
      navigate({ pathname: "/requests/edit", search: `?${nextSearch.toString()}` }, { state: { quoteId: request.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore creazione richiesta");
      setCreating(false);
    }
  }, [currentCompanyId, location.search, navigate, toast, user?.company_ids]);

  const canDelete = (request: Quote) => isAdmin || (request.created_by === user?.id && request.status === "bozza");

  const selectableRequests = requests.filter((request) => canDelete(request));
  const allSelectableVisibleSelected =
    selectableRequests.length > 0 && selectableRequests.every((request) => selectedRequestIds.includes(request.id));

  const toggleSelectAllVisible = (checked: boolean) => {
    setSelectedRequestIds((current) => {
      if (checked) {
        const merged = new Set([...current, ...selectableRequests.map((request) => request.id)]);
        return Array.from(merged);
      }
      const selectableIds = new Set(selectableRequests.map((request) => request.id));
      return current.filter((id) => !selectableIds.has(id));
    });
  };

  const toggleRequestSelection = (requestId: number, checked: boolean) => {
    setSelectedRequestIds((current) => {
      if (checked) return Array.from(new Set([...current, requestId]));
      return current.filter((id) => id !== requestId);
    });
  };

  const handleBulkDelete = async () => {
    if (selectedRequestIds.length === 0) return;
    setBulkDeleting(true);
    try {
      const response = await bulkDeleteRequestsApi(selectedRequestIds);
      setBulkDeleteOpen(false);
      setBulkResult(response);
      setSelectedRequestIds([]);
      toast.success(`Eliminati ${response.deleted_ids.length} su ${response.requested}`);
      doRefetch(search, statusFilter, currentPage);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore eliminazione bulk richieste");
    } finally {
      setBulkDeleting(false);
    }
  };

  return (
    <div className="px-10 py-8 pb-20 max-w-[1440px] mx-auto w-full animate-fadeIn">
      <div className="mb-8">
        <div className="section-eyebrow">
          <Icon name="activity" className="w-3.5 h-3.5" />
          Commerciale
        </div>
        <h1 className="section-title">Richieste</h1>
        <p className="section-lead">{isLoading ? "Caricamento…" : `${total} richiest${total === 1 ? "a" : "e"}`}</p>
      </div>

      <div className="flex flex-col gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted dark:text-[#9999a0] pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Cerca per titolo, numero, tag, note…"
              className="w-full pl-9 pr-4 py-2 rounded-md text-[13px] font-body text-ink dark:text-[#f4f4f7] bg-paper dark:bg-[#1c1c20] border border-line dark:border-[#2a2a2e] placeholder:text-muted/60 dark:placeholder:text-[#9999a0]/60 outline-none focus:border-ink dark:focus:border-[#f4f4f7] transition-colors"
            />
          </div>
          <div className="flex-1" />
          <Button
            variant="danger-ghost"
            leftIcon={<Icon name="trash" className="w-4 h-4" />}
            onClick={() => setBulkDeleteOpen(true)}
            disabled={selectedRequestIds.length === 0}
          >
            Elimina selezionati ({selectedRequestIds.length})
          </Button>
          <Button leftIcon={<Icon name="plus" className="w-4 h-4" />} onClick={handleCreateNew} loading={creating}>
            Nuova richiesta
          </Button>
        </div>

        <div className="flex gap-1 flex-wrap">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value || "all"}
              onClick={() => handleStatusFilter(tab.value)}
              className={`px-3.5 py-2 rounded-full text-[12px] font-semibold transition-colors ${statusFilter === tab.value ? "bg-ink text-paper dark:bg-[#f4f4f7] dark:text-[#131316]" : "bg-cream dark:bg-[#1c1c20] text-muted dark:text-[#9999a0] hover:text-ink dark:hover:text-[#f4f4f7]"}`}
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

      {error && !isForbiddenError && <div className="mb-4 rounded-md border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</div>}

      <div className="rounded-lg border border-line dark:border-[#2a2a2e] bg-paper dark:bg-[#131316] overflow-hidden">
        <div className="overflow-x-auto">
          <div
            className={isAdmin
              ? "grid grid-cols-[0.3fr_1.4fr_0.7fr_0.8fr_0.8fr_0.9fr_0.4fr] gap-2 px-4 py-3 border-b border-line dark:border-[#2a2a2e] bg-cream dark:bg-[#1c1c20] text-[11px] font-bold uppercase tracking-wider text-muted dark:text-[#9999a0] min-w-[980px]"
              : "grid grid-cols-[0.3fr_1.6fr_0.8fr_0.9fr_1fr_0.4fr] gap-2 px-4 py-3 border-b border-line dark:border-[#2a2a2e] bg-cream dark:bg-[#1c1c20] text-[11px] font-bold uppercase tracking-wider text-muted dark:text-[#9999a0] min-w-[980px]"}
          >
            <div><Checkbox checked={allSelectableVisibleSelected} onChange={toggleSelectAllVisible} /></div>
            <div>Titolo / numero / cliente</div>
            <div>Data</div>
            <div>Stato</div>
            {isAdmin && <div>Importo</div>}
            <div>Tag</div>
            <div className="text-right">Azioni</div>
          </div>
        </div>

        {isLoading ? (
          <div className="p-10 flex justify-center"><Spinner /></div>
        ) : isForbiddenError ? (
          <div className="p-10 text-center text-sm text-muted dark:text-[#9999a0]">
            <div className="flex flex-col items-center gap-2">
              <Icon name="shield" className="w-8 h-8 opacity-40" />
              <span>Non hai accesso alle richieste.</span>
            </div>
          </div>
        ) : requests.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted dark:text-[#9999a0]">Nessuna richiesta trovata.</div>
        ) : (
          <div className="divide-y divide-line dark:divide-[#2a2a2e]">
            {requests.map((request) => {
              const statusColor = STATUS_VARIANT[request.status];
              const rowClassName = isAdmin
                ? "grid grid-cols-[0.3fr_1.4fr_0.7fr_0.8fr_0.8fr_0.9fr_0.4fr] gap-2 items-center px-4 py-3 min-w-[980px] hover:bg-cream dark:hover:bg-[#1c1c20] transition-colors"
                : "grid grid-cols-[0.3fr_1.6fr_0.8fr_0.9fr_1fr_0.4fr] gap-2 items-center px-4 py-3 min-w-[980px] hover:bg-cream dark:hover:bg-[#1c1c20] transition-colors";
              return (
                <div
                  key={request.id}
                  className={rowClassName}
                >
                  <div>
                    <Checkbox
                      checked={selectedRequestIds.includes(request.id)}
                      onChange={(checked) => toggleRequestSelection(request.id, checked)}
                      disabled={!canDelete(request)}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate({ pathname: "/requests/edit", search: `?quote_id=${request.id}` }, { state: { quoteId: request.id } })}
                    className="text-left"
                  >
                    <div className="text-[13px] font-semibold text-ink dark:text-[#f4f4f7]">{request.title}</div>
                    <div className="text-[11px] text-muted dark:text-[#9999a0] truncate">{request.number}</div>
                    <div className="text-[11px] text-muted dark:text-[#9999a0] truncate">{request.client_id ? `Cliente #${request.client_id}` : "Cliente non associato"}</div>
                  </button>
                  <div className="text-[13px] text-ink dark:text-[#f4f4f7]">{new Date(request.date).toLocaleDateString("it-IT")}</div>
                  <div><Badge variant={statusColor}>{STATUS_LABELS[request.status]}</Badge></div>
                  {isAdmin && <div className="text-[13px] font-semibold text-ink dark:text-[#f4f4f7]">{formatEur(request.totals?.total ?? 0)}</div>}
                  <div className="text-[12px] text-muted dark:text-[#9999a0] truncate">{request.tag ?? "-"}</div>
                  <div className="flex items-center justify-end gap-2">
                    <StatusMenu request={request} isAdmin={isAdmin} onTransition={handleTransition} transitioning={transitioning === request.id} />
                    <button type="button" onClick={() => handleDuplicate(request.id)} className="p-1.5 rounded-md text-muted dark:text-[#9999a0] hover:text-ink dark:hover:text-[#f4f4f7] hover:bg-line dark:hover:bg-[#2a2a2e] transition-colors" title="Duplica richiesta">
                      <Icon name="refresh-cw" className="w-4 h-4" />
                    </button>
                    {canDelete(request) ? (
                      <button type="button" onClick={() => setDeleteRequest(request)} className="p-1.5 rounded-md text-danger hover:bg-danger/10 transition-colors" title="Elimina richiesta">
                        <Icon name="trash" className="w-4 h-4" />
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 px-1">
          <span className="text-[12px] text-muted dark:text-[#9999a0] font-body">
            Pagina {page} di {totalPages} · {total} richieste
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

      <DeleteModal open={deleteRequest != null} onClose={() => setDeleteRequest(null)} onConfirm={handleDelete} request={deleteRequest} deleting={deleting} />

      <Modal
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        title="Elimina richieste selezionate"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setBulkDeleteOpen(false)} disabled={bulkDeleting}>Annulla</Button>
            <Button variant="danger" onClick={() => void handleBulkDelete()} loading={bulkDeleting}>Elimina selezionate</Button>
          </>
        }
      >
        <p className="text-sm text-ink dark:text-[#f4f4f7]">
          Confermi l'eliminazione di <strong>{selectedRequestIds.length}</strong> richieste?
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
          Eliminate {bulkResult?.deleted_ids.length ?? 0} su {bulkResult?.requested ?? 0}.
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
