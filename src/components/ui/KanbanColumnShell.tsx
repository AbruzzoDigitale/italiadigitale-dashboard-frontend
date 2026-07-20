import type { DragEventHandler, ReactNode } from "react";

interface KanbanColumnShellProps {
  label: string;
  count: number;
  color?: string;
  compact?: boolean;
  minHeightClassName?: string;
  /** Se valorizzato, la colonna ha altezza massima e le card scorrono internamente (stile Trello). */
  maxHeightClassName?: string;
  isDropTarget?: boolean;
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
  onDragOver?: DragEventHandler<HTMLDivElement>;
  onDragLeave?: DragEventHandler<HTMLDivElement>;
  onDrop?: DragEventHandler<HTMLDivElement>;
  children: ReactNode;
}

export function KanbanColumnShell({
  label,
  count,
  color,
  compact = false,
  minHeightClassName,
  maxHeightClassName,
  isDropTarget = false,
  className = "",
  headerClassName = "",
  bodyClassName = "",
  onDragOver,
  onDragLeave,
  onDrop,
  children,
}: KanbanColumnShellProps) {
  const minHeight = minHeightClassName ?? (compact ? "min-h-[220px]" : "min-h-[480px]");
  const baseColumnClass = "border border-line/80 dark:border-line-dark/80";
  const dropTargetClass = "border-[#16A34A]/70 ring-2 ring-inset ring-[#16A34A]/30 bg-[#16a34a]/5";
  const scrollable = !!maxHeightClassName;

  return (
    <div
      className={`flex ${minHeight} ${maxHeightClassName ?? ""} flex-col rounded-xl p-2.5 transition-colors bg-cream dark:bg-[#1c1c20] ${baseColumnClass} ${scrollable ? "overflow-hidden" : ""} ${isDropTarget ? dropTargetClass : ""} ${className}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className={`mb-2 flex items-center gap-2 px-1.5 py-1 ${headerClassName}`}>
        {color ? <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: color }} /> : null}
        <span className="flex-1 text-[11px] font-bold uppercase tracking-wider text-ink dark:text-paper">{label}</span>
        <span className="rounded-pill bg-paper px-2 py-0.5 text-[11px] text-muted dark:bg-[#131316] dark:text-muted-dark">{count}</span>
      </div>

      <div className={`flex flex-1 flex-col gap-2 ${scrollable ? "min-h-0 overflow-y-auto pr-1" : ""} ${bodyClassName}`}>{children}</div>
    </div>
  );
}
