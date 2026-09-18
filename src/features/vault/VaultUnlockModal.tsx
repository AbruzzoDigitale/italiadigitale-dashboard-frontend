import { useEffect, useState } from "react";
import { unlockVaultApi } from "../../api/vault";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Modal } from "../../components/ui/Modal";
import { useToast } from "../../context/ToastContext";

/**
 * Sblocco della cassaforte.
 *
 * Essere loggati non basta per vedere una credenziale: serve reinserire la
 * propria password, che rilascia un token a vita breve tenuto solo in memoria.
 * Chiudere il tab richiude la cassaforte.
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
  const toast = useToast();

  // Password mai lasciata in stato fra un'apertura e l'altra.
  useEffect(() => {
    if (!open) setPassword("");
  }, [open]);

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
      description="Serve la tua password. Resta aperta 15 minuti, poi si richiude da sola."
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
      <Input
        type="password"
        label="La tua password"
        autoFocus
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void sblocca();
        }}
      />
    </Modal>
  );
}
