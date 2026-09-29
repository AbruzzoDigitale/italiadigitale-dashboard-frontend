import { authFetch, API_BASE } from "./auth";

// ─────────────────────────────────────────────────────────────────────────────
// Scansione decreti: verifica di conformità normativa dei siti dei clienti.
// Il catalogo dei decreti vive nel backend (app/services/websites/decreti/),
// non qui: questo client lo legge e basta. Aggiungere un decreto non richiede
// alcuna modifica al frontend.
// Vedi app/api/v1/endpoints/website_decrees.py.
// ─────────────────────────────────────────────────────────────────────────────

const BASE = `${API_BASE}/api/v1/website-decreti`;

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string })?.detail ?? "Errore imprevisto");
  }
  return res.json() as Promise<T>;
}

function jsonBody(method: string, body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

/** Una voce del registro dei decreti analizzabili. */
export interface DecretoCatalogo {
  id: string;
  nome: string;
  riferimento: string;
  /** Da quando la norma è applicabile (ISO). */
  applicabile_da: string;
  descrizione: string;
}

/** Intestazione di un giro di scansione. */
export interface DecreeScanSummary {
  id: number;
  website_id: number;
  decree_id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  trigger: string;
  pages_found: number;
  pages_checked: number;
  critical_count: number;
  warning_count: number;
  info_count: number;
  message: string | null;
  decree_nome: string;
}

/** Un rilievo: una pagina, una norma, cosa farne. */
export interface DecreeFinding {
  id: number;
  url: string;
  code: string;
  severity: string;
  title: string;
  detail: string;
  reference: string;
  action: string;
  excerpt: string | null;
  /** Su quante pagine compare identico: un bollino nel footer esce ovunque. */
  pages_count: number;
}

export interface DecreeScanDetail extends DecreeScanSummary {
  findings: DecreeFinding[];
}

/**
 * Le tre categorie del triage. `info` NON è un problema minore: è
 * «legittimo, non toccare» — di solito una certificazione riconosciuta o un
 * termine protetto da normativa settoriale. È la categoria che impedisce di
 * far cancellare al cliente una qualifica che ha pagato per ottenere.
 */
export const SEVERITY_LABELS: Record<string, string> = {
  critical: "Da rimuovere",
  warning: "Da verificare",
  info: "Legittimo",
};

export const SEVERITY_DESCRIPTIONS: Record<string, string> = {
  critical: "Vietato di per sé: si rimuove senza dover chiedere nulla al cliente.",
  warning: "Dipende da cosa il cliente ha in mano: va verificato prima di toccare.",
  info: "Coperto da certificazione o da normativa settoriale: non va rimosso.",
};

export function severityClass(severity: string): string {
  if (severity === "critical") return "text-danger border-danger/30 bg-danger/5";
  if (severity === "warning") return "text-amber-600 border-amber-500/30 bg-amber-500/5 dark:text-amber-400";
  return "text-emerald-600 border-emerald-500/30 bg-emerald-500/5 dark:text-emerald-400";
}

export function severityIcon(severity: string): "alert-triangle" | "information-circle" | "check-circle" {
  if (severity === "critical") return "alert-triangle";
  if (severity === "warning") return "information-circle";
  return "check-circle";
}

export const SCAN_STATUS_LABELS: Record<string, string> = {
  running: "In corso",
  completed: "Completata",
  partial: "Parziale",
  failed: "Fallita",
};

/** I decreti già applicabili, nell'ordine in cui vanno mostrati. */
export async function listDecretiApi(): Promise<DecretoCatalogo[]> {
  return jsonOrThrow(await authFetch(`${BASE}/catalogo`));
}

/**
 * Scansiona un sito con un decreto. Sincrona: risponde a giro finito.
 * Il bulk lo fa il chiamante, un sito per volta, come per «Analizza ora».
 */
export async function runDecreeScanApi(
  websiteId: number,
  decreeId: string,
  maxPages?: number
): Promise<DecreeScanDetail> {
  return jsonOrThrow(
    await authFetch(
      `${BASE}/run`,
      jsonBody("POST", { website_id: websiteId, decree_id: decreeId, max_pages: maxPages ?? null })
    )
  );
}

/** Lo storico dei giri di un sito, dal più recente. */
export async function listDecreeScansApi(
  websiteId: number,
  decreeId?: string
): Promise<DecreeScanSummary[]> {
  const qs = new URLSearchParams({ website_id: String(websiteId) });
  if (decreeId) qs.set("decree_id", decreeId);
  return jsonOrThrow(await authFetch(`${BASE}?${qs.toString()}`));
}

/** Il referto di un giro: intestazione più rilievi, già ordinati per gravità. */
export async function getDecreeScanApi(scanId: number): Promise<DecreeScanDetail> {
  return jsonOrThrow(await authFetch(`${BASE}/${scanId}`));
}
