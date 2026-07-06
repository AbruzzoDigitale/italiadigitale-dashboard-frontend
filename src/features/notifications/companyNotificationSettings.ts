import { NOTIF_CATEGORIES, type NotifCategoryKey } from "./notificationPreferences";

// Config notifiche a livello AZIENDA (admin) — il "livello sopra" le preferenze
// del singolo utente. Condivisa con il backend (CompanyBrand.notification_settings).

export type CompanyRoleKey = "operator" | "project_manager" | "admin";

export interface CompanyNotificationSettings {
  /** Canali disponibili per gli utenti (l'in-app è sempre attivo). */
  channels: { email_enabled: boolean; push_enabled: boolean };
  /** Categorie non silenziabili: bypassano le preferenze utente. */
  mandatory_categories: NotifCategoryKey[];
  /** Default per ruolo: attivazione categorie ereditata dai nuovi utenti. */
  role_defaults: Record<CompanyRoleKey, Record<NotifCategoryKey, boolean>>;
  /** Soglie/tempistiche. */
  thresholds: {
    contract_expiry_days: number; // avvisa N giorni prima della scadenza contratto
    overdue_escalation_days: number; // escalation al PM dopo N giorni di ritardo
  };
}

export const COMPANY_ROLES: { key: CompanyRoleKey; label: string }[] = [
  { key: "operator", label: "Operatore" },
  { key: "project_manager", label: "PM" },
  { key: "admin", label: "Admin" },
];

function allCategoriesOn(): Record<NotifCategoryKey, boolean> {
  return NOTIF_CATEGORIES.reduce(
    (acc, cat) => ({ ...acc, [cat.key]: true }),
    {} as Record<NotifCategoryKey, boolean>,
  );
}

export const DEFAULT_COMPANY_NOTIFICATION_SETTINGS: CompanyNotificationSettings = {
  channels: { email_enabled: false, push_enabled: false },
  mandatory_categories: ["task_non_deferrable"],
  role_defaults: {
    operator: allCategoriesOn(),
    project_manager: allCategoriesOn(),
    admin: allCategoriesOn(),
  },
  thresholds: { contract_expiry_days: 10, overdue_escalation_days: 3 },
};

/** Completa eventuali campi mancanti dei dati salvati con i default. */
export function mergeCompanyNotificationSettings(
  raw: Partial<CompanyNotificationSettings> | null | undefined,
): CompanyNotificationSettings {
  const base = DEFAULT_COMPANY_NOTIFICATION_SETTINGS;
  if (!raw) return structuredCloneSafe(base);
  return {
    channels: { ...base.channels, ...(raw.channels ?? {}) },
    mandatory_categories: raw.mandatory_categories ?? [...base.mandatory_categories],
    role_defaults: {
      operator: { ...base.role_defaults.operator, ...(raw.role_defaults?.operator ?? {}) },
      project_manager: { ...base.role_defaults.project_manager, ...(raw.role_defaults?.project_manager ?? {}) },
      admin: { ...base.role_defaults.admin, ...(raw.role_defaults?.admin ?? {}) },
    },
    thresholds: { ...base.thresholds, ...(raw.thresholds ?? {}) },
  };
}

function structuredCloneSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
