import { useEffect, useState } from "react";
import { getVaultPolicyApi, updateVaultPolicyApi, type VaultPolicy } from "../../api/vault";
import { Button } from "../../components/ui/Button";
import { Checkbox } from "../../components/ui/Checkbox";
import { DurationField } from "../../components/ui/DurationField";
import { FieldLabel } from "../../components/ui/FieldLabel";
import { Icon } from "../../components/ui/Icon";
import { Input } from "../../components/ui/Input";
import { Skeleton } from "../../components/ui/Skeleton";
import { useToast } from "../../context/ToastContext";

/**
 * Regole della cassaforte, per azienda.
 *
 * Erano configurabili solo via API, cioè di fatto da nessuno. Sono le stesse
 * che governano i promemoria notturni e il rifiuto dei link troppo lunghi:
 * lasciarle invisibili voleva dire che i default valevano per sempre.
 */

export function VaultPolicyPanel({ companyId }: { companyId: number }) {
  const [policy, setPolicy] = useState<VaultPolicy | null>(null);
  const [rinnovo, setRinnovo] = useState<number | null>(null);
  const [preavviso, setPreavviso] = useState<number | null>(null);
  const [linkMax, setLinkMax] = useState<number | null>(null);
  const [sblocco, setSblocco] = useState("15");
  const [mediato, setMediato] = useState(false);
  const [minutiConcessi, setMinutiConcessi] = useState("30");
  const [inCorso, setInCorso] = useState(false);
  const toast = useToast();

  useEffect(() => {
    void (async () => {
      try {
        const p = await getVaultPolicyApi(companyId);
        setPolicy(p);
        setRinnovo(p.rotation_days);
        setPreavviso(p.rotation_warn_days);
        setLinkMax(p.share_max_days);
        setSblocco(String(p.unlock_ttl_minutes));
        setMediato(p.require_admin_unlock);
        setMinutiConcessi(String(p.admin_unlock_minutes));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Impostazioni non leggibili");
      }
    })();
  }, [companyId, toast]);

  async function salva() {
    setInCorso(true);
    try {
      const p = await updateVaultPolicyApi(companyId, {
        rotation_days: rinnovo ?? undefined,
        rotation_warn_days: preavviso ?? undefined,
        share_max_days: linkMax ?? undefined,
        unlock_ttl_minutes: sblocco.trim() ? Number(sblocco) : undefined,
        require_admin_unlock: mediato,
        admin_unlock_minutes: minutiConcessi.trim() ? Number(minutiConcessi) : undefined,
      });
      setPolicy(p);
      toast.success("Impostazioni salvate");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Salvataggio non riuscito");
    } finally {
      setInCorso(false);
    }
  }

  if (policy === null) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-2/3" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <DurationField
          label="Rinnova le credenziali ogni"
          value={rinnovo}
          onChange={setRinnovo}
          hint="Vale per le voci che non hanno un loro periodo. Zero = nessun promemoria."
        />
        <DurationField
          label="Avvisa con un anticipo di"
          value={preavviso}
          onChange={setPreavviso}
          hint="Quanto prima della scadenza arriva la notifica."
        />
        <DurationField
          label="I link di condivisione durano al massimo"
          value={linkMax}
          onChange={setLinkMax}
          hint="Un link più lungo viene rifiutato al momento della creazione."
        />
        <div>
          <FieldLabel>La cassaforte resta aperta (minuti)</FieldLabel>
          <Input
            type="number"
            min={1}
            max={240}
            name="sblocco-minuti"
            autoComplete="off"
            value={sblocco}
            onChange={(e) => setSblocco(e.target.value)}
            hint="Dopo questo tempo va reinserita la password."
          />
        </div>
      </div>

      <div className="rounded-lg border border-line p-3 dark:border-line-dark">
        <button
          type="button"
          onClick={() => setMediato((v) => !v)}
          className="inline-flex items-center gap-2 text-[13px] text-ink dark:text-[#f4f4f7]"
        >
          <Checkbox checked={mediato} onChange={setMediato} />
          Chi non è amministratore deve chiedere per aprire una credenziale
        </button>

        {mediato ? (
          <div className="mt-3 flex flex-col gap-2">
            <div className="max-w-[16rem]">
              <FieldLabel>Durata predefinita dello sblocco (minuti)</FieldLabel>
              <Input
                type="number"
                min={1}
                max={1440}
                name="minuti-concessi"
                autoComplete="off"
                value={minutiConcessi}
                onChange={(e) => setMinutiConcessi(e.target.value)}
                hint="Chi concede può comunque scegliere un tempo diverso."
              />
            </div>
            <p className="text-xs text-muted dark:text-muted-dark">
              Non sostituisce i permessi: senza permesso la credenziale resta
              invisibile e non c'è niente da chiedere. È un secondo cancello per
              chi il permesso ce l'ha, e serve quando «può vederla» e «deve
              vederla adesso» non sono la stessa cosa. Proprietario della voce e
              amministratori restano esenti.
            </p>
          </div>
        ) : (
          <p className="mt-1 text-xs text-muted dark:text-muted-dark">
            Oggi chi ha il permesso apre da sé, reinserendo la propria password.
            Accendere questa regola cambia il modo di lavorare di tutti: fallo
            sapendo che ogni apertura passerà da una persona.
          </p>
        )}
      </div>

      <div className="flex gap-2 rounded-lg border border-line bg-cream p-3 text-sm dark:border-line-dark dark:bg-[#0E0F0E]">
        <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0 text-info" />
        <p className="text-muted dark:text-muted-dark">
          Il promemoria di rinnovo parte ogni mattina alle 7:45 e arriva a chi può
          agire: il proprietario della credenziale e chi ha il permesso di gestirla.
          Non si ripete per sette giorni sulla stessa voce, altrimenti diventerebbe
          rumore e smettereste di guardarlo.
        </p>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => void salva()} loading={inCorso}>
          Salva le impostazioni
        </Button>
      </div>
    </div>
  );
}
