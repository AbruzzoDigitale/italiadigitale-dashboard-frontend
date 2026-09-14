import { getPushOpenMode } from "./pushOpenPreference";

// ─────────────────────────────────────────────────────────────────────────────
// Dove aprire la pagina di una notifica: stessa scheda, nuova scheda o "chiedi".
//
// Vale sia per il clic sulla notifica push (arriva dal service worker) sia per
// quello nel centro notifiche: è la stessa domanda, quindi stessa preferenza e
// stesso popup. Quando la scelta è "chiedi" si emette un evento e ci pensa
// PushOpenPrompt (montato nel layout), come per i toast.
// ─────────────────────────────────────────────────────────────────────────────

type Handler = (url: string) => void;

const handlers = new Set<Handler>();

/** Il popup di scelta si iscrive qui (una sola istanza, nel layout). */
export function subscribeOpenChoice(handler: Handler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

/** Apre in una scheda nuova. False se il browser ha bloccato la finestra. */
export function apriNuovaScheda(url: string): boolean {
  return window.open(url, "_blank", "noopener") !== null;
}

/**
 * Porta l'utente sulla pagina della notifica rispettando la sua preferenza.
 * `vaiQui` naviga nella scheda corrente (react-router, senza ricaricare).
 */
export function apriNotifica(url: string, vaiQui: (url: string) => void): void {
  const mode = getPushOpenMode();
  if (mode === "same") {
    vaiQui(url);
    return;
  }
  if (mode === "new") {
    // Se il popup viene bloccato (accade quando non c'è un clic dell'utente
    // dietro, es. messaggio dal service worker) si chiede invece di non fare nulla.
    if (apriNuovaScheda(url)) return;
    handlers.forEach((h) => h(url));
    return;
  }
  handlers.forEach((h) => h(url));
}
