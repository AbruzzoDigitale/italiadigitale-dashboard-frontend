import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DocFieldType, OverlayElement, PageMetric, TemplateField } from "../../api/documents";
import { useToast } from "../../context/ToastContext";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { Icon } from "../ui/Icon";
import { Input } from "../ui/Input";
import { SearchableSelect } from "../ui/SearchableSelect";
import { SegmentedSwitch } from "../ui/SegmentedSwitch";
import { Spinner } from "../ui/Spinner";
import { loadPdfjs } from "./pdfjs";
import { SignatureModal } from "./SignatureModal";

/** Modifica alla configurazione di un campo (editor visuale del modello). */
export type FieldConfigPatch = {
  audience?: "client" | "internal";
  required?: boolean;
  field_type?: DocFieldType;
};

const CONFIG_TYPE_OPTIONS = [
  { value: "text", label: "Testo" },
  { value: "textarea", label: "Testo lungo" },
  { value: "date", label: "Data" },
  { value: "number", label: "Numero" },
  { value: "signature", label: "Firma elettronica" },
];

/** Un valore campo è una firma se è un data URL immagine. */
const isSignatureValue = (v: string | undefined): boolean => !!v && v.startsWith("data:image");

/** Dato d'esempio da mostrare come placeholder, in base a etichetta/percorso/tipo. */
function fieldExample(field: TemplateField): string {
  const src = (field.source_path ?? "").toLowerCase();
  const lab = (field.label ?? "").toLowerCase();
  const has = (...ks: string[]) => ks.some((k) => src.includes(k) || lab.includes(k));
  if (field.field_type === "date" || has("scadenza", "data", "nato il", "stipulato in data"))
    return "es. 01/03/2026";
  if (has("pec")) return "es. mario.rossi@pec.it";
  if (has("mail")) return "es. mario.rossi@email.it";
  if (has("c.f", "codice fiscale", "cod. fisc")) return "es. RSSMRA80A01H501U";
  if (has("p.iva", "partita iva", "p. iva", "p.i.")) return "es. 01234567890";
  if (has("telefono", "cellulare", "tel.", "cell")) return "es. 333 1234567";
  if (has("iban")) return "es. IT60X0542811101000000123456";
  if (has("via", "indirizzo", "residente", "sede", "residenza")) return "es. Via Roma 1, Teramo";
  if (has("luogo", "città", "citta", "giulianova", "residenza")) return "es. Teramo";
  if (has("numero", "n.")) return "es. 12";
  if (has("facebook", "instagram", "pagina")) return "es. @mionome";
  if (
    has("società", "societa", "ragione", "sig", "committente", "sottoscritto", "nome", "rappresentante")
  )
    return "es. Mario Rossi";
  if (field.field_type === "number") return "es. 10";
  return "es. testo";
}

export interface PdfFillEditorHandle {
  values: Record<string, string>;
  elements: OverlayElement[];
  signatures: Record<string, string>;
}

interface PdfFillEditorProps {
  /** PDF su cui si compila. */
  fileData: ArrayBuffer;
  pages: PageMetric[];
  fields: TemplateField[];
  values: Record<string, string>;
  onValuesChange: (values: Record<string, string>) => void;
  elements: OverlayElement[];
  onElementsChange: (elements: OverlayElement[]) => void;
  signatures: Record<string, string>;
  onSignaturesChange: (signatures: Record<string, string>) => void;
  /** Firme già salvate, per l'anteprima in modifica: chiave → data URL. */
  signaturePreviews?: Record<string, string>;
  hasTextLayer: boolean;
  /** "config" = editor visuale del modello: i campi diventano caselle su cui
   *  impostare Ambito (Cliente/Interno) e Obbligatorio, invece di input. */
  mode?: "fill" | "config";
  onFieldConfig?: (fieldId: number, patch: FieldConfigPatch) => void;
}

type Tool = "select" | "text" | "check" | "signature";

const TOOL_LABELS: Record<Exclude<Tool, "select">, string> = {
  text: "Testo",
  check: "Spunta",
  signature: "Firma",
};

const DEFAULT_TEXT_SIZE = { w: 160, h: 14 };
const DEFAULT_CHECK_SIZE = { w: 14, h: 14 };
const DEFAULT_SIGNATURE_SIZE = { w: 170, h: 55 };

let elementSeq = 0;
const nextElementId = () => `el_${Date.now().toString(36)}_${++elementSeq}`;

export function PdfFillEditor({
  fileData,
  pages,
  fields,
  values,
  onValuesChange,
  elements,
  onElementsChange,
  signatures,
  onSignaturesChange,
  signaturePreviews = {},
  hasTextLayer,
  mode = "fill",
  onFieldConfig,
}: PdfFillEditorProps) {
  const toast = useToast();
  const isConfig = mode === "config";
  const docColRef = useRef<HTMLDivElement | null>(null);
  const canvasRefs = useRef<Record<number, HTMLCanvasElement | null>>({});
  const fieldRefs = useRef<Record<string, HTMLElement | null>>({});
  const fieldBoxRefs = useRef<Record<number, HTMLElement | null>>({});

  // Zoom: fitScale riempie la colonna; zoom è il moltiplicatore dell'utente.
  const [fitScale, setFitScale] = useState(1);
  const [zoom, setZoom] = useState(1);
  const scale = Math.min(3, Math.max(0.25, fitScale * zoom));
  const [configFieldId, setConfigFieldId] = useState<number | null>(null);
  const [rendering, setRendering] = useState(true);
  const [tool, setTool] = useState<Tool>("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const pendingSignature = useRef<{ page: number; x: number; y: number } | null>(null);
  // Firma su un CAMPO di tipo firma (vs elemento libero): autocompila tutti i campi firma.
  const pendingFieldSignature = useRef(false);
  const dragState = useRef<{
    id: string;
    page: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const firstPageWidth = pages[0]?.width ?? 595;

  // Scala di rendering: il documento riempie la larghezza della sua colonna.
  useEffect(() => {
    const container = docColRef.current;
    if (!container) return;
    const update = () => {
      // Piccolo margine per non innescare la barra di scorrimento orizzontale.
      const available = container.clientWidth - 8;
      if (available > 0) setFitScale(available / firstPageWidth);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [firstPageWidth]);

  // Rendering delle pagine con pdf.js.
  useEffect(() => {
    let cancelled = false;
    let loadingTask: ReturnType<
      Awaited<ReturnType<typeof loadPdfjs>>["getDocument"]
    > | null = null;

    const render = async () => {
      setRendering(true);
      try {
        const pdfjs = await loadPdfjs();
        if (cancelled) return;
        // pdf.js consuma il buffer: passiamo sempre una copia.
        loadingTask = pdfjs.getDocument({ data: fileData.slice(0) });
        const doc = await loadingTask.promise;
        if (cancelled) return;

        const dpr = window.devicePixelRatio || 1;
        for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
          const canvas = canvasRefs.current[pageNumber];
          if (!canvas) continue;
          const page = await doc.getPage(pageNumber);
          if (cancelled) return;
          const viewport = page.getViewport({ scale: scale * dpr });
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = `${viewport.width / dpr}px`;
          canvas.style.height = `${viewport.height / dpr}px`;
          const context = canvas.getContext("2d");
          if (!context) continue;
          await page.render({ canvasContext: context, viewport, canvas }).promise;
        }
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : "Impossibile visualizzare il documento");
        }
      } finally {
        if (!cancelled) setRendering(false);
      }
    };

    render();
    return () => {
      cancelled = true;
      void loadingTask?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileData, scale]);

  const fieldsByPage = useMemo(() => {
    const map: Record<number, TemplateField[]> = {};
    for (const field of fields) {
      if (field.page == null || field.pos_x == null) continue;
      (map[field.page] ??= []).push(field);
    }
    return map;
  }, [fields]);

  const elementsByPage = useMemo(() => {
    const map: Record<number, OverlayElement[]> = {};
    for (const element of elements) {
      (map[element.page] ??= []).push(element);
    }
    return map;
  }, [elements]);

  const setValue = (tag: string, value: string) => onValuesChange({ ...values, [tag]: value });

  const updateElement = (id: string, patch: Partial<OverlayElement>) =>
    onElementsChange(elements.map((el) => (el.id === id ? { ...el, ...patch } : el)));

  const removeElement = (id: string) => {
    onElementsChange(elements.filter((el) => el.id !== id));
    setSelectedId(null);
  };

  const addElement = (page: number, xPt: number, yPt: number) => {
    if (tool === "signature") {
      pendingSignature.current = { page, x: xPt, y: yPt };
      setSignatureModalOpen(true);
      setTool("select");
      return;
    }
    const size = tool === "check" ? DEFAULT_CHECK_SIZE : DEFAULT_TEXT_SIZE;
    const element: OverlayElement = {
      id: nextElementId(),
      type: tool === "check" ? "check" : "text",
      page,
      x: xPt,
      y: yPt,
      w: size.w,
      h: size.h,
      ...(tool === "text" ? { value: "", font_size: 10 } : {}),
    };
    onElementsChange([...elements, element]);
    setSelectedId(element.id!);
    setTool("select");
  };

  const handlePageClick = (page: number, event: React.MouseEvent<HTMLDivElement>) => {
    if (tool === "select") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const xPt = (event.clientX - rect.left) / scale;
    const yPt = (event.clientY - rect.top) / scale;
    addElement(page, Math.max(0, xPt), Math.max(0, yPt));
  };

  const openFieldSignature = () => {
    pendingFieldSignature.current = true;
    setSignatureModalOpen(true);
  };

  const handleSignatureConfirm = (dataUrl: string) => {
    // Firma su un campo firma: la stessa firma riempie TUTTI i campi firma.
    if (pendingFieldSignature.current) {
      pendingFieldSignature.current = false;
      const sigTags = fields.filter((f) => f.field_type === "signature").map((f) => f.tag_name);
      if (sigTags.length) {
        const next = { ...values };
        for (const t of sigTags) next[t] = dataUrl;
        onValuesChange(next);
      }
      return;
    }
    const spot = pendingSignature.current;
    pendingSignature.current = null;
    if (!spot) return;
    const key = `sig_${Date.now().toString(36)}`;
    onSignaturesChange({ ...signatures, [key]: dataUrl });
    const element: OverlayElement = {
      id: nextElementId(),
      type: "signature",
      page: spot.page,
      x: spot.x,
      y: spot.y,
      w: DEFAULT_SIGNATURE_SIZE.w,
      h: DEFAULT_SIGNATURE_SIZE.h,
      signature_key: key,
    };
    onElementsChange([...elements, element]);
    setSelectedId(element.id!);
  };

  // Trascinamento degli elementi liberi. La cattura del puntatore è sulla stessa
  // superficie che riceve il pointerdown, così i movimenti arrivano sempre lì.
  const onDragStart = (event: React.PointerEvent, element: OverlayElement, page: number) => {
    if (tool !== "select" || !element.id) return;
    event.stopPropagation();
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    dragState.current = {
      id: element.id,
      page,
      startX: event.clientX,
      startY: event.clientY,
      originX: element.x,
      originY: element.y,
    };
    setSelectedId(element.id);
  };

  const onDragMove = (event: React.PointerEvent) => {
    const state = dragState.current;
    if (!state) return;
    const metric = pages.find((p) => p.page === state.page);
    const nextX = state.originX + (event.clientX - state.startX) / scale;
    const nextY = state.originY + (event.clientY - state.startY) / scale;
    updateElement(state.id, {
      x: Math.max(0, Math.min(nextX, (metric?.width ?? 595) - 4)),
      y: Math.max(0, Math.min(nextY, (metric?.height ?? 842) - 4)),
    });
  };

  const onDragEnd = (event: React.PointerEvent) => {
    if (!dragState.current) return;
    (event.currentTarget as Element).releasePointerCapture?.(event.pointerId);
    dragState.current = null;
  };

  const focusField = useCallback((tag: string) => {
    const input = fieldRefs.current[tag];
    if (!input) return;
    input.scrollIntoView({ behavior: "smooth", block: "center" });
    input.focus();
  }, []);

  const configField = useMemo(
    () => fields.find((f) => f.id === configFieldId) ?? null,
    [fields, configFieldId]
  );

  const selectConfigField = useCallback((id: number) => {
    setConfigFieldId(id);
    fieldBoxRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  // Navigazione campo-per-campo (Precedente/Successivo), in ordine di lettura.
  const navFields = useMemo(
    () =>
      fields
        .filter((f) => f.page != null && f.pos_x != null)
        .sort(
          (a, b) =>
            (a.page ?? 0) - (b.page ?? 0) ||
            (a.pos_y ?? 0) - (b.pos_y ?? 0) ||
            (a.pos_x ?? 0) - (b.pos_x ?? 0)
        ),
    [fields]
  );
  const [navIdx, setNavIdx] = useState(-1);

  const goToField = (delta: number) => {
    if (navFields.length === 0) return;
    const next =
      navIdx < 0
        ? delta > 0
          ? 0
          : navFields.length - 1
        : Math.min(navFields.length - 1, Math.max(0, navIdx + delta));
    setNavIdx(next);
    focusField(navFields[next].tag_name);
  };

  const emptyManual = fields.filter((f) => !f.source_path && !(values[f.tag_name] ?? "").trim()).length;

  const dragHandlers = (element: OverlayElement, page: number) => ({
    onPointerDown: (e: React.PointerEvent) => onDragStart(e, element, page),
    onPointerMove: onDragMove,
    onPointerUp: onDragEnd,
  });

  return (
    <div className="flex flex-col rounded-lg border border-line dark:border-line-dark">
      {/* ── Barra strumenti: sticky in cima, sempre raggiungibile ── */}
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-t-lg border-b border-line dark:border-line-dark bg-paper dark:bg-[#0E0F0E] px-4 py-2">
        {isConfig ? (
          <>
            <span className="text-[12px] font-semibold text-muted dark:text-muted-dark">
              Clicca un campo per configurarlo
            </span>
            <span className="flex items-center gap-1 text-[11px]">
              <i className="inline-block h-3 w-3 rounded-sm border-2 border-brand-magenta bg-brand-magenta/20" />
              Cliente
            </span>
            <span className="flex items-center gap-1 text-[11px]">
              <i className="inline-block h-3 w-3 rounded-sm border-2 border-amber-500 bg-amber-500/20" />
              Interno
            </span>
            {configField && (
              <div className="ml-1 flex flex-wrap items-center gap-2 rounded-md border border-line px-2 py-1 dark:border-line-dark">
                <span className="max-w-[140px] truncate text-[12px] font-semibold">
                  {configField.label}
                </span>
                <div className="w-40">
                  <SearchableSelect
                    value={configField.field_type}
                    onChange={(v) => onFieldConfig?.(configField.id, { field_type: v as DocFieldType })}
                    options={CONFIG_TYPE_OPTIONS}
                    menuLayer="portal"
                    showAvatar={false}
                  />
                </div>
                <SegmentedSwitch
                  value={configField.audience}
                  onChange={(v) =>
                    onFieldConfig?.(configField.id, { audience: v as "client" | "internal" })
                  }
                  options={[
                    { value: "client", label: "Cliente" },
                    { value: "internal", label: "Interno" },
                  ]}
                />
                <label className="flex cursor-pointer items-center gap-1 text-[12px] font-semibold">
                  <Checkbox
                    checked={configField.required}
                    onChange={(next) => onFieldConfig?.(configField.id, { required: next })}
                  />
                  Obbligatorio
                </label>
              </div>
            )}
          </>
        ) : (
          <>
            {navFields.length > 0 && (
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => goToField(-1)}
                  leftIcon={<Icon name="chevron-right" className="h-3.5 w-3.5 rotate-180" />}
                >
                  Precedente
                </Button>
                <span className="min-w-[42px] text-center text-[11px] font-semibold tabular-nums text-muted dark:text-muted-dark">
                  {navIdx >= 0 ? navIdx + 1 : "–"}/{navFields.length}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => goToField(1)}
                  rightIcon={<Icon name="chevron-right" className="h-3.5 w-3.5" />}
                >
                  Successivo
                </Button>
                <span className="mx-1 h-5 w-px bg-line dark:bg-line-dark" />
              </div>
            )}
            <span className="text-[12px] font-semibold text-muted dark:text-muted-dark">Aggiungi:</span>
            {(Object.keys(TOOL_LABELS) as Array<keyof typeof TOOL_LABELS>).map((key) => (
              <Button
                key={key}
                size="sm"
                variant={tool === key ? "primary" : "secondary"}
                onClick={() => setTool(tool === key ? "select" : key)}
              >
                {TOOL_LABELS[key]}
              </Button>
            ))}
            {tool !== "select" && (
              <span className="text-[12px] font-semibold text-brand-magenta">
                Clicca sul documento per posizionare
              </span>
            )}
            {selectedId && tool === "select" && (
              <Button
                size="sm"
                variant="danger-ghost"
                leftIcon={<Icon name="trash" className="w-3.5 h-3.5" />}
                onClick={() => removeElement(selectedId)}
              >
                Elimina selezione
              </Button>
            )}
          </>
        )}

        {/* Zoom (lente): riduci / adatta / ingrandisci */}
        <div className="ml-auto flex items-center gap-1">
          <Icon name="search" className="h-4 w-4 text-muted dark:text-muted-dark" />
          <Button
            size="sm"
            variant="secondary"
            iconOnly
            title="Riduci"
            aria-label="Riduci"
            onClick={() => setZoom((z) => Math.max(0.25, +(z - 0.1).toFixed(2)))}
          >
            <Icon name="minus" className="h-4 w-4" />
          </Button>
          <button
            type="button"
            onClick={() => setZoom(1)}
            title="Adatta alla larghezza"
            className="w-12 text-center text-[12px] font-semibold tabular-nums hover:text-brand-magenta"
          >
            {Math.round(scale * 100)}%
          </button>
          <Button
            size="sm"
            variant="secondary"
            iconOnly
            title="Ingrandisci"
            aria-label="Ingrandisci"
            onClick={() => setZoom((z) => Math.min(3, +(z + 0.1).toFixed(2)))}
          >
            <Icon name="plus" className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Il documento scorre insieme al modale; il pannello campi resta sticky. */}
      <div className="relative flex items-start gap-4 bg-cream/40 dark:bg-ink-2/40 p-4 max-lg:flex-col">
        {rendering && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-paper/60 dark:bg-ink/60">
            <Spinner />
          </div>
        )}

        {/* ── Documento ── */}
        <div
          ref={docColRef}
          className="flex min-w-0 flex-1 flex-col items-center gap-4"
        >
          {!hasTextLayer && (
            <div className="w-full rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-[12px] text-warning">
              Nessun testo rilevabile nel documento (probabile scansione): usa gli elementi liberi
              per compilarlo.
            </div>
          )}
            {pages.map((metric) => (
              <div
                key={metric.page}
                data-page-layer
                className="relative shadow-md"
                style={{
                  width: metric.width * scale,
                  height: metric.height * scale,
                  cursor: tool === "select" ? "default" : "crosshair",
                }}
                onClick={(e) => handlePageClick(metric.page, e)}
              >
                <canvas
                  ref={(el) => {
                    canvasRefs.current[metric.page] = el;
                  }}
                  className="absolute inset-0 bg-white"
                />

                {/* Caselle dei campi rilevati */}
                {(fieldsByPage[metric.page] ?? []).map((field) =>
                  isConfig ? (
                    // Configura + PRECOMPILA: casella colorata per ambito (legenda),
                    // ma compilabile (input/firma dentro). Focus = seleziona per config.
                    <div
                      key={field.id}
                      ref={(el) => {
                        fieldBoxRefs.current[field.id] = el;
                      }}
                      title={`${field.label} — ${
                        field.audience === "internal" ? "Interno (azienda)" : "Cliente"
                      }${field.required ? " · obbligatorio" : ""}`}
                      className="absolute"
                      style={{
                        // Geometria esatta del campo (come in compilazione): la casella
                        // combacia con la riga/casella del PDF sottostante.
                        left: (field.pos_x ?? 0) * scale,
                        top: (field.pos_y ?? 0) * scale,
                        width: (field.pos_w ?? 100) * scale,
                        height: Math.max(12, (field.pos_h ?? 12) * scale),
                        borderRadius: 2,
                        border: `1.5px solid ${
                          field.audience === "internal" ? "#f59e0b" : "#c41284"
                        }`,
                        // Sfondo: solo un velo tenue dell'ambito (mai scuro).
                        background:
                          field.audience === "internal"
                            ? "rgba(245,158,11,0.10)"
                            : "rgba(196,18,132,0.08)",
                        // Selezione: anello nel colore dell'ambito (niente nero).
                        boxShadow:
                          configFieldId === field.id
                            ? `0 0 0 2px ${field.audience === "internal" ? "#f59e0b" : "#c41284"}`
                            : "none",
                      }}
                    >
                      {field.field_type === "signature" ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfigFieldId(field.id);
                            openFieldSignature();
                          }}
                          className="flex h-full w-full items-center justify-center overflow-hidden"
                          title="Clicca per apporre la firma"
                        >
                          {isSignatureValue(values[field.tag_name]) ? (
                            <img
                              src={values[field.tag_name]}
                              alt="Firma"
                              className="h-full w-full object-contain"
                              draggable={false}
                            />
                          ) : (
                            <span
                              className="text-[10px] font-semibold"
                              style={{ color: field.audience === "internal" ? "#b45309" : "#c41284" }}
                            >
                              Firma
                            </span>
                          )}
                        </button>
                      ) : (
                        <>
                          <input
                            ref={(el) => {
                              fieldRefs.current[field.tag_name] = el;
                            }}
                            value={values[field.tag_name] ?? ""}
                            onChange={(e) => setValue(field.tag_name, e.target.value)}
                            onFocus={() => setConfigFieldId(field.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="h-full w-full px-1 font-semibold outline-none"
                            style={{
                              fontSize: Math.max(8, (field.font_size ?? 10) * scale),
                              // Inline: batte la regola globale .dark .id-modal input
                              // (sfondo scuro nei modali) che altrimenti annerisce la casella.
                              background: "transparent",
                              color: field.audience === "internal" ? "#7c2d12" : "#9d1064",
                              caretColor: field.audience === "internal" ? "#b45309" : "#c41284",
                            }}
                          />
                          {/* Esempio come overlay (non un placeholder nativo): colore
                              inline dell'ambito, identico in tema chiaro e scuro. */}
                          {!(values[field.tag_name] ?? "").trim() && (
                            <span
                              className="pointer-events-none absolute inset-0 flex items-center overflow-hidden whitespace-nowrap px-1 italic"
                              style={{
                                fontSize: Math.max(8, (field.font_size ?? 10) * scale),
                                color:
                                  field.audience === "internal"
                                    ? "rgba(180,83,9,0.85)"
                                    : "rgba(196,18,132,0.8)",
                              }}
                            >
                              {fieldExample(field)}
                            </span>
                          )}
                        </>
                      )}
                      {field.required && (
                        <span
                          className="pointer-events-none absolute text-[12px] font-bold leading-none"
                          style={{ right: -6, top: -8, color: "#dc2626" }}
                        >
                          *
                        </span>
                      )}
                    </div>
                  ) : field.field_type === "signature" ? (
                    // Campo FIRMA elettronica: clic → disegna/scrivi; riempie tutti i campi firma.
                    <button
                      key={field.id}
                      type="button"
                      ref={(el) => {
                        fieldRefs.current[field.tag_name] = el;
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        openFieldSignature();
                      }}
                      title={`${field.label} — Firma elettronica`}
                      className="absolute flex items-center justify-center overflow-hidden rounded-[2px] border border-dashed border-brand-magenta"
                      style={{
                        left: (field.pos_x ?? 0) * scale,
                        // Su riga di trattini il box è ancorato alla riga e cresce verso
                        // l'alto (come il PDF finale); altrove resta com'era.
                        top:
                          (field.placeholder_kind === "underscore"
                            ? (field.pos_y ?? 0) + (field.pos_h ?? 0) - Math.max(30, field.pos_h ?? 0)
                            : (field.pos_y ?? 0)) * scale,
                        width: (field.pos_w ?? 160) * scale,
                        height: Math.max(30, field.pos_h ?? 0) * scale,
                        background: isSignatureValue(values[field.tag_name])
                          ? "transparent"
                          : "rgba(196,18,132,0.06)",
                      }}
                    >
                      {isSignatureValue(values[field.tag_name]) ? (
                        <img
                          src={values[field.tag_name]}
                          alt="Firma"
                          className={`h-full w-full object-contain ${field.placeholder_kind === "underscore" ? "object-bottom" : ""}`}
                          draggable={false}
                        />
                      ) : (
                        <span className="pointer-events-none text-[11px] font-semibold text-brand-magenta">
                          ✍ Firma
                        </span>
                      )}
                    </button>
                  ) : (
                    <input
                      key={field.id}
                      ref={(el) => {
                        fieldRefs.current[field.tag_name] = el;
                      }}
                      value={values[field.tag_name] ?? ""}
                      onChange={(e) => setValue(field.tag_name, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      title={field.label}
                      placeholder={fieldExample(field)}
                      className="absolute rounded-[2px] border border-brand-magenta/60 px-[2px] font-medium outline-none placeholder:italic placeholder:text-black/35 focus:border-brand-magenta"
                      style={{
                        left: (field.pos_x ?? 0) * scale,
                        top: (field.pos_y ?? 0) * scale,
                        width: (field.pos_w ?? 100) * scale,
                        height: Math.max(12, (field.pos_h ?? 12) * scale),
                        fontSize: Math.max(7, (field.font_size ?? 10) * scale),
                        lineHeight: 1.1,
                        // Evidenziazione dell'area di inserimento (come un evidenziatore);
                        // testo scuro sempre leggibile. La riga del PDF resta visibile sotto.
                        background: (values[field.tag_name] ?? "").trim()
                          ? "rgba(255, 214, 0, 0.10)"
                          : "rgba(255, 214, 0, 0.28)",
                        color: "#111111",
                        caretColor: "#111111",
                      }}
                    />
                  )
                )}

                {/* Elementi liberi */}
                {(elementsByPage[metric.page] ?? []).map((element) => {
                  const selected = element.id === selectedId;
                  const isText = element.type === "text";
                  return (
                    <div
                      key={element.id}
                      // check e firma: si trascinano dal corpo. Il testo ha una
                      // maniglia dedicata (così l'input resta digitabile).
                      {...(isText ? {} : dragHandlers(element, metric.page))}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedId(element.id ?? null);
                      }}
                      className={`absolute ${isText ? "" : "cursor-move"} ${selected ? "ring-2 ring-brand-magenta" : "ring-1 ring-brand-magenta/30"}`}
                      style={{
                        left: element.x * scale,
                        top: element.y * scale,
                        width: element.w * scale,
                        height: element.h * scale,
                      }}
                    >
                      {/* Maniglia di spostamento */}
                      <span
                        {...dragHandlers(element, metric.page)}
                        title="Trascina per spostare"
                        className="absolute -left-1 -top-4 flex h-4 w-5 cursor-move items-center justify-center rounded-sm bg-brand-magenta text-white shadow-sm"
                      >
                        <Icon name="dots-horizontal" className="h-3 w-3" />
                      </span>

                      {isText && (
                        <input
                          value={element.value ?? ""}
                          onChange={(e) => updateElement(element.id!, { value: e.target.value })}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                          placeholder="Testo…"
                          className="h-full w-full px-[2px] font-medium outline-none"
                          style={{
                            fontSize: Math.max(7, (element.font_size ?? 10) * scale),
                            background: "transparent",
                            color: "#111111",
                            caretColor: "#111111",
                          }}
                        />
                      )}
                      {element.type === "check" && (
                        <svg viewBox="0 0 24 24" className="h-full w-full" fill="none" style={{ color: "#141414" }}>
                          <path
                            d="M3 13 L9 19 L21 5"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                      {element.type === "signature" && (
                        <img
                          src={
                            signatures[element.signature_key ?? ""] ??
                            signaturePreviews[element.signature_key ?? ""] ??
                            ""
                          }
                          alt="Firma"
                          className="h-full w-full object-contain"
                          draggable={false}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

        {/* ── Pannello campi (sticky sotto la barra, resta visibile) ── */}
        <aside className="flex w-80 shrink-0 flex-col rounded-lg border border-line dark:border-line-dark bg-paper dark:bg-[#0E0F0E] p-3 lg:sticky lg:top-14 lg:max-h-[calc(92vh-11rem)] lg:overflow-y-auto max-lg:w-full max-lg:max-h-72">
          <h3 className="mb-2 text-[12px] font-bold uppercase tracking-wide">
            Campi ({fields.length})
          </h3>
          {isConfig ? (
            <>
              <p className="mb-2 text-[11px] text-muted dark:text-muted-dark">
                Imposta ambito (Cliente/Interno) e obbligatorietà. Clicca un campo qui o
                direttamente sul documento, poi usa i controlli in alto.
              </p>
              <div className="space-y-1">
                {fields.map((field) => (
                  <button
                    key={field.id}
                    type="button"
                    onClick={() => selectConfigField(field.id)}
                    className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left ${
                      configFieldId === field.id
                        ? "border-ink dark:border-paper"
                        : "border-line dark:border-line-dark"
                    }`}
                  >
                    <span
                      className={`h-2.5 w-2.5 flex-none rounded-sm ${
                        field.audience === "internal" ? "bg-amber-500" : "bg-brand-magenta"
                      }`}
                    />
                    <span className="min-w-0 flex-1 truncate text-[12px] font-semibold">
                      {field.label}
                    </span>
                    {field.required && <Badge variant="warning">Obbl.</Badge>}
                  </button>
                ))}
                {fields.length === 0 && (
                  <p className="text-[12px] text-muted dark:text-muted-dark">Nessun campo rilevato.</p>
                )}
              </div>
            </>
          ) : (
            <>
              {emptyManual > 0 && (
                <p className="mb-2 text-[11px] text-muted dark:text-muted-dark">
                  Da compilare a mano: {emptyManual}. I campi lasciati vuoti restano righe da firmare.
                </p>
              )}
              <div className="space-y-2">
                {fields.map((field) => (
                  <div key={field.id}>
                    <span className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold">
                      <button
                        type="button"
                        onClick={() => focusField(field.tag_name)}
                        className="truncate text-left hover:text-brand-magenta"
                        title="Vai al campo nel documento"
                      >
                        {field.label}
                      </button>
                      {field.field_type === "signature" ? (
                        <Badge variant="info">Firma</Badge>
                      ) : field.source_path ? (
                        <Badge variant="info">Auto</Badge>
                      ) : (
                        <Badge>Manuale</Badge>
                      )}
                    </span>
                    {field.field_type === "signature" ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="w-full"
                        onClick={openFieldSignature}
                        leftIcon={<Icon name="pencil" className="h-3.5 w-3.5" />}
                      >
                        {isSignatureValue(values[field.tag_name])
                          ? "Firma inserita — modifica"
                          : "Aggiungi firma"}
                      </Button>
                    ) : (
                      <Input
                        value={values[field.tag_name] ?? ""}
                        onChange={(e) => setValue(field.tag_name, e.target.value)}
                        placeholder={fieldExample(field)}
                      />
                    )}
                  </div>
                ))}
                {fields.length === 0 && (
                  <p className="text-[12px] text-muted dark:text-muted-dark">
                    Nessun campo rilevato: compila con gli elementi liberi.
                  </p>
                )}
              </div>
            </>
          )}
        </aside>
      </div>

      <SignatureModal
        open={signatureModalOpen}
        onClose={() => setSignatureModalOpen(false)}
        onConfirm={handleSignatureConfirm}
      />
    </div>
  );
}
