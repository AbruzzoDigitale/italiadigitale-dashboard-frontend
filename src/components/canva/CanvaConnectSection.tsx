import { useEffect, useState } from "react";
import { canvaAuthorizeApi, disconnectCanvaApi, getCanvaStatusApi, type CanvaStatus } from "../../api/canva";
import { useToast } from "../../context/ToastContext";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Spinner } from "../ui/Spinner";
import { ResourceIcon } from "../work-items/ResourceIcon";

/**
 * Collegamento dell'account Canva dell'utente (OAuth). Una volta collegato, nell'editor
 * risorse delle lavorazioni si potrà cercare un design Canva e agganciarlo direttamente.
 */
export function CanvaConnectSection() {
  const toast = useToast();
  const [status, setStatus] = useState<CanvaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const reload = () => {
    getCanvaStatusApi()
      .then(setStatus)
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => { reload(); }, []);

  // Ritorno dal flusso OAuth (?canva_linked / ?canva_error).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("canva_linked")) toast.success("Account Canva collegato");
    else if (params.has("canva_error")) toast.error(params.get("canva_error") || "Collegamento Canva non riuscito");
    else return;
    params.delete("canva_linked");
    params.delete("canva_error");
    const url = window.location.pathname + (params.toString() ? `?${params}` : "");
    window.history.replaceState({}, "", url);
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onConnect = async () => {
    setBusy(true);
    try {
      const { authorize_url } = await canvaAuthorizeApi(window.location.href);
      window.location.href = authorize_url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Canva non disponibile");
      setBusy(false);
    }
  };

  const onDisconnect = async () => {
    setBusy(true);
    try {
      await disconnectCanvaApi();
      toast.success("Account Canva disconnesso");
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-paper dark:bg-[#131316] rounded-lg border border-line dark:border-[#2a2a2e] p-6">
      <div className="mb-1 flex items-center gap-2">
        <ResourceIcon type="canva" className="h-5 w-5" />
        <h2 className="font-display font-bold tracking-tight text-ink dark:text-[#f4f4f7]" style={{ fontSize: "17px" }}>
          Canva
        </h2>
      </div>
      <p className="font-body text-[13px] text-muted dark:text-[#9999a0] mb-5">
        Collega il tuo account Canva per cercare e agganciare i tuoi progetti alle lavorazioni, con anteprima.
      </p>

      {loading ? (
        <div className="flex justify-center py-4"><Spinner /></div>
      ) : status?.configured === false ? (
        <p className="text-sm text-muted dark:text-muted-dark">
          Integrazione Canva non ancora configurata sul server. Contatta un amministratore.
        </p>
      ) : status?.connected ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line dark:border-line-dark px-3 py-2.5">
          <span className="flex items-center gap-2 text-sm text-ink dark:text-paper">
            <Icon name="check-circle" className="h-4 w-4 text-success" />
            Collegato{status.display_name ? ` come ${status.display_name}` : ""}
          </span>
          <Button size="sm" variant="ghost" onClick={onDisconnect} loading={busy}>Disconnetti</Button>
        </div>
      ) : (
        <Button size="sm" variant="secondary" onClick={onConnect} loading={busy}>
          <ResourceIcon type="canva" className="h-4 w-4" /> Connetti con Canva
        </Button>
      )}
    </div>
  );
}
