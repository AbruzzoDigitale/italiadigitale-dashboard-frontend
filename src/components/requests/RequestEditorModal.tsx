import { Modal } from "../ui/Modal";
import { QuoteEditorPage } from "../../pages/QuoteEditorPage";

/** Nuova richiesta come MODAL: rende l'editor completo (tutte le voci: cliente,
 * prodotti/righe, note, appunti, ecc.) in modalità nuova bozza. La richiesta è
 * creata solo al salvataggio. */
export function RequestEditorModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Nuova richiesta" size="2xl" bodyClassName="overflow-y-auto">
      {open && (
        <QuoteEditorPage embedded forceNew forceRequest onClose={onClose} onSaved={onSaved} />
      )}
    </Modal>
  );
}
