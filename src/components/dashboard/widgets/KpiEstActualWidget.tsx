import { useKpiData } from "../KpiDataContext";
import { PairedBars } from "../charts/primitives";
import { ChartFrame } from "./ChartFrame";
import type { WidgetInstance } from "./types";

/** Widget "stimato vs effettivo": barre appaiate dal breakdown ore. */
export function KpiEstActualWidget({ instance }: { instance: WidgetInstance }) {
  const { values, catalog } = useKpiData();
  const kpiId = String(instance.config.kpiId ?? "wi_estimate_accuracy");
  const meta = catalog.find((c) => c.id === kpiId);
  const value = values[kpiId];
  const bd = value?.breakdown as { estimated?: number; actual?: number } | null | undefined;
  const est = Number(bd?.estimated ?? 0);
  const act = Number(bd?.actual ?? 0);
  const ratio = value?.value;

  return (
    <ChartFrame
      type="kpi-est-actual"
      title="Ore: stimato vs effettivo"
      subtitle={
        ratio != null
          ? `${meta?.label ?? ""} · ${ratio.toLocaleString("it-IT", { maximumFractionDigits: 2 })}×`
          : meta?.label
      }
    >
      <PairedBars a={{ label: "Stimato", value: est }} b={{ label: "Effettivo", value: act }} />
    </ChartFrame>
  );
}
