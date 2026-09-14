import { useKpiData } from "./KpiDataContext";
import { Icon } from "../ui/Icon";

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Selettore del mese di riferimento (stepper tematizzato, niente input nativi). */
export function DashboardPeriodPicker() {
  const { month, setMonth } = useKpiData();
  const current = new Date().toISOString().slice(0, 7);
  const isCurrent = month >= current;

  let label = month;
  try {
    label = new Date(`${month}-01T00:00:00`).toLocaleDateString("it-IT", { month: "long", year: "numeric" });
  } catch {
    /* fallback alla chiave */
  }

  return (
    <div className="inline-flex items-center gap-0.5 rounded-md border border-line bg-paper px-1 py-0.5 dark:border-[#2a2a2e] dark:bg-[#131316]">
      <button
        type="button"
        onClick={() => setMonth(shiftMonth(month, -1))}
        title="Mese precedente"
        aria-label="Mese precedente"
        className="grid h-7 w-7 place-items-center rounded text-muted transition-colors hover:bg-cream hover:text-ink dark:text-[#9999a0] dark:hover:bg-[#1c1c20] dark:hover:text-[#f4f4f7]"
      >
        <Icon name="chevron-right" className="h-4 w-4 rotate-180" />
      </button>
      <span className="min-w-[104px] text-center text-[12px] font-semibold capitalize text-ink dark:text-[#f4f4f7]">
        {label}
      </span>
      <button
        type="button"
        onClick={() => setMonth(shiftMonth(month, 1))}
        disabled={isCurrent}
        title="Mese successivo"
        aria-label="Mese successivo"
        className="grid h-7 w-7 place-items-center rounded text-muted transition-colors hover:bg-cream hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent dark:text-[#9999a0] dark:hover:bg-[#1c1c20] dark:hover:text-[#f4f4f7]"
      >
        <Icon name="chevron-right" className="h-4 w-4" />
      </button>
      {!isCurrent && (
        <button
          type="button"
          onClick={() => setMonth(current)}
          title="Vai al mese corrente"
          className="ml-0.5 rounded px-2 py-1 text-[11px] font-semibold text-brand-magenta transition-colors hover:bg-cream dark:hover:bg-[#1c1c20]"
        >
          Oggi
        </button>
      )}
    </div>
  );
}
