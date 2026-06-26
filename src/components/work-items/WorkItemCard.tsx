import { Avatar } from "../ui/Avatar";
import { Checkbox } from "../ui/Checkbox";
import { Icon } from "../ui/Icon";
import { WorkAreaBadge } from "../work-areas/WorkAreaBadge";
import { type WorkItem, type WorkTag, type LeftBehindReason } from "../../api/workItems";
import { type User } from "../../api/users";
import { type WorkArea } from "../../api/workAreas";

// ── Helpers ───────────────────────────────────────────────────────────────────

export function fmtHours(n: number | null): string {
  if (n == null) return "—";
  return n % 1 === 0 ? `${n}h` : `${n.toFixed(1)}h`;
}

export function leftBehindReasonLabel(reason: LeftBehindReason | null): string {
  if (reason === "operator_responsibility") return "Resp. operatore";
  if (reason === "client_protection") return "Protezione cliente";
  if (reason === "justified_delay") return "Ritardo giustificato";
  if (reason === "other") return "Altro";
  return "";
}

export function effectiveHoursLabel(item: WorkItem): string {
  if (!item.affects_daily_load) return "0h effettive";
  return `${fmtHours(item.schedule_state?.effective_load_hours ?? item.effective_load_hours)} effettive`;
}

export function hoursWeightClass(h: number | null): string {
  if (h == null) return "bg-cream text-muted dark:bg-[#2a2a2e] dark:text-muted-dark";
  if (h <= 4) return "bg-cream text-muted dark:bg-[#2a2a2e] dark:text-muted-dark";
  if (h <= 8) return "bg-[#FAEEDA] text-[#854F0B] dark:bg-[#3a2a10] dark:text-[#EF9F27]";
  return "bg-[#F7C1C1] text-[#791F1F] dark:bg-[#3a1010] dark:text-[#f87171]";
}

export function isOverdue(deadline: string | null | undefined): boolean {
  if (!deadline) return false;
  return new Date(deadline) < new Date();
}

export function formatWorkItemDate(d: string | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
}

export function taskTypeLabel(taskType?: WorkItem["task_type"]): string {
  return taskType === "quick" ? "Quick" : "Standard";
}

export function taskTypeBadgeClass(taskType?: WorkItem["task_type"]): string {
  if (taskType === "quick") return "bg-[#E91E8A]/12 text-[#E91E8A] border border-[#E91E8A]/35";
  return "bg-info/10 text-info border border-info/25";
}

// ── WorkItemCard (full) ───────────────────────────────────────────────────────

export interface WorkItemCardProps {
  item: WorkItem;
  clientName?: string | null;
  users: User[];
  workAreas: WorkArea[];
  workTags: WorkTag[];
  isAdmin: boolean;
  isSelected: boolean;
  onToggleSelect: (itemId: number, checked: boolean) => void;
  onDragStartItem: (event: React.DragEvent<HTMLDivElement>, itemId: number) => void;
  onDragEndItem: (event: React.DragEvent<HTMLDivElement>) => void;
  onEdit: (item: WorkItem) => void;
  onDelete: (item: WorkItem) => void;
  onRegenerateRecurrences: (item: WorkItem) => void;
  onInstantiateFromTemplate: (item: WorkItem) => void;
  onOpenAiSourceContract: (contractId: number) => void;
}

export function WorkItemCard({
  item,
  clientName,
  users,
  workAreas,
  workTags,
  isAdmin,
  isSelected,
  onToggleSelect,
  onDragStartItem,
  onDragEndItem,
  onEdit,
  onDelete,
  onRegenerateRecurrences,
  onInstantiateFromTemplate,
  onOpenAiSourceContract,
}: WorkItemCardProps) {
  const assigneeIds = item.assignee_ids ?? [];
  const workAreaIds = item.work_area_ids ?? [];
  const tagIds = item.tag_ids ?? [];
  const assignees = users.filter((u) => assigneeIds.includes(u.id));
  const areas = workAreas.filter((a) => workAreaIds.includes(a.id));
  const tags = workTags.filter((t) => tagIds.includes(t.id));
  const overdue = !item.is_completed && isOverdue(item.deadline_date);
  const isDone = item.is_completed || item.status === "completed";
  const scheduleState = item.schedule_state ?? null;
  const isCarriedOver = scheduleState?.delay_code === "carried_over";
  const isSevereDelay = scheduleState?.delay_code === "non_deferrable_overdue";
  const aiSourceContractId = item.ai_source_contract_id ?? null;
  const aiJobId = item.ai_generation_job_id ?? null;
  const aiJobItemId = item.ai_generation_job_item_id ?? null;
  const isAiGenerated = !!item.is_ai_generated || !!aiJobId || !!aiJobItemId || aiSourceContractId != null;

  return (
    <div
      draggable
      data-item-id={item.id}
      onDragStart={(event) => onDragStartItem(event, item.id)}
      onDragEnd={onDragEndItem}
      role="button"
      tabIndex={0}
      onClick={() => onEdit(item)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onEdit(item);
        }
      }}
      title="Apri dettaglio lavorazione"
      className={`group relative flex cursor-grab flex-col gap-2 rounded-lg border bg-paper p-3 transition-all active:cursor-grabbing active:opacity-50 hover:-translate-y-px hover:shadow-md
        ${item.is_priority ? "border-l-[3px] border-l-[#E91E8A] border-r-line border-t-line border-b-line dark:border-l-[#E91E8A] dark:border-r-line-dark dark:border-t-line-dark dark:border-b-line-dark" : "border-line dark:border-line-dark"}
        ${isSevereDelay ? "ring-1 ring-danger/40 bg-danger/5 dark:bg-danger/10" : ""}
        ${isCarriedOver ? "ring-1 ring-warning/35 bg-warning/5 dark:bg-warning/10" : ""}
        ${item.is_PED ? "ring-1 ring-info/35 bg-info/5 dark:bg-info/10" : ""}
        ${isDone ? "opacity-70" : ""}
        dark:bg-[#131316]`}
    >
      {/* Header row */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {isAdmin && (
            <span
              className="inline-flex items-center"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <Checkbox
                checked={isSelected}
                onChange={(checked) => onToggleSelect(item.id, checked)}
              />
            </span>
          )}
          <span className="font-variant-numeric text-[10px] tabular-nums text-muted dark:text-muted-dark">
            #{String(item.id).padStart(3, "0")}
          </span>
          {item.is_template && (
            <span className="inline-flex rounded-pill border border-info/30 bg-info/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-info">
              Modello
            </span>
          )}
          {item.template_source_id != null && (
            <span
              className="inline-flex cursor-help items-center rounded-pill border border-info/30 bg-info/10 px-1.5 py-0.5 text-info"
              title={`Task creata dal modello #${item.template_source_id}`}
              aria-label={`Da modello ${item.template_source_id}`}
            >
              <Icon name="info" className="h-3 w-3" />
            </span>
          )}
          {item.recurrence_parent_id != null ? (
            <span
              className="inline-flex cursor-help items-center rounded-pill border border-info/30 bg-info/10 px-1.5 py-0.5 text-info"
              title="Task creata automaticamente da una ricorrenza della task sorgente"
              aria-label="Generata da ricorrenza"
            >
              <Icon name="info" className="h-3 w-3" />
            </span>
          ) : item.is_recurring ? (
            <span className="inline-flex rounded-pill border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-warning">
              Ricorrente
            </span>
          ) : null}
          {item.is_PED && (
            <span className="inline-flex rounded-pill border border-info/30 bg-info/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-info">
              PED
            </span>
          )}
          {isCarriedOver && (
            <span className="inline-flex rounded-pill border border-warning/30 bg-warning/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-warning">
              In ritardo
            </span>
          )}
          {isSevereDelay && (
            <span className="inline-flex rounded-pill border border-danger/30 bg-danger/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-danger">
              Ritardo grave
            </span>
          )}
          {item.is_deadline_locked && (
            <span className="inline-flex items-center gap-1 rounded-pill border border-[#E91E8A]/35 bg-[#E91E8A]/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[#E91E8A]">
              <Icon name="shield" className="h-3 w-3" />
              Non derogabile
            </span>
          )}
          {isAiGenerated && (
            <span
              className="inline-flex items-center gap-1 rounded-pill border border-[#7A91FF]/35 bg-[#7A91FF]/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[#3B4FD1] dark:border-[#7A91FF]/45 dark:bg-[#1C255A] dark:text-[#C7D2FF]"
              title="Task generata con AI"
            >
              <Icon name="robot" className="h-3 w-3" />
              AI
            </span>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          {item.is_priority && (
            <Icon name="star" className="h-3 w-3 text-[#E91E8A]" />
          )}
          {overdue && (
            <span title={`Scaduto il ${formatWorkItemDate(item.deadline_date)}`}>
              <Icon name="alert-triangle" className="h-3 w-3 text-danger" />
            </span>
          )}
          <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            {item.is_template && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onInstantiateFromTemplate(item); }}
                className="rounded p-0.5 text-muted hover:text-success dark:text-muted-dark dark:hover:text-success"
                title="Usa modello"
              >
                <Icon name="plus" className="h-3 w-3" />
              </button>
            )}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onEdit(item); }}
              className="rounded p-0.5 text-muted hover:text-ink dark:text-muted-dark dark:hover:text-paper"
            >
              <Icon name="pencil" className="h-3 w-3" />
            </button>
            {item.is_recurring && item.recurrence_parent_id == null && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onRegenerateRecurrences(item); }}
                className="rounded p-0.5 text-muted hover:text-info dark:text-muted-dark dark:hover:text-info"
                title="Rigenera occorrenze"
              >
                <Icon name="refresh-cw" className="h-3 w-3" />
              </button>
            )}
            {isAdmin && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDelete(item); }}
                className="rounded p-0.5 text-muted hover:text-danger dark:text-muted-dark dark:hover:text-danger"
              >
                <Icon name="trash" className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Client */}
      {clientName && (
        <div className="flex min-w-0 items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
          <Icon name="building" className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">{clientName}</span>
        </div>
      )}

      {/* Title */}
      <p className={`text-[13px] font-medium leading-snug text-ink dark:text-paper ${isDone ? "line-through decoration-muted" : ""}`}>
        {item.title}
      </p>

      {/* Progress bar (in_progress only) */}
      {item.status === "in_progress" && item.progress_percent > 0 && (
        <div className="h-[3px] w-full overflow-hidden rounded-full bg-cream dark:bg-[#2a2a2e]">
          <div className="h-full rounded-full bg-[#378ADD]" style={{ width: `${item.progress_percent}%` }} />
        </div>
      )}

      {/* Areas (solo icona/badge — il nome è nel tooltip) */}
      {areas.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {areas.map((area) => (
            <WorkAreaBadge key={area.id} area={area} iconOnly />
          ))}
        </div>
      )}

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex rounded-pill px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
              style={
                tag.color
                  ? { backgroundColor: `${tag.color}22`, color: tag.color, border: `1px solid ${tag.color}44` }
                  : { backgroundColor: "var(--color-cream)", color: "var(--color-muted)" }
              }
            >
              {tag.name}
            </span>
          ))}
        </div>
      )}

      {/* AI source contract */}
      {isAiGenerated && aiSourceContractId != null && (
        <div className="flex min-w-0 flex-wrap items-center gap-1.5 rounded-md border border-[#7A91FF]/30 bg-[#7A91FF]/5 px-2 py-1 text-[10px] text-[#4356C9] dark:border-[#7A91FF]/40 dark:bg-[#1A2148] dark:text-[#C7D2FF]">
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); onOpenAiSourceContract(aiSourceContractId); }}
            className="inline-flex items-center gap-1 rounded-pill border border-[#7A91FF]/45 bg-paper/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#3B4FD1] hover:bg-paper dark:bg-[#131316]/75 dark:text-[#C7D2FF] dark:hover:bg-[#1C1C22]"
            title={`Apri contratto #${aiSourceContractId}`}
          >
            <Icon name="document-text" className="h-3 w-3" />
            Contratto #{aiSourceContractId}
          </button>
        </div>
      )}

      {item.is_left_behind && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="inline-flex rounded-pill px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-warning/15 text-warning border border-warning/30">
            Lasciata indietro
          </span>
          {item.left_behind_reason && (
            <span className="text-[10px] text-muted dark:text-muted-dark">
              {leftBehindReasonLabel(item.left_behind_reason)}
            </span>
          )}
        </div>
      )}

      {scheduleState?.delay_code && (
        <div className="flex flex-wrap items-center gap-1 text-[10px] text-muted dark:text-muted-dark">
          <span>
            Peso effettivo {scheduleState.effective_load_weight_factor.toFixed(2)}x
          </span>
          <span>·</span>
          <span>{fmtHours(scheduleState.effective_load_hours)} effettive</span>
          {scheduleState.overdue_days > 0 && (
            <>
              <span>·</span>
              <span>{scheduleState.overdue_days}g ritardo</span>
            </>
          )}
        </div>
      )}

      {/* Footer: hours + deadline + avatars */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${hoursWeightClass(item.estimated_hours)}`}>
            <Icon name={isDone ? "check-circle" : "activity"} className="h-3 w-3" />
            {fmtHours(item.estimated_hours)}
          </span>
          {item.deadline_date && (
            <span className={`text-[11px] ${overdue ? "font-semibold text-danger" : "text-muted dark:text-muted-dark"}`}>
              {formatWorkItemDate(item.deadline_date)}
            </span>
          )}
          <span className="text-[11px] text-muted dark:text-muted-dark">
            {effectiveHoursLabel(item)}
          </span>
        </div>
        {assignees.length > 0 && (
          <div className="flex -space-x-1.5">
            {assignees.slice(0, 3).map((u) => (
              <Avatar
                key={u.id}
                name={u.full_name ?? u.username}
                src={u.avatar_url}
                size="sm"
                className="h-6 w-6 text-[9px] ring-2 ring-paper dark:ring-[#131316]"
              />
            ))}
            {assignees.length > 3 && (
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cream text-[9px] font-bold text-muted ring-2 ring-paper dark:bg-[#2a2a2e] dark:text-muted-dark dark:ring-[#131316]">
                +{assignees.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── WorkItemSummaryCard (for partial data from tasks_completion.items) ─────────

export interface WorkItemSummaryItem {
  id: number;
  title: string;
  status: string;
  completion_state: string;
  is_completed: boolean;
  progress_percent: number;
  work_date?: string | null;
  deadline_date?: string | null;
  assignee_ids?: number[];
  work_area_ids?: number[];
  tag_ids?: number[];
  updated_at?: string | null;
}

function completionStateClass(state: string): string {
  if (state === "completed") return "bg-success/10 text-success border border-success/20";
  if (state === "in_progress") return "bg-info/10 text-info border border-info/20";
  return "bg-line text-muted dark:bg-line-dark dark:text-muted-dark border border-transparent";
}

function completionStateLabel(state: string): string {
  if (state === "completed") return "Completato";
  if (state === "in_progress") return "In corso";
  if (state === "review") return "Revisione";
  return "Da fare";
}

export interface WorkItemSummaryCardProps {
  item: WorkItemSummaryItem;
  users: User[];
  workAreas?: WorkArea[];
  workTags?: WorkTag[];
  linkedToContract: boolean;
  onEdit: () => void;
}

export function WorkItemSummaryCard({ item, users, workAreas = [], workTags = [], linkedToContract, onEdit }: WorkItemSummaryCardProps) {
  const assigneeIds = item.assignee_ids ?? [];
  const assignees = users.filter((u) => assigneeIds.includes(u.id));
  const areas = workAreas.filter((a) => (item.work_area_ids ?? []).includes(a.id));
  const tags = workTags.filter((t) => (item.tag_ids ?? []).includes(t.id));
  const overdue = !item.is_completed && isOverdue(item.deadline_date);
  const isDone = item.is_completed || item.status === "completed";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onEdit}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onEdit();
        }
      }}
      title="Apri dettaglio lavorazione"
      className={`group relative flex cursor-pointer flex-col gap-2 rounded-lg border bg-paper p-3 transition-all hover:-translate-y-px hover:shadow-md border-line dark:border-line-dark dark:bg-[#131316]
        ${isDone ? "opacity-70" : ""}`}
    >
      {/* Header row */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <span className="font-variant-numeric text-[10px] tabular-nums text-muted dark:text-muted-dark">
            #{String(item.id).padStart(3, "0")}
          </span>
          <span className={`inline-flex items-center rounded-pill px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${completionStateClass(item.completion_state)}`}>
            {completionStateLabel(item.completion_state)}
          </span>
          {!linkedToContract && (
            <span className="inline-flex items-center rounded-pill px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider bg-warning/10 text-warning border border-warning/30">
              Non collegata a contratto
            </span>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          {overdue && (
            <span title={`Scaduto il ${formatWorkItemDate(item.deadline_date)}`}>
              <Icon name="alert-triangle" className="h-3 w-3 text-danger" />
            </span>
          )}
          <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="rounded p-0.5 text-muted hover:text-ink dark:text-muted-dark dark:hover:text-paper"
              title="Modifica"
            >
              <Icon name="pencil" className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Title */}
      <p className={`text-[13px] font-medium leading-snug text-ink dark:text-paper ${isDone ? "line-through decoration-muted" : ""}`}>
        {item.title}
      </p>

      {/* Progress bar */}
      {item.status === "in_progress" && item.progress_percent > 0 && (
        <div className="h-[3px] w-full overflow-hidden rounded-full bg-cream dark:bg-[#2a2a2e]">
          <div className="h-full rounded-full bg-[#378ADD]" style={{ width: `${item.progress_percent}%` }} />
        </div>
      )}

      {/* Areas */}
      {areas.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {areas.map((area) => (
            <WorkAreaBadge key={area.id} area={area} className="text-[10px] px-2 py-0.5" />
          ))}
        </div>
      )}

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex rounded-pill px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
              style={
                tag.color
                  ? { backgroundColor: `${tag.color}22`, color: tag.color, border: `1px solid ${tag.color}44` }
                  : { backgroundColor: "var(--color-cream)", color: "var(--color-muted)" }
              }
            >
              {tag.name}
            </span>
          ))}
        </div>
      )}

      {/* Footer: date + avatars */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {item.deadline_date && (
            <span className={`text-[11px] ${overdue ? "font-semibold text-danger" : "text-muted dark:text-muted-dark"}`}>
              {formatWorkItemDate(item.deadline_date)}
            </span>
          )}
          {item.work_date && (
            <span className="text-[11px] text-muted dark:text-muted-dark">
              Lav. {formatWorkItemDate(item.work_date)}
            </span>
          )}
        </div>
        {assignees.length > 0 ? (
          <div className="flex -space-x-1.5">
            {assignees.slice(0, 3).map((u) => (
              <Avatar
                key={u.id}
                name={u.full_name ?? u.username}
                src={u.avatar_url}
                size="sm"
                className="h-6 w-6 text-[9px] ring-2 ring-paper dark:ring-[#131316]"
              />
            ))}
            {assignees.length > 3 && (
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cream text-[9px] font-bold text-muted ring-2 ring-paper dark:bg-[#2a2a2e] dark:text-muted-dark dark:ring-[#131316]">
                +{assignees.length - 3}
              </span>
            )}
          </div>
        ) : (
          <span className="text-[10px] text-muted dark:text-muted-dark">Nessun assegnatario</span>
        )}
      </div>
    </div>
  );
}
