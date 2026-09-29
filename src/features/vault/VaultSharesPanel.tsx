import { useCallback, useEffect, useState } from "react";
import { listAllVaultSharesApi, revokeVaultShareApi, type VaultShare } from "../../api/vault";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Checkbox } from "../../components/ui/Checkbox";
import { Icon } from "../../components/ui/Icon";
import { Skeleton } from "../../components/ui/Skeleton";
import { useToast } from "../../context/ToastContext";

/**
 * Tutti i link di condivisione emessi.
 *
 * L'elenco per singola credenziale dice cosa è uscito *di quella*, mai cosa è
 * uscito e basta. Dopo un dubbio — un telefono perso, un cliente che non è più
 * cliente — serve poter guardare tutto insieme e chiudere in fretta.
 */

const STATI: Record<VaultShare["status"], { testo: string; variante: "success" | "default" | "danger" }> = {
  active: { testo: "attivo", variante: "success" },
  expired: { testo: "scaduto", variante: "default" },
  exhausted: { testo: "esaurito", variante: "default" },
  revoked: { testo: "revocato", variante: "danger" },
};

export function VaultSharesPanel({ companyId }: { companyId: number }) {
  const [righe, setRighe] = useState<VaultShare[] | null>(null);
  const [soloAttivi, setSoloAttivi] = useState(true);
  const toast = useToast();

  const carica = useCallback(async () => {
    setRighe(null);
    try {
      setRighe(await listAllVaultSharesApi({ companyId, soloAttivi }));
    } catch (e) {
      setRighe([]);
      toast.error(e instanceof Error ? e.message : "Elenco non leggibile");
    }
  }, [companyId, soloAttivi, toast]);

  useEffect(() => {
    void carica();
  }, [carica]);

  async function revoca(s: VaultShare) {
    if (!confirm("Revocare questo link? Smetterà di funzionare subito.")) return;
    try {
      await revokeVaultShareApi(s.id);
      toast.success("Link revocato");
      void carica();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Revoca non riuscita");
    }
  }

  const attivi = (righe ?? []).filter((s) => s.status === "active");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setSoloAttivi((v) => !v)}
          className="inline-flex items-center gap-2 text-[12.5px] text-ink dark:text-[#f4f4f7]"
        >
          <Checkbox checked={soloAttivi} onChange={setSoloAttivi} />
          Solo quelli ancora aperti
        </button>
        {attivi.length > 0 && (
          <Badge variant="warning">
            {attivi.length} {attivi.length === 1 ? "link aperto" : "link aperti"}
          </Badge>
        )}
      </div>

      {righe === null ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-2/3" />
        </div>
      ) : righe.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted dark:text-muted-dark">
          {soloAttivi
            ? "Nessun link di condivisione aperto."
            : "Non è mai stato emesso nessun link."}
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {righe.map((s) => {
            const stato = STATI[s.status];
            return (
              <div
                key={s.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm dark:border-line-dark"
              >
                <Badge variant={stato.variante} className="shrink-0">
                  {stato.testo}
                </Badge>
                <span className="min-w-0 truncate font-medium" title={s.item_labels.join(", ")}>
                  {s.item_labels.length > 1
                    ? `${s.item_labels.length} credenziali`
                    : s.item_labels[0] || "(credenziale eliminata)"}
                </span>
                <span className="truncate text-xs text-muted dark:text-muted-dark">
                  → {s.recipient_note || "destinatario non annotato"}
                </span>
                <span className="ml-auto shrink-0 text-xs text-muted dark:text-muted-dark">
                  {s.view_count} {s.view_count === 1 ? "apertura" : "aperture"}
                  {s.created_by_name && ` · da ${s.created_by_name}`}
                  {" · scade il "}
                  {new Date(s.expires_at).toLocaleDateString("it-IT")}
                </span>
                {s.status === "active" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    title="Revoca"
                    aria-label="Revoca il link"
                    onClick={() => void revoca(s)}
                  >
                    <Icon name="x" className="h-4 w-4" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-muted dark:text-muted-dark">
        Revocare chiude il link all'istante. Quello che il destinatario ha già
        aperto e salvato, però, non torna indietro: se una credenziale è uscita e
        non doveva, va <strong>cambiata</strong>, non solo revocata.
      </p>
    </div>
  );
}
