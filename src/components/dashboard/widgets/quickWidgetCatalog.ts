import type { IconName } from "../../ui/Icon";
import type { AppRouteKey } from "../../../utils/access";

/** Widget di visualizzazione rapida (liste/riepiloghi, non KPI). Standalone: nessun kpiId. */
export interface QuickWidgetDef {
  type: string;
  label: string;
  description: string;
  icon: IconName;
  /** Se presente, il widget è visibile solo a chi può accedere a quella rotta. */
  requiresRoute?: AppRouteKey;
  /** Solo admin/PM (es. panoramiche di team, non pertinenti all'operatore). */
  privilegedOnly?: boolean;
}

export const QUICK_WIDGETS: QuickWidgetDef[] = [
  { type: "qw-feed", label: "Novità", description: "Le ultime cose successe in giro per il gestionale, a rotazione.", icon: "star" },
  { type: "qw-shortcuts", label: "Scorciatoie", description: "Tessere di collegamento alle sezioni del gestionale.", icon: "grid" },
  { type: "qw-notifications", label: "Notifiche", description: "Ultime notifiche, non lette in evidenza.", icon: "bell" },
  { type: "qw-work-items", label: "Lavorazioni", description: "Lavorazioni aperte.", icon: "list", requiresRoute: "work-items" },
  { type: "qw-requests", label: "Richieste", description: "Ultime richieste ricevute.", icon: "annotation", requiresRoute: "requests" },
  { type: "qw-daily-tasks", label: "Attività del giorno", description: "Le tue attività di oggi.", icon: "clock", requiresRoute: "daily-tasks" },
  { type: "qw-workload", label: "Workload", description: "Carico del team per utente.", icon: "activity", requiresRoute: "workload", privilegedOnly: true },
  { type: "qw-workload-heatmap", label: "Heatmap workload", description: "Carico settimanale a griglia: tu (operatore) o tutto il team (PM/admin).", icon: "activity", requiresRoute: "workload" },
  { type: "qw-quick-links", label: "Collegamenti rapidi", description: "I tuoi link salvati.", icon: "link" },
  { type: "qw-recent-clients", label: "Ultimi clienti", description: "Clienti aggiunti di recente.", icon: "users", requiresRoute: "clients" },
  { type: "qw-clients-situation", label: "Situazioni clienti", description: "Stato commerciale per cliente.", icon: "activity", requiresRoute: "clients-situation" },
  { type: "qw-quotes", label: "Preventivi", description: "Ultimi preventivi.", icon: "document-text", requiresRoute: "quotes" },
  { type: "qw-pipeline", label: "Pipeline commerciale", description: "Riepilogo per fase.", icon: "target", requiresRoute: "contracts" },
  { type: "qw-billing", label: "Fatturazione", description: "Da fatturare questo mese.", icon: "credit-card", requiresRoute: "fatturazione" },
];
