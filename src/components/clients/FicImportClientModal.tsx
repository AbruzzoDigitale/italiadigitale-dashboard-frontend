import { useEffect, useState } from "react";
import {
  importFicClientApi,
  type FicClientSearchItem,
  type FicImportClientDryRunResponse,
} from "../../api/fic";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { FicClientSearchPanel } from "../fic/FicClientSearchPanel";

interface Props {
  open: boolean;
  companyId: number | null;
  onClose: () => void;
  onImported: (localClientId: number) => void;
}

type Step = "search" | "preview";

export function FicImportClientModal({ open, onClose, onImported }: Props) {
  const [step, setStep] = useState<Step>("search");
  const [selected, setSelected] = useState<FicClientSearchItem | null>(null);
  const [preview, setPreview] = useState<FicImportClientDryRunResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState<number | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setStep("search");
    setSelected(null);
    setPreview(null);
    setPreviewLoading(null);
    setError(null);
  };

  useEffect(() => {
    if (!open) reset();
  }, [open]);

  const handleAction = async (item: FicClientSearchItem) => {
    setSelected(item);
    setPreviewLoading(item.fic_client_id);
    setError(null);
    try {
      const res = await importFicClientApi({
        fic_client_id: item.fic_client_id,
        overwrite_if_exists: item.already_imported,
        dry_run: true,
      });
      if (res.status === "dry_run") {
        setPreview(res);
        setStep("preview");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore anteprima");
    } finally {
      setPreviewLoading(null);
    }
  };

  const handleConfirm = async () => {
    if (!selected) return;
    setConfirmLoading(true);
    setError(null);
    try {
      const res = await importFicClientApi({
        fic_client_id: selected.fic_client_id,
        overwrite_if_exists: selected.already_imported,
        dry_run: false,
      });
      if (res.status === "ok") {
        onImported(res.local_client_id);
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore importazione");
    } finally {
      setConfirmLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={step === "preview" ? "Conferma importazione cliente FiC" : "Importa cliente da FiC"}
      size="2xl"
    >
      {step === "search" && (
        <div className="space-y-3">
          <FicClientSearchPanel
            actionLabel="Importa"
            showStatusColumn={false}
            onAction={(item) => void handleAction(item)}
            loadingId={previewLoading}
          />
          {error && (
            <div className="rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</div>
          )}
        </div>
      )}

      {step === "preview" && preview && selected && (
        <div className="space-y-3">
          <div className="rounded-md border border-line dark:border-line-dark p-3 space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-widest text-muted dark:text-muted-dark">
              Anteprima import · FiC #{selected.fic_client_id}
            </div>
            <PreviewRow label="Azione" value={preview.action === "create" ? "Crea nuovo cliente" : "Aggiorna cliente esistente"} />
            <PreviewRow label="Nome" value={preview.payload_preview.name} />
            <PreviewRow label="Email" value={preview.payload_preview.email} />
            <PreviewRow label="P.IVA" value={preview.payload_preview.vat} />
            <PreviewRow label="C.F." value={preview.payload_preview.cf} />
            <PreviewRow label="Tipo" value={preview.payload_preview.type} />
          </div>

          {error && (
            <div className="rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</div>
          )}

          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => { setStep("search"); setPreview(null); setError(null); }}>
              Indietro
            </Button>
            <Button variant="primary" onClick={() => void handleConfirm()} loading={confirmLoading}>
              Conferma importazione
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function PreviewRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-baseline gap-2 text-xs">
      <span className="w-28 flex-shrink-0 font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">{label}</span>
      <span className="text-ink dark:text-paper">{value ?? <span className="text-muted dark:text-muted-dark">—</span>}</span>
    </div>
  );
}
