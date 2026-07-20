/**
 * Bus pub/sub minimale per segnali "realtime" provenienti dallo stream SSE delle
 * notifiche (montato una volta in DashboardLayout via useNotifications).
 *
 * Quando lo stream spinge un evento (nuova notifica per l'utente), chiamiamo
 * `emitRealtime()`: i componenti che stanno mostrando dati aggiornabili live
 * (es. il thread commenti della scheda Revisione) si iscrivono con
 * `subscribeRealtime()` e ricaricano i propri dati, senza refresh di pagina.
 */
type RealtimeListener = () => void;

const listeners = new Set<RealtimeListener>();

export function subscribeRealtime(listener: RealtimeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitRealtime(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // un listener che fallisce non deve bloccare gli altri
    }
  }
}
