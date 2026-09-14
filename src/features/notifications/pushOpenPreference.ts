// ─────────────────────────────────────────────────────────────────────────────
// Come aprire la pagina quando si clicca una notifica push (desktop).
//
// Prima la scheda già aperta veniva NAVIGATA sulla pagina della notifica: se
// stavi lavorando su altro, perdevi quello che avevi sotto mano.
//
// La preferenza sta nel DB insieme alle altre notifiche (`push_open_mode`), così
// ti segue su ogni computer. Qui se ne tiene una COPIA in localStorage per un
// motivo pratico: il clic sulla notifica arriva dal service worker e va gestito
// subito, senza aspettare la chiamata al server. Il DB resta la fonte: la copia
// viene riallineata a ogni caricamento e a ogni salvataggio delle preferenze.
// ─────────────────────────────────────────────────────────────────────────────

export type PushOpenMode = "ask" | "same" | "new";

const CHIAVE = "push_open_mode";

export const PUSH_OPEN_LABEL: Record<PushOpenMode, string> = {
  ask: "Chiedimelo ogni volta",
  same: "Apri in questa scheda",
  new: "Apri in una nuova scheda",
};

export function getPushOpenMode(): PushOpenMode {
  try {
    const v = localStorage.getItem(CHIAVE);
    return v === "same" || v === "new" ? v : "ask";
  } catch {
    return "ask"; // storage negato (finestra privata): si chiede e basta
  }
}

/** Riallinea la copia locale al valore appena letto/salvato sul server. */
export function cachePushOpenMode(mode: PushOpenMode): void {
  setPushOpenMode(mode);
}

export function setPushOpenMode(mode: PushOpenMode): void {
  try {
    localStorage.setItem(CHIAVE, mode);
  } catch {
    /* preferenza non memorizzabile: pazienza, resta valida per questa sessione */
  }
}
