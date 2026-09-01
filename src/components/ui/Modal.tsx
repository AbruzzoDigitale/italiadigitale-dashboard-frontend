import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import "./modal-theme.css";
// `full`: nessun limite di larghezza. Serve agli editor a tela (posizionamento
// campi sul PDF), dove il dialog deve prendersi tutto lo schermo.
type ModalSize = "sm" | "md" | "lg" | "xl" | "2xl" | "full";
type ModalPosition = "center" | "left" | "right";

type DraftFieldValue =
  | { type: "text"; value: string }
  | { type: "checkbox"; checked: boolean }
  | { type: "radio"; checked: boolean }
  | { type: "contenteditable"; html: string };

type ModalDraftPayload = {
  updatedAt: number;
  fields: Record<string, DraftFieldValue>;
};

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  /** Azioni extra nell'header, rese a sinistra del pulsante di chiusura (X). */
  headerActions?: React.ReactNode;
  subHeader?: React.ReactNode;
  size?: ModalSize;
  position?: ModalPosition;
  showOverlay?: boolean;
  mobileFullscreen?: boolean;
  containerClassName?: string;
  dialogClassName?: string;
  bodyClassName?: string;
  hideCloseButton?: boolean;
  inline?: boolean;
  footer?: React.ReactNode;
  children: React.ReactNode;
  persistDraft?: boolean;
  draftId?: string;
}

const sizeMap: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-2xl",
  "2xl": "max-w-4xl",
  full: "max-w-none",
};

// Stessi limiti, ma da `sm` in su. Servono scritti per esteso: Tailwind genera
// le classi leggendo il sorgente, una stringa composta a runtime non la vede.
const sizeMapFromSm: Record<ModalSize, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
  xl: "sm:max-w-2xl",
  "2xl": "sm:max-w-4xl",
  full: "sm:max-w-none",
};

export function Modal({
  open,
  onClose,
  title,
  description,
  icon,
  headerActions,
  subHeader,
  size = "md",
  position = "center",
  showOverlay = true,
  mobileFullscreen = false,
  containerClassName = "",
  dialogClassName = "",
  bodyClassName = "",
  hideCloseButton = false,
  inline = false,
  footer,
  children,
  persistDraft = true,
  draftId,
}: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  // Protezione chiusura accidentale: chiudi solo se il gesto (mousedown→mouseup)
  // inizia E finisce sull'overlay. Evita la chiusura quando si trascina/seleziona
  // dentro al dialog e si rilascia il mouse fuori.
  const overlayPointerDownRef = useRef(false);

  const storageKey = `modal-draft:${draftId ?? `${window.location.pathname}:${title ?? "untitled"}`}`;

  const getFieldKey = (element: Element, index: number): string => {
    const htmlElement = element as HTMLElement;
    const name = htmlElement.getAttribute("name");
    if (name) return `name:${name}`;

    const id = htmlElement.getAttribute("id");
    if (id) return `id:${id}`;

    const ariaLabel = htmlElement.getAttribute("aria-label");
    if (ariaLabel) return `aria:${ariaLabel}`;

    const placeholder = htmlElement.getAttribute("placeholder");
    const role = htmlElement.getAttribute("role") ?? htmlElement.tagName.toLowerCase();
    if (placeholder) return `${role}:placeholder:${placeholder}`;

    return `${role}:index:${index}`;
  };

  const readDraft = (): ModalDraftPayload | null => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as ModalDraftPayload;
      if (!parsed || typeof parsed !== "object" || !parsed.fields) return null;
      return parsed;
    } catch {
      return null;
    }
  };

  const writeDraft = () => {
    if (!persistDraft) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const fields: Record<string, DraftFieldValue> = {};
    const controls = dialog.querySelectorAll("input, textarea, select, [contenteditable='true']");

    controls.forEach((element, index) => {
      const key = getFieldKey(element, index);
      if (!key) return;

      if (element instanceof HTMLInputElement) {
        if (element.type === "password" || element.type === "file") return;
        if (element.type === "checkbox") {
          fields[key] = { type: "checkbox", checked: element.checked };
          return;
        }
        if (element.type === "radio") {
          fields[key] = { type: "radio", checked: element.checked };
          return;
        }
        fields[key] = { type: "text", value: element.value };
        return;
      }

      if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
        fields[key] = { type: "text", value: element.value };
        return;
      }

      if (element instanceof HTMLElement && element.isContentEditable) {
        fields[key] = { type: "contenteditable", html: element.innerHTML };
      }
    });

    const payload: ModalDraftPayload = {
      updatedAt: Date.now(),
      fields,
    };

    try {
      sessionStorage.setItem(storageKey, JSON.stringify(payload));
    } catch {
      // Ignore storage quota and JSON errors.
    }
  };

  const restoreDraft = () => {
    if (!persistDraft) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const draft = readDraft();
    if (!draft) return;

    const controls = dialog.querySelectorAll("input, textarea, select, [contenteditable='true']");
    controls.forEach((element, index) => {
      // Do not override the currently focused field, otherwise caret position can jump.
      if (document.activeElement === element) return;

      const key = getFieldKey(element, index);
      const field = draft.fields[key];
      if (!field) return;

      if (element instanceof HTMLInputElement) {
        if (field.type === "checkbox" || field.type === "radio") {
          if (element.checked !== field.checked) {
            element.checked = field.checked;
            element.dispatchEvent(new Event("change", { bubbles: true }));
          }
          return;
        }
        if (field.type === "text" && element.value !== field.value) {
          element.value = field.value;
          element.dispatchEvent(new Event("input", { bubbles: true }));
          element.dispatchEvent(new Event("change", { bubbles: true }));
        }
        return;
      }

      if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
        if (field.type === "text" && element.value !== field.value) {
          element.value = field.value;
          element.dispatchEvent(new Event("input", { bubbles: true }));
          element.dispatchEvent(new Event("change", { bubbles: true }));
        }
        return;
      }

      if (element instanceof HTMLElement && element.isContentEditable && field.type === "contenteditable") {
        if (element.innerHTML !== field.html) {
          element.innerHTML = field.html;
          element.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }
    });
  };

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Prevent body scroll
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  useEffect(() => {
    if (!open || !persistDraft) return;

    const dialog = dialogRef.current;
    if (!dialog) return;

    restoreDraft();
    const restoreTimeout = window.setTimeout(restoreDraft, 140);

    const save = () => writeDraft();
    dialog.addEventListener("input", save, true);
    dialog.addEventListener("change", save, true);

    return () => {
      window.clearTimeout(restoreTimeout);
      dialog.removeEventListener("input", save, true);
      dialog.removeEventListener("change", save, true);
    };
  }, [open, persistDraft]);

  if (!open) return null;

  const alignmentClass =
    position === "left"
      ? "justify-start"
      : position === "right"
        ? "justify-end"
        : "justify-center";
  const mobileContainerClass = mobileFullscreen ? "items-stretch p-0 sm:items-center sm:p-4" : "items-center p-4";
  // `max-w-none` sta più in basso di `max-w-*` nel foglio generato, quindi a
  // parità di specificità vinceva sempre: con mobileFullscreen la prop `size`
  // veniva ignorata e il dialog restava a tutta larghezza anche su desktop.
  // Il cap va quindi ripristinato con la variante `sm:`, che sta nella media
  // query e batte entrambe da 640px in su.
  const mobileDialogClass = mobileFullscreen
    ? `max-w-none ${sizeMapFromSm[size]} h-[100dvh] max-h-[100dvh] rounded-none sm:h-auto sm:max-h-[90vh] sm:rounded-lg`
    : "max-h-[90vh] rounded-lg";

  const dialogContent = (
    <div
      role="dialog"
      aria-modal
      aria-labelledby={title ? "modal-title" : undefined}
      ref={dialogRef}
      className={`id-modal relative min-h-0 w-full ${sizeMap[size]} ${mobileDialogClass} flex flex-col overflow-hidden bg-paper dark:bg-[#0E0F0E] border border-line dark:border-line-dark shadow-3 animate-fadeIn ${dialogClassName}`}
    >
      {title && (
        <div className="flex-shrink-0 flex items-center justify-between gap-4 px-6 py-4 border-b border-line dark:border-line-dark dark:bg-[#191A19]">
          <div className="flex items-center gap-3 min-w-0">
            {icon && (
              <span className="flex h-10 w-10 flex-none items-center justify-center rounded-md bg-brand-magenta/10 text-brand-magenta">
                {icon}
              </span>
            )}
            <div className="min-w-0">
              <h2
                id="modal-title"
                className="font-display font-bold text-lg leading-tight tracking-tight text-ink dark:text-paper"
              >
                {title}
              </h2>
              {description && (
                <p className="mt-0.5 text-xs text-muted dark:text-muted-dark">
                  {description}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-none items-center gap-2">
          {headerActions}
          {!hideCloseButton && (
            <button
              onClick={onClose}
              className="flex-none inline-flex h-9 w-9 items-center justify-center rounded-md border border-line dark:border-line-dark text-muted dark:text-muted-dark transition-colors hover:border-brand-magenta hover:text-brand-magenta"
              aria-label="Chiudi"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
          </div>
        </div>
      )}

      {subHeader && <div className="flex-shrink-0 dark:bg-[#1F211F]">{subHeader}</div>}

      <div className={`min-h-0 flex-1 overflow-y-auto px-6 py-5 ${bodyClassName}`}>{children}</div>

      {footer && (
        <div className="flex-shrink-0 flex items-center justify-end gap-3 px-6 py-3.5 border-t border-line dark:border-line-dark">
          {footer}
        </div>
      )}
    </div>
  );

  if (inline) {
    return dialogContent;
  }

  return createPortal(
    <div
      ref={overlayRef}
      className={`fixed inset-0 z-[3000] flex ${alignmentClass} ${mobileContainerClass} animate-fadeIn ${showOverlay ? "bg-ink/60 backdrop-blur-sm" : "bg-transparent"} ${containerClassName}`}
      onMouseDown={(e) => {
        overlayPointerDownRef.current = e.target === overlayRef.current;
      }}
      onClick={(e) => {
        if (e.target === overlayRef.current && overlayPointerDownRef.current) onClose();
        overlayPointerDownRef.current = false;
      }}
    >
      {dialogContent}
    </div>,
    document.body
  );
}
