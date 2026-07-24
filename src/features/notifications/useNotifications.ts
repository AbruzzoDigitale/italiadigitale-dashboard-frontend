import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  archiveNotificationApi,
  getMyNotificationPreferencesApi,
  getMyNotificationsApi,
  markAllNotificationsReadApi,
  markNotificationReadApi,
  markNotificationUnreadApi,
  unarchiveNotificationApi,
  updateMyNotificationPreferencesApi,
} from "../../api/notifications";
import { API_BASE } from "../../api/auth";
import { useBrand } from "../../context/BrandContext";
import { DEFAULT_NOTIFICATION_PREFERENCES, type NotificationPreferences } from "./notificationPreferences";
import type { NotifItem, NotifTabKey } from "./notificationsData";
import { emitRealtime } from "../realtime/realtimeBus";

const TABS: NotifTabKey[] = ["task", "richieste", "contratti", "comunicazioni"];

/**
 * Stato del centro notifiche: carica le notifiche dell'utente dal backend e
 * deriva i contatori non lette per scheda + il totale per il badge della campanella.
 * Le azioni "segna letta" aggiornano ottimisticamente e chiamano l'API.
 */
export function useNotifications(hiddenTabs: NotifTabKey[] = []) {
  const hiddenKey = hiddenTabs.join(",");
  const [items, setItems] = useState<NotifItem[]>([]);
  const [archived, setArchived] = useState<NotifItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Suono: file scelto dall'azienda (brand) + on/off della preferenza utente.
  // In ref per non far riconnettere l'SSE quando cambiano.
  const { brand } = useBrand();
  const userSoundRef = useRef(true);
  // Notifiche push/desktop attive per l'utente + copia completa delle preferenze
  // (per attivarle/persisterle all'ingresso nel gestionale).
  const pushRef = useRef(true);
  const prefsRef = useRef<NotificationPreferences | null>(null);
  const companySoundRef = useRef<{ enabled: boolean; url: string | null }>({ enabled: true, url: null });
  // Singolo elemento Audio precaricato e riusato (più affidabile di new Audio() ogni volta).
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const enabled = brand?.notif_sound_enabled ?? true;
    const url = brand?.notif_sound ?? null;
    companySoundRef.current = { enabled, url };
    if (url) {
      const audio = new Audio(url);
      audio.preload = "auto";
      audio.volume = 0.6;
      audioRef.current = audio;
    } else {
      audioRef.current = null;
    }
  }, [brand?.notif_sound, brand?.notif_sound_enabled]);

  useEffect(() => {
    getMyNotificationPreferencesApi()
      .then((p) => {
        prefsRef.current = p;
        userSoundRef.current = p.sound_enabled;
        pushRef.current = p.push_enabled;
      })
      .catch(() => {
        userSoundRef.current = true;
        pushRef.current = true;
      });
  }, []);

  const playSound = useCallback(() => {
    if (!companySoundRef.current.enabled || !userSoundRef.current) return;
    const audio = audioRef.current;
    if (!audio) return;
    try {
      audio.muted = false;
      audio.volume = 0.6;
      audio.currentTime = 0;
      void audio.play().catch(() => {
        /* autoplay ancora bloccato (nessun gesto utente nella scheda): ignora */
      });
    } catch {
      /* ignora */
    }
  }, []);

  // Notifica desktop di sistema quando la scheda è in background (con suono del SO),
  // altrimenti suono in-app. Rispetta la preferenza utente (silent) per l'audio.
  const showNotification = useCallback((ev?: MessageEvent) => {
    const canDesktop =
      pushRef.current && typeof Notification !== "undefined" && Notification.permission === "granted";
    if (typeof document !== "undefined" && document.hidden && canDesktop) {
      let title = "Italia Digitale";
      let body = "Hai una nuova notifica";
      try {
        if (ev?.data && ev.data !== "{}") {
          const d = JSON.parse(ev.data);
          title = d.title ?? title;
          body = d.body ?? d.message ?? d.text ?? body;
        }
      } catch {
        /* payload non JSON: resta il testo generico */
      }
      try {
        const n = new Notification(title, {
          body,
          tag: "italiadigitale-notif",
          silent: !userSoundRef.current,
        });
        n.onclick = () => {
          window.focus();
          n.close();
        };
      } catch {
        /* Notification non disponibile: ignora */
      }
    } else {
      playSound();
    }
  }, [playSound]);

  // Al primo gesto utente: sblocca l'autoplay audio (prime a volume 0) e chiede, una
  // sola volta, il permesso per le notifiche desktop (prompt di Chrome).
  useEffect(() => {
    const onFirstGesture = () => {
      const audio = audioRef.current;
      if (audio) {
        audio.muted = true;
        audio
          .play()
          .then(() => {
            audio.pause();
            audio.currentTime = 0;
            audio.muted = false;
          })
          .catch(() => {
            audio.muted = false;
          });
      }
      // Entrando nel gestionale: attiva audio + notifiche push. Chiede il permesso
      // desktop e, una volta concesso, salva le preferenze (push + suono attivi) una
      // sola volta per browser, così non sovrascrive eventuali disattivazioni fatte
      // in seguito dall'utente.
      void (async () => {
        if (typeof Notification === "undefined") return;
        let perm = Notification.permission;
        if (perm === "default") {
          try {
            perm = await Notification.requestPermission();
          } catch {
            return;
          }
        }
        if (perm !== "granted") return;
        pushRef.current = true;
        if (typeof localStorage !== "undefined" && !localStorage.getItem("notif_autoactivated")) {
          localStorage.setItem("notif_autoactivated", "1");
          const base = prefsRef.current ?? DEFAULT_NOTIFICATION_PREFERENCES;
          if (!base.push_enabled || !base.sound_enabled) {
            const next: NotificationPreferences = { ...base, push_enabled: true, sound_enabled: true };
            prefsRef.current = next;
            userSoundRef.current = true;
            void updateMyNotificationPreferencesApi(next).catch(() => {});
          }
        }
      })();
      window.removeEventListener("pointerdown", onFirstGesture);
      window.removeEventListener("keydown", onFirstGesture);
    };
    window.addEventListener("pointerdown", onFirstGesture);
    window.addEventListener("keydown", onFirstGesture);
    return () => {
      window.removeEventListener("pointerdown", onFirstGesture);
      window.removeEventListener("keydown", onFirstGesture);
    };
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getMyNotificationsApi();
      setItems(data.items);
    } catch {
      // Silenzioso: in caso di errore il centro resta vuoto.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Realtime via SSE: alla creazione di nuove notifiche il server pusha un evento
  // e noi ricarichiamo. EventSource si riconnette da solo in caso di drop.
  useEffect(() => {
    const token = localStorage.getItem("id_token");
    if (!token) return;
    const es = new EventSource(`${API_BASE}/api/v1/notifications/stream?token=${encodeURIComponent(token)}`);
    es.addEventListener("notification", (ev) => {
      void reload();
      showNotification(ev as MessageEvent);
      // Segnala a chi mostra dati live (es. thread commenti del task aperto) di ricaricarsi.
      emitRealtime();
    });
    return () => es.close();
  }, [reload, showNotification]);

  const counts = useMemo(() => {
    const c: Record<NotifTabKey, number> = { task: 0, richieste: 0, contratti: 0, comunicazioni: 0 };
    for (const it of items) if (it.unread && TABS.includes(it.tab)) c[it.tab] += 1;
    return c;
  }, [items]);

  // Badge campanella: esclude le schede nascoste (es. "contratti" per gli operatori),
  // così non compare un conteggio non raggiungibile.
  const totalUnread = useMemo(
    () => TABS.filter((k) => !hiddenTabs.includes(k)).reduce((s, k) => s + counts[k], 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [counts, hiddenKey],
  );

  const itemsByTab = useCallback((tab: NotifTabKey) => items.filter((i) => i.tab === tab), [items]);

  const markRead = useCallback(async (id: number) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, unread: false } : i)));
    try {
      await markNotificationReadApi(id);
    } catch {
      // ignora: lo stato ottimistico resta; verrà riallineato al prossimo reload.
    }
  }, []);

  const markUnread = useCallback(async (id: number) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, unread: true } : i)));
    try {
      await markNotificationUnreadApi(id);
    } catch {
      // ignora: lo stato ottimistico resta; verrà riallineato al prossimo reload.
    }
  }, []);

  // Archivio: caricato a parte (scheda dedicata), non entra nei conteggi.
  const loadArchived = useCallback(async () => {
    try {
      const data = await getMyNotificationsApi(100, true);
      setArchived(data.items);
    } catch {
      /* silenzioso */
    }
  }, []);

  const archive = useCallback(async (id: number) => {
    // esce dalle schede normali (ottimistico); l'archivio si ricarica quando aperto.
    setItems((prev) => prev.filter((i) => i.id !== id));
    try {
      await archiveNotificationApi(id);
    } catch {
      /* ignora */
    }
  }, []);

  const unarchive = useCallback(async (id: number) => {
    setArchived((prev) => prev.filter((i) => i.id !== id));
    try {
      await unarchiveNotificationApi(id);
      await reload(); // torna tra le notifiche normali
    } catch {
      /* ignora */
    }
  }, [reload]);

  const markAllRead = useCallback(async (tab: NotifTabKey) => {
    setItems((prev) => prev.map((i) => (i.tab === tab ? { ...i, unread: false } : i)));
    try {
      await markAllNotificationsReadApi(tab);
    } catch {
      // ignora
    }
  }, []);

  // Azioni multiple (selezione): aggiornano ottimisticamente items + archived in un
  // colpo solo e sparano i singoli endpoint (nessun endpoint bulk lato backend).
  const markManyRead = useCallback(async (ids: number[]) => {
    const set = new Set(ids);
    setItems((prev) => prev.map((i) => (set.has(i.id) ? { ...i, unread: false } : i)));
    setArchived((prev) => prev.map((i) => (set.has(i.id) ? { ...i, unread: false } : i)));
    await Promise.all(ids.map((id) => markNotificationReadApi(id).catch(() => {})));
  }, []);

  const markManyUnread = useCallback(async (ids: number[]) => {
    const set = new Set(ids);
    setItems((prev) => prev.map((i) => (set.has(i.id) ? { ...i, unread: true } : i)));
    setArchived((prev) => prev.map((i) => (set.has(i.id) ? { ...i, unread: true } : i)));
    await Promise.all(ids.map((id) => markNotificationUnreadApi(id).catch(() => {})));
  }, []);

  const archiveMany = useCallback(async (ids: number[]) => {
    const set = new Set(ids);
    setItems((prev) => prev.filter((i) => !set.has(i.id)));
    await Promise.all(ids.map((id) => archiveNotificationApi(id).catch(() => {})));
  }, []);

  const unarchiveMany = useCallback(async (ids: number[]) => {
    const set = new Set(ids);
    setArchived((prev) => prev.filter((i) => !set.has(i.id)));
    await Promise.all(ids.map((id) => unarchiveNotificationApi(id).catch(() => {})));
    await reload(); // tornano tra le notifiche normali
  }, [reload]);

  return {
    items,
    archived,
    loading,
    counts,
    totalUnread,
    itemsByTab,
    markRead,
    markUnread,
    markAllRead,
    archive,
    unarchive,
    markManyRead,
    markManyUnread,
    archiveMany,
    unarchiveMany,
    loadArchived,
    reload,
  };
}

export type UseNotificationsReturn = ReturnType<typeof useNotifications>;
