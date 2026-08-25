import type { IconName } from "../../components/ui/Icon";

// Centro notifiche — tipi e metadati. I dati arrivano ora dal backend
// (GET /api/v1/notifications); qui restano solo le mappe tipo→icona/tono e le tab.

export type NotifTone = "magenta" | "amber" | "mint" | "indigo" | "neutral";

export interface NotifTypeMeta {
  label: string;
  icon: IconName;
  tone: NotifTone;
}

export type NotifTabKey = "task" | "richieste" | "contratti" | "comunicazioni" | "monitoraggi";

/** Forma allineata a NotificationResponse del backend. */
export interface NotifItem {
  id: number;
  tab: NotifTabKey;
  type: string;
  title: string;
  who?: string | null;
  scope?: string | null;
  ref?: string | null;
  time: string;
  unread: boolean;
  archived?: boolean;
  note?: string | null;
  entity_type?: string | null;
  entity_id?: number | null;
}

export interface NotifGroup {
  key: string;
  label: string;
  items: NotifItem[];
}

/** tipo notifica → etichetta + icona + tono colore. */
export const NOTIF_TYPES: Record<string, NotifTypeMeta> = {
  // stati task
  non_derogabile: { label: "Non derogabile", icon: "shield", tone: "magenta" },
  in_ritardo: { label: "In ritardo", icon: "clock", tone: "amber" },
  revisione: { label: "In revisione", icon: "eye", tone: "indigo" },
  completata: { label: "Completata", icon: "check-circle", tone: "mint" },
  scaduta: { label: "Scaduta", icon: "alert-triangle", tone: "magenta" },
  nuova_task: { label: "Nuova task", icon: "plus", tone: "mint" },
  cambio_stato: { label: "Cambio stato", icon: "refresh-cw", tone: "indigo" },
  cambio_orario: { label: "Cambio orario", icon: "clock", tone: "indigo" },
  modifica: { label: "Nuova modifica", icon: "pencil", tone: "neutral" },
  riassegnata: { label: "Riassegnata", icon: "refresh-cw", tone: "amber" },
  pronta_fatturazione: { label: "Da fatturare", icon: "credit-card", tone: "mint" },
  // contratti
  c_da_fare: { label: "Da fare", icon: "tools", tone: "neutral" },
  c_scaduto: { label: "Scaduto", icon: "alert-triangle", tone: "magenta" },
  c_scadenza: { label: "In scadenza", icon: "clock", tone: "amber" },
  // richieste
  richiesta: { label: "Richiesta", icon: "mail", tone: "indigo" },
  // monitoraggio social
  social_inactivity: { label: "Social non aggiornato", icon: "activity", tone: "amber" },
  social_below_target: { label: "Sotto al ritmo PED", icon: "activity", tone: "amber" },
  social_monitor_error: { label: "Collegamento non verificato", icon: "alert-triangle", tone: "magenta" },
  // comunicazioni
  com_operatore: { label: "Operatore", icon: "users", tone: "mint" },
  com_area: { label: "Area", icon: "grid", tone: "indigo" },
  com_globale: { label: "Globale", icon: "globe", tone: "magenta" },
};

/** Schede con liste raggruppate per tipo (le altre sono piatte). */
export const GROUPED_TABS: NotifTabKey[] = ["task", "contratti"];

/** Ordine e label delle intestazioni di gruppo (per tipo) nelle schede raggruppate. */
export const NOTIF_GROUP_ORDER: Record<string, { order: string[]; labels: Record<string, string> }> = {
  task: {
    order: ["non_derogabile", "scaduta", "in_ritardo", "revisione", "completata", "pronta_fatturazione", "nuova_task", "cambio_stato", "cambio_orario", "modifica", "riassegnata"],
    labels: {
      non_derogabile: "Non derogabili",
      scaduta: "Scadute",
      in_ritardo: "In ritardo",
      revisione: "In revisione",
      completata: "Completate",
      pronta_fatturazione: "Pronte da fatturare",
      nuova_task: "Nuova task assegnata",
      cambio_stato: "Cambio stato",
      cambio_orario: "Cambio orario",
      modifica: "Nuova modifica",
      riassegnata: "Task riassegnata",
    },
  },
  contratti: {
    order: ["c_da_fare", "c_scadenza", "c_scaduto"],
    labels: { c_da_fare: "Da fare", c_scadenza: "In scadenza", c_scaduto: "Scaduti" },
  },
};

/** Costruisce i gruppi (per tipo, ordinati) dalle notifiche di una scheda raggruppata. */
export function buildNotifGroups(tab: NotifTabKey, items: NotifItem[]): NotifGroup[] {
  const cfg = NOTIF_GROUP_ORDER[tab];
  const byType = new Map<string, NotifItem[]>();
  for (const it of items) {
    const bucket = byType.get(it.type);
    if (bucket) bucket.push(it);
    else byType.set(it.type, [it]);
  }
  const order = cfg?.order ?? [];
  const seen = new Set<string>();
  const groups: NotifGroup[] = [];
  const pushGroup = (type: string) => {
    const list = byType.get(type);
    if (!list || list.length === 0 || seen.has(type)) return;
    seen.add(type);
    groups.push({ key: type, label: cfg?.labels[type] ?? NOTIF_TYPES[type]?.label ?? type, items: list });
  };
  order.forEach(pushGroup);
  // tipi non previsti nell'ordine: in coda, preservando l'ordine d'arrivo.
  for (const type of byType.keys()) pushGroup(type);
  return groups;
}

export const NOTIF_TABS: { key: NotifTabKey; label: string; icon: IconName }[] = [
  { key: "task", label: "Task", icon: "check" },
  { key: "richieste", label: "Richieste", icon: "mail" },
  { key: "contratti", label: "Contratti", icon: "document-text" },
  { key: "comunicazioni", label: "Comunicazioni", icon: "annotation" },
  { key: "monitoraggi", label: "Monitoraggi", icon: "activity" },
];

export const NOTIF_COM_FILTERS: { key: string; label: string; tone?: NotifTone }[] = [
  { key: "all", label: "Tutte" },
  { key: "com_globale", label: "Globale", tone: "magenta" },
  { key: "com_area", label: "Area", tone: "indigo" },
  { key: "com_operatore", label: "Operatore", tone: "mint" },
];
