import { useEffect, useMemo, useState } from "react";
import {
  createSignatureRequestApi,
  listSignatureRequestsApi,
  type DocumentItem,
  type SignatureRequest,
  type SignatureStatus,
} from "../../api/documents";
import { listContractsApi } from "../../api/contracts";
import { useToast } from "../../context/ToastContext";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { SearchableSelect } from "../ui/SearchableSelect";
import { SegmentedSwitch } from "../ui/SegmentedSwitch";

interface GenerateClientLinkModalProps {
  open: boolean;
  onClose: () => void;
  /** Basta l'item: il modal usa id, azienda, titolo e i collegamenti. */
  document: DocumentItem | null;
  /** Contratto da pre-selezionare (es. aprendo dalla scheda del contratto). */
  defaultContractId?: number | null;
}

const STATUS_LABEL: Record<SignatureStatus, string> = {
  draft: "Bozza",
  sent: "Inviato",
  opened: "Aperto",
  filled: "Compilato",
  signing: "In firma",
  signed: "Firmato",
  refused: "Rifiutato",
  expired: "Scaduto",
  cancelled: "Annullato",
};

const STATUS_VARIANT: Record<SignatureStatus, "default" | "info" | "success" | "warning"> = {
  draft: "default",
  sent: "info",
  opened: "info",
  filled: "info",
  signing: "warning",
  signed: "success",
  refused: "warning",
  expired: "default",
  cancelled: "default",
};

function clientLinkUrl(token: string): string {
  return `${window.location.origin}/firma/${token}`;
}

export function GenerateClientLinkModal({
  open,
  onClose,
  document: doc,
  defaultContractId,
}: GenerateClientLinkModalProps) {
  const toast = useToast();

  const [allContracts, setAllContracts] = useState<Array<{ id: number; title: string }>>([]);
  const [contractId, setContractId] = useState<number | null>(null);
  // Escape hatch: scegli un contratto diverso da quello collegato al documento.
  const [chooseOther, setChooseOther] = useState(false);
  const [signerName, setSignerName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [signerPhone, setSignerPhone] = useState("");
  const [otpChannel, setOtpChannel] = useState<"email" | "sms">("email");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const [requests, setRequests] = useState<SignatureRequest[]>([]);
  const [created, setCreated] = useState<SignatureRequest | null>(null);
  const [copied, setCopied] = useState(false);

  // Contratti GIÀ collegati al documento (dai "Collegamenti"): sono la scelta di default.
  const linkedContracts = useMemo(
    () =>
      (doc?.links ?? [])
        .filter((l) => l.entity_type === "contract")
        .map((l) => ({ id: l.entity_id, title: l.entity_label ?? `Contratto #${l.entity_id}` })),
    [doc]
  );

  useEffect(() => {
    if (!open || !doc) return;
    setSignerName("");
    setSignerEmail("");
    setSignerPhone("");
    setOtpChannel("email");
    setPassword("");
    setCreated(null);
    setCopied(false);
    setChooseOther(false);
    setContractId(defaultContractId ?? linkedContracts[0]?.id ?? null);
    listContractsApi({ company_id: doc.company_id })
      .then((rows) => setAllContracts(rows.map((c) => ({ id: c.id, title: c.title }))))
      .catch(() => setAllContracts([]));
    listSignatureRequestsApi(doc.id).then(setRequests).catch(() => setRequests([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, doc?.id]);

  // Etichetta leggibile del contratto scelto (dai collegamenti o dall'elenco azienda).
  const contractLabel = useMemo(() => {
    if (contractId == null) return null;
    return (
      linkedContracts.find((c) => c.id === contractId)?.title ??
      allContracts.find((c) => c.id === contractId)?.title ??
      `Contratto #${contractId}`
    );
  }, [contractId, linkedContracts, allContracts]);

  // Con collegamenti presenti mostriamo solo quelli (default); l'elenco completo
  // compare solo se l'utente sceglie esplicitamente "un altro".
  const useLinkedOnly = linkedContracts.length > 0 && !chooseOther;
  const contractOptions = (useLinkedOnly ? linkedContracts : allContracts).map((c) => ({
    value: String(c.id),
    label: c.title,
  }));

  const handleGenerate = async () => {
    if (!doc) return;
    if (otpChannel === "email" && !signerEmail.trim() && contractId == null) {
      toast.error("Indica l'email del firmatario o scegli un contratto");
      return;
    }
    if (otpChannel === "sms" && !signerPhone.trim()) {
      toast.error("Per l'OTP via SMS serve il numero del firmatario");
      return;
    }
    setSaving(true);
    try {
      const req = await createSignatureRequestApi(doc.id, {
        contract_id: contractId,
        signer_name: signerName.trim() || undefined,
        signer_email: signerEmail.trim() || undefined,
        signer_phone: signerPhone.trim() || undefined,
        otp_channel: otpChannel,
        password: password.trim() || undefined,
      });
      setCreated(req);
      setRequests((prev) => [req, ...prev]);
      toast.success("Link cliente generato");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore generazione link");
    } finally {
      setSaving(false);
    }
  };

  const copyLink = async (token: string) => {
    try {
      await navigator.clipboard.writeText(clientLinkUrl(token));
      setCopied(true);
      toast.success("Link copiato negli appunti");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Impossibile copiare: copia manualmente il link");
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Genera link cliente"
      description={doc?.title}
      icon={<Icon name="link" className="w-5 h-5" />}
      size="lg"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Chiudi
        </Button>
      }
    >
      <div className="space-y-5">
        {created ? (
          <div className="rounded-lg border border-success/40 bg-success/5 p-4">
            <p className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-success">
              <Icon name="check-circle" className="h-4 w-4" /> Link pronto da inviare al cliente
            </p>
            <div className="flex items-center gap-2">
              <Input readOnly value={clientLinkUrl(created.token)} className="flex-1" />
              <Button
                onClick={() => copyLink(created.token)}
                leftIcon={<Icon name={copied ? "check" : "copy"} className="h-4 w-4" />}
              >
                {copied ? "Copiato" : "Copia"}
              </Button>
            </div>
            <p className="mt-2 text-[12px] text-muted dark:text-muted-dark">
              Invialo al cliente ({created.signer_email || created.signer_phone || "firmatario"}).
              Scade il {created.expires_at ? new Date(created.expires_at).toLocaleDateString("it-IT") : "—"}.
            </p>
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => setCreated(null)}>
              Genera un altro link
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <span className="mb-1 block text-[12px] font-semibold text-muted dark:text-muted-dark">
                Contratto{" "}
                <span className="font-normal">(precompila i dati del cliente)</span>
              </span>

              {useLinkedOnly && linkedContracts.length === 1 ? (
                // Un solo contratto collegato al documento → si usa quello.
                <div className="flex items-center justify-between gap-2 rounded-md border border-line px-3 py-2 dark:border-line-dark">
                  <span className="min-w-0 truncate text-[13px] font-semibold">{contractLabel}</span>
                  <Button variant="ghost" size="sm" onClick={() => setChooseOther(true)}>
                    Scegli un altro
                  </Button>
                </div>
              ) : (
                <>
                  <SearchableSelect
                    value={contractId != null ? String(contractId) : ""}
                    onChange={(value) => setContractId(value ? Number(value) : null)}
                    options={contractOptions}
                    placeholder={
                      useLinkedOnly ? "Scegli tra i contratti collegati" : "Scegli il contratto"
                    }
                    menuLayer="portal"
                    showAvatar={false}
                  />
                  {useLinkedOnly && linkedContracts.length > 1 && (
                    <button
                      type="button"
                      className="mt-1 text-[12px] text-muted underline dark:text-muted-dark"
                      onClick={() => setChooseOther(true)}
                    >
                      Scegli un altro contratto (tutti)
                    </button>
                  )}
                  {chooseOther && linkedContracts.length > 0 && (
                    <button
                      type="button"
                      className="mt-1 text-[12px] text-muted underline dark:text-muted-dark"
                      onClick={() => {
                        setChooseOther(false);
                        setContractId(linkedContracts[0].id);
                      }}
                    >
                      Usa il contratto collegato al documento
                    </button>
                  )}
                  {linkedContracts.length === 0 && (
                    <p className="mt-1 text-[12px] text-muted dark:text-muted-dark">
                      Documento non collegato a un contratto: scegline uno per precompilare i dati del
                      cliente (o collegane uno dai «Collegamenti»).
                    </p>
                  )}
                </>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
              <Input
                label="Nome firmatario (facoltativo)"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="Se vuoto, dal cliente del contratto"
              />
              <Input
                label="Email firmatario"
                type="email"
                value={signerEmail}
                onChange={(e) => setSignerEmail(e.target.value)}
                placeholder="Se vuoto, dal cliente del contratto"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
              <div>
                <span className="mb-1 block text-[12px] font-semibold text-muted dark:text-muted-dark">
                  Canale OTP
                </span>
                <SegmentedSwitch
                  value={otpChannel}
                  onChange={setOtpChannel}
                  options={[
                    { value: "email", label: "Email" },
                    { value: "sms", label: "SMS" },
                  ]}
                />
              </div>
              {otpChannel === "sms" && (
                <Input
                  label="Telefono firmatario"
                  value={signerPhone}
                  onChange={(e) => setSignerPhone(e.target.value)}
                  placeholder="+39…"
                />
              )}
            </div>

            <Input
              label="Password pagina (facoltativa)"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Se impostata, il cliente la dovrà inserire per aprire il documento"
            />

            <Button
              onClick={handleGenerate}
              loading={saving}
              leftIcon={<Icon name="link" className="h-4 w-4" />}
            >
              Genera link
            </Button>
          </div>
        )}

        {requests.length > 0 && (
          <div>
            <h4 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-muted dark:text-muted-dark">
              Link generati
            </h4>
            <ul className="space-y-1.5">
              {requests.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-line px-3 py-2 dark:border-line-dark"
                >
                  <span className="min-w-0 truncate text-[13px]">
                    <Badge variant={STATUS_VARIANT[r.status]} className="mr-2">
                      {STATUS_LABEL[r.status]}
                    </Badge>
                    {r.signer_name || r.signer_email || r.signer_phone || "Firmatario"}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => copyLink(r.token)}
                    leftIcon={<Icon name="copy" className="h-3.5 w-3.5" />}
                  >
                    Copia link
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
