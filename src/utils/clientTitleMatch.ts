import type { Client } from "../api/clients";

// ─────────────────────────────────────────────────────────────────────────────
// Match tra il titolo di una task e la ragione sociale / nome commerciale di un
// cliente. Serve a suggerire il collegamento del cliente quando non è impostato.
// Volutamente conservativo: preferiamo NON suggerire piuttosto che sbagliare.
// ─────────────────────────────────────────────────────────────────────────────

// Forme societarie e parole troppo generiche: non contano come "match" da sole
// e vengono ignorate quando confrontiamo i token del nome cliente.
const STOP_TOKENS = new Set([
  "srl", "srls", "spa", "snc", "sas", "sro", "ss", "sc", "scarl", "scpa",
  "coop", "cooperativa", "societa", "soc", "impresa", "ditta", "azienda",
  "di", "e", "the", "il", "lo", "la", "i", "gli", "le", "dei", "del", "della",
]);

// Descrittori di settore troppo comuni per essere, DA SOLI, un indizio affidabile
// (es. "WECOVER services" → distintivo è "wecover", non "services"). Restano validi
// se combaciano insieme ad altri token (es. "centro estetico" contiguo nel titolo).
const GENERIC_TOKENS = new Set([
  "services", "service", "servizi", "servizio", "solutions", "solution",
  "immobiliare", "immobiliari", "costruzioni", "edilizia", "edile", "impianti",
  "ristorante", "ristoro", "pizzeria", "trattoria", "osteria", "pasticceria",
  "gelateria", "hotel", "albergo", "residence", "camping", "bar", "caffe",
  "studio", "associazione", "culturale", "sportiva", "dilettantistica",
  "agricola", "agraria", "vitivinicola", "group", "gruppo", "design", "interior",
  "hair", "beauty", "estetica", "estetico", "estetista", "centro", "casa",
  "academy", "training", "coach", "consulting", "consulenza", "digital",
  "digitale", "communication", "comunicazione", "marketing", "food", "drink",
  "club", "team", "project", "progetto", "fashion", "moda", "wellness",
  "fitness", "medical", "medica", "clinica", "farmacia", "boutique", "shop",
  "store", "market", "officina", "garage", "motors", "auto", "trasporti",
  "logistica", "tech", "technology", "tecnologie", "energia", "energy",
  "green", "eco", "bio", "natura", "italia", "italiana", "italiano",
  "international", "management", "amministrazione", "risorse", "events",
  "weddings", "immobili", "srlu", "unipersonale", "semplificata",
]);

// Le ragioni sociali spesso contengono il nome del titolare ("… DI MARCO LUIGI")
// o un toponimo ("… delle Marche"): parole troppo comuni per suggerire un cliente
// DA SOLE. Restano valide dentro una coppia/sequenza (es. "Abruzzo Digitale").
const AMBIGUOUS_TOKENS = new Set([
  // nomi propri frequenti
  "luigi", "giuseppe", "giovanni", "antonio", "mario", "francesco", "paolo",
  "marco", "andrea", "stefano", "alessandro", "matteo", "lorenzo", "davide",
  "simone", "claudio", "roberto", "riccardo", "saverio", "aurora", "luca",
  "franco", "carlo", "angelo", "salvatore", "vincenzo", "domenico", "pietro",
  "sergio", "bruno", "dario", "fabio", "alberto", "enrico", "gabriele",
  "michele", "nicola", "gianni", "massimo", "maurizio", "daniele", "federico",
  "filippo", "tommaso", "cristian", "christian", "alfonso", "anthony", "gaetano",
  "maria", "anna", "giulia", "sara", "laura", "elena", "francesca", "chiara",
  "alessia", "martina", "valentina", "federica", "silvia", "stefania", "vera",
  "ottavia", "consuelo", "consolina", "vincenzo", "armando", "saverio",
  // toponimi (regioni / province / località ricorrenti)
  "abruzzo", "marche", "lazio", "umbria", "toscana", "puglia", "calabria",
  "sicilia", "sardegna", "lombardia", "veneto", "piemonte", "liguria",
  "campania", "molise", "teramo", "pescara", "chieti", "aquila", "giulianova",
  "roseto", "adriatica", "adriatico", "abruzzese",
]);

// Sigle/gergo ricorrenti nei TITOLI delle task: NON devono valere come acronimo
// del cliente (es. una task "PED agosto" non è il cliente con sigla "PED").
const SHORT_JARGON = new Set([
  "ped", "adv", "seo", "sem", "web", "app", "ads", "dem", "crm", "faq", "url",
  "cta", "kpi", "roi", "ui", "ux", "foto", "post", "reel", "story", "video",
  "logo", "menu", "test", "news", "team", "live", "home", "mail", "shop",
  "copy", "idee", "idea", "blog", "spot", "clip", "edit", "demo", "ig", "fb",
  "tt", "yt", "gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set",
  "ott", "nov", "dic", "landing", "brand", "grafica", "sito",
  "san", "santa", "santo", "santi", "sant", "via", "con", "per", "del", "dei",
]);

// Caselle di posta generiche: il "brand" ricavato dall'email non è affidabile
// se è una di queste (info@, amministrazione@, …).
const EMAIL_LOCAL_STOP = new Set([
  "info", "amministrazione", "commerciale", "contatti", "contact", "contacts",
  "admin", "ufficio", "segreteria", "direzione", "vendite", "marketing",
  "noreply", "mail", "posta", "staff", "hello", "ciao", "support", "assistenza",
  "help", "sales", "office", "azienda", "agenzia", "studio", "associazione",
  "amministrazione", "prenotazioni", "booking", "reception", "shop", "store",
]);

/** minuscolo, senza accenti, punteggiatura → spazi, spazi compattati. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  const norm = normalize(value);
  return norm ? norm.split(" ") : [];
}

/** Token "significativi" di un nome cliente (senza forme societarie/parole vuote). */
function significantTokens(tokens: string[]): string[] {
  return tokens.filter((t) => !STOP_TOKENS.has(t) && t.length >= 2);
}

/**
 * Token "brand" ricavati dalle email del cliente: parte prima della @, spezzata
 * sui separatori e ripulita delle cifre finali (es. "smashy9697@…" → "smashy").
 * Servono a intercettare il nome commerciale quando è salvato solo nell'email.
 */
function emailBrandTokens(email: string | null | undefined): string[] {
  if (!email) return [];
  const out: string[] = [];
  for (const part of email.split(/[,;\s]+/)) {
    const at = part.indexOf("@");
    if (at <= 0) continue;
    for (const chunk of part.slice(0, at).split(/[._+-]+/)) {
      const t = normalize(chunk).replace(/\d+$/, "");
      if (t) out.push(t);
    }
  }
  return out;
}

/** True se `needle` compare come sotto-sequenza CONTIGUA di token in `haystack`. */
function containsContiguous(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let i = 0; i + needle.length <= haystack.length; i++) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

/** True se una coppia adiacente di `needle` compare adiacente in `haystack`. */
function hasAdjacentPair(haystack: string[], needle: string[]): boolean {
  for (let i = 0; i + 1 < needle.length; i++) {
    for (let j = 0; j + 1 < haystack.length; j++) {
      if (haystack[j] === needle[i] && haystack[j + 1] === needle[i + 1]) return true;
    }
  }
  return false;
}

/** Un token è "distintivo" se lungo, non generico e non ambiguo → può bastare da solo. */
function isDistinctive(token: string): boolean {
  return token.length >= 5 && !GENERIC_TOKENS.has(token) && !AMBIGUOUS_TOKENS.has(token);
}

/**
 * Un token può valere come ACRONIMO del cliente (es. "LAS", "3DM", "ADR") se è
 * corto e "sigla-simile": 2-3 lettere, oppure 4 caratteri con una cifra (3dmx),
 * e non è gergo di titolo / descrittore / nome-toponimo comune.
 */
function isAcronymLike(token: string): boolean {
  const short = token.length <= 3 || (token.length === 4 && /\d/.test(token));
  return (
    token.length >= 2 &&
    short &&
    !SHORT_JARGON.has(token) &&
    !GENERIC_TOKENS.has(token) &&
    !AMBIGUOUS_TOKENS.has(token)
  );
}

export interface ClientTitleMatch {
  client: Client;
  /** Il testo che ha fatto match (ragione sociale o nome commerciale). */
  matchedLabel: string;
  /** Numero di token significativi combaciati (per il ranking). */
  score: number;
}

/**
 * Cerca nel titolo della task un cliente per ragione sociale o nome commerciale.
 * Un nome cliente combacia se, nel titolo, è presente ALMENO uno di:
 *  - la sequenza contigua di TUTTI i suoi token significativi (match pieno);
 *  - una coppia adiacente di token significativi (es. "val vomano");
 *  - un token "distintivo" (≥5 caratteri, non generico, es. "wecover", "atlantic").
 * Anti-falso-positivo:
 *  - si ignorano forme societarie / parole vuote (`significantTokens`);
 *  - i descrittori di settore (services, immobiliare, hotel…) non bastano da soli;
 *  - un nome a token singolo generico deve comunque essere presente per intero (≥4).
 * Ranking: più token presenti (per lunghezza) → poi bonus match pieno → testo più lungo.
 */
export function findClientMatchInTitle(
  title: string,
  clients: Client[]
): ClientTitleMatch | null {
  const titleTokens = tokenize(title);
  if (titleTokens.length === 0) return null;
  const titleSet = new Set(titleTokens);

  let best: ClientTitleMatch | null = null;

  for (const client of clients) {
    const candidates: string[] = [];
    if (client.name) candidates.push(client.name);
    if (client.commercial_name) candidates.push(client.commercial_name);

    for (const candidate of candidates) {
      const sig = significantTokens(tokenize(candidate));
      if (sig.length === 0) continue;

      const full = containsContiguous(titleTokens, sig);
      const distinctiveHit = sig.some((t) => isDistinctive(t) && titleSet.has(t));
      // Acronimo del cliente: affidabile solo se è la PRIMA parola del titolo
      // (es. "LAS / …", "3DM …") — i titoli qui iniziano col cliente.
      const acronymHit = isAcronymLike(sig[0]) && titleTokens[0] === sig[0];

      let matched: boolean;
      if (sig.length === 1) {
        // Nome a token singolo: distintivo presente, oppure token ≥4 (non ambiguo) presente.
        matched =
          distinctiveHit ||
          acronymHit ||
          (sig[0].length >= 4 && !AMBIGUOUS_TOKENS.has(sig[0]) && titleSet.has(sig[0]));
      } else {
        matched = full || distinctiveHit || acronymHit || hasAdjacentPair(titleTokens, sig);
      }
      if (!matched) continue;

      const present = sig.filter((t) => titleSet.has(t));
      const score =
        present.reduce((acc, t) => acc + t.length, present.length) + (full ? 5 : 0);
      if (
        !best ||
        score > best.score ||
        (score === best.score && candidate.length > best.matchedLabel.length)
      ) {
        best = { client, matchedLabel: candidate, score };
      }
    }

    // Fallback: brand ricavato dall'email (quando non è nella ragione sociale).
    const emailHit = emailBrandTokens(client.email).find(
      (t) => isDistinctive(t) && !EMAIL_LOCAL_STOP.has(t) && titleSet.has(t)
    );
    if (emailHit) {
      const label = client.commercial_name ?? client.name;
      const score = emailHit.length; // segnale più debole del nome
      if (!best || score > best.score) {
        best = { client, matchedLabel: label, score };
      }
    }
  }

  return best;
}
