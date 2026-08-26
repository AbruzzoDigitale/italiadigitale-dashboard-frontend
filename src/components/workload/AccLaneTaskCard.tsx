import type { CSSProperties, DragEvent } from "react";
import { Icon } from "../ui/Icon";
import { Avatar } from "../ui/Avatar";
import { reworkSeverityClass } from "../../utils/rework";

/**
 * Card task in stile "accordion workload" (classi `wl-acc-task*` da workload-page.css).
 * Riutilizzabile tra la vista accordion del Workload e "Attività del giorno".
 * Renderizza un <button> se `onClick` è passato (per apertura/drag), altrimenti un <div>.
 */
export interface AccLaneTaskCardProps {
  title: string;
  /** Etichetta ore a destra del titolo (es. "2h / 3h"). */
  hoursLabel?: string | null;
  /** Pill orario di inizio (colorata con l'area). */
  timeLabel?: string | null;
  clientName?: string | null;
  status?: string | null;
  /** Colore area di lavoro per la striscia/pill (`--wl-area`). */
  areaColor?: string | null;
  isPed?: boolean;
  /** Manutenzione sito programmata: badge verde acqua accanto al titolo. */
  isMaintenance?: boolean;
  priority?: boolean;
  completed?: boolean;
  leftBehind?: boolean;
  /** Task oltre la deadline (schedule_state.is_overdue). */
  overdue?: boolean;
  /** Giorni di ritardo (schedule_state.overdue_days), opzionale per il testo del badge. */
  overdueDays?: number;
  /** Numero di rimandi da revisione: 1 → card gialla, 2+ → card rossa. */
  reworkCount?: number;
  /** Operatori assegnati: mostrati come stack di avatar dentro la card. */
  assignees?: Array<{ name: string; avatarUrl?: string | null }>;
  unassigned?: boolean;
  onClick?: () => void;
  draggable?: boolean;
  onDragStart?: (event: DragEvent<HTMLElement>) => void;
  onDragEnd?: (event: DragEvent<HTMLElement>) => void;
}

export function AccLaneTaskCard({
  title,
  hoursLabel,
  timeLabel,
  clientName,
  status,
  areaColor,
  isPed = false,
  isMaintenance = false,
  priority = false,
  completed = false,
  leftBehind = false,
  overdue = false,
  overdueDays,
  reworkCount,
  assignees,
  unassigned = false,
  onClick,
  draggable,
  onDragStart,
  onDragEnd,
}: AccLaneTaskCardProps) {
  const style = {
    ["--wl-area" as string]: areaColor ?? (unassigned ? "#f5b800" : "transparent"),
    // `.wl-acc-task` ha `cursor: grab` (per il drag nel Workload): lo sovrascrivo
    // in modo affidabile quando la card è cliccabile o solo statica.
    cursor: onClick ? "pointer" : draggable ? "grab" : "default",
  } as CSSProperties;
  const reworkClass = reworkSeverityClass(reworkCount);
  const className = `wl-acc-task${unassigned ? " wl-acc-task--unassigned" : ""}${reworkClass ? ` ${reworkClass}` : ""}`;

  const body = (
    <>
      <div className="wl-acc-task__main">
        <span className="wl-acc-task__title">
          {title}
          {isPed && (
            <span className="ml-1.5 inline-flex rounded-pill border border-info/30 bg-info/10 px-1.5 py-0.5 align-middle text-[9px] font-semibold uppercase tracking-wider text-info">
              PED
            </span>
          )}
          {isMaintenance && (
            <span
              className="ml-1.5 inline-flex rounded-pill border border-[#0d9488]/35 bg-[#0d9488]/10 px-1.5 py-0.5 align-middle text-[9px] font-semibold uppercase tracking-wider text-[#0f766e] dark:text-[#5eead4]"
              title="Manutenzione programmata di un sito web"
            >
              Manutenzione
            </span>
          )}
          {priority && (
            <Icon name="star" className="ml-1 inline-block h-3.5 w-3.5 align-middle text-warning" />
          )}
        </span>
        {hoursLabel ? <span className="wl-acc-task__hours">{hoursLabel}</span> : null}
      </div>
      <div className="wl-acc-task__meta">
        {timeLabel ? <span className="wl-acc-task__time">{timeLabel}</span> : null}
        <span className="wl-acc-task__client">{clientName || "Senza cliente"}</span>
        {status ? <span className="wl-acc-task__status">{status}</span> : null}
        {leftBehind && (
          <span className="inline-flex rounded-pill border border-warning/30 bg-warning/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-warning">
            Arretrata
          </span>
        )}
        {overdue && (
          <span className="inline-flex rounded-pill border border-danger/30 bg-danger/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-danger">
            {overdueDays && overdueDays > 0 ? `Scaduta ${overdueDays}g` : "Scaduta"}
          </span>
        )}
        {completed && (
          <span className="inline-flex rounded-pill border border-success/30 bg-success/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-success">
            Completata
          </span>
        )}
        {assignees && assignees.length > 0 && (
          <span className="ml-auto flex flex-none -space-x-1.5" title={assignees.map((a) => a.name).join(", ")}>
            {assignees.slice(0, 4).map((a, i) => (
              <Avatar
                key={`${a.name}-${i}`}
                name={a.name}
                src={a.avatarUrl ?? undefined}
                size="sm"
                className="h-5 w-5 text-[8px] ring-2 ring-paper dark:ring-[#1f211f]"
              />
            ))}
            {assignees.length > 4 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cream text-[8px] font-bold text-muted ring-2 ring-paper dark:bg-[#2a2a2e] dark:text-muted-dark dark:ring-[#1f211f]">
                +{assignees.length - 4}
              </span>
            )}
          </span>
        )}
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={className}
        style={style}
        onClick={onClick}
        draggable={draggable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        {body}
      </button>
    );
  }

  return (
    <div className={className} style={style}>
      {body}
    </div>
  );
}
