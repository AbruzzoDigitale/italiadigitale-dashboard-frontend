import { authFetch, API_BASE } from "./auth";

// ─────────────────────────────────────────────────────────────────────────────
// Web Push (VAPID) della dashboard: iscrizione del browser al push service.
// Le notifiche arrivano dal sistema anche a scheda chiusa/in background.
// Vedi app/api/v1/endpoints/push.py e public/sw.js.
// ─────────────────────────────────────────────────────────────────────────────

const BASE = `${API_BASE}/api/v1/push`;

export async function getVapidPublicKeyApi(): Promise<string> {
  const res = await authFetch(`${BASE}/vapid-public-key`);
  if (!res.ok) throw new Error("Impossibile recuperare la chiave push");
  const body = (await res.json()) as { public_key: string };
  return body.public_key || "";
}

export async function savePushSubscriptionApi(subscription: PushSubscription): Promise<void> {
  const json = subscription.toJSON();
  const res = await authFetch(`${BASE}/subscription`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: json.keys,
      user_agent: navigator.userAgent,
    }),
  });
  if (!res.ok) throw new Error("Registrazione push non riuscita");
}

export async function deletePushSubscriptionApi(endpoint: string): Promise<void> {
  await authFetch(`${BASE}/subscription`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
}

/** Crea una notifica di prova lato backend: verifica END-TO-END della consegna push. */
export async function sendPushTestApi(): Promise<void> {
  const res = await authFetch(`${BASE}/test`, { method: "POST" });
  if (!res.ok) throw new Error("Invio della prova non riuscito");
}
