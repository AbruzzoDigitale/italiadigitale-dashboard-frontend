import { getQuotesApi } from "../../../api/quotes";
import { useAuth } from "../../../hooks/useAuth";
import { QuickListFrame, QuickRow, fmtMoney, useQuickData } from "./QuickListFrame";
import { QuoteStatusBadge } from "./badges";

export function QuotesWidget() {
  const { activeCompanyId } = useAuth();
  const { data, loading } = useQuickData(
    () =>
      getQuotesApi({
        company_id: activeCompanyId ?? undefined,
        per_page: 12,
        sort_by: "created_at",
        sort_dir: "desc",
      }),
    [activeCompanyId],
  );
  const items = data?.data ?? [];
  return (
    <QuickListFrame
      title="Preventivi"
      icon="document-text"
      to="/quotes"
      count={data?.total}
      loading={loading}
      empty={items.length === 0}
      emptyText="Nessun preventivo"
    >
      {items.map((q) => (
        <QuickRow
          key={q.id}
          title={`${q.number} · ${q.title}`}
          sub={
            [q.client_commercial_name || q.client_name, fmtMoney(q.totals?.total)].filter(Boolean).join(" · ") ||
            undefined
          }
          right={<QuoteStatusBadge status={q.status} />}
        />
      ))}
    </QuickListFrame>
  );
}
