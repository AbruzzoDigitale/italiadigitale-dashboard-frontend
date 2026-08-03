import { useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  listWorkloadUsersGroupedByAreaAndDayApi,
  type WorkloadUserByDay,
  type WorkloadUserDayCell,
} from "../../../api/workload";
import { useAuth } from "../../../hooks/useAuth";
import { Icon } from "../../ui/Icon";
import { Spinner } from "../../ui/Spinner";
import { useQuickData } from "./QuickListFrame";

// Stati "disponibilità" (ferie/malattia…): cella neutra, non di carico.
const AVAILABILITY = new Set(["vacation", "sick", "unavailable", "part_time"]);
const AVAILABILITY_SHORT: Record<string, string> = {
  vacation: "Fer",
  sick: "Mal",
  unavailable: "N/D",
  part_time: "PT",
};

// Colori di carico coerenti col resto dell'app (success / warning / danger).
const HUE_OK = "#16a34a";
const HUE_WARN = "#f59e0b";
const HUE_OVER = "#ef4444";

const WEEKDAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

function weekdayLabel(iso: string): { wd: string; day: string } {
  const d = new Date(`${iso}T00:00:00`);
  const idx = (d.getDay() + 6) % 7; // 0 = lunedì
  return { wd: WEEKDAYS[idx] ?? "", day: String(d.getDate()) };
}

type CellVisual = { bg: string; color?: string; label: string; muted: boolean };

function cellVisual(cell: WorkloadUserDayCell | undefined): CellVisual {
  if (!cell) return { bg: "transparent", label: "", muted: true };
  const status = cell.workload_status as string;
  if (AVAILABILITY.has(status)) {
    return {
      bg: "color-mix(in srgb, var(--wl-neutral) 55%, transparent)",
      label: AVAILABILITY_SHORT[status] ?? "—",
      muted: true,
    };
  }
  const pct = Math.round(cell.utilization_percent);
  if (status === "empty" || (pct === 0 && cell.assigned_tasks_count === 0)) {
    return { bg: "transparent", label: "·", muted: true };
  }
  const hue = status === "overload" ? HUE_OVER : status === "warning" ? HUE_WARN : HUE_OK;
  // Intensità crescente col carico (satura verso il 140%).
  const alpha = Math.max(0.22, Math.min(0.9, 0.22 + (Math.min(pct, 140) / 140) * 0.6));
  return {
    bg: `color-mix(in srgb, ${hue} ${Math.round(alpha * 100)}%, transparent)`,
    color: alpha >= 0.5 ? "#ffffff" : undefined,
    label: `${pct}%`,
    muted: false,
  };
}

export function WorkloadHeatmapWidget() {
  const { activeCompanyId } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [weekOffset, setWeekOffset] = useState(0);

  const { data, loading } = useQuickData(
    () =>
      activeCompanyId == null
        ? Promise.resolve(null)
        : listWorkloadUsersGroupedByAreaAndDayApi({
            range_mode: "week",
            week_offset: weekOffset,
            company_id: activeCompanyId,
            include_task_details: false,
            sort_by: "name",
          }),
    [activeCompanyId, weekOffset],
  );

  // Utenti unici (lo stesso utente compare in più gruppi-area): tieni la prima occorrenza.
  const users = useMemo<WorkloadUserByDay[]>(() => {
    const map = new Map<number, WorkloadUserByDay>();
    for (const g of data?.groups ?? []) {
      for (const u of g.users) if (!map.has(u.user_id)) map.set(u.user_id, u);
    }
    return [...map.values()].sort((a, b) =>
      (a.full_name || a.username).localeCompare(b.full_name || b.username, "it"),
    );
  }, [data]);

  const days = data?.days ?? [];
  const goWorkload = () => navigate({ pathname: "/workload", search: location.search });

  // Griglia: colonna nome + N giorni.
  const gridCols = `minmax(58px, 1.1fr) repeat(${Math.max(days.length, 1)}, minmax(0, 1fr))`;

  return (
    <div className="flex h-full flex-col p-3">
      {/* Header: titolo (naviga a /workload) + navigazione settimana */}
      <div className="mb-2 flex flex-shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={goWorkload}
          className="group flex min-w-0 items-center gap-1.5"
          title="Vai al workload"
        >
          <Icon name="activity" className="h-4 w-4 flex-shrink-0 text-brand-magenta" />
          <span className="truncate text-[12px] font-semibold text-ink dark:text-[#f4f4f7]">
            Heatmap workload
          </span>
        </button>
        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setWeekOffset((w) => w - 1)}
            className="grid h-6 w-6 place-items-center rounded text-muted hover:bg-cream hover:text-ink dark:text-[#9999a0] dark:hover:bg-[#1c1c20] dark:hover:text-[#f4f4f7]"
            title="Settimana precedente"
          >
            <Icon name="chevron-right" className="h-3.5 w-3.5 rotate-180" />
          </button>
          {weekOffset !== 0 && (
            <button
              type="button"
              onClick={() => setWeekOffset(0)}
              className="rounded px-1.5 text-[10px] font-semibold text-muted hover:bg-cream hover:text-ink dark:text-[#9999a0] dark:hover:bg-[#1c1c20]"
              title="Questa settimana"
            >
              Oggi
            </button>
          )}
          <button
            type="button"
            onClick={() => setWeekOffset((w) => w + 1)}
            className="grid h-6 w-6 place-items-center rounded text-muted hover:bg-cream hover:text-ink dark:text-[#9999a0] dark:hover:bg-[#1c1c20] dark:hover:text-[#f4f4f7]"
            title="Settimana successiva"
          >
            <Icon name="chevron-right" className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="no-scrollbar min-h-0 flex-1 overflow-auto" style={{ ["--wl-neutral" as string]: "#9999a0" }}>
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Spinner size="sm" />
          </div>
        ) : users.length === 0 || days.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-[11px] text-muted dark:text-[#9999a0]">
            {activeCompanyId == null ? "Nessuna azienda selezionata" : "Nessun operatore da mostrare"}
          </div>
        ) : (
          <div className="min-w-[260px]">
            {/* Intestazione giorni */}
            <div className="grid items-end gap-1" style={{ gridTemplateColumns: gridCols }}>
              <div />
              {days.map((iso) => {
                const { wd, day } = weekdayLabel(iso);
                return (
                  <div key={iso} className="text-center leading-tight">
                    <div className="text-[10px] font-semibold uppercase text-muted dark:text-[#9999a0]">{wd}</div>
                    <div className="text-[10px] text-muted dark:text-[#9999a0]">{day}</div>
                  </div>
                );
              })}
            </div>

            {/* Righe utenti */}
            <div className="mt-1 flex flex-col gap-1">
              {users.map((u) => {
                const byDate = new Map(u.days.map((c) => [c.date.slice(0, 10), c]));
                return (
                  <div key={u.user_id} className="grid items-center gap-1" style={{ gridTemplateColumns: gridCols }}>
                    <span
                      className="truncate text-[11px] text-ink dark:text-[#f4f4f7]"
                      title={u.full_name || u.username}
                    >
                      {u.full_name || u.username}
                    </span>
                    {days.map((iso) => {
                      const cell = byDate.get(iso.slice(0, 10));
                      const v = cellVisual(cell);
                      const tip = cell
                        ? `${u.full_name || u.username} · ${weekdayLabel(iso).wd} ${weekdayLabel(iso).day}\n${Math.round(cell.utilization_percent)}% · ${cell.occupied_capacity_hours}h/${u.max_capacity_hours_day}h · ${cell.assigned_tasks_count} task`
                        : "";
                      return (
                        <div
                          key={iso}
                          title={tip}
                          className={`flex h-7 items-center justify-center rounded text-[10px] font-bold tabular-nums ${
                            v.muted ? "text-muted dark:text-[#9999a0]" : ""
                          }`}
                          style={{ backgroundColor: v.bg, color: v.color }}
                        >
                          {v.label}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Legenda */}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted dark:text-[#9999a0]">
              <LegendSwatch color={HUE_OK} label="Ok" />
              <LegendSwatch color={HUE_WARN} label="In tensione" />
              <LegendSwatch color={HUE_OVER} label="Sovraccarico" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="h-2.5 w-2.5 rounded-[3px]"
        style={{ backgroundColor: `color-mix(in srgb, ${color} 70%, transparent)` }}
      />
      {label}
    </span>
  );
}
