import { useCallback, useEffect, useState } from "react";
import {
  cancelSignatureRequestApi,
  exportDocumentPdfApi,
  listSignatureRequestsApi,
  type SignatureRequest,
  type SignatureStatus,
} from "../../api/documents";
import { useToast } from "../../context/ToastContext";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Modal } from "../ui/Modal";
import { Spinner } from "../ui/Spinner";

interface Props {
  open: boolean;
  onClose: () => void;
  documentId: number | null;
}

const STATUS_LABEL: Record<SignatureStatus, string> = {
  draft: "Bozza",
  sent: "Inviato",
  opened: "Visualizzato",
  filled: "Compilato",
  signing: "In firma",
  signed: "Firmato",
  refused: "Rifiutato",
  expired: "Scaduto",
  cancelled: "Annullato",
};

const STATUS_VARIANT: Record<SignatureStatus, "default" | "info" | "success" | "warning" | "danger"> = {
  draft: "default",
  sent: "info",
  opened: "info",
  filled: "warning",
  signing: "warning",
  signed: "success",
  refused: "danger",
  expired: "default",
  cancelled: "default",
};

const linkUrl = (token: string) => `${window.location.origin}/firma/${token}`;
const fmt = (s?: string | null) => (s ? new Date(s).toLocaleString("it-IT") : "—");

export function SignatureRequestsModal({ open, onClose, documentId }: Props) {
  const toast = useToast();
  const [items, setItems] = useState<SignatureRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(() => {
    if (documentId == null) return;
    setLoading(true);
    listSignatureRequestsApi(documentId)
      .then(setItems)
      .catch((err) => toast.error(err instanceof Error ? err.message : "Errore caricamento firme"))
      .finally(() => setLoading(false));
  }, [documentId, toast]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const copyLink = (r: SignatureRequest) => {
    void navigator.clipboard.writeText(linkUrl(r.token));
    toast.success("Link copiato");
  };

  const downloadSigned = async (r: SignatureRequest) => {
    if (r.signed_document_id == null) return;
    try {
      const { url } = await exportDocumentPdfApi(r.signed_document_id, { disposition: "inline" });
      window.open(url, "_blank");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore apertura documento");
    }
  };

  const cancel = async (r: SignatureRequest) => {
    if (documentId == null) return;
    if (!window.confirm("Annullare questo invio? Il link non sarà più utilizzabile.")) return;
    setBusy(r.id);
    try {
      await cancelSignatureRequestApi(documentId, r.id);
      toast.success("Invio annullato");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore annullamento");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Firme e invii"
      description="Stato degli invii, audit trail e documento firmato"
      icon={<Icon name="pencil" className="h-5 w-5" />}
      size="lg"
    >
      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-muted dark:text-muted-dark">
          Nessun invio per questo modello. Usa «Invia per la firma» per generarne uno.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((r) => {
            const isOpen = expanded === r.id;
            const canCancel = !["signed", "filled", "cancelled", "expired", "refused"].includes(r.status);
            const a = r.audit;
            return (
              <li key={r.id} className="rounded-xl border border-line dark:border-line-dark">
                <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                  <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold">
                      {r.signer_name || r.signer_email || "Firmatario non indicato"}
                    </span>
                    <span className="block text-[11px] text-muted dark:text-muted-dark">
                      Inviato {fmt(r.created_at)}
                      {r.signed_at ? ` · Firmato ${fmt(r.signed_at)}` : ""}
                    </span>
                  </span>

                  <div className="flex items-center gap-1">
                    {r.status === "signed" && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => downloadSigned(r)}
                        leftIcon={<Icon name="download" className="h-3.5 w-3.5" />}
                      >
                        Documento firmato
                      </Button>
                    )}
                    {canCancel && (
                      <Button size="sm" variant="ghost" iconOnly title="Copia link" onClick={() => copyLink(r)}>
                        <Icon name="link" className="h-4 w-4" />
                      </Button>
                    )}
                    {(a || r.status === "signed") && (
                      <Button
                        size="sm"
                        variant="ghost"
                        iconOnly
                        title="Audit"
                        onClick={() => setExpanded(isOpen ? null : r.id)}
                      >
                        <Icon name={isOpen ? "chevron-down" : "chevron-right"} className="h-4 w-4" />
                      </Button>
                    )}
                    {canCancel && (
                      <Button
                        size="sm"
                        variant="danger-ghost"
                        iconOnly
                        title="Annulla invio"
                        onClick={() => cancel(r)}
                        disabled={busy === r.id}
                      >
                        <Icon name="x" className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t border-line/70 bg-cream/40 px-4 py-3 text-[12px] dark:border-line-dark/70 dark:bg-ink-2/40">
                    {a ? (
                      <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
                        <Row label="Firmatario" value={a.signer_name} />
                        <Row label="Email" value={a.signer_email} />
                        <Row label="IP" value={a.ip} />
                        <Row label="Dispositivo" value={a.user_agent} />
                        <Row label="Inviato" value={a.sent_at} />
                        <Row label="Aperto" value={a.opened_at} />
                        <Row label="Firmato" value={a.signed_at} />
                        <Row label="Consenso" value={a.consent ? "Prestato" : "Non prestato"} />
                        <div className="sm:col-span-2">
                          <dt className="text-[10px] font-bold uppercase tracking-wider text-muted dark:text-muted-dark">
                            Impronta documento (SHA-256)
                          </dt>
                          <dd className="break-all font-mono text-[11px]">{a.document_sha256 || "—"}</dd>
                        </div>
                        <Row
                          label="Marca temporale"
                          value={
                            a.timestamp?.applied
                              ? `${a.timestamp.provider ?? "InfoCert"} · ${a.timestamp.transaction ?? ""}`
                              : "Non applicata"
                          }
                        />
                      </dl>
                    ) : (
                      <p className="text-muted dark:text-muted-dark">
                        Audit non disponibile (documento non ancora firmato).
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-wider text-muted dark:text-muted-dark">{label}</dt>
      <dd className="truncate font-medium">{value || "—"}</dd>
    </div>
  );
}
