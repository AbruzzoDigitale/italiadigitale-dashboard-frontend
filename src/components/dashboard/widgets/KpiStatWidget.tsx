import { useEffect, useRef, useState } from "react";
import { useKpiData } from "../KpiDataContext";
import { Spinner } from "../../ui/Spinner";
import { Icon, type IconName } from "../../ui/Icon";
import { formatKpiValue } from "./format";
import type { WidgetInstance } from "./types";

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/** Icona rappresentativa per KPI. Mappa gli id noti, poi ripiega su unità. */
function kpiIconName(kpiId: string, unit?: string): IconName {
  const byId: Record<string, IconName> = {
    wi_completed: "check-circle",
    wi_open: "list",
    wi_overdue: "clock",
    wi_on_time_rate: "target",
    wi_cycle_time_avg: "clock",
    wi_wip_load: "activity",
    wi_rework_rate: "refresh-cw",
    wi_estimate_accuracy: "target",
  };
  if (byId[kpiId]) return byId[kpiId];
  switch (unit) {
    case "eur":
      return "credit-card";
    case "pct":
    case "ratio":
      return "target";
    case "days":
    case "hours":
      return "clock";
    default:
      return "activity";
  }
}

/** Misura il contenitore per dimensionare i testi in base alla card. */
function useSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setSize({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  return { ref, ...size };
}

/** Widget "valore KPI": mostra il numero corrente di una KPI, formattato per unità. */
export function KpiStatWidget({ instance }: { instance: WidgetInstance }) {
  const { values, catalog, loading } = useKpiData();
  const { ref, w, h } = useSize();
  const kpiId = String(instance.config.kpiId ?? "");
  const value = values[kpiId];
  const meta = catalog.find((c) => c.id === kpiId);

  const label = value?.label ?? meta?.label ?? kpiId ?? "KPI";
  const unit = value?.unit ?? meta?.unit ?? "count";
  const kind = value?.kind ?? meta?.kind;

  const breakdown = value?.breakdown as { by_operator?: Record<string, number> } | null | undefined;
  const opCount = breakdown?.by_operator ? Object.keys(breakdown.by_operator).length : 0;

  const bgColor = typeof instance.config.bgColor === "string" ? instance.config.bgColor : undefined;
  const onTint = !!bgColor; // le tinte sono chiare → testo scuro in entrambi i temi
  const iconName = kpiIconName(kpiId, unit);

  // Dimensioni responsive in base alla card (fallback finché non è misurata).
  const ready = w > 0 && h > 0;
  const valueSize = ready ? clamp(Math.min(h * 0.4, w * 0.22), 28, 76) : 32;
  const labelSize = ready ? clamp(Math.min(h * 0.11, w * 0.05), 11, 15) : 12;
  const subSize = clamp(labelSize - 1, 10, 13);
  const iconBox = Math.round(labelSize * 1.55);

  const labelCls = onTint ? "text-black/60" : "text-muted dark:text-[#9999a0]";
  const valueCls = onTint ? "text-ink" : "text-ink dark:text-[#f4f4f7]";
  const subCls = onTint ? "text-black/55" : "text-muted dark:text-[#9999a0]";
  const pillCls = onTint
    ? "bg-black/10 text-black/60"
    : "bg-cream text-muted dark:bg-[#1c1c20] dark:text-[#9999a0]";

  return (
    <div ref={ref} className="flex h-full flex-col justify-between gap-2 p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="flex-shrink-0" style={{ width: iconBox, height: iconBox }}>
            <Icon name={iconName} className="h-full w-full text-brand-magenta" />
          </span>
          <p
            className={`truncate font-semibold uppercase tracking-wider ${labelCls}`}
            style={{ fontSize: labelSize }}
          >
            {label}
          </p>
        </span>
        {kind && (
          <span
            className={`flex-shrink-0 rounded-pill px-2 py-0.5 font-semibold ${pillCls}`}
            style={{ fontSize: subSize }}
          >
            {kind === "stock" ? "ora" : "mese"}
          </span>
        )}
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 items-center">
        {loading && !value ? (
          <Spinner size="sm" />
        ) : (
          <span
            className={`block max-w-full truncate font-display font-bold leading-none tracking-tight ${valueCls}`}
            style={{ fontSize: valueSize }}
          >
            {formatKpiValue(value?.value ?? null, unit)}
          </span>
        )}
      </div>

      {opCount > 0 && (
        <p className={subCls} style={{ fontSize: subSize }}>
          su {opCount} operator{opCount === 1 ? "e" : "i"}
        </p>
      )}
    </div>
  );
}
