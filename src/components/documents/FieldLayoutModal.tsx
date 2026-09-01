import { useCallback, useEffect, useRef, useState } from "react";
import {
  composeApi,
  fetchFillBaseApi,
  getCompanyOverlayApi,
  saveCompanyOverlayApi,
  updateTemplateFieldApi,
  visualScanApi,
  type ComposeField,
  type DocumentDetail,
  type OverlayElement,
  type PageMetric,
  type TemplateField,
} from "../../api/documents";
import { useToast } from "../../context/ToastContext";
import { Button } from "../ui/Button";
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

/** Editor VISUALE del modello: configura ambito (Cliente/Interno), tipo e
 *  obbligatorietà dei campi E precompila i dati/firme dell'azienda, tutto sul PDF. */
export function FieldLayoutModal({ open, onClose, document: doc, onChanged }: FieldLayoutModalProps) {
  const toast = useToast();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileData, setFileData] = useState<ArrayBuffer | null>(null);
  const [pages, setPages] = useState<PageMetric[]>([]);
  const [fields, setFields] = useState<TemplateField[]>([]);
  const [hasTextLayer, setHasTextLayer] = useState(true);
  const [saving, setSaving] = useState(false);
  // Precompilazione azienda (valori + firme) salvata sul modello.
  const [values, setValues] = useState<Record<string, string>>({});
  const [elements, setElements] = useState<OverlayElement[]>([]);
  const [signatures, setSignatures] = useState<Record<string, string>>({});
  const [signaturePreviews, setSignaturePreviews] = useState<Record<string, string>>({});
  const dirty = useRef(false);
  // Compositore: mappa id-campo → documento-parte su cui salvare la config.
  const partByField = useRef<Record<number, number>>({});

  const composeFieldToTemplate = (f: ComposeField, i: number): TemplateField => ({
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
  });

  const load = useCallback(async () => {
    if (!doc) return;
    setLoading(true);
    setError(null);
    partByField.current = {};
    try {
      let partIds: number[] = [];
      if (doc.doc_type === "modello_contratto") {
        const comp = await composeApi(doc.id);
        const withId = comp.fields.filter((f) => f.field_id != null);
        for (const f of withId) partByField.current[f.field_id!] = f.part_document_id ?? doc.id;
        setPages(comp.pages);
        setFields(withId.map(composeFieldToTemplate));
        setHasTextLayer(comp.has_text_layer);
        partIds = comp.part_ids;
      } else {
        const scan = await visualScanApi(doc.id);
        setPages(scan.pages);
        setFields(scan.fields.filter((f) => f.page != null));
        setHasTextLayer(scan.has_text_layer);
      }
      // Precompilazione già salvata (valori azienda + firme).
      const overlay = await getCompanyOverlayApi(doc.id);
      setValues(overlay.values ?? {});
      setElements(overlay.elements ?? []);
      const previews: Record<string, string> = {};
      for (const el of overlay.elements ?? []) {
        if (el.type === "signature" && el.signature_key) previews[el.signature_key] = "";
      }
      setSignaturePreviews(previews);
      setSignatures({});
      setFileData(await fetchFillBaseApi(doc.id, partIds.length ? partIds : undefined));
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
    // Config (ambito/tipo/obbligatorio): salvata subito sulla parte d'origine.
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

  const handleSavePrecompile = async () => {
    if (!doc) return;
    setSaving(true);
    try {
      await saveCompanyOverlayApi(doc.id, { values, elements, signatures });
      dirty.current = true;
      toast.success("Precompilazione azienda salvata sul modello");
      onChanged?.();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore salvataggio precompilazione");
    } finally {
      setSaving(false);
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
      title="Configura e precompila il modello"
      description={doc?.title}
      icon={<Icon name="list" className="w-5 h-5" />}
      size="full"
      dialogClassName="!max-w-[96vw] h-[92vh]"
      mobileFullscreen
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={saving}>
            Chiudi
          </Button>
          <Button
            onClick={handleSavePrecompile}
            loading={saving}
            disabled={!fileData || loading}
            leftIcon={<Icon name="check" className="w-4 h-4" />}
          >
            Salva precompilazione
          </Button>
        </>
      }
    >
      <div className="flex h-full flex-col gap-2">
        <p className="flex-none text-[12px] text-muted dark:text-muted-dark">
          Clicca un campo per impostarne <b>ambito</b> (Cliente/Interno), tipo e obbligatorietà — la
          config si salva subito. Scrivi dentro le caselle per <b>precompilare i dati azienda</b> e
          apponi le <b>firme aziendali</b>, poi <b>Salva precompilazione</b>. La config è salvata
          automaticamente.
        </p>
        {loading || !fileData ? (
          <div className="flex flex-1 items-center justify-center">
            {error ? <p className="text-[13px] text-danger">{error}</p> : <Spinner />}
          </div>
        ) : (
          <PdfFillEditor
            mode="config"
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
            onFieldConfig={handleFieldConfig}
          />
        )}
      </div>
    </Modal>
  );
}
