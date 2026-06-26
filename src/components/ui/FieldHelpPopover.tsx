import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface FieldHelpPopoverProps {
  title: string;
  shortText: string;
  longText: string;
}

/**
 * Pallino "?" con popover informativo (apre/chiude al click, si chiude su Escape/click fuori).
 * Componente condiviso: usato per spiegare campi e voci in giro per l'app.
 * `longText` rispetta gli a-capo (white-space: pre-line), utile per glossari a elenco.
 */
export function FieldHelpPopover({ title, shortText, longText }: FieldHelpPopoverProps) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(320, window.innerWidth - 24);
      const left = Math.min(Math.max(12, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 12);
      const top = Math.min(rect.bottom + 10, window.innerHeight - 160);
      setPosition({ top, left, width });
    };

    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || popupRef.current?.contains(target)) return;
      setOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <span className="inline-flex items-center">
      <button
        ref={buttonRef}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        className="ml-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line bg-paper text-[10px] font-bold text-muted transition-colors hover:border-ink hover:text-ink dark:border-line-dark dark:bg-[#1c1c20] dark:text-muted-dark dark:hover:border-paper dark:hover:text-paper"
        aria-label={title}
        aria-expanded={open}
      >
        ?
      </button>
      {open && position && createPortal(
        <div
          ref={popupRef}
          className="fixed z-[4000] rounded-lg border border-line bg-paper px-3 py-2.5 text-left shadow-xl dark:border-line-dark dark:bg-[#131316]"
          style={{ top: position.top, left: position.left, width: position.width }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink dark:text-paper">{title}</p>
          <p className="mt-1 text-[12px] text-muted dark:text-muted-dark">{shortText}</p>
          <p className="mt-2 whitespace-pre-line text-[11px] leading-5 text-muted dark:text-muted-dark">{longText}</p>
        </div>,
        document.body
      )}
    </span>
  );
}
