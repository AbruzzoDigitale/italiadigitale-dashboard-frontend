import { useNavigate } from "react-router-dom";
import type { OraclePayload } from "../../api/oracle";

/**
 * Il testo della risposta, con i riferimenti `[#task-601]` risolti in nome e link.
 *
 * Il modello scrive un id; il nome lo mette l'interfaccia, prendendolo dal record che
 * lo strumento ha restituito. È la stessa regola di tutto il resto: il dato leggibile
 * non passa dal modello. Un id nudo non dice niente a chi legge, e chiedere al modello
 * di ricordarsi di accompagnarlo funziona finché non se ne dimentica.
 *
 * Un riferimento che non corrisponde a nessun record resta visibile ma barrato: è una
 * citazione inventata, e va vista dove sta — dentro la frase — non solo nell'avviso
 * in fondo.
 */

const RIFERIMENTO = /\[#([A-Za-z0-9_-]{1,64})\]/g;

interface Voce {
  etichetta: string;
  vaiA: string | null;
}

/** Nome e destinazione di ogni record mostrato, per tipo. */
export function indicizzaRecord(payloads: OraclePayload[]): Map<string, Voce> {
  const indice = new Map<string, Voce>();
  for (const p of payloads) {
    for (const r of p.records ?? []) {
      const id = typeof r.id === "string" ? r.id : null;
      if (!id) continue;
      switch (p.tipo) {
        case "task":
          indice.set(id, {
            etichetta: String(r.titolo ?? id),
            vaiA: `/work-items?task=${r.task_id}`,
          });
          break;
        case "cliente":
          indice.set(id, {
            // Con due clienti omonimi l'azienda è l'unica cosa che li distingue.
            etichetta: [r.nome, r.azienda].filter(Boolean).join(" · "),
            vaiA: `/clients/${r.cliente_id}`,
          });
          break;
        case "contratto":
          indice.set(id, {
            etichetta: String(r.titolo ?? id),
            vaiA: `/contracts-pipeline?contract=${r.contratto_id}`,
          });
          break;
        case "sito":
          indice.set(id, { etichetta: String(r.nome ?? id), vaiA: `/siti-web?sito=${r.sito_id}` });
          break;
        case "carico":
        case "persona":
          indice.set(id, { etichetta: String(r.nome ?? id), vaiA: null });
          break;
        case "fatturazione":
          indice.set(id, { etichetta: String(r.titolo ?? id), vaiA: null });
          break;
        default:
          break;
      }
    }
  }
  return indice;
}

export function OracleTesto({
  testo,
  indice,
}: {
  testo: string;
  indice: Map<string, Voce>;
}) {
  const navigate = useNavigate();
  const pezzi: React.ReactNode[] = [];
  let ultimo = 0;
  let n = 0;

  /**
   * Il nome è già scritto appena prima del riferimento?
   *
   * Il modello ha la regola di accompagnare ogni id col nome, e quando lo fa
   * ristamparlo in un chip lo raddoppierebbe. Quando invece l'id sta da solo il chip
   * è l'unica cosa che lo rende leggibile. Si guarda indietro di poco e si decide.
   */
  const nomeGiaScritto = (fine: number, etichetta: string) => {
    const primaParte = etichetta.split(" · ")[0].trim();
    if (primaParte.length < 3) return false;
    const coda = testo.slice(Math.max(0, fine - primaParte.length - 24), fine).toLowerCase();
    return coda.includes(primaParte.toLowerCase().slice(0, 28));
  };

  // `matchAll` su una regex globale: la posizione serve a ricucire il testo attorno.
  for (const m of testo.matchAll(RIFERIMENTO)) {
    const inizio = m.index ?? 0;
    if (inizio > ultimo) pezzi.push(testo.slice(ultimo, inizio));
    ultimo = inizio + m[0].length;

    const id = m[1];
    const voce = indice.get(id);
    n += 1;

    if (!voce) {
      pezzi.push(
        <span
          key={`x-${n}`}
          title="Questo riferimento non corrisponde a nessun dato restituito"
          className="line-through decoration-danger/70 text-danger/80"
        >
          {m[0]}
        </span>
      );
      continue;
    }

    const ridondante = nomeGiaScritto(inizio, voce.etichetta);
    const contenuto = ridondante ? "↗" : voce.etichetta;
    const classi = ridondante
      ? "inline-block px-1 text-[11px] align-baseline"
      : "inline rounded px-1 -mx-0.5 bg-cream dark:bg-[#2a2a2e] text-ink dark:text-[#f4f4f7] align-baseline";

    pezzi.push(
      voce.vaiA ? (
        <button
          key={`r-${n}`}
          type="button"
          onClick={() => navigate(voce.vaiA!)}
          title={voce.etichetta}
          aria-label={`Apri ${voce.etichetta}`}
          className={`${classi} text-left hover:text-brand-magenta transition-colors ${
            ridondante ? "text-muted dark:text-[#9999a0]" : ""
          }`}
        >
          {contenuto}
        </button>
      ) : ridondante ? null : (
        <span key={`r-${n}`} className={classi} title={voce.etichetta}>
          {voce.etichetta}
        </span>
      )
    );
  }
  if (ultimo < testo.length) pezzi.push(testo.slice(ultimo));

  return <>{pezzi}</>;
}
