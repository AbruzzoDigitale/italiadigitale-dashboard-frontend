import { useEffect, useState } from "react";
import { useKpiData } from "../KpiDataContext";
import { getKpiHistoryApi, type KpiHistoryResponse } from "../../../api/kpi";
import { MultiLineChart, SERIES_COLORS, type Series } from "../charts/primitives";
import { ChartFrame } from "./ChartFrame";
import { formatKpiValue } from "./format";
import { Spinner } from "../../ui/Spinner";
import type { WidgetInstance } from "./types";
import type { BreakdownDimension } from "./KpiBreakdownWidget";

const TRENDDIM: Record<BreakdownDimension, { key: string; type: string; subtitle: string }> = {
  operator: { key: "by_operator", type: "kpi-trend-by-operator", subtitle: "Andamento per operatore" },
  area: { key: "by_area", type: "kpi-trend-by-area", subtitle: "Andamento per area" },
  client: { key: "by_client", type: "kpi-trend-by-client", subtitle: "Andamento per cliente" },
};

/**
 * Grafico a linea di CONFRONTO: una linea per entità (operatore/area/cliente) nel
 * tempo, dal breakdown storico. Se selezioni un sottoinsieme nel filtro → solo quelle
 * linee; altrimenti le prime 6 per volume.
 */
export function KpiMultiTrendWidget({
  instance,
  dimension,
}: {
  instance: WidgetInstance;
  dimension: BreakdownDimension;
}) {
  const { catalog, companyId, userName, areaName, clientName, filter } = useKpiData();
  const kpiId = String(instance.config.kpiId ?? "");
  const meta = catalog.find((c) => c.id === kpiId);
  const cfg = TRENDDIM[dimension];
  const periodType: "day" | "month" = meta?.kind === "stock" ? "day" : "month";
  const [history, setHistory] = useState<KpiHistoryResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHistory(null);
    getKpiHistoryApi({ kpiId, companyId, periodType, limit: 120 })
      .then((r) => !cancelled && setHistory(r))
      .catch(() => !cancelled && setHistory(null));
    return () => {
      cancelled = true;
    };
  }, [kpiId, companyId, periodType]);

  const nameOf = dimension === "operator" ? userName : dimension === "area" ? areaName : clientName;
  const selected =
    dimension === "operator" ? filter.operatorIds : dimension === "area" ? filter.workAreaIds : filter.clientIds;
  const selectedSet = new Set(selected.map(String));

  const points = history?.points ?? [];
  const totals: Record<string, number> = {};
  for (const p of points) {
    const bd = (p.breakdown as Record<string, Record<string, number>> | null | undefined)?.[cfg.key] ?? {};
    for (const [id, v] of Object.entries(bd)) totals[id] = (totals[id] ?? 0) + Number(v);
  }
  let ids = Object.keys(totals);
  if (selectedSet.size > 0) ids = ids.filter((id) => selectedSet.has(id));
  ids.sort((a, b) => totals[b] - totals[a]);
  ids = ids.slice(0, 6);

  const series: Series[] = ids.map((id, i) => ({
    name: nameOf(Number(id)),
    color: SERIES_COLORS[i % SERIES_COLORS.length],
    points: points.map((p) => ({
      label: p.period_key,
      value:
        (p.breakdown as Record<string, Record<string, number>> | null | undefined)?.[cfg.key]?.[id] ?? 0,
    })),
  }));

  return (
    <ChartFrame type={cfg.type} title={meta?.label ?? kpiId} subtitle={cfg.subtitle}>
      {history == null ? (
        <div className="flex h-full items-center justify-center">
          <Spinner size="sm" />
        </div>
      ) : series.length === 0 ? (
        <div className="flex h-full items-center justify-center text-[11px] text-muted">
          Nessun dato di confronto
        </div>
      ) : (
        <MultiLineChart series={series} format={(n) => formatKpiValue(n, meta?.unit ?? "count")} />
      )}
    </ChartFrame>
  );
}
