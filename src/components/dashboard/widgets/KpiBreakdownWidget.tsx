import { useKpiData } from "../KpiDataContext";
import { BarsH } from "../charts/primitives";
import { ChartFrame } from "./ChartFrame";
import type { WidgetInstance } from "./types";

export type BreakdownDimension = "operator" | "area" | "client";

const DIM: Record<BreakdownDimension, { key: string; type: string; subtitle: string }> = {
  operator: { key: "by_operator", type: "kpi-by-operator", subtitle: "Per operatore" },
  area: { key: "by_area", type: "kpi-by-area", subtitle: "Per area" },
  client: { key: "by_client", type: "kpi-by-client", subtitle: "Per cliente" },
};

/**
 * Widget di confronto: una barra per entità (operatore/area/cliente) dal breakdown.
 * Se nel filtro è selezionato un sottoinsieme di QUESTA dimensione → mostra solo quelle
 * entità (confronto mirato); altrimenti le mostra tutte (top 12).
 */
export function KpiBreakdownWidget({
  instance,
  dimension,
}: {
  instance: WidgetInstance;
  dimension: BreakdownDimension;
}) {
  const { values, catalog, userName, areaName, clientName, filter } = useKpiData();
  const kpiId = String(instance.config.kpiId ?? "");
  const meta = catalog.find((c) => c.id === kpiId);
  const value = values[kpiId];
  const cfg = DIM[dimension];

  const breakdown = (value?.breakdown as Record<string, Record<string, number>> | null | undefined) ?? {};
  const raw = breakdown[cfg.key] ?? {};

  const nameOf = dimension === "operator" ? userName : dimension === "area" ? areaName : clientName;
  const selected =
    dimension === "operator" ? filter.operatorIds : dimension === "area" ? filter.workAreaIds : filter.clientIds;
  const selectedSet = new Set(selected.map(String));

  let items = Object.entries(raw).map(([id, count]) => ({
    id,
    label: nameOf(Number(id)),
    value: Number(count),
  }));
  if (selectedSet.size > 0) items = items.filter((it) => selectedSet.has(it.id));
  items.sort((a, b) => b.value - a.value);

  return (
    <ChartFrame type={cfg.type} title={meta?.label ?? kpiId} subtitle={cfg.subtitle}>
      <BarsH items={items.slice(0, 12).map(({ label, value: v }) => ({ label, value: v }))} />
    </ChartFrame>
  );
}
