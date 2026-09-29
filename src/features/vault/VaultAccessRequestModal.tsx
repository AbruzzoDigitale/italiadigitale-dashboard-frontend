import { useEffect, useState } from "react";
import { requestVaultAccessApi, type VaultItem } from "../../api/vault";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { Modal } from "../../components/ui/Modal";
import { Textarea } from "../../components/ui/Textarea";
import { useToast } from "../../context/ToastContext";

/**
 * Chiede a un admin di aprire una credenziale.
 *
 * Compare solo quando l'azienda ha acceso lo sblocco mediato, e solo al momento
 * in cui serve davvero: si scopre di non poter aprire provando ad aprire, non
 * leggendo una regola da qualche parte.
 *
 * Il motivo è facoltativo ma conviene scriverlo: dall'altra parte c'è una
 * persona che deve decidere in fretta, e «serve per il sito del cliente» le
 * risparmia una telefonata.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  item: VaultItem | null;
}

export function VaultAccessRequestModal({ open, onClose, item }: Props) {
  const [motivo, setMotivo] = useState("");
  const [inCorso, setInCorso] = useState(false);
  const [inviata, setInviata] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    setMotivo("");
    setInviata(false);
  }, [open]);

  async function chiedi() {
    if (!item) return;
    setInCorso(true);
    try {
      const r = await requestVaultAccessApi(item.id, motivo || null);
      setInviata(true);
      if (r.status === "granted") {
        toast.success("Hai già un'autorizzazione valida: riprova ad aprirla.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Richiesta non riuscita");
    } finally {
      setInCorso(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Chiedi l'accesso"
      description={item ? `«${item.label}» va aperta da un amministratore.` : undefined}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {inviata ? "Chiudi" : "Annulla"}
          </Button>
          {!inviata && (
            <Button onClick={() => void chiedi()} loading={inCorso}>
              Manda la richiesta
            </Button>
          )}
        </div>
      }
    >
      {inviata ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <Icon name="check-circle" className="h-10 w-10 text-success" />
          <p className="text-sm">
            Richiesta inviata. Gli amministratori sono stati avvisati: quando uno
            approva, ricevi una notifica e puoi aprirla per il tempo che ti concede.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Textarea
            label="Perché ti serve (facoltativo)"
            rows={3}
            placeholder="Es. devo aggiornare il plugin sul sito del cliente"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
          <p className="text-xs text-muted dark:text-muted-dark">
            Vedi questa credenziale perché hai il permesso di vederla. In questa
            azienda, però, aprirla richiede anche il via libera di un amministratore,
            valido per un tempo limitato.
          </p>
        </div>
      )}
    </Modal>
  );
}
