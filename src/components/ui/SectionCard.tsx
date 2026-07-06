import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

/**
 * Card di sezione in stile prototipo "Modifica preventivo" (mp-card):
 * header con chip-icona + titolo maiuscolo + eventuale contatore/azioni, poi il contenuto.
 * Componente condiviso per dare ai modal-form la stessa struttura a sezioni.
 */
export function SectionCard({
  icon,
  title,
  count,
  actions,
  children,
  className = "",
}: {
  icon?: IconName;
  title: string;
  count?: number;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`flex flex-col gap-3.5 rounded-lg border border-line dark:border-line-dark bg-paper dark:bg-ink-soft p-4 ${className}`}>
      <div className="flex items-center gap-2.5">
        {icon && (
          <span className="flex h-7 w-7 flex-none items-center justify-center rounded-md bg-success/10 text-success">
            <Icon name={icon} className="h-4 w-4" />
          </span>
        )}
        <span className="text-xs font-bold uppercase tracking-wide text-ink dark:text-paper">{title}</span>
        {count != null && (
          <span className="grid h-5 min-w-[20px] place-items-center rounded-full border border-line dark:border-line-dark bg-cream dark:bg-[#0e0f0e] px-1.5 text-[11px] font-bold text-muted dark:text-muted-dark">
            {count}
          </span>
        )}
        {actions && <div className="ml-auto flex flex-wrap justify-end gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}
