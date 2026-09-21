import { useEffect, useId, useState } from "react";
import { FieldHelpPopover, type FieldHelpPopoverProps } from "./FieldHelpPopover";
import { SearchableSelect } from "./SearchableSelect";

/**
 * Durata: un numero e la sua unità, dentro un solo campo.
 *
 * Verso l'esterno parla sempre in **giorni**, così chi lo usa non deve fare
 * conversioni: `value` e `onChange` sono giorni interi. All'interno sceglie da
 * solo l'unità più leggibile — 90 giorni si mostrano come "3 mesi", 14 come
 * "2 settimane".
 *
 * L'unità usa `SearchableSelect`, lo stesso dropdown del resto del gestionale.
 * Il bordo lo disegna **solo il contenitore**: al trigger vengono tolti bordo,
 * sfondo e angoli, altrimenti si vedrebbe un riquadro dentro l'altro. Fra numero
 * e unità resta una riga divisoria sola.
 *
 * Dentro un Modal il menu va in portale da sé (vedi `ui/modalLayer.tsx`), quindi
 * non allunga il modal.
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

const OPZIONI = (Object.keys(ETICHETTE) as DurationUnit[]).map((u) => ({
  value: u,
  label: ETICHETTE[u],
}));

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

      {/* Unico bordo del campo: il trigger del select al suo interno è spoglio. */}
      <div
        className={`flex w-full items-stretch overflow-hidden rounded-md border border-line bg-paper
          transition-colors duration-150 focus-within:border-ink
          dark:border-line-dark dark:bg-ink-soft dark:focus-within:border-paper
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
          className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm font-body text-ink placeholder:text-muted focus:outline-none
            dark:text-paper dark:placeholder:text-muted-dark
            [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <SearchableSelect
          value={unit}
          onChange={(v) => {
            const u = v as DurationUnit;
            setUnit(u);
            emetti(amount, u);
          }}
          options={OPZIONI}
          disabled={disabled}
          showAvatar={false}
          menuMinWidth={150}
          // Sempre in portale, non solo dentro i modal: il contenitore è
          // `overflow-hidden` per via degli angoli, e taglierebbe il menu.
          menuLayer="portal"
          className="w-[7.5rem] shrink-0 border-l border-line dark:border-line-dark"
          // `!` necessario: senza, `border` e `border-0` finirebbero a litigare
          // per ordine nel CSS generato invece che per specificità.
          triggerClassName="!border-0 !bg-transparent !rounded-none !py-2.5 !pl-3 !pr-8 !text-sm"
        />
      </div>

      {hint && <p className="mt-1 text-xs text-muted dark:text-muted-dark">{hint}</p>}
    </div>
  );
}
