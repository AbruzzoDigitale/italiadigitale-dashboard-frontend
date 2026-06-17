import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";

interface ColorHexFieldProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}

function normalizeHex(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("#") ? trimmed.toUpperCase() : `#${trimmed.toUpperCase()}`;
}

function isValidHex(value: string) {
  return /^#[0-9A-F]{6}$/.test(value.toUpperCase());
}

function getContrastTextColor(hex: string) {
  const value = hex.replace("#", "");
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#0A0A0A" : "#F4F4F7";
}

const PRESET_COLORS = [
  "#0A0A0A",
  "#2B1342",
  "#4A1D6E",
  "#C41284",
  "#E91E8A",
  "#F97316",
  "#FCD43C",
  "#16A34A",
  "#0EA5E9",
  "#2563EB",
  "#7C3AED",
  "#64748B",
];

export function ColorHexField({
  label = "Colore",
  value,
  onChange,
  hint,
}: ColorHexFieldProps) {
  const [open, setOpen] = useState(false);
  const [draftHex, setDraftHex] = useState("");
  const [menuRect, setMenuRect] = useState<{ top: number; left: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const normalized = useMemo(() => normalizeHex(value), [value]);
  const pickerValue = isValidHex(normalized) ? normalized : "#0A0A0A";
  const overlayTextColor = getContrastTextColor(pickerValue);

  useEffect(() => {
    if (!open) return;
    setDraftHex(normalized || pickerValue);
  }, [open, normalized, pickerValue]);

  useEffect(() => {
    if (!open) {
      setMenuRect(null);
      return;
    }

    const updateRect = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuRect({ top: rect.bottom + 6, left: rect.left });
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

    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const inContainer = !!containerRef.current?.contains(target);
      const inMenu = !!menuRef.current?.contains(target);
      if (!inContainer && !inMenu) {
        setOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const applyHex = (rawValue: string) => {
    const candidate = normalizeHex(rawValue);
    if (!isValidHex(candidate)) return;
    onChange(candidate);
    setDraftHex(candidate);
  };

  return (
    <div ref={containerRef} className="flex flex-col gap-1">
      <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
        {label}
      </label>

      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="h-[42px] w-full rounded-md border border-line p-1.5 transition-colors hover:bg-cream focus:border-ink focus:outline-none dark:border-line-dark dark:hover:bg-[#1c1c20] dark:focus:border-paper"
        aria-label="Apri palette colori"
        aria-expanded={open}
      >
        <span
          className="flex h-full w-full items-center justify-center rounded-sm border border-black/10 font-mono text-[11px] font-semibold tracking-wide"
          style={{ backgroundColor: pickerValue, color: overlayTextColor }}
        >
          {pickerValue}
        </span>
      </button>

      {open &&
        menuRect &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-[2000] w-[240px] rounded-md border border-line bg-paper p-3 shadow-lg dark:border-[#2a2a2e] dark:bg-[#1c1c20]"
            style={{ top: menuRect.top, left: menuRect.left }}
          >
            <div className="mb-3">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                Codice HEX
              </p>
              <input
                value={draftHex}
                onChange={(event) => {
                  const next = event.target.value.toUpperCase();
                  setDraftHex(next);
                  const candidate = normalizeHex(next);
                  if (isValidHex(candidate)) {
                    onChange(candidate);
                  }
                }}
                onBlur={(event) => applyHex(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    applyHex((event.target as HTMLInputElement).value);
                    setOpen(false);
                  }
                }}
                placeholder="#F97316"
                className="h-[38px] w-full rounded-md border border-line bg-paper px-3 text-sm font-mono text-ink outline-none transition-colors focus:border-ink dark:border-line-dark dark:bg-ink-soft dark:text-paper dark:focus:border-paper"
              />
            </div>

            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
              Palette
            </p>
            <div className="grid grid-cols-6 gap-2">
              {PRESET_COLORS.map((color) => {
                const selected = pickerValue === color;
                return (
                  <button
                    key={color}
                    type="button"
                    onClick={() => {
                      onChange(color);
                      setOpen(false);
                    }}
                    className={`h-7 w-7 rounded-md border transition-transform hover:scale-105 ${selected ? "border-ink dark:border-paper" : "border-black/10 dark:border-white/15"}`}
                    style={{ backgroundColor: color }}
                    aria-label={`Seleziona ${color}`}
                    title={color}
                  />
                );
              })}
            </div>
          </div>,
          document.body
        )}

      {hint && <p className="text-xs text-muted dark:text-muted-dark">{hint}</p>}
    </div>
  );
}