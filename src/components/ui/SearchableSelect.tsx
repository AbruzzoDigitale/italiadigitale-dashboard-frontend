import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";

export type SearchableSelectOption = {
  value: string;
  label: string;
  keywords?: string;
  disabled?: boolean;
  avatarUrl?: string | null;
  /** Icona custom al posto di avatar/iniziali (es. logo social). */
  icon?: React.ReactNode;
  /** Testo secondario allineato a destra nella riga (es. importo). */
  trailing?: string;
};

type SearchableSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  menuPlacement?: "top" | "bottom";
  menuLayer?: "local" | "portal";
  /** Mostra l'avatar/iniziali per opzione (default true). false = opzioni "a colonne". */
  showAvatar?: boolean;
  /** Larghezza minima del menu (px). Il trigger può restare stretto: serve quando
   *  le voci sono lunghe (numero + data + descrizione) e altrimenti si troncano. */
  menuMinWidth?: number;
  /** "circle" (default) per foto persone; "logo" per loghi aziendali (object-contain, angoli morbidi). */
  avatarShape?: "circle" | "logo";
  /** Creazione inline dal testo cercato (riga "Crea ..." in fondo al menu). */
  onCreateOption?: (name: string) => Promise<void> | void;
  createLoading?: boolean;
  createActionLabel?: string;
};

const SELECT_MENU_Z_INDEX = 13000;

function getInitials(label: string): string {
  return label
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "U";
}

function OptionAvatar({ option, shape }: { option: SearchableSelectOption; shape: "circle" | "logo" }) {
  const rounded = shape === "logo" ? "rounded" : "rounded-full";
  if (option.icon) {
    return <span className="inline-grid h-5 w-5 flex-shrink-0 place-items-center">{option.icon}</span>;
  }
  if (option.avatarUrl) {
    return (
      <img
        src={option.avatarUrl}
        alt=""
        loading="lazy"
        decoding="async"
        className={`h-5 w-5 ${rounded} ${shape === "logo" ? "object-contain" : "object-cover"} flex-shrink-0`}
      />
    );
  }
  return (
    <span className={`inline-grid h-5 w-5 place-items-center ${rounded} bg-ink text-paper text-[10px] font-semibold dark:bg-paper dark:text-ink flex-shrink-0`}>
      {getInitials(option.label)}
    </span>
  );
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Seleziona",
  searchPlaceholder = "Cerca...",
  emptyMessage = "Nessun risultato",
  disabled = false,
  className = "",
  triggerClassName = "",
  menuPlacement = "bottom",
  menuLayer = "local",
  showAvatar = true,
  menuMinWidth,
  avatarShape = "circle",
  onCreateOption,
  createLoading = false,
  createActionLabel = "Crea",
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [portalRect, setPortalRect] = useState<{ top: number; bottom: number; left: number; width: number; placement: "top" | "bottom"; maxHeight: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const selected = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;

    return options.filter((option) => {
      const haystack = `${option.label} ${option.keywords ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [options, query]);

  useEffect(() => {
    if (!open) return;

    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const inContainer = !!containerRef.current?.contains(target);
      const inMenu = !!menuRef.current?.contains(target);
      if (!inContainer && !inMenu) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setCreateError(null);
      return;
    }

    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  const createCandidate = query.trim();
  const hasExactMatch = useMemo(() => {
    const candidate = createCandidate.toLowerCase();
    if (!candidate) return false;
    return options.some((option) => option.label.trim().toLowerCase() === candidate);
  }, [createCandidate, options]);
  const canCreateInline = !!onCreateOption && createCandidate.length > 0 && !hasExactMatch;

  const handleCreate = async () => {
    if (!onCreateOption || !canCreateInline || createLoading) return;
    setCreateError(null);
    try {
      await onCreateOption(createCandidate);
      setQuery("");
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Errore creazione");
    }
  };

  useEffect(() => {
    if (!open || menuLayer !== "portal") {
      setPortalRect(null);
      return;
    }

    const updateRect = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      // Auto-flip: se sotto non c'è abbastanza spazio (e sopra ce n'è di più) il menu si
      // apre verso l'alto; in ogni caso l'altezza max viene limitata allo spazio disponibile
      // così non finisce mai fuori schermo (viene "accorciato" e resta scrollabile).
      const GAP = 6;
      const MENU_MAX = 320;
      const spaceBelow = window.innerHeight - rect.bottom - GAP;
      const spaceAbove = rect.top - GAP;
      let placement: "top" | "bottom" = menuPlacement;
      if (menuPlacement !== "top" && spaceBelow < 200 && spaceAbove > spaceBelow) placement = "top";
      if (menuPlacement === "top" && spaceAbove < 200 && spaceBelow > spaceAbove) placement = "bottom";
      const avail = Math.max(0, placement === "top" ? spaceAbove : spaceBelow);
      const maxHeight = Math.min(MENU_MAX, avail);
      setPortalRect({ top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width, placement, maxHeight });
    };

    updateRect();
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);
    return () => {
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [open, menuLayer, menuPlacement]);

  const effPlacement = menuLayer === "portal" && portalRect ? portalRect.placement : menuPlacement;
  const menu = (
    <div
      ref={menuRef}
      className={`w-full ${menuLayer === "portal" ? "fixed" : "absolute z-[3100]"} ${effPlacement === "top" ? (menuLayer === "portal" ? "-translate-y-[calc(100%+4px)]" : "bottom-full mb-1") : "mt-1"}`}
      style={
        menuLayer === "portal" && portalRect
          ? {
              // Ancorato al bordo del trigger: sotto il campo (placement bottom,
              // con il piccolo gap dato da mt-1) o sopra (placement top).
              top: effPlacement === "top" ? portalRect.top : portalRect.bottom,
              // Con `menuMinWidth` il menu può essere più largo del trigger: in quel
              // caso lo si riporta dentro lo schermo invece di farlo uscire a destra.
              left: menuMinWidth
                ? Math.max(8, Math.min(portalRect.left, window.innerWidth - menuMinWidth - 8))
                : portalRect.left,
              width: portalRect.width,
              minWidth: menuMinWidth,
              zIndex: SELECT_MENU_Z_INDEX,
            }
          : undefined
      }
    >
      <div
        className={`${effPlacement === "top" ? "dd-pop-up" : "dd-pop"} flex w-full flex-col rounded-md border border-line dark:border-[#2a2a2e] bg-paper dark:bg-[#1c1c20] shadow-lg overflow-hidden`}
        style={menuLayer === "portal" && portalRect ? { maxHeight: portalRect.maxHeight } : undefined}
      >
      <div className="shrink-0 p-2 border-b border-line dark:border-[#2a2a2e]">
        <div className="relative">
          <Icon
            name="search"
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted dark:text-[#9999a0]"
          />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setOpen(false);
              if (event.key === "Enter" && canCreateInline && filtered.length === 0) {
                event.preventDefault();
                void handleCreate();
              }
            }}
            placeholder={searchPlaceholder}
            className="w-full h-8 pl-8 pr-2 rounded-md border border-line dark:border-[#2a2a2e] bg-paper dark:bg-[#131316] text-[12px] text-ink dark:text-[#f4f4f7] outline-none focus:border-ink dark:focus:border-[#f4f4f7]"
          />
        </div>
      </div>

      <div className={`overflow-y-auto p-1 ${menuLayer === "portal" ? "flex-1 min-h-0" : "max-h-56"}`}>
        {filtered.length === 0 && !canCreateInline ? (
          <div className="px-2 py-2 text-[12px] text-muted dark:text-[#9999a0]">{emptyMessage}</div>
        ) : (
          filtered.map((option, i) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                disabled={option.disabled}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                style={{ animationDelay: `${Math.min(i, 12) * 22}ms` }}
                className={`dd-item w-full text-left px-2 py-1.5 rounded text-[12px] transition-colors ${isSelected ? "bg-cream dark:bg-[#24242a] text-ink dark:text-[#f4f4f7]" : "text-ink dark:text-[#f4f4f7] hover:bg-cream dark:hover:bg-[#24242a]"} ${option.disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                role="option"
                aria-selected={isSelected}
              >
                <span className="flex w-full min-w-0 items-center gap-2">
                  {showAvatar ? <OptionAvatar option={option} shape={avatarShape} /> : null}
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {option.trailing ? (
                    <span className="flex-shrink-0 tabular-nums text-[12px] text-muted dark:text-[#9999a0]">
                      {option.trailing}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })
        )}
        {canCreateInline && (
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={createLoading}
            className="dd-item mt-0.5 w-full rounded border border-dashed border-line px-2 py-1.5 text-left text-[12px] font-semibold text-ink transition-colors hover:bg-cream disabled:opacity-50 dark:border-[#2a2a2e] dark:text-[#f4f4f7] dark:hover:bg-[#24242a]"
          >
            <span className="flex items-center gap-2">
              <Icon name="plus" className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="min-w-0 flex-1 truncate">
                {createActionLabel} "{createCandidate}"
              </span>
            </span>
          </button>
        )}
        {createError && (
          <p className="px-2 py-1.5 text-[11.5px] text-danger">{createError}</p>
        )}
      </div>
      </div>
    </div>
  );

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className={`relative w-full min-w-0 rounded-md border px-3 py-2.5 text-sm font-body bg-paper text-ink border-line focus:border-ink focus:outline-none transition-colors duration-150 disabled:opacity-60 disabled:cursor-not-allowed dark:bg-ink-soft dark:text-paper dark:border-line-dark dark:focus:border-paper ${triggerClassName}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={`flex w-full min-w-0 items-center gap-2 pr-6 ${selected ? "text-current" : "text-current/65"}`}>
          {selected && showAvatar ? <OptionAvatar option={selected} shape={avatarShape} /> : null}
          <span className="min-w-0 flex-1 truncate text-left">{selected?.label ?? placeholder}</span>
        </span>
        <Icon
          name="chevron-down"
          className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-current/65 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (menuLayer === "portal" ? createPortal(menu, document.body) : menu)}
    </div>
  );
}
