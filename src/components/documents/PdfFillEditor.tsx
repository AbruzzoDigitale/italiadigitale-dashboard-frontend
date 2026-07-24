import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { OverlayElement, PageMetric, TemplateField } from "../../api/documents";
import { useToast } from "../../context/ToastContext";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Input } from "../ui/Input";
import { Spinner } from "../ui/Spinner";
import { loadPdfjs } from "./pdfjs";
import { SignatureModal } from "./SignatureModal";

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
}: PdfFillEditorProps) {
  const toast = useToast();
  const docColRef = useRef<HTMLDivElement | null>(null);
  const canvasRefs = useRef<Record<number, HTMLCanvasElement | null>>({});
  const fieldRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [scale, setScale] = useState(1);
  const [rendering, setRendering] = useState(true);
  const [tool, setTool] = useState<Tool>("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const pendingSignature = useRef<{ page: number; x: number; y: number } | null>(null);
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
      if (available > 0) setScale(Math.min(2, Math.max(0.4, available / firstPageWidth)));
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

  const handleSignatureConfirm = (dataUrl: string) => {
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
                {(fieldsByPage[metric.page] ?? []).map((field) => (
                  <input
                    key={field.id}
                    ref={(el) => {
                      fieldRefs.current[field.tag_name] = el;
                    }}
                    value={values[field.tag_name] ?? ""}
                    onChange={(e) => setValue(field.tag_name, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    title={field.label}
                    className="absolute rounded-[2px] border border-brand-magenta/60 px-[2px] font-medium outline-none focus:border-brand-magenta"
                    style={{
                      left: (field.pos_x ?? 0) * scale,
                      top: (field.pos_y ?? 0) * scale,
                      width: (field.pos_w ?? 100) * scale,
                      height: Math.max(12, (field.pos_h ?? 12) * scale),
                      fontSize: Math.max(7, (field.font_size ?? 10) * scale),
                      lineHeight: 1.1,
                      // Nessuno sfondo (si vede la riga del PDF sotto) e testo
                      // scuro, sempre leggibile su qualsiasi tema dell'app.
                      background: "transparent",
                      color: "#111111",
                      caretColor: "#111111",
                    }}
                  />
                ))}

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
                {field.source_path ? <Badge variant="info">Auto</Badge> : <Badge>Manuale</Badge>}
              </span>
              <Input
                value={values[field.tag_name] ?? ""}
                onChange={(e) => setValue(field.tag_name, e.target.value)}
                placeholder={field.page ? `Pagina ${field.page}` : ""}
              />
            </div>
          ))}
          {fields.length === 0 && (
            <p className="text-[12px] text-muted dark:text-muted-dark">
              Nessun campo rilevato: compila con gli elementi liberi.
            </p>
          )}
          </div>
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
