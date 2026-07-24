import { useEffect, useRef, useState, type ReactNode } from "react";

const MAGENTA = "#c41284";

/** Misura il contenitore (per i grafici che disegnano in pixel reali). */
function useSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setSize({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  return { ref, ...size };
}

/** Colori distinti per le serie multi-linea. */
export const SERIES_COLORS = [
  "#c41284", "#2ec3f3", "#16a34a", "#f59e0b", "#8b5cf6", "#e11d48", "#0ea5e9", "#84cc16",
];

const _MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

/** "2026-07" → "lug"; "2026-07-22" → "22/07". */
function fmtPeriod(key: string): string {
  const p = key.split("-");
  if (p.length === 3) return `${p[2]}/${p[1]}`;
  if (p.length === 2) return _MESI[Number(p[1]) - 1] ?? key;
  return key;
}

// ── Grafico a linea (andamento) con assi e valori ────────────────────────────
export function LineChart({
  points,
  color = MAGENTA,
  format = (n: number) => n.toLocaleString("it-IT"),
}: {
  points: { label: string; value: number | null }[];
  color?: string;
  format?: (n: number) => string;
}) {
  const { ref, w, h } = useSize();
  const valid = points.filter((p) => p.value != null) as { label: string; value: number }[];

  let body: ReactNode = null;
  if (w > 0 && h > 0) {
    if (valid.length === 0) {
      body = (
        <text x={w / 2} y={h / 2} textAnchor="middle" className="fill-muted text-[11px]">
          Storico non ancora disponibile
        </text>
      );
    } else if (valid.length === 1) {
      body = (
        <>
          <circle cx={w / 2} cy={h / 2 + 4} r={4} fill={color} />
          <text x={w / 2} y={h / 2 - 8} textAnchor="middle" className="fill-ink text-[15px] font-bold dark:fill-[#f4f4f7]">
            {format(valid[0].value)}
          </text>
          <text x={w / 2} y={h / 2 + 22} textAnchor="middle" className="fill-muted text-[10px]">
            un solo periodo finora
          </text>
        </>
      );
    } else {
      const mL = 34, mR = 12, mT = 12, mB = 16;
      const plotW = w - mL - mR;
      const plotH = h - mT - mB;
      const vals = valid.map((p) => p.value);
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      const span = max - min;
      const n = valid.length;
      const xAt = (i: number) => mL + (i * plotW) / (n - 1);
      const yAt = (v: number) => (span <= 0 ? mT + plotH / 2 : mT + (1 - (v - min) / span) * plotH);
      const pts = valid.map((p, i) => [xAt(i), yAt(p.value)] as const);
      const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
      const area = `${line} L${pts[n - 1][0].toFixed(1)},${mT + plotH} L${pts[0][0].toFixed(1)},${mT + plotH} Z`;
      const last = valid[n - 1];
      body = (
        <>
          {/* Assi + etichette scala */}
          <line x1={mL} y1={mT} x2={w - mR} y2={mT} className="stroke-line dark:stroke-[#2a2a2e]" strokeWidth={1} />
          <line x1={mL} y1={mT + plotH} x2={w - mR} y2={mT + plotH} className="stroke-line dark:stroke-[#2a2a2e]" strokeWidth={1} />
          <text x={mL - 5} y={mT + 4} textAnchor="end" className="fill-muted text-[9px]">{format(max)}</text>
          <text x={mL - 5} y={mT + plotH} textAnchor="end" className="fill-muted text-[9px]">{format(min)}</text>
          <text x={mL} y={h - 3} textAnchor="start" className="fill-muted text-[9px]">{fmtPeriod(valid[0].label)}</text>
          <text x={w - mR} y={h - 3} textAnchor="end" className="fill-muted text-[9px]">{fmtPeriod(last.label)}</text>
          {/* Serie */}
          <path d={area} fill={color} opacity={0.12} />
          <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {pts.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={i === n - 1 ? 3 : 1.8} fill={color} />
          ))}
          <text
            x={pts[n - 1][0]}
            y={Math.max(mT + 9, pts[n - 1][1] - 6)}
            textAnchor="end"
            className="fill-ink text-[10px] font-bold dark:fill-[#f4f4f7]"
          >
            {format(last.value)}
          </text>
        </>
      );
    }
  }

  return (
    <div ref={ref} className="h-full w-full">
      {w > 0 && h > 0 && <svg width={w} height={h}>{body}</svg>}
    </div>
  );
}

// ── Grafico multi-linea (confronto entità nel tempo) + legenda ───────────────
export interface Series {
  name: string;
  color?: string;
  points: { label: string; value: number | null }[];
}

function MultiLineArea({ series, format }: { series: Series[]; format: (n: number) => string }) {
  const { ref, w, h } = useSize();
  const labels = series[0]?.points.map((p) => p.label) ?? [];
  const allVals = series.flatMap((s) => s.points.map((p) => p.value)).filter((v): v is number => v != null);

  let body: ReactNode = null;
  if (w > 0 && h > 0 && labels.length > 0 && allVals.length > 0) {
    const mL = 34, mR = 10, mT = 8, mB = 16;
    const plotW = w - mL - mR;
    const plotH = h - mT - mB;
    const min = Math.min(...allVals, 0);
    const max = Math.max(...allVals);
    const span = max - min || 1;
    const n = labels.length;
    const xAt = (i: number) => mL + (n === 1 ? plotW / 2 : (i * plotW) / (n - 1));
    const yAt = (v: number) => mT + (1 - (v - min) / span) * plotH;
    body = (
      <>
        <line x1={mL} y1={mT} x2={w - mR} y2={mT} className="stroke-line dark:stroke-[#2a2a2e]" strokeWidth={1} />
        <line x1={mL} y1={mT + plotH} x2={w - mR} y2={mT + plotH} className="stroke-line dark:stroke-[#2a2a2e]" strokeWidth={1} />
        <text x={mL - 5} y={mT + 4} textAnchor="end" className="fill-muted text-[9px]">{format(max)}</text>
        <text x={mL - 5} y={mT + plotH} textAnchor="end" className="fill-muted text-[9px]">{format(min)}</text>
        <text x={mL} y={h - 3} textAnchor="start" className="fill-muted text-[9px]">{fmtPeriod(labels[0])}</text>
        <text x={w - mR} y={h - 3} textAnchor="end" className="fill-muted text-[9px]">{fmtPeriod(labels[n - 1])}</text>
        {series.map((s, si) => {
          const col = s.color ?? SERIES_COLORS[si % SERIES_COLORS.length];
          const pts = s.points.map((p, i) => [xAt(i), yAt(p.value ?? min)] as const);
          const d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
          return (
            <g key={si}>
              <path d={d} fill="none" stroke={col} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {pts.length > 0 && <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={2.6} fill={col} />}
            </g>
          );
        })}
      </>
    );
  }

  return (
    <div ref={ref} className="h-full w-full">
      {w > 0 && h > 0 && <svg width={w} height={h}>{body}</svg>}
    </div>
  );
}

export function MultiLineChart({
  series,
  format = (n: number) => n.toLocaleString("it-IT"),
}: {
  series: Series[];
  format?: (n: number) => string;
}) {
  if (series.length === 0) {
    return <div className="flex h-full items-center justify-center text-[11px] text-muted">Nessun dato</div>;
  }
  return (
    <div className="flex h-full flex-col gap-1">
      <div className="min-h-0 flex-1">
        <MultiLineArea series={series} format={format} />
      </div>
      <div className="flex max-h-[34px] flex-wrap gap-x-3 gap-y-0.5 overflow-hidden text-[10px]">
        {series.map((s, i) => (
          <span key={i} className="inline-flex min-w-0 items-center gap-1">
            <span
              className="h-2 w-2 flex-shrink-0 rounded-sm"
              style={{ backgroundColor: s.color ?? SERIES_COLORS[i % SERIES_COLORS.length] }}
            />
            <span className="truncate text-muted dark:text-[#9999a0]" style={{ maxWidth: 90 }} title={s.name}>
              {s.name}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Barre orizzontali (ripartizione) ─────────────────────────────────────────
export function BarsH({
  items,
  color = MAGENTA,
  format = (n: number) => n.toLocaleString("it-IT"),
}: {
  items: { label: string; value: number }[];
  color?: string;
  format?: (n: number) => string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (items.length === 0) {
    return <div className="flex h-full items-center justify-center text-[11px] text-muted">Nessun dato</div>;
  }
  return (
    <div className="flex h-full flex-col justify-center gap-2 overflow-y-auto py-1">
      {items.map((it, idx) => (
        <div key={idx} className="flex items-center gap-2 text-[11px]">
          <span className="w-24 flex-shrink-0 truncate text-muted dark:text-[#9999a0]" title={it.label}>
            {it.label}
          </span>
          <div className="relative h-3 flex-1 overflow-hidden rounded bg-cream dark:bg-[#1c1c20]">
            <div
              className="absolute inset-y-0 left-0 rounded"
              style={{ width: `${(it.value / max) * 100}%`, backgroundColor: color }}
            />
          </div>
          <span className="w-10 flex-shrink-0 text-right font-semibold text-ink dark:text-[#f4f4f7]">
            {format(it.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Gauge (indicatore percentuale) ───────────────────────────────────────────
export function Gauge({
  value,
  positiveHigh = true,
  label,
}: {
  value: number | null;
  positiveHigh?: boolean;
  label?: string;
}) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value));
  const score = positiveHigh ? pct : 100 - pct;
  const color = score >= 70 ? "#16a34a" : score >= 40 ? "#f59e0b" : "#dc2626";
  const r = 40;
  const c = 2 * Math.PI * r;
  const off = c * (1 - (value == null ? 0 : pct) / 100);

  return (
    <div className="flex h-full w-full items-center justify-center">
      <svg viewBox="0 0 100 100" className="h-full max-h-[160px] w-auto">
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="9" className="stroke-cream dark:stroke-[#1c1c20]" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={off}
          transform="rotate(-90 50 50)"
        />
        <text x="50" y="49" textAnchor="middle" className="fill-ink text-[20px] font-bold dark:fill-[#f4f4f7]">
          {value == null ? "—" : `${Math.round(pct)}%`}
        </text>
        {label && (
          <text x="50" y="64" textAnchor="middle" className="fill-muted text-[7px]">
            {label}
          </text>
        )}
      </svg>
    </div>
  );
}

// ── Ciambella (composizione) ─────────────────────────────────────────────────
export function Donut({
  segments,
}: {
  segments: { label: string; value: number; color: string }[];
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total === 0) {
    return <div className="flex h-full items-center justify-center text-[11px] text-muted">Nessun dato</div>;
  }
  const R = 15.915; // circonferenza ≈ 100
  let offset = 25; // parte in alto
  return (
    <div className="flex h-full items-center gap-3">
      <svg viewBox="0 0 42 42" className="h-full max-h-[130px] w-auto flex-shrink-0">
        <circle cx="21" cy="21" r={R} fill="none" strokeWidth="6" className="stroke-cream dark:stroke-[#1c1c20]" />
        {segments.map((s, i) => {
          const len = (s.value / total) * 100;
          const dash = `${len} ${100 - len}`;
          const el = (
            <circle
              key={i}
              cx="21"
              cy="21"
              r={R}
              fill="none"
              stroke={s.color}
              strokeWidth="6"
              strokeDasharray={dash}
              strokeDashoffset={offset}
            />
          );
          offset -= len;
          return el;
        })}
        <text x="21" y="22.5" textAnchor="middle" className="fill-ink text-[7px] font-bold dark:fill-[#f4f4f7]">
          {total}
        </text>
      </svg>
      <div className="flex min-w-0 flex-col gap-1 text-[11px]">
        {segments.map((s, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 flex-shrink-0 rounded-sm" style={{ backgroundColor: s.color }} />
            <span className="min-w-0 truncate text-muted dark:text-[#9999a0]">{s.label}</span>
            <span className="ml-auto font-semibold text-ink dark:text-[#f4f4f7]">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Barre appaiate (confronto A vs B) ────────────────────────────────────────
export function PairedBars({
  a,
  b,
  format = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 1 }),
}: {
  a: { label: string; value: number; color?: string };
  b: { label: string; value: number; color?: string };
  format?: (n: number) => string;
}) {
  const max = Math.max(1, a.value, b.value);
  const col = (x: { label: string; value: number; color?: string }, fallback: string) => (
    <div className="flex h-full flex-1 flex-col items-center justify-end gap-1">
      <span className="text-[11px] font-semibold text-ink dark:text-[#f4f4f7]">{format(x.value)}</span>
      <div
        className="w-8 rounded-t"
        style={{ height: `${(x.value / max) * 100}%`, backgroundColor: x.color ?? fallback, minHeight: 2 }}
      />
      <span className="text-[10px] text-muted dark:text-[#9999a0]">{x.label}</span>
    </div>
  );
  return (
    <div className="flex h-full items-stretch justify-center gap-6 px-4 pb-1 pt-2">
      {col(a, "#8a8a8a")}
      {col(b, MAGENTA)}
    </div>
  );
}
