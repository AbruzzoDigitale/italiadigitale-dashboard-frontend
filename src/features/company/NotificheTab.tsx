import { useEffect, useRef, useState } from "react";
import { getCompanyBrandApi, updateCompanyBrandApi, uploadCompanyAssetApi } from "../../api/companies";
import { useToast } from "../../context/ToastContext";
import { useBrand } from "../../context/BrandContext";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { Spinner } from "../../components/ui/Spinner";
import { NOTIF_CATEGORIES } from "../notifications/notificationPreferences";
import {
  COMPANY_ROLES,
  DEFAULT_COMPANY_NOTIFICATION_SETTINGS,
  mergeCompanyNotificationSettings,
  type CompanyNotificationSettings,
} from "../notifications/companyNotificationSettings";

interface NotificheTabProps {
  companyId: number;
  isAdmin: boolean;
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

function Card({
  title,
  description,
  children,
  className = "",
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-paper dark:bg-[#131316] rounded-lg border border-line dark:border-[#2a2a2e] p-6 ${className}`}>
      <div className="mb-1">
        <h2 className="font-display font-bold tracking-tight text-ink dark:text-[#f4f4f7]" style={{ fontSize: "17px" }}>
          {title}
        </h2>
        <p className="font-body text-[13px] text-muted dark:text-[#9999a0]">{description}</p>
      </div>
      {children}
    </div>
  );
}

export function NotificheTab({ companyId, isAdmin }: NotificheTabProps) {
  const toast = useToast();
  const { refetch: refetchGlobalBrand } = useBrand();
  const [settings, setSettings] = useState<CompanyNotificationSettings>(DEFAULT_COMPANY_NOTIFICATION_SETTINGS);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundUrl, setSoundUrl] = useState<string | null>(null);
  const [uploadingSound, setUploadingSound] = useState(false);
  const soundInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getCompanyBrandApi(companyId)
      .then((brand) => {
        if (cancelled) return;
        setSettings(mergeCompanyNotificationSettings(brand.notification_settings as never));
        setSoundEnabled(brand.notif_sound_enabled ?? true);
        setSoundUrl(brand.notif_sound);
      })
      .catch(() => {
        if (!cancelled) setSettings(DEFAULT_COMPANY_NOTIFICATION_SETTINGS);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await updateCompanyBrandApi(companyId, {
        notification_settings: settings as unknown as Record<string, unknown>,
        notif_sound_enabled: soundEnabled,
      });
      setSettings(mergeCompanyNotificationSettings(updated.notification_settings as never));
      setSoundEnabled(updated.notif_sound_enabled ?? true);
      refetchGlobalBrand();
      toast.success("Impostazioni notifiche aziendali salvate");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  };

  const handleSoundUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingSound(true);
    try {
      const updated = await uploadCompanyAssetApi(companyId, "notif_sound", file);
      setSoundUrl(updated.notif_sound);
      refetchGlobalBrand();
      toast.success("Suono notifica caricato");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore upload");
    } finally {
      setUploadingSound(false);
      e.target.value = "";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner size="md" />
      </div>
    );
  }

  const toggleMandatory = (key: string, value: boolean) => {
    setSettings((prev) => {
      const set = new Set(prev.mandatory_categories);
      if (value) set.add(key as never);
      else set.delete(key as never);
      return { ...prev, mandatory_categories: [...set] as never };
    });
  };

  const setRoleDefault = (role: keyof CompanyNotificationSettings["role_defaults"], key: string, value: boolean) => {
    setSettings((prev) => ({
      ...prev,
      role_defaults: {
        ...prev.role_defaults,
        [role]: { ...prev.role_defaults[role], [key]: value },
      },
    }));
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <p className="font-body text-[13px] text-muted dark:text-[#9999a0] max-w-xl">
          Regole e default delle notifiche per tutta l'azienda. Il singolo utente può poi affinare le proprie preferenze.
        </p>
        <Button variant="primary" onClick={handleSave} loading={saving} disabled={!isAdmin}>
          Salva
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      <Card title="Suono notifiche" description="Suono riprodotto in app. MP3 · WAV · OGG — max 1 MB.">
        <div className="mt-3 divide-y divide-line dark:divide-[#2a2a2e] border-t border-line dark:border-[#2a2a2e]">
          <Row icon="annotation" title="Abilita suono" description="Riproduci un suono alle nuove notifiche.">
            <Switch checked={soundEnabled} disabled={!isAdmin} onChange={setSoundEnabled} />
          </Row>
          {soundEnabled && (
            <div className="flex flex-wrap items-center gap-3 py-3">
              {soundUrl && <audio controls src={soundUrl} className="h-8 max-w-[220px]" />}
              <button
                type="button"
                onClick={() => soundInputRef.current?.click()}
                disabled={!isAdmin || uploadingSound}
                className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-[11px] font-body font-bold uppercase tracking-wide text-muted transition-colors hover:border-ink hover:text-ink disabled:opacity-40 dark:border-[#2a2a2e] dark:text-[#9999a0] dark:hover:border-[#f4f4f7] dark:hover:text-[#f4f4f7]"
              >
                {uploadingSound ? <Spinner size="sm" /> : <Icon name="upload" className="h-3.5 w-3.5" />}
                {soundUrl ? "Sostituisci" : "Carica suono"}
              </button>
              <input
                ref={soundInputRef}
                type="file"
                accept="audio/mpeg,audio/wav,audio/ogg"
                className="hidden"
                onChange={handleSoundUpload}
              />
            </div>
          )}
        </div>
      </Card>

      <Card title="Canali abilitati" description="Canali disponibili per gli utenti. L'in-app è sempre attivo.">
        <div className="mt-3 divide-y divide-line dark:divide-[#2a2a2e] border-t border-line dark:border-[#2a2a2e]">
          <Row icon="mail" title="Email" description="Permetti l'invio di notifiche via email.">
            <Switch checked={settings.channels.email_enabled} disabled={!isAdmin} onChange={(v) => setSettings((p) => ({ ...p, channels: { ...p.channels, email_enabled: v } }))} />
          </Row>
          <Row icon="bell" title="Push" description="Permetti le notifiche push su browser/dispositivo.">
            <Switch checked={settings.channels.push_enabled} disabled={!isAdmin} onChange={(v) => setSettings((p) => ({ ...p, channels: { ...p.channels, push_enabled: v } }))} />
          </Row>
        </div>
      </Card>

      <Card title="Soglie" description="Tempistiche che generano le notifiche di scadenza e ritardo.">
        <div className="mt-3 divide-y divide-line dark:divide-[#2a2a2e] border-t border-line dark:border-[#2a2a2e]">
          <Row icon="clock" title="Contratti in scadenza" description="Giorni di anticipo con cui avvisare.">
            <NumberField value={settings.thresholds.contract_expiry_days} disabled={!isAdmin} suffix="giorni" onChange={(n) => setSettings((p) => ({ ...p, thresholds: { ...p.thresholds, contract_expiry_days: n } }))} />
          </Row>
          <Row icon="alert-triangle" title="Escalation ritardi" description="Dopo quanti giorni di ritardo avvisare il PM.">
            <NumberField value={settings.thresholds.overdue_escalation_days} disabled={!isAdmin} suffix="giorni" onChange={(n) => setSettings((p) => ({ ...p, thresholds: { ...p.thresholds, overdue_escalation_days: n } }))} />
          </Row>
        </div>
      </Card>

      <Card title="Categorie obbligatorie" description="Sempre consegnate: l'utente non può disattivarle.">
        <div className="mt-3 divide-y divide-line dark:divide-[#2a2a2e] border-t border-line dark:border-[#2a2a2e]">
          {NOTIF_CATEGORIES.map((cat) => {
            const forced = cat.locked === true;
            const checked = forced || settings.mandatory_categories.includes(cat.key);
            return (
              <Row key={cat.key} icon={cat.icon} title={cat.label} description={cat.description}>
                <Switch checked={checked} disabled={!isAdmin || forced} onChange={(v) => toggleMandatory(cat.key, v)} />
              </Row>
            );
          })}
        </div>
      </Card>

      <Card title="Default per ruolo" description="Attivazione iniziale delle categorie ereditata dai nuovi utenti del ruolo." className="lg:col-span-2">
        <div className="mt-3 overflow-x-auto border-t border-line dark:border-[#2a2a2e]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line dark:border-[#2a2a2e]">
                <th className="py-2.5 pr-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">Categoria</th>
                {COMPANY_ROLES.map((r) => (
                  <th key={r.key} className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">{r.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {NOTIF_CATEGORIES.map((cat) => (
                <tr key={cat.key} className="border-b border-line/70 last:border-0 dark:border-[#2a2a2e]/70">
                  <td className="py-2.5 pr-3">
                    <span className="inline-flex items-center gap-2 text-ink dark:text-[#f4f4f7]">
                      <Icon name={cat.icon} className="h-3.5 w-3.5 text-muted dark:text-[#9999a0]" />
                      {cat.label}
                    </span>
                  </td>
                  {COMPANY_ROLES.map((r) => (
                    <td key={r.key} className="px-3 py-2.5 text-center">
                      <div className="inline-flex">
                        <Switch checked={!!settings.role_defaults[r.key][cat.key]} disabled={!isAdmin} onChange={(v) => setRoleDefault(r.key, cat.key, v)} />
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      </div>
    </div>
  );
}

function Row({
  icon,
  title,
  description,
  children,
}: {
  icon: Parameters<typeof Icon>[0]["name"];
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="flex items-center gap-3 min-w-0">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-cream text-muted dark:bg-[#1c1c20] dark:text-[#9999a0]">
          <Icon name={icon} className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-ink dark:text-[#f4f4f7]">{title}</div>
          <div className="text-xs text-muted dark:text-[#9999a0]">{description}</div>
        </div>
      </div>
      {children}
    </div>
  );
}

function NumberField({
  value,
  onChange,
  disabled,
  suffix,
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  suffix?: string;
}) {
  return (
    <div className="inline-flex items-center gap-2">
      <input
        type="number"
        min={0}
        value={Number.isFinite(value) ? value : 0}
        disabled={disabled}
        onChange={(e) => onChange(Math.max(0, parseInt(e.target.value || "0", 10) || 0))}
        className="w-16 rounded-md border border-line bg-paper px-2 py-1.5 text-center text-sm text-ink outline-none focus:border-ink disabled:opacity-50 dark:border-line-dark dark:bg-[#1c1c20] dark:text-paper dark:focus:border-paper"
      />
      {suffix && <span className="text-xs text-muted dark:text-muted-dark">{suffix}</span>}
    </div>
  );
}
