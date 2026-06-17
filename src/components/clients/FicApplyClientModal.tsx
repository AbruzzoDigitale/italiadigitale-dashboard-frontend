import { useEffect, useState } from "react";
import {
  applyFicClientToExistingApi,
  type FicApplyClientDryRunResponse,
  type FicClientSearchItem,
} from "../../api/fic";
import { getClientsApi, type Client } from "../../api/clients";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { SearchableSelect } from "../ui/SearchableSelect";
import { FicClientSearchPanel } from "../fic/FicClientSearchPanel";

interface Props {
  open: boolean;
  companyId: number | null;
  preselectedLocalClient?: Client | null;
  onClose: () => void;
  onApplied: (localClientId: number) => void;
}

type Step = "select" | "preview";

export function FicApplyClientModal({ open, companyId, preselectedLocalClient, onClose, onApplied }: Props) {
  const [step, setStep] = useState<Step>("select");
  const [selectedFic, setSelectedFic] = useState<FicClientSearchItem | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<number | null>(null);

  // ── Local client picker (only when no preselection) ──
  const [localClients, setLocalClients] = useState<Client[]>([]);
  const [localClientsLoading, setLocalClientsLoading] = useState(false);
  const [selectedLocalClientId, setSelectedLocalClientId] = useState<string>("");

  // ── Preview ──
  const [preview, setPreview] = useState<FicApplyClientDryRunResponse | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setStep("select");
    setSelectedFic(null);
    setPreviewLoadingId(null);
    setSelectedLocalClientId(preselectedLocalClient ? String(preselectedLocalClient.id) : "");
    setPreview(null);
    setError(null);
  };

  useEffect(() => {
    if (!open) { reset(); return; }
    if (preselectedLocalClient) {
      setSelectedLocalClientId(String(preselectedLocalClient.id));
    } else {
      void loadLocalClients();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const loadLocalClients = async () => {
    if (!companyId) return;
    setLocalClientsLoading(true);
    try {
      const res = await getClientsApi({ company_id: companyId, per_page: 500 });
      setLocalClients(res.data);
    } catch {
      // best effort
    } finally {
      setLocalClientsLoading(false);
    }
  };

  const handleSelectFic = async (item: FicClientSearchItem) => {
    if (!selectedLocalClientId) {
      setError("Seleziona prima un cliente locale");
      return;
    }
    setSelectedFic(item);
    setPreviewLoadingId(item.fic_client_id);
    setError(null);
    try {
      const res = await applyFicClientToExistingApi(
        item.fic_client_id,
        Number(selectedLocalClientId),
        { dry_run: true }
      );
      if (res.status === "dry_run") {
        setPreview(res);
        setStep("preview");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore anteprima");
    } finally {
      setPreviewLoadingId(null);
    }
  };

  const handleConfirm = async () => {
    if (!selectedFic || !selectedLocalClientId) return;
    setConfirmLoading(true);
    setError(null);
    try {
      const res = await applyFicClientToExistingApi(
        selectedFic.fic_client_id,
        Number(selectedLocalClientId),
        { dry_run: false }
      );
      if (res.status === "ok") {
        onApplied(res.local_client_id);
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore collegamento");
    } finally {
      setConfirmLoading(false);
    }
  };

  const localClientOptions = preselectedLocalClient
    ? [{ value: String(preselectedLocalClient.id), label: preselectedLocalClient.commercial_name ?? preselectedLocalClient.name }]
    : localClients.map((c) => ({ value: String(c.id), label: `${c.commercial_name ?? c.name}${c.fic_id ? ` (FiC #${c.fic_id})` : ""}` }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={step === "preview" ? "Conferma collegamento FiC" : "Collega cliente FiC a cliente locale"}
      size="lg"
    >
      {step === "select" && (
        <div className="space-y-3">
          {/* Local client selector */}
          {preselectedLocalClient ? (
            <div className="rounded-md border border-line dark:border-line-dark px-3 py-2.5 text-sm">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-muted-dark mr-2">Cliente locale</span>
              <span className="text-ink dark:text-paper">
                {preselectedLocalClient.commercial_name ?? preselectedLocalClient.name}
              </span>
              {preselectedLocalClient.fic_id != null && (
                <span className="ml-2 text-[11px] text-muted dark:text-muted-dark">(FiC #{preselectedLocalClient.fic_id})</span>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
                Cliente locale da collegare
              </label>
              <SearchableSelect
                value={selectedLocalClientId}
                onChange={setSelectedLocalClientId}
                options={localClientOptions}
                placeholder={localClientsLoading ? "Caricamento clienti..." : "Seleziona cliente locale"}
                searchPlaceholder="Cerca cliente..."
              />
            </div>
          )}

          <FicClientSearchPanel
            actionLabel="Collega"
            onAction={(item) => void handleSelectFic(item)}
            loadingId={previewLoadingId}
          />

          {error && (
            <div className="rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</div>
          )}
        </div>
      )}

      {step === "preview" && preview && (
        <div className="space-y-3">
          <div className="rounded-md border border-line dark:border-line-dark p-3 space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-widest text-muted dark:text-muted-dark">
              Modifiche al cliente locale #{preview.local_client_id}
            </div>
            <PreviewRow label="FiC ID da collegare" value={String(preview.fic_client_id)} />
            <PreviewRow label="Nome" value={preview.changes_preview.name} />
            <PreviewRow label="Email" value={preview.changes_preview.email} />
            <PreviewRow label="P.IVA" value={preview.changes_preview.vat} />
            <PreviewRow label="C.F." value={preview.changes_preview.cf} />
            <PreviewRow
              label="FiC ID precedente"
              value={preview.changes_preview.fic_id_before != null ? String(preview.changes_preview.fic_id_before) : "—"}
            />
          </div>

          {error && (
            <div className="rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</div>
          )}

          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => { setStep("select"); setPreview(null); setError(null); }}>
              Indietro
            </Button>
            <Button variant="primary" loading={confirmLoading} onClick={() => void handleConfirm()}>
              Conferma collegamento
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
      <span className="w-36 flex-shrink-0 font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">{label}</span>
      <span className="text-ink dark:text-paper">{value && value !== "—" ? value : <span className="text-muted dark:text-muted-dark">—</span>}</span>
    </div>
  );
}
