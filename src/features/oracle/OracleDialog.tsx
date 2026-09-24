import { useNavigate } from "react-router-dom";
import { Modal } from "../../components/ui/Modal";
import { Icon } from "../../components/ui/Icon";
import { OracleChat } from "./OracleChat";

/**
 * L'Oracolo da ovunque, senza cambiare pagina.
 *
 * Ogni apertura parte da una conversazione nuova: il dialogo serve alla domanda al
 * volo, non a riprendere un filo. Per quello c'è la pagina, raggiungibile dal link
 * in basso — che porta con sé la conversazione appena iniziata, se ce n'è una.
 */
export function OracleDialog({
  open,
  onClose,
  conversationId,
  onConversationId,
}: {
  open: boolean;
  onClose: () => void;
  conversationId: number | null;
  onConversationId: (id: number) => void;
}) {
  const navigate = useNavigate();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Oracolo"
      icon={<Icon name="robot" className="w-[18px] h-[18px]" />}
      description="Chiedi qualsiasi cosa sul lavoro dell'azienda"
      size="lg"
      bodyClassName="h-[60vh] flex flex-col min-h-0"
      footer={
        <button
          type="button"
          onClick={() => {
            onClose();
            navigate(conversationId ? `/oracolo?c=${conversationId}` : "/oracolo");
          }}
          className="text-[12px] text-muted dark:text-[#9999a0] hover:text-brand-magenta transition-colors"
        >
          Apri nella pagina dell'Oracolo →
        </button>
      }
    >
      <OracleChat
        conversationId={conversationId}
        onConversationId={onConversationId}
        compact
        autoFocus
      />
    </Modal>
  );
}
