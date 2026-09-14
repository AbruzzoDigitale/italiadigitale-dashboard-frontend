import { getDailyTasksSelfApi } from "../../../api/workload";
import { useAuth } from "../../../hooks/useAuth";
import { QuickListFrame, QuickRow, useQuickData } from "./QuickListFrame";
import { WorkItemStatusBadge } from "./badges";

export function DailyTasksWidget() {
  const { activeCompanyId } = useAuth();
  const { data, loading } = useQuickData(
    () => getDailyTasksSelfApi({ company_id: activeCompanyId ?? undefined }),
    [activeCompanyId],
  );
  const tasks = (data?.tasks ?? []).filter((t) => !t.is_completed).slice(0, 12);
  return (
    <QuickListFrame
      title="Attività del giorno"
      icon="clock"
      to="/daily-tasks"
      count={data?.tasks_pending}
      loading={loading}
      empty={tasks.length === 0}
      emptyText="Nessuna attività per oggi"
    >
      {tasks.map((t) => (
        <QuickRow
          key={t.work_item_id}
          title={t.title}
          sub={[t.start_time, t.client_name].filter(Boolean).join(" · ") || undefined}
          right={<WorkItemStatusBadge status={t.status} />}
        />
      ))}
    </QuickListFrame>
  );
}
