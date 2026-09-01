import { useCallback, useEffect, useMemo, useState } from "react";
import {
  composeApi,
  fetchFillBaseApi,
  getFillPrefillApi,
  updateVisualOverlayApi,
  visualFillApi,
  visualScanApi,
  type ComposeField,
  type DocumentDetail,
  type OverlayElement,
  type PageMetric,
  type TemplateField,
} from "../../api/documents";
import { listContractsApi } from "../../api/contracts";
import { useToast } from "../../context/ToastContext";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { Icon } from "../ui/Icon";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { SearchableSelect } from "../ui/SearchableSelect";
import { Spinner } from "../ui/Spinner";

/** ComposeField → forma TemplateField per l'editor (id/occorrenze sintetici). */
function composeFieldToTemplateField(f: ComposeField, index: number): TemplateField {
  return {
    id: index + 1,
    tag_name: f.tag_name,
    label: f.label,
    display_label: f.display_label,
    field_type: f.field_type,
    source_path: f.source_path,
    group_key: f.group_key,
    // ComposeField non porta required/audience: default neutri (editabile, non obbligatorio).
    required: false,
    audience: "client",
    is_in_document: f.is_in_document,
    occurrences: 1,
    placeholder_len: f.placeholder_len,
    sort_order: index,
    page: f.page,
    pos_x: f.pos_x,
    pos_y: f.pos_y,
    pos_w: f.pos_w,
    pos_h: f.pos_h,
    font_size: f.font_size,
    placeholder_kind: f.placeholder_kind,
  };
}
import { openDocumentDownload, openDocumentPdfExport } from "./documentActions";
import { PdfFillEditor } from "./PdfFillEditor";

interface DocumentVisualFillModalProps {
  open: boolean;
  onClose: () => void;
  /** Modello di contratto (compilazione) o copia compilata (modifica). */
  document: DocumentDetail | null;
  /** Contratto già scelto, es. aprendo dalla scheda del contratto. */
  contractId?: number | null;
  onDone?: (doc: DocumentDetail) => void;
}

export function DocumentVisualFillModal({
  open,
  onClose,
  document: doc,
  contractId: contractIdProp,
  onDone,
}: DocumentVisualFillModalProps) {
  const toast = useToast();
  const isEdit = doc?.doc_type === "compilato";
  // Parte/modello a file unico: compilabile da solo, con contratto facoltativo.
  const isSingleTemplate = doc?.doc_type === "parte_contratto" || doc?.doc_type === "modello";

  const contractLinks = useMemo(
    () => (doc?.links ?? []).filter((l) => l.entity_type === "contract"),
    [doc]
  );

  // Contratti dell'azienda per il prefill facoltativo di una singola parte.
  const [companyContracts, setCompanyContracts] = useState<Array<{ id: number; title: string }>>([]);

  const [contractId, setContractId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<DocumentDetail | null>(null);

  const [fileData, setFileData] = useState<ArrayBuffer | null>(null);
  const [pages, setPages] = useState<PageMetric[]>([]);
  const [fields, setFields] = useState<TemplateField[]>([]);
  const [hasTextLayer, setHasTextLayer] = useState(true);
  const [title, setTitle] = useState("");

  const [values, setValues] = useState<Record<string, string>>({});
  const [elements, setElements] = useState<OverlayElement[]>([]);
  const [signatures, setSignatures] = useState<Record<string, string>>({});

  // Parti del contratto (componibile). In compilazione l'utente le seleziona;
  // in ri-modifica si riusano quelle memorizzate nella copia compilata.
  const parts = useMemo(
    () => (doc?.parts ?? []).slice().sort((a, b) => a.sort_order - b.sort_order),
    [doc]
  );
  const hasParts = !isEdit && parts.length > 0;
  const [selectedPartIds, setSelectedPartIds] = useState<number[]>([]);
  const [partsConfirmed, setPartsConfirmed] = useState(false);

  useEffect(() => {
    if (!open || !doc) return;
    setResult(null);
    setLoadError(null);
    setFileData(null);
    setValues({});
    setElements([]);
    setSignatures({});
    setTitle("");
    setSelectedPartIds(parts.map((p) => p.part_document_id));
    setPartsConfirmed(false);
    setContractId(
      isEdit
        ? null
        : contractIdProp ?? (contractLinks.length === 1 ? contractLinks[0].entity_id : null)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, doc?.id]);

  // Elenco contratti dell'azienda: serve solo per il prefill facoltativo quando
  // si compila una singola parte (le parti non sono legate a un contratto).
  useEffect(() => {
    if (!open || !doc || !isSingleTemplate) {
      setCompanyContracts([]);
      return;
    }
    listContractsApi({ company_id: doc.company_id })
      .then((rows) => setCompanyContracts(rows.map((c) => ({ id: c.id, title: c.title }))))
      .catch(() => setCompanyContracts([]));
  }, [open, doc, isSingleTemplate]);

  const load = useCallback(async () => {
    if (!doc) return;
    setLoading(true);
    setLoadError(null);
    try {
      // Il modello sorgente porta campi, pagine e PDF su cui si compila.
      const templateId = isEdit ? doc.source_document_id : doc.id;
      if (!templateId) throw new Error("Modello di origine non disponibile");

      // Parti da comporre: in ri-modifica quelle memorizzate, in compilazione
      // quelle scelte dall'utente.
      const partIds = isEdit ? doc.overlay_elements?.part_ids ?? [] : selectedPartIds;
      const useCompose = partIds.length > 0 && (isEdit ? true : hasParts);

      if (useCompose) {
        const comp = await composeApi(templateId, {
          contractId: isEdit ? undefined : contractId,
          partIds,
        });
        setPages(comp.pages);
        setFields(comp.fields.map(composeFieldToTemplateField));
        setHasTextLayer(comp.has_text_layer);
        const buffer = await fetchFillBaseApi(templateId, partIds);
        setFileData(buffer);
        if (isEdit) {
          const state = doc.overlay_elements;
          setValues(state?.values ?? doc.field_values ?? {});
          setElements(state?.elements ?? []);
        } else {
          const initial: Record<string, string> = {};
          for (const f of comp.fields) initial[f.tag_name] = f.value;
          setValues(initial);
          setTitle(comp.suggested_title);
        }
        return;
      }

      // ── Percorso legacy (modello a file singolo) ──
      const scan = await visualScanApi(templateId);
      setPages(scan.pages);
      setFields(scan.fields.filter((f) => f.page != null));
      setHasTextLayer(scan.has_text_layer);

      const buffer = await fetchFillBaseApi(templateId);
      setFileData(buffer);

      if (isEdit) {
        const state = doc.overlay_elements;
        setValues(state?.values ?? doc.field_values ?? {});
        setElements(state?.elements ?? []);
      } else {
        if (contractId == null) {
          setValues({});
          return;
        }
        const prefill = await getFillPrefillApi(doc.id, contractId);
        const initial: Record<string, string> = {};
        const sourceByTag = new Map<string, string | null>();
        for (const field of prefill.fields) {
          initial[field.tag_name] = field.value;
          sourceByTag.set(field.tag_name, field.source_path);
        }
        setValues(initial);
        setFields((prev) =>
          prev.map((f) =>
            sourceByTag.has(f.tag_name)
              ? { ...f, source_path: sourceByTag.get(f.tag_name) ?? null }
              : f
          )
        );
        setTitle(prefill.suggested_title);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Errore caricamento documento");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, isEdit, contractId, selectedPartIds, hasParts]);

  useEffect(() => {
    if (!open || !doc) return;
    // Con parti: attende la conferma della selezione prima di caricare.
    if (hasParts && !partsConfirmed) return;
    // Una singola parte si carica anche senza contratto (prefill facoltativo).
    if (isEdit || contractId != null || isSingleTemplate) load();
  }, [open, doc, isEdit, contractId, hasParts, partsConfirmed, isSingleTemplate, load]);

  const signaturePreviews = useMemo(() => {
    // In modifica le firme già salvate si vedono solo dopo il salvataggio del
    // PDF: mostriamo un segnaposto neutro finché non vengono ridisegnate.
    const map: Record<string, string> = {};
    for (const element of elements) {
      if (element.type === "signature" && element.signature_key && !signatures[element.signature_key]) {
        map[element.signature_key] = "";
      }
    }
    return map;
  }, [elements, signatures]);

  const handleSave = async () => {
    if (!doc) return;
    setSaving(true);
    try {
      const payloadElements = elements.map((el) => ({
        id: el.id,
        type: el.type,
        page: el.page,
        x: el.x,
        y: el.y,
        w: el.w,
        h: el.h,
        ...(el.value != null ? { value: el.value } : {}),
        ...(el.font_size != null ? { font_size: el.font_size } : {}),
        ...(el.signature_key ? { signature_key: el.signature_key } : {}),
      }));

      let saved: DocumentDetail;
      if (isEdit) {
        saved = await updateVisualOverlayApi(doc.id, {
          values,
          elements: payloadElements,
          signatures,
        });
        toast.success("Documento rigenerato");
      } else {
        // Una singola parte/modello si compila anche senza contratto.
        if (!isSingleTemplate && contractId == null) return;
        saved = await visualFillApi(doc.id, {
          contract_id: contractId,
          title: title.trim() || undefined,
          values,
          elements: payloadElements,
          signatures,
          part_ids: hasParts ? selectedPartIds : undefined,
        });
        toast.success("Copia compilata creata");
      }
      setResult(saved);
      onDone?.(saved);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore salvataggio documento");
    } finally {
      setSaving(false);
    }
  };

  const openResult = async (mode: "download" | "preview") => {
    if (!result) return;
    try {
      if (mode === "preview") await openDocumentPdfExport(result.id, { disposition: "inline" });
      else await openDocumentDownload(result.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore apertura documento");
    }
  };

  const contractOptions = contractLinks.map((l) => ({
    value: String(l.entity_id),
    label: l.entity_label ?? `Contratto #${l.entity_id}`,
  }));

  const NO_CONTRACT = "__none__";
  const singleContractOptions = [
    { value: NO_CONTRACT, label: "Nessun contratto (compila a mano)" },
    ...companyContracts.map((c) => ({ value: String(c.id), label: c.title })),
  ];

  const canEdit = !!fileData && !loading && !loadError;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        isEdit
          ? "Modifica documento compilato"
          : isSingleTemplate
            ? "Compila documento"
            : "Compila contratto"
      }
      description={doc?.title}
      icon={<Icon name="pencil" className="w-5 h-5" />}
      size="full"
      dialogClassName="!max-w-[96vw] h-[92vh]"
      mobileFullscreen
      footer={
        result ? (
          <Button variant="secondary" onClick={onClose}>
            Chiudi
          </Button>
        ) : hasParts && !partsConfirmed ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              Annulla
            </Button>
            <Button
              onClick={() => setPartsConfirmed(true)}
              disabled={selectedPartIds.length === 0 || contractId == null}
              rightIcon={<Icon name="chevron-right" className="w-4 h-4" />}
            >
              Continua
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="secondary"
              onClick={() => (hasParts ? setPartsConfirmed(false) : onClose())}
              disabled={saving}
            >
              {hasParts ? "Indietro" : "Annulla"}
            </Button>
            <Button
              onClick={handleSave}
              loading={saving}
              disabled={!canEdit || (!isEdit && !isSingleTemplate && contractId == null)}
              leftIcon={<Icon name="check" className="w-4 h-4" />}
            >
              {isEdit ? "Rigenera PDF" : "Genera PDF compilato"}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-4 py-10 text-center">
          <Icon name="check-circle" className="mx-auto h-10 w-10 text-success" />
          <p className="text-[14px] font-semibold">{result.title}</p>
          <p className="text-[13px] text-muted dark:text-muted-dark">
            {isEdit
              ? "Il documento è stato rigenerato con le modifiche."
              : "Il PDF compilato è stato salvato e collegato al contratto."}
          </p>
          <div className="flex justify-center gap-2">
            <Button variant="secondary" onClick={() => openResult("preview")} leftIcon={<Icon name="eye" className="h-4 w-4" />}>
              Apri PDF
            </Button>
            <Button variant="secondary" onClick={() => openResult("download")} leftIcon={<Icon name="download" className="h-4 w-4" />}>
              Scarica
            </Button>
          </div>
        </div>
      ) : hasParts && !partsConfirmed ? (
        <div className="flex flex-col gap-4">
          <p className="text-[13px] text-muted dark:text-muted-dark">
            Seleziona le parti da includere nel contratto: verranno unite in un unico PDF.
          </p>
          {contractLinks.length > 1 && (
            <div className="w-72">
              <span className="mb-1 block text-[12px] font-semibold">Contratto</span>
              <SearchableSelect
                value={contractId != null ? String(contractId) : ""}
                onChange={(value) => setContractId(value ? Number(value) : null)}
                options={contractOptions}
                placeholder="Scegli il contratto"
                menuLayer="portal"
                showAvatar={false}
              />
            </div>
          )}
          {contractLinks.length === 0 && (
            <p className="text-[13px] text-warning">
              Il modello non è collegato a nessun contratto: collegalo prima dalla scheda del documento.
            </p>
          )}
          <div className="space-y-2">
            {parts.map((part) => {
              const checked = selectedPartIds.includes(part.part_document_id);
              return (
                <label
                  key={part.link_id}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border border-line px-3 py-2.5 hover:bg-cream dark:border-line-dark dark:hover:bg-[#1c1c20]"
                >
                  <Checkbox
                    checked={checked}
                    onChange={(next) =>
                      setSelectedPartIds((prev) =>
                        next
                          ? [...prev, part.part_document_id]
                          : prev.filter((id) => id !== part.part_document_id)
                      )
                    }
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{part.title}</span>
                    <span className="text-[11px] text-muted dark:text-muted-dark">
                      {part.page_count} pagine · {part.field_count} campi
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {!isEdit && (
            <div className="flex flex-wrap items-end gap-3">
              {isSingleTemplate ? (
                <div className="w-72">
                  <span className="mb-1 block text-[12px] font-semibold">
                    Contratto <span className="font-normal text-muted dark:text-muted-dark">(facoltativo)</span>
                  </span>
                  <SearchableSelect
                    value={contractId != null ? String(contractId) : NO_CONTRACT}
                    onChange={(value) =>
                      setContractId(value && value !== NO_CONTRACT ? Number(value) : null)
                    }
                    options={singleContractOptions}
                    placeholder="Compila a mano"
                    menuLayer="portal"
                    showAvatar={false}
                  />
                </div>
              ) : (
                contractLinks.length > 1 && (
                  <div className="w-64">
                    <span className="mb-1 block text-[12px] font-semibold">Contratto</span>
                    <SearchableSelect
                      value={contractId != null ? String(contractId) : ""}
                      onChange={(value) => setContractId(value ? Number(value) : null)}
                      options={contractOptions}
                      placeholder="Scegli il contratto"
                      menuLayer="portal"
                      showAvatar={false}
                    />
                  </div>
                )
              )}
              <div className="min-w-[240px] flex-1">
                <Input
                  label="Titolo della copia compilata"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
            </div>
          )}

          {isSingleTemplate && !isEdit && (
            <p className="text-[12px] text-muted dark:text-muted-dark">
              Scegli un contratto per precompilare i campi dai suoi dati, oppure compila a mano.
              La copia compilata finisce in archivio (e viene collegata al contratto, se scelto).
            </p>
          )}

          {contractLinks.length === 0 && !isEdit && !isSingleTemplate && (
            <p className="text-[13px] text-warning">
              Il modello non è collegato a nessun contratto: collegalo prima dalla scheda del documento.
            </p>
          )}

          {loadError && <p className="text-[13px] text-danger">{loadError}</p>}

          {loading && (
            <div className="flex flex-1 items-center justify-center">
              <Spinner />
            </div>
          )}

          {canEdit && fileData && (
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
              signaturePreviews={signaturePreviews}
              hasTextLayer={hasTextLayer}
            />
          )}
        </div>
      )}
    </Modal>
  );
}
