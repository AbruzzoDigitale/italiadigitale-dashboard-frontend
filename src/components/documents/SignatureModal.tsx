import { useEffect, useRef, useState } from "react";
import { useToast } from "../../context/ToastContext";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Modal } from "../ui/Modal";
import { SegmentedSwitch } from "../ui/SegmentedSwitch";

interface SignatureModalProps {
  open: boolean;
  onClose: () => void;
  /** Riceve il PNG come data URL (con trasparenza). */
  onConfirm: (dataUrl: string) => void;
}

type Mode = "draw" | "upload";

const CANVAS_W = 640;
const CANVAS_H = 220;

export function SignatureModal({ open, onClose, onConfirm }: SignatureModalProps) {
  const toast = useToast();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const drawing = useRef(false);
  const hasStrokes = useRef(false);

  const [mode, setMode] = useState<Mode>("draw");
  const [uploaded, setUploaded] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMode("draw");
    setUploaded(null);
    hasStrokes.current = false;
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, [open]);

  const pointerPos = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    canvas.setPointerCapture(event.pointerId);
    drawing.current = true;
    hasStrokes.current = true;
    const { x, y } = pointerPos(event);
    ctx.strokeStyle = "#101040";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pointerPos(event);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const handlePointerUp = () => {
    drawing.current = false;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasStrokes.current = false;
  };

  const handleUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Seleziona un'immagine");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // Ri-codifica in PNG mantenendo la trasparenza e limitando la dimensione.
        const scale = Math.min(1, 1200 / img.width, 600 / img.height);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        setUploaded(canvas.toDataURL("image/png"));
      };
      img.onerror = () => toast.error("Immagine non leggibile");
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleConfirm = () => {
    if (mode === "upload") {
      if (!uploaded) {
        toast.error("Carica un'immagine della firma");
        return;
      }
      onConfirm(uploaded);
      onClose();
      return;
    }
    if (!hasStrokes.current) {
      toast.error("Disegna la firma");
      return;
    }
    const dataUrl = canvasRef.current?.toDataURL("image/png");
    if (dataUrl) {
      onConfirm(dataUrl);
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Firma"
      description="Disegna la firma o carica un'immagine con sfondo trasparente"
      icon={<Icon name="pencil" className="w-5 h-5" />}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annulla
          </Button>
          <Button onClick={handleConfirm} leftIcon={<Icon name="check" className="w-4 h-4" />}>
            Inserisci
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <SegmentedSwitch
          value={mode}
          onChange={setMode}
          options={[
            { value: "draw", label: "Disegna" },
            { value: "upload", label: "Carica immagine" },
          ]}
        />

        {mode === "draw" ? (
          <div className="space-y-2">
            <canvas
              ref={canvasRef}
              width={CANVAS_W}
              height={CANVAS_H}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              className="w-full rounded-lg border border-line dark:border-line-dark bg-white touch-none cursor-crosshair"
              style={{ aspectRatio: `${CANVAS_W} / ${CANVAS_H}` }}
            />
            <div className="flex justify-end">
              <Button size="sm" variant="ghost" onClick={clearCanvas}>
                Pulisci
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full rounded-lg border border-dashed border-line dark:border-line-dark px-4 py-8 text-center hover:bg-cream dark:hover:bg-ink-2 transition-colors"
            >
              {uploaded ? (
                <img src={uploaded} alt="Firma" className="mx-auto max-h-32" />
              ) : (
                <span className="text-[13px] text-muted dark:text-muted-dark">
                  Clicca per scegliere l'immagine della firma (PNG con sfondo trasparente)
                </span>
              )}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
