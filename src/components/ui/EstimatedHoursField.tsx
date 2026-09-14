import { useEffect, useState } from "react";
import { FieldHelpPopover, type FieldHelpPopoverProps } from "./FieldHelpPopover";

const STEP_MIN = 15;

function toMinutes(value: number | string | null | undefined): number {
  const n = typeof value === "string" ? parseFloat(value) : value ?? NaN;
  if (n == null || Number.isNaN(n)) return 0;
  return Math.max(0, Math.round(n * 60));
}

function toInt(raw: string): number {
  const n = parseInt(raw || "0", 10);
  return Number.isNaN(n) ? 0 : Math.max(0, n);
}

interface EstimatedHoursFieldProps {
  /** Valore in ore decimali (string o number) oppure null/"" se non impostato. */
  value: number | string | null | undefined;
  /** Restituisce le ore decimali (es. 2.75) o null se azzerato. */
  onChange: (hours: number | null) => void;
  label?: string;
  help?: FieldHelpPopoverProps;
}

/**
 * Campo "Ore stimate": un unico campo unito con stepper −/+ (passo 15 min), come prima,
 * ma con ore e minuti come segmenti numerici distinti e le unità "h" e "m" come adornment
 * FISSI non editabili (non si possono cancellare). Minuti limitati a 0–59. Mantiene il dato
 * in ore decimali per compatibilità API.
 */
export function EstimatedHoursField({ value, onChange, label = "Ore stimate", help }: EstimatedHoursFieldProps) {
  const total = toMinutes(value);
  const [hours, setHours] = useState(String(Math.floor(total / 60)));
  const [mins, setMins] = useState(String(total % 60));

  // Risincronizza dai valori esterni (es. reset del form) SOLO se divergono da quelli
  // digitati: evita di sovrascrivere l'input mentre l'utente scrive.
  useEffect(() => {
    const t = toMinutes(value);
    const localT = toInt(hours) * 60 + Math.min(59, toInt(mins));
    if (t === localT) return;
    setHours(String(Math.floor(t / 60)));
    setMins(String(t % 60));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const currentTotal = toInt(hours) * 60 + Math.min(59, toInt(mins));

  const emit = (hStr: string, mStr: string) => {
    const t = toInt(hStr) * 60 + Math.min(59, toInt(mStr));
    onChange(t === 0 ? null : Number((t / 60).toFixed(4)));
  };

  const nudge = (deltaMin: number) => {
    const base = Math.round(currentTotal / STEP_MIN) * STEP_MIN;
    const next = Math.max(0, base + deltaMin);
    const h = String(Math.floor(next / 60));
    const m = String(next % 60);
    setHours(h);
    setMins(m);
    emit(h, m);
  };

  const btn =
    "w-11 shrink-0 grid place-items-center text-lg font-bold leading-none text-ink transition-colors hover:bg-brand-magenta hover:text-white disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-ink dark:text-paper";
  const seg =
    "w-8 min-w-0 bg-transparent py-2.5 text-center text-sm font-semibold text-ink outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none dark:text-paper";
  const unit = "select-none text-sm font-semibold text-muted dark:text-muted-dark";

  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">{label}</label>
        {help && <FieldHelpPopover {...help} />}
      </span>
      <div className="flex w-fit max-w-full items-stretch overflow-hidden rounded-md border border-line bg-paper transition-colors focus-within:border-ink dark:border-line-dark dark:bg-[#1c1c20] dark:focus-within:border-paper">
        <button type="button" aria-label="Riduci" className={btn} onClick={() => nudge(-STEP_MIN)} disabled={currentTotal <= 0}>
          −
        </button>
        <div className="flex min-w-0 items-center justify-center gap-0.5 border-x border-line px-2 dark:border-line-dark">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            aria-label="Ore"
            value={hours}
            onChange={(e) => { setHours(e.target.value); emit(e.target.value, mins); }}
            // Sfondo trasparente forzato: dentro le modali una regola CSS colora gli input
            // (#131413) creando un mismatch con lo sfondo del contenitore sotto "h"/"m".
            style={{ backgroundColor: "transparent" }}
            className={`${seg} text-right`}
          />
          <span className={unit}>h</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={59}
            step={5}
            aria-label="Minuti"
            value={mins}
            onChange={(e) => { setMins(e.target.value); emit(hours, e.target.value); }}
            style={{ backgroundColor: "transparent" }}
            className={`${seg} text-left`}
          />
          <span className={unit}>m</span>
        </div>
        <button type="button" aria-label="Aumenta" className={btn} onClick={() => nudge(STEP_MIN)}>
          +
        </button>
      </div>
    </div>
  );
}
