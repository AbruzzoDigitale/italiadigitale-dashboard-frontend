import type { WorkItemHistoryEvent } from "../../api/workItems";

const HISTORY_FIELD_LABELS: Record<string, string> = {
  title: "Titolo",
  description: "Descrizione",
  work_date: "Data lavorazione",
  start_time: "Orario inizio",
  deadline_date: "Scadenza",
  status: "Stato",
  progress_percent: "Avanzamento",
  is_completed: "Completata",
  estimated_hours: "Ore stimate",
  actual_hours_spent: "Ore effettive",
  affects_daily_load: "Impatto carico",
  load_weight_factor: "Fattore peso",
  is_left_behind: "Lasciata indietro",
  left_behind_reason: "Motivo ritardo",
  left_behind_note: "Nota ritardo",
  urgency_level: "Urgenza",
  is_priority: "Priorita",
  assignee_ids: "Assegnatari",
  work_area_ids: "Aree di lavoro",
  tag_ids: "Tag",
  client_id: "Cliente",
};

function formatHistoryValue(value: unknown): string {
  if (value == null) return "-";
  if (typeof value === "string") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime()) && value.includes("T")) {
      return date.toLocaleString("it-IT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function getTimelineTitle(event: WorkItemHistoryEvent): string {
  const fieldLabel = event.field_name ? (HISTORY_FIELD_LABELS[event.field_name] ?? event.field_name) : null;
  if (event.event_type === "field_updated" && fieldLabel) {
    return `Campo aggiornato: ${fieldLabel}`;
  }
  if (event.event_type === "status_changed") {
    return "Cambio stato";
  }
  return event.event_type;
}

export function WorkItemHistoryTimeline({ events }: { events: WorkItemHistoryEvent[] }) {
  return (
    <div className="rounded-md border border-line dark:border-line-dark p-3 max-h-[62vh] overflow-y-auto space-y-2">
      {events.length === 0 ? (
        <div className="text-sm text-muted dark:text-muted-dark">Nessun evento disponibile.</div>
      ) : events.map((event) => (
        <div key={event.id} className="rounded-md border border-line dark:border-line-dark p-2">
          <div className="text-xs font-semibold text-ink dark:text-paper">{getTimelineTitle(event)}</div>
          <div className="mt-0.5 text-[11px] text-muted dark:text-muted-dark">
            {new Date(event.created_at).toLocaleString("it-IT")}
            {event.actor_user_id != null ? ` · Utente #${event.actor_user_id}` : ""}
          </div>

          {(event.event_type === "field_updated" || event.event_type === "status_changed") && (
            <div className="mt-2 rounded-md bg-cream dark:bg-[#1c1c20] px-2 py-1.5 text-xs text-ink dark:text-paper space-y-1">
              {event.field_name && (
                <div>
                  <span className="font-semibold">Campo:</span>{" "}
                  {HISTORY_FIELD_LABELS[event.field_name] ?? event.field_name}
                </div>
              )}
              <div>
                <span className="font-semibold">Da:</span>{" "}
                {formatHistoryValue(event.from_value)}
              </div>
              <div>
                <span className="font-semibold">A:</span>{" "}
                {formatHistoryValue(event.to_value)}
              </div>
            </div>
          )}

          {event.notes && (
            <div className="mt-2 rounded-md bg-cream dark:bg-[#1c1c20] px-2 py-1.5 text-xs text-ink dark:text-paper">
              <span className="font-semibold">Nota:</span> {event.notes}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}