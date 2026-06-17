import { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { useSelectedCompanyId } from "../hooks/useSelectedCompanyId";
import { useToast } from "../context/ToastContext";
import { getDailyTasksSelfApi, getDailyTasksAdminAccordionApi } from "../api/workload";
import { Icon } from "../components/ui/Icon";
import { Spinner } from "../components/ui/Spinner";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Accordion, type AccordionItem } from "../components/ui/Accordion";
import { PageSectionHeader } from "../components/ui/PageSectionHeader";
import { QuickTaskModal } from "../components/work-items/QuickTaskModal";
import "./workload-page.css";
import "./daily-tasks-page.css";

type ViewMode = "self" | "admin";

function getTodayDate(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function dateFromIso(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function isoFromDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftIsoByDays(iso: string, days: number): string {
  const date = dateFromIso(iso);
  date.setDate(date.getDate() + days);
  return isoFromDate(date);
}

function formatDayLabel(iso: string): string {
  return dateFromIso(iso).toLocaleDateString("it-IT", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getDayGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Buongiorno";
  if (hour >= 12 && hour < 18) return "Buon pomeriggio";
  if (hour >= 18 && hour < 23) return "Buonasera";

  const lateNightEggs = [
    "Buonanotte, nottambulo",
    "Ancora operativo a quest'ora?",
    "Modalita' ninja attiva",
    "Turno notturno leggendario",
  ];

  return lateNightEggs[Math.floor(Math.random() * lateNightEggs.length)];
}

function loadClass(loadPercent: number): "wl-acc-load--ok" | "wl-acc-load--warning" | "wl-acc-load--overload" {
  if (loadPercent >= 100) return "wl-acc-load--overload";
  if (loadPercent >= 80) return "wl-acc-load--warning";
  return "wl-acc-load--ok";
}

function barClass(loadPercent: number): "wl-acc-bar--ok" | "wl-acc-bar--warning" | "wl-acc-bar--overload" {
  if (loadPercent >= 100) return "wl-acc-bar--overload";
  if (loadPercent >= 80) return "wl-acc-bar--warning";
  return "wl-acc-bar--ok";
}

function renderLoadLegend() {
  return (
    <div className="mb-3 rounded-md border border-line dark:border-line-dark bg-paper dark:bg-ink-soft px-3 py-2">
      <div className="flex flex-wrap items-center gap-3 text-[11px]">
        <span className="font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Legenda carico</span>
        <span className="inline-flex items-center gap-1.5 text-muted dark:text-muted-dark">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-success/30 border border-success/40" />
          Basso/OK (&lt; 80%)
        </span>
        <span className="inline-flex items-center gap-1.5 text-muted dark:text-muted-dark">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-warning/30 border border-warning/40" />
          Attenzione (80-99%)
        </span>
        <span className="inline-flex items-center gap-1.5 text-muted dark:text-muted-dark">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-danger/30 border border-danger/40" />
          Overload (&gt;= 100%)
        </span>
      </div>
    </div>
  );
}

export function DailyTasksPage() {
  const { user, permissions } = useAuth();
  const isAdmin = !!permissions?.is_admin;
  const { selectedCompanyId } = useSelectedCompanyId(user?.company_id ?? null);
  const companyId = selectedCompanyId ?? user?.company_id ?? null;
  const toast = useToast();

  const [viewMode, setViewMode] = useState<ViewMode>(isAdmin ? "admin" : "self");
  const [targetDate, setTargetDate] = useState(getTodayDate());

  const [selfData, setSelfData] = useState<any>(null);
  const [adminData, setAdminData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quickTaskModalOpen, setQuickTaskModalOpen] = useState(false);

  const [expandedUsers, setExpandedUsers] = useState<Record<number, boolean>>({});

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      if (viewMode === "self") {
        const data = await getDailyTasksSelfApi({
          target_date: targetDate,
          company_id: companyId ?? undefined,
        });
        setSelfData(data);
      } else {
        const data = await getDailyTasksAdminAccordionApi({
          target_date: targetDate,
          company_id: companyId ?? undefined,
        });
        setAdminData(data);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Errore caricamento attività";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [viewMode, targetDate]);

  const getLoadPercentColor = (pct: number) => {
    if (pct >= 100) return "danger";
    if (pct >= 80) return "warning";
    return "success";
  };

  const renderSelfView = () => {
    if (!selfData) return null;

    const { tasks_total, tasks_completed, completion_rate_percent, load_percent, next_task, tasks, full_name, username, avatar_url } = selfData;
    const displayName = full_name || username;
    const initials = (displayName || "U")
      .split(" ")
      .slice(0, 2)
      .map((word: string) => word[0]?.toUpperCase() || "")
      .join("");

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          {avatar_url ? (
            <img
              src={avatar_url}
              alt={displayName}
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-ink dark:bg-paper text-paper dark:text-ink flex items-center justify-center text-xs font-bold">
              {initials}
            </div>
          )}
          <div className="text-sm font-semibold text-ink dark:text-paper">
            {getDayGreeting()} {displayName}
          </div>
        </div>

        {/* KPI Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg border border-line dark:border-line-dark bg-paper dark:bg-ink-soft p-4">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted dark:text-muted-dark mb-1">
              Task totali
            </div>
            <div className="text-2xl font-bold text-ink dark:text-paper">{tasks_total}</div>
          </div>

          <div className="rounded-lg border border-line dark:border-line-dark bg-paper dark:bg-ink-soft p-4">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted dark:text-muted-dark mb-1">
              Completate
            </div>
            <div className="text-2xl font-bold text-success">{tasks_completed}</div>
          </div>

          <div className="rounded-lg border border-line dark:border-line-dark bg-paper dark:bg-ink-soft p-4">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted dark:text-muted-dark mb-1">
              Completamento
            </div>
            <div className="text-2xl font-bold text-ink dark:text-paper">
              {completion_rate_percent.toFixed(0)}%
            </div>
          </div>

          <div className="rounded-lg border border-line dark:border-line-dark bg-paper dark:bg-ink-soft p-4">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted dark:text-muted-dark mb-1">
              Carico orario
            </div>
            <div className={`text-2xl font-bold ${getLoadPercentColor(load_percent) === "danger" ? "text-danger" : getLoadPercentColor(load_percent) === "warning" ? "text-warning" : "text-success"}`}>
              {load_percent.toFixed(0)}%
            </div>
          </div>
        </div>

        {/* Next Task */}
        {next_task ? (
          <div className={`rounded-lg border border-line dark:border-line-dark bg-paper dark:bg-ink-soft p-4 ${Boolean(next_task.is_PED ?? next_task.is_ped) ? "ring-1 ring-info/35 bg-info/5 dark:bg-info/10" : ""}`}>
            <h3 className="font-bold text-sm text-ink dark:text-paper mb-3">Prossima task</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <div className="font-semibold text-ink dark:text-paper">{next_task.title}</div>
                {Boolean(next_task.is_PED ?? next_task.is_ped) && (
                  <span className="inline-flex rounded-pill border border-info/30 bg-info/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-info">
                    PED
                  </span>
                )}
              </div>
              <div className="text-sm text-muted dark:text-muted-dark">
                {next_task.client_name || "Senza cliente"} · {next_task.status}
              </div>
              {next_task.start_time && (
                <div className="text-xs text-muted dark:text-muted-dark">
                  Inizio: {next_task.start_time}
                </div>
              )}
              {next_task.estimated_hours && (
                <div className="text-xs text-muted dark:text-muted-dark">
                  Stimate: {next_task.estimated_hours}h
                </div>
              )}
              {typeof next_task.effective_load_hours === "number" && (
                <div className="text-xs text-muted dark:text-muted-dark">
                  Effettive: {next_task.effective_load_hours}h
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-line dark:border-line-dark bg-cream dark:bg-ink-2 p-4 text-center text-sm text-muted dark:text-muted-dark">
            Nessuna prossima task.
          </div>
        )}

        {/* Task List */}
        <div className="rounded-lg border border-line dark:border-line-dark bg-paper dark:bg-ink-soft overflow-hidden">
          <div className="px-4 py-3 border-b border-line dark:border-line-dark bg-cream dark:bg-ink-2">
            <h3 className="font-bold text-sm text-ink dark:text-paper">Task del giorno ({tasks.length})</h3>
          </div>
          {tasks.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted dark:text-muted-dark">
              Nessuna task per oggi.
            </div>
          ) : (
            <div className="divide-y divide-line dark:divide-line-dark">
              {tasks.map((task: any) => {
                const isPedTask = Boolean(task.is_PED ?? task.is_ped);
                return (
                <div key={task.work_item_id} className={`p-4 ${isPedTask ? "bg-info/5 dark:bg-info/10" : ""}`}>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5">
                        <h4 className="font-semibold text-ink dark:text-paper">{task.title}</h4>
                        {isPedTask && (
                          <span className="inline-flex rounded-pill border border-info/30 bg-info/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-info">
                            PED
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted dark:text-muted-dark mt-1">
                        {task.client_name || "Senza cliente"}
                      </p>
                    </div>
                    {task.is_completed && (
                      <Badge variant="success">Completata</Badge>
                    )}
                    {task.is_priority && (
                      <Icon name="star" className="w-4 h-4 text-warning" />
                    )}
                  </div>
                  {task.is_left_behind && (
                    <div className="mb-2 inline-flex rounded-pill px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-warning/15 text-warning border border-warning/30">
                      Lasciata indietro
                    </div>
                  )}
                  {task.work_areas && task.work_areas.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {task.work_areas.map((area: any) => (
                        <span
                          key={area.id}
                          className="inline-flex text-[10px] px-2 py-1 rounded-full"
                          style={{
                            backgroundColor: area.color ? `${area.color}22` : "rgba(0,0,0,0.05)",
                            color: area.color || "#666",
                            border: area.color ? `1px solid ${area.color}44` : "1px solid #ddd",
                          }}
                        >
                          {area.name}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-3 mt-3 text-[11px] text-muted dark:text-muted-dark">
                    {task.start_time && <span>{task.start_time}</span>}
                    {task.estimated_hours && <span>{task.estimated_hours}h stimate</span>}
                    {typeof task.effective_load_hours === "number" && <span>{task.effective_load_hours}h effettive</span>}
                    {typeof task.load_weight_factor === "number" && <span>peso {task.load_weight_factor.toFixed(2)}x</span>}
                    {task.actual_hours_spent && <span>{task.actual_hours_spent}h effettive</span>}
                    <span>{Math.round(task.progress_percent ?? 0)}%</span>
                  </div>
                </div>
              );})}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderAdminView = () => {
    if (!adminData) return null;

    const { users } = adminData;

    if (users.length === 0) {
      return (
        <div className="rounded-lg border border-dashed border-line dark:border-line-dark p-6 text-center text-sm text-muted dark:text-muted-dark">
          Nessun operatore trovato.
        </div>
      );
    }

    const accordionItems: AccordionItem[] = users.map((operatore: any) => ({
      id: operatore.user_id,
      data: operatore,
    }));

    return (
      <Accordion
        items={accordionItems}
        isOpen={expandedUsers}
        onToggle={(id) => setExpandedUsers((cur) => ({ ...cur, [id]: !cur[id as keyof typeof cur] }))}
        className="wl-acc-list"
        itemClassName="wl-acc-lane"
        headerClassName="wl-acc-lane__row"
        chevronClassName="wl-acc-lane__toggle w-4 h-4 transition-transform"
        contentClassName="px-0 pb-0 pt-3 mt-3 border-t border-line/70 dark:border-line-dark"
        renderHeader={(operatore: any) => (
          <>
            <div className="wl-acc-lane__op">
            {operatore.avatar_url ? (
                <div className="wl-acc-avatar wl-acc-avatar--photo">
                  <img src={operatore.avatar_url} alt={operatore.full_name || operatore.username} />
                </div>
            ) : (
                <div className="wl-acc-avatar">
                  {(operatore.full_name || operatore.username)
                    .split(" ")
                    .slice(0, 2)
                    .map((word: string) => word[0]?.toUpperCase() || "")
                    .join("")}
                </div>
            )}
              <div className="min-w-0">
                <div className="wl-acc-lane__name">{operatore.full_name || operatore.username}</div>
                <div className="wl-acc-lane__role">
                  {operatore.tasks_completed}/{operatore.tasks_total} task completate · {operatore.completion_rate_percent.toFixed(0)}%
                </div>
              </div>
            </div>

            <div className="wl-acc-lane__bar-wrap">
              <div className="wl-acc-lane__bar-head">
                <span className="wl-acc-lane__bar-label">Carico giornaliero</span>
                <span className={`wl-acc-load ${loadClass(operatore.load_percent)}`}>
                  {operatore.load_percent.toFixed(0)}%
                </span>
              </div>
              <div className="wl-acc-bar-track">
                <div
                  className={`wl-acc-bar ${barClass(operatore.load_percent)}`}
                  style={{ width: `${Math.min(operatore.load_percent, 100)}%` }}
                />
              </div>
            </div>

            <div className="wl-acc-lane__badge">
              <Badge variant={operatore.load_percent >= 100 ? "danger" : operatore.load_percent >= 80 ? "warning" : "success"}>
                {operatore.load_percent >= 100 ? "Overload" : operatore.load_percent >= 80 ? "Warning" : "OK"}
              </Badge>
            </div>
          </>
        )}
        renderContent={(operatore: any) =>
          operatore.tasks.length === 0 ? (
            <div className="rounded-md border border-dashed border-line dark:border-line-dark px-3 py-3 text-xs text-muted dark:text-muted-dark">
              Nessuna task
            </div>
          ) : (
            <div className="space-y-2">
              {operatore.tasks.map((task: any) => (
                // Workload endpoints can expose PED with either is_ped or is_PED.
                (() => {
                  const isPedTask = Boolean(task.is_PED ?? task.is_ped);
                  return (
                <div
                  key={task.work_item_id}
                  className={`w-full text-left rounded-md border border-line dark:border-line-dark bg-cream/40 dark:bg-ink-2 px-3 py-2 ${isPedTask ? "ring-1 ring-info/35 bg-info/5 dark:bg-info/10" : ""}`}
                >
                  <div className="flex items-center gap-1.5">
                    <div className="text-sm font-semibold text-ink dark:text-paper">{task.title}</div>
                    {isPedTask && (
                      <span className="inline-flex rounded-pill border border-info/30 bg-info/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-info">
                        PED
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted dark:text-muted-dark">
                    {task.client_name || "Senza cliente"} · {task.status}
                  </div>
                  <div className="mt-1 text-[11px] text-muted dark:text-muted-dark">
                    {typeof task.effective_load_hours === "number" ? `${task.effective_load_hours}h effettive` : "0h effettive"}
                    {task.estimated_hours != null ? ` · ${task.estimated_hours}h stimate` : ""}
                  </div>
                </div>
                  );
                })()
              ))}
            </div>
          )
        }
      />
    );
  };

  return (
    <div className="px-10 py-8 pb-20 max-w-[1440px] mx-auto w-full animate-fadeIn">
      <PageSectionHeader
        eyebrow="Operazioni"
        eyebrowIcon={<Icon name="activity" className="w-3.5 h-3.5" />}
        title="Attività del giorno"
        lead="Panoramica completa delle task per oggi"
      />

      <div className="dt-toolbar-shell mb-5">
        <div className="dt-toolbar-row-single">
          <div className="dt-toolbar-left">
            <button
              type="button"
              onClick={() => setTargetDate((current) => shiftIsoByDays(current, -1))}
              className="wl-nav-btn"
              aria-label="Giorno precedente"
            >
              <Icon name="chevron-right" className="h-4 w-4 rotate-180" />
            </button>

            <div className="wl-range-label">{formatDayLabel(targetDate)}</div>

            <button
              type="button"
              onClick={() => setTargetDate((current) => shiftIsoByDays(current, 1))}
              className="wl-nav-btn"
              aria-label="Giorno successivo"
            >
              <Icon name="chevron-right" className="h-4 w-4" />
            </button>

            <button type="button" className="wl-today-btn" onClick={() => setTargetDate(getTodayDate())}>
              Oggi
            </button>

            <button type="button" className="wl-ghost-btn" onClick={() => void loadData()}>
              <Icon name="refresh-cw" className="w-3.5 h-3.5" />
              Aggiorna
            </button>

            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Icon name="plus" className="w-3.5 h-3.5" />}
              onClick={() => setQuickTaskModalOpen(true)}
              disabled={companyId == null}
              className="!rounded-full"
            >
              Task rapida
            </Button>
          </div>

          {isAdmin && (
            <div className="dt-toolbar-right">
              <div className="wl-segmented wl-segmented--view">
                <button
                  type="button"
                  onClick={() => setViewMode("self")}
                  className={`wl-segmented-btn wl-segmented-btn--view ${viewMode === "self" ? "is-active" : ""}`}
                >
                  <Icon name="user-circle" className="w-3.5 h-3.5" />
                  Mie task
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("admin")}
                  className={`wl-segmented-btn wl-segmented-btn--view ${viewMode === "admin" ? "is-active" : ""}`}
                >
                  <Icon name="users" className="w-3.5 h-3.5" />
                  Team
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {renderLoadLegend()}

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : viewMode === "self" ? (
        renderSelfView()
      ) : (
        renderAdminView()
      )}

      <QuickTaskModal
        open={quickTaskModalOpen}
        onClose={() => setQuickTaskModalOpen(false)}
        companyId={companyId}
        onCreated={() => {
          void loadData();
        }}
      />
    </div>
  );
}
