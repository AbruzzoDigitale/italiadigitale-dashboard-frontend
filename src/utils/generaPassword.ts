/**
 * Generatore di password, usato dal bottone dentro i campi di creazione.
 *
 * Tre scelte che vale la pena spiegare:
 *
 * - **`crypto.getRandomValues` e non `Math.random`**, che è prevedibile e non
 *   va usato per niente che protegga qualcosa.
 * - **Nessun carattere ambiguo** (I, l, 1, O, 0): una password si finisce
 *   sempre per doverla dettare o ricopiare una volta, e lì si perde più tempo
 *   che entropia.
 * - **Almeno uno per famiglia**, perché molti sistemi lo pretendono e scoprirlo
 *   dopo aver incollato è la via più corta per tornare a «Password123».
 *
 * Con l'alfabeto qui sotto, 20 caratteri valgono circa 120 bit.
 */

const MAIUSCOLE = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const MINUSCOLE = "abcdefghijkmnopqrstuvwxyz";
const CIFRE = "23456789";
// Simboli che non creano problemi in una riga di comando, in un URL o in un CSV.
const SIMBOLI = "!@#$%*+-=?";

const ALFABETO = MAIUSCOLE + MINUSCOLE + CIFRE + SIMBOLI;

/** Intero uniforme in [0, max): il resto di `%` da solo sbilancerebbe i primi valori. */
function casuale(max: number): number {
  const limite = Math.floor(0xffffffff / max) * max;
  const buf = new Uint32Array(1);
  let n = 0;
  do {
    crypto.getRandomValues(buf);
    n = buf[0];
  } while (n >= limite);
  return n % max;
}

function mescola(caratteri: string[]): string[] {
  // Fisher-Yates: senza, i caratteri garantiti resterebbero sempre in testa.
  for (let i = caratteri.length - 1; i > 0; i--) {
    const j = casuale(i + 1);
    [caratteri[i], caratteri[j]] = [caratteri[j], caratteri[i]];
  }
  return caratteri;
}

export function generaPassword(lunghezza = 20): string {
  const minima = 8;
  const n = Math.max(minima, lunghezza);

  const caratteri = [
    MAIUSCOLE[casuale(MAIUSCOLE.length)],
    MINUSCOLE[casuale(MINUSCOLE.length)],
    CIFRE[casuale(CIFRE.length)],
    SIMBOLI[casuale(SIMBOLI.length)],
  ];
  while (caratteri.length < n) {
    caratteri.push(ALFABETO[casuale(ALFABETO.length)]);
  }
  return mescola(caratteri).join("");
}
