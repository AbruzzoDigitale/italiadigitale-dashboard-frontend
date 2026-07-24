import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Icon, type IconName } from "../../ui/Icon";
import { Spinner } from "../../ui/Spinner";

/** Fetch generico per i widget rapidi: {data, loading}. */
export function useQuickData<T>(fetcher: () => Promise<T>, deps: unknown[]): { data: T | null; loading: boolean } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetcher()
      .then((r) => !cancelled && setData(r))
      .catch(() => !cancelled && setData(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, loading };
}

/** "2026-07-22" → "22/07". */
export function fmtDate(s?: string | null): string {
  if (!s) return "";
  const p = s.slice(0, 10).split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}` : s;
}

export function fmtMoney(n?: number | null): string {
  if (n == null) return "";
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

/** Cornice di un widget-lista: header cliccabile (naviga) + corpo scrollabile. */
export function QuickListFrame({
  title,
  icon,
  to,
  count,
  loading,
  empty,
  emptyText = "Niente da mostrare",
  children,
}: {
  title: string;
  icon?: IconName;
  to?: string;
  count?: number;
  loading?: boolean;
  empty?: boolean;
  emptyText?: string;
  children?: ReactNode;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const go = to ? () => navigate({ pathname: to, search: location.search }) : undefined;

  return (
    <div className="flex h-full flex-col p-3">
      <div
        onClick={go}
        className={`group mb-1.5 flex flex-shrink-0 items-center gap-1.5 ${go ? "cursor-pointer" : ""}`}
      >
        {icon && <Icon name={icon} className="h-4 w-4 flex-shrink-0 text-brand-magenta" />}
        <span className="truncate text-[12px] font-semibold text-ink dark:text-[#f4f4f7]">{title}</span>
        {count != null && count > 0 && (
          <span className="rounded-pill bg-brand-magenta/10 px-1.5 text-[10px] font-bold text-brand-magenta">
            {count}
          </span>
        )}
        {go && (
          <Icon
            name="chevron-right"
            className="ml-auto h-3.5 w-3.5 flex-shrink-0 text-muted transition-transform group-hover:translate-x-0.5 dark:text-[#9999a0]"
          />
        )}
      </div>
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Spinner size="sm" />
          </div>
        ) : empty ? (
          <div className="flex h-full items-center justify-center text-[11px] text-muted dark:text-[#9999a0]">
            {emptyText}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

/** Riga compatta standard. */
export function QuickRow({
  title,
  sub,
  right,
  bold,
  onClick,
}: {
  title: string;
  sub?: string;
  right?: ReactNode;
  bold?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-2 border-b border-line/60 py-1.5 text-[12px] last:border-0 dark:border-[#2a2a2e] ${
        onClick ? "-mx-1 cursor-pointer rounded px-1 hover:bg-cream dark:hover:bg-[#1c1c20]" : ""
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className={`truncate text-ink dark:text-[#f4f4f7] ${bold ? "font-semibold" : ""}`}>{title}</p>
        {sub && <p className="truncate text-[11px] text-muted dark:text-[#9999a0]">{sub}</p>}
      </div>
      {right && <div className="flex-shrink-0">{right}</div>}
    </div>
  );
}
