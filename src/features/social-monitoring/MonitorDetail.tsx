import { useEffect, useMemo, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { SocialIcon } from "../../components/social/SocialIcon";
import { LineChart } from "../../components/dashboard/charts/primitives";
import { useToast } from "../../context/ToastContext";
import {
  getMonitorAnalyticsByIdApi,
  listMonitorAlertsApi,
  listMonitorRecentPostsByIdApi,
  listMonitorRunsApi,
  type RecentPost,
  type SocialAlert,
  type SocialAnalytics,
  type SocialMonitor,
  type SocialMonitorRun,
} from "../../api/socialMonitors";

type Gran = "day" | "week" | "month";

function fmtDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("it-IT", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}
/** Etichetta periodo per i grafici: settimana → "S31"; mese/giorno passano a fmtPeriod. */
function periodLabel(period: string, gran: Gran): string {
  if (gran === "week") {
    const w = period.split("-W")[1];
    return w ? `S${w}` : period;
  }
  return period;
}

// Badge colorati per distinguere i tipi a colpo d'occhio.
const TYPE_BADGE: Record<string, { cls: string; label: string }> = {
  post: { cls: "bg-brand-magenta/10 text-brand-magenta", label: "Post" },
  reel: { cls: "bg-brand-cyan/10 text-brand-cyan", label: "Reel" },
  story: { cls: "bg-warning/10 text-warning", label: "Storia" },
};

function TypeBadge({ ct }: { ct: string }) {
  const b = TYPE_BADGE[ct] ?? { cls: "bg-muted/10 text-muted dark:text-[#9999a0]", label: ct };
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${b.cls}`}
    >
      {b.label}
    </span>
  );
}

const RUN_BADGE: Record<string, { v: "success" | "warning" | "danger" | "info"; l: string }> = {
  success: { v: "success", l: "OK" },
  partial: { v: "warning", l: "Parziale" },
  error: { v: "danger", l: "Errore" },
  running: { v: "info", l: "In corso" },
};

interface Props {
  monitor: SocialMonitor;
  running: boolean;
  onRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function MonitorDetail({ monitor, running, onRun, onEdit, onDelete }: Props) {
  const toast = useToast();
  const [gran, setGran] = useState<Gran>("week");
  const [analytics, setAnalytics] = useState<SocialAnalytics | null>(null);
  const [runs, setRuns] = useState<SocialMonitorRun[]>([]);
  const [alerts, setAlerts] = useState<SocialAlert[]>([]);
  const [posts, setPosts] = useState<RecentPost[]>([]);
  const [stories, setStories] = useState<RecentPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getMonitorAnalyticsByIdApi(monitor.id, { granularity: gran }),
      listMonitorRunsApi(monitor.id, 8),
      listMonitorAlertsApi(monitor.id, "open", 20),
      listMonitorRecentPostsByIdApi(monitor.id, { limit: 60 }),
      monitor.check_stories
        ? listMonitorRecentPostsByIdApi(monitor.id, { limit: 30, contentType: "story" })
        : Promise.resolve([] as RecentPost[]),
    ])
      .then(([a, r, al, p, st]) => {
        if (cancelled) return;
        setAnalytics(a);
        setRuns(r);
        setAlerts(al);
        setPosts(p);
        setStories(st);
      })
      .catch((err) => {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Errore nel caricamento");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [monitor.id, gran, monitor.check_stories, toast]);

  const freqPoints = useMemo(
    () => (analytics?.posts_per_period ?? []).map((r) => ({ label: periodLabel(r.period, gran), value: r.count })),
    [analytics, gran]
  );
  const likePoints = useMemo(
    () => (analytics?.engagement_per_period ?? []).map((r) => ({ label: periodLabel(r.period, gran), value: r.avg_likes })),
    [analytics, gran]
  );
  const groupByProfile = (items: RecentPost[]) => {
    const map = new Map<number, RecentPost[]>();
    for (const p of items) {
      const arr = map.get(p.social_profile_id);
      if (arr) arr.push(p);
      else map.set(p.social_profile_id, [p]);
    }
    return map;
  };
  const postsByProfile = useMemo(() => groupByProfile(posts), [posts]);
  const storiesByProfile = useMemo(() => groupByProfile(stories), [stories]);

  const renderTypeBlock = (ct: string, items: RecentPost[]) => (
    <div>
      <div className="mb-1">
        <TypeBadge ct={ct} />
      </div>
      {items.length === 0 ? (
        <p className="text-[12px] text-muted/70 dark:text-[#9999a0]/70">Nessuno rilevato.</p>
      ) : (
        <div className="flex flex-col gap-1">
          {items.slice(0, 5).map((p) => (
            <div key={p.id} className="flex items-center gap-2.5 text-[12.5px]">
              <span className="w-24 flex-none tabular-nums text-muted dark:text-[#9999a0]">{fmtDateTime(p.posted_at)}</span>
              <span className="min-w-0 flex-1 truncate text-ink dark:text-[#f4f4f7]" title={p.caption ?? ""}>
                {p.caption || "—"}
              </span>
              <span className="flex-none tabular-nums text-muted dark:text-[#9999a0]">
                ♥ {p.like_count ?? "—"} · 💬 {p.comments_count ?? "—"}
                {p.reach != null ? ` · reach ${p.reach}` : ""}
              </span>
              {p.permalink && (
                <a href={p.permalink} target="_blank" rel="noreferrer" className="flex-none text-brand-magenta hover:underline">
                  <Icon name="link" className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderStoryBlock = (items: RecentPost[]) => (
    <div>
      <p className="mb-1 flex flex-wrap items-center gap-1.5">
        <TypeBadge ct="story" />
        <span className="text-[9px] uppercase tracking-wider text-muted/70 dark:text-[#9999a0]/70">(24h · solo se attive)</span>
      </p>
      {items.length === 0 ? (
        <p className="text-[12px] text-muted/70 dark:text-[#9999a0]/70">Nessuna raccolta finora.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.map((s) => (
            <div key={s.id} className="flex items-center gap-1.5 rounded-md border border-line px-2 py-0.5 text-[11px] dark:border-[#2a2a2e]">
              <span className="tabular-nums text-ink dark:text-[#f4f4f7]">{fmtDateTime(s.posted_at)}</span>
              {s.permalink && (
                <a href={s.permalink} target="_blank" rel="noreferrer" className="text-brand-magenta hover:underline">
                  <Icon name="link" className="h-3 w-3" />
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-[18px] font-bold text-ink dark:text-[#f4f4f7]">{monitor.name}</h2>
            <Badge variant={monitor.is_active ? "success" : "info"}>{monitor.is_active ? "Attivo" : "In pausa"}</Badge>
          </div>
          <p className="text-[12.5px] text-muted dark:text-[#9999a0]">
            {monitor.client_name ? `Cliente: ${monitor.client_name}` : `${monitor.targets.length} pagine`} · ogni{" "}
            {monitor.interval_hours}h · soglia {monitor.default_inactivity_days}g · promemoria {monitor.reminder_interval_days}g
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={onRun} loading={running} leftIcon={<Icon name="refresh-cw" className="w-3.5 h-3.5" />}>
            Esegui ora
          </Button>
          <button type="button" title="Modifica" onClick={onEdit} className="inline-grid h-9 w-9 place-items-center rounded-md border border-line text-ink hover:bg-cream dark:border-[#2a2a2e] dark:text-[#f4f4f7] dark:hover:bg-[#1c1c20]">
            <Icon name="pencil" className="h-4 w-4" />
          </button>
          <button type="button" title="Elimina" onClick={onDelete} className="inline-grid h-9 w-9 place-items-center rounded-md border border-danger/20 bg-danger/5 text-danger hover:bg-danger/10">
            <Icon name="trash" className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Stat chips */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { l: "Ultima esecuzione", v: fmtDateTime(monitor.last_run_at) },
          { l: "Prossima", v: fmtDateTime(monitor.next_run_at) },
          { l: "Post analizzati", v: String(analytics?.cadence.posts ?? "—") },
          { l: "Cadenza media", v: analytics?.cadence.avg_gap_days != null ? `${analytics.cadence.avg_gap_days} gg` : "—" },
        ].map((s) => (
          <div key={s.l} className="rounded-lg border border-line bg-cream px-3 py-2 dark:border-[#2a2a2e] dark:bg-[#1c1c20]">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">{s.l}</p>
            <p className="text-[13.5px] font-bold text-ink dark:text-[#f4f4f7]">{s.v}</p>
          </div>
        ))}
      </div>

      {/* Ultime pubblicazioni per pagina — in evidenza tra le prime info */}
      <div className="rounded-lg border border-line p-3 dark:border-[#2a2a2e]">
        <p className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
          Ultime pubblicazioni
        </p>
        <div className="flex flex-col gap-1.5">
          {monitor.targets.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center gap-2.5 text-[12.5px]">
              <SocialIcon platform={t.platform ?? ""} className="h-5 w-5 flex-none" />
              <span className="min-w-0 flex-1 truncate text-ink dark:text-[#f4f4f7]">{t.profile_name}</span>
              <div className="flex flex-wrap items-center gap-2">
                {monitor.check_posts && (
                  <span className="inline-flex items-center gap-1 text-[11px] tabular-nums text-muted dark:text-[#9999a0]">
                    <TypeBadge ct="post" /> {fmtDateTime(t.last_post_at)}
                  </span>
                )}
                {monitor.check_reels && (
                  <span className="inline-flex items-center gap-1 text-[11px] tabular-nums text-muted dark:text-[#9999a0]">
                    <TypeBadge ct="reel" /> {fmtDateTime(t.last_reel_at)}
                  </span>
                )}
                {monitor.check_stories && (
                  <span className="inline-flex items-center gap-1 text-[11px] tabular-nums text-muted dark:text-[#9999a0]">
                    <TypeBadge ct="story" /> {fmtDateTime(t.last_story_at)}
                  </span>
                )}
              </div>
              {t.is_alerting ? <Badge variant="danger">In allarme</Badge> : <Badge variant="success">OK</Badge>}
            </div>
          ))}
        </div>
      </div>

      {/* Alert aperti */}
      {alerts.length > 0 && (
        <div className="rounded-lg border border-danger/20 bg-danger/5 p-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-danger">
            <Icon name="alert-triangle" className="h-3.5 w-3.5" /> {alerts.length} avvisi aperti
          </p>
          <div className="flex flex-col gap-1">
            {alerts.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-2 text-[12.5px] text-ink dark:text-[#f4f4f7]">
                <span className="flex min-w-0 items-center gap-1.5">
                  <TypeBadge ct={a.content_type} />
                  <span className="min-w-0 truncate">{a.profile_name}</span>
                </span>
                <span className="flex-none text-danger">{a.days_inactive} giorni senza pubblicare</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grafici */}
      <div className="rounded-lg border border-line p-3 dark:border-[#2a2a2e]">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">Andamento</p>
          <div className="flex gap-1">
            {(["day", "week", "month"] as Gran[]).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGran(g)}
                className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                  gran === g
                    ? "bg-ink text-paper dark:bg-[#f4f4f7] dark:text-ink"
                    : "text-muted hover:bg-cream dark:text-[#9999a0] dark:hover:bg-[#1c1c20]"
                }`}
              >
                {g === "day" ? "Giorno" : g === "week" ? "Settimana" : "Mese"}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <p className="mb-1 text-[11.5px] text-muted dark:text-[#9999a0]">Post pubblicati</p>
            <div className="h-40">
              <LineChart points={freqPoints} format={(n) => String(Math.round(n))} />
            </div>
          </div>
          <div>
            <p className="mb-1 text-[11.5px] text-muted dark:text-[#9999a0]">Like medi per post</p>
            <div className="h-40">
              <LineChart points={likePoints} color="#2ec3f3" />
            </div>
          </div>
        </div>
      </div>

      {/* Contenuti per pagina, divisi per tipo (post/reel/storie in base a cosa è selezionato) */}
      <div className="rounded-lg border border-line p-3 dark:border-[#2a2a2e]">
        <p className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
          Contenuti per pagina
        </p>
        {loading ? (
          <p className="text-[12.5px] text-muted dark:text-[#9999a0]">Caricamento…</p>
        ) : (
          <div className="flex flex-col gap-3">
            {monitor.targets.map((t) => {
              const pAll = postsByProfile.get(t.social_profile_id) ?? [];
              const pPosts = pAll.filter((p) => p.content_type === "post");
              const pReels = pAll.filter((p) => p.content_type === "reel");
              const pStories = storiesByProfile.get(t.social_profile_id) ?? [];
              return (
                <div key={t.id} className="rounded-md bg-cream/50 p-2.5 dark:bg-[#131316]">
                  <div className="mb-1.5 flex items-center gap-2">
                    <SocialIcon platform={t.platform ?? ""} className="h-4 w-4 flex-none" />
                    <span className="min-w-0 truncate text-[13px] font-bold text-ink dark:text-[#f4f4f7]">
                      {t.profile_name}
                    </span>
                    {t.is_alerting && <Badge variant="danger">In allarme</Badge>}
                  </div>
                  <div className="flex flex-col gap-2 pl-6">
                    {monitor.check_posts && renderTypeBlock("post", pPosts)}
                    {monitor.check_reels && renderTypeBlock("reel", pReels)}
                    {monitor.check_stories && renderStoryBlock(pStories)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Conteggio contenuti nel periodo analizzato */}
      <div className="rounded-lg border border-line p-3 dark:border-[#2a2a2e]">
        <p className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
          Contenuti raccolti nel periodo analizzato
        </p>
        <div className="flex flex-wrap gap-2">
          {[
            { on: monitor.check_posts, ct: "post", n: analytics?.counts_by_type?.post ?? 0 },
            { on: monitor.check_reels, ct: "reel", n: analytics?.counts_by_type?.reel ?? 0 },
            { on: monitor.check_stories, ct: "story", n: analytics?.counts_by_type?.story ?? 0 },
          ]
            .filter((c) => c.on)
            .map((c) => (
              <div key={c.ct} className="min-w-[92px] rounded-lg border border-line px-3 py-2 dark:border-[#2a2a2e]">
                <TypeBadge ct={c.ct} />
                <p className="mt-1 text-[18px] font-bold text-ink dark:text-[#f4f4f7]">{c.n}</p>
              </div>
            ))}
        </div>
      </div>

      {/* Esecuzioni */}
      <div className="rounded-lg border border-line p-3 dark:border-[#2a2a2e]">
        <p className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">Esecuzioni recenti</p>
        {runs.length === 0 ? (
          <p className="text-[12.5px] text-muted dark:text-[#9999a0]">Nessuna esecuzione.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {runs.map((r) => {
              const b = RUN_BADGE[r.status] ?? { v: "info" as const, l: r.status };
              return (
                <div key={r.id} className="flex items-center gap-2.5 text-[12.5px]">
                  <span className="w-28 flex-none text-muted dark:text-[#9999a0]">{fmtDateTime(r.started_at)}</span>
                  <Badge variant={b.v}>{b.l}</Badge>
                  <span className="flex-1 text-muted dark:text-[#9999a0]">
                    {r.targets_ok}/{r.targets_total} ok
                    {r.targets_error > 0 ? ` · ${r.targets_error} errori` : ""}
                    {r.alerts_triggered > 0 ? ` · ${r.alerts_triggered} avvisi` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
