import { useEffect, useState } from "react";
import { FieldHelpPopover, type FieldHelpPopoverProps } from "./FieldHelpPopover";

const STEP_MIN = 15;

function toMinutes(value: number | string | null | undefined): number {
  const n = typeof value === "string" ? parseFloat(value) : value ?? NaN;
  if (n == null || Number.isNaN(n)) return 0;
  return Math.max(0, Math.round(n * 60));
}

/** Minuti → "Xh Ym" (sempre con entrambe le unità, es. "0h 0m", "2h 30m"). */
function formatHM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m}m`;
}

/** Parser tollerante: "2h 30m", "2h", "30m", "2:30", "2.5" (ore), "150m". Ritorna minuti o null. */
function parseHuman(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(",", ".");
  if (!s) return null;
  const hm = s.match(/^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+)\s*m(?:in)?)?$/);
  if (hm && (hm[1] || hm[2])) {
    return Math.round(parseFloat(hm[1] || "0") * 60) + parseInt(hm[2] || "0", 10);
  }
  const colon = s.match(/^(\d+):([0-5]?\d)$/);
  if (colon) return parseInt(colon[1], 10) * 60 + parseInt(colon[2], 10);
  const num = parseFloat(s);
  if (!Number.isNaN(num)) return Math.round(num * 60);
  return null;
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
 * Campo "Ore stimate" umano: stepper −/+ a passo 15 minuti, con valore mostrato come
 * "Xh Ym" (anche digitabile, es. "2h 30m" / "2.5" / "2:30"). Mantiene il dato in ore
 * decimali per compatibilità API. Componente condiviso: usalo ovunque serva una durata.
 */
export function EstimatedHoursField({ value, onChange, label = "Ore stimate", help }: EstimatedHoursFieldProps) {
  const minutes = toMinutes(value);
  const isEmpty = value == null || value === "";
  const [text, setText] = useState(isEmpty ? "" : formatHM(minutes));

  useEffect(() => {
    setText(value == null || value === "" ? "" : formatHM(toMinutes(value)));
  }, [value]);

  const emitMinutes = (min: number) => {
    const m = Math.max(0, min);
    onChange(m === 0 ? null : Number((m / 60).toFixed(4)));
  };

  const nudge = (deltaMin: number) => {
    const base = Math.round(minutes / STEP_MIN) * STEP_MIN;
    emitMinutes(Math.max(0, base + deltaMin));
  };

  const commit = () => {
    const parsed = parseHuman(text);
    if (parsed == null) {
      onChange(null);
      setText("");
    } else {
      const m = Math.max(0, parsed);
      emitMinutes(m);
      setText(formatHM(m));
    }
  };

  const btn =
    "w-11 shrink-0 grid place-items-center text-lg font-bold leading-none text-ink transition-colors hover:bg-brand-magenta hover:text-white disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-ink dark:text-paper";

  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">{label}</label>
        {help && <FieldHelpPopover {...help} />}
      </span>
      <div className="flex w-full items-stretch overflow-hidden rounded-md border border-line bg-paper dark:border-line-dark dark:bg-[#1c1c20]">
        <button type="button" aria-label="Riduci" className={btn} onClick={() => nudge(-STEP_MIN)} disabled={minutes <= 0}>
          −
        </button>
        <input
          value={text}
          placeholder="0h 0m"
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
          className="min-w-0 flex-1 border-x border-line bg-transparent px-2 py-2 text-center text-sm font-semibold text-ink outline-none placeholder:font-normal placeholder:text-muted/60 dark:border-line-dark dark:text-paper dark:placeholder:text-muted-dark/60"
        />
        <button type="button" aria-label="Aumenta" className={btn} onClick={() => nudge(STEP_MIN)}>
          +
        </button>
      </div>
    </div>
  );
}
