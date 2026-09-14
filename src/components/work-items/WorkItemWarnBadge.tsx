import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../ui/Icon";

export type WarnTone = "grave" | "late" | "nondeg";
export type WarnItem = { key: string; label: string; tone: WarnTone };

/**
 * Accorpa i badge di avviso (ritardo, ritardo grave, scadenza non derogabile…) dentro
 * l'icona a triangolo: mostra `+N` quando sono più di uno e, in hover/focus (o tap),
 * apre un popover con l'elenco completo. Stesso pattern di WorkAreaChips ("+N" aree).
 *
 * Il popover vive in un PORTAL, con posizione fissa calcolata sul triangolo. In
 * `position: absolute` dentro la card veniva ritagliato da `.lv-col-body`, che scorre
 * (`overflow-y: auto`): sulla prima card della colonna sporgeva verso l'alto e spariva
 * sotto l'intestazione. Un `z-index` non poteva bastare — il ritaglio da overflow non
 * è una questione di sovrapposizione.
 */
export function WorkItemWarnBadge({ warnings }: { warnings: WarnItem[] }) {
  const [open, setOpen] = useState(false);
  const chipRef = useRef<HTMLSpanElement | null>(null);
  const popRef = useRef<HTMLSpanElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Posizione calcolata DOPO il layout, così si conoscono le misure reali del
  // popover: sopra il triangolo se c'è spazio, altrimenti sotto.
  useLayoutEffect(() => {
    // Nessun azzeramento alla chiusura: `useLayoutEffect` gira PRIMA del paint, quindi
    // alla riapertura la posizione viene ricalcolata senza che quella vecchia si veda.
    if (!open) return;
    const chip = chipRef.current;
    const pop = popRef.current;
    if (!chip || !pop) return;
    const c = chip.getBoundingClientRect();
    const p = pop.getBoundingClientRect();
    const spazioSopra = c.top;
    const sopra = spazioSopra > p.height + 12;
    const top = sopra ? c.top - p.height - 8 : c.bottom + 8;
    // Non uscire dal bordo destro della finestra.
    const left = Math.min(Math.max(8, c.right - p.width), window.innerWidth - p.width - 8);
    setPos({ top, left });
  }, [open, warnings.length]);

  if (warnings.length === 0) return null;

  // Colore del triangolo = avviso più severo presente.
  const worst: WarnTone = warnings.some((w) => w.tone === "grave")
    ? "grave"
    : warnings.some((w) => w.tone === "late")
      ? "late"
      : "nondeg";

  return (
    <span
      ref={chipRef}
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
      {open &&
        createPortal(
          <span
            ref={popRef}
            className="lv-warn-pop lv-scope"
            role="tooltip"
            // Finché la posizione non è calcolata resta invisibile: senza questo si
            // vedrebbe un lampo in alto a sinistra prima di andare al suo posto.
            style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? "visible" : "hidden" }}
          >
            {warnings.map((w) => (
              <span key={w.key} className={`lv-badge ${w.tone}`}>
                {w.label}
              </span>
            ))}
          </span>,
          document.body,
        )}
    </span>
  );
}
