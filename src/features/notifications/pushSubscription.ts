import { getVapidPublicKeyApi, savePushSubscriptionApi } from "../../api/push";

// ─────────────────────────────────────────────────────────────────────────────
// Iscrizione Web Push della dashboard (service worker /sw.js).
// Quando è attiva, le notifiche desktop le mostra il SISTEMA via push service
// (anche a scheda chiusa/in background/full screen) e il vecchio canale
// `new Notification()` in pagina viene disattivato per evitare doppioni.
// ─────────────────────────────────────────────────────────────────────────────

let subscriptionActive = false;

/** True se l'iscrizione push via service worker è attiva in questa sessione. */
export function isPushSubscriptionActive(): boolean {
  return subscriptionActive;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Registra il service worker e l'iscrizione push (idempotente).
 * No-op silenzioso se: browser senza supporto, permesso non concesso,
 * VAPID non configurato sul backend.
 */
export async function ensurePushSubscription(): Promise<boolean> {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return false;

    const registration = await navigator.serviceWorker.register("/sw.js");

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      const publicKey = await getVapidPublicKeyApi();
      if (!publicKey) return false;
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
    }

    // Ri-registra sempre sul backend: è un upsert e copre le rotazioni
    // dell'endpoint fatte dal browser (pushsubscriptionchange).
    await savePushSubscriptionApi(subscription);
    subscriptionActive = true;
    return true;
  } catch {
    subscriptionActive = false;
    return false;
  }
}
