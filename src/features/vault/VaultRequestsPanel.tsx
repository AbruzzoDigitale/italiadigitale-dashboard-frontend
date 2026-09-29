import { useCallback, useEffect, useState } from "react";
import {
  decideVaultAccessRequestApi,
  listVaultAccessRequestsApi,
  type VaultAccessRequest,
} from "../../api/vault";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Checkbox } from "../../components/ui/Checkbox";
import { FieldLabel } from "../../components/ui/FieldLabel";
import { Icon } from "../../components/ui/Icon";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import { Skeleton } from "../../components/ui/Skeleton";
import { useToast } from "../../context/ToastContext";

/**
 * Le richieste di sblocco in attesa di una decisione.
 *
 * La durata la sceglie chi concede, non chi chiede: è il punto dell'intero
 * meccanismo. Un'autorizzazione senza scadenza sarebbe un permesso, e i
 * permessi si danno dall'altra parte.
 */

const DURATE = [
  { value: "15", label: "15 minuti" },
  { value: "30", label: "30 minuti" },
  { value: "60", label: "1 ora" },
  { value: "240", label: "4 ore" },
  { value: "480", label: "Una giornata di lavoro (8 ore)" },
];

export function VaultRequestsPanel({ companyId }: { companyId: number }) {
  const [righe, setRighe] = useState<VaultAccessRequest[] | null>(null);
  const [soloAttese, setSoloAttese] = useState(true);
  const [durata, setDurata] = useState("30");
  const [inCorso, setInCorso] = useState<number | null>(null);
  const toast = useToast();

  const carica = useCallback(async () => {
    setRighe(null);
    try {
      setRighe(await listVaultAccessRequestsApi({ companyId, soloAttese }));
    } catch (e) {
      setRighe([]);
      toast.error(e instanceof Error ? e.message : "Richieste non leggibili");
    }
  }, [companyId, soloAttese, toast]);

  useEffect(() => {
    void carica();
  }, [carica]);

  async function decidi(r: VaultAccessRequest, approvata: boolean) {
    setInCorso(r.id);
    try {
      await decideVaultAccessRequestApi(r.id, approvata, approvata ? Number(durata) : null);
      toast.success(approvata ? `Concesso per ${durata} minuti` : "Richiesta respinta");
      void carica();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Operazione non riuscita");
    } finally {
      setInCorso(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-4">
        <button
          type="button"
          onClick={() => setSoloAttese((v) => !v)}
          className="inline-flex items-center gap-2 pb-2 text-[12.5px] text-ink dark:text-[#f4f4f7]"
        >
          <Checkbox checked={soloAttese} onChange={setSoloAttese} />
          Solo quelle in attesa
        </button>
        <div className="w-60">
          <FieldLabel>Per quanto concedere</FieldLabel>
          <SearchableSelect value={durata} onChange={setDurata} options={DURATE} />
        </div>
      </div>

      {righe === null ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-2/3" />
        </div>
      ) : righe.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted dark:text-muted-dark">
          {soloAttese ? "Nessuna richiesta in attesa." : "Nessuna richiesta."}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {righe.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm dark:border-line-dark"
            >
              <Icon name="key" className="h-4 w-4 shrink-0 text-muted dark:text-muted-dark" />
              <span className="font-medium">{r.user_name ?? `utente ${r.user_id}`}</span>
              <span className="text-muted dark:text-muted-dark">chiede</span>
              <span className="truncate font-medium">{r.item_label}</span>
              {r.reason && (
                <span className="w-full truncate text-xs italic text-muted dark:text-muted-dark">
                  «{r.reason}»
                </span>
              )}

              {r.status === "pending" ? (
                <div className="ml-auto flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={inCorso === r.id}
                    onClick={() => void decidi(r, false)}
                  >
                    Nega
                  </Button>
                  <Button size="sm" loading={inCorso === r.id} onClick={() => void decidi(r, true)}>
                    Concedi
                  </Button>
                </div>
              ) : (
                <span className="ml-auto shrink-0">
                  <Badge variant={r.status === "granted" ? "success" : "default"}>
                    {r.status === "granted"
                      ? `fino alle ${new Date(r.expires_at ?? "").toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`
                      : r.status === "denied"
                        ? "negata"
                        : "scaduta"}
                  </Badge>
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-muted dark:text-muted-dark">
        Concedere apre una finestra sulla singola credenziale, per il tempo scelto
        qui. Passato quello si richiude da sola, senza che nessuno debba ricordarsi
        di revocarla — ed è la differenza fra questo e dare un permesso.
      </p>
    </div>
  );
}
