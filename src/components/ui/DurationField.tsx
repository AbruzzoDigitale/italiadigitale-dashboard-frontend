import { useEffect, useId, useState } from "react";
import { FieldHelpPopover, type FieldHelpPopoverProps } from "./FieldHelpPopover";

/**
 * Durata: un numero e la sua unità, dentro un solo campo.
 *
 * Verso l'esterno parla sempre in **giorni**, così chi lo usa non deve fare
 * conversioni: `value` e `onChange` sono giorni interi. All'interno sceglie da
 * solo l'unità più leggibile — 90 giorni si mostra come "3 mesi", 14 come
 * "2 settimane".
 *
 * Il selettore dell'unità è un `select` nativo: sta dentro il campo e non può
 * essere tagliato dal corpo di un modal, a differenza di un menu disegnato.
 *
 * Mese = 30 giorni, anno = 365: approssimazione voluta. Serve a dire "ogni tre
 * mesi", non a calcolare una scadenza contrattuale.
 */

export type DurationUnit = "days" | "weeks" | "months" | "years";

const FATTORI: Record<DurationUnit, number> = {
  days: 1,
  weeks: 7,
  months: 30,
  years: 365,
};

const ETICHETTE: Record<DurationUnit, string> = {
  days: "giorni",
  weeks: "settimane",
  months: "mesi",
  years: "anni",
};

/** L'unità più grande in cui i giorni entrano esatti. */
function scomponi(giorni: number): { amount: number; unit: DurationUnit } {
  for (const unit of ["years", "months", "weeks"] as DurationUnit[]) {
    const f = FATTORI[unit];
    if (giorni >= f && giorni % f === 0) return { amount: giorni / f, unit };
  }
  return { amount: giorni, unit: "days" };
}

interface DurationFieldProps {
  /** Giorni. `null` = non impostato, `0` = mai. */
  value: number | null;
  onChange: (giorni: number | null) => void;
  label?: string;
  placeholder?: string;
  hint?: string;
  help?: FieldHelpPopoverProps;
  disabled?: boolean;
  className?: string;
}

export function DurationField({
  value,
  onChange,
  label,
  placeholder,
  hint,
  help,
  disabled = false,
  className = "",
}: DurationFieldProps) {
  const id = useId();
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState<DurationUnit>("days");

  // L'unità si ricalcola solo quando il valore cambia da fuori: mentre si
  // digita non deve saltare da "giorni" a "settimane" sotto le dita.
  useEffect(() => {
    if (value == null) {
      setAmount("");
      return;
    }
    const d = scomponi(value);
    setAmount(String(d.amount));
    setUnit(d.unit);
  }, [value]);

  function emetti(nuovoAmount: string, nuovaUnit: DurationUnit) {
    const testo = nuovoAmount.trim();
    if (testo === "") {
      onChange(null);
      return;
    }
    const n = Number(testo);
    if (!Number.isFinite(n) || n < 0) return;
    onChange(Math.round(n) * FATTORI[nuovaUnit]);
  }

  return (
    <div className={className}>
      {label && (
        <span className="mb-1.5 flex items-center gap-1.5">
          <label
            htmlFor={id}
            className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark"
          >
            {label}
          </label>
          {help && <FieldHelpPopover {...help} />}
        </span>
      )}

      <div
        className={`flex w-full items-stretch rounded-md border border-line bg-paper transition-colors duration-150
          focus-within:border-ink dark:border-line-dark dark:bg-ink-soft dark:focus-within:border-paper
          ${disabled ? "opacity-60" : ""}`}
      >
        <input
          id={id}
          type="number"
          min={0}
          inputMode="numeric"
          disabled={disabled}
          placeholder={placeholder}
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            emetti(e.target.value, unit);
          }}
          className="w-full bg-transparent px-3 py-2.5 text-sm font-body text-ink placeholder:text-muted focus:outline-none
            dark:text-paper dark:placeholder:text-muted-dark
            [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <select
          aria-label="Unità di tempo"
          disabled={disabled}
          value={unit}
          onChange={(e) => {
            const u = e.target.value as DurationUnit;
            setUnit(u);
            emetti(amount, u);
          }}
          className="shrink-0 rounded-r-md border-l border-line bg-cream px-2 text-xs text-muted focus:outline-none
            dark:border-line-dark dark:bg-[#0e0f0e] dark:text-muted-dark"
        >
          {(Object.keys(ETICHETTE) as DurationUnit[]).map((u) => (
            <option key={u} value={u}>
              {ETICHETTE[u]}
            </option>
          ))}
        </select>
      </div>

      {hint && <p className="mt-1 text-xs text-muted dark:text-muted-dark">{hint}</p>}
    </div>
  );
}
