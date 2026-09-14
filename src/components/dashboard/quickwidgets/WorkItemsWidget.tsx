import { listWorkItemsApi } from "../../../api/workItems";
import { useAuth } from "../../../hooks/useAuth";
import { QuickListFrame, QuickRow, fmtDate, useQuickData } from "./QuickListFrame";
import { WorkItemStatusBadge } from "./badges";

export function WorkItemsWidget() {
  const { activeCompanyId } = useAuth();
  const { data, loading } = useQuickData(
    () => listWorkItemsApi({ company_id: activeCompanyId ?? undefined, is_completed: false }),
    [activeCompanyId],
  );
  const items = (data ?? []).slice(0, 12);
  return (
    <QuickListFrame
      title="Lavorazioni"
      icon="list"
      to="/work-items"
      count={data?.length}
      loading={loading}
      empty={items.length === 0}
      emptyText="Nessuna lavorazione aperta"
    >
      {items.map((w) => (
        <QuickRow
          key={w.id}
          title={w.title}
          sub={w.deadline_date ? `Scadenza ${fmtDate(w.deadline_date)}` : undefined}
          right={<WorkItemStatusBadge status={w.status} />}
        />
      ))}
    </QuickListFrame>
  );
}
