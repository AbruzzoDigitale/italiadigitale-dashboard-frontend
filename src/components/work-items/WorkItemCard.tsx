import { Avatar } from "../ui/Avatar";
import { Icon } from "../ui/Icon";
import { WorkItemResourceChips } from "./WorkItemResourceChips";
import { WorkAreaChips } from "./WorkAreaChips";
import { WorkAreaBadge } from "../work-areas/WorkAreaBadge";
import { deriveReviewPhase } from "../review/reviewFlow";
import { WorkItemWarnBadge, type WarnItem } from "./WorkItemWarnBadge";
import { type WorkItem, type WorkTag, type LeftBehindReason } from "../../api/workItems";
import { type User } from "../../api/users";
import { type WorkArea } from "../../api/workAreas";
import { reworkSeverityClass } from "../../utils/rework";
import { formatDurationHuman } from "../../utils/duration";

// ── Helpers ───────────────────────────────────────────────────────────────────

export function fmtHours(n: number | null): string {
  if (n == null) return "—";
  return formatDurationHuman(n);
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
  // In revisione e già consegnata al cliente: evidenziazione dedicata sulla lavagna.
  const sentToClient = item.status === "review" && !!item.delivered_to_client_at;
  // Fase "In pubblicazione": approvata dal cliente, torna in corso col peso di
  // pubblicazione (status non è più "review"). Badge + accento dedicati.
  const inPublishing = deriveReviewPhase(item.status, item.review_stage, item.client_approved_at) === "pubblicazione";
  const scheduleState = item.schedule_state ?? null;
  const isCarriedOver = scheduleState?.delay_code === "carried_over";
  const isSevereDelay = scheduleState?.delay_code === "non_deferrable_overdue";
  const aiSourceContractId = item.ai_source_contract_id ?? null;
  const aiJobId = item.ai_generation_job_id ?? null;
  const aiJobItemId = item.ai_generation_job_item_id ?? null;
  const isAiGenerated = !!item.is_ai_generated || !!aiJobId || !!aiJobItemId || aiSourceContractId != null;

  // Spina-colore + avatar tinti per area (cfr. prototipo Lavorazioni)
  const normColor = (c: string | null | undefined) =>
    c ? (c.startsWith("#") ? c : `#${c}`) : null;
  const primaryArea = areas[0] ?? null;
  const areaColor = normColor(primaryArea?.color) ?? "#8c8d87";
  const accent = sentToClient
    ? "#2ec3f3"
    : isSevereDelay
      ? "var(--magenta)"
      : isCarriedOver || overdue
        ? "var(--amber)"
        : areaColor;

  // Avvisi accorpati nel triangolo (ritardo/ritardo grave/scadenza/non derogabile):
  // cliccando l'icona si apre il popover con l'elenco, e appare "+N" se sono più di uno.
  const warnings: WarnItem[] = [];
  if (isSevereDelay) warnings.push({ key: "severe", label: "Ritardo grave", tone: "grave" });
  else if (isCarriedOver) warnings.push({ key: "late", label: "In ritardo", tone: "late" });
  if (overdue) {
    warnings.push({
      key: "overdue",
      label: `Scaduta il ${formatWorkItemDate(item.deadline_date)}`,
      tone: isSevereDelay ? "grave" : "late",
    });
  }
  if (item.is_deadline_locked) {
    warnings.push({ key: "nondeg", label: "Scadenza non derogabile", tone: "nondeg" });
  }

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
      className={`lv-card${isSelected ? " sel" : ""}${isDone ? " done" : ""}${sentToClient ? " sent-client" : ""}${inPublishing ? " publishing" : ""}${reworkSeverityClass(item.rework_count) ? " " + reworkSeverityClass(item.rework_count) : ""}`}
      style={{ "--area": areaColor, "--accent": accent } as React.CSSProperties}
    >
      {/* Top: checkbox · id · flags + azioni hover */}
      <div className="lv-top">
        {isAdmin && (
          <label
            className="lv-check"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => onToggleSelect(item.id, e.target.checked)}
            />
            <span />
          </label>
        )}
        <span className="lv-client" title={clientName ?? "Senza cliente"}>
          <Icon name="building" className="h-3 w-3" />
          <span className="truncate">{clientName ?? "Senza cliente"}</span>
        </span>
        <div className="lv-flags">
          {item.is_priority && <Icon name="star" className="lv-star h-3.5 w-3.5" />}
          {item.trello_card_url && (
            <a
              href={item.trello_card_url}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="lv-badge soft"
              title="Vedi su Trello"
            >
              <Icon name="trello" className="h-2.5 w-2.5" /> Trello
            </a>
          )}
          {sentToClient && (
            <span className="lv-badge sent" title="In revisione · inviata al cliente">
              <Icon name="check-circle" className="h-2.5 w-2.5" /> Al cliente
            </span>
          )}
          {inPublishing && (
            <span className="lv-badge publishing" title="Approvata dal cliente · in pubblicazione">
              <Icon name="globe" className="h-2.5 w-2.5" /> Pubbl.
            </span>
          )}
          {item.is_template && <span className="lv-badge soft">Modello</span>}
          {item.recurrence_parent_id == null && item.is_recurring && (
            <span className="lv-badge soft">Ricorrente</span>
          )}
          {item.is_PED && <span className="lv-badge soft">PED</span>}
          {isAiGenerated && (
            <span className="lv-badge ai" title="Task generata con AI">
              <Icon name="robot" className="h-2.5 w-2.5" /> AI
            </span>
          )}
          <WorkItemWarnBadge warnings={warnings} />
          <div className="lv-actions" onClick={(e) => e.stopPropagation()}>
            {item.is_template && (
              <button
                type="button"
                className="lv-act"
                title="Usa modello"
                onClick={(e) => { e.stopPropagation(); onInstantiateFromTemplate(item); }}
              >
                <Icon name="plus" className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              className="lv-act"
              title="Modifica"
              onClick={(e) => { e.stopPropagation(); onEdit(item); }}
            >
              <Icon name="pencil" className="h-3.5 w-3.5" />
            </button>
            {item.is_recurring && item.recurrence_parent_id == null && (
              <button
                type="button"
                className="lv-act"
                title="Rigenera occorrenze"
                onClick={(e) => { e.stopPropagation(); onRegenerateRecurrences(item); }}
              >
                <Icon name="refresh-cw" className="h-3.5 w-3.5" />
              </button>
            )}
            {isAdmin && (
              <button
                type="button"
                className="lv-act danger"
                title="Elimina"
                onClick={(e) => { e.stopPropagation(); onDelete(item); }}
              >
                <Icon name="trash" className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="lv-title">{item.title}</div>

      {item.status === "in_progress" && item.progress_percent > 0 && (
        <div className="lv-progress">
          <i style={{ width: `${item.progress_percent}%` }} />
        </div>
      )}

      {(areas.length > 0 || scheduleState?.delay_code) && (
        <div className="lv-mid">
          <WorkAreaChips areas={areas} />
          {scheduleState?.delay_code &&
            (() => {
              // Nota: il "Peso Nx" è stato rimosso su richiesta; resta solo il ritardo.
              const delayTxt = scheduleState.overdue_days > 0 ? `${scheduleState.overdue_days}g ritardo` : "";
              return delayTxt ? <span className="lv-peso">{delayTxt}</span> : null;
            })()}
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

      {item.resources && item.resources.length > 0 && (
        <WorkItemResourceChips resources={item.resources} className="mt-1" />
      )}

      {item.is_left_behind && (
        <div className="lv-mid">
          <span className="lv-badge late">Lasciata indietro</span>
          {item.left_behind_reason && (
            <span className="lv-peso">{leftBehindReasonLabel(item.left_behind_reason)}</span>
          )}
        </div>
      )}

      {isAiGenerated && aiSourceContractId != null && (
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); onOpenAiSourceContract(aiSourceContractId); }}
          className="lv-badge ai mt-2 self-start"
          title={`Apri contratto #${aiSourceContractId}`}
        >
          <Icon name="document-text" className="h-2.5 w-2.5" /> Contratto #{aiSourceContractId}
        </button>
      )}

      {/* Footer: ore · scadenza · effettive · operatori */}
      <div className="lv-foot">
        <span className="lv-est">
          <Icon name={isDone ? "check-circle" : "activity"} className="h-3 w-3" />
          {fmtHours(item.estimated_hours)}
        </span>
        {item.deadline_date && (
          <span className={`lv-due${overdue ? " late" : ""}`}>
            {formatWorkItemDate(item.deadline_date)}
          </span>
        )}
        <span className="lv-eff">{effectiveHoursLabel(item)}</span>
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
            {assignees.length > 3 && (
              <span className="lv-av more">+{assignees.length - 3}</span>
            )}
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
