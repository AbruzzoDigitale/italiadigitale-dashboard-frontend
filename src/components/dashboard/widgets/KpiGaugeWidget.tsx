import { useKpiData } from "../KpiDataContext";
import { Gauge } from "../charts/primitives";
import { ChartFrame } from "./ChartFrame";
import type { WidgetInstance } from "./types";

/** Widget "indicatore %": gauge radiale per le KPI percentuali. */
export function KpiGaugeWidget({ instance }: { instance: WidgetInstance }) {
  const { values, catalog } = useKpiData();
  const kpiId = String(instance.config.kpiId ?? "");
  const meta = catalog.find((c) => c.id === kpiId);
  const value = values[kpiId];
  // Per rework e slittamento un valore alto è NEGATIVO → colore invertito.
  const positiveHigh = !["wi_rework_rate", "wi_slip_rate"].includes(kpiId);

  return (
    <ChartFrame type="kpi-gauge" title={meta?.label ?? kpiId}>
      <Gauge value={value?.value ?? null} positiveHigh={positiveHigh} />
    </ChartFrame>
  );
}
