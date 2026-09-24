import { OracleSphere } from "./OracleSphere";

/**
 * La schermata di una conversazione nuova: la sfera al centro, i suggerimenti attorno.
 *
 * I suggerimenti **fluttuano, non orbitano**. Un pulsante che si sposta davvero lungo
 * un'orbita è un pulsante che si manca: si punta il mouse e quello se n'è andato. Qui
 * ognuno oscilla di pochi pixel con una fase sua, quindi l'insieme respira come
 * un'orbita ma ogni bersaglio resta dov'è.
 *
 * Sotto una certa larghezza — il dialogo ⌘K — la disposizione in cerchio non ci sta:
 * la sfera si rimpicciolisce e i suggerimenti tornano un elenco che va a capo.
 */

const SUGGERIMENTI = [
  "Cosa ho in programma questa settimana?",
  "Quali task sono in ritardo?",
  "Chi è più carico in questo momento?",
  "Come sta andando il PED di questo mese?",
];

// Angoli scelti a mano, non equidistanti: due in alto e due in basso leggermente
// sfalsati stanno meglio di una croce perfetta, e le etichette non si scontrano.
const POSIZIONI = [
  { angolo: -140, ritardo: "0s" },
  { angolo: -40, ritardo: "1.1s" },
  { angolo: 40, ritardo: "2.3s" },
  { angolo: 140, ritardo: "3.4s" },
];

export function OracleEmptyState({
  compact,
  onSceglie,
}: {
  compact?: boolean;
  onSceglie: (domanda: string) => void;
}) {
  const compatta = (
    <div className={`py-6 text-center ${compact ? "" : "sm:hidden"}`}>
        <div className="flex justify-center">
          <OracleSphere dimensione={92} />
        </div>
        <p className="mt-2 text-[13px] text-muted dark:text-[#9999a0]">
          Chiedi qualcosa sul lavoro dell'azienda.
        </p>
      <div className="mt-3 flex flex-wrap justify-center gap-1.5">
        {SUGGERIMENTI.map((s) => (
          <Pillola key={s} testo={s} onClick={() => onSceglie(s)} />
        ))}
      </div>
    </div>
  );

  if (compact) return compatta;

  return (
    <>
      {compatta}
      <div className="relative mx-auto my-6 hidden h-[380px] w-full max-w-[560px] sm:block">
      <style>{`
        @keyframes oracolo-fluttua {
          0%, 100% { transform: translate(-50%, -50%) translateY(-5px); }
          50%      { transform: translate(-50%, -50%) translateY(5px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .oracolo-pillola { animation: none !important; }
        }
      `}</style>

      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <OracleSphere dimensione={190} />
      </div>

      {SUGGERIMENTI.map((s, i) => {
        const { angolo, ritardo } = POSIZIONI[i];
        const rad = (angolo * Math.PI) / 180;
        return (
          <div
            key={s}
            className="oracolo-pillola absolute"
            style={{
              left: `${50 + Math.cos(rad) * 36}%`,
              top: `${50 + Math.sin(rad) * 34}%`,
              transform: "translate(-50%, -50%)",
              animation: `oracolo-fluttua 6s ease-in-out ${ritardo} infinite`,
            }}
          >
            <Pillola testo={s} onClick={() => onSceglie(s)} />
          </div>
        );
      })}

        <p className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[12px] text-muted dark:text-[#9999a0]">
          Chiedi qualcosa sul lavoro dell'azienda.
        </p>
      </div>
    </>
  );
}

function Pillola({ testo, onClick }: { testo: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="max-w-[210px] rounded-full border border-line dark:border-[#2a2a2e]
                 bg-paper/90 dark:bg-[#1c1c20]/90 backdrop-blur px-3 py-1.5 text-[11px]
                 text-muted dark:text-[#9999a0] shadow-sm
                 hover:border-brand-magenta hover:text-ink dark:hover:text-[#f4f4f7]
                 transition-colors"
    >
      {testo}
    </button>
  );
}
