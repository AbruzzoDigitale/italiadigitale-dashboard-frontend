/**
 * Mini-glifo che ricalca visivamente il tipo di widget/grafico, così a colpo d'occhio
 * si capisce cosa mostra. Usa `currentColor` → eredita il colore dal contenitore.
 */
export function WidgetTypeIcon({ type, className = "h-4 w-4" }: { type: string; className?: string }) {
  switch (type) {
    case "kpi-trend":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="3,16 9,10 13,13 21,5" />
          <circle cx="21" cy="5" r="1.6" fill="currentColor" stroke="none" />
        </svg>
      );
    case "kpi-trend-by-operator":
    case "kpi-trend-by-area":
    case "kpi-trend-by-client":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="3,15 9,10 13,12 21,6" />
          <polyline points="3,20 9,17 13,18 21,13" opacity="0.5" />
        </svg>
      );
    case "kpi-by-operator":
    case "kpi-by-area":
    case "kpi-by-client":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <rect x="3" y="5" width="11" height="3" rx="1.5" />
          <rect x="3" y="10.5" width="17" height="3" rx="1.5" />
          <rect x="3" y="16" width="7" height="3" rx="1.5" />
        </svg>
      );
    case "kpi-gauge":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 17 A 8 8 0 0 1 20 17" />
          <line x1="12" y1="17" x2="15.5" y2="11.5" />
        </svg>
      );
    case "kpi-status-donut":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.2} aria-hidden>
          <circle cx="12" cy="12" r="7" opacity="0.35" />
          <path d="M12 5 a7 7 0 0 1 6.06 3.5" strokeLinecap="round" />
        </svg>
      );
    case "kpi-est-actual":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <rect x="6" y="9" width="4" height="10" rx="1" />
          <rect x="14" y="5" width="4" height="14" rx="1" />
        </svg>
      );
    case "kpi-stat":
    default:
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <text x="12" y="17" textAnchor="middle" fontSize="14" fontWeight="800" fontFamily="inherit">
            42
          </text>
        </svg>
      );
  }
}
