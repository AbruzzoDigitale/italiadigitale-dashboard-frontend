import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageSectionHeader } from "../components/ui/PageSectionHeader";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { Input } from "../components/ui/Input";
import { Spinner } from "../components/ui/Spinner";
import { useAuth } from "../hooks/useAuth";
import { useSelectedCompanyId } from "../hooks/useSelectedCompanyId";
import { useToast } from "../context/ToastContext";
import { listClientOptionsApi } from "../api/clients";
import { getUsersApi } from "../api/users";
import {
  approveAllTripsApi,
  approveTripApi,
  archiveMonthApi,
  connectSheetApi,
  deleteTripApi,
  getExpenseReportApi,
  getExpenseSettingsApi,
  getExpenseSettingsBasicsApi,
  listTripsApi,
  listVehiclesApi,
  openExpenseReportPdf,
  rejectTripApi,
  syncSheetApi,
  updateExpenseReportApi,
  type ExpenseReport,
  type ExpenseSettings,
  type Trip,
  type TripList,
  type Vehicle,
} from "../api/expenses";
import { TripTable } from "../features/rimborsi/TripTable";
import { TripCards } from "../features/rimborsi/TripCards";
import { TripModal } from "../features/rimborsi/TripModal";
import { StaffQueue } from "../features/rimborsi/StaffQueue";
import { SheetCard } from "../features/rimborsi/SheetCard";
import { SettingsModal } from "../features/rimborsi/SettingsModal";
import { euro, monthLabel, num, sheetTab } from "../features/rimborsi/format";

// Rimborsi trasferte: indennità chilometriche e spese, con approvazione delle
// trasferte dei collaboratori e rendicontazione sul foglio del commercialista.
//
// Due sezioni: "Le mie trasferte" (tutti) e "Collaboratori" (solo admin, è chi
// autorizza la spesa). L'operatore non vede mai la seconda.

const EMPTY_LIST: TripList = {
  items: [],
  totals: {
    count: 0,
    km: 0,
    km_allowance: 0,
    meal: 0,
    lodging: 0,
    parking: 0,
    tolls: 0,
    daily_allowance: 0,
    expenses: 0,
    total: 0,
  },
  pending_sync: 0,
  pending_approval: 0,
};

export default function RimborsiPage() {
  const toast = useToast();
  const { user, activeCompanyId } = useAuth();
  const { selectedCompanyId } = useSelectedCompanyId(activeCompanyId);
  const companyId = selectedCompanyId ?? activeCompanyId;
  const canApprove = Boolean(user?.is_admin);

  const [searchParams, setSearchParams] = useSearchParams();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [section, setSection] = useState<"mine" | "queue">("mine");

  const [list, setList] = useState<TripList>(EMPTY_LIST);
  const [queue, setQueue] = useState<TripList>(EMPTY_LIST);
  const [settings, setSettings] = useState<ExpenseSettings | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [clients, setClients] = useState<{ value: string; label: string }[]>([]);
  const [people, setPeople] = useState<{ value: string; label: string }[]>([]);
  const [report, setReport] = useState<ExpenseReport | null>(null);

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [editing, setEditing] = useState<Trip | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // ── Caricamento ────────────────────────────────────────────────────────────
  const loadTrips = useCallback(async () => {
    const mine = await listTripsApi({ companyId, year, month, scope: "mine" });
    setList(mine);
    if (canApprove) {
      setQueue(await listTripsApi({ companyId, scope: "queue" }));
    }
  }, [companyId, year, month, canApprove]);

  const loadVehicles = useCallback(async () => {
    setVehicles(await listVehiclesApi(companyId));
  }, [companyId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [mine, vehicleList] = await Promise.all([
          listTripsApi({ companyId, year, month, scope: "mine" }),
          listVehiclesApi(companyId),
        ]);
        if (cancelled) return;
        setList(mine);
        setVehicles(vehicleList);

        if (canApprove) {
          const [queueList, config] = await Promise.all([
            listTripsApi({ companyId, scope: "queue" }),
            getExpenseSettingsApi(companyId),
          ]);
          if (cancelled) return;
          setQueue(queueList);
          setSettings(config);
        } else {
          // L'operatore non vede foglio, Drive e account Google, ma gli servono
          // i valori che guidano il form: sede, indennità, prove richieste.
          const basics = await getExpenseSettingsBasicsApi(companyId).catch(() => null);
          if (cancelled) return;
          setSettings(basics);
        }

        const [clientOptions, users] = await Promise.all([
          listClientOptionsApi(companyId).catch(() => []),
          canApprove ? getUsersApi(companyId ?? undefined).catch(() => []) : Promise.resolve([]),
        ]);
        if (cancelled) return;
        setClients(clientOptions.map((c) => ({ value: String(c.id), label: c.name })));
        setPeople(users.map((u) => ({ value: String(u.id), label: u.full_name || u.username })));
      } catch (error) {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Caricamento non riuscito");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, year, month, canApprove]);

  useEffect(() => {
    let cancelled = false;
    getExpenseReportApi(year, month, { companyId })
      .then((r) => {
        if (!cancelled) setReport(r);
      })
      .catch(() => {
        if (!cancelled) setReport(null);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, year, month]);

  // Deep link dalle notifiche: /rimborsi?trasferta=123 apre la scheda. La
  // trasferta si ricava in fase di render dal parametro, senza sincronizzare
  // stato dentro un effetto: il parametro È lo stato.
  const deepLinkTrip = useMemo(() => {
    const raw = searchParams.get("trasferta");
    if (!raw) return null;
    const id = Number(raw);
    return [...list.items, ...queue.items].find((t) => t.id === id) ?? null;
  }, [searchParams, list.items, queue.items]);

  const isModalOpen = modalOpen || deepLinkTrip !== null;
  const modalTrip = modalOpen ? editing : deepLinkTrip;

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    if (searchParams.has("trasferta")) {
      const next = new URLSearchParams(searchParams);
      next.delete("trasferta");
      setSearchParams(next, { replace: true });
    }
  };

  // ── Azioni ─────────────────────────────────────────────────────────────────
  const shiftMonth = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  };

  const openNew = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openTrip = (trip: Trip) => {
    setEditing(trip);
    setModalOpen(true);
  };

  const afterChange = async () => {
    try {
      await loadTrips();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Aggiornamento non riuscito");
    }
  };

  const removeTrip = async (trip: Trip) => {
    if (!window.confirm(`Eliminare la trasferta del ${trip.trip_date.split("-").reverse().join("/")}?`)) return;
    try {
      await deleteTripApi(trip.id);
      toast.success("Trasferta eliminata");
      await afterChange();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Eliminazione non riuscita");
    }
  };

  const approve = async (trip: Trip) => {
    try {
      await approveTripApi(trip.id);
      toast.success("Trasferta approvata");
      await afterChange();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Approvazione non riuscita");
    }
  };

  const reject = async (trip: Trip, reason: string) => {
    try {
      await rejectTripApi(trip.id, reason);
      toast.success("Trasferta respinta · notifica inviata al collaboratore");
      await afterChange();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Operazione non riuscita");
    }
  };

  const approveAll = async () => {
    const pending = queue.items.filter((t) => t.status === "da_approvare");
    if (!pending.length) return;
    if (!window.confirm(`Approvare ${pending.length} trasferte?`)) return;
    try {
      const result = await approveAllTripsApi({ ids: pending.map((t) => t.id) }, companyId);
      toast.success(`${result.approved} trasferte approvate`);
      await afterChange();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Approvazione non riuscita");
    }
  };

  const sync = async (force = false) => {
    setSyncing(true);
    try {
      const result = await syncSheetApi({ companyId, force });
      toast.success(result.message);
      if (settings) setSettings({ ...settings, last_sync_at: result.last_sync_at });
      await afterChange();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sincronizzazione non riuscita");
    } finally {
      setSyncing(false);
    }
  };

  const archive = async () => {
    setArchiving(true);
    try {
      const result = await archiveMonthApi(year, month, companyId);
      toast.success(result.message);
      const refreshed = await getExpenseReportApi(year, month, { companyId });
      setReport(refreshed);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Archiviazione non riuscita");
    } finally {
      setArchiving(false);
    }
  };

  const createSheet = async () => {
    try {
      const updated = await connectSheetApi(companyId);
      setSettings(updated);
      toast.success("Foglio creato e condiviso con lo studio");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Foglio non creato");
    }
  };

  const downloadPdf = async () => {
    try {
      await openExpenseReportPdf(year, month, { companyId });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "PDF non generato");
    }
  };

  const saveOdometer = async (field: "odometer_start" | "odometer_end", value: string) => {
    const parsed = value.trim() === "" ? null : Number(value);
    try {
      setReport(await updateExpenseReportApi(year, month, { [field]: parsed }, { companyId }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Contachilometri non salvato");
    }
  };

  const queuePeople = useMemo(
    () =>
      Array.from(new Map(queue.items.map((t) => [t.user_id, t])).values()).map((t) => ({
        id: t.user_id,
        name: t.user_name ?? "",
        initials: t.user_initials ?? "?",
      })),
    [queue.items]
  );

  const totals = list.totals;
  const label = monthLabel(year, month);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    // Il <main> del layout non mette padding: ogni pagina porta il suo, come
    // Clienti, Utenti e Siti web (px-6 py-8).
    <div className="flex w-full flex-col gap-5 px-6 py-8 pb-20 animate-fadeIn">
      <PageSectionHeader
        icon={<Icon name="map-pin" className="w-6 h-6" />}
        title="Rimborsi trasferte"
        lead="Indennità chilometriche e spese di trasferta. Ogni riga approvata confluisce nel foglio condiviso con il commercialista."
        actions={
          <div className="flex flex-wrap gap-2">
            {canApprove && settings && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSettingsOpen(true)}
                leftIcon={<Icon name="settings" className="h-3.5 w-3.5" />}
              >
                Impostazioni
              </Button>
            )}
            <Button variant="primary" size="sm" onClick={openNew} leftIcon={<Icon name="plus" className="h-4 w-4" />}>
              Nuova trasferta
            </Button>
          </div>
        }
      />

      {canApprove && (
        <div className="flex gap-1 rounded-md border border-line p-1 dark:border-[#2a2a2e]">
          <SectionTab active={section === "mine"} onClick={() => setSection("mine")} icon="user-circle" label="Le mie trasferte" />
          <SectionTab
            active={section === "queue"}
            onClick={() => setSection("queue")}
            icon="users"
            label="Collaboratori"
            badge={queue.items.filter((t) => t.status === "da_approvare").length}
          />
        </div>
      )}

      {section === "queue" && canApprove ? (
        <StaffQueue
          trips={queue.items}
          people={queuePeople}
          onApprove={approve}
          onReject={reject}
          onApproveAll={approveAll}
          onOpen={openTrip}
          onNew={openNew}
        />
      ) : (
        <>
          {/* Riepilogo del mese */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Summary big value={euro(totals.total)} label={`totale rimborso · ${label}`} />
            <Summary value={num(totals.km)} label="km percorsi" />
            <Summary value={euro(totals.km_allowance)} label="indennità km" />
            <Summary value={euro(totals.expenses)} label="spese documentate" />
            <Summary value={euro(totals.daily_allowance)} label="ind. trasferta" />
          </div>

          {/* Barra del periodo */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-md border border-line px-1 py-1 dark:border-[#2a2a2e]">
              <button
                type="button"
                aria-label="Mese precedente"
                onClick={() => shiftMonth(-1)}
                className="rounded-sm p-1.5 text-muted transition-colors hover:bg-cream dark:text-muted-dark dark:hover:bg-[#1c1c20]"
              >
                <Icon name="chevron-right" className="h-4 w-4 rotate-180" />
              </button>
              <span className="px-2 text-[12px] font-semibold">
                {label}
                <span className="ml-1.5 text-[10px] font-normal text-muted dark:text-muted-dark">
                  {sheetTab(year, month)}
                </span>
              </span>
              <button
                type="button"
                aria-label="Mese successivo"
                onClick={() => shiftMonth(1)}
                className="rounded-sm p-1.5 text-muted transition-colors hover:bg-cream dark:text-muted-dark dark:hover:bg-[#1c1c20]"
              >
                <Icon name="chevron-right" className="h-4 w-4" />
              </button>
            </div>

            {list.pending_sync > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-pill border border-info/25 bg-info/10 px-2.5 py-1 text-[11px] font-semibold text-info">
                {list.pending_sync} da inviare al foglio
              </span>
            )}

            <span className="flex-1" />

            <Button
              variant="ghost"
              size="sm"
              onClick={downloadPdf}
              leftIcon={<Icon name="download" className="h-3.5 w-3.5" />}
            >
              Nota spese PDF
            </Button>
            {canApprove && settings?.sheet_configured && (
              <Button
                variant={list.pending_sync > 0 ? "primary" : "secondary"}
                size="sm"
                loading={syncing}
                onClick={() => sync(list.pending_sync === 0)}
                leftIcon={<Icon name="refresh-cw" className="h-3.5 w-3.5" />}
                title={
                  list.pending_sync > 0
                    ? "Scrive sul foglio le righe approvate non ancora inviate"
                    : "Riscrive i mesi già inviati, con il layout e i dati di adesso"
                }
              >
                {list.pending_sync > 0 ? "Invia ora" : "Risincronizza"}
              </Button>
            )}
          </div>

          {/* Tabella su desktop, card sotto lg */}
          <div className="hidden lg:block">
            <TripTable trips={list.items} totals={totals} showPerson={false} onEdit={openTrip} onDelete={removeTrip} />
          </div>
          <div className="lg:hidden">
            <TripCards trips={list.items} totals={totals} showPerson={false} onEdit={openTrip} onDelete={removeTrip} />
          </div>

          {/* Intestazione della nota spese */}
          {report && (
            <div className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-paper p-6 shadow-1 dark:border-[#2a2a2e] dark:bg-[#131316]">
              <div className="min-w-0 flex-1">
                <b className="block text-[13px]">Nota spese · {label}</b>
                <p className="mt-0.5 text-[11px] text-muted dark:text-muted-dark">
                  Il contachilometri di inizio e fine periodo va in testata al PDF, come sul foglio cartaceo.
                  {report.status === "archiviata" && report.archived_at
                    ? " Nota spese già archiviata: gli importi non cambiano più."
                    : ""}
                </p>
              </div>
              <Input
                label="Km iniziali"
                type="number"
                min="0"
                className="w-32"
                defaultValue={report.odometer_start ?? ""}
                disabled={report.status === "archiviata"}
                onBlur={(e) => saveOdometer("odometer_start", e.target.value)}
              />
              <Input
                label="Km finali"
                type="number"
                min="0"
                className="w-32"
                defaultValue={report.odometer_end ?? ""}
                disabled={report.status === "archiviata"}
                onBlur={(e) => saveOdometer("odometer_end", e.target.value)}
              />
              {report.pdf_drive_link && (
                <a href={report.pdf_drive_link} target="_blank" rel="noopener">
                  <Button variant="ghost" size="sm" leftIcon={<Icon name="drive" className="h-3.5 w-3.5" />}>
                    Nota spese archiviata
                  </Button>
                </a>
              )}
            </div>
          )}

          {/* Destinazione delle righe */}
          {canApprove && settings && (
            <SheetCard
              settings={settings}
              year={year}
              month={month}
              pendingSync={list.pending_sync + queue.pending_sync}
              syncing={syncing}
              archiving={archiving}
              onCreateSheet={createSheet}
              onSync={sync}
              onArchive={archive}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          )}
        </>
      )}

      {/* key: rimonta la modale a ogni apertura, così i campi ripartono dalla
          trasferta scelta senza sincronizzare le props dentro lo stato. */}
      <TripModal
        key={`${modalTrip?.id ?? "nuova"}-${isModalOpen}`}
        open={isModalOpen}
        trip={modalTrip}
        companyId={companyId}
        settings={settings}
        vehicles={vehicles}
        clients={clients}
        people={people}
        canApprove={canApprove}
        currentUserId={user?.id ?? 0}
        onClose={closeModal}
        onSaved={(trip) => {
          setEditing(trip);
          void afterChange();
        }}
      />

      {canApprove && settings && (
        <SettingsModal
          key={`impostazioni-${settingsOpen}`}
          open={settingsOpen}
          settings={settings}
          vehicles={vehicles}
          people={people}
          companyId={companyId}
          onClose={() => setSettingsOpen(false)}
          onSaved={setSettings}
          onVehiclesChanged={() => void loadVehicles()}
        />
      )}
    </div>
  );
}

function SectionTab({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: Parameters<typeof Icon>[0]["name"];
  label: string;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-sm px-3 py-2 text-[12px] font-semibold transition-colors ${
        active ? "bg-brand-magenta text-white" : "text-muted hover:bg-cream dark:text-muted-dark dark:hover:bg-[#1c1c20]"
      }`}
    >
      <Icon name={icon} className="h-4 w-4" />
      {label}
      {badge != null && badge > 0 && (
        <span
          className={`rounded-pill px-1.5 text-[10px] ${
            active ? "bg-white/25" : "bg-warning/15 text-warning"
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

function Summary({ value, label, big = false }: { value: string; label: string; big?: boolean }) {
  return (
    <div
      className={`rounded-lg border bg-paper px-3 py-2.5 shadow-1 dark:bg-[#131316] ${
        big ? "border-brand-magenta/30" : "border-line dark:border-[#2a2a2e]"
      }`}
    >
      <b className={`block leading-none ${big ? "text-[20px] text-brand-magenta" : "text-[16px]"}`}>{value}</b>
      <span className="mt-1.5 block text-[11px] text-muted dark:text-muted-dark">{label}</span>
    </div>
  );
}
