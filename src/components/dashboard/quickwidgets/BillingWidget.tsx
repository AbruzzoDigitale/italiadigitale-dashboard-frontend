import { listBillingItemsApi } from "../../../api/billing";
import { QuickListFrame, QuickRow, fmtMoney, useQuickData } from "./QuickListFrame";

export function BillingWidget() {
  const { data, loading } = useQuickData(() => listBillingItemsApi(), []);
  const summary = data?.summary;
  const todo = (data?.items ?? []).filter((i) => i.state === "da_fatturare").slice(0, 8);

  return (
    <QuickListFrame
      title="Fatturazione"
      icon="credit-card"
      to="/fatturazione"
      count={summary?.todo_count}
      loading={loading}
      empty={!summary}
      emptyText="Nessun dato"
    >
      <div className="mb-2 flex gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted dark:text-[#9999a0]">Da fatturare</p>
          <p className="font-display text-[18px] font-bold leading-tight text-ink dark:text-[#f4f4f7]">
            {fmtMoney(summary?.todo_total)}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted dark:text-[#9999a0]">Fatturato</p>
          <p className="font-display text-[18px] font-bold leading-tight text-ink dark:text-[#f4f4f7]">
            {fmtMoney(summary?.billed_total)}
          </p>
        </div>
      </div>
      {todo.map((i) => (
        <QuickRow
          key={`${i.work_item_id}-${i.client_id}`}
          title={i.title}
          sub={i.client_name}
          right={<span className="text-[12px] font-semibold text-ink dark:text-[#f4f4f7]">{fmtMoney(i.amount)}</span>}
        />
      ))}
    </QuickListFrame>
  );
}
