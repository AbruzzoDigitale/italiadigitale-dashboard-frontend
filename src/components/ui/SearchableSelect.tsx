import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";

export type SearchableSelectOption = {
  value: string;
  label: string;
  keywords?: string;
  disabled?: boolean;
  avatarUrl?: string | null;
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
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [portalRect, setPortalRect] = useState<{ top: number; left: number; width: number } | null>(null);
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
      return;
    }

    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open || menuLayer !== "portal") {
      setPortalRect(null);
      return;
    }

    const updateRect = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPortalRect({ top: rect.top, left: rect.left, width: rect.width });
    };

    updateRect();
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);
    return () => {
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [open, menuLayer]);

  const menu = (
    <div
      ref={menuRef}
      className={`w-full ${menuLayer === "portal" ? "fixed" : "absolute z-[3100]"} ${menuPlacement === "top" ? (menuLayer === "portal" ? "-translate-y-[calc(100%+4px)]" : "bottom-full mb-1") : "mt-1"}`}
      style={menuLayer === "portal" && portalRect ? { top: portalRect.top, left: portalRect.left, width: portalRect.width, zIndex: SELECT_MENU_Z_INDEX } : undefined}
    >
      <div className={`${menuPlacement === "top" ? "dd-pop-up" : "dd-pop"} w-full rounded-md border border-line dark:border-[#2a2a2e] bg-paper dark:bg-[#1c1c20] shadow-lg overflow-hidden`}>
      <div className="p-2 border-b border-line dark:border-[#2a2a2e]">
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
            }}
            placeholder={searchPlaceholder}
            className="w-full h-8 pl-8 pr-2 rounded-md border border-line dark:border-[#2a2a2e] bg-paper dark:bg-[#131316] text-[12px] text-ink dark:text-[#f4f4f7] outline-none focus:border-ink dark:focus:border-[#f4f4f7]"
          />
        </div>
      </div>

      <div className="max-h-56 overflow-y-auto p-1">
        {filtered.length === 0 ? (
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
                  {showAvatar ? (
                    option.avatarUrl ? (
                      <img
                        src={option.avatarUrl}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="h-5 w-5 rounded-full object-cover flex-shrink-0"
                      />
                    ) : (
                      <span className="inline-grid h-5 w-5 place-items-center rounded-full bg-ink text-paper text-[10px] font-semibold dark:bg-paper dark:text-ink flex-shrink-0">
                        {getInitials(option.label)}
                      </span>
                    )
                  ) : null}
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
          {selected ? (
            selected.avatarUrl ? (
              <img
                src={selected.avatarUrl}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-5 w-5 rounded-full object-cover flex-shrink-0"
              />
            ) : (
              <span className="inline-grid h-5 w-5 place-items-center rounded-full bg-ink text-paper text-[10px] font-semibold dark:bg-paper dark:text-ink flex-shrink-0">
                {getInitials(selected.label)}
              </span>
            )
          ) : null}
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
