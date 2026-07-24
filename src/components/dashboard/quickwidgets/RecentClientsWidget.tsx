import { getClientsApi } from "../../../api/clients";
import { useAuth } from "../../../hooks/useAuth";
import { QuickListFrame, QuickRow, fmtDate, useQuickData } from "./QuickListFrame";

export function RecentClientsWidget() {
  const { activeCompanyId } = useAuth();
  const { data, loading } = useQuickData(
    () =>
      getClientsApi({
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
      title="Ultimi clienti"
      icon="users"
      to="/clients"
      count={data?.total}
      loading={loading}
      empty={items.length === 0}
      emptyText="Nessun cliente"
    >
      {items.map((c) => (
        <QuickRow
          key={c.id}
          title={c.commercial_name || c.name}
          sub={[c.city, fmtDate(c.created_at)].filter(Boolean).join(" · ") || undefined}
        />
      ))}
    </QuickListFrame>
  );
}
