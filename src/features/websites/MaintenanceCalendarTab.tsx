import { useCallback, useEffect, useMemo, useState } from "react";
import {
  maintenanceCalendarApi,
  type CalendarItem,
  type MaintenanceCalendar,
} from "../../api/websiteMaintenance";
import { createSubmissionApi } from "../../api/forms";
import { Badge } from "../../components/ui/Badge";
import { Icon } from "../../components/ui/Icon";
import { useToast } from "../../context/ToastContext";

/**
 * Calendario delle manutenzioni, mese per mese: sotto ogni giorno i siti da
 * aggiornare. Riproduce la griglia del foglio da cui si è partiti, ma le voci
 * sono cliccabili — si apre il report da compilare.
 */

/**
 * Colori delle voci, uno per stato della task: si capisce a colpo d'occhio a che
 * punto è ogni manutenzione senza aprirla. Stessa scala del widget "backlog per
 * stato" (grigio → blu → ambra → verde, rosso se bloccata).
 */
const STATI = {
  planned: {
    label: "Da fare",
    icon: "globe",
    voce: "bg-paper text-ink hover:bg-brand-magenta/10 dark:bg-[#131316] dark:text-[#f4f4f7]",
    pallino: "bg-muted/50 dark:bg-[#9999a0]",
  },
  in_progress: {
    label: "In corso",
    icon: "activity",
    voce: "bg-info/10 text-info hover:bg-info/20",
    pallino: "bg-info",
  },
  review: {
    label: "In revisione",
    icon: "eye",
    voce: "bg-warning/10 text-[#b07d00] hover:bg-warning/20 dark:text-warning",
    pallino: "bg-warning",
  },
  completed: {
    label: "Completata",
    icon: "check",
    voce: "bg-success/10 text-success hover:bg-success/20",
    pallino: "bg-success",
  },
  blocked: {
    label: "Bloccata",
    icon: "alert-triangle",
    voce: "bg-danger/10 text-danger hover:bg-danger/20",
    pallino: "bg-danger",
  },
  cancelled: {
    label: "Annullata",
    icon: "x",
    voce: "bg-muted/10 text-muted line-through hover:bg-muted/20 dark:text-[#9999a0]",
    pallino: "bg-muted/50",
  },
} as const;

type StatoVoce = keyof typeof STATI;

/** Gli stati fuori scala (o assenti) ricadono su "da fare". */
function statoVoce(item: CalendarItem): StatoVoce {
  if (item.is_completed) return "completed";
  return item.status in STATI ? (item.status as StatoVoce) : "planned";
}

/** In legenda solo gli stati che si incontrano davvero in un giro di manutenzioni. */
const LEGENDA: StatoVoce[] = ["planned", "in_progress", "review", "completed", "blocked"];

const MESI = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];
const GIORNI = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Griglia del mese allineata al lunedì, come un calendario da parete. */
function monthGrid(anno: number, mese: number): (Date | null)[] {
  const primo = new Date(anno, mese, 1);
  const offset = (primo.getDay() + 6) % 7; // lunedì = 0
  const giorniNelMese = new Date(anno, mese + 1, 0).getDate();
  const celle: (Date | null)[] = Array.from({ length: offset }, () => null);
  for (let g = 1; g <= giorniNelMese; g += 1) celle.push(new Date(anno, mese, g));
  while (celle.length % 7 !== 0) celle.push(null);
  return celle;
}

interface MaintenanceCalendarTabProps {
  companyId: number;
  fillHeight?: boolean;
}

export function MaintenanceCalendarTab({ companyId, fillHeight = false }: MaintenanceCalendarTabProps) {
  const toast = useToast();
  const oggi = new Date();
  const [anno, setAnno] = useState(oggi.getFullYear());
  const [mese, setMese] = useState(oggi.getMonth());
  const [dati, setDati] = useState<MaintenanceCalendar | null>(null);
  const [loading, setLoading] = useState(true);
  const [apertura, setApertura] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const primo = new Date(anno, mese, 1);
      const ultimo = new Date(anno, mese + 1, 0);
      setDati(await maintenanceCalendarApi(companyId, iso(primo), iso(ultimo)));
    } catch {
      setDati(null);
    } finally {
      setLoading(false);
    }
  }, [companyId, anno, mese]);

  useEffect(() => {
    void load();
  }, [load]);

  const perGiorno = useMemo(() => {
    const mappa = new Map<string, CalendarItem[]>();
    (dati?.days ?? []).forEach((g) => mappa.set(g.date, g.items));
    return mappa;
  }, [dati]);

  const celle = useMemo(() => monthGrid(anno, mese), [anno, mese]);

  const cambiaMese = (delta: number) => {
    const d = new Date(anno, mese + delta, 1);
    setAnno(d.getFullYear());
    setMese(d.getMonth());
  };

  /** Apre il report della manutenzione, creando la bozza se non c'è ancora. */
  const apriReport = async (item: CalendarItem) => {
    if (!item.form_id) {
      toast.error("Questa manutenzione non ha un modulo collegato");
      return;
    }
    setApertura(item.work_item_id);
    try {
      const id =
        item.submission_id ??
        (await createSubmissionApi({ form_id: item.form_id, work_item_id: item.work_item_id })).id;
      window.open(`/modulo/compila/${id}`, "_blank", "noopener");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nell'apertura del report");
    } finally {
      setApertura(null);
    }
  };

  const oggiIso = iso(oggi);

  return (
    <div
      className={`rounded-lg border border-line bg-paper p-6 dark:border-[#2a2a2e] dark:bg-[#131316] ${
        fillHeight ? "flex h-full flex-col min-h-0" : ""
      }`}
    >
      <div className="mb-5 flex flex-none flex-wrap items-center justify-between gap-3">
        <div>
          <h2
            className="mb-1 font-display font-bold tracking-tight text-ink dark:text-[#f4f4f7]"
            style={{ fontSize: "17px" }}
          >
            Calendario manutenzioni
          </h2>
          <p className="font-body text-[13px] text-muted dark:text-[#9999a0]">
            I siti da aggiornare giorno per giorno. Clicca una voce per compilare il report.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            {LEGENDA.map((stato) => (
              <span
                key={stato}
                className="inline-flex items-center gap-1 text-[10.5px] text-muted dark:text-[#9999a0]"
              >
                <span className={`h-2 w-2 rounded-full ${STATI[stato].pallino}`} />
                {STATI[stato].label}
              </span>
            ))}
            <span className="inline-flex items-center gap-1 text-[10.5px] text-muted dark:text-[#9999a0]">
              <Icon name="check-circle" className="h-3 w-3" />
              Report consegnato
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {dati && dati.total > 0 && (
            <Badge variant={dati.done === dati.total ? "success" : "info"}>
              {dati.done} di {dati.total} fatte
            </Badge>
          )}
          <button
            type="button"
            aria-label="Mese precedente"
            onClick={() => cambiaMese(-1)}
            className="inline-grid h-8 w-8 place-items-center rounded-md border border-line text-ink transition-colors hover:bg-cream dark:border-[#2a2a2e] dark:text-[#f4f4f7] dark:hover:bg-[#1c1c20]"
          >
            <Icon name="chevron-right" className="h-3.5 w-3.5 rotate-180" />
          </button>
          <span className="min-w-[150px] text-center text-[13.5px] font-bold text-ink dark:text-[#f4f4f7]">
            {MESI[mese]} {anno}
          </span>
          <button
            type="button"
            aria-label="Mese successivo"
            onClick={() => cambiaMese(1)}
            className="inline-grid h-8 w-8 place-items-center rounded-md border border-line text-ink transition-colors hover:bg-cream dark:border-[#2a2a2e] dark:text-[#f4f4f7] dark:hover:bg-[#1c1c20]"
          >
            <Icon name="chevron-right" className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className={fillHeight ? "-mr-3 min-h-0 flex-1 overflow-y-auto pr-3" : ""}>
        {loading ? (
          <div className="sp-skeleton h-96 rounded-md border border-line dark:border-[#2a2a2e]" />
        ) : (
          <div className="min-w-[720px]">
            <div className="mb-1 grid grid-cols-7 gap-2">
              {GIORNI.map((g) => (
                <div
                  key={g}
                  className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]"
                >
                  {g}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-2">
              {celle.map((giorno, index) => {
                if (!giorno) {
                  return <div key={`vuota-${index}`} className="min-h-[104px] rounded-md opacity-0" />;
                }
                const chiave = iso(giorno);
                const voci = perGiorno.get(chiave) ?? [];
                const isOggi = chiave === oggiIso;
                const weekend = giorno.getDay() === 0 || giorno.getDay() === 6;
                return (
                  <div
                    key={chiave}
                    className={`min-h-[104px] rounded-md border p-1.5 transition-colors ${
                      isOggi
                        ? "border-brand-magenta/50 bg-brand-magenta/5"
                        : weekend
                        ? "border-line/60 bg-cream/40 dark:border-[#2a2a2e] dark:bg-[#1c1c20]/40"
                        : "border-line bg-cream dark:border-[#2a2a2e] dark:bg-[#1c1c20]"
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span
                        className={`text-[11px] font-semibold ${
                          isOggi
                            ? "text-brand-magenta"
                            : "text-muted dark:text-[#9999a0]"
                        }`}
                      >
                        {giorno.getDate()}
                      </span>
                      {voci.length > 0 && (
                        <span className="text-[10px] text-muted dark:text-[#9999a0]">{voci.length}</span>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      {voci.map((item) => {
                        const consegnato = item.submission_status === "submitted";
                        const stato = STATI[statoVoce(item)];
                        return (
                          <button
                            key={item.work_item_id}
                            type="button"
                            onClick={() => apriReport(item)}
                            disabled={apertura === item.work_item_id}
                            title={`${item.website_domain ?? item.title} · ${stato.label}${
                              item.user_label ? ` · ${item.user_label}` : ""
                            }${consegnato ? " · report consegnato" : ""}`}
                            className={`flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[10.5px] transition-colors disabled:opacity-50 ${stato.voce}`}
                          >
                            <Icon name={stato.icon} className="h-2.5 w-2.5 flex-none opacity-70" />
                            <span className="min-w-0 flex-1 truncate">
                              {item.website_domain ?? item.title}
                            </span>
                            {consegnato && (
                              <Icon
                                name="check-circle"
                                className="h-2.5 w-2.5 flex-none opacity-70"
                                aria-label="Report consegnato"
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!loading && dati && dati.total === 0 && (
          <p className="mt-4 text-[13px] text-muted dark:text-[#9999a0]">
            Nessuna manutenzione in calendario questo mese. Le task si generano dal pannello
            Azienda → Siti web.
          </p>
        )}
      </div>
    </div>
  );
}
