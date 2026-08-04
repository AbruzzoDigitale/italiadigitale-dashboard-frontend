import { useEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { createPortal } from "react-dom";
import EmojiPicker, { type EmojiClickData } from "emoji-picker-react";

/**
 * Popover emoji condiviso: trigger custom (render-prop) + picker in PORTAL
 * ancorato al trigger, con chiusura al click fuori e riposizionamento su
 * scroll/resize. Usato da EmojiPickerField (icone aree) e dall'editor del
 * recap giornaliero: stesso comportamento e posizionamento ovunque.
 */
interface EmojiPickerPopoverProps {
  onPick: (emoji: string) => void;
  searchPlaceholder?: string;
  renderTrigger: (args: { ref: Ref<HTMLButtonElement>; open: boolean; toggle: () => void }) => ReactNode;
}

const PICKER_WIDTH = 320;
const PICKER_Z_INDEX = 13000; // sopra i modal, come i menu delle select

export function EmojiPickerPopover({
  onPick,
  searchPlaceholder = "Cerca emoji...",
  renderTrigger,
}: EmojiPickerPopoverProps) {
  const [open, setOpen] = useState(false);
  const [menuRect, setMenuRect] = useState<{ top: number; left: number } | null>(null);
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
      // Clamp orizzontale: il picker non deve uscire dallo schermo.
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - PICKER_WIDTH - 8));
      setMenuRect({ top: rect.bottom + 6, left });
    };

    updateRect();
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);
    return () => {
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const inTrigger = !!triggerRef.current?.contains(target);
      const inMenu = !!menuRef.current?.contains(target);
      if (!inTrigger && !inMenu) setOpen(false);
    };
    document.addEventListener("mousedown", onDocumentMouseDown);
    return () => document.removeEventListener("mousedown", onDocumentMouseDown);
  }, [open]);

  return (
    <>
      {renderTrigger({ ref: triggerRef, open, toggle: () => setOpen((current) => !current) })}
      {open &&
        menuRect &&
        createPortal(
          <div
            ref={menuRef}
            className="dd-pop fixed"
            style={{ top: menuRect.top, left: menuRect.left, zIndex: PICKER_Z_INDEX }}
          >
            <EmojiPicker
              onEmojiClick={(data: EmojiClickData) => {
                onPick(data.emoji);
                setOpen(false);
              }}
              lazyLoadEmojis
              skinTonesDisabled
              searchPlaceholder={searchPlaceholder}
              width={PICKER_WIDTH}
              height={400}
            />
          </div>,
          document.body
        )}
    </>
  );
}
