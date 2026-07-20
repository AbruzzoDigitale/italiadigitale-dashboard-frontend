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

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    getMyNotificationPreferencesApi()
      .then((data) => {
        if (!cancelled) setPrefs({ ...DEFAULT_NOTIFICATION_PREFERENCES, ...data, categories: { ...DEFAULT_NOTIFICATION_PREFERENCES.categories, ...data.categories } });
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
