import { useEffect, useMemo, useRef, useState } from "react";
import {
  createComposerApi,
  listDocumentsApi,
  uploadDocumentApi,
  type DocLinkEntityType,
  type DocType,
  type DocumentDetail,
  type DocumentItem,
} from "../../api/documents";
import { useToast } from "../../context/ToastContext";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
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

type UploadKind = "generico" | "modello" | "modello_contratto" | "parte_contratto";

const KIND_OPTIONS: Array<{ value: UploadKind; label: string }> = [
  { value: "generico", label: "Documento" },
  { value: "modello", label: "Modello" },
  { value: "parte_contratto", label: "Parte contratto" },
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

  // Compositore (modello_contratto): si crea unendo parti esistenti, senza file.
  const [libParts, setLibParts] = useState<DocumentItem[]>([]);
  const [partsLoading, setPartsLoading] = useState(false);
  const [selectedPartIds, setSelectedPartIds] = useState<number[]>([]);

  useEffect(() => {
    if (open) {
      setFile(null);
      setKind("generico");
      setTitle("");
      setDescription("");
      setCompanyId(defaultCompanyId);
      setSelectedPartIds([]);
      setSaving(false);
    }
  }, [open, defaultCompanyId]);

  const isComposer = kind === "modello_contratto";

  // Carica le parti disponibili in libreria per l'azienda scelta.
  useEffect(() => {
    if (!open || !isComposer || companyId == null) {
      setLibParts([]);
      return;
    }
    let cancelled = false;
    setPartsLoading(true);
    listDocumentsApi({ company_id: companyId, doc_type: "parte_contratto", limit: 500 })
      .then((docs) => {
        if (!cancelled) setLibParts(docs);
      })
      .catch(() => {
        if (!cancelled) setLibParts([]);
      })
      .finally(() => {
        if (!cancelled) setPartsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, isComposer, companyId]);

  const companyOptions = useMemo(
    () => companies.map((c) => ({ value: String(c.id), label: c.name, avatarUrl: c.logo ?? null })),
    [companies]
  );

  // I modelli a file (modello / parte_contratto) accettano PDF o Word; il
  // compositore invece non usa file (unisce parti già in archivio).
  const isFileTemplate = kind === "modello" || kind === "parte_contratto";
  const fileAccept = isFileTemplate
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

  const togglePart = (id: number, checked: boolean) => {
    setSelectedPartIds((prev) =>
      checked ? [...prev, id] : prev.filter((p) => p !== id)
    );
  };

  const handleSubmit = async () => {
    if (companyId == null) {
      toast.error("Seleziona l'azienda");
      return;
    }

    // Compositore: nessun file, unisce le parti selezionate (in ordine di scelta).
    if (isComposer) {
      setSaving(true);
      try {
        const doc = await createComposerApi({
          company_id: companyId,
          title: title.trim() || undefined,
          description: description.trim() || undefined,
          part_ids: selectedPartIds,
        });
        toast.success(
          selectedPartIds.length
            ? `Modello creato unendo ${selectedPartIds.length} parti`
            : "Modello creato: aggiungi le parti dal dettaglio"
        );
        onUploaded(doc);
        onClose();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Errore durante la creazione");
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!file) {
      toast.error("Seleziona un file da caricare");
      return;
    }
    if (isFileTemplate && !/\.(pdf|docx)$/i.test(file.name)) {
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
        isFileTemplate
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
      title={isComposer ? "Nuovo modello di contratto" : "Carica documento"}
      description={
        isComposer
          ? "Unisci le parti in un unico contratto componibile"
          : "I file sono salvati su storage privato, visibili solo agli admin"
      }
      icon={<Icon name={isComposer ? "list" : "upload"} className="w-5 h-5" />}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Annulla
          </Button>
          <Button
            onClick={handleSubmit}
            loading={saving}
            leftIcon={<Icon name={isComposer ? "check" : "upload"} className="w-4 h-4" />}
          >
            {isComposer ? "Crea modello" : "Carica"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <span className="block text-[12px] font-semibold text-muted dark:text-muted-dark mb-1.5">
            Tipo di documento
          </span>
          {/* 4 tipi con etichette lunghe non stanno su una riga nel modal `lg`:
              griglia 2×2 (1 colonna su mobile) → niente overflow orizzontale.
              La pillola attiva scorre lo stesso (l'hook usa anche --seg-y). */}
          <SegmentedSwitch
            value={kind}
            onChange={setKind}
            options={KIND_OPTIONS}
            className="!grid w-full grid-cols-1 gap-1 !rounded-2xl sm:grid-cols-2"
          />
          {isFileTemplate && (
            <p className="mt-1.5 text-[12px] text-muted dark:text-muted-dark">
              PDF o Word: il documento viene analizzato subito e le righe da compilare diventano
              caselle su cui scrivere direttamente. I file Word vengono convertiti in PDF.
            </p>
          )}
          {isComposer && (
            <p className="mt-1.5 text-[12px] text-muted dark:text-muted-dark">
              Il modello di contratto non ha un file proprio: seleziona qui sotto le parti (in
              ordine) da unire. Potrai riordinarle o aggiungerne altre dal dettaglio.
            </p>
          )}
        </div>

        {isComposer ? (
          <div>
            <span className="mb-1.5 block text-[12px] font-semibold text-muted dark:text-muted-dark">
              Parti da comporre {selectedPartIds.length > 0 && `(${selectedPartIds.length} scelte)`}
            </span>
            {companyId == null ? (
              <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-[13px] text-muted dark:border-line-dark dark:text-muted-dark">
                Seleziona prima l'azienda per vedere le parti disponibili.
              </p>
            ) : partsLoading ? (
              <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-[13px] text-muted dark:border-line-dark dark:text-muted-dark">
                Caricamento parti…
              </p>
            ) : libParts.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-[13px] text-muted dark:border-line-dark dark:text-muted-dark">
                Nessuna parte in libreria. Crea prima delle «Parte contratto», poi componi il
                modello. Puoi comunque creare il modello vuoto e aggiungerle dopo.
              </p>
            ) : (
              <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                {libParts.map((part) => {
                  const order = selectedPartIds.indexOf(part.id);
                  const checked = order >= 0;
                  return (
                    <label
                      key={part.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                        checked
                          ? "border-ink bg-cream dark:border-paper dark:bg-[#1c1c20]"
                          : "border-line hover:bg-cream dark:border-line-dark dark:hover:bg-[#1c1c20]"
                      }`}
                    >
                      <Checkbox checked={checked} onChange={(next) => togglePart(part.id, next)} />
                      {checked && (
                        <span className="flex h-6 w-6 flex-none items-center justify-center rounded-md bg-ink text-[11px] font-bold text-paper dark:bg-paper dark:text-ink">
                          {order + 1}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold">{part.title}</span>
                        <span className="text-[11px] text-muted dark:text-muted-dark">
                          {part.original_filename}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
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
                  Clicca per scegliere un file{isFileTemplate ? " PDF o Word (.docx)" : ""}
                </span>
              )}
            </button>
          </div>
        )}

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
