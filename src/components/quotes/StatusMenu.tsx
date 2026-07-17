import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../ui/Icon";
import { getAllowedTransitions, STATUS_ACTIONS, type Quote, type QuoteStatus } from "../../api/quotes";

/** Menu a tendina per il cambio stato. Il pannello è renderizzato in un PORTALE
 * con posizione fixed, così non viene ritagliato dall'overflow della tabella
 * (prima "usciva sotto" gli altri elementi). Usato da Preventivi e Richieste. */
export function StatusMenu({
  quote,
  isAdmin,
  onTransition,
  transitioning,
}: {
  quote: Quote;
  isAdmin: boolean;
  onTransition: (id: number, status: QuoteStatus) => void;
  transitioning: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const allowed = getAllowedTransitions(quote.status, isAdmin);
  if (allowed.length === 0) return null;

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (open) {
      setOpen(false);
      return;
    }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, left: Math.max(8, r.right - 190) });
    setOpen(true);
  };

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        disabled={transitioning}
        className="cl-rowbtn"
        title="Cambia stato"
      >
        <Icon name="chevron-down" className="w-3.5 h-3.5" />
      </button>
      {open &&
        pos &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[4000]" onClick={(e) => { e.stopPropagation(); setOpen(false); }} />
            <div
              className="fixed z-[4010] min-w-[190px] overflow-hidden rounded-lg border border-line bg-paper shadow-lg dark:border-[#2a2a2e] dark:bg-[#1c1c20]"
              style={{ top: pos.top, left: pos.left }}
            >
              {allowed.map((s) => (
                <button
                  key={s}
                  onClick={(e) => { e.stopPropagation(); onTransition(quote.id, s); setOpen(false); }}
                  className="w-full px-4 py-2.5 text-left text-[13px] font-body text-ink transition-colors hover:bg-cream dark:text-[#f4f4f7] dark:hover:bg-[#2a2a2e]"
                >
                  {STATUS_ACTIONS[s]}
                </button>
              ))}
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
