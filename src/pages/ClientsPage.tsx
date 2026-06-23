import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useClients } from "../hooks/useClients";
import { useSelectedCompanyId } from "../hooks/useSelectedCompanyId";
import {
  bulkDeleteClientsApi,
  deleteClientApi,
  type Client,
  type GetClientsParams,
} from "../api/clients";
import type { BulkDeleteResponse } from "../api/bulk";
import { useToast } from "../context/ToastContext";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Checkbox } from "../components/ui/Checkbox";
import { Modal } from "../components/ui/Modal";
import { Icon } from "../components/ui/Icon";
import { Spinner } from "../components/ui/Spinner";
import { SearchableSelect } from "../components/ui/SearchableSelect";
import { ClientModal } from "../components/clients/ClientModal";
import { FicImportClientModal } from "../components/clients/FicImportClientModal";

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
      page: currentPage,
      per_page: PER_PAGE,
      ...overrides,
    }),
    [search, selectedCompanyId, typeFilter, cityFilter, provFilter, eInvoiceFilter, currentPage]
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
  }, [deleteClient, refetch, search, selectedCompanyId, toast]);

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

  return (
    <div className="px-10 py-8 pb-20 max-w-[1440px] mx-auto w-full animate-fadeIn overflow-x-hidden">

      {/* ── Header ── */}
      <div className="mb-8">
        <div className="section-eyebrow">
          <Icon name="users" className="w-3.5 h-3.5" />
          Anagrafica
        </div>
        <h1 className="section-title">
          Clienti
        </h1>
        <p className="section-lead">
          {isLoading
            ? "Caricamento…"
            : `${total} client${total === 1 ? "e" : "i"}`}
        </p>
      </div>

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-3 mb-5">
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
            placeholder="Cerca per ragione sociale, nome commerciale, email, città, P.IVA…"
            className="w-full pl-9 pr-4 py-2 rounded-md text-[13px] font-body text-ink dark:text-[#f4f4f7] bg-paper dark:bg-[#1c1c20] border border-line dark:border-[#2a2a2e] placeholder:text-muted/60 dark:placeholder:text-[#9999a0]/60 outline-none focus:border-ink dark:focus:border-[#f4f4f7] transition-colors"
          />
        </div>
        {/* Type filter */}
        <SearchableSelect
          className="w-44"
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
          className="h-9 w-32 rounded-pill border border-line bg-paper px-3 text-[12px] font-semibold text-ink outline-none transition-colors placeholder:text-muted/60 focus:border-ink dark:border-[#2a2a2e] dark:bg-[#1c1c20] dark:text-[#f4f4f7]"
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
          className="w-44"
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
            Elimina selezionati ({selectedClientIds.length})
          </Button>
        )}
        <Button
          variant="primary"
          leftIcon={<Icon name="plus" className="w-4 h-4" />}
          onClick={() => setCreateOpen(true)}
        >
          Nuovo cliente
        </Button>
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

      {/* ── Table ── */}
      <div className="bg-paper dark:bg-[#131316] rounded-lg border border-line dark:border-[#2a2a2e] overflow-hidden" style={{ height: "calc(100vh - 380px)", minHeight: 280, display: "flex", flexDirection: "column" }}>
        {isLoading ? (
          <div className="flex items-center justify-center py-20 flex-1">
            <Spinner size="lg" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-20 flex-1">
            <p className="font-body text-sm text-danger">{error}</p>
          </div>
        ) : clients.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 flex-1 text-muted dark:text-[#9999a0]">
            <Icon name="users" className="w-10 h-10 mb-3 opacity-30" />
            <p className="font-body text-sm">
              {search ? "Nessun risultato per questa ricerca" : "Nessun cliente"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto overflow-y-auto flex-1">
            <table className="w-full text-sm font-body">
              <thead>
                <tr className="border-b border-line dark:border-[#2a2a2e]">
                  <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                    <Checkbox checked={allVisibleSelected} onChange={toggleSelectAllVisible} />
                  </th>
                  {["Tipo", "Cliente", "Referente", "Email", "Telefono", "Città", "P.IVA", "Utenti", "FIC", ""].map((h) => (
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
                {clients.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => navigate(`/clients/${c.id}`)}
                    className="hover:bg-cream dark:hover:bg-[#1c1c20] transition-colors duration-100 cursor-pointer"
                  >
                    <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                      <Checkbox
                        checked={selectedClientIds.includes(c.id)}
                        onChange={(checked: boolean) => toggleClientSelection(c.id, checked)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      {c.type === "company" ? (
                        <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                          Azienda
                        </span>
                      ) : c.type === "person" ? (
                        <span className="inline-flex items-center rounded-full bg-line px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted dark:bg-[#2a2a2e] dark:text-[#9999a0]">
                          Persona
                        </span>
                      ) : (
                        <span className="text-muted dark:text-[#9999a0]">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex flex-col">
                        <span className="font-semibold text-ink dark:text-[#f4f4f7]">{c.commercial_name ?? c.name}</span>
                        {c.commercial_name && (
                          <span className="text-[11px] text-muted dark:text-[#9999a0]">{c.name}</span>
                        )}
                      </div>
                      {c.code && (
                        <span className="ml-2 font-mono text-[10px] text-muted dark:text-[#9999a0]">
                          {c.code}
                        </span>
                      )}
                      {c.sdi && (
                        <span className="ml-1 font-mono text-[10px] text-muted dark:text-[#9999a0]">
                          SDI: {c.sdi}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-ink dark:text-[#f4f4f7]">
                      {c.contact ?? <span className="text-muted dark:text-[#9999a0]">—</span>}
                    </td>
                    <td className="px-6 py-3 text-ink dark:text-[#f4f4f7]">
                      {c.email ? (
                        <a
                          href={`mailto:${c.email}`}
                          className="hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {c.email}
                        </a>
                      ) : (
                        <span className="text-muted dark:text-[#9999a0]">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-ink dark:text-[#f4f4f7]">
                      {c.phone ?? <span className="text-muted dark:text-[#9999a0]">—</span>}
                    </td>
                    <td className="px-6 py-3 text-ink dark:text-[#f4f4f7]">
                      {c.city
                        ? `${c.city}${c.prov ? ` (${c.prov})` : ""}`
                        : <span className="text-muted dark:text-[#9999a0]">—</span>}
                    </td>
                    <td className="px-6 py-3 font-mono text-[12px] text-ink dark:text-[#f4f4f7]">
                      {c.vat ?? <span className="text-muted dark:text-[#9999a0]">—</span>}
                    </td>
                    <td className="px-6 py-3">
                      {c.assigned_user_ids?.length ? (
                        <Badge variant="default">{c.assigned_user_ids.length}</Badge>
                      ) : (
                        <span className="text-muted dark:text-[#9999a0]">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      {c.fic_id != null ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-success">
                          FIC #{c.fic_id}
                        </span>
                      ) : (
                        <span className="text-muted dark:text-[#9999a0]">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setEditClient(c)}
                          className="p-1.5 rounded-md text-muted dark:text-[#9999a0] hover:text-ink dark:hover:text-[#f4f4f7] hover:bg-line dark:hover:bg-[#2a2a2e] transition-colors"
                          title="Modifica"
                        >
                          <Icon name="pencil" className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteClient(c)}
                          className="p-1.5 rounded-md text-muted dark:text-[#9999a0] hover:text-danger hover:bg-danger/10 transition-colors"
                          title="Elimina"
                        >
                          <Icon name="trash" className="w-4 h-4" />
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

      {/* ── Pagination ── */}
      {pages > 1 && (
        <div className="flex items-center justify-between mt-4 px-1">
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
