import type { ReactNode } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Wrapper tipizzato per un segmented switch. Rende il markup standard
// `wl-segmented`; l'animazione della "pillola" attiva è globale e di default
// (vedi hooks/useSegmentedPills), quindi qui non serve alcuna logica di motion.
// ─────────────────────────────────────────────────────────────────────────────

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  title?: string;
}

interface SegmentedSwitchProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  className?: string;
  buttonClassName?: string;
  ariaLabel?: string;
}

export function SegmentedSwitch<T extends string>({
  value,
  onChange,
  options,
  className = "",
  buttonClassName = "",
  ariaLabel,
}: SegmentedSwitchProps<T>) {
  return (
    <div className={`wl-segmented ${className}`.trim()} role="tablist" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`wl-segmented-btn ${o.value === value ? "is-active" : ""} ${buttonClassName}`.trim()}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
