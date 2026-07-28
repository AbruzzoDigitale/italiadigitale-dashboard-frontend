// Mini event-bus per i toast di notifica in-app (stesso schema di realtimeBus):
// useNotifications emette all'arrivo di un evento SSE con scheda attiva,
// NotificationToastLayer (montato nel layout) ascolta e mostra il toast.

export interface NotificationToastPayload {
  title: string;
  body: string;
}

export interface NotificationToastItem extends NotificationToastPayload {
  key: number;
}

type Handler = (toast: NotificationToastItem) => void;

let seq = 0;
const handlers = new Set<Handler>();

export function emitNotificationToast(payload: NotificationToastPayload): void {
  seq += 1;
  const item: NotificationToastItem = { ...payload, key: seq };
  handlers.forEach((h) => h(item));
}

export function subscribeNotificationToast(handler: Handler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}
