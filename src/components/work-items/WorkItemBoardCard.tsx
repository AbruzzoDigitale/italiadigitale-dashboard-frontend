import "../../pages/work-items-page.css";
import { Avatar } from "../ui/Avatar";
import { Icon } from "../ui/Icon";
import { WorkAreaChips } from "./WorkAreaChips";
import { fmtHours, formatWorkItemDate, isOverdue } from "./WorkItemCard";
import { type WorkTag } from "../../api/workItems";
import { type User } from "../../api/users";
import { type WorkArea } from "../../api/workAreas";
import { reworkSeverityClass } from "../../utils/rework";

// ─────────────────────────────────────────────────────────────────────────────
// Card lavorazione riutilizzabile, con LO STESSO stile della board Lavorazioni
// (classi .lv-*). Presentazionale e read-only: niente drag/azioni admin, solo
// selezione opzionale e apertura al click. Porta con sé i token del tema tramite
// la classe .lv-scope, così funziona anche fuori dalla pagina board (es. modali).
// Non mostra l'ID della lavorazione (come sulla board).
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkItemBoardCardItem {
  id: number;
  title: string;
  status: string;
  is_completed: boolean;
  progress_percent: number;
  work_date?: string | null;
  deadline_date?: string | null;
  estimated_hours?: number | null;
  assignee_ids?: number[];
  work_area_ids?: number[];
  tag_ids?: number[];
  is_priority?: boolean;
  is_PED?: boolean;
  is_recurring?: boolean;
  is_template?: boolean;
  reviewer_name?: string | null;
  rework_count?: number;
  delivered_to_client_at?: string | null;
}

export interface WorkItemBoardCardProps {
  item: WorkItemBoardCardItem;
  clientName?: string | null;
  users?: User[];
  workAreas?: WorkArea[];
  workTags?: WorkTag[];
  /** Stato collegamento a contratto (usato solo se showContractStatus è true). */
  linkedToContract?: boolean;
  /** Mostra un badge esplicito "Contratto" / "No contratto" sulla card. */
  showContractStatus?: boolean;
  /** Abilita la checkbox di selezione (stile board). */
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (checked: boolean) => void;
  onEdit?: () => void;
  /** Drag & drop: rende la card trascinabile (es. per collegarla a un contratto). */
  draggable?: boolean;
  onDragStart?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: (event: React.DragEvent<HTMLDivElement>) => void;
}

const normColor = (c: string | null | undefined) =>
  c ? (c.startsWith("#") ? c : `#${c}`) : null;

export function WorkItemBoardCard({
  item,
  clientName,
  users = [],
  workAreas = [],
  workTags = [],
  linkedToContract = true,
  showContractStatus = false,
  selectable = false,
  selected = false,
  onToggleSelect,
  onEdit,
  draggable = false,
  onDragStart,
  onDragEnd,
}: WorkItemBoardCardProps) {
  const areas = workAreas.filter((a) => (item.work_area_ids ?? []).includes(a.id));
  const tags = workTags.filter((t) => (item.tag_ids ?? []).includes(t.id));
  const assignees = users.filter((u) => (item.assignee_ids ?? []).includes(u.id));
  const overdue = !item.is_completed && isOverdue(item.deadline_date);
  const isDone = item.is_completed || item.status === "completed";
  // In revisione e già consegnata al cliente: evidenziazione dedicata sulla lavagna.
  const sentToClient = item.status === "review" && !!item.delivered_to_client_at;

  const primaryArea = areas[0] ?? null;
  const areaColor = normColor(primaryArea?.color) ?? "#8c8d87";
  const accent = sentToClient ? "#2ec3f3" : overdue ? "var(--amber)" : areaColor;

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onEdit}
      onKeyDown={(e) => {
        if (onEdit && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onEdit();
        }
      }}
      title="Apri dettaglio lavorazione"
      className={`lv-scope lv-card${selected ? " sel" : ""}${isDone ? " done" : ""}${sentToClient ? " sent-client" : ""}${reworkSeverityClass(item.rework_count) ? " " + reworkSeverityClass(item.rework_count) : ""}`}
      style={{ "--area": areaColor, "--accent": accent } as React.CSSProperties}
    >
      {/* Top: checkbox · cliente · flags */}
      <div className="lv-top">
        {selectable && (
          <label
            className="lv-check"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={selected}
              onChange={(e) => onToggleSelect?.(e.target.checked)}
            />
            <span />
          </label>
        )}
        <span className="lv-client min-w-0 flex-1" title={clientName ?? "Senza cliente"}>
          <Icon name="building" className="h-3 w-3" />
          <span className="truncate">{clientName ?? "Senza cliente"}</span>
        </span>
        <div className="lv-flags">
          {item.is_priority && <Icon name="star" className="lv-star h-3.5 w-3.5" />}
          {sentToClient && (
            <span className="lv-badge sent" title="In revisione · inviata al cliente">
              <Icon name="check-circle" className="h-2.5 w-2.5" /> Al cliente
            </span>
          )}
          {item.is_template && <span className="lv-badge soft">Modello</span>}
          {item.is_recurring && <span className="lv-badge soft">Ricorrente</span>}
          {item.is_PED && <span className="lv-badge soft">PED</span>}
          {showContractStatus &&
            (linkedToContract ? (
              <span className="lv-badge ok" title="Collegata a un contratto">
                <Icon name="document-text" className="h-2.5 w-2.5" /> Contratto
              </span>
            ) : (
              <span className="lv-badge late" title="Non collegata ad alcun contratto">
                No contratto
              </span>
            ))}
          {overdue && (
            <span title={`Scaduto il ${formatWorkItemDate(item.deadline_date)}`}>
              <Icon name="alert-triangle" className="lv-warn h-3.5 w-3.5" />
            </span>
          )}
        </div>
      </div>

      <div className="lv-title">{item.title}</div>

      {item.status === "in_progress" && item.progress_percent > 0 && (
        <div className="lv-progress">
          <i style={{ width: `${item.progress_percent}%` }} />
        </div>
      )}

      {areas.length > 0 && (
        <div className="lv-mid">
          <WorkAreaChips areas={areas} />
        </div>
      )}

      {item.reviewer_name && (
        <div className="lv-mid">
          <span
            className="lv-area"
            style={{ "--area": "#ef3a65" } as React.CSSProperties}
            title={`Revisore: ${item.reviewer_name}`}
          >
            <i />
            Rev: {item.reviewer_name}
          </span>
        </div>
      )}

      {tags.length > 0 && (
        <div className="lv-tags">
          {tags.map((tag) => (
            <span
              key={tag.id}
              className="lv-tag"
              style={
                tag.color
                  ? { backgroundColor: `${tag.color}22`, color: tag.color, border: `1px solid ${tag.color}44` }
                  : { background: "var(--surface-3)", color: "var(--tx-3)" }
              }
            >
              {tag.name}
            </span>
          ))}
        </div>
      )}

      {/* Footer: ore · scadenza · operatori */}
      <div className="lv-foot">
        <span className="lv-est">
          <Icon name={isDone ? "check-circle" : "activity"} className="h-3 w-3" />
          {fmtHours(item.estimated_hours ?? null)}
        </span>
        {item.deadline_date && (
          <span className={`lv-due${overdue ? " late" : ""}`}>
            {formatWorkItemDate(item.deadline_date)}
          </span>
        )}
        <span className="lv-spacer" />
        {assignees.length > 0 ? (
          <div className="lv-avs">
            {assignees.slice(0, 3).map((u) =>
              u.avatar_url ? (
                <Avatar
                  key={u.id}
                  name={u.full_name ?? u.username}
                  src={u.avatar_url}
                  size="sm"
                  className="!h-[26px] !w-[26px] !text-[10px] shadow-[0_0_0_2px_var(--surface)]"
                />
              ) : (
                <span key={u.id} className="lv-av" title={u.full_name ?? u.username}>
                  {(u.full_name ?? u.username ?? "?").trim().charAt(0).toUpperCase()}
                </span>
              ),
            )}
            {assignees.length > 3 && <span className="lv-av more">+{assignees.length - 3}</span>}
          </div>
        ) : (
          <span className="lv-av none" title="Senza operatore">
            <Icon name="users" className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
    </div>
  );
}
