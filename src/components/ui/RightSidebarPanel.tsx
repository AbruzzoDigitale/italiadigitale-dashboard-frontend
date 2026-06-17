import { createPortal } from "react-dom";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { Icon } from "./Icon";

interface RightSidebarPanelProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  widthClassName?: string;
}

export function RightSidebarPanel({
  open,
  title,
  onClose,
  children,
  footer,
  widthClassName = "w-full max-w-md",
}: RightSidebarPanelProps) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  return createPortal(
    <div
      className={`fixed inset-0 z-[1900] transition-opacity duration-250 ${open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`}
      aria-hidden={!open}
    >
      <div
        className="absolute inset-0 bg-[#0a0a0a]/45 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <aside
        className={`absolute right-0 top-0 h-full ${widthClassName} border-l border-line bg-paper shadow-2xl transition-transform duration-300 ease-out dark:border-[#2a2a2e] dark:bg-[#131316] ${open ? "translate-x-0" : "translate-x-full"}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-line px-4 py-3 dark:border-[#2a2a2e]">
            <h3 className="text-sm font-display font-bold tracking-tight text-ink dark:text-[#f4f4f7]">
              {title}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-muted transition-colors hover:text-ink dark:text-[#9999a0] dark:hover:text-[#f4f4f7]"
              aria-label="Chiudi filtri"
            >
              <Icon name="x" className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4">
            {children}
          </div>

          {footer && (
            <div className="border-t border-line px-4 py-3 dark:border-[#2a2a2e]">
              {footer}
            </div>
          )}
        </div>
      </aside>
    </div>,
    document.body
  );
}
