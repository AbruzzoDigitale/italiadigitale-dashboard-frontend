import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchFillBaseApi,
  getFillPrefillApi,
  updateVisualOverlayApi,
  visualFillApi,
  visualScanApi,
  type DocumentDetail,
  type OverlayElement,
  type PageMetric,
  type TemplateField,
} from "../../api/documents";
import { useToast } from "../../context/ToastContext";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { SearchableSelect } from "../ui/SearchableSelect";
import { Spinner } from "../ui/Spinner";
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

  const contractLinks = useMemo(
    () => (doc?.links ?? []).filter((l) => l.entity_type === "contract"),
    [doc]
  );

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

  useEffect(() => {
    if (!open || !doc) return;
    setResult(null);
    setLoadError(null);
    setFileData(null);
    setValues({});
    setElements([]);
    setSignatures({});
    setTitle("");
    setContractId(
      isEdit
        ? null
        : contractIdProp ?? (contractLinks.length === 1 ? contractLinks[0].entity_id : null)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, doc?.id]);

  const load = useCallback(async () => {
    if (!doc) return;
    setLoading(true);
    setLoadError(null);
    try {
      // Il modello sorgente porta campi, pagine e PDF su cui si compila.
      const templateId = isEdit ? doc.source_document_id : doc.id;
      if (!templateId) throw new Error("Modello di origine non disponibile");

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
        // Aggiorna i collegamenti auto-completati lato server, così i campi
        // risultano subito "Auto" nel pannello.
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
  }, [doc, isEdit, contractId]);

  useEffect(() => {
    if (open && doc && (isEdit || contractId != null)) {
      load();
    }
  }, [open, doc, isEdit, contractId, load]);

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
        if (contractId == null) return;
        saved = await visualFillApi(doc.id, {
          contract_id: contractId,
          title: title.trim() || undefined,
          values,
          elements: payloadElements,
          signatures,
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

  const canEdit = !!fileData && !loading && !loadError;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Modifica documento compilato" : "Compila contratto"}
      description={doc?.title}
      icon={<Icon name="pencil" className="w-5 h-5" />}
      size="2xl"
      dialogClassName="!max-w-[96vw] h-[92vh]"
      mobileFullscreen
      footer={
        result ? (
          <Button variant="secondary" onClick={onClose}>
            Chiudi
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              Annulla
            </Button>
            <Button
              onClick={handleSave}
              loading={saving}
              disabled={!canEdit || (!isEdit && contractId == null)}
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
      ) : (
        <div className="flex flex-col gap-3">
          {!isEdit && (
            <div className="flex flex-wrap items-end gap-3">
              {contractLinks.length > 1 && (
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

          {contractLinks.length === 0 && !isEdit && (
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
