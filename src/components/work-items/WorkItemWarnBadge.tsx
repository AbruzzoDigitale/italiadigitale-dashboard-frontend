import { useState } from "react";
import { Icon } from "../ui/Icon";

export type WarnTone = "grave" | "late" | "nondeg";
export type WarnItem = { key: string; label: string; tone: WarnTone };

/**
 * Accorpa i badge di avviso (ritardo, ritardo grave, scadenza non derogabile…) dentro
 * l'icona a triangolo: mostra `+N` quando sono più di uno e, in hover/focus (o tap),
 * apre un popover con l'elenco completo. Stesso pattern di WorkAreaChips ("+N" aree).
 */
export function WorkItemWarnBadge({ warnings }: { warnings: WarnItem[] }) {
  const [open, setOpen] = useState(false);
  if (warnings.length === 0) return null;

  // Colore del triangolo = avviso più severo presente.
  const worst: WarnTone = warnings.some((w) => w.tone === "grave")
    ? "grave"
    : warnings.some((w) => w.tone === "late")
      ? "late"
      : "nondeg";

  return (
    <span
      className={`lv-warnchip ${worst}`}
      tabIndex={0}
      role="button"
      aria-label={`Avvisi: ${warnings.map((w) => w.label).join(", ")}`}
      title={warnings.map((w) => w.label).join(" · ")}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onClick={(e) => {
        // Non aprire il dettaglio della card; su touch il click fa da toggle.
        e.stopPropagation();
        setOpen((v) => !v);
      }}
    >
      <Icon name="alert-triangle" className="h-3.5 w-3.5" />
      {warnings.length > 1 && <span className="lv-warnchip-n">+{warnings.length}</span>}
      {open && (
        <span className="lv-warn-pop" role="tooltip">
          {warnings.map((w) => (
            <span key={w.key} className={`lv-badge ${w.tone}`}>
              {w.label}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
