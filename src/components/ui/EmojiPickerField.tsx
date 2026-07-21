import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import EmojiPicker, { type EmojiClickData } from "emoji-picker-react";

interface EmojiPickerFieldProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  searchPlaceholder?: string;
}

function firstSymbol(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    const segments = segmenter.segment(trimmed)[Symbol.iterator]();
    const first = segments.next();
    return first.done ? "" : first.value.segment;
  }

  const units = Array.from(trimmed);
  return units[0] ?? "";
}

export function EmojiPickerField({
  label,
  value,
  onChange,
  searchPlaceholder = "Cerca emoji...",
}: EmojiPickerFieldProps) {
  const [open, setOpen] = useState(false);
  const [menuRect, setMenuRect] = useState<{ top: number; left: number } | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      setMenuRect(null);
      return;
    }

    const updateRect = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuRect({
        top: rect.bottom + 6,
        left: rect.left,
      });
    };

    updateRect();
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);
    return () => {
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [open]);

  const selectedEmoji = firstSymbol(value);

  useEffect(() => {
    if (!open) return;
    const onDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const inTrigger = !!pickerRef.current?.contains(target);
      const inMenu = !!menuRef.current?.contains(target);
      if (!inTrigger && !inMenu) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocumentMouseDown);
    return () => document.removeEventListener("mousedown", onDocumentMouseDown);
  }, [open]);

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
          {label}
        </label>
      )}

      <div ref={pickerRef} className="relative">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="flex h-[42px] w-full items-center justify-center rounded-md border border-line bg-paper px-3 text-center text-xl leading-none text-ink transition-colors hover:bg-cream focus:border-ink focus:outline-none dark:border-line-dark dark:bg-ink-soft dark:text-paper dark:hover:bg-[#1c1c20] dark:focus:border-paper"
        >
          <span className={!selectedEmoji ? "text-muted dark:text-muted-dark" : ""} aria-hidden="true">
            {selectedEmoji || "😀"}
          </span>
        </button>

        {open && menuRect && createPortal(
          <div
            ref={menuRef}
            className="dd-pop fixed z-[3500]"
            style={{ top: menuRect.top, left: menuRect.left }}
          >
            <EmojiPicker
              onEmojiClick={(data: EmojiClickData) => {
                onChange(firstSymbol(data.emoji));
                setOpen(false);
              }}
              lazyLoadEmojis
              skinTonesDisabled
              searchPlaceholder={searchPlaceholder}
              width={320}
              height={400}
            />
          </div>,
          document.body
        )}
      </div>
    </div>
  );
}