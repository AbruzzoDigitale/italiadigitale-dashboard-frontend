import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon, type IconName } from "../../ui/Icon";
import { Spinner } from "../../ui/Spinner";
import { useAuth } from "../../../hooks/useAuth";
import { feedRoute, getFeedApi, type FeedItem } from "../../../api/feed";
import { useQuickData } from "./QuickListFrame";

/** Ogni sorgente del feed ha la sua icona, così la card si riconosce a colpo d'occhio. */
const SOURCE_ICON: Record<FeedItem["source"], IconName> = {
  work_item: "list",
  deadline: "clock",
  trip: "map-pin",
  quote: "document-text",
  contract: "target",
  client: "users",
  booking: "calendar",
  notification: "bell",
};

const TONE: Record<FeedItem["tone"], { chip: string; dot: string }> = {
  neutral: { chip: "bg-cream text-muted dark:bg-[#1c1c20] dark:text-[#9999a0]", dot: "bg-muted" },
  info: { chip: "bg-info/10 text-info", dot: "bg-info" },
  success: { chip: "bg-success/10 text-success", dot: "bg-success" },
  warning: { chip: "bg-warning/15 text-warning", dot: "bg-warning" },
  danger: { chip: "bg-danger/10 text-danger", dot: "bg-danger" },
};

/** "poco fa", "3 h fa", "ieri", "12/09". */
function quando(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 2) return "poco fa";
  if (min < 60) return `${min} min fa`;
  const ore = Math.round(min / 60);
  if (ore < 24) return `${ore} h fa`;
  if (ore < 48) return "ieri";
  const d = new Date(t);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const ROTAZIONE_MS = 6000;

/**
 * Widget "Novità": una card alla volta che ruota da sola, stile widget di telefono.
 *
 * Il mescolamento tra aree (lavorazioni, trasferte, sale, preventivi…) lo fa il backend
 * in `GET /api/v1/feed`: qui c'è solo la vetrina.
 */
export function FeedWidget() {
  const navigate = useNavigate();
  const { activeCompanyId } = useAuth();
  const { data, loading } = useQuickData(
    () => getFeedApi({ company_id: activeCompanyId, limit: 20 }),
    [activeCompanyId],
  );
  const items = useMemo(() => data?.items ?? [], [data]);

  const [i, setI] = useState(0);
  const [fermo, setFermo] = useState(false);
  // Il timer riparte da capo a ogni cambio manuale: chi clicca la freccia deve avere
  // il tempo pieno per leggere, non lo scampolo del giro precedente.
  const [giro, setGiro] = useState(0);

  useEffect(() => setI(0), [items.length]);

  useEffect(() => {
    if (fermo || items.length < 2) return;
    const id = setTimeout(() => setI((n) => (n + 1) % items.length), ROTAZIONE_MS);
    return () => clearTimeout(id);
  }, [i, fermo, items.length, giro]);

  const vai = (delta: number) => {
    setGiro((g) => g + 1);
    setI((n) => (n + delta + items.length) % items.length);
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="sm" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1.5 p-3 text-center">
        <Icon name="star" className="h-5 w-5 text-muted dark:text-[#9999a0]" />
        <p className="text-[11px] text-muted dark:text-[#9999a0]">Nessuna novità nelle ultime settimane</p>
      </div>
    );
  }

  const item = items[Math.min(i, items.length - 1)];
  const to = feedRoute(item);
  const tone = TONE[item.tone] ?? TONE.neutral;

  return (
    <div
      className="flex h-full flex-col p-3"
      onMouseEnter={() => setFermo(true)}
      onMouseLeave={() => setFermo(false)}
    >
      {/* Intestazione: categoria + tempo + frecce (solo al passaggio del mouse) */}
      <div className="mb-2 flex flex-shrink-0 items-center gap-1.5">
        <span className={`grid h-6 w-6 flex-shrink-0 place-items-center rounded-md ${tone.chip}`}>
          <Icon name={SOURCE_ICON[item.source] ?? "bell"} className="h-3.5 w-3.5" />
        </span>
        <span className="truncate text-[10px] font-bold uppercase tracking-wider text-muted dark:text-[#9999a0]">
          {item.category}
        </span>
        <span className="ml-auto flex flex-shrink-0 items-center gap-1">
          {fermo && items.length > 1 ? (
            <>
              <button
                type="button"
                onClick={() => vai(-1)}
                aria-label="Novità precedente"
                className="grid h-5 w-5 place-items-center rounded text-muted hover:bg-cream dark:text-[#9999a0] dark:hover:bg-[#1c1c20]"
              >
                <Icon name="chevron-right" className="h-3.5 w-3.5 rotate-180" />
              </button>
              <button
                type="button"
                onClick={() => vai(1)}
                aria-label="Novità successiva"
                className="grid h-5 w-5 place-items-center rounded text-muted hover:bg-cream dark:text-[#9999a0] dark:hover:bg-[#1c1c20]"
              >
                <Icon name="chevron-right" className="h-3.5 w-3.5" />
              </button>
            </>
          ) : (
            <span className="text-[10px] font-semibold text-muted dark:text-[#9999a0]">{quando(item.at)}</span>
          )}
        </span>
      </div>

      {/* Corpo: la novità corrente. `key` rilancia l'animazione a ogni cambio. */}
      <div
        key={item.id}
        onClick={to ? () => navigate(to) : undefined}
        className={`animate-fadeIn min-h-0 flex-1 overflow-hidden ${to ? "cursor-pointer" : ""}`}
      >
        <p className="line-clamp-3 font-display text-[15px] font-bold leading-snug tracking-tight text-ink dark:text-[#f4f4f7]">
          {item.title}
        </p>
        {item.subtitle && (
          <p className="mt-1 line-clamp-2 text-[12px] font-semibold text-ink/70 dark:text-[#c9c9d0]">
            {item.subtitle}
          </p>
        )}
        {item.meta && (
          <p className="mt-0.5 line-clamp-1 text-[11px] text-muted dark:text-[#9999a0]">{item.meta}</p>
        )}
      </div>

      {/* Puntini di posizione, come i widget del telefono (al massimo otto) */}
      {items.length > 1 && (
        <div className="mt-2 flex flex-shrink-0 items-center justify-center gap-1">
          {items.slice(0, 8).map((it, n) => (
            <button
              key={it.id}
              type="button"
              aria-label={`Vai alla novità ${n + 1}`}
              onClick={() => {
                setGiro((g) => g + 1);
                setI(n);
              }}
              className={`h-1 rounded-pill transition-all ${
                n === i % Math.min(items.length, 8) ? `w-3 ${tone.dot}` : "w-1 bg-line dark:bg-[#2a2a2e]"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
