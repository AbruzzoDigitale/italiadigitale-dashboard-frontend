import type { KpiUnit } from "../../../api/kpi";

/** Formatta un valore KPI in base all'unità, con locale italiano. */
export function formatKpiValue(value: number | null, unit: KpiUnit): string {
  if (value == null || Number.isNaN(value)) return "—";
  const it = "it-IT";
  switch (unit) {
    case "eur":
      return new Intl.NumberFormat(it, {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
      }).format(value);
    case "pct":
      return `${value.toLocaleString(it, { maximumFractionDigits: 1 })}%`;
    case "days":
      return `${value.toLocaleString(it, { maximumFractionDigits: 1 })} g`;
    case "hours":
      return `${value.toLocaleString(it, { maximumFractionDigits: 1 })} h`;
    case "ratio":
      return `${value.toLocaleString(it, { maximumFractionDigits: 2 })}×`;
    case "count":
    default:
      return value.toLocaleString(it, { maximumFractionDigits: 0 });
  }
}
