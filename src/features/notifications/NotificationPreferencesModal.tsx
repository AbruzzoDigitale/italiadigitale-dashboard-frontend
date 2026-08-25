import { useEffect, useState } from "react";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { SectionCard } from "../../components/ui/SectionCard";
import { useToast } from "../../context/ToastContext";
import {
  getMyNotificationPreferencesApi,
  updateMyNotificationPreferencesApi,
} from "../../api/notifications";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIF_CATEGORIES,
  type NotificationPreferences,
} from "./notificationPreferences";
import { emitNotificationToast } from "./notificationToastBus";
import { ensurePushSubscription } from "./pushSubscription";
import { PUSH_OPEN_LABEL, cachePushOpenMode, type PushOpenMode } from "./pushOpenPreference";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import { sendPushTestApi } from "../../api/push";

interface NotificationPreferencesModalProps {
  open: boolean;
  onClose: () => void;
}

function Switch({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`inline-flex h-5 w-9 shrink-0 items-center rounded-full px-0.5 transition-colors ${
        checked ? "bg-brand-magenta" : "bg-line dark:bg-[#3a3a3e]"
      } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
    >
      <span
        className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

export function NotificationPreferencesModal({ open, onClose }: NotificationPreferencesModalProps) {
  const toast = useToast();
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  // Stato del permesso notifiche del BROWSER (diagnostica: è la causa più comune
  // dei "toast che non arrivano", insieme ai blocchi a livello di sistema operativo).
  const [browserPerm, setBrowserPerm] = useState<NotificationPermission | "unsupported">(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported"
  );

  useEffect(() => {
    if (open && typeof Notification !== "undefined") setBrowserPerm(Notification.permission);
  }, [open]);

  const requestBrowserPermission = async () => {
    if (typeof Notification === "undefined") return;
    try {
      const p = await Notification.requestPermission();
      setBrowserPerm(p);
      if (p === "granted") toast.success("Notifiche desktop attivate.");
      else if (p === "denied") toast.error("Permesso negato dal browser.");
    } catch {
      toast.error("Impossibile richiedere il permesso.");
    }
  };

  const sendTestNotification = async () => {
    if (typeof Notification === "undefined") {
      toast.error("Questo browser non supporta le notifiche desktop.");
      return;
    }
    if (Notification.permission !== "granted") {
      toast.error('Permesso browser non concesso: usa "Attiva" qui sopra.');
      setBrowserPerm(Notification.permission);
      return;
    }
    // Canale reale: iscrizione Web Push + notifica di prova dal BACKEND (stesso
    // percorso delle notifiche vere: arriva anche a scheda chiusa/full screen).
    const pushReady = await ensurePushSubscription();
    if (pushReady) {
      try {
        await sendPushTestApi();
        toast.success(
          "Prova inviata dal server via push: il banner di sistema arriva entro qualche secondo (anche con la scheda in background)."
        );
        return;
      } catch {
        /* backend push non disponibile: prova locale qui sotto */
      }
    }
    try {
      const n = new Notification("Notifica di prova · Italia Digitale", {
        body: "Se la vedi, le notifiche desktop funzionano.",
        tag: "italiadigitale-test",
      });
      // Esito REALE dal sistema: senza questi eventi `new Notification` fallisce in
      // silenzio (nessun errore) quando è l'OS a sopprimere il banner — ed è la
      // causa tipica dei "non mi arriva niente".
      let settled = false;
      n.onshow = () => {
        settled = true;
        toast.success(
          "Il sistema ha MOSTRATO la notifica (in alto a destra su macOS, in basso a destra su Windows). Se non l'hai vista: Full Screen, Non disturbare/Focus o stile avvisi."
        );
      };
      n.onerror = () => {
        settled = true;
        toast.error(
          "Il sistema operativo ha BLOCCATO la notifica: controlla i permessi notifiche del browser nelle impostazioni di sistema."
        );
      };
      n.onclick = () => {
        window.focus();
        n.close();
      };
      window.setTimeout(() => {
        if (!settled) {
          toast.info(
            "Nessuna conferma dal sistema: se il banner non è comparso, il blocco è nelle impostazioni notifiche del sistema operativo (non nel browser)."
          );
        }
      }, 2500);
    } catch {
      toast.error("Il browser ha rifiutato la notifica di prova.");
    }
  };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    getMyNotificationPreferencesApi()
      .then((data) => {
        if (cancelled) return;
        const merged = {
          ...DEFAULT_NOTIFICATION_PREFERENCES,
          ...data,
          categories: { ...DEFAULT_NOTIFICATION_PREFERENCES.categories, ...data.categories },
        };
        setPrefs(merged);
        cachePushOpenMode(merged.push_open_mode);
      })
      .catch(() => {
        // Backend non ancora disponibile o nessuna preferenza: parti dai default.
        if (!cancelled) setPrefs(DEFAULT_NOTIFICATION_PREFERENCES);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const setField = <K extends keyof NotificationPreferences>(key: K, value: NotificationPreferences[K]) =>
    setPrefs((prev) => ({ ...prev, [key]: value }));

  const setCategory = (key: string, value: boolean) =>
    setPrefs((prev) => ({ ...prev, categories: { ...prev.categories, [key]: value } }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await updateMyNotificationPreferencesApi(prefs);
      setPrefs(saved);
      toast.success("Preferenze notifiche salvate");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Preferenze notifiche"
      description="Scegli cosa e come vuoi essere avvisato. Valgono solo per te."
      icon={<Icon name="bell" className="h-5 w-5" />}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Annulla
          </Button>
          <Button variant="primary" onClick={handleSave} loading={saving} disabled={loading}>
            Salva
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Canali */}
        <SectionCard icon="bell" title="Canali">
          <div className="-mx-4 -mb-4 border-t border-line dark:border-line-dark divide-y divide-line dark:divide-line-dark">
            <Row
              icon="bell"
              title="In app"
              description="Campanella e centro notifiche. Sempre attivo."
              control={<Switch checked disabled onChange={() => {}} />}
            />
            <Row
              icon="mail"
              title="Email"
              description="Ricevi un'email per le notifiche importanti."
              control={<Switch checked={prefs.email_enabled} onChange={(v) => setField("email_enabled", v)} />}
            />
            <Row
              icon="bell"
              title="Push"
              description="Notifiche push sul browser/dispositivo."
              control={<Switch checked={prefs.push_enabled} onChange={(v) => setField("push_enabled", v)} />}
            />
            {/* Dove aprire la pagina quando clicchi una notifica push con la
                dashboard già aperta: la scelta è per dispositivo. */}
            <Row
              icon="link"
              title="Clic sulla notifica"
              description="Con la dashboard già aperta, dove portare la pagina della notifica."
              control={
                <SearchableSelect
                  value={prefs.push_open_mode}
                  onChange={(v) => {
                    const m = v as PushOpenMode;
                    setField("push_open_mode", m);
                    // Copia locale subito: il service worker la legge senza rete.
                    cachePushOpenMode(m);
                  }}
                  options={(["ask", "same", "new"] as PushOpenMode[]).map((m) => ({
                    value: m,
                    label: PUSH_OPEN_LABEL[m],
                  }))}
                  showAvatar={false}
                  menuLayer="portal"
                  triggerClassName="min-w-[210px]"
                />
              }
            />
            <Row
              icon="annotation"
              title="Toast in app"
              description="Anteprima a schermo quando arriva una notifica mentre usi il gestionale (poi vola nella campanella)."
              control={
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      emitNotificationToast({
                        title: "Notifica di prova",
                        body: "Guardami: tra qualche secondo volo dentro la campanella.",
                      })
                    }
                  >
                    Prova
                  </Button>
                  <Switch checked={prefs.toast_enabled} onChange={(v) => setField("toast_enabled", v)} />
                </div>
              }
            />

            {/* Diagnostica notifiche desktop: permesso browser + prova di invio */}
            <div className="flex flex-col gap-2 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-cream text-muted dark:bg-[#1c1c20] dark:text-muted-dark">
                    <Icon name="shield-check" className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold text-ink dark:text-paper">
                      Notifiche di sistema (desktop)
                      {browserPerm === "granted" && (
                        <span className="rounded-pill bg-success/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-success">Permesso ok</span>
                      )}
                      {browserPerm === "denied" && (
                        <span className="rounded-pill bg-danger/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-danger">Bloccate</span>
                      )}
                      {browserPerm === "default" && (
                        <span className="rounded-pill bg-warning/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-warning">Da attivare</span>
                      )}
                    </div>
                    <div className="text-xs text-muted dark:text-muted-dark">
                      {browserPerm === "granted" &&
                        "Il browser ha il permesso. Se la prova non compare, il blocco è nelle notifiche del sistema operativo."}
                      {browserPerm === "default" && "Il browser non ha ancora il permesso: attivale da qui."}
                      {browserPerm === "denied" && "Il permesso è stato negato per questo sito."}
                      {browserPerm === "unsupported" && "Questo browser non supporta le notifiche desktop."}
                    </div>
                  </div>
                </div>
                {browserPerm === "granted" && (
                  <Button size="sm" variant="secondary" onClick={() => void sendTestNotification()}>
                    Invia prova
                  </Button>
                )}
                {browserPerm === "default" && (
                  <Button size="sm" variant="primary" onClick={requestBrowserPermission}>
                    Attiva
                  </Button>
                )}
              </div>
              {browserPerm === "denied" && (
                <p className="pl-11 text-xs leading-relaxed text-muted dark:text-muted-dark">
                  Sbloccale dal <b>lucchetto nella barra degli indirizzi</b> → Impostazioni sito → Notifiche →
                  Consenti, poi ricarica la pagina.
                </p>
              )}
              {browserPerm === "granted" && (
                <p className="pl-11 text-xs leading-relaxed text-muted dark:text-muted-dark">
                  Se la prova non appare: su <b>macOS</b> controlla Impostazioni di Sistema → Notifiche → consenti il
                  browser, spegni <b>Focus/Non disturbare</b> e ricorda che col browser a <b>schermo intero</b> i
                  banner non vengono mostrati (serve "Consenti notifiche con schermo intero" oppure esci dal full
                  screen); su <b>Windows</b> Impostazioni → Sistema → Notifiche: attiva le notifiche per il browser e
                  disattiva "Non disturbare"/Assistente notifiche.
                </p>
              )}
            </div>
          </div>
        </SectionCard>

        {/* Suono & non disturbare */}
        <SectionCard icon="moon" title="Suono e non disturbare">
          <div className="-mx-4 -mb-4 border-t border-line dark:border-line-dark divide-y divide-line dark:divide-line-dark">
            <Row
              icon="annotation"
              title="Suono notifiche"
              description="Il suono è scelto dall'azienda; qui decidi solo se sentirlo."
              control={<Switch checked={prefs.sound_enabled} onChange={(v) => setField("sound_enabled", v)} />}
            />
            <div className="flex flex-col gap-3 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="grid h-8 w-8 place-items-center rounded-md bg-cream text-muted dark:bg-[#1c1c20] dark:text-muted-dark">
                    <Icon name="moon" className="h-4 w-4" />
                  </span>
                  <div>
                    <div className="text-sm font-semibold text-ink dark:text-paper">Non disturbare</div>
                    <div className="text-xs text-muted dark:text-muted-dark">Silenzia email/push in una fascia oraria.</div>
                  </div>
                </div>
                <Switch checked={prefs.quiet_hours_enabled} onChange={(v) => setField("quiet_hours_enabled", v)} />
              </div>
              {prefs.quiet_hours_enabled && (
                <div className="flex items-center gap-2 pl-11 text-sm">
                  <span className="text-muted dark:text-muted-dark">Dalle</span>
                  <input
                    type="time"
                    value={prefs.quiet_hours_start}
                    onChange={(e) => setField("quiet_hours_start", e.target.value)}
                    className="rounded-md border border-line bg-paper px-2 py-1 text-ink outline-none focus:border-ink dark:border-line-dark dark:bg-[#1c1c20] dark:text-paper dark:focus:border-paper"
                  />
                  <span className="text-muted dark:text-muted-dark">alle</span>
                  <input
                    type="time"
                    value={prefs.quiet_hours_end}
                    onChange={(e) => setField("quiet_hours_end", e.target.value)}
                    className="rounded-md border border-line bg-paper px-2 py-1 text-ink outline-none focus:border-ink dark:border-line-dark dark:bg-[#1c1c20] dark:text-paper dark:focus:border-paper"
                  />
                </div>
              )}
            </div>
          </div>
        </SectionCard>

        {/* Categorie */}
        <SectionCard icon="grid" title="Categorie">
          <div className="-mx-4 -mb-4 border-t border-line dark:border-line-dark divide-y divide-line dark:divide-line-dark">
            {NOTIF_CATEGORIES.map((cat) => (
              <Row
                key={cat.key}
                icon={cat.icon}
                title={cat.label}
                description={cat.description}
                control={
                  <Switch
                    checked={cat.locked ? true : prefs.categories[cat.key]}
                    disabled={cat.locked}
                    onChange={(v) => setCategory(cat.key, v)}
                  />
                }
              />
            ))}
          </div>
        </SectionCard>
      </div>
    </Modal>
  );
}

function Row({
  icon,
  title,
  description,
  control,
}: {
  icon: Parameters<typeof Icon>[0]["name"];
  title: string;
  description: string;
  control: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="flex items-center gap-3 min-w-0">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-cream text-muted dark:bg-[#1c1c20] dark:text-muted-dark">
          <Icon name={icon} className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-ink dark:text-paper">{title}</div>
          <div className="text-xs text-muted dark:text-muted-dark">{description}</div>
        </div>
      </div>
      {control}
    </div>
  );
}
