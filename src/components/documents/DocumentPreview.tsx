import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { PageMetric } from "../../api/documents";
import { useToast } from "../../context/ToastContext";
import { Icon } from "../ui/Icon";
import { Spinner } from "../ui/Spinner";
import { loadPdfjs } from "./pdfjs";
import type { EditorField } from "./modelEditor";

interface DocumentPreviewProps {
  fileData: ArrayBuffer;
  pages: PageMetric[];
  fields: EditorField[];
  values: Record<string, string>;
  /** Clic su un campo nel PDF → porta al campo nel form. */
  onFieldClick?: (fieldId: number) => void;
}

export interface DocumentPreviewHandle {
  /** Scorre l'anteprima al campo indicato e lo evidenzia. */
  scrollToField: (fieldId: number) => void;
}

const isSignatureValue = (v: string | undefined): boolean => !!v && v.startsWith("data:image");

/** Anteprima in SOLA LETTURA del documento reale: renderizza il PDF con pdf.js
 *  e sovrappone i valori correnti nei punti dei campi (aggiornati live). */
export const DocumentPreview = forwardRef<DocumentPreviewHandle, DocumentPreviewProps>(function DocumentPreview(
  { fileData, pages, fields, values, onFieldClick },
  ref
) {
  const toast = useToast();
  const docColRef = useRef<HTMLDivElement | null>(null);
  const canvasRefs = useRef<Record<number, HTMLCanvasElement | null>>({});
  const fieldElRefs = useRef<Record<number, HTMLButtonElement | null>>({});
  const [fitScale, setFitScale] = useState(1);
  const [zoom, setZoom] = useState(1);
  const scale = Math.min(3, Math.max(0.25, fitScale * zoom));
  const [rendering, setRendering] = useState(true);
  const [flashId, setFlashId] = useState<number | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useImperativeHandle(ref, () => ({
    scrollToField(fieldId: number) {
      const el = fieldElRefs.current[fieldId];
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      setFlashId(fieldId);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlashId(null), 1600);
    },
  }));

  const firstPageWidth = pages[0]?.width ?? 595;

  const fieldsByPage = useMemo(() => {
    const map: Record<number, EditorField[]> = {};
    for (const f of fields) {
      if (f.page == null || f.posX == null) continue;
      (map[f.page] ??= []).push(f);
    }
    return map;
  }, [fields]);

  // Adatta il documento alla larghezza della colonna.
  useEffect(() => {
    const container = docColRef.current;
    if (!container) return;
    const update = () => {
      const available = container.clientWidth - 8;
      if (available > 0) setFitScale(available / firstPageWidth);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [firstPageWidth]);

  // Render pagine.
  useEffect(() => {
    let cancelled = false;
    let loadingTask: ReturnType<Awaited<ReturnType<typeof loadPdfjs>>["getDocument"]> | null = null;
    const render = async () => {
      setRendering(true);
      try {
        const pdfjs = await loadPdfjs();
        if (cancelled) return;
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
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Impossibile visualizzare il documento");
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

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-line dark:border-line-dark bg-white">
      {/* Barra: titolo + zoom */}
      <div className="flex flex-none items-center gap-2 border-b border-line/70 bg-cream/60 px-3 py-2 dark:border-line-dark dark:bg-ink-2/60">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-ink text-paper dark:bg-paper dark:text-ink">
          <Icon name="document-text" className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] font-bold uppercase tracking-wide text-ink dark:text-paper">
          Anteprima
        </span>
        <div className="flex flex-none items-center gap-1">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.25, +(z - 0.1).toFixed(2)))}
            className="grid h-7 w-7 place-items-center rounded-md border border-line bg-paper text-ink hover:border-brand-magenta hover:text-brand-magenta dark:border-line-dark dark:bg-ink-2 dark:text-paper"
            title="Riduci"
            aria-label="Riduci"
          >
            <Icon name="minus" className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setZoom(1)}
            className="grid h-7 min-w-[3rem] place-items-center rounded-md border border-line bg-paper px-1 text-[11px] font-semibold tabular-nums text-ink hover:border-brand-magenta hover:text-brand-magenta dark:border-line-dark dark:bg-ink-2 dark:text-paper"
            title="Adatta alla larghezza"
          >
            {Math.round(scale * 100)}%
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(3, +(z + 0.1).toFixed(2)))}
            className="grid h-7 w-7 place-items-center rounded-md border border-line bg-paper text-ink hover:border-brand-magenta hover:text-brand-magenta dark:border-line-dark dark:bg-ink-2 dark:text-paper"
            title="Ingrandisci"
            aria-label="Ingrandisci"
          >
            <Icon name="plus" className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div ref={docColRef} className="relative flex-1 overflow-auto bg-neutral-200/60 p-3 dark:bg-black/40">
        {rendering && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/50">
            <Spinner />
          </div>
        )}
        <div className="flex flex-col items-center gap-3">
          {pages.map((metric) => (
            <div
              key={metric.page}
              className="relative shadow-md"
              style={{ width: metric.width * scale, height: metric.height * scale }}
            >
              <canvas
                ref={(el) => {
                  canvasRefs.current[metric.page] = el;
                }}
                className="absolute inset-0 bg-white"
              />
              {(fieldsByPage[metric.page] ?? []).map((f) => {
                const val = values[f.key] ?? "";
                const isSig = f.fieldType === "signature";
                const left = (f.posX ?? 0) * scale;
                const top = (f.posY ?? 0) * scale;
                const width = (f.posW ?? 100) * scale;
                const height = Math.max(isSig ? 28 : 10, (f.posH ?? 12) * scale);
                return (
                  <button
                    key={f.fieldId}
                    type="button"
                    ref={(el) => {
                      fieldElRefs.current[f.fieldId] = el;
                    }}
                    onClick={() => onFieldClick?.(f.fieldId)}
                    title="Vai al campo da compilare"
                    className={`absolute flex items-center overflow-hidden rounded-[2px] text-left transition hover:bg-brand-magenta/10 hover:ring-1 hover:ring-brand-magenta/50 ${
                      flashId === f.fieldId ? "bg-brand-magenta/20 ring-2 ring-brand-magenta" : ""
                    }`}
                    style={{ left, top, width, height, cursor: onFieldClick ? "pointer" : "default" }}
                  >
                    {isSig ? (
                      isSignatureValue(val) ? (
                        <img src={val} alt="Firma" className="h-full w-full object-contain" draggable={false} />
                      ) : (
                        <span className="mx-auto text-[10px] font-semibold text-neutral-400">✍</span>
                      )
                    ) : (
                      <span
                        className="w-full truncate font-medium text-[#0b3d91]"
                        style={{ lineHeight: `${height}px`, fontSize: Math.max(7, (f.fontSize ?? 10) * scale) }}
                      >
                        {val}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
          {pages.length === 0 && (
            <p className="py-10 text-[13px] text-muted dark:text-muted-dark">Anteprima non disponibile.</p>
          )}
        </div>
      </div>
    </div>
  );
});
