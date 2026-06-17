import { type ReactNode, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../ui/Icon";

interface ConfiguratorDialogProps {
  open: boolean;
  title: string;
  subtitle?: string;
  maxWidth?: number;
  disableClose?: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export function ConfiguratorDialog({
  open,
  title,
  subtitle,
  maxWidth = 560,
  disableClose = false,
  onClose,
  children,
  footer,
}: ConfiguratorDialogProps) {
  const titleId = useId();
  const overlayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !disableClose) {
        onClose();
      }
    };

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [disableClose, onClose, open]);

  if (!open) return null;

  return createPortal(
    <div
      ref={overlayRef}
      className="configurator-modular-page cfg-dialog"
      onMouseDown={(event) => {
        if (!disableClose && event.target === overlayRef.current) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="cfg-dialog__panel"
        style={{ maxWidth }}
      >
        <div className="cfg-dialog__header">
          <div>
            <div id={titleId} className="cfg-dialog__title">{title}</div>
            {subtitle ? <div className="cfg-dialog__sub">{subtitle}</div> : null}
          </div>
          <button
            type="button"
            className="cfg-dialog__close"
            onClick={onClose}
            disabled={disableClose}
            aria-label="Chiudi"
          >
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>

        <div className="cfg-dialog__body">{children}</div>

        {footer ? <div className="cfg-dialog__footer">{footer}</div> : null}
      </div>
    </div>,
    document.body
  );
}
