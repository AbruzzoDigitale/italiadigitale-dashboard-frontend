import { useEffect, useState } from "react";
import {
  unlockVaultApi,
  unlockVaultWithPasskeyApi,
  vaultStatusApi,
  vaultUnlockOptionsApi,
} from "../../api/vault";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { Input } from "../../components/ui/Input";
import { Modal } from "../../components/ui/Modal";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../hooks/useAuth";
import { getPasskeyAssertion, passkeysSupported } from "../../utils/webauthn";

/**
 * Sblocco della cassaforte.
 *
 * Essere loggati non basta per vedere una credenziale: serve dimostrare di
 * essere ancora lì, con la propria password o con una passkey (impronta,
 * volto, PIN del dispositivo). Ne esce un token a vita breve tenuto solo in
 * memoria: chiudere il tab richiude la cassaforte.
 *
 * La passkey compare solo se ne esiste una per questo dominio. Registrarla sul
 * portatile non la porta sul telefono: una passkey vale per l'origine su cui è
 * nata, ed è lo standard a dirlo, non una nostra scelta.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  /** Chiamata dopo uno sblocco riuscito: chi apre riprova l'operazione sospesa. */
  onUnlocked: () => void;
}

export function VaultUnlockModal({ open, onClose, onUnlocked }: Props) {
  const [password, setPassword] = useState("");
  const [inCorso, setInCorso] = useState(false);
  const [conPasskey, setConPasskey] = useState(false);
  const [passkeyInCorso, setPasskeyInCorso] = useState(false);
  const toast = useToast();
  const { user } = useAuth();

  // Password mai lasciata in stato fra un'apertura e l'altra.
  useEffect(() => {
    if (!open) {
      setPassword("");
      return;
    }
    if (!passkeysSupported()) return;
    vaultStatusApi()
      .then((s) => setConPasskey(s.has_passkey))
      // Se non si sa, si mostra solo la password: è sempre disponibile.
      .catch(() => setConPasskey(false));
  }, [open]);

  async function sbloccaConPasskey() {
    setPasskeyInCorso(true);
    try {
      const { options, challenge_token } = await vaultUnlockOptionsApi();
      const assertion = await getPasskeyAssertion(options);
      const minuti = await unlockVaultWithPasskeyApi(challenge_token, assertion);
      toast.success(`Cassaforte aperta per ${minuti} minuti.`);
      onUnlocked();
      onClose();
    } catch (e) {
      if (e instanceof DOMException && e.name === "NotAllowedError") {
        toast.error("Sblocco con passkey annullato.");
      } else {
        toast.error(e instanceof Error ? e.message : "Sblocco con passkey non riuscito");
      }
    } finally {
      setPasskeyInCorso(false);
    }
  }

  async function sblocca() {
    if (!password) return;
    setInCorso(true);
    try {
      const minuti = await unlockVaultApi(password);
      setPassword("");
      toast.success(`Cassaforte aperta per ${minuti} minuti.`);
      onUnlocked();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sblocco non riuscito");
    } finally {
      setInCorso(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Sblocca la cassaforte"
      description="Serve la tua password, o una passkey. Poi si richiude da sola."
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Annulla
          </Button>
          <Button onClick={() => void sblocca()} loading={inCorso} disabled={!password}>
            Sblocca
          </Button>
        </div>
      }
    >
      {/*
        Il <form> non è decorativo. Senza, il campo password finisce nel "form
        implicito" che il browser costruisce con tutti i campi sciolti della
        pagina — e siccome il modale vive in un portal, lì dentro ci sta anche
        la ricerca della cassaforte: il gestore password ci scriveva la mail
        dell'account, la lista si filtrava su quella e restava vuota.
        Con un form vero l'autofill resta confinato qui, e il campo "Account"
        gli dà l'aggancio giusto.
      */}
      {conPasskey && (
        <div className="mb-4 flex flex-col gap-2">
          <Button
            variant="secondary"
            onClick={() => void sbloccaConPasskey()}
            loading={passkeyInCorso}
          >
            <Icon name="key" className="mr-1 h-4 w-4" />
            Sblocca con la passkey
          </Button>
          <p className="text-center text-xs text-muted dark:text-muted-dark">
            oppure con la password
          </p>
        </div>
      )}

      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void sblocca();
        }}
      >
        <Input
          label="Account"
          value={user?.email ?? user?.username ?? ""}
          readOnly
          tabIndex={-1}
          autoComplete="username"
        />
        <Input
          type="password"
          label="La tua password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {/* Serve perché l'Invio faccia il submit: il bottone vero è nel footer. */}
        <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true" />
      </form>
    </Modal>
  );
}
