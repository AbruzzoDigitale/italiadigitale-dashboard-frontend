import { useEffect, useState } from "react";
import { Modal } from "../../components/ui/Modal";
import { Icon } from "../../components/ui/Icon";

/**
 * Barre orizzontali sugli stessi record che stanno nelle schede.
 *
 * Il grafico non lo produce il modello e non è un'immagine: è una vista sui dati che
 * lo strumento ha già restituito, letti per nome di campo. Il numero dentro una barra
 * è quindi lo stesso che si legge nella scheda — per costruzione, non per controllo.
 *
 * Scelte di forma, non di gusto:
 * · orizzontale, perché le etichette sono nomi di persone e clienti, e in verticale
 *   andrebbero ruotate o tagliate;
 * · una serie sola, quindi un colore solo e nessuna legenda: il titolo dice cos'è.
 *   Il colore non porta informazione, la lunghezza sì;
 * · il valore scritto accanto a ogni barra, così il dato si legge anche da chi il
 *   colore non lo distingue, o su una stampa in bianco e nero;
 * · niente griglia: resta la linea di riferimento quando c'è una soglia che significa
 *   qualcosa (la capacità al 100%), che è l'unica riga che vale la pena disegnare.
 *
 * I due colori sono verificati contro le superfici vere dell'app, chiara e scura.
 */

export interface GraficoSpec {
  titolo: string;
  categoria: string;
  valore: string;
  unita?: string;
  riferimento?: number | null;
  massimo?: number | null;
}

const MAX_BARRE = 12;
// Nel modale c'è spazio: si mostrano tutte le barre, non le prime dodici.
const MAX_BARRE_ESPANSO = 30;

function formatta(valore: number, unita: string): string {
  if (unita === "€") {
    return valore.toLocaleString("it-IT", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    });
  }
  const arrotondato = Math.round(valore * 10) / 10;
  return `${arrotondato.toLocaleString("it-IT")}${unita ? ` ${unita}` : ""}`;
}

function Barre({
  spec,
  records,
  limite,
  anima,
  altezzaBarra = 18,
  larghezzaEtichetta = "w-24",
}: {
  spec: GraficoSpec;
  records: Record<string, unknown>[];
  limite: number;
  anima?: boolean;
  altezzaBarra?: number;
  larghezzaEtichetta?: string;
}) {
  const [attiva, setAttiva] = useState<number | null>(null);
  // Le barre entrano crescendo. Parte a zero e si apre dopo il montaggio: è l'unico
  // modo perché la transizione CSS abbia un "da" e un "a" da interpolare.
  const [aperte, setAperte] = useState(!anima);
  useEffect(() => {
    if (!anima) return;
    const menoMovimento = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (menoMovimento) {
      setAperte(true);
      return;
    }
    const t = requestAnimationFrame(() => setAperte(true));
    return () => cancelAnimationFrame(t);
  }, [anima]);

  const dati = records
    .map((r) => ({
      etichetta: String(r[spec.categoria] ?? "—"),
      valore: Number(r[spec.valore] ?? 0),
    }))
    .filter((d) => Number.isFinite(d.valore))
    .slice(0, limite);

  const massimoDati = Math.max(...dati.map((d) => d.valore), 0);
  const fondoscala = Math.max(spec.massimo ?? 0, massimoDati, spec.riferimento ?? 0) || 1;
  const unita = spec.unita ?? "";

  return (
    <>
      <div className="space-y-1.5">
        {dati.map((d, i) => {
          const larghezza = Math.max((d.valore / fondoscala) * 100, d.valore > 0 ? 1.5 : 0);
          return (
            <div
              key={`${d.etichetta}-${i}`}
              className="flex items-center gap-2"
              onMouseEnter={() => setAttiva(i)}
              onMouseLeave={() => setAttiva(null)}
            >
              <span
                className={`${larghezzaEtichetta} shrink-0 truncate text-[11px] text-muted dark:text-[#9999a0]`}
                title={d.etichetta}
              >
                {d.etichetta}
              </span>

              <div className="relative flex-1" style={{ height: altezzaBarra }}>
                {spec.riferimento ? (
                  <div
                    className="absolute top-0 bottom-0 w-px bg-line dark:bg-[#3a3a3e]"
                    style={{ left: `${(spec.riferimento / fondoscala) * 100}%` }}
                    aria-hidden
                  />
                ) : null}
                <div
                  className="absolute inset-y-[3px] left-0 rounded-r-[4px] bg-[var(--serie)]"
                  style={{
                    width: aperte ? `${larghezza}%` : "0%",
                    opacity: attiva === null || attiva === i ? 1 : 0.55,
                    transition: `width 620ms cubic-bezier(.2,.8,.2,1) ${i * 45}ms, opacity 150ms`,
                  }}
                />
              </div>

              <span className="w-20 shrink-0 text-right text-[11px] tabular-nums text-ink dark:text-[#f4f4f7]">
                {formatta(d.valore, unita)}
              </span>
            </div>
          );
        })}
      </div>

      {spec.riferimento ? (
        <p className="mt-1.5 text-[10px] text-muted dark:text-[#9999a0]">
          La linea verticale è {formatta(spec.riferimento, unita)}.
        </p>
      ) : null}

      {records.length > dati.length ? (
        <p className="mt-1 text-[10px] text-muted dark:text-[#9999a0]">
          Prime {dati.length} di {records.length}.
        </p>
      ) : null}
    </>
  );
}

export function OracleChart({
  spec,
  records,
}: {
  spec: GraficoSpec;
  records: Record<string, unknown>[];
}) {
  const [espanso, setEspanso] = useState(false);

  // Una barra sola non è un confronto: meglio la scheda, che dice di più.
  if (records.length < 2) return null;

  return (
    <>
      <figure
        className="mt-2 rounded-lg border border-line dark:border-[#2a2a2e] bg-paper dark:bg-[#1c1c20] px-3 py-2.5
                   [--serie:#2a78d6] dark:[--serie:#3987e5]"
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <figcaption className="text-[11px] font-semibold text-ink dark:text-[#f4f4f7]">
            {spec.titolo}
          </figcaption>
          <button
            type="button"
            onClick={() => setEspanso(true)}
            aria-label="Ingrandisci il grafico"
            title="Ingrandisci"
            className="shrink-0 text-muted hover:text-brand-magenta transition-colors"
          >
            <Icon name="maximize" className="w-3.5 h-3.5" />
          </button>
        </div>
        <Barre spec={spec} records={records} limite={MAX_BARRE} />
      </figure>

      <Modal
        open={espanso}
        onClose={() => setEspanso(false)}
        title={spec.titolo}
        size="xl"
        bodyClassName="[--serie:#2a78d6] dark:[--serie:#3987e5]"
      >
        {/* `key` sull'apertura: rimontando, le barre rientrano crescendo ogni volta
            invece di apparire già fatte alla seconda apertura. */}
        <Barre
          key={espanso ? "aperto" : "chiuso"}
          spec={spec}
          records={records}
          limite={MAX_BARRE_ESPANSO}
          anima
          altezzaBarra={26}
          larghezzaEtichetta="w-44"
        />
      </Modal>
    </>
  );
}
