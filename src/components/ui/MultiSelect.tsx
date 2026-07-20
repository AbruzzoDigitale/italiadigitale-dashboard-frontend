import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";
import { FieldHelpPopover, type FieldHelpPopoverProps } from "./FieldHelpPopover";

export interface MultiSelectOption {
  id: number;
  label: string;
  color?: string | null;
  avatarUrl?: string | null;
}

interface MultiSelectProps {
  label?: string;
  help?: FieldHelpPopoverProps;
  value: number[];
  onChange: (value: number[]) => void;
  options: MultiSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  onCreateOption?: (name: string) => Promise<void> | void;
  onCreateClick?: () => void;
  createLoading?: boolean;
  createActionLabel?: string;
}

export function MultiSelect({
  label,
  help,
  value,
  onChange,
  options,
  placeholder = "Seleziona...",
  searchPlaceholder = "Cerca...",
  onCreateOption,
  onCreateClick,
  createLoading = false,
  createActionLabel = "Crea",
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [menuRect, setMenuRect] = useState<{
    top: number;
    left: number;
    width: number;
    placement: "top" | "bottom";
    maxHeight: number;
  } | null>(null);

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const selectedSet = useMemo(() => new Set(value), [value]);
  const selectedOptions = useMemo(
    () => options.filter((opt) => selectedSet.has(opt.id)),
    [options, selectedSet]
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((opt) => opt.label.toLowerCase().includes(q));
  }, [options, search]);

  const createCandidate = search.trim();
  const hasExactMatch = useMemo(() => {
    const candidate = createCandidate.toLowerCase();
    if (!candidate) return false;
    return options.some((opt) => opt.label.trim().toLowerCase() === candidate);
  }, [createCandidate, options]);
  const canCreateInline = !!onCreateOption && createCandidate.length > 0 && !hasExactMatch;
  const hasCreateAction = !!onCreateClick || !!onCreateOption;

  useEffect(() => {
    if (!open) {
      setSearch("");
      setCreateError(null);
      setMenuRect(null);
      return;
    }
    const updateRect = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const viewportPadding = 8;
      const preferredMaxMenuHeight = 260;
      const minUsefulMenuHeight = 160;
      const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
      const spaceAbove = rect.top - viewportPadding;
      const placement: "top" | "bottom" =
        spaceBelow < minUsefulMenuHeight && spaceAbove > spaceBelow ? "top" : "bottom";
      const availableSpace = placement === "top" ? spaceAbove : spaceBelow;
      const maxHeight = Math.max(
        minUsefulMenuHeight,
        Math.min(preferredMaxMenuHeight, availableSpace)
      );

      setMenuRect({
        top: placement === "top" ? rect.top - 4 : rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        placement,
        maxHeight,
      });
    };
    updateRect();
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);
    setTimeout(() => searchRef.current?.focus(), 0);
    return () => {
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      const inTrigger = !!triggerRef.current?.contains(target);
      const inMenu = !!menuRef.current?.contains(target);
      if (!inTrigger && !inMenu) setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  const toggle = (id: number) => {
    if (selectedSet.has(id)) {
      onChange(value.filter((v) => v !== id));
    } else {
      onChange([...value, id]);
    }
  };

  const handleCreate = async () => {
    if (!onCreateOption || !canCreateInline || createLoading) return;
    setCreateError(null);
    try {
      await onCreateOption(createCandidate);
      setSearch("");
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Errore creazione");
    }
  };

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <span className="flex items-center">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
            {label}
          </span>
          {help && <FieldHelpPopover {...help} />}
        </span>
      )}

      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-[42px] w-full items-center justify-between gap-2 rounded-md border border-line bg-paper px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-cream focus:border-ink focus:outline-none dark:border-line-dark dark:bg-ink-soft dark:text-paper dark:hover:bg-[#1c1c20] dark:focus:border-paper"
      >
        <span className="flex min-w-0 flex-1 flex-wrap gap-1">
          {selectedOptions.length === 0 ? (
            <span className="text-muted dark:text-muted-dark">{placeholder}</span>
          ) : (
            selectedOptions.map((opt) => (
              <span
                key={opt.id}
                className="inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider"
                style={
                  opt.color
                    ? {
                        backgroundColor: `${opt.color}22`,
                        color: opt.color,
                        border: `1px solid ${opt.color}44`,
                      }
                    : undefined
                }
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(opt.id);
                }}
              >
                {opt.avatarUrl && (
                  <img src={opt.avatarUrl} alt="" className="h-3.5 w-3.5 rounded-full object-cover" />
                )}
                {opt.label}
                <Icon name="x" className="w-2.5 h-2.5 opacity-70" />
              </span>
            ))
          )}
        </span>
        <Icon
          name="chevron-down"
          className={`h-4 w-4 flex-shrink-0 text-muted transition-transform dark:text-muted-dark ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open &&
        menuRect &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-[13000] rounded-md border border-line bg-paper shadow-lg dark:border-line-dark dark:bg-[#1c1c20]"
            style={{
              top: menuRect.top,
              left: menuRect.left,
              width: menuRect.width,
              maxHeight: menuRect.maxHeight,
              transform: menuRect.placement === "top" ? "translateY(-100%)" : undefined,
            }}
          >
            <div className="border-b border-line p-2 dark:border-line-dark">
              <div className="flex items-center gap-2">
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && canCreateInline) {
                      e.preventDefault();
                      void handleCreate();
                    }
                  }}
                  placeholder={searchPlaceholder}
                  className="w-full rounded border border-line bg-paper px-2 py-1.5 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none dark:border-line-dark dark:bg-ink-soft dark:text-paper dark:placeholder:text-muted-dark dark:focus:border-paper"
                />
                {hasCreateAction && (
                  <button
                    type="button"
                    onClick={() => {
                      if (onCreateClick) {
                        setOpen(false);
                        onCreateClick();
                        return;
                      }
                      void handleCreate();
                    }}
                    disabled={onCreateClick ? createLoading : (!canCreateInline || createLoading)}
                    title={onCreateClick ? createActionLabel : (canCreateInline ? `${createActionLabel}: ${createCandidate}` : createActionLabel)}
                    className="inline-flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded border border-line text-ink transition-colors hover:bg-cream disabled:opacity-50 dark:border-line-dark dark:text-paper dark:hover:bg-[#2a2a2e]"
                  >
                    <Icon name="plus" className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {createError && (
                <p className="mt-2 text-xs text-danger">{createError}</p>
              )}
            </div>
            <ul
              className="overflow-y-auto p-1"
              style={{ maxHeight: Math.max(80, menuRect.maxHeight - 64) }}
              role="listbox"
            >
              {filtered.length === 0 ? (
                <li className="px-3 py-2 text-sm text-muted dark:text-muted-dark">Nessun risultato</li>
              ) : (
                filtered.map((opt) => {
                  const checked = selectedSet.has(opt.id);
                  return (
                    <li key={opt.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={checked}
                        onClick={() => toggle(opt.id)}
                        className="flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-sm transition-colors hover:bg-cream dark:hover:bg-[#2a2a2e]"
                      >
                        <span
                          className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors ${
                            checked
                              ? "border-ink bg-ink dark:border-paper dark:bg-paper"
                              : "border-line dark:border-line-dark"
                          }`}
                        >
                          {checked && (
                            <Icon
                              name="check"
                              className="h-2.5 w-2.5 text-paper dark:text-ink"
                            />
                          )}
                        </span>
                        {opt.avatarUrl && (
                          <img
                            src={opt.avatarUrl}
                            alt=""
                            className="h-5 w-5 flex-shrink-0 rounded-full object-cover border border-line dark:border-line-dark"
                          />
                        )}
                        {opt.color && (
                          <span
                            className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                            style={{ backgroundColor: opt.color }}
                          />
                        )}
                        <span className="flex-1 text-left text-ink dark:text-paper">{opt.label}</span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>,
          document.body
        )}
    </div>
  );
}
