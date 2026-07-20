import { Icon, type IconName } from "../ui/Icon";

/**
 * Icona di una risorsa/collegamento. Per Canva e Google Drive usa i loghi brand VERI
 * (SVG multicolore, non `currentColor`); per NAS e link generici usa le icone del tema.
 */
export function ResourceIcon({ type, className = "h-4 w-4" }: { type: string; className?: string }) {
  if (type === "drive") {
    // Logo ufficiale Google Drive (triangolo tricolore).
    return (
      <svg viewBox="0 0 87.3 78" className={className} aria-hidden="true" focusable="false">
        <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
        <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" fill="#00ac47" />
        <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335" />
        <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
        <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
        <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
      </svg>
    );
  }
  if (type === "canva") {
    // Logo Canva: cerchio con gradiente brand + "C" bianca.
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="resicon-canva-gradient" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#823AF3" />
            <stop offset="0.5" stopColor="#4B66E1" />
            <stop offset="1" stopColor="#01F1C4" />
          </linearGradient>
        </defs>
        <circle cx="12" cy="12" r="12" fill="url(#resicon-canva-gradient)" />
        <path d="M15.6 8.7a4.6 4.6 0 1 0 0 6.6" fill="none" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" />
      </svg>
    );
  }
  return <Icon name={(type === "nas" ? "nas" : "link") as IconName} className={className} />;
}
