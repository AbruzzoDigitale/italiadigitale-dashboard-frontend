import { formatEur } from "../../api/quotes";
import type { BillingItem, BillingStatus } from "../../utils/billing";
import { BillingItemRow } from "./BillingItemRow";

interface BillingClientGroupProps {
  clientName: string;
  items: BillingItem[];
  onSetStatus: (key: string, status: BillingStatus, ficPlaceholder?: boolean) => void;
}

export function BillingClientGroup({ clientName, items, onSetStatus }: BillingClientGroupProps) {
  const toBill = items.filter((item) => item.status === "da_fatturare");
  const toBillTotal = toBill.reduce((sum, item) => sum + item.amount, 0);

  return (
    <section className="rounded-2xl border border-line bg-cream/40 p-4 dark:border-[#2a2a2e] dark:bg-[#101013]">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2 px-1">
        <h2 className="text-[15px] font-bold uppercase tracking-wide text-ink dark:text-paper">
          {clientName}
        </h2>
        <span className="text-[12px] text-muted dark:text-muted-dark">
          {toBill.length > 0
            ? `${toBill.length} da fatturare · ${formatEur(toBillTotal)}`
            : "Tutto fatturato"}
        </span>
      </header>

      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <BillingItemRow key={item.key} item={item} onSetStatus={onSetStatus} />
        ))}
      </div>
    </section>
  );
}
