import { useCallback, useEffect, useRef } from "react";
import { Icon } from "../ui/Icon";

interface SignaturePadProps {
  /** dataURL PNG quando c'è un tratto, null quando pulita. */
  onChange: (dataUrl: string | null) => void;
  hasSignature: boolean;
}

/** Tavoletta per la firma autografa (mouse o touch), su canvas. */
export function SignaturePad({ onChange, hasSignature }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);

  const ctx = () => canvasRef.current?.getContext("2d") ?? null;

  // Adatta la risoluzione del canvas al DPR, preservando il disegno.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const fit = () => {
      const rect = c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const prev = dirty.current ? c.toDataURL() : null;
      c.width = Math.round(rect.width * dpr);
      c.height = Math.round(rect.height * dpr);
      const x = c.getContext("2d");
      if (!x) return;
      x.scale(dpr, dpr);
      x.lineWidth = 2.2;
      x.lineCap = "round";
      x.lineJoin = "round";
      x.strokeStyle = "#1b1c1b";
      if (prev) {
        const img = new Image();
        img.onload = () => x.drawImage(img, 0, 0, rect.width, rect.height);
        img.src = prev;
      }
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  const pos = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const down = (e: React.PointerEvent) => {
    e.preventDefault();
    const x = ctx();
    if (!x) return;
    const p = pos(e);
    x.beginPath();
    x.moveTo(p.x, p.y);
    drawing.current = true;
    canvasRef.current?.setPointerCapture(e.pointerId);
  };

  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const x = ctx();
    if (!x) return;
    const p = pos(e);
    x.lineTo(p.x, p.y);
    x.stroke();
    dirty.current = true;
  };

  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (dirty.current && canvasRef.current) onChange(canvasRef.current.toDataURL("image/png"));
  };

  const clear = useCallback(() => {
    const c = canvasRef.current;
    const x = ctx();
    if (!c || !x) return;
    x.clearRect(0, 0, c.width, c.height);
    dirty.current = false;
    onChange(null);
  }, [onChange]);

  return (
    <div
      className={`relative overflow-hidden rounded-xl border-2 ${
        hasSignature ? "border-brand-magenta/60 bg-white" : "border-dashed border-line bg-white"
      }`}
    >
      <canvas
        ref={canvasRef}
        className="block h-40 w-full touch-none"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={up}
      />
      {!hasSignature && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[13px] italic text-neutral-400">
          Firma qui con il mouse o col dito
        </span>
      )}
      <span className="pointer-events-none absolute bottom-9 left-6 right-6 border-b border-neutral-300" />
      <div className="flex items-center justify-between border-t border-line/70 bg-cream/40 px-3 py-1.5">
        <span className="text-[11px] font-semibold text-muted">
          {hasSignature ? "Firma acquisita" : "Tratto autografo richiesto"}
        </span>
        <button
          type="button"
          onClick={clear}
          className="flex items-center gap-1 text-[11px] font-semibold text-muted hover:text-brand-magenta"
        >
          <Icon name="refresh-cw" className="h-3 w-3" /> Cancella
        </button>
      </div>
    </div>
  );
}
