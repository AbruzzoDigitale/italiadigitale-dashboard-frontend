// pdf.js caricato su richiesta: pesa ~450KB, lo scarica solo chi apre l'editor
// di compilazione. Il worker è servito dal bundle dell'app (nessuna CDN).
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

type PdfjsModule = typeof import("pdfjs-dist");

let modulePromise: Promise<PdfjsModule> | null = null;

export function loadPdfjs(): Promise<PdfjsModule> {
  if (!modulePromise) {
    modulePromise = import("pdfjs-dist").then((mod) => {
      mod.GlobalWorkerOptions.workerSrc = workerUrl;
      return mod;
    });
  }
  return modulePromise;
}
