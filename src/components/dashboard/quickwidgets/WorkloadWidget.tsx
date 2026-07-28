import { listWorkloadUsersApi } from "../../../api/workload";
import { useAuth } from "../../../hooks/useAuth";
import { useKpiData } from "../KpiDataContext";
import { QuickListFrame, QuickRow, useQuickData } from "./QuickListFrame";

export function WorkloadWidget() {
  const { activeCompanyId } = useAuth();
  const { privileged } = useKpiData();
  const { data, loading } = useQuickData(
    () =>
      privileged
        ? listWorkloadUsersApi({
            company_id: activeCompanyId ?? undefined,
            sort_by: "utilization",
            sort_dir: "desc",
          })
        : Promise.resolve([]),
    [activeCompanyId, privileged],
  );

  // Panoramica del carico del TEAM: solo admin/PM (l'operatore vede solo sé stesso).
  if (!privileged) {
    return (
      <QuickListFrame title="Workload" icon="activity" empty emptyText="Panoramica team: solo admin/PM" />
    );
  }

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
