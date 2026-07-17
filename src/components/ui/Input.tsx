import React, { forwardRef, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";
import { FieldHelpPopover, type FieldHelpPopoverProps } from "./FieldHelpPopover";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  labelIcon?: React.ReactNode;
  error?: string;
  hint?: string;
  help?: FieldHelpPopoverProps;
  /**
   * Se valorizzato su un input `type="date"`, mostra un bottone interno "Posticipa"
   * con un popover per spostare la data avanti (1 settimana / 1-4 mesi). Riceve la
   * nuova data in formato ISO "YYYY-MM-DD" (posticipa dalla data corrente, o da oggi
   * se il campo è vuoto).
   */
  onPostpone?: (nextIsoDate: string) => void;
}

const POSTPONE_OPTIONS: { label: string; days?: number; months?: number }[] = [
  { label: "1 settimana", days: 7 },
  { label: "1 mese", months: 1 },
  { label: "2 mesi", months: 2 },
  { label: "3 mesi", months: 3 },
  { label: "4 mesi", months: 4 },
];

function baseDateFromValue(value: unknown): Date {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date();
}

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function postponeIso(value: unknown, option: { days?: number; months?: number }): string {
  const base = baseDateFromValue(value);
  if (option.days != null) {
    base.setDate(base.getDate() + option.days);
    return toIsoDate(base);
  }
  // Aggiunta di mesi con clamp del giorno (es. 31 gen + 1 mese -> 28/29 feb).
  const day = base.getDate();
  base.setDate(1);
  base.setMonth(base.getMonth() + (option.months ?? 0));
  const lastDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  base.setDate(Math.min(day, lastDay));
  return toIsoDate(base);
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, labelIcon, error, hint, help, id, className = "", onPostpone, ...rest }, ref) => {
    const internalRef = useRef<HTMLInputElement | null>(null);
    const [postponeOpen, setPostponeOpen] = useState(false);
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
    const inputType = rest.type ?? "text";
    const isDateLike = inputType === "date" || inputType === "time" || inputType === "datetime-local" || inputType === "month";
    const isNumber = inputType === "number";
    const showPostpone = inputType === "date" && typeof onPostpone === "function";
    // Il menu "Posticipa" è renderizzato in un portal a posizione fissa (ancorato al
    // bottone): così non entra nel flusso del contenitore e NON provoca overflow/scroll
    // del modale o delle sezioni interne.
    const postponeBtnRef = useRef<HTMLButtonElement>(null);
    const [postponeMenu, setPostponeMenu] = useState<{ top: number; right: number } | null>(null);

    const measurePostpone = () => {
      const el = postponeBtnRef.current;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) };
    };
    const togglePostpone = () => {
      if (postponeOpen) {
        setPostponeOpen(false);
        return;
      }
      setPostponeMenu(measurePostpone());
      setPostponeOpen(true);
    };
    const applyPostpone = (option: { days?: number; months?: number }) => {
      onPostpone?.(postponeIso(rest.value, option));
      setPostponeOpen(false);
    };

    // Riposiziona il menu su scroll/resize mentre è aperto (segue il bottone).
    useEffect(() => {
      if (!postponeOpen) return;
      const update = () => setPostponeMenu(measurePostpone());
      window.addEventListener("scroll", update, true);
      window.addEventListener("resize", update);
      return () => {
        window.removeEventListener("scroll", update, true);
        window.removeEventListener("resize", update);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [postponeOpen]);

    const openNativePicker = () => {
      // Usa il ref interno (non getElementById): così apre anche quando l'input non ha
      // label/id, es. il campo scadenza inline della scheda Revisione.
      const element = resolveInput();
      if (!element || element.disabled) return;
      if (typeof element.showPicker === "function") {
        try {
          element.showPicker();
        } catch {
          // Fallback to focus only when showPicker is not available or blocked.
        }
      }
      element.focus();
    };

    const resolveInput = () => {
      if (internalRef.current) return internalRef.current;
      return (document.getElementById(inputId ?? "") as HTMLInputElement | null) ?? null;
    };

    const parseNumericAttr = (value: string | number | undefined | null): number | null => {
      if (value == null || value === "") return null;
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    };

    const inferStep = (): number => {
      if (rest.step === "any") return 1;
      const step = parseNumericAttr(rest.step as string | number | undefined);
      return step != null && step > 0 ? step : 1;
    };

    const applyNumberDelta = (delta: number) => {
      const element = resolveInput();
      if (!element || element.disabled || element.readOnly) return;

      const step = inferStep();
      const min = parseNumericAttr(rest.min as string | number | undefined);
      const max = parseNumericAttr(rest.max as string | number | undefined);
      const current = element.value.trim() === "" ? (min ?? 0) : Number(element.value);
      const safeCurrent = Number.isFinite(current) ? current : (min ?? 0);
      let nextValue = safeCurrent + delta * step;

      if (min != null) nextValue = Math.max(min, nextValue);
      if (max != null) nextValue = Math.min(max, nextValue);

      const stepText = typeof rest.step === "number" ? String(rest.step) : (typeof rest.step === "string" ? rest.step : "1");
      const decimals = stepText.includes(".") ? stepText.split(".")[1].length : 0;
      const normalized = decimals > 0 ? nextValue.toFixed(decimals) : String(Math.round(nextValue));

      element.value = normalized;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      element.focus();
    };

    const setRefs = (node: HTMLInputElement | null) => {
      internalRef.current = node;
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    };

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <span className="flex items-center gap-1.5">
            {labelIcon && (
              <span className="inline-flex h-5 w-5 flex-none items-center justify-center rounded border border-line bg-cream text-muted dark:border-line-dark dark:bg-[#0e0f0e] dark:text-muted-dark">
                {labelIcon}
              </span>
            )}
            <label
              htmlFor={inputId}
              className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark"
            >
              {label}
            </label>
            {help && <FieldHelpPopover {...help} />}
          </span>
        )}
        <div className="relative">
          <input
            ref={setRefs}
            id={inputId}
            className={`w-full rounded-md border px-3 py-2.5 text-sm font-body bg-paper text-ink placeholder:text-muted
              border-line focus:border-ink focus:outline-none transition-colors duration-150
              dark:bg-ink-soft dark:text-paper dark:border-line-dark dark:placeholder:text-muted-dark dark:focus:border-paper
              ${isNumber ? "pr-20 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" : ""}
              ${isDateLike ? `${showPostpone ? "pr-16" : "pr-10"} [color-scheme:light] dark:[color-scheme:dark] [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer` : ""}
              ${error ? "border-danger focus:border-danger" : ""}
              ${className}`}
            {...rest}
          />
          {isDateLike && (
            <button
              type="button"
              onClick={openNativePicker}
              disabled={rest.disabled}
              className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded-md border border-line/80 bg-cream text-muted transition-colors hover:text-ink hover:border-ink/40 disabled:cursor-not-allowed disabled:opacity-50 dark:border-line-dark/80 dark:bg-[#222228] dark:text-muted-dark dark:hover:text-paper dark:hover:border-paper/40"
              aria-label={inputType === "time" ? "Apri selettore orario" : "Apri calendario"}
            >
              <Icon name={inputType === "time" ? "clock" : "calendar"} className="h-3.5 w-3.5" />
            </button>
          )}
          {showPostpone && (
            <>
              <button
                ref={postponeBtnRef}
                type="button"
                onClick={togglePostpone}
                disabled={rest.disabled}
                className="absolute right-9 top-1/2 -translate-y-1/2 inline-flex h-6 w-7 items-center justify-center rounded-md border border-line/80 bg-cream text-muted transition-colors hover:text-ink hover:border-ink/40 disabled:cursor-not-allowed disabled:opacity-50 dark:border-line-dark/80 dark:bg-[#222228] dark:text-muted-dark dark:hover:text-paper dark:hover:border-paper/40"
                aria-haspopup="menu"
                aria-expanded={postponeOpen}
                title="Posticipa la data"
              >
                <Icon name="chevron-right" className="h-3 w-3" />
                <Icon name="chevron-right" className="-ml-1.5 h-3 w-3" />
              </button>
              {postponeOpen && postponeMenu && createPortal(
                <>
                  <div
                    className="fixed inset-0 z-[9998] cursor-default"
                    onClick={() => setPostponeOpen(false)}
                  />
                  <div
                    role="menu"
                    className="fixed z-[9999] flex min-w-[9rem] flex-col rounded-lg border border-line bg-paper p-1 shadow-lg dark:border-line-dark dark:bg-[#26251f]"
                    style={{ top: postponeMenu.top, right: postponeMenu.right }}
                  >
                    <span className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
                      Posticipa di
                    </span>
                    {POSTPONE_OPTIONS.map((option) => (
                      <button
                        key={option.label}
                        type="button"
                        role="menuitem"
                        className="rounded-md px-2 py-1.5 text-left text-xs font-medium text-ink transition-colors hover:bg-cream dark:text-paper dark:hover:bg-[#1c1c20]"
                        onClick={() => applyPostpone(option)}
                      >
                        +{option.label}
                      </button>
                    ))}
                  </div>
                </>,
                document.body,
              )}
            </>
          )}
          {isNumber && (
            <div className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex items-center gap-1">
              <button
                type="button"
                onClick={() => applyNumberDelta(-1)}
                disabled={rest.disabled || rest.readOnly}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-line/80 bg-cream text-muted text-sm font-bold leading-none transition-colors hover:text-ink hover:border-ink/40 disabled:cursor-not-allowed disabled:opacity-50 dark:border-line-dark/80 dark:bg-[#222228] dark:text-muted-dark dark:hover:text-paper dark:hover:border-paper/40"
                aria-label="Diminuisci valore"
              >
                -
              </button>
              <button
                type="button"
                onClick={() => applyNumberDelta(1)}
                disabled={rest.disabled || rest.readOnly}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-line/80 bg-cream text-muted text-sm font-bold leading-none transition-colors hover:text-ink hover:border-ink/40 disabled:cursor-not-allowed disabled:opacity-50 dark:border-line-dark/80 dark:bg-[#222228] dark:text-muted-dark dark:hover:text-paper dark:hover:border-paper/40"
                aria-label="Aumenta valore"
              >
                +
              </button>
            </div>
          )}
        </div>
        {error && (
          <p className="text-xs text-danger">{error}</p>
        )}
        {hint && !error && (
          <p className="text-xs text-muted dark:text-muted-dark">{hint}</p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
