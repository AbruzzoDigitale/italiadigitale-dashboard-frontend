import type { IconName } from "../../components/ui/Icon";
import type { NotifTone } from "./notificationsData";
import type { PushOpenMode } from "./pushOpenPreference";

// Forma condivisa con il backend (GET/PUT /api/v1/notifications/preferences).
// Per-utente: cosa/come essere avvisati. La SCELTA del suono resta lato azienda
// (admin); qui c'è solo il toggle "voglio sentirlo".

export type NotifCategoryKey =
  | "task_assigned"
  | "task_non_deferrable"
  | "task_overdue"
  | "task_review"
  | "task_completed"
  | "task_changes"
  | "requests"
  | "contracts"
  | "communications";

export interface NotificationPreferences {
  /** Canali aggiuntivi (in-app è sempre attivo). */
  email_enabled: boolean;
  push_enabled: boolean;
  /** Suono notifiche (il file è scelto a livello azienda dall'admin). */
  sound_enabled: boolean;
  /** Toast in-app all'arrivo di una notifica mentre stai usando il gestionale. */
  toast_enabled: boolean;
  /** Clic su una notifica push con la dashboard già aperta: dove aprire la pagina. */
  push_open_mode: PushOpenMode;
  /** Non disturbare in una fascia oraria. */
  quiet_hours_enabled: boolean;
  quiet_hours_start: string; // "HH:MM"
  quiet_hours_end: string; // "HH:MM"
  /** Attivazione per categoria (notifiche in-app). */
  categories: Record<NotifCategoryKey, boolean>;
}

export interface NotifCategoryMeta {
  key: NotifCategoryKey;
  label: string;
  description: string;
  icon: IconName;
  tone: NotifTone;
  /** Categoria critica: sempre consegnata, non disattivabile. */
  locked?: boolean;
}

export const NOTIF_CATEGORIES: NotifCategoryMeta[] = [
  { key: "task_assigned", label: "Task assegnate a me", description: "Quando ti viene assegnata una nuova lavorazione.", icon: "plus", tone: "mint" },
  { key: "task_non_deferrable", label: "Task non derogabili", description: "Scadenze vincolate: sempre notificate.", icon: "shield", tone: "magenta", locked: true },
  { key: "task_overdue", label: "In ritardo e scadute", description: "Lavorazioni non completate entro la scadenza.", icon: "alert-triangle", tone: "amber" },
  { key: "task_review", label: "In revisione", description: "Lavorazioni passate in revisione interna.", icon: "eye", tone: "indigo" },
  { key: "task_completed", label: "Completate", description: "Quando una lavorazione viene completata (avviso al PM).", icon: "check-circle", tone: "mint" },
  { key: "task_changes", label: "Cambi e riassegnazioni", description: "Cambi di stato/orario, modifiche e riassegnazioni.", icon: "refresh-cw", tone: "neutral" },
  { key: "requests", label: "Richieste preventivo", description: "Nuove richieste in arrivo dai clienti.", icon: "mail", tone: "indigo" },
  { key: "contracts", label: "Contratti", description: "Da avviare, in scadenza o scaduti.", icon: "document-text", tone: "neutral" },
  { key: "communications", label: "Comunicazioni", description: "Avvisi globali, di area o personali.", icon: "annotation", tone: "magenta" },
];

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  email_enabled: false,
  push_enabled: true,
  sound_enabled: true,
  toast_enabled: true,
  push_open_mode: "ask",
  quiet_hours_enabled: false,
  quiet_hours_start: "20:00",
  quiet_hours_end: "08:00",
  categories: {
    task_assigned: true,
    task_non_deferrable: true,
    task_overdue: true,
    task_review: true,
    task_completed: true,
    task_changes: true,
    requests: true,
    contracts: true,
    communications: true,
  },
};
