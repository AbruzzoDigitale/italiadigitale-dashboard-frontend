import { useEffect, useRef, useState } from "react";
import {
  searchFicClientsApi,
  type FicClientSearchItem,
} from "../../api/fic";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

interface Props {
  /** Label of the action button per row */
  actionLabel?: string;
  onAction: (item: FicClientSearchItem) => void;
  loadingId?: number | null;
  showStatusColumn?: boolean;
}

export function FicClientSearchPanel({
  actionLabel = "Importa",
  onAction,
  loadingId,
  showStatusColumn = true,
}: Props) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<FicClientSearchItem[] | null>(null);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // auto-load on mount
  useEffect(() => {
    void runSearch(1, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runSearch = async (p: number, query: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await searchFicClientsApi({
        page: p,
        per_page: 15,
        q: query || undefined,
      });
      setResults(res.data);
      setLastPage(res.last_page);
      setTotal(res.total);
      setPage(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore ricerca clienti FiC");
    } finally {
      setLoading(false);
    }
  };

  const handleQ = (value: string) => {
    setQ(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void runSearch(1, value), 350);
  };

  return (
    <div className="rounded-md border border-line dark:border-line-dark p-3 space-y-3">
      {/* ── Filters ── */}
      <div className="grid grid-cols-1 gap-2">
        <Input
          label="Cerca"
          value={q}
          onChange={(e) => handleQ(e.target.value)}
          placeholder="Nome cliente, email, P.IVA..."
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="text-xs text-muted dark:text-muted-dark">
          Cerca un cliente FiC da selezionare.
        </div>
        <Button size="sm" onClick={() => void runSearch(1, q)} loading={loading}>
          Cerca
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</div>
      )}

      {/* ── Table ── */}
      <div className="rounded-md border border-line dark:border-line-dark overflow-hidden">
        <div className="max-h-80 overflow-y-auto">
          {loading ? (
            <div className="px-3 py-3 text-sm text-muted dark:text-muted-dark">Caricamento clienti FiC...</div>
          ) : results === null ? (
            <div className="px-3 py-3 text-sm text-muted dark:text-muted-dark">Usa la ricerca per trovare clienti FiC.</div>
          ) : results.length === 0 ? (
            <div className="px-3 py-3 text-sm text-muted dark:text-muted-dark">Nessun cliente FiC trovato.</div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-line dark:border-line-dark bg-cream/70 dark:bg-[#1c1c20]">
                  <th className="px-2 py-1.5 text-left">FiC ID</th>
                  <th className="px-2 py-1.5 text-left">Nome</th>
                  <th className="px-2 py-1.5 text-left">Email</th>
                  <th className="px-2 py-1.5 text-left">P.IVA</th>
                  {showStatusColumn && <th className="px-2 py-1.5 text-left">Stato</th>}
                  <th className="px-2 py-1.5 text-right">Azione</th>
                </tr>
              </thead>
              <tbody>
                {results.map((item) => (
                  <tr key={item.fic_client_id} className="border-b border-line/70 dark:border-line-dark/70">
                    <td className="px-2 py-1.5 font-mono">{item.fic_client_id}</td>
                    <td className="px-2 py-1.5">
                      <span className="block max-w-[18rem] truncate" title={item.name ?? undefined}>
                        {item.name ?? "—"}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">{item.email ?? "—"}</td>
                    <td className="px-2 py-1.5 font-mono">{item.vat ?? "—"}</td>
                    {showStatusColumn && (
                      <td className="px-2 py-1.5">
                        {item.already_imported ? (
                          <span className="text-success font-semibold">Importato #{item.local_client_id}</span>
                        ) : (
                          <span className="text-muted dark:text-muted-dark">Nuovo</span>
                        )}
                      </td>
                    )}
                    <td className="px-2 py-1.5 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onAction(item)}
                        loading={loadingId === item.fic_client_id}
                        disabled={loadingId != null}
                      >
                        {actionLabel}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Pagination ── */}
      {results !== null && lastPage > 1 && (
        <div className="flex items-center justify-between text-xs">
          <div className="text-muted dark:text-muted-dark">
            Pagina {page} di {lastPage} · {total} risultati
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => void runSearch(page - 1, q)}>
              Prev
            </Button>
            <Button size="sm" variant="ghost" disabled={page >= lastPage} onClick={() => void runSearch(page + 1, q)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
