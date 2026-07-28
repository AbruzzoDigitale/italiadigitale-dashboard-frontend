import { useCallback, useEffect, useRef, useState } from "react";
import {
  composeApi,
  fetchFillBaseApi,
  updateTemplateFieldApi,
  visualScanApi,
  type ComposeField,
  type DocumentDetail,
  type PageMetric,
  type TemplateField,
} from "../../api/documents";
import { useToast } from "../../context/ToastContext";
import { Icon } from "../ui/Icon";
import { Modal } from "../ui/Modal";
import { Spinner } from "../ui/Spinner";
import { PdfFillEditor, type FieldConfigPatch } from "./PdfFillEditor";

interface FieldLayoutModalProps {
  open: boolean;
  onClose: () => void;
  document: DocumentDetail | null;
  /** Notifica il dettaglio per aggiornare la lista campi alla chiusura. */
  onChanged?: () => void;
}

/** Editor VISUALE del modello: configura ambito (Cliente/Interno) e obbligatorietà
 *  dei campi cliccandoli direttamente sul PDF. */
export function FieldLayoutModal({ open, onClose, document: doc, onChanged }: FieldLayoutModalProps) {
  const toast = useToast();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileData, setFileData] = useState<ArrayBuffer | null>(null);
  const [pages, setPages] = useState<PageMetric[]>([]);
  const [fields, setFields] = useState<TemplateField[]>([]);
  const [hasTextLayer, setHasTextLayer] = useState(true);
  const dirty = useRef(false);
  // Compositore: mappa id-campo → documento-parte su cui salvare la modifica.
  const partByField = useRef<Record<number, number>>({});

  const composeFieldToTemplate = (f: ComposeField, i: number): TemplateField => ({
    id: f.field_id ?? i + 1,
    tag_name: f.tag_name,
    label: f.label,
    field_type: f.field_type,
    source_path: f.source_path,
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
  });

  const load = useCallback(async () => {
    if (!doc) return;
    setLoading(true);
    setError(null);
    partByField.current = {};
    try {
      if (doc.doc_type === "modello_contratto") {
        // Compositore: campi del contratto composto, salvati sulla parte d'origine.
        const comp = await composeApi(doc.id);
        const withId = comp.fields.filter((f) => f.field_id != null);
        for (const f of withId) partByField.current[f.field_id!] = f.part_document_id ?? doc.id;
        setPages(comp.pages);
        setFields(withId.map(composeFieldToTemplate));
        setHasTextLayer(comp.has_text_layer);
      } else {
        const scan = await visualScanApi(doc.id);
        setPages(scan.pages);
        setFields(scan.fields.filter((f) => f.page != null));
        setHasTextLayer(scan.has_text_layer);
      }
      setFileData(await fetchFillBaseApi(doc.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore caricamento documento");
    } finally {
      setLoading(false);
    }
  }, [doc]);

  useEffect(() => {
    if (!open || !doc) return;
    dirty.current = false;
    setFileData(null);
    load();
  }, [open, doc, load]);

  const handleFieldConfig = async (fieldId: number, patch: FieldConfigPatch) => {
    // Ottimistico: aggiorna subito la casella, poi persiste sul documento giusto
    // (per un compositore è la parte d'origine del campo).
    setFields((prev) => prev.map((f) => (f.id === fieldId ? { ...f, ...patch } : f)));
    const target = partByField.current[fieldId] ?? doc!.id;
    try {
      await updateTemplateFieldApi(target, fieldId, patch);
      dirty.current = true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore salvataggio campo");
      load();
    }
  };

  const handleClose = () => {
    if (dirty.current) onChanged?.();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Configura i campi sul documento"
      description={doc?.title}
      icon={<Icon name="list" className="w-5 h-5" />}
      size="2xl"
      dialogClassName="!max-w-[96vw] h-[92vh]"
      mobileFullscreen
    >
      {loading || !fileData ? (
        <div className="flex flex-1 items-center justify-center py-10">
          {error ? <p className="text-[13px] text-danger">{error}</p> : <Spinner />}
        </div>
      ) : (
        <PdfFillEditor
          mode="config"
          fileData={fileData}
          pages={pages}
          fields={fields}
          values={{}}
          onValuesChange={() => {}}
          elements={[]}
          onElementsChange={() => {}}
          signatures={{}}
          onSignaturesChange={() => {}}
          hasTextLayer={hasTextLayer}
          onFieldConfig={handleFieldConfig}
        />
      )}
    </Modal>
  );
}
