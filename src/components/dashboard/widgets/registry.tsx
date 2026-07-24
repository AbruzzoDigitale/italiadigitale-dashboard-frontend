import { KpiStatWidget } from "./KpiStatWidget";
import { KpiTrendWidget } from "./KpiTrendWidget";
import { KpiBreakdownWidget } from "./KpiBreakdownWidget";
import { KpiMultiTrendWidget } from "./KpiMultiTrendWidget";
import { KpiGaugeWidget } from "./KpiGaugeWidget";
import { KpiStatusDonutWidget } from "./KpiStatusDonutWidget";
import { KpiEstActualWidget } from "./KpiEstActualWidget";
import { NotificationsWidget } from "../quickwidgets/NotificationsWidget";
import { WorkItemsWidget } from "../quickwidgets/WorkItemsWidget";
import { RequestsWidget } from "../quickwidgets/RequestsWidget";
import { DailyTasksWidget } from "../quickwidgets/DailyTasksWidget";
import { WorkloadWidget } from "../quickwidgets/WorkloadWidget";
import { QuickLinksWidget } from "../quickwidgets/QuickLinksWidget";
import { RecentClientsWidget } from "../quickwidgets/RecentClientsWidget";
import { ClientsSituationWidget } from "../quickwidgets/ClientsSituationWidget";
import { QuotesWidget } from "../quickwidgets/QuotesWidget";
import { PipelineWidget } from "../quickwidgets/PipelineWidget";
import { BillingWidget } from "../quickwidgets/BillingWidget";
import type { WidgetDef } from "./types";

/**
 * Registro dei tipi di widget. Aggiungere un tipo = aggiungere una voce qui
 * (nessuna modifica al backend, che salva i widget in modo opaco).
 */
export const WIDGET_REGISTRY: Record<string, WidgetDef> = {
  "kpi-stat": {
    type: "kpi-stat",
    label: "Valore",
    defaultSize: { w: 3, h: 2 },
    minSize: { w: 2, h: 2 },
    render: (inst) => <KpiStatWidget instance={inst} />,
  },
  "kpi-trend": {
    type: "kpi-trend",
    label: "Andamento nel tempo",
    defaultSize: { w: 6, h: 3 },
    minSize: { w: 3, h: 2 },
    render: (inst) => <KpiTrendWidget instance={inst} />,
  },
  "kpi-by-operator": {
    type: "kpi-by-operator",
    label: "Per operatore",
    defaultSize: { w: 4, h: 3 },
    minSize: { w: 3, h: 2 },
    render: (inst) => <KpiBreakdownWidget instance={inst} dimension="operator" />,
  },
  "kpi-by-area": {
    type: "kpi-by-area",
    label: "Per area",
    defaultSize: { w: 4, h: 3 },
    minSize: { w: 3, h: 2 },
    render: (inst) => <KpiBreakdownWidget instance={inst} dimension="area" />,
  },
  "kpi-by-client": {
    type: "kpi-by-client",
    label: "Per cliente",
    defaultSize: { w: 4, h: 3 },
    minSize: { w: 3, h: 2 },
    render: (inst) => <KpiBreakdownWidget instance={inst} dimension="client" />,
  },
  "kpi-trend-by-operator": {
    type: "kpi-trend-by-operator",
    label: "Andamento per operatore",
    defaultSize: { w: 6, h: 3 },
    minSize: { w: 4, h: 3 },
    render: (inst) => <KpiMultiTrendWidget instance={inst} dimension="operator" />,
  },
  "kpi-trend-by-area": {
    type: "kpi-trend-by-area",
    label: "Andamento per area",
    defaultSize: { w: 6, h: 3 },
    minSize: { w: 4, h: 3 },
    render: (inst) => <KpiMultiTrendWidget instance={inst} dimension="area" />,
  },
  "kpi-trend-by-client": {
    type: "kpi-trend-by-client",
    label: "Andamento per cliente",
    defaultSize: { w: 6, h: 3 },
    minSize: { w: 4, h: 3 },
    render: (inst) => <KpiMultiTrendWidget instance={inst} dimension="client" />,
  },
  "kpi-gauge": {
    type: "kpi-gauge",
    label: "Indicatore percentuale",
    defaultSize: { w: 3, h: 3 },
    minSize: { w: 2, h: 2 },
    render: (inst) => <KpiGaugeWidget instance={inst} />,
  },
  "kpi-status-donut": {
    type: "kpi-status-donut",
    label: "Backlog per stato",
    defaultSize: { w: 5, h: 3 },
    minSize: { w: 3, h: 2 },
    render: (inst) => <KpiStatusDonutWidget instance={inst} />,
  },
  "kpi-est-actual": {
    type: "kpi-est-actual",
    label: "Stimato vs effettivo",
    defaultSize: { w: 4, h: 3 },
    minSize: { w: 3, h: 2 },
    render: (inst) => <KpiEstActualWidget instance={inst} />,
  },

  // ── Visualizzazione rapida (liste, non KPI) ────────────────────────────────
  "qw-notifications": { type: "qw-notifications", label: "Notifiche", defaultSize: { w: 4, h: 4 }, minSize: { w: 3, h: 3 }, render: () => <NotificationsWidget /> },
  "qw-work-items": { type: "qw-work-items", label: "Lavorazioni", defaultSize: { w: 4, h: 4 }, minSize: { w: 3, h: 3 }, render: () => <WorkItemsWidget /> },
  "qw-requests": { type: "qw-requests", label: "Richieste", defaultSize: { w: 4, h: 4 }, minSize: { w: 3, h: 3 }, render: () => <RequestsWidget /> },
  "qw-daily-tasks": { type: "qw-daily-tasks", label: "Attività del giorno", defaultSize: { w: 4, h: 4 }, minSize: { w: 3, h: 3 }, render: () => <DailyTasksWidget /> },
  "qw-workload": { type: "qw-workload", label: "Workload", defaultSize: { w: 4, h: 4 }, minSize: { w: 3, h: 3 }, render: () => <WorkloadWidget /> },
  "qw-quick-links": { type: "qw-quick-links", label: "Collegamenti rapidi", defaultSize: { w: 3, h: 4 }, minSize: { w: 2, h: 3 }, render: () => <QuickLinksWidget /> },
  "qw-recent-clients": { type: "qw-recent-clients", label: "Ultimi clienti", defaultSize: { w: 4, h: 4 }, minSize: { w: 3, h: 3 }, render: () => <RecentClientsWidget /> },
  "qw-clients-situation": { type: "qw-clients-situation", label: "Situazioni clienti", defaultSize: { w: 5, h: 4 }, minSize: { w: 4, h: 3 }, render: () => <ClientsSituationWidget /> },
  "qw-quotes": { type: "qw-quotes", label: "Preventivi", defaultSize: { w: 5, h: 4 }, minSize: { w: 4, h: 3 }, render: () => <QuotesWidget /> },
  "qw-pipeline": { type: "qw-pipeline", label: "Pipeline commerciale", defaultSize: { w: 5, h: 3 }, minSize: { w: 3, h: 3 }, render: () => <PipelineWidget /> },
  "qw-billing": { type: "qw-billing", label: "Fatturazione", defaultSize: { w: 5, h: 4 }, minSize: { w: 4, h: 3 }, render: () => <BillingWidget /> },
};

export function getWidgetDef(type: string): WidgetDef | undefined {
  return WIDGET_REGISTRY[type];
}
