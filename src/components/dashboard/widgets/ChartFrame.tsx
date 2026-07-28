import type { ReactNode } from "react";
import { WidgetTypeIcon } from "./WidgetTypeIcon";

/** Cornice standard di un widget grafico: glifo del tipo + titolo + area grafico. */
export function ChartFrame({
  title,
  subtitle,
  type,
  toolbar,
  children,
}: {
  title: string;
  subtitle?: string;
  /** Tipo widget: mostra il mini-glifo del grafico accanto al titolo. */
  type?: string;
  /** Controlli extra (es. selettore di confronto) sotto il titolo. */
  toolbar?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col p-3">
      <div className="mb-1.5 flex flex-shrink-0 items-start gap-1.5">
        {type && (
          <WidgetTypeIcon type={type} className="mt-[1px] h-3.5 w-3.5 flex-shrink-0 text-brand-magenta" />
        )}
        <div className="min-w-0">
          <p className="truncate text-[12px] font-semibold text-ink dark:text-[#f4f4f7]">{title}</p>
          {subtitle && <p className="truncate text-[10px] text-muted dark:text-[#9999a0]">{subtitle}</p>}
        </div>
      </div>
      {toolbar && <div className="mb-1.5 flex-shrink-0">{toolbar}</div>}
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
