import { useEffect, useState } from "react";
import { useKpiData } from "../KpiDataContext";
import { getKpiHistoryApi, type KpiHistoryPoint } from "../../../api/kpi";
import { LineChart } from "../charts/primitives";
import { ChartFrame } from "./ChartFrame";
import { formatKpiValue } from "./format";
import { Spinner } from "../../ui/Spinner";
import type { WidgetInstance } from "./types";

/** Widget "andamento": grafico a linea di una KPI dagli snapshot storici. */
export function KpiTrendWidget({ instance }: { instance: WidgetInstance }) {
  const { catalog, companyId } = useKpiData();
  const kpiId = String(instance.config.kpiId ?? "");
  const meta = catalog.find((c) => c.id === kpiId);
  const periodType: "day" | "month" = meta?.kind === "stock" ? "day" : "month";
  const [points, setPoints] = useState<KpiHistoryPoint[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPoints(null);
    getKpiHistoryApi({ kpiId, companyId, periodType, limit: 120 })
      .then((r) => !cancelled && setPoints(r.points))
      .catch(() => !cancelled && setPoints([]));
    return () => {
      cancelled = true;
    };
  }, [kpiId, companyId, periodType]);

  const lastValue = points?.slice().reverse().find((p) => p.value != null)?.value ?? null;
  const baseSub = periodType === "day" ? "Andamento giornaliero" : "Andamento mensile";
  const subtitle =
    lastValue != null ? `${baseSub} · ultimo ${formatKpiValue(lastValue, meta?.unit ?? "count")}` : baseSub;

  return (
    <ChartFrame type="kpi-trend" title={meta?.label ?? kpiId} subtitle={subtitle}>
      {points == null ? (
        <div className="flex h-full items-center justify-center">
          <Spinner size="sm" />
        </div>
      ) : (
        <LineChart
          points={points.map((p) => ({ label: p.period_key, value: p.value }))}
          format={(n) => formatKpiValue(n, meta?.unit ?? "count")}
        />
      )}
    </ChartFrame>
  );
}
