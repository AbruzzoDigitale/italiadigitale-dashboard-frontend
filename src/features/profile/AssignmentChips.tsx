import { useEffect, useRef, useState } from "react";
import type { AssignmentItem } from "../../api/users";
import { useTheme } from "../../context/ThemeContext";
import { chipStyle } from "../../utils/chipColor";

// Ruoli, aree e clienti assegnati, nella colonna del profilo sotto le aziende.
// Sono chip come quelli che si vedono sulle lavorazioni e sui clienti — stesso
// colore, stessa forma — perché la stessa area deve avere lo stesso aspetto
// ovunque compaia.
//
// Quando le voci sono tante non si allunga la colonna: la riga scorre in
// orizzontale e le eccedenze finiscono dietro un "+N" che le mostra tutte.

const VISIBILI = 4;

export function AssignmentChips({
  etichetta,
  voci,
  vuoto,
}: {
  etichetta: string;
  voci: AssignmentItem[];
  vuoto: string;
}) {
  const [aperto, setAperto] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Un popover che resta aperto dopo aver cliccato altrove dà l'idea di essere
  // rotto: si chiude al primo clic fuori e con Esc.
  useEffect(() => {
    if (!aperto) return;
    const fuori = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setAperto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAperto(false);
    document.addEventListener("mousedown", fuori);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fuori);
      document.removeEventListener("keydown", esc);
    };
  }, [aperto]);

  const mostrate = voci.slice(0, VISIBILI);
  const nascoste = voci.slice(VISIBILI);

  return (
    <div className="mt-3">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
        {etichetta}
      </p>

      {voci.length === 0 ? (
        <p className="text-[11px] text-muted dark:text-[#9999a0]">{vuoto}</p>
      ) : (
        <div ref={box} className="relative">
          <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {mostrate.map((voce) => (
              <Chip key={voce.id} voce={voce} />
            ))}
            {nascoste.length > 0 && (
              <button
                type="button"
                onClick={() => setAperto((v) => !v)}
                className="shrink-0 rounded-pill border border-line bg-cream px-2 py-[3px] text-[11px] font-semibold text-muted transition-colors hover:text-ink dark:border-[#2a2a2e] dark:bg-[#1c1c20] dark:text-[#9999a0] dark:hover:text-white"
                title={nascoste.map((v) => v.name).join(", ")}
              >
                +{nascoste.length}
              </button>
            )}
          </div>

          {aperto && nascoste.length > 0 && (
            <div className="absolute right-0 z-20 mt-1 max-h-52 w-56 overflow-y-auto rounded-md border border-line bg-paper p-2 shadow-2 dark:border-[#2a2a2e] dark:bg-[#131316]">
              <div className="flex flex-wrap gap-1.5">
                {voci.map((voce) => (
                  <Chip key={voce.id} voce={voce} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Chip({ voce }: { voce: AssignmentItem }) {
  const { theme } = useTheme();
  return (
    <span
      className="shrink-0 whitespace-nowrap rounded-pill border border-line bg-cream px-2.5 py-[3px] text-[11px] font-medium dark:border-[#2a2a2e] dark:bg-[#1c1c20]"
      style={chipStyle(voce.color, theme === "dark")}
    >
      {voce.name}
    </span>
  );
}
