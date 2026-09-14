/* Service worker della dashboard: SOLO Web Push (nessuna cache/fetch handler:
   la dashboard resta servita "live" da rete). Le notifiche arrivano dal push
   service del browser anche a scheda chiusa, in background o a schermo intero. */

// Chiave pubblica VAPID (pubblica per definizione: sicura da includere qui).
// Serve al gestore `pushsubscriptionchange` per ricreare l'iscrizione da solo.
const VAPID_PUBLIC_KEY =
  "BHguj7jY_dx782n7dfR5rEvOAmywzN42mJ6-p65HaWZ8iQ98uM9fMHJ6vVAjl1J0pMCrF48WQuN1p7zvFky2mWM"

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i)
  return out
}

self.addEventListener("install", () => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim())
})

// Chrome/iOS possono RUOTARE o scartare la PushSubscription: senza gestire questo
// evento l'iscrizione sparisce e "le notifiche si disattivano da sole". La
// ricreiamo subito; il client la ri-registra sul backend al prossimo avvio.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) })
      .catch(() => {})
  )
})

// Notifica in arrivo dal backend. Se la dashboard è aperta E a fuoco, il banner
// di sistema viene saltato: ci pensa il toast in-app (con l'aeroplanino).
self.addEventListener("push", (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (e) {
    data = { title: "Italia Digitale", body: event.data ? event.data.text() : "" }
  }
  const title = data.title || "Italia Digitale"
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag || undefined,
    data: { url: data.url || "/" },
  }
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
      const isFocused = clients.some((c) => c.focused && c.visibilityState === "visible")
      if (isFocused) return
      await self.registration.showNotification(title, options)
    })()
  )
})

// Tap sulla notifica: porta in primo piano la dashboard sulla pagina giusta.
//
// Con una scheda gia' aperta NON si naviga d'ufficio: navigare avrebbe buttato
// via quello che l'utente aveva sotto mano. Si porta in primo piano e si passa
// l'indirizzo alla pagina, che decide secondo la preferenza dell'utente (stessa
// scheda, nuova scheda, oppure chiedi). Se nessuna scheda e' aperta non c'e'
// scelta da fare: si apre una finestra nuova.
self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || "/"
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.focus()
          if ("postMessage" in client) {
            client.postMessage({ type: "push-open", url })
            return undefined
          }
          // Scheda che non sa ricevere messaggi (versione vecchia dell'app):
          // meglio portarla sulla pagina che lasciare il clic senza effetto.
          if ("navigate" in client) client.navigate(url).catch(() => {})
          return undefined
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
      return undefined
    })
  )
})
