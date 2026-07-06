import React, { forwardRef, useRef } from "react";
import { Icon } from "./Icon";
import { FieldHelpPopover, type FieldHelpPopoverProps } from "./FieldHelpPopover";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  labelIcon?: React.ReactNode;
  error?: string;
  hint?: string;
  help?: FieldHelpPopoverProps;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, labelIcon, error, hint, help, id, className = "", ...rest }, ref) => {
    const internalRef = useRef<HTMLInputElement | null>(null);
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
    const inputType = rest.type ?? "text";
    const isDateLike = inputType === "date" || inputType === "time" || inputType === "datetime-local";
    const isNumber = inputType === "number";

    const openNativePicker = () => {
      const element = document.getElementById(inputId ?? "") as HTMLInputElement | null;
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
              ${isDateLike ? "pr-10 [color-scheme:light] dark:[color-scheme:dark] [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer" : ""}
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
