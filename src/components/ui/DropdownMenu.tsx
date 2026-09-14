import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";

// ─────────────────────────────────────────────────────────────────────────────
// Menu a tendina generico per le AZIONI (⋯), condiviso da tutte le pagine.
// Serve per accorpare le azioni secondarie invece di riempire la testata di
// bottoni su piu' righe. Il menu e' renderizzato in un PORTAL con posizione
// fixed: cosi' non viene tagliato da tabelle/contenitori con overflow.
// Per i campi di selezione (con ricerca) usare invece SearchableSelect.
// ─────────────────────────────────────────────────────────────────────────────

const MENU_Z_INDEX = 13000;
/** Altezza stimata: se sotto non c'e' spazio, il menu si apre verso l'alto. */
const MENU_EST_HEIGHT = 280;

export interface DropdownMenuItem {
  key: string;
  label: string;
  icon?: IconName;
  onClick?: () => void;
  disabled?: boolean;
  /** Voce distruttiva (es. elimina): resa in rosso. */
  danger?: boolean;
  /** Voce attiva/selezionata: mostra la spunta. */
  active?: boolean;
  /** Testo secondario a destra (es. conteggio). */
  trailing?: string;
  /** Disegna un separatore sopra questa voce. */
  separatorBefore?: boolean;
}

/** Le voci falsy vengono ignorate: comodo per `condizione && {...}`. */
type Item = DropdownMenuItem | null | false | undefined;

interface DropdownMenuProps {
  items: Item[];
  /** Tooltip + aria-label del trigger (obbligatorio: l'icona e' aria-hidden). */
  label?: string;
  /** Icona del trigger. Default: "dots-horizontal" quando il trigger e' di sola icona. */
  icon?: IconName;
  /** Se valorizzato, il trigger mostra questo testo + chevron invece della sola icona. */
  triggerLabel?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "danger-ghost";
  size?: "sm" | "md" | "lg";
  align?: "left" | "right";
  disabled?: boolean;
  className?: string;
}

export function DropdownMenu({
  items,
  label = "Altre azioni",
  icon,
  triggerLabel,
  variant = "ghost",
  size = "md",
  align = "right",
  disabled = false,
  className = "",
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const visible = items.filter(Boolean) as DropdownMenuItem[];

  const updateRect = useCallback(() => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) setRect(r);
  }, []);

  useEffect(() => {
    if (!open) return;
    updateRect();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, updateRect]);

  if (!visible.length) return null;

  const openUp = rect ? rect.bottom + MENU_EST_HEIGHT > window.innerHeight : false;
  const style: React.CSSProperties = rect
    ? {
        position: "fixed",
        zIndex: MENU_Z_INDEX,
        ...(openUp ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
        ...(align === "right"
          ? { right: Math.max(8, window.innerWidth - rect.right) }
          : { left: Math.max(8, rect.left) }),
      }
    : { display: "none" };

  const menu = (
    <>
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={() => setOpen(false)}
        className="fixed inset-0 cursor-default"
        style={{ zIndex: MENU_Z_INDEX - 1 }}
      />
      <div
        role="menu"
        style={style}
        className={`${openUp ? "dd-pop-up" : "dd-pop"} min-w-[210px] max-w-[320px] overflow-hidden rounded-md border border-line bg-paper py-1 shadow-lg dark:border-[#2a2a2e] dark:bg-[#1c1c20]`}
      >
        {visible.map((it, i) => (
          <div key={it.key} className="dd-item" style={{ animationDelay: `${Math.min(i, 12) * 22}ms` }}>
            {it.separatorBefore ? <div className="my-1 h-px bg-line dark:bg-[#2a2a2e]" /> : null}
            <button
              type="button"
              role="menuitem"
              disabled={it.disabled}
              onClick={() => {
                setOpen(false);
                it.onClick?.();
              }}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12.5px] font-semibold transition-colors disabled:opacity-40 disabled:pointer-events-none ${
                it.danger
                  ? "text-danger hover:bg-danger/10"
                  : "text-ink hover:bg-cream dark:text-[#f4f4f7] dark:hover:bg-[#24242a]"
              }`}
            >
              {it.icon ? <Icon name={it.icon} className="h-4 w-4 flex-shrink-0" /> : null}
              <span className="min-w-0 flex-1 truncate">{it.label}</span>
              {it.trailing ? (
                <span className="flex-shrink-0 text-[11px] tabular-nums text-muted dark:text-[#9999a0]">
                  {it.trailing}
                </span>
              ) : null}
              {it.active ? <Icon name="check" className="h-3.5 w-3.5 flex-shrink-0" /> : null}
            </button>
          </div>
        ))}
      </div>
    </>
  );

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant={variant}
        size={size}
        iconOnly={!triggerLabel}
        disabled={disabled}
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className={className}
        leftIcon={
          triggerLabel
            ? icon && <Icon name={icon} className="h-4 w-4" />
            : <Icon name={icon ?? "dots-horizontal"} className="h-4 w-4" />
        }
        rightIcon={triggerLabel ? <Icon name="chevron-down" className="h-3.5 w-3.5" /> : undefined}
        onClick={() => {
          updateRect();
          setOpen((v) => !v);
        }}
      >
        {triggerLabel}
      </Button>
      {open ? createPortal(menu, document.body) : null}
    </>
  );
}
