import { useState } from "react";

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

export function OracleChart({
  spec,
  records,
}: {
  spec: GraficoSpec;
  records: Record<string, unknown>[];
}) {
  const [attiva, setAttiva] = useState<number | null>(null);

  const dati = records
    .map((r) => ({
      etichetta: String(r[spec.categoria] ?? "—"),
      valore: Number(r[spec.valore] ?? 0),
    }))
    .filter((d) => Number.isFinite(d.valore))
    .slice(0, MAX_BARRE);

  // Una barra sola non è un confronto: meglio la scheda, che dice di più.
  if (dati.length < 2) return null;

  const massimoDati = Math.max(...dati.map((d) => d.valore), 0);
  const fondoscala = Math.max(spec.massimo ?? 0, massimoDati, spec.riferimento ?? 0) || 1;
  const unita = spec.unita ?? "";

  return (
    <figure
      className="mt-2 rounded-lg border border-line dark:border-[#2a2a2e] bg-paper dark:bg-[#1c1c20] px-3 py-2.5
                 [--serie:#2a78d6] dark:[--serie:#3987e5]"
    >
      <figcaption className="text-[11px] font-semibold text-ink dark:text-[#f4f4f7] mb-2">
        {spec.titolo}
      </figcaption>

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
                className="w-24 shrink-0 truncate text-[11px] text-muted dark:text-[#9999a0]"
                title={d.etichetta}
              >
                {d.etichetta}
              </span>

              <div className="relative flex-1 h-[18px]">
                {spec.riferimento ? (
                  <div
                    className="absolute top-0 bottom-0 w-px bg-line dark:bg-[#3a3a3e]"
                    style={{ left: `${(spec.riferimento / fondoscala) * 100}%` }}
                    aria-hidden
                  />
                ) : null}
                <div
                  className="absolute inset-y-[3px] left-0 rounded-r-[4px] bg-[var(--serie)] transition-[width]"
                  style={{
                    width: `${larghezza}%`,
                    opacity: attiva === null || attiva === i ? 1 : 0.55,
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
    </figure>
  );
}
