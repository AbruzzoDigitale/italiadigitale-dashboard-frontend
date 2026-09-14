import { getMyNotificationsApi } from "../../../api/notifications";
import { QuickListFrame, QuickRow, useQuickData } from "./QuickListFrame";

export function NotificationsWidget() {
  const { data, loading } = useQuickData(() => getMyNotificationsApi(20, false), []);
  const all = data?.items ?? [];
  const items = all.slice(0, 12);
  const unread = all.filter((n) => n.unread).length;
  return (
    <QuickListFrame
      title="Notifiche"
      icon="bell"
      count={unread}
      loading={loading}
      empty={items.length === 0}
      emptyText="Nessuna notifica"
    >
      {items.map((n) => (
        <QuickRow key={n.id} title={n.title} sub={n.time} bold={n.unread} />
      ))}
    </QuickListFrame>
  );
}
