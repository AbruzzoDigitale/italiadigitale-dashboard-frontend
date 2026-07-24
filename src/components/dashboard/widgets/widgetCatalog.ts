import type { KpiCatalogItem } from "../../../api/kpi";

/**
 * Tipi di widget disponibili nel selettore "Aggiungi widget", con la regola di
 * quali KPI sono applicabili a ciascun tipo.
 */
export interface WidgetTypeDef {
  type: string;
  label: string;
  description: string;
  applies: (kpi: KpiCatalogItem) => boolean;
}

export const WIDGET_TYPES: WidgetTypeDef[] = [
  { type: "kpi-stat", label: "Valore", description: "Il numero della KPI.", applies: () => true },
  {
    type: "kpi-trend",
    label: "Andamento nel tempo",
    description: "Grafico a linea dallo storico.",
    applies: () => true,
  },
  {
    type: "kpi-gauge",
    label: "Indicatore percentuale",
    description: "Anello colorato per le percentuali.",
    applies: (k) => k.unit === "pct",
  },
  {
    type: "kpi-by-operator",
    label: "Per operatore",
    description: "Barre di confronto per assegnatario.",
    applies: (k) => k.id === "wi_completed" || k.id === "wi_open",
  },
  {
    type: "kpi-by-area",
    label: "Per area",
    description: "Barre di confronto per area di lavoro.",
    applies: (k) => k.id === "wi_completed" || k.id === "wi_open",
  },
  {
    type: "kpi-by-client",
    label: "Per cliente",
    description: "Barre di confronto per cliente.",
    applies: (k) => k.id === "wi_completed" || k.id === "wi_open",
  },
  {
    type: "kpi-trend-by-operator",
    label: "Andamento per operatore",
    description: "Linee di confronto per operatore nel tempo.",
    applies: (k) => k.id === "wi_completed" || k.id === "wi_open",
  },
  {
    type: "kpi-trend-by-area",
    label: "Andamento per area",
    description: "Linee di confronto per area nel tempo.",
    applies: (k) => k.id === "wi_completed" || k.id === "wi_open",
  },
  {
    type: "kpi-trend-by-client",
    label: "Andamento per cliente",
    description: "Linee di confronto per cliente nel tempo.",
    applies: (k) => k.id === "wi_completed" || k.id === "wi_open",
  },
  {
    type: "kpi-status-donut",
    label: "Backlog per stato",
    description: "Composizione delle lavorazioni aperte.",
    applies: (k) => k.id === "wi_open",
  },
  {
    type: "kpi-est-actual",
    label: "Stimato vs effettivo",
    description: "Ore stimate contro ore reali.",
    applies: (k) => k.id === "wi_estimate_accuracy",
  },
];
