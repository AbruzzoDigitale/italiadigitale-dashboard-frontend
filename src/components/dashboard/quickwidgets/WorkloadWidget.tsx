import { listWorkloadUsersApi } from "../../../api/workload";
import { useAuth } from "../../../hooks/useAuth";
import { QuickListFrame, QuickRow, useQuickData } from "./QuickListFrame";

export function WorkloadWidget() {
  const { activeCompanyId } = useAuth();
  const { data, loading } = useQuickData(
    () =>
      listWorkloadUsersApi({
        company_id: activeCompanyId ?? undefined,
        sort_by: "utilization",
        sort_dir: "desc",
      }),
    [activeCompanyId],
  );
  const users = (data ?? []).slice(0, 12);
  return (
    <QuickListFrame
      title="Workload"
      icon="activity"
      to="/workload"
      loading={loading}
      empty={users.length === 0}
      emptyText="Nessun operatore"
    >
      {users.map((u) => {
        const pct = Math.round(u.utilization_percent);
        const tone = pct > 100 ? "text-danger" : pct > 80 ? "text-warning" : "text-success";
        return (
          <QuickRow
            key={u.user_id}
            title={u.full_name || u.username}
            sub={`${u.assigned_tasks_count} task`}
            right={<span className={`text-[12px] font-bold ${tone}`}>{pct}%</span>}
          />
        );
      })}
    </QuickListFrame>
  );
}
