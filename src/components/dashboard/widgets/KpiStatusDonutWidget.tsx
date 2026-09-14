import { useKpiData } from "../KpiDataContext";
import { Donut } from "../charts/primitives";
import { ChartFrame } from "./ChartFrame";
import type { WidgetInstance } from "./types";

const STATUS_META: Record<string, { label: string; color: string }> = {
  planned: { label: "Da fare", color: "#8a8a8a" },
  in_progress: { label: "In corso", color: "#2563eb" },
  review: { label: "In revisione", color: "#f59e0b" },
  blocked: { label: "Bloccate", color: "#dc2626" },
};
const ORDER = ["planned", "in_progress", "review", "blocked"];

/** Widget "backlog per stato": ciambella dal breakdown by_status di wi_open. */
export function KpiStatusDonutWidget({ instance }: { instance: WidgetInstance }) {
  const { values, catalog } = useKpiData();
  const kpiId = String(instance.config.kpiId ?? "wi_open");
  const meta = catalog.find((c) => c.id === kpiId);
  const value = values[kpiId];
  const byStatus =
    (value?.breakdown as { by_status?: Record<string, number> } | null | undefined)?.by_status ?? {};

  const segments = ORDER.filter((s) => (byStatus[s] ?? 0) > 0).map((s) => ({
    label: STATUS_META[s].label,
    value: byStatus[s],
    color: STATUS_META[s].color,
  }));

  return (
    <ChartFrame type="kpi-status-donut" title="Backlog per stato" subtitle={meta?.label}>
      <Donut segments={segments} />
    </ChartFrame>
  );
}
