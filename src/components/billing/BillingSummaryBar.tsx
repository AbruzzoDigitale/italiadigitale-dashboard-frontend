import { formatEur } from "../../api/quotes";
import type { BillingStats } from "../../utils/billing";

interface BillingSummaryBarProps {
  stats: BillingStats;
}

interface Metric {
  label: string;
  value: string;
  tone?: "default" | "warning" | "success";
}

export function BillingSummaryBar({ stats }: BillingSummaryBarProps) {
  const metrics: Metric[] = [
    { label: "voci totali", value: String(stats.totalCount) },
    { label: "da fatturare", value: String(stats.toBillCount), tone: "warning" },
    { label: "importo da fatturare", value: formatEur(stats.toBillAmount), tone: "warning" },
    { label: "già fatturato", value: formatEur(stats.billedAmount), tone: "success" },
    { label: "canone", value: formatEur(stats.canoneAmount) },
    { label: "una tantum", value: formatEur(stats.unaTantumAmount) },
  ];

  const toneClass: Record<NonNullable<Metric["tone"]>, string> = {
    default: "text-ink dark:text-paper",
    warning: "text-warning",
    success: "text-success",
  };

  return (
    <div className="rounded-2xl border border-line bg-paper px-5 py-4 dark:border-[#2a2a2e] dark:bg-[#131316]">
      <div className="flex flex-wrap items-center gap-x-7 gap-y-3">
        {metrics.map((metric) => (
          <div key={metric.label} className="flex items-baseline gap-2">
            <span className={`text-[17px] font-bold ${toneClass[metric.tone ?? "default"]}`}>
              {metric.value}
            </span>
            <span className="text-[12px] text-muted dark:text-muted-dark">{metric.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
