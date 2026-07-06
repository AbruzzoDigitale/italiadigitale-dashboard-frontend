import { useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import {
  buildNotifGroups,
  NOTIF_COM_FILTERS,
  NOTIF_TABS,
  NOTIF_TYPES,
  type NotifGroup,
  type NotifItem,
  type NotifTabKey,
} from "./notificationsData";
import type { UseNotificationsReturn } from "./useNotifications";
import "./notifications.css";

interface NotificationCenterProps {
  open: boolean;
  onClose: () => void;
  notifications: UseNotificationsReturn;
  onOpenPreferences: () => void;
}

function NotifItemRow({ item, onActivate }: { item: NotifItem; onActivate: (item: NotifItem) => void }) {
  const meta = NOTIF_TYPES[item.type] ?? { label: item.type, icon: "bell" as const, tone: "neutral" as const };
  return (
    <div
      className={`nt-item tone-${meta.tone}${item.unread ? " unread" : ""}`}
      onClick={() => onActivate(item)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onActivate(item);
      }}
    >
      <span className="nt-ic">
        <Icon name={meta.icon} className="h-4 w-4" />
      </span>
      <div className="nt-body">
        <div className="nt-line1">
          <span className="nt-title">{item.title}</span>
          {item.ref && <span className="nt-ref">{item.ref}</span>}
        </div>
        <div className="nt-line2">
          <span className={`nt-badge tone-${meta.tone}`}>{meta.label}</span>
          {(item.scope ?? item.who) && <span className="nt-who">{item.scope ?? item.who}</span>}
        </div>
        {item.note && <div className="nt-note">{item.note}</div>}
      </div>
      <div className="nt-meta">
        <span className="nt-time">{item.time}</span>
        {item.unread && <span className="nt-dot" />}
      </div>
    </div>
  );
}

function GroupedList({ groups, onActivate }: { groups: NotifGroup[]; onActivate: (item: NotifItem) => void }) {
  if (groups.length === 0) return <EmptyState />;
  return (
    <div className="nt-groups">
      {groups.map((g) => {
        const unread = g.items.filter((i) => i.unread).length;
        return (
          <div className="nt-group" key={g.key}>
            <div className="nt-group-head">
              <span className="nt-group-name">{g.label}</span>
              <span className="nt-group-count">{g.items.length}</span>
              {unread > 0 && <span className="nt-group-unread">{unread} nuove</span>}
            </div>
            <div className="nt-group-items">
              {g.items.map((it) => (
                <NotifItemRow key={it.id} item={it} onActivate={onActivate} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FlatList({ items, onActivate }: { items: NotifItem[]; onActivate: (item: NotifItem) => void }) {
  if (items.length === 0) return <EmptyState />;
  return (
    <div className="nt-group-items flat">
      {items.map((it) => (
        <NotifItemRow key={it.id} item={it} onActivate={onActivate} />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="nt-empty">
      <Icon name="check-circle" className="h-5 w-5" />
      Nessuna notifica
    </div>
  );
}

export function NotificationCenter({ open, onClose, notifications, onOpenPreferences }: NotificationCenterProps) {
  const { counts, itemsByTab, markRead, markAllRead } = notifications;
  const navigate = useNavigate();
  const [tab, setTab] = useState<NotifTabKey>("task");
  const [comFilter, setComFilter] = useState<string>("all");

  if (!open) return null;

  // Click su una notifica: la segna come letta e, se è di una lavorazione,
  // porta alla board Lavorazioni aprendo il modal di quella task.
  const handleActivate = (item: NotifItem) => {
    markRead(item.id);
    const isTask = item.tab === "task" || item.entity_type === "work_item";
    if (isTask && item.entity_id != null) {
      onClose();
      navigate({ pathname: "/work-items", search: `?open=${item.entity_id}` });
    }
  };

  const comItems = itemsByTab("comunicazioni").filter((m) => comFilter === "all" || m.type === comFilter);

  return createPortal(
    <>
      <div className="nt-scrim" onClick={onClose} />
      <div className="nt-panel" role="dialog" aria-label="Centro notifiche">
        <div className="nt-head">
          <div className="nt-head-top">
            <h3>
              <Icon name="bell" className="h-[17px] w-[17px]" /> Centro notifiche
            </h3>
            <button type="button" className="nt-close" onClick={onClose} aria-label="Chiudi">
              <Icon name="x" className="h-4 w-4" />
            </button>
          </div>
          <div className="nt-tabs">
            {NOTIF_TABS.map((tb) => (
              <button
                key={tb.key}
                type="button"
                className={`nt-tab${tab === tb.key ? " on" : ""}`}
                onClick={() => setTab(tb.key)}
              >
                <Icon name={tb.icon} className="h-[15px] w-[15px]" /> {tb.label}
                {counts[tb.key] > 0 && <span className="nt-tab-badge">{counts[tb.key]}</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="nt-toolbar">
          {tab === "comunicazioni" ? (
            <div className="nt-comfilters">
              {NOTIF_COM_FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className={`nt-chip${comFilter === f.key ? " on" : ""}${f.tone ? ` tone-${f.tone}` : ""}`}
                  onClick={() => setComFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          ) : (
            <span className="nt-hint">{counts[tab]} non lette</span>
          )}
          <button type="button" className="nt-readall" onClick={() => markAllRead(tab)}>
            <Icon name="check-circle" className="h-3.5 w-3.5" /> Segna tutte lette
          </button>
        </div>

        <div className="nt-scroll">
          {tab === "task" && <GroupedList groups={buildNotifGroups("task", itemsByTab("task"))} onActivate={handleActivate} />}
          {tab === "richieste" && <FlatList items={itemsByTab("richieste")} onActivate={handleActivate} />}
          {tab === "contratti" && <GroupedList groups={buildNotifGroups("contratti", itemsByTab("contratti"))} onActivate={handleActivate} />}
          {tab === "comunicazioni" && <FlatList items={comItems} onActivate={handleActivate} />}
        </div>

        <div className="nt-foot">
          <button type="button" className="nt-foot-btn" onClick={onOpenPreferences}>
            <Icon name="settings" className="h-3.5 w-3.5" /> Preferenze notifiche
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
