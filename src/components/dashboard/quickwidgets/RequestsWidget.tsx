import { getRequestsApi } from "../../../api/requests";
import { useAuth } from "../../../hooks/useAuth";
import { QuickListFrame, QuickRow, useQuickData } from "./QuickListFrame";
import { QuoteStatusBadge } from "./badges";

export function RequestsWidget() {
  const { activeCompanyId } = useAuth();
  const { data, loading } = useQuickData(
    () =>
      getRequestsApi({
        company_id: activeCompanyId ?? undefined,
        per_page: 10,
        sort_by: "created_at",
        sort_dir: "desc",
      }),
    [activeCompanyId],
  );
  const items = data?.data ?? [];
  return (
    <QuickListFrame
      title="Richieste"
      icon="annotation"
      to="/requests"
      count={data?.total}
      loading={loading}
      empty={items.length === 0}
      emptyText="Nessuna richiesta"
    >
      {items.map((q) => (
        <QuickRow
          key={q.id}
          title={q.title || q.number}
          sub={q.client_commercial_name || q.client_name || undefined}
          right={<QuoteStatusBadge status={q.status} />}
        />
      ))}
    </QuickListFrame>
  );
}
