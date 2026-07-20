import type { ReactNode } from "react";
import { FieldHelpPopover, type FieldHelpPopoverProps } from "./FieldHelpPopover";

/**
 * Etichetta di campo in stile prototipo "Modifica preventivo" (mp-flabel):
 * chip con icona + testo maiuscolo + eventuale asterisco obbligatorio + (?) help.
 * Da usare per i campi che non passano dal componente Input (Textarea, select, ecc.).
 */
export function FieldLabel({
  icon,
  children,
  required = false,
  help,
  htmlFor,
}: {
  icon?: ReactNode;
  children: ReactNode;
  required?: boolean;
  help?: FieldHelpPopoverProps;
  htmlFor?: string;
}) {
  return (
    <span className="flex items-center gap-1.5">
      {icon && (
        <span className="inline-flex h-5 w-5 flex-none items-center justify-center rounded border border-line bg-cream text-muted dark:border-line-dark dark:bg-[#0e0f0e] dark:text-muted-dark">
          {icon}
        </span>
      )}
      <label htmlFor={htmlFor} className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
        {children}
        {required && <span className="ml-0.5 text-brand-magenta">*</span>}
      </label>
      {help && <FieldHelpPopover {...help} />}
    </span>
  );
}
