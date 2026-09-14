import { useState } from "react";
import type { CSSProperties } from "react";
import type { WorkArea } from "../../api/workAreas";

const normColor = (c: string | null | undefined) =>
  c ? (c.startsWith("#") ? c : `#${c}`) : null;

type WorkAreaChipsProps = {
  areas: WorkArea[];
  /** Quante aree mostrare come chip prima di accorpare il resto in "+N". Default 1. */
  max?: number;
};

/**
 * Chip aree in stile `.lv-area`: mostra le prime `max` aree e accorpa le restanti in
 * un chip "+N" che, in hover/focus (o tap), apre un popover con l'elenco completo.
 * Usato nelle card Lavorazioni (WorkItemCard) e nella board Situazione clienti (WorkItemBoardCard).
 */
export function WorkAreaChips({ areas, max = 1 }: WorkAreaChipsProps) {
  const [open, setOpen] = useState(false);
  if (areas.length === 0) return null;

  const shown = areas.slice(0, max);
  const rest = areas.slice(max);

  return (
    <>
      {shown.map((area) => (
        <span
          key={area.id}
          className="lv-area"
          style={{ "--area": normColor(area.color) ?? "#8c8d87" } as CSSProperties}
          title={area.name}
        >
          <i />
          {area.name}
        </span>
      ))}
      {rest.length > 0 && (
        <span
          className="lv-area lv-area-more"
          tabIndex={0}
          role="button"
          aria-label={`Altre ${rest.length} aree: ${rest.map((a) => a.name).join(", ")}`}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onClick={(e) => {
            // Non aprire il dettaglio della card interagendo col chip; su touch fa da toggle.
            e.stopPropagation();
            setOpen((v) => !v);
          }}
        >
          +{rest.length}
          {open && (
            <span className="lv-area-pop" role="tooltip">
              {rest.map((area) => (
                <span
                  key={area.id}
                  className="lv-area"
                  style={{ "--area": normColor(area.color) ?? "#8c8d87" } as CSSProperties}
                >
                  <i />
                  {area.name}
                </span>
              ))}
            </span>
          )}
        </span>
      )}
    </>
  );
}
