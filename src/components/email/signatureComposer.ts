// ─────────────────────────────────────────────────────────────────────────────
// Composer firma email — schema a blocchi + generatore HTML email-safe.
// Il design (blocchi) è il nostro formato, salvato in `config`; il generatore
// produce HTML a tabelle con stili inline (Gmail/Outlook safe). I segnaposto
// {{...}} restano nell'HTML e vengono risolti dal backend (o in anteprima qui).
// ─────────────────────────────────────────────────────────────────────────────

export type ContactIcon = "phone" | "email" | "website" | "address" | "none";
export type SocialNetwork = "facebook" | "instagram" | "linkedin" | "tiktok" | "youtube";
export type Align = "left" | "center" | "right";

export interface FieldItem { id: string; content: string; href: string }

export type SigBlock =
  | { id: string; type: "text"; text: string; size: number; bold: boolean; color: string }
  | { id: string; type: "contact"; icon: ContactIcon; text: string; href: string }
  | { id: string; type: "fields"; icon: ContactIcon; separator: string; size: number; items: FieldItem[] }
  | { id: string; type: "social"; items: { network: SocialNetwork; url: string }[] }
  | { id: string; type: "image"; src: string; width: number; radius: number; align: Align }
  | { id: string; type: "spacer"; height: number }
  | { id: string; type: "divider" };

/** Separatori proposti per il blocco "Campi + separatore". */
export const SEPARATOR_PRESETS: { value: string; label: string }[] = [
  { value: " | ", label: "|" },
  { value: " • ", label: "•" },
  { value: " · ", label: "·" },
  { value: " – ", label: "– (trattino)" },
  { value: " / ", label: "/" },
  { value: ", ", label: ", (virgola)" },
];

export type SigBlockType = SigBlock["type"];

export interface SignatureDesign {
  version: 1;
  accent: string;        // colore sfondo icone
  contentWidth: number;  // px
  columns: "one" | "two";
  left: SigBlock[];
  right: SigBlock[];
}

export const ICON_URLS: Record<Exclude<ContactIcon, "none">, string> = {
  phone: "https://cdn2.hubspot.net/hubfs/53/tools/email-signature-generator/icons/phone-icon-2x.png",
  email: "https://cdn2.hubspot.net/hubfs/53/tools/email-signature-generator/icons/email-icon-2x.png",
  website: "https://cdn2.hubspot.net/hubfs/53/tools/email-signature-generator/icons/link-icon-2x.png",
  address: "https://cdn2.hubspot.net/hubfs/53/tools/email-signature-generator/icons/address-icon-2x.png",
};

export const SOCIAL_ICON_URLS: Record<SocialNetwork, string> = {
  facebook: "https://cdn2.hubspot.net/hubfs/53/tools/email-signature-generator/icons/facebook-icon-2x.png",
  linkedin: "https://cdn2.hubspot.net/hubfs/53/tools/email-signature-generator/icons/linkedin-icon-2x.png",
  instagram: "https://cdn2.hubspot.net/hubfs/53/tools/email-signature-generator/icons/instagram-icon-2x.png",
  tiktok: "https://abruzzodigitale.it/wp-content/uploads/2025/01/tiktok.png",
  youtube: "https://cdn2.hubspot.net/hubfs/53/tools/email-signature-generator/icons/youtube-icon-2x.png",
};

export const SOCIAL_LABELS: Record<SocialNetwork, string> = {
  facebook: "Facebook", instagram: "Instagram", linkedin: "LinkedIn", tiktok: "TikTok", youtube: "YouTube",
};

export const BLOCK_LABELS: Record<SigBlockType, string> = {
  text: "Testo", contact: "Riga contatto", fields: "Campi + separatore", social: "Social", image: "Immagine", spacer: "Spazio", divider: "Divisore",
};

let _idc = 0;
export function newId(): string {
  _idc += 1;
  return `b${_idc}_${Math.floor(_idc * 97 % 9999)}`;
}

export function newBlock(type: SigBlockType): SigBlock {
  switch (type) {
    case "text":
      return { id: newId(), type: "text", text: "Testo", size: 14, bold: false, color: "#000000" };
    case "contact":
      return { id: newId(), type: "contact", icon: "phone", text: "{{cellulare}}", href: "" };
    case "fields":
      return {
        id: newId(), type: "fields", icon: "none", separator: " | ", size: 14,
        items: [
          { id: newId(), content: "{{ruolo}}", href: "" },
          { id: newId(), content: "{{reparto}}", href: "" },
        ],
      };
    case "social":
      return {
        id: newId(), type: "social",
        items: [
          { network: "facebook", url: "{{azienda.facebook}}" },
          { network: "instagram", url: "{{azienda.instagram}}" },
          { network: "linkedin", url: "{{azienda.linkedin}}" },
        ],
      };
    case "image":
      return { id: newId(), type: "image", src: "https://via.placeholder.com/110x110.png?text=Foto", width: 110, radius: 8, align: "right" };
    case "spacer":
      return { id: newId(), type: "spacer", height: 10 };
    case "divider":
      return { id: newId(), type: "divider" };
  }
}

// ── Generatore HTML ──────────────────────────────────────────────────────────
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function renderBlock(b: SigBlock, accent: string): string {
  switch (b.type) {
    case "text": {
      const weight = b.bold ? "700" : "400";
      // Il testo può contenere {{token}} e <br>; consentiamo il br ma non altro markup.
      const safe = esc(b.text).replace(/\n/g, "<br>");
      return `<div style="font-size:${b.size}px;font-weight:${weight};color:${b.color};line-height:1.4;margin:0 0 2px;">${safe}</div>`;
    }
    case "contact": {
      const icon =
        b.icon !== "none"
          ? `<img src="${ICON_URLS[b.icon]}" width="13" style="display:inline-block;vertical-align:middle;background-color:${accent};width:13px;margin-right:6px;">`
          : "";
      const inner = b.href
        ? `<a href="${b.href}" style="text-decoration:none;color:#000000;">${esc(b.text)}</a>`
        : esc(b.text);
      return `<div style="font-size:12px;color:#000000;line-height:20px;white-space:nowrap;">${icon}${inner}</div>`;
    }
    case "fields": {
      const icon =
        b.icon !== "none"
          ? `<img src="${ICON_URLS[b.icon]}" width="13" style="display:inline-block;vertical-align:middle;background-color:${accent};width:13px;margin-right:6px;">`
          : "";
      // Ogni campo è un segmento marcato <!--fi:token-->…<!--/fi-->; il separatore
      // (url-encoded, hyphen-safe) è nel marcatore <!--fr:…-->. Il render (client
      // per l'anteprima, backend per l'invio) tiene solo i segmenti non vuoti e li
      // unisce col separatore, così nascondere un campo non lascia il "|" appeso.
      const segs = b.items
        .map((it) => {
          const content = esc(it.content);
          const inner = it.href
            ? `<a href="${it.href}" style="text-decoration:none;color:#000000;">${content}</a>`
            : content;
          return `<!--fi:${detectTokens(inner).join(",")}-->${inner}<!--/fi-->`;
        })
        .join("");
      const sep = encodeURIComponent(b.separator).replace(/-/g, "%2D");
      const size = b.size || 14; // blocchi salvati prima dell'aggiunta di `size`
      return `<div style="font-size:${size}px;color:#000000;line-height:1.5;white-space:nowrap;">${icon}<!--fr:${sep}-->${segs}<!--/fr--></div>`;
    }
    case "social": {
      const cells = b.items
        .filter((it) => it.url)
        .map(
          (it) =>
            `<td style="padding-right:5px;"><a href="${it.url}"><img src="${SOCIAL_ICON_URLS[it.network]}" width="24" style="background-color:${accent};width:24px;display:block;border-radius:${it.network === "tiktok" ? "50%" : "0"};"></a></td>`
        )
        .join("");
      return `<table cellpadding="0" cellspacing="0" style="margin-top:8px;"><tbody><tr>${cells}</tr></tbody></table>`;
    }
    case "image": {
      const m = b.align === "center" ? "0 auto" : b.align === "right" ? "0 0 0 auto" : "0";
      return `<img src="${b.src}" width="${b.width}" style="display:block;width:${b.width}px;border-radius:${b.radius}px;margin:${m};">`;
    }
    case "spacer":
      return `<div style="height:${b.height}px;line-height:${b.height}px;font-size:1px;">&nbsp;</div>`;
    case "divider":
      return `<div style="border-top:1px solid #e0e0e0;margin:8px 0;font-size:1px;line-height:1px;">&nbsp;</div>`;
  }
}

/**
 * Ogni blocco viene marcato con i segnaposto PERSONALI che usa:
 *   <!--b:foto-->…<!--/b-->
 * Il render lato server rimuove il blocco se tutti i suoi campi sono nascosti
 * dall'utente, poi elimina i marcatori. I blocchi senza campi personali (es. dati
 * azienda) non sono mai rimossi.
 */
function wrapBlock(b: SigBlock, accent: string): string {
  const inner = renderBlock(b, accent);
  const toks = detectTokens(inner); // esclude gli azienda.*
  return `<!--b:${toks.join(",")}-->${inner}<!--/b-->`;
}

function renderColumn(blocks: SigBlock[], accent: string): string {
  return blocks.map((b) => wrapBlock(b, accent)).join("\n");
}

export function generateHtml(d: SignatureDesign): string {
  const accent = d.accent || "#eb2f5b";
  const width = d.contentWidth || 560;
  const left = renderColumn(d.left, accent);

  if (d.columns === "one" || d.right.length === 0) {
    return `<table cellpadding="0" cellspacing="0" style="background-color:#ffffff;font-family:Tahoma,Arial,sans-serif;max-width:${width}px;">
<tbody><tr><td style="vertical-align:top;">
${left}
</td></tr></tbody></table>`;
  }

  const right = renderColumn(d.right, accent);
  return `<table cellpadding="0" cellspacing="0" style="background-color:#ffffff;font-family:Tahoma,Arial,sans-serif;max-width:${width}px;">
<tbody><tr>
<td style="vertical-align:top;">
${left}
</td>
<td width="20" style="width:20px;"></td>
<td style="vertical-align:middle;text-align:right;">
${right}
</td>
</tr></tbody></table>`;
}

// ── Token azienda (per l'anteprima lato client) ──────────────────────────────
export interface CompanyBrandLike {
  name?: string | null;
  website?: string | null;
  contact_email?: string | null;
  phone?: string | null;
  address?: string | null;
  address_maps_url?: string | null;
  signature_logo_url?: string | null;
  logo_horizontal_dark?: string | null;
  facebook_url?: string | null;
  instagram_url?: string | null;
  linkedin_url?: string | null;
  tiktok_url?: string | null;
  youtube_url?: string | null;
}

export function companyTokenMap(c: CompanyBrandLike): Record<string, string> {
  return {
    "azienda.nome": c.name ?? "",
    "azienda.sito": c.website ?? "",
    "azienda.email": c.contact_email ?? "",
    "azienda.telefono": c.phone ?? "",
    "azienda.indirizzo": c.address ?? "",
    "azienda.maps": c.address_maps_url ?? "",
    "azienda.logo": c.signature_logo_url || c.logo_horizontal_dark || "",
    "azienda.facebook": c.facebook_url ?? "",
    "azienda.instagram": c.instagram_url ?? "",
    "azienda.linkedin": c.linkedin_url ?? "",
    "azienda.tiktok": c.tiktok_url ?? "",
    "azienda.youtube": c.youtube_url ?? "",
  };
}

/** Anteprima client-side: sostituisce i token con i valori dati (campi + azienda). */
export function resolveTokens(html: string, values: Record<string, string>): string {
  return html.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (m, key) => (key in values ? values[key] ?? "" : m));
}

// ── Blocco "Campi + separatore": join intelligente (mirror del backend) ───────
const FR_RE = /<!--fr:([^>]*?)-->([\s\S]*?)<!--\/fr-->/g;
const FI_RE = /<!--fi:([^>]*?)-->([\s\S]*?)<!--\/fi-->/g;

function segmentPresent(inner: string, hidden: Set<string>, values: Record<string, string>): boolean {
  const resolved = inner.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_m, k: string) =>
    hidden.has(k) ? "" : values[k] ?? "",
  );
  return resolved.replace(/<[^>]*>/g, "").trim().length > 0;
}

/** Tiene solo i segmenti campo non vuoti/non nascosti e li unisce col separatore. */
export function applyFieldRows(html: string, hidden: string[], values: Record<string, string>): string {
  const hset = new Set(hidden);
  return html.replace(FR_RE, (_m, sepEnc: string, body: string) => {
    const sep = decodeURIComponent(sepEnc);
    const kept: string[] = [];
    let m: RegExpExecArray | null;
    FI_RE.lastIndex = 0;
    while ((m = FI_RE.exec(body)) !== null) {
      if (segmentPresent(m[2], hset, values)) kept.push(m[2]);
    }
    return kept.join(esc(sep));
  });
}

const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;
export function detectTokens(html: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(html)) !== null) {
    if (m[1].startsWith("azienda.")) continue;
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}
