import type { SocialPlatform } from "../../api/socialProfiles";

/**
 * Loghi "reali" dei social di serie (colori brand), resi come badge quadrato
 * arrotondato stile icona app. Per le piattaforme custom aziendali il badge è
 * l'iniziale dell'etichetta sul colore scelto. SVG autocontenuti.
 */
export function SocialIcon({
  platform,
  label,
  color,
  className = "h-5 w-5",
}: {
  platform: SocialPlatform;
  /** Etichetta della piattaforma (per l'iniziale del badge custom). */
  label?: string | null;
  /** Colore del badge custom (default grigio ardesia). */
  color?: string | null;
  className?: string;
}) {
  switch (platform) {
    case "facebook":
      return (
        <svg viewBox="0 0 24 24" className={`${className} flex-shrink-0`} aria-hidden="true">
          <rect width="24" height="24" rx="6" fill="#1877F2" />
          <path
            fill="#fff"
            d="M15.9 8.6h-1.5c-.6 0-.8.3-.8.9V11h2.3l-.3 2.5h-2v6h-2.8v-6H9V11h1.8V9c0-2 1.1-3.1 3.2-3.1h1.9z"
          />
        </svg>
      );
    case "instagram":
      return (
        <svg viewBox="0 0 24 24" className={`${className} flex-shrink-0`} aria-hidden="true">
          <defs>
            <linearGradient id="sp-ig-grad" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="#FED576" />
              <stop offset="0.35" stopColor="#F47133" />
              <stop offset="0.65" stopColor="#BC3081" />
              <stop offset="1" stopColor="#4C63D2" />
            </linearGradient>
          </defs>
          <rect width="24" height="24" rx="6" fill="url(#sp-ig-grad)" />
          <rect
            x="6.2"
            y="6.2"
            width="11.6"
            height="11.6"
            rx="3.4"
            fill="none"
            stroke="#fff"
            strokeWidth="1.6"
          />
          <circle cx="12" cy="12" r="2.7" fill="none" stroke="#fff" strokeWidth="1.6" />
          <circle cx="15.6" cy="8.4" r="0.9" fill="#fff" />
        </svg>
      );
    case "tiktok":
      return (
        <svg viewBox="0 0 24 24" className={`${className} flex-shrink-0`} aria-hidden="true">
          <rect width="24" height="24" rx="6" fill="#010101" />
          {/* Nota con lo sdoppiamento cromatico ciano/rosso tipico del logo. */}
          <g fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.4 5.7v7.9a3.3 3.3 0 1 1-2.8-3.26M14.4 5.7a4.4 4.4 0 0 0 3.7 3.7" stroke="#25F4EE" transform="translate(-0.5 -0.35)" />
            <path d="M14.4 5.7v7.9a3.3 3.3 0 1 1-2.8-3.26M14.4 5.7a4.4 4.4 0 0 0 3.7 3.7" stroke="#FE2C55" transform="translate(0.5 0.35)" />
            <path d="M14.4 5.7v7.9a3.3 3.3 0 1 1-2.8-3.26M14.4 5.7a4.4 4.4 0 0 0 3.7 3.7" stroke="#fff" />
          </g>
        </svg>
      );
    case "linkedin":
      return (
        <svg viewBox="0 0 24 24" className={`${className} flex-shrink-0`} aria-hidden="true">
          <rect width="24" height="24" rx="6" fill="#0A66C2" />
          <circle cx="7.6" cy="7.7" r="1.5" fill="#fff" />
          <rect x="6.3" y="10.1" width="2.6" height="7.6" rx="0.3" fill="#fff" />
          <path
            fill="#fff"
            d="M11.2 10.1h2.5v1.1c.4-.7 1.4-1.3 2.7-1.3 2.1 0 3.3 1.3 3.3 3.7v4.1h-2.6v-3.7c0-1.3-.5-2-1.6-2-1 0-1.7.7-1.7 2v3.7h-2.6z"
          />
        </svg>
      );
    case "youtube":
      return (
        <svg viewBox="0 0 24 24" className={`${className} flex-shrink-0`} aria-hidden="true">
          <rect width="24" height="24" rx="6" fill="#FF0000" />
          <path fill="#fff" d="M9.9 8.6 16 12l-6.1 3.4z" />
        </svg>
      );
    default: {
      // Piattaforma custom: badge con l'iniziale sul colore configurato.
      const letter = (label ?? platform).trim().charAt(0).toUpperCase() || "?";
      return (
        <svg viewBox="0 0 24 24" className={`${className} flex-shrink-0`} aria-hidden="true">
          <rect width="24" height="24" rx="6" fill={color || "#64748B"} />
          <text
            x="12"
            y="16.4"
            textAnchor="middle"
            fontSize="12.5"
            fontWeight="700"
            fontFamily="inherit"
            fill="#fff"
          >
            {letter}
          </text>
        </svg>
      );
    }
  }
}
