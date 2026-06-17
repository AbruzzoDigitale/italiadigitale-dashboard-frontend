import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getClientApi, type Client } from "../api/clients";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { Spinner } from "../components/ui/Spinner";
import { ClientModal } from "../components/clients/ClientModal";
import { ClientFullDetails } from "../components/clients/ClientFullDetails";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../context/ToastContext";

// ── Main page ─────────────────────────────────────────────────────────────────

export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();

  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const fetchClient = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getClientApi(Number(id));
      setClient(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel caricamento");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchClient();
  }, [fetchClient]);

  const handleSaved = useCallback(
    (updated?: Client) => {
      if (updated) setClient(updated);
      setEditOpen(false);
      toast.success("Cliente aggiornato");
      // Refetch to get latest data (edit mode calls onSaved without args)
      if (!updated) fetchClient();
    },
    [toast, fetchClient]
  );

  // ── Loading / error states ────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !client) {
    return (
      <div className="px-10 py-8 max-w-[1440px] mx-auto w-full">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-[13px] font-semibold text-muted hover:text-ink dark:hover:text-[#f4f4f7] transition-colors mb-6"
        >
          <Icon name="chevron-right" className="w-4 h-4 rotate-180" />
          Clienti
        </button>
        <p className="text-sm text-danger">{error ?? "Cliente non trovato"}</p>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="px-10 py-8 pb-20 max-w-[1440px] mx-auto w-full animate-fadeIn overflow-x-hidden">

      {/* ── Back ── */}
      <button
        onClick={() => navigate("/clients")}
        className="flex items-center gap-1.5 text-[13px] font-semibold text-muted hover:text-ink dark:hover:text-[#f4f4f7] transition-colors mb-6"
      >
        <Icon name="chevron-right" className="w-4 h-4 rotate-180" />
        Clienti
      </button>

      {/* ── Hero header ── */}
      <div className="flex items-start justify-between mb-8 gap-4">
        <div className="flex-1 min-w-0">
          {/* Eyebrow badges */}
          <div className="flex items-center flex-wrap gap-2 mb-2">
            {client.type === "company" && (
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                Azienda
              </span>
            )}
            {client.type === "person" && (
              <span className="inline-flex items-center rounded-full bg-line px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted dark:bg-[#2a2a2e] dark:text-[#9999a0]">
                Persona fisica
              </span>
            )}
            {client.fic_id != null && (
              <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-success">
                <Icon name="check-circle" className="w-3 h-3" />
                FIC #{client.fic_id}
              </span>
            )}
            {!client.is_active && (
              <span className="inline-flex items-center rounded-full bg-danger/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-danger">
                Disattivo
              </span>
            )}
          </div>

          {/* Name */}
          <h1 className="font-display font-bold text-3xl tracking-tight text-ink dark:text-[#f4f4f7] leading-tight truncate">
            {client.commercial_name ?? client.name}
          </h1>

          {client.commercial_name && (
            <p className="text-[13px] text-muted dark:text-[#9999a0] mt-1">
              Ragione sociale: {client.name}
            </p>
          )}

          {/* Subtitle */}
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {client.code && (
              <span className="font-mono text-[12px] text-muted dark:text-[#9999a0]">
                {client.code}
              </span>
            )}
            {client.contact && (
              <span className="text-[13px] text-muted dark:text-[#9999a0]">
                Ref. {client.contact}
              </span>
            )}
            {client.city && (
              <span className="text-[13px] text-muted dark:text-[#9999a0]">
                {client.city}{client.prov ? ` (${client.prov})` : ""}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            variant="secondary"
            leftIcon={<Icon name="pencil" className="w-4 h-4" />}
            onClick={() => setEditOpen(true)}
          >
            Modifica
          </Button>
        </div>
      </div>

      <ClientFullDetails client={client} />

      {/* ── Edit modal ── */}
      <ClientModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        client={client}
        onSaved={handleSaved}
        isAdmin={!!user?.is_admin}
      />
    </div>
  );
}
