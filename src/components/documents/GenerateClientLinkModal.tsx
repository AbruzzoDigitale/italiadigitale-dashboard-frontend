import { useEffect, useMemo, useState } from "react";
import {
  cancelSignatureRequestApi,
  createSignatureRequestApi,
  fetchFillBaseApi,
  listSignatureRequestsApi,
  signaturePreviewApi,
  type ComposeField,
  type DocumentItem,
  type OverlayElement,
  type PageMetric,
  type SignatureRequest,
  type SignatureStatus,
  type TemplateField,
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
import { Spinner } from "../ui/Spinner";
import { PdfFillEditor } from "./PdfFillEditor";

interface GenerateClientLinkModalProps {
  open: boolean;
  onClose: () => void;
  document: DocumentItem | null;
  /** Contratto da pre-selezionare (es. aprendo dalla scheda del contratto). */
  defaultContractId?: number | null;
}

type Step = "form" | "review" | "done";

const STATUS_LABEL: Record<SignatureStatus, string> = {
  draft: "Predisposto",
  sent: "Inviato al cliente",
  opened: "Visualizzato dal cliente",
  filled: "Firmato dal cliente",
  signing: "In firma",
  signed: "Firmato dal cliente",
  refused: "Rifiutato",
  expired: "Scaduto",
  cancelled: "Annullato",
};

const STATUS_VARIANT: Record<SignatureStatus, "default" | "info" | "success" | "warning"> = {
  draft: "default",
  sent: "info",
  opened: "info",
  filled: "success",
  signing: "warning",
  signed: "success",
  refused: "warning",
  expired: "default",
  cancelled: "default",
};

function toTemplateField(f: ComposeField, i: number): TemplateField {
  return {
    id: f.field_id ?? i + 1,
    tag_name: f.tag_name,
    label: f.label,
    display_label: f.display_label,
    field_type: f.field_type,
    source_path: f.source_path,
    group_key: f.group_key,
    required: f.required,
    audience: f.audience,
    is_in_document: f.is_in_document,
    occurrences: 1,
    placeholder_len: f.placeholder_len,
    sort_order: i,
    page: f.page,
    pos_x: f.pos_x,
    pos_y: f.pos_y,
    pos_w: f.pos_w,
    pos_h: f.pos_h,
    font_size: f.font_size,
    placeholder_kind: f.placeholder_kind,
  };
}

const clientLinkUrl = (token: string) => `${window.location.origin}/firma/${token}`;

export function GenerateClientLinkModal({
  open,
  onClose,
  document: doc,
  defaultContractId,
}: GenerateClientLinkModalProps) {
  const toast = useToast();

  const [step, setStep] = useState<Step>("form");
  const [allContracts, setAllContracts] = useState<Array<{ id: number; title: string }>>([]);
  const [contractId, setContractId] = useState<number | null>(null);
  const [chooseOther, setChooseOther] = useState(false);
  const [signerName, setSignerName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [signerPhone, setSignerPhone] = useState("");
  const [otpChannel, setOtpChannel] = useState<"email" | "sms">("email");
  const [password, setPassword] = useState("");

  const [loadingReview, setLoadingReview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [requests, setRequests] = useState<SignatureRequest[]>([]);
  const [created, setCreated] = useState<SignatureRequest | null>(null);
  const [copied, setCopied] = useState(false);

  // Stato di revisione documento
  const [fileData, setFileData] = useState<ArrayBuffer | null>(null);
  const [pages, setPages] = useState<PageMetric[]>([]);
  const [fields, setFields] = useState<TemplateField[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [elements, setElements] = useState<OverlayElement[]>([]);
  const [signatures, setSignatures] = useState<Record<string, string>>({});
  const [partIds, setPartIds] = useState<number[]>([]);

  const linkedContracts = useMemo(
    () =>
      (doc?.links ?? [])
        .filter((l) => l.entity_type === "contract")
        .map((l) => ({ id: l.entity_id, title: l.entity_label ?? `Contratto #${l.entity_id}` })),
    [doc]
  );

  useEffect(() => {
    if (!open || !doc) return;
    setStep("form");
    setSignerName("");
    setSignerEmail("");
    setSignerPhone("");
    setOtpChannel("email");
    setPassword("");
    setCreated(null);
    setCopied(false);
    setChooseOther(false);
    setFileData(null);
    setContractId(defaultContractId ?? linkedContracts[0]?.id ?? null);
    listContractsApi({ company_id: doc.company_id })
      .then((rows) => setAllContracts(rows.map((c) => ({ id: c.id, title: c.title }))))
      .catch(() => setAllContracts([]));
    listSignatureRequestsApi(doc.id).then(setRequests).catch(() => setRequests([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, doc?.id]);

  const contractLabel = useMemo(() => {
    if (contractId == null) return null;
    return (
      linkedContracts.find((c) => c.id === contractId)?.title ??
      allContracts.find((c) => c.id === contractId)?.title ??
      `Contratto #${contractId}`
    );
  }, [contractId, linkedContracts, allContracts]);

  const useLinkedOnly = linkedContracts.length > 0 && !chooseOther;
  const contractOptions = (useLinkedOnly ? linkedContracts : allContracts).map((c) => ({
    value: String(c.id),
    label: c.title,
  }));

  const validateSigner = (): boolean => {
    if (otpChannel === "email" && !signerEmail.trim() && contractId == null) {
      toast.error("Indica l'email del firmatario o scegli un contratto");
      return false;
    }
    if (otpChannel === "sms" && !signerPhone.trim()) {
      toast.error("Per l'OTP via SMS serve il numero del firmatario");
      return false;
    }
    return true;
  };

  const goReview = async () => {
    if (!doc || !validateSigner()) return;
    setLoadingReview(true);
    try {
      const pv = await signaturePreviewApi(doc.id, { contractId });
      setPartIds(pv.part_ids);
      setFields(pv.fields.map(toTemplateField));
      const initial: Record<string, string> = {};
      for (const f of pv.fields) initial[f.tag_name] = f.value;
      setValues(initial);
      setElements([]);
      setSignatures({});
      setPages(pv.pages);
      setFileData(await fetchFillBaseApi(doc.id, pv.part_ids.length ? pv.part_ids : undefined));
      setStep("review");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore preparazione documento");
    } finally {
      setLoadingReview(false);
    }
  };

  const approve = async () => {
    if (!doc) return;
    setSaving(true);
    try {
      const req = await createSignatureRequestApi(doc.id, {
        contract_id: contractId,
        signer_name: signerName.trim() || undefined,
        signer_email: signerEmail.trim() || undefined,
        signer_phone: signerPhone.trim() || undefined,
        otp_channel: otpChannel,
        password: password.trim() || undefined,
        part_ids: partIds,
        values,
        elements,
        signatures,
      });
      setCreated(req);
      setRequests((prev) => [req, ...prev]);
      setStep("done");
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

  const cancelRequest = async (req: SignatureRequest) => {
    if (!doc) return;
    if (!window.confirm("Annullare questo invio? Il link non sarà più utilizzabile.")) return;
    try {
      const updated = await cancelSignatureRequestApi(doc.id, req.id);
      setRequests((prev) => prev.map((r) => (r.id === req.id ? updated : r)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore annullamento");
    }
  };

  const canEdit = !!fileData && !loadingReview;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={step === "review" ? "Rivedi e approva" : "Invia al cliente"}
      description={doc?.title}
      icon={<Icon name={step === "review" ? "pencil" : "link"} className="w-5 h-5" />}
      size={step === "review" ? "2xl" : "lg"}
      dialogClassName={step === "review" ? "!max-w-[96vw] h-[92vh]" : ""}
      mobileFullscreen={step === "review"}
      footer={
        step === "review" ? (
          <>
            <Button variant="secondary" onClick={() => setStep("form")} disabled={saving}>
              Indietro
            </Button>
            <Button
              onClick={approve}
              loading={saving}
              disabled={!canEdit}
              leftIcon={<Icon name="check" className="w-4 h-4" />}
            >
              Approva e genera link cliente
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onClose}>
            Chiudi
          </Button>
        )
      }
    >
      {step === "review" ? (
        <div className="flex h-full flex-col gap-2">
          <p className="flex-none text-[12px] text-muted dark:text-muted-dark">
            Rivedi i dati già apposti (azienda + cliente) e correggi se serve. Poi
            <b> Approva e genera link</b>: il cliente potrà modificare solo i propri campi.
          </p>
          {!canEdit ? (
            <div className="flex flex-1 items-center justify-center">
              <Spinner />
            </div>
          ) : (
            fileData && (
              <PdfFillEditor
                fileData={fileData}
                pages={pages}
                fields={fields}
                values={values}
                onValuesChange={setValues}
                elements={elements}
                onElementsChange={setElements}
                signatures={signatures}
                onSignaturesChange={setSignatures}
                hasTextLayer
              />
            )
          )}
        </div>
      ) : step === "done" && created ? (
        <div className="space-y-5">
          <div className="rounded-lg border border-success/40 bg-success/5 p-4">
            <p className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-success">
              <Icon name="check-circle" className="h-4 w-4" /> Pronto: invia questo link al cliente
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
              Firmatario: {created.signer_email || created.signer_phone || "—"} · scade il{" "}
              {created.expires_at ? new Date(created.expires_at).toLocaleDateString("it-IT") : "—"}.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="space-y-3">
            <div>
              <span className="mb-1 block text-[12px] font-semibold text-muted dark:text-muted-dark">
                Contratto <span className="font-normal">(precompila i dati del cliente)</span>
              </span>
              {useLinkedOnly && linkedContracts.length === 1 ? (
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
                    placeholder={useLinkedOnly ? "Scegli tra i contratti collegati" : "Scegli il contratto"}
                    menuLayer="portal"
                    showAvatar={false}
                  />
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
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Se impostata, il cliente la dovrà inserire per aprire il documento"
            />

            <Button
              onClick={goReview}
              loading={loadingReview}
              rightIcon={<Icon name="chevron-right" className="h-4 w-4" />}
            >
              Avanti: rivedi il documento
            </Button>
          </div>

          {requests.length > 0 && (
            <div>
              <h4 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-muted dark:text-muted-dark">
                Invii
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
                    <div className="flex flex-none items-center gap-1">
                      {!["signed", "filled", "cancelled"].includes(r.status) && (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => copyLink(r.token)}
                            leftIcon={<Icon name="copy" className="h-3.5 w-3.5" />}
                          >
                            Copia link
                          </Button>
                          <Button
                            size="sm"
                            variant="danger-ghost"
                            iconOnly
                            title="Annulla invio"
                            aria-label="Annulla invio"
                            onClick={() => cancelRequest(r)}
                          >
                            <Icon name="x" className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
