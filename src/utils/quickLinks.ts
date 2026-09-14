/** Se manca lo schema (http/https), antepone `https://`. */
export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/** Host dell'URL; fallback alla stringa grezza se non parsabile. */
function hostOf(url: string): string {
  try {
    return new URL(normalizeUrl(url)).host;
  } catch {
    return url;
  }
}

/** Host "pulito" senza `www.` — usato come titolo di fallback. */
export function hostLabel(url: string): string {
  return hostOf(url).replace(/^www\./i, "");
}

// ── Icone brandizzate dei servizi noti, in base all'URL ──────────────────────
// SVG inline (data-URI): niente dipendenze esterne, sempre nitide.
const svg = (body: string, viewBox = "0 0 24 24") =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>`)}`;

// Base "documento" per Docs/Sheets/Slides/Forms (colore + contenuto interno).
const doc = (color: string, corner: string, inner: string) =>
  svg(`<path fill="${color}" d="M6 2h8l4 4v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/><path fill="${corner}" d="M14 2l4 4h-4z"/>${inner}`);

const SERVICE_ICONS = {
  drive: svg(
    `<path fill="#0066da" d="M6.6 66.85 10.45 73.5c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5z"/><path fill="#00ac47" d="M43.65 25 29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0-1.2 4.5h27.5z"/><path fill="#ea4335" d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 11.5z"/><path fill="#00832d" d="M43.65 25 57.4 1.2c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z"/><path fill="#2684fc" d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z"/><path fill="#ffba00" d="M73.4 26.5 60.7 4.5c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25 59.8 53h27.45c0-1.55-.4-3.1-1.2-4.5z"/>`,
    "0 0 87.3 78",
  ),
  docs: doc("#4285F4", "#A1C2FA", `<g fill="#fff"><rect x="7" y="11" width="8" height="1.4"/><rect x="7" y="14" width="8" height="1.4"/><rect x="7" y="17" width="5" height="1.4"/></g>`),
  sheets: doc("#0F9D58", "#8CD1B0", `<path fill="#fff" d="M7.3 11h9.4v7.4H7.3z"/><g stroke="#0F9D58" stroke-width="1"><path d="M10.3 11v7.4M13.7 11v7.4M7.3 13.5h9.4M7.3 16h9.4"/></g>`),
  slides: doc("#F4B400", "#FADA80", `<rect x="7.5" y="11.4" width="9" height="6.2" rx="1" fill="#fff"/>`),
  forms: doc("#673AB7", "#B39DDB", `<g fill="#fff"><circle cx="8" cy="11.6" r="0.9"/><rect x="10" y="10.9" width="6" height="1.3"/><circle cx="8" cy="15.1" r="0.9"/><rect x="10" y="14.4" width="6" height="1.3"/></g>`),
  gmail: svg(
    `<path fill="#4285f4" d="M3.5 40h7V22L1 14v22.5A3.5 3.5 0 0 0 3.5 40z"/><path fill="#34a853" d="M41.5 40h7A3.5 3.5 0 0 0 51 36.5V14l-9.5 8z"/><path fill="#fbbc04" d="M41.5 3.5V22L51 14V6.7c0-4.4-5-6.9-8.5-4.2z"/><path fill="#ea4335" d="M10.5 22V8L26 19.6 41.5 8v14L26 33.6z"/><path fill="#c5221f" d="M1 6.7V14l9.5 8V3.5C7 .8 1 3.3 1 6.7z"/>`,
    "0 0 52 40",
  ),
  calendar: svg(`<rect x="4" y="4" width="16" height="16" rx="2" fill="#fff" stroke="#DADCE0"/><path fill="#4285F4" d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1H4z"/><text x="12" y="17.5" font-family="Arial,Helvetica,sans-serif" font-size="9" font-weight="700" fill="#4285F4" text-anchor="middle">31</text>`),
  meet: svg(`<rect x="3" y="7" width="12" height="10" rx="2" fill="#00832D"/><path fill="#00AC47" d="M15 10l5-3v10l-5-3z"/>`),
  maps: svg(`<path fill="#EA4335" d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7z"/><circle cx="12" cy="9" r="2.5" fill="#fff"/>`),
  youtube: svg(`<rect x="2" y="5" width="20" height="14" rx="4" fill="#FF0000"/><path fill="#fff" d="M10 8.5l6 3.5-6 3.5z"/>`),
} as const;

/** Icona brandizzata del servizio noto dall'URL (Drive/Docs/Gmail/…) o null. */
export function serviceIconFor(url: string): string | null {
  let host = "";
  let path = "";
  try {
    const u = new URL(normalizeUrl(url));
    host = u.hostname.replace(/^www\./i, "").toLowerCase();
    path = u.pathname.toLowerCase();
  } catch {
    return null;
  }
  if (host === "drive.google.com") return SERVICE_ICONS.drive;
  if (host === "docs.google.com") {
    if (path.startsWith("/spreadsheets")) return SERVICE_ICONS.sheets;
    if (path.startsWith("/presentation")) return SERVICE_ICONS.slides;
    if (path.startsWith("/forms")) return SERVICE_ICONS.forms;
    return SERVICE_ICONS.docs;
  }
  if (host === "sheets.google.com") return SERVICE_ICONS.sheets;
  if (host === "slides.google.com") return SERVICE_ICONS.slides;
  if (host === "forms.google.com" || host === "forms.gle") return SERVICE_ICONS.forms;
  if (host === "mail.google.com") return SERVICE_ICONS.gmail;
  if (host === "calendar.google.com") return SERVICE_ICONS.calendar;
  if (host === "meet.google.com") return SERVICE_ICONS.meet;
  if (host === "maps.google.com" || host === "maps.app.goo.gl" || (host === "google.com" && path.startsWith("/maps"))) return SERVICE_ICONS.maps;
  if (host === "youtube.com" || host === "youtu.be" || host.endsWith(".youtube.com")) return SERVICE_ICONS.youtube;
  return null;
}

/**
 * URL della favicon: per i servizi noti (Drive/Docs/Gmail/…) usa l'icona brandizzata
 * ricavata dall'URL; altrimenti quella salvata sul link, in ultima istanza il servizio
 * favicon di Google. `favicon_url` è opzionale (accetta anche le tab del browser interno).
 */
export function faviconFor(link: { favicon_url?: string | null; url: string }): string {
  const service = serviceIconFor(link.url);
  if (service) return service;
  if (link.favicon_url) return link.favicon_url;
  return `https://www.google.com/s2/favicons?domain=${hostOf(link.url)}&sz=64`;
}

/**
 * Domini noti che bloccano l'incorporamento in iframe (X-Frame-Options / CSP
 * frame-ancestors). Per questi mostriamo una card pulita invece della pagina bianca
 * "connessione negata". Match per suffisso, così valgono anche i sottodomini.
 */
const EMBED_BLOCKED_DOMAINS = [
  "google.com", "google.it", "gmail.com", "youtube.com", "youtu.be",
  "facebook.com", "instagram.com", "linkedin.com", "x.com", "twitter.com",
  "canva.com", "siteground.com", "github.com", "notion.so", "dropbox.com",
  "microsoft.com", "office.com", "live.com", "outlook.com", "whatsapp.com",
  "amazon.com", "netflix.com", "paypal.com", "stripe.com", "figma.com",
  "trello.com", "atlassian.net", "slack.com", "zoom.us", "apple.com",
];

/**
 * Sottodomini che SI POSSONO incorporare anche se il dominio padre è bloccato:
 * es. gli editor Google (Docs/Sheets/Slides), i calendar/form incorporabili, gli embed
 * di YouTube. Ha la PRECEDENZA sulla blocklist.
 */
const EMBED_ALLOWED_HOSTS = [
  "docs.google.com", "sheets.google.com", "slides.google.com", "drive.google.com",
  "calendar.google.com", "forms.google.com", "google.com/maps", "maps.google.com",
  "lookerstudio.google.com", "datastudio.google.com", "sites.google.com",
  "youtube.com/embed", "youtube-nocookie.com",
];

/**
 * Converte un URL Google/YouTube nella sua forma INCORPORABILE (embed) quando esiste:
 * - YouTube watch/youtu.be → player embed;
 * - Google Maps → `output=embed`;
 * - Google Drive file → `/preview`.
 * Docs/Sheets/Slides/Calendar/Forms funzionano già con l'URL normale (se accessibili).
 */
export function toEmbedUrl(raw: string): string {
  const url = normalizeUrl(raw);
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();

    if (host === "youtube.com" || host === "youtu.be" || host.endsWith(".youtube.com")) {
      let id = "";
      if (host === "youtu.be") id = u.pathname.slice(1);
      else if (u.pathname.startsWith("/embed/")) id = u.pathname.split("/")[2] || "";
      else id = u.searchParams.get("v") || "";
      if (id) return `https://www.youtube-nocookie.com/embed/${id}`;
    }
    if (host === "google.com" && u.pathname.startsWith("/maps")) {
      u.searchParams.set("output", "embed");
      return u.toString();
    }
    if (host === "drive.google.com" && /\/file\/d\/[^/]+/.test(u.pathname)) {
      return url.replace(/\/(view|edit)(\?[^#]*)?(#.*)?$/, "/preview$2$3");
    }
    return url;
  } catch {
    return url;
  }
}

/** True se il sito PROBABILMENTE si può mostrare in un iframe. Allowlist > blocklist. */
export function isEmbeddableUrl(url: string): boolean {
  try {
    const u = new URL(normalizeUrl(url));
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    const hostPath = `${u.hostname.toLowerCase()}${u.pathname.toLowerCase()}`;
    if (EMBED_ALLOWED_HOSTS.some((d) => host === d || host.endsWith("." + d) || hostPath.startsWith(d))) {
      return true;
    }
    return !EMBED_BLOCKED_DOMAINS.some((d) => host === d || host.endsWith("." + d));
  } catch {
    return true;
  }
}
