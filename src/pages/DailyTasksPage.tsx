import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "../hooks/useAuth";
import { useSelectedCompanyId } from "../hooks/useSelectedCompanyId";
import { useToast } from "../context/ToastContext";
import { getDailyTasksSelfApi, getDailyTasksAdminAccordionApi } from "../api/workload";
import { Icon, type IconName } from "../components/ui/Icon";
import { Spinner } from "../components/ui/Spinner";
import { Badge } from "../components/ui/Badge";
import { Accordion, type AccordionItem } from "../components/ui/Accordion";
import { PageSectionHeader } from "../components/ui/PageSectionHeader";
import { QuickTaskModal } from "../components/work-items/QuickTaskModal";
import { WorkItemFormModal } from "../components/work-items/WorkItemFormModal";
import { getWorkItemApi, type WorkItem } from "../api/workItems";
import { AccLaneTaskCard } from "../components/workload/AccLaneTaskCard";
import { formatDurationHuman } from "../utils/duration";
import { SegmentedSwitch } from "../components/ui/SegmentedSwitch";
import { subscribeRealtime } from "../features/realtime/realtimeBus";
import { getRecapTemplateApi } from "../api/dailyRecap";
import {
  defaultRecapTemplate,
  renderRecapFromTemplate,
  type RecapTemplate,
} from "../features/daily-recap/recapTemplate";
import { WhatsAppPreview } from "../features/daily-recap/WhatsAppPreview";
import { useTheme } from "../context/ThemeContext";
import { getCompanyLogoUrl } from "../utils/companyLogo";
import "./workload-page.css";
import "./daily-tasks-page.css";

type ViewMode = "list" | "admin" | "self";
type ListGroupBy = "operator" | "client" | "none";
type GroupSort = "count" | "name";
type DeadlineDir = "asc" | "desc";

function cmpTaskTitle(a: any, b: any): number {
  return String(a?.title || "").localeCompare(String(b?.title || ""), "it");
}

// Ordina per scadenza (le task senza scadenza sempre in fondo). `getTask` estrae
// l'oggetto task dall'elemento (che può essere la task stessa o { task, ... }).
function sortByDeadline<T>(items: T[], getTask: (x: T) => any, dir: DeadlineDir): T[] {
  return [...items].sort((x, y) => {
    const a = getTask(x);
    const b = getTask(y);
    const da = a?.deadline_date;
    const db = b?.deadline_date;
    if (da && db) {
      if (da === db) return cmpTaskTitle(a, b);
      return dir === "asc" ? (da < db ? -1 : 1) : da < db ? 1 : -1;
    }
    if (da) return -1;
    if (db) return 1;
    return cmpTaskTitle(a, b);
  });
}

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

// ── Recap giornaliero (testo copia-incolla, stile wrap-up) ──────────────────────
function fmtRecapHours(value: number | null | undefined): string {
  const v = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return v % 1 === 0 ? String(v) : v.toFixed(1);
}

// Il testo del recap è generato dal TEMPLATE aziendale (personalizzabile in
// Impostazioni azienda → Recap); senza personalizzazione si usa il default di
// serie. Vedi src/features/daily-recap/recapTemplate.ts.

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

// Sezione "marcata" del prototipo: badge numerato, icona magenta, titolo maiuscolo,
// sottotitolo e azioni nell'header; corpo con padding uniforme.
function AgSection({
  n,
  icon,
  title,
  sub,
  actions,
  children,
}: {
  n?: string;
  icon: IconName;
  title: string;
  sub?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="ag-sec">
      <header className="ag-sec-h">
        {n && <span className="ag-sec-n">{n}</span>}
        <span className="ag-sec-ic">
          <Icon name={icon} className="w-4 h-4" />
        </span>
        <span className="ag-sec-tt">
          <b>{title}</b>
          {sub && <span>{sub}</span>}
        </span>
        {actions && <span className="ag-sec-act">{actions}</span>}
      </header>
      <div className="ag-sec-b">{children}</div>
    </section>
  );
}

function AgKpi({ label, value, tone }: { label: string; value: string; tone?: "mint" | "warn" | "over" }) {
  return (
    <div className="ag-kpi">
      <span className="ag-kpi-l">{label}</span>
      <b className={`ag-kpi-v${tone ? ` ${tone}` : ""}`}>{value}</b>
    </div>
  );
}

function loadTone(loadPercent: number): "mint" | "warn" | "over" {
  if (loadPercent >= 100) return "over";
  if (loadPercent >= 80) return "warn";
  return "mint";
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
  const { user, permissions, myCompanies } = useAuth();
  const { theme } = useTheme();
  const isAdmin = !!permissions?.is_admin;
  // Visibilità team: admin e Project Manager (scoped alla propria azienda dal backend).
  const canSeeTeam = isAdmin || !!permissions?.is_project_manager;
  const { selectedCompanyId } = useSelectedCompanyId(user?.company_id ?? null);
  const companyId = selectedCompanyId ?? user?.company_id ?? null;
  const toast = useToast();

  // Admin e PM aprono sull'elenco esteso di tutte le lavorazioni del giorno.
  const [viewMode, setViewMode] = useState<ViewMode>(canSeeTeam ? "list" : "self");
  const [listGroupBy, setListGroupBy] = useState<ListGroupBy>("operator");
  // Ordinamento dei GRUPPI (per operatore/cliente): numero di task o alfabetico.
  const [groupSort, setGroupSort] = useState<GroupSort>("count");
  // Ordinamento delle TASK per scadenza (crescente/decrescente): vale in TUTTE le
  // modalità e riordina le task dentro ogni operatore/cliente e nell'elenco unico.
  const [deadlineDir, setDeadlineDir] = useState<DeadlineDir>("asc");
  const [targetDate, setTargetDate] = useState(getTodayDate());

  const [selfData, setSelfData] = useState<any>(null);
  const [adminData, setAdminData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quickTaskModalOpen, setQuickTaskModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<WorkItem | null>(null);
  const [workItemModalOpen, setWorkItemModalOpen] = useState(false);

  // Bozza del recap modificabile prima della condivisione; si azzera al cambio
  // giorno. NON si azzera sui refresh realtime: una modifica manuale in corso
  // non deve sparire perché è arrivato un aggiornamento dati.
  const [recapDraft, setRecapDraft] = useState<string | null>(null);
  // false = anteprima formattata stile WhatsApp; true = textarea per ritocchi.
  const [recapEditing, setRecapEditing] = useState(false);
  useEffect(() => {
    setRecapDraft(null);
    setRecapEditing(false);
  }, [targetDate]);

  // Logo dell'azienda selezionata: immagine del "gruppo" nella chat finta del recap.
  const companyLogoUrl = useMemo(() => {
    const company = myCompanies.find((c) => c.id === companyId);
    return company ? getCompanyLogoUrl(company, theme) : null;
  }, [myCompanies, companyId, theme]);

  // Template aziendale del recap (null = default di serie).
  const [recapTemplate, setRecapTemplate] = useState<RecapTemplate | null>(null);
  useEffect(() => {
    if (companyId == null) return;
    getRecapTemplateApi(companyId)
      .then(setRecapTemplate)
      .catch(() => setRecapTemplate(null));
  }, [companyId]);

  const [expandedUsers, setExpandedUsers] = useState<Record<number, boolean>>({});
  // Apertura dei gruppi della vista elenco (per operatore / per cliente): aperti di
  // default, si memorizza solo la chiusura esplicita.
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const isGroupOpen = (id: string | number) => !collapsedGroups[String(id)];
  const toggleGroup = (id: string | number) =>
    setCollapsedGroups((cur) => ({ ...cur, [String(id)]: !cur[String(id)] }));

  const openTask = async (workItemId: number) => {
    if (companyId == null) {
      toast.error("Seleziona una company");
      return;
    }
    try {
      const item = await getWorkItemApi(workItemId);
      setEditingItem(item);
      setWorkItemModalOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossibile aprire la lavorazione");
    }
  };

  const loadData = async (opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;
    if (!silent) setLoading(true);
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
      // In un refresh silenzioso (realtime) un errore transitorio non deve
      // disturbare: la vista resta sull'ultimo dato buono.
      if (!silent) {
        const message = err instanceof Error ? err.message : "Errore caricamento attività";
        setError(message);
        toast.error(message);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [viewMode, targetDate]);

  // Realtime: lo stream SSE (canale azienda work_item_changed + notifiche personali,
  // instradato sul bus) ricarica in silenzio la vista attiva — vale per operatore,
  // PM e admin su tutte e tre le viste (Elenco/Team/Mie task).
  const loadDataRef = useRef(loadData);
  loadDataRef.current = loadData;
  useEffect(
    () =>
      subscribeRealtime(() => {
        void loadDataRef.current({ silent: true });
      }),
    []
  );

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
      <div className="space-y-[18px]">
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
        <div className="ag-kpis">
          <AgKpi label="Task totali" value={String(tasks_total)} />
          <AgKpi label="Completate" value={String(tasks_completed)} tone="mint" />
          <AgKpi label="Completamento" value={`${completion_rate_percent.toFixed(0)}%`} />
          <AgKpi label="Carico orario" value={`${load_percent.toFixed(0)}%`} tone={loadTone(load_percent)} />
        </div>

        {/* Prossima task */}
        <AgSection n="1" icon="target" title="Prossima task" sub="La prima in coda per oggi">
          {next_task ? (
            <div className="ag-next">
              <div className="ag-next-t">
                {next_task.title}
                {Boolean(next_task.is_PED ?? next_task.is_ped) && (
                  <span className="ml-2 inline-flex align-middle rounded-pill border border-info/30 bg-info/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-info">
                    PED
                  </span>
                )}
              </div>
              <div className="ag-next-m">
                {next_task.client_name || "Senza cliente"} · {next_task.status}
              </div>
              <div className="ag-next-h">
                {[
                  next_task.start_time ? `Inizio: ${next_task.start_time}` : null,
                  next_task.estimated_hours ? `Stimate: ${next_task.estimated_hours}h` : null,
                  typeof next_task.effective_load_hours === "number"
                    ? `Effettive: ${next_task.effective_load_hours}h`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-line dark:border-line-dark bg-cream dark:bg-ink-2 p-4 text-center text-sm text-muted dark:text-muted-dark">
              Nessuna prossima task.
            </div>
          )}
        </AgSection>

        {/* Recap giornaliero */}
        {(() => {
          const recapText =
            recapDraft ?? renderRecapFromTemplate(recapTemplate ?? defaultRecapTemplate(), selfData, targetDate);
          const copyRecap = async () => {
            try {
              await navigator.clipboard.writeText(recapText);
              toast.success("Recap copiato negli appunti");
            } catch {
              toast.error("Copia non riuscita");
            }
          };
          const emailRecap = () => {
            const subject = `Recap giornaliero ${dateFromIso(targetDate).toLocaleDateString("it-IT")}`;
            window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(recapText)}`);
          };
          return (
            <AgSection
              n="2"
              icon="annotation"
              title="Recap giornaliero"
              sub="Pronto da condividere su WhatsApp o via email"
              actions={
                <>
                  <button type="button" className="ag-abtn" onClick={() => setRecapEditing((v) => !v)}>
                    <Icon name={recapEditing ? "eye" : "pencil"} className="w-3.5 h-3.5" />
                    {recapEditing ? "Anteprima" : "Modifica"}
                  </button>
                  <button type="button" className="ag-abtn" onClick={() => void copyRecap()}>
                    <Icon name="copy" className="w-3.5 h-3.5" /> Copia
                  </button>
                  <button type="button" className="ag-abtn" onClick={emailRecap}>
                    <Icon name="mail" className="w-3.5 h-3.5" /> Email
                  </button>
                </>
              }
            >
              {recapEditing ? (
                <textarea
                  className="ag-recap"
                  value={recapText}
                  onChange={(event) => setRecapDraft(event.target.value)}
                  rows={Math.min(16, recapText.split("\n").length + 1)}
                />
              ) : (
                <WhatsAppPreview text={recapText} avatarUrl={companyLogoUrl} />
              )}
              <div className="ag-share">
                <button
                  type="button"
                  className="ag-wa"
                  onClick={() => {
                    // Il testo NON passa più nell'URL: il ponte wa.me → app desktop
                    // corrompe le emoji (→ "�"). Copiamo il recap negli appunti e
                    // apriamo l'app sul selettore chat: si incolla e le emoji sono
                    // perfette (il copia-incolla è l'unico canale affidabile).
                    void navigator.clipboard
                      ?.writeText(recapText)
                      .then(() => toast.success("Recap copiato: scegli la chat e incolla (Ctrl+V)."))
                      .catch(() => toast.error("Copia non riuscita: usa il pulsante Copia."));
                    window.location.href = "whatsapp://send";
                  }}
                >
                  <span className="ag-wa-ic">
                    <Icon name="annotation" className="w-4 h-4" />
                  </span>
                  Condividi su WhatsApp
                </button>
                <span className="ag-share-hint">
                  Copia il recap e apre WhatsApp: scegli la chat e incolla (Ctrl+V) — così emoji e
                  formattazione restano perfette. Se l'app non si apre, apri WhatsApp e incolla.
                </span>
              </div>
            </AgSection>
          );
        })()}

        {/* Task List */}
        <AgSection n="3" icon="list" title={`Task del giorno (${tasks.length})`} sub="Le tue lavorazioni di oggi">
          {tasks.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted dark:text-muted-dark">
              Nessuna task per oggi.
            </div>
          ) : (
            <div className="wl-acc-tasks">
              {tasks.map((task: any) => {
                // Workload endpoints can expose PED with either is_ped or is_PED.
                const effective = typeof task.effective_load_hours === "number" ? task.effective_load_hours : 0;
                const hoursLabel = `${formatDurationHuman(effective)}${task.estimated_hours != null ? ` / ${formatDurationHuman(task.estimated_hours)}` : ""}`;
                return (
                  <AccLaneTaskCard
                    key={task.work_item_id}
                    title={task.title}
                    hoursLabel={hoursLabel}
                    timeLabel={task.start_time || null}
                    clientName={task.client_name}
                    status={`${Math.round(task.progress_percent ?? 0)}%`}
                    areaColor={task.work_areas?.[0]?.color ?? null}
                    isPed={Boolean(task.is_PED ?? task.is_ped)}
                    isMaintenance={task.task_type === "website_maintenance"}
                    priority={Boolean(task.is_priority)}
                    completed={Boolean(task.is_completed)}
                    leftBehind={Boolean(task.is_left_behind)}
                    overdue={Boolean(task.schedule_state?.is_overdue ?? task.is_overdue)}
                    overdueDays={task.schedule_state?.overdue_days ?? task.overdue_days}
                    reworkCount={task.rework_count}
                    onClick={() => void openTask(task.work_item_id)}
                  />
                );
              })}
            </div>
          )}
        </AgSection>
      </div>
    );
  };

  // Riga task "estesa" riusata nell'elenco. `metaLabel` mostra il cliente (per
  // operatore) o gli operatori (per cliente); `assignees` mostra gli avatar degli
  // operatori dentro la card (usato nell'elenco unico, non raggruppato).
  const renderExtendedTaskRow = (
    task: any,
    metaLabel: string | null,
    assignees?: Array<{ name: string; avatarUrl?: string | null }>,
  ) => {
    const effective = typeof task.effective_load_hours === "number" ? task.effective_load_hours : 0;
    const hoursLabel = `${effective}h${task.estimated_hours != null ? ` / ${task.estimated_hours}h` : ""}`;
    return (
      <AccLaneTaskCard
        key={task.work_item_id}
        title={task.title}
        hoursLabel={hoursLabel}
        timeLabel={task.start_time || null}
        clientName={metaLabel}
        status={`${Math.round(task.progress_percent ?? 0)}%`}
        areaColor={task.work_areas?.[0]?.color ?? null}
        isPed={Boolean(task.is_PED ?? task.is_ped)}
        isMaintenance={task.task_type === "website_maintenance"}
        priority={Boolean(task.is_priority)}
        completed={Boolean(task.is_completed)}
        leftBehind={Boolean(task.is_left_behind)}
        overdue={Boolean(task.schedule_state?.is_overdue ?? task.is_overdue)}
        overdueDays={task.schedule_state?.overdue_days ?? task.overdue_days}
        reworkCount={task.rework_count}
        assignees={assignees}
        onClick={() => void openTask(task.work_item_id)}
      />
    );
  };

  // Elenco esteso di TUTTE le lavorazioni del giorno (admin/PM), con due
  // raggruppamenti: per operatore o per cliente. Deriva dai dati del team.
  const renderListView = () => {
    if (!adminData) return null;
    const usersArr: any[] = adminData.users ?? [];

    // Lavorazioni uniche del giorno (una task con più assegnatari compare in più
    // operatori: qui la deduplico per conteggi/ore onesti).
    const dedup = new Map<number, any>();
    for (const u of usersArr) for (const t of u.tasks ?? []) if (!dedup.has(t.work_item_id)) dedup.set(t.work_item_id, t);
    const dedupedTasks = [...dedup.values()];
    const uniqueCount = dedupedTasks.length;
    const completedCount = dedupedTasks.filter((t) => Boolean(t.is_completed)).length;
    const uniqueHours = dedupedTasks.reduce((sum, t) => sum + (t.effective_load_hours ?? 0), 0);

    if (uniqueCount === 0) {
      return (
        <div className="rounded-lg border border-dashed border-line dark:border-line-dark p-6 text-center text-sm text-muted dark:text-muted-dark">
          Nessuna lavorazione per questo giorno.
        </div>
      );
    }

    const kpi = (
      <div className="ag-kpis">
        <AgKpi label="Lavorazioni" value={String(uniqueCount)} />
        <AgKpi label="Completate" value={String(completedCount)} tone="mint" />
        <AgKpi label="Operatori" value={String(usersArr.length)} />
        <AgKpi label="Ore stimate" value={`${fmtRecapHours(uniqueHours)}h`} />
      </div>
    );

    const groupToggle = (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SegmentedSwitch
          value={listGroupBy}
          onChange={setListGroupBy}
          ariaLabel="Raggruppa elenco"
          buttonClassName="wl-segmented-btn--view"
          options={[
            { value: "operator", label: <><Icon name="users" className="w-3.5 h-3.5" />Per operatore</> },
            { value: "client", label: <><Icon name="building" className="w-3.5 h-3.5" />Per cliente</> },
            { value: "none", label: <><Icon name="list" className="w-3.5 h-3.5" />Elenco unico</> },
          ]}
        />
        <div className="flex flex-wrap items-center gap-3">
          {listGroupBy !== "none" && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Gruppi</span>
              <SegmentedSwitch
                value={groupSort}
                onChange={setGroupSort}
                ariaLabel="Ordina gruppi"
                buttonClassName="wl-segmented-btn--view"
                options={[
                  {
                    value: "count",
                    title: `${listGroupBy === "operator" ? "Operatori" : "Clienti"} con più task in alto`,
                    label: <><Icon name="arrows-v" className="w-3.5 h-3.5" />Più task</>,
                  },
                  { value: "name", title: "Ordine alfabetico", label: <><Icon name="list" className="w-3.5 h-3.5" />A–Z</> },
                ]}
              />
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Scadenza</span>
            <SegmentedSwitch
              value={deadlineDir}
              onChange={setDeadlineDir}
              ariaLabel="Ordina per scadenza"
              buttonClassName="wl-segmented-btn--view"
              options={[
                { value: "asc", title: "Crescente: prima le scadenze più vicine", label: <><Icon name="arrows-v" className="w-3.5 h-3.5" />Crescente</> },
                { value: "desc", title: "Decrescente: prima le scadenze più lontane", label: <><Icon name="arrows-v" className="w-3.5 h-3.5" />Decrescente</> },
              ]}
            />
          </div>
        </div>
      </div>
    );

    let body: ReactNode;
    let sectionIcon: IconName = "users";
    let sectionTitle = "Lavorazioni per operatore";
    let sectionSub = `${usersArr.length} operatori · ${formatDayLabel(targetDate)}`;

    const opName = (op: any) => (op.full_name || op.username || "").toString();

    if (listGroupBy === "operator") {
      const sortedUsers = [...usersArr].sort((a, b) =>
        groupSort === "count"
          ? (b.tasks?.length ?? 0) - (a.tasks?.length ?? 0) || opName(a).localeCompare(opName(b), "it")
          : opName(a).localeCompare(opName(b), "it"),
      );
      const opItems: AccordionItem[] = sortedUsers.map((op: any) => ({ id: `op-${op.user_id}`, data: op }));
      body = (
        <Accordion
          items={opItems}
          isOpen={Object.fromEntries(opItems.map((i) => [i.id, isGroupOpen(i.id)]))}
          onToggle={toggleGroup}
          className="space-y-3"
          itemClassName="overflow-hidden rounded-xl border border-line dark:border-[#2a2a2e] bg-paper dark:bg-[#131316]"
          headerClassName="flex items-center gap-3 px-3 py-2.5 hover:bg-cream dark:hover:bg-[#1c1c20] transition-colors"
          contentClassName="border-t border-line dark:border-[#2a2a2e] p-3"
          chevronClassName="w-4 h-4 flex-shrink-0 text-muted dark:text-muted-dark transition-transform"
          renderHeader={(op: any) => {
            // Ore STIMATE delle task = dimensione reale del lavoro. Diverso dal peso sul
            // carico, che per le task in revisione vale 0 sull'operatore.
            const estHours = (op.tasks ?? []).reduce((s: number, t: any) => s + (t.estimated_hours ?? 0), 0);
            return (
              <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  {op.avatar_url ? (
                    <img src={op.avatar_url} alt={op.full_name || op.username} className="h-8 w-8 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-paper dark:bg-paper dark:text-ink text-[11px] font-bold">
                      {(op.full_name || op.username).split(" ").slice(0, 2).map((w: string) => w[0]?.toUpperCase() || "").join("")}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-ink dark:text-paper">{op.full_name || op.username}</div>
                    <div className="text-[11px] text-muted dark:text-muted-dark">
                      {op.tasks_completed}/{op.tasks_total} completate · {op.completion_rate_percent.toFixed(0)}%
                    </div>
                  </div>
                </div>
                <div className="flex flex-none items-center gap-2 text-[11px] text-muted dark:text-muted-dark">
                  <span>{(op.tasks ?? []).length} task</span>
                  <span>·</span>
                  <span title="Somma delle ore stimate delle task">{fmtRecapHours(estHours)}h stimate</span>
                  <span
                    className={`wl-acc-load ${loadClass(op.load_percent)}`}
                    title="Carico giornaliero: ore pianificate oggi ÷ capacità del giorno. Le task in revisione non pesano sull'operatore (pesano 0,25 sul revisore)."
                  >
                    Carico {op.load_percent.toFixed(0)}%
                  </span>
                </div>
              </div>
            );
          }}
          renderContent={(op: any) =>
            (op.tasks ?? []).length === 0 ? (
              <div className="wl-acc-empty">Nessuna task</div>
            ) : (
              <div className="wl-acc-tasks">
                {sortByDeadline(op.tasks ?? [], (t: any) => t, deadlineDir).map((t: any) =>
                  renderExtendedTaskRow(t, t.client_name),
                )}
              </div>
            )
          }
        />
      );
    } else if (listGroupBy === "client") {
      // Raggruppa per cliente, deduplicando le task e raccogliendo gli operatori.
      const byClient = new Map<string, { clientName: string; tasks: Map<number, { task: any; operators: Set<string> }> }>();
      for (const op of usersArr) {
        const opName = op.full_name || op.username;
        for (const t of op.tasks ?? []) {
          const key = t.client_id != null ? `c${t.client_id}` : `n:${t.client_name ?? ""}`;
          let g = byClient.get(key);
          if (!g) { g = { clientName: t.client_name || "Senza cliente", tasks: new Map() }; byClient.set(key, g); }
          let entry = g.tasks.get(t.work_item_id);
          if (!entry) { entry = { task: t, operators: new Set() }; g.tasks.set(t.work_item_id, entry); }
          entry.operators.add(opName);
        }
      }
      const clientGroups = [...byClient.values()]
        .map((g) => ({ clientName: g.clientName, tasks: [...g.tasks.values()] }))
        .sort((a, b) =>
          groupSort === "count"
            ? b.tasks.length - a.tasks.length || a.clientName.localeCompare(b.clientName, "it")
            : a.clientName.localeCompare(b.clientName, "it"),
        );

      sectionIcon = "building";
      sectionTitle = "Lavorazioni per cliente";
      sectionSub = `${clientGroups.length} clienti · ${formatDayLabel(targetDate)}`;
      const clientItems: AccordionItem[] = clientGroups.map((g) => ({ id: `cl-${g.clientName}`, data: g }));
      body = (
        <Accordion
          items={clientItems}
          isOpen={Object.fromEntries(clientItems.map((i) => [i.id, isGroupOpen(i.id)]))}
          onToggle={toggleGroup}
          className="space-y-3"
          itemClassName="overflow-hidden rounded-xl border border-line dark:border-[#2a2a2e] bg-paper dark:bg-[#131316]"
          headerClassName="flex items-center gap-3 px-3 py-2.5 hover:bg-cream dark:hover:bg-[#1c1c20] transition-colors"
          contentClassName="border-t border-line dark:border-[#2a2a2e] p-3"
          chevronClassName="w-4 h-4 flex-shrink-0 text-muted dark:text-muted-dark transition-transform"
          renderHeader={(g: any) => {
            const gHours = g.tasks.reduce((s: number, e: any) => s + (e.task.estimated_hours ?? 0), 0);
            return (
              <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                <div className="inline-flex min-w-0 items-center gap-2 text-sm font-bold text-ink dark:text-paper">
                  <Icon name="building" className="h-4 w-4 flex-shrink-0 text-muted dark:text-muted-dark" />
                  <span className="truncate">{g.clientName}</span>
                </div>
                <div className="flex flex-none items-center gap-2 text-[11px] text-muted dark:text-muted-dark">
                  <span className="inline-flex items-center gap-1"><Icon name="list" className="h-3 w-3" /> {g.tasks.length} task</span>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1" title="Somma delle ore stimate delle task">
                    <Icon name="activity" className="h-3 w-3" /> {fmtRecapHours(gHours)}h stimate
                  </span>
                </div>
              </div>
            );
          }}
          renderContent={(g: any) => (
            <div className="wl-acc-tasks">
              {sortByDeadline(g.tasks, (e: any) => e.task, deadlineDir).map(({ task, operators }: any) =>
                renderExtendedTaskRow(task, [...operators].join(", ")),
              )}
            </div>
          )}
        />
      );
    } else {
      // Elenco UNICO (nessun raggruppamento): task deduplicata + avatar operatori
      // nella card. Ordinabile per scadenza o per titolo.
      const flat = new Map<number, { task: any; operators: Array<{ id: number; name: string; avatar_url?: string | null }> }>();
      for (const op of usersArr) {
        const info = { id: op.user_id, name: op.full_name || op.username, avatar_url: op.avatar_url };
        for (const t of op.tasks ?? []) {
          let e = flat.get(t.work_item_id);
          if (!e) { e = { task: t, operators: [] }; flat.set(t.work_item_id, e); }
          if (!e.operators.some((o) => o.id === info.id)) e.operators.push(info);
        }
      }
      const list = sortByDeadline([...flat.values()], (e) => e.task, deadlineDir);
      sectionIcon = "list";
      sectionTitle = "Elenco unico";
      sectionSub = `${uniqueCount} lavorazioni · ${formatDayLabel(targetDate)}`;
      body = (
        <div className="wl-acc-tasks">
          {list.map(({ task, operators }) =>
            renderExtendedTaskRow(
              task,
              task.client_name,
              operators.map((o) => ({ name: o.name, avatarUrl: o.avatar_url })),
            ),
          )}
        </div>
      );
    }

    return (
      <div>
        {kpi}
        {groupToggle}
        <AgSection icon={sectionIcon} title={sectionTitle} sub={sectionSub}>
          {body}
        </AgSection>
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

    // KPI del giorno (lavorazioni deduplicate: una task multi-assegnatario conta una volta).
    const dedup = new Map<number, any>();
    for (const u of users) for (const t of u.tasks ?? []) if (!dedup.has(t.work_item_id)) dedup.set(t.work_item_id, t);
    const dedupedTasks = [...dedup.values()];

    const accordionItems: AccordionItem[] = users.map((operatore: any) => ({
      id: operatore.user_id,
      data: operatore,
    }));

    return (
      <div>
        <div className="ag-kpis">
          <AgKpi label="Lavorazioni" value={String(dedupedTasks.length)} />
          <AgKpi
            label="Completate"
            value={String(dedupedTasks.filter((t) => Boolean(t.is_completed)).length)}
            tone="mint"
          />
          <AgKpi label="Operatori" value={String(users.length)} />
          <AgKpi
            label="Ore stimate"
            value={`${fmtRecapHours(dedupedTasks.reduce((s, t) => s + (t.effective_load_hours ?? 0), 0))}h`}
          />
        </div>
        <AgSection icon="users" title="Carico del team" sub={`${users.length} operatori · ${formatDayLabel(targetDate)}`}>
      <Accordion
        items={accordionItems}
        isOpen={expandedUsers}
        onToggle={(id) => setExpandedUsers((cur) => ({ ...cur, [id]: !cur[id as keyof typeof cur] }))}
        className="wl-acc-list"
        itemClassName="wl-acc-lane"
        headerClassName="wl-acc-lane__row"
        chevronClassName="wl-acc-lane__toggle w-4 h-4 transition-transform"
        contentClassName=""
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
            <div className="wl-acc-empty">Nessuna task</div>
          ) : (
            <>
              <div className="wl-acc-day-label">
                Task del giorno {dateFromIso(targetDate).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" })}
              </div>
              <div className="wl-acc-tasks">
                {operatore.tasks.map((task: any) => {
                  // Workload endpoints can expose PED with either is_ped or is_PED.
                  const effective = typeof task.effective_load_hours === "number" ? task.effective_load_hours : 0;
                  const hoursLabel = `${formatDurationHuman(effective)}${task.estimated_hours != null ? ` / ${formatDurationHuman(task.estimated_hours)}` : ""}`;
                  return (
                    <AccLaneTaskCard
                      key={task.work_item_id}
                      title={task.title}
                      hoursLabel={hoursLabel}
                      timeLabel={task.start_time || null}
                      clientName={task.client_name}
                      status={`${Math.round(task.progress_percent ?? 0)}%`}
                      areaColor={task.work_areas?.[0]?.color ?? null}
                      isPed={Boolean(task.is_PED ?? task.is_ped)}
                      isMaintenance={task.task_type === "website_maintenance"}
                      priority={Boolean(task.is_priority)}
                      completed={Boolean(task.is_completed)}
                      leftBehind={Boolean(task.is_left_behind)}
                      overdue={Boolean(task.schedule_state?.is_overdue ?? task.is_overdue)}
                      overdueDays={task.schedule_state?.overdue_days ?? task.overdue_days}
                      reworkCount={task.rework_count}
                      onClick={() => void openTask(task.work_item_id)}
                    />
                  );
                })}
              </div>
            </>
          )
        }
      />
        </AgSection>
      </div>
    );
  };

  return (
    <div className="px-6 py-8 pb-20 mx-auto w-full animate-fadeIn">
      <PageSectionHeader
        icon={<Icon name="activity" className="w-6 h-6" />}
        title="Attività del giorno"
      />

      <div className="dt-toolbar-shell mb-5">
        <div className="dt-toolbar-row-single">
          <div className="dt-toolbar-left gap-2.5">
            <div className="ag-tgroup">
              <button
                type="button"
                onClick={() => setTargetDate((current) => shiftIsoByDays(current, -1))}
                className="ag-tbtn ag-tbtn--nav"
                aria-label="Giorno precedente"
              >
                <Icon name="chevron-right" className="rotate-180" />
              </button>

              <span className="ag-tgroup-lbl">{formatDayLabel(targetDate)}</span>

              <button
                type="button"
                onClick={() => setTargetDate((current) => shiftIsoByDays(current, 1))}
                className="ag-tbtn ag-tbtn--nav"
                aria-label="Giorno successivo"
              >
                <Icon name="chevron-right" />
              </button>
            </div>

            <button type="button" className="ag-tbtn" onClick={() => setTargetDate(getTodayDate())}>
              <Icon name="calendar" /> Oggi
            </button>

            <button
              type="button"
              className="ag-tbtn ag-tbtn--sq"
              onClick={() => void loadData()}
              title="Aggiorna"
              aria-label="Aggiorna"
            >
              <Icon name="refresh-cw" />
            </button>

            <button
              type="button"
              className="ag-tbtn ag-tbtn--accent"
              onClick={() => setQuickTaskModalOpen(true)}
              disabled={companyId == null}
            >
              <Icon name="plus" /> Task rapida
            </button>
          </div>

          {canSeeTeam && (
            <div className="dt-toolbar-right">
              <SegmentedSwitch
                value={viewMode}
                onChange={setViewMode}
                ariaLabel="Vista attività del giorno"
                buttonClassName="wl-segmented-btn--view"
                options={[
                  { value: "list", label: <><Icon name="list" className="w-3.5 h-3.5" />Elenco</> },
                  { value: "admin", label: <><Icon name="users" className="w-3.5 h-3.5" />Team</> },
                  { value: "self", label: <><Icon name="user-circle" className="w-3.5 h-3.5" />Mie task</> },
                ]}
              />
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {viewMode !== "list" && renderLoadLegend()}

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : viewMode === "self" ? (
        renderSelfView()
      ) : viewMode === "list" ? (
        renderListView()
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

      <WorkItemFormModal
        open={workItemModalOpen}
        onClose={() => {
          setWorkItemModalOpen(false);
          setEditingItem(null);
        }}
        editingItem={editingItem}
        companyId={companyId ?? 0}
        onSaved={() => {
          setWorkItemModalOpen(false);
          setEditingItem(null);
          void loadData();
        }}
      />
    </div>
  );
}
