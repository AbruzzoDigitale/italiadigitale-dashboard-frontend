import { useEffect, useState } from "react";
import { bulkVaultGrantsApi } from "../../api/vault";
import { getUsersApi, type User } from "../../api/users";
import { Button } from "../../components/ui/Button";
import { FieldLabel } from "../../components/ui/FieldLabel";
import { Icon } from "../../components/ui/Icon";
import { Modal } from "../../components/ui/Modal";
import { MultiSelect } from "../../components/ui/MultiSelect";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import { Skeleton } from "../../components/ui/Skeleton";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../hooks/useAuth";

/**
 * Condivide credenziali con altre persone dell'agenzia.
 *
 * Non è la stessa cosa del link di condivisione: quello consegna un segreto a
 * un esterno, questo dà a un collega **la voce stessa**, che gli compare nella
 * sua cassaforte. Non è una copia: se il permesso viene revocato, la
 * credenziale gli sparisce di nuovo, e resta sempre una sola voce da rinnovare.
 *
 * Funziona su una o su cinquanta insieme, che è il motivo per cui esiste:
 * cercare le credenziali di un cliente e passarle tutte a chi ci lavora, senza
 * aprirle una per una.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  companyId: number;
  itemIds: number[];
  onDone: () => void;
}

const PERMESSI = [
  { value: "view", label: "Può vedere e usare" },
  { value: "manage", label: "Può anche modificare e ricondividere" },
];

export function VaultGrantModal({ open, onClose, companyId, itemIds, onDone }: Props) {
  const { user } = useAuth();
  const [colleghi, setColleghi] = useState<User[] | null>(null);
  const [scelti, setScelti] = useState<number[]>([]);
  const [permesso, setPermesso] = useState("view");
  const [inCorso, setInCorso] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    setScelti([]);
    setPermesso("view");
    void (async () => {
      try {
        const tutti = await getUsersApi(companyId);
        // Sé stessi fuori: condividere con sé non vuol dire niente, e in elenco
        // è solo una voce in cui inciampare.
        setColleghi(tutti.filter((u) => u.is_active && u.id !== user?.id));
      } catch {
        setColleghi([]);
      }
    })();
  }, [open, companyId, user?.id]);

  async function applica(mode: "add" | "remove") {
    if (scelti.length === 0) {
      toast.error("Scegli almeno una persona");
      return;
    }
    setInCorso(true);
    try {
      const r = await bulkVaultGrantsApi({
        item_ids: itemIds,
        grants: scelti.map((id) => ({ user_id: id, permission: permesso as "view" | "manage" })),
        mode,
      });
      const verbo = mode === "add" ? "condivise" : "revocate";
      const parti = [`${r.aggiornate} ${verbo}`];
      if (r.invariate) parti.push(`${r.invariate} già a posto`);
      if (r.non_permesse) parti.push(`${r.non_permesse} che non puoi gestire`);
      toast.success(parti.join(" · "));
      onDone();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Operazione non riuscita");
    } finally {
      setInCorso(false);
    }
  }

  const quante = itemIds.length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={quante === 1 ? "Condividi con un collega" : `Condividi ${quante} credenziali`}
      description="La credenziale comparirà nella loro cassaforte, con il tuo nome accanto."
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Annulla
          </Button>
          <Button
            variant="secondary"
            onClick={() => void applica("remove")}
            loading={inCorso}
            disabled={scelti.length === 0}
            title="Toglie il permesso a chi hai selezionato"
          >
            Revoca
          </Button>
          <Button onClick={() => void applica("add")} loading={inCorso} disabled={scelti.length === 0}>
            Condividi
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {colleghi === null ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <MultiSelect
            label="Con chi"
            value={scelti}
            onChange={setScelti}
            options={colleghi.map((u) => ({
              id: u.id,
              label: u.full_name || u.username,
            }))}
            placeholder="Scegli una o più persone"
            searchPlaceholder="Cerca per nome…"
          />
        )}

        <div>
          <FieldLabel>Cosa possono farci</FieldLabel>
          <SearchableSelect value={permesso} onChange={setPermesso} options={PERMESSI} />
        </div>

        <div className="flex gap-2 rounded-lg border border-line bg-cream p-3 text-sm dark:border-line-dark dark:bg-[#0E0F0E]">
          <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0 text-info" />
          <p className="text-muted dark:text-muted-dark">
            Non stai facendo una copia: resta una sola credenziale, vista da più persone.
            Se la rinnovi, la vedono aggiornata; se revochi il permesso, gli sparisce.
            Per consegnarla a qualcuno <strong>fuori</strong> dall'agenzia serve invece il
            link di condivisione.
          </p>
        </div>
      </div>
    </Modal>
  );
}
