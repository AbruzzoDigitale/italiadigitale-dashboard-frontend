import React from "react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: string;
  trendUp?: boolean;
  accent?: string;
}

export function StatCard({
  label,
  value,
  icon,
  trend,
  trendUp,
  accent = "bg-ink dark:bg-ink-2",
}: StatCardProps) {
  return (
    <div className="bg-paper dark:bg-ink-soft rounded-lg border border-line dark:border-line-dark p-5 flex flex-col gap-3 hover:-translate-y-0.5 hover:shadow-2 transition-all duration-200 animate-fadeIn">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
          {label}
        </p>
        <div
          className={`w-9 h-9 rounded-lg ${accent} flex items-center justify-center text-paper`}
        >
          {icon}
        </div>
      </div>
      <p className="font-display font-bold text-[44px] leading-none tracking-tight text-ink dark:text-paper">
        {value}
      </p>
      {trend && (
        <p
          className={`text-xs font-semibold ${
            trendUp ? "text-success" : "text-muted dark:text-muted-dark"
          }`}
        >
          {trend}
        </p>
      )}
    </div>
  );
}
