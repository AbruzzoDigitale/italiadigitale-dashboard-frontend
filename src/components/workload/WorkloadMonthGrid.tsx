/* Vista MESE del workload — griglia mensile (settimane × 7) per un operatore.
   I dati per-giorno arrivano dalla heatmap già caricata (nessun fetch extra). */

export interface WorkloadMonthDayStat {
  tasks: number;
  hours: number;
  dots: string[];
}

interface WorkloadMonthGridProps {
  /** Una data qualsiasi del mese da mostrare (YYYY-MM-DD). */
  anchorDate: string;
  /** Statistiche per-giorno (date ISO → stat). */
  stats: Map<string, WorkloadMonthDayStat>;
  /** Capacità giornaliera (h) per il calcolo del carico. */
  capacityHours: number;
  /** Data di oggi (YYYY-MM-DD). */
  today: string;
  /** Click su un giorno feriale → apre quel giorno. */
  onOpenDay: (iso: string) => void;
}

const DOWS = ["LUN", "MAR", "MER", "GIO", "VEN", "SAB", "DOM"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function loadClass(pct: number): "wlcal-load-ok" | "wlcal-load-warn" | "wlcal-load-over" {
  if (pct >= 100) return "wlcal-load-over";
  if (pct >= 80) return "wlcal-load-warn";
  return "wlcal-load-ok";
}

interface Cell {
  blank: boolean;
  iso?: string;
  date?: number;
  weekend?: boolean;
  today?: boolean;
}

export function WorkloadMonthGrid({ anchorDate, stats, capacityHours, today, onOpenDay }: WorkloadMonthGridProps) {
  const [year, month] = anchorDate.split("-").map(Number); // month 1-12
  const first = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  // Offset lunedì-primo: getDay() 0=Dom → (g+6)%7 mette Lun=0 … Dom=6.
  const leadBlanks = (first.getDay() + 6) % 7;

  const cells: Cell[] = [];
  for (let i = 0; i < leadBlanks; i++) cells.push({ blank: true });
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${pad(month)}-${pad(d)}`;
    const dow = (new Date(year, month - 1, d).getDay() + 6) % 7;
    cells.push({ blank: false, iso, date: d, weekend: dow >= 5, today: iso === today });
  }
  while (cells.length % 7 !== 0) cells.push({ blank: true });

  const cap = capacityHours > 0 ? capacityHours : 8;

  return (
    <div className="wlcal-month">
      <div className="wlcal-month-dows">
        {DOWS.map((d, i) => (
          <div key={d} className={`wlcal-mdow ${i >= 5 ? "we" : ""}`}>{d}</div>
        ))}
      </div>
      <div className="wlcal-month-grid">
        {cells.map((c, i) => {
          if (c.blank) return <div key={`b-${i}`} className="wlcal-mcell is-blank" />;
          const stat = stats.get(c.iso!);
          const tasks = stat?.tasks ?? 0;
          const loadPct = stat ? (stat.hours / cap) * 100 : 0;
          const clickable = !c.weekend;
          const cls = loadClass(loadPct);
          return (
            <div
              key={c.iso}
              className={`wlcal-mcell ${c.weekend ? "is-we" : ""} ${c.today ? "is-today" : ""} ${clickable ? "is-click" : ""}`}
              onClick={clickable ? () => onOpenDay(c.iso!) : undefined}
              role={clickable ? "button" : undefined}
              tabIndex={clickable ? 0 : undefined}
              onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenDay(c.iso!); } } : undefined}
              title={clickable ? "Apri il giorno" : undefined}
            >
              <div className="wlcal-mtop">
                <span className="wlcal-mnum">{c.date}</span>
                {c.today && <span className="wlcal-mflag is-today">Oggi</span>}
              </div>
              {c.weekend ? (
                <div className="wlcal-mwe">—</div>
              ) : tasks === 0 ? (
                <div className="wlcal-mempty">Libero</div>
              ) : (
                <>
                  <div className="wlcal-mdots">
                    {(stat?.dots ?? []).map((color, k) => (
                      <i key={k} style={{ background: color }} />
                    ))}
                    {tasks > (stat?.dots.length ?? 0) && (
                      <span className="wlcal-mmore">+{tasks - (stat?.dots.length ?? 0)}</span>
                    )}
                  </div>
                  <div className="wlcal-mfoot">
                    <span className="wlcal-mtasks">{tasks} task</span>
                    <span className={`wlcal-mload ${cls}`}>{Math.round(loadPct)}%</span>
                  </div>
                  <div className="wlcal-mbar">
                    <i className={cls} style={{ width: `${Math.min(100, loadPct)}%` }} />
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
