import type { IconName } from "../ui/Icon";
import { Icon } from "../ui/Icon";
import type { WorkArea } from "../../api/workAreas";

const ICON_SET = new Set<IconName>([
  "target",
  "globe",
  "users",
  "tools",
  "list",
  "star",
  "shield-check",
  "document-text",
  "annotation",
  "information-circle",
  "map-pin",
  "building",
  "activity",
  "settings",
  "check-circle",
]);

export function isBuiltInWorkAreaIcon(value: string | null): value is IconName {
  return !!value && ICON_SET.has(value as IconName);
}

function normalizeHex(value: string | null) {
  if (!value) return null;
  return value.startsWith("#") ? value : `#${value}`;
}

interface WorkAreaBadgeProps {
  area: WorkArea;
  className?: string;
  /** Mostra solo il pallino/icona dell'area (il nome diventa tooltip). */
  iconOnly?: boolean;
}

export function WorkAreaBadge({ area, className = "", iconOnly = false }: WorkAreaBadgeProps) {
  const color = normalizeHex(area.color);
  const borderColor = color ?? "rgba(0,0,0,0.12)";
  const backgroundColor = color ? `${color}14` : undefined;

  return (
    <span
      title={iconOnly ? area.name : undefined}
      aria-label={iconOnly ? area.name : undefined}
      className={`inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-pill border ${iconOnly ? "px-1.5 py-1" : "px-2.5 py-1"} text-[11px] font-semibold uppercase tracking-wider ${className}`}
      style={{ borderColor, backgroundColor, color: color ?? "currentColor" }}
    >
      <span
        className="inline-flex h-2 w-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: color ?? "currentColor" }}
      />
      {area.icon ? (
        isBuiltInWorkAreaIcon(area.icon) ? (
          <Icon name={area.icon} className="w-3 h-3" />
        ) : (
          <span className="inline-flex text-[13px] leading-none" aria-hidden="true">
            {area.icon}
          </span>
        )
      ) : (
        <Icon name="target" className="w-3 h-3" />
      )}
      {!iconOnly && <span className="min-w-0 max-w-full truncate">{area.name}</span>}
    </span>
  );
}