import { useEffect, useMemo, useRef, useState } from "react";
import {
  uploadDocumentApi,
  type DocLinkEntityType,
  type DocType,
  type DocumentDetail,
} from "../../api/documents";
import { useToast } from "../../context/ToastContext";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { SearchableSelect } from "../ui/SearchableSelect";
import { SegmentedSwitch } from "../ui/SegmentedSwitch";
import { Textarea } from "../ui/Textarea";

interface CompanyOption {
  id: number;
  name: string;
  /** Logo già risolto per il tema corrente (vedi getCompanyLogoUrl). */
  logo?: string | null;
}

interface DocumentUploadModalProps {
  open: boolean;
  onClose: () => void;
  companies: CompanyOption[];
  defaultCompanyId: number | null;
  /** Collegamenti applicati automaticamente al caricamento (es. contratto corrente). */
  defaultLinks?: Array<{ entity_type: DocLinkEntityType; entity_id: number }>;
  /** Blocca l'azienda (es. upload dalla tab documenti di un contratto). */
  lockCompany?: boolean;
  onUploaded: (doc: DocumentDetail) => void;
}

type UploadKind = "generico" | "modello" | "modello_contratto";

const KIND_OPTIONS: Array<{ value: UploadKind; label: string }> = [
  { value: "generico", label: "Documento" },
  { value: "modello", label: "Modello" },
  { value: "modello_contratto", label: "Modello contratto" },
];

export function DocumentUploadModal({
  open,
  onClose,
  companies,
  defaultCompanyId,
  defaultLinks,
  lockCompany = false,
  onUploaded,
}: DocumentUploadModalProps) {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<UploadKind>("generico");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [companyId, setCompanyId] = useState<number | null>(defaultCompanyId);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setFile(null);
      setKind("generico");
      setTitle("");
      setDescription("");
      setCompanyId(defaultCompanyId);
      setSaving(false);
    }
  }, [open, defaultCompanyId]);

  const companyOptions = useMemo(
    () => companies.map((c) => ({ value: String(c.id), label: c.name, avatarUrl: c.logo ?? null })),
    [companies]
  );

  const isTemplate = kind !== "generico";
  const fileAccept = isTemplate
    ? ".pdf,.docx"
    : ".pdf,.docx,.doc,.xlsx,.xls,.png,.jpg,.jpeg,.webp,.txt,.csv";

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected);
    if (selected && !title.trim()) {
      setTitle(selected.name.replace(/\.[^.]+$/, ""));
    }
    event.target.value = "";
  };

  const handleSubmit = async () => {
    if (!file) {
      toast.error("Seleziona un file da caricare");
      return;
    }
    if (companyId == null) {
      toast.error("Seleziona l'azienda");
      return;
    }
    if (isTemplate && !/\.(pdf|docx)$/i.test(file.name)) {
      toast.error("I modelli devono essere file PDF o Word (.docx)");
      return;
    }

    setSaving(true);
    try {
      const doc = await uploadDocumentApi({
        file,
        company_id: companyId,
        doc_type: kind as DocType,
        title: title.trim() || undefined,
        description: description.trim() || undefined,
        links: defaultLinks?.length ? defaultLinks : undefined,
      });
      toast.success(
        isTemplate
          ? `Modello caricato: ${doc.template_fields.length} campi rilevati`
          : "Documento caricato"
      );
      onUploaded(doc);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore durante il caricamento");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Carica documento"
      description="I file sono salvati su storage privato, visibili solo agli admin"
      icon={<Icon name="upload" className="w-5 h-5" />}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Annulla
          </Button>
          <Button onClick={handleSubmit} loading={saving} leftIcon={<Icon name="upload" className="w-4 h-4" />}>
            Carica
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <span className="block text-[12px] font-semibold text-muted dark:text-muted-dark mb-1.5">
            Tipo di documento
          </span>
          <SegmentedSwitch value={kind} onChange={setKind} options={KIND_OPTIONS} />
          {isTemplate && (
            <p className="mt-1.5 text-[12px] text-muted dark:text-muted-dark">
              PDF o Word: il documento viene analizzato subito e le righe da compilare diventano
              caselle su cui scrivere direttamente. I file Word vengono convertiti in PDF.
            </p>
          )}
        </div>

        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept={fileAccept}
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full rounded-lg border border-dashed border-line dark:border-line-dark px-4 py-6 text-center hover:bg-cream dark:hover:bg-ink-2 transition-colors"
          >
            {file ? (
              <span className="flex items-center justify-center gap-2 text-[13px] font-semibold">
                <Icon name="document-text" className="w-4 h-4" />
                {file.name}
              </span>
            ) : (
              <span className="text-[13px] text-muted dark:text-muted-dark">
                Clicca per scegliere un file{isTemplate ? " PDF o Word (.docx)" : ""}
              </span>
            )}
          </button>
        </div>

        {!lockCompany && (
          <div>
            <span className="block text-[12px] font-semibold text-muted dark:text-muted-dark mb-1.5">
              Azienda
            </span>
            <SearchableSelect
              value={companyId != null ? String(companyId) : ""}
              onChange={(value) => setCompanyId(value ? Number(value) : null)}
              options={companyOptions}
              placeholder="Seleziona azienda"
              menuLayer="portal"
              avatarShape="logo"
            />
          </div>
        )}

        <Input
          label="Titolo"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Nome con cui il documento compare in archivio"
        />

        <Textarea
          label="Descrizione (facoltativa)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
        />
      </div>
    </Modal>
  );
}
