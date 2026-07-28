import { FieldHelpPopover, type FieldHelpPopoverProps } from "./FieldHelpPopover";
import { formatDurationHuman } from "../../utils/duration";

const MIN = 0;
const MAX = 3;
const STEP = 0.1;

/** Arrotonda a 1 decimale, evitando artefatti float dello slider (es. 1.3000000004). */
function roundWeight(w: number): number {
  return Math.round(w * 10) / 10;
}

function parseWeight(value: number | string | null | undefined): number {
  const n = typeof value === "string" ? parseFloat(value) : value ?? NaN;
  if (n == null || Number.isNaN(n)) return 1;
  return roundWeight(Math.min(MAX, Math.max(MIN, n)));
}

/** Etichetta qualitativa del peso, per rendere il numero intuitivo. */
function weightLabel(w: number): string {
  if (w === 0) return "Nessun peso";
  if (w < 0.5) return "Molto leggera";
  if (w < 0.75) return "Leggera";
  if (w <= 1.25) return "Normale";
  if (w <= 1.75) return "Impegnativa";
  if (w <= 2.5) return "Pesante";
  return "Molto pesante";
}

/** Colore del riempimento in base al peso (verde → ambra → rosso), stile barra di carico. */
function weightColor(w: number): string {
  if (w <= 1) return "#97C459";
  if (w <= 1.75) return "#EF9F27";
  return "#E24B4A";
}

/** Minuti → durata umana ("1h30min"). */
function formatHM(min: number): string {
  return formatDurationHuman(min / 60);
}

interface LoadWeightFieldProps {
  /** Fattore peso (0–3) come number o string; default 1 se vuoto. */
  value: number | string | null | undefined;
  onChange: (weight: number) => void;
  /** Ore stimate della task (per calcolare le ore effettive occupate). */
  estimatedHours?: number | string | null;
  /** Se false, la task non impatta il carico (ore effettive = 0). */
  affectsDailyLoad?: boolean;
  label?: string;
  help?: FieldHelpPopoverProps;
}

/**
 * Campo "Peso della task" intuitivo: uno slider 0–3× al posto dell'input decimale, con
 * etichetta qualitativa (leggera/normale/pesante) e ANTEPRIMA delle ore effettive che
 * occuperà nel carico giornaliero (ore stimate × peso). Mantiene il dato come numero per
 * compatibilità API. Componente condiviso.
 */
export function LoadWeightField({
  value,
  onChange,
  estimatedHours,
  affectsDailyLoad = true,
  label = "Peso della task",
  help,
}: LoadWeightFieldProps) {
  const weight = parseWeight(value);
  const color = weightColor(weight);

  const est = typeof estimatedHours === "string" ? parseFloat(estimatedHours) : estimatedHours ?? NaN;
  const hasEst = est != null && !Number.isNaN(est) && est > 0;
  const effMinutes = hasEst ? Math.round(est * weight * 60) : 0;

  const effective = !affectsDailyLoad
    ? "Non impatta il carico giornaliero"
    : !hasEst
      ? "Imposta le ore stimate per vedere l'effettivo"
      : weight === 0
        ? "Non pesa sul carico (0×)"
        : `≈ ${formatHM(effMinutes)} effettive · ${formatHM(Math.round(est * 60))} × ${weight}×`;

  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-center text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
        {label}
        {help && <FieldHelpPopover {...help} />}
      </label>

      <div className="flex items-center gap-3">
        <input
          type="range"
          min={MIN}
          max={MAX}
          step={STEP}
          value={weight}
          onChange={(e) => onChange(roundWeight(parseFloat(e.target.value)))}
          aria-label={label}
          className="w-full cursor-pointer"
          style={{ accentColor: color }}
        />
        <span
          className="min-w-[3.25rem] shrink-0 rounded-md px-2 py-1 text-center text-sm font-bold tabular-nums text-white"
          style={{ backgroundColor: color }}
        >
          {weight}×
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-[11px]">
        <span className="font-semibold" style={{ color }}>{weightLabel(weight)}</span>
        <span className="text-muted dark:text-muted-dark">{effective}</span>
      </div>

      <div className="flex justify-between px-0.5 text-[10px] text-muted/70 dark:text-muted-dark/70">
        <span>0</span>
        <span>½</span>
        <span>1×</span>
        <span>2×</span>
        <span>3×</span>
      </div>
    </div>
  );
}
