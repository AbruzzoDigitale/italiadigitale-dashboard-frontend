import { authFetch, API_BASE } from "./auth";

// ─────────────────────────────────────────────────────────────────────────────
// Controlli tecnici: come è fatto un sito, non cosa ci scrive sopra.
// Banner cookie e consenso, pagine legali, protezione dei form, FAQ per SEO e
// GEO, peso di immagini e video.
//
// Il catalogo dei controlli vive nel backend (app/services/websites/controlli/),
// non qui: questo client lo legge e basta. Aggiungere un controllo non richiede
// alcuna modifica al frontend.
// Vedi app/api/v1/endpoints/website_audits.py.
// ─────────────────────────────────────────────────────────────────────────────

const BASE = `${API_BASE}/api/v1/website-controlli`;

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

/** Una voce del registro dei controlli disponibili. */
export interface ControlloCatalogo {
  id: string;
  nome: string;
  /** L'area del referto in cui finiscono i suoi rilievi. */
  area: string;
  descrizione: string;
}

/** Intestazione di un giro di controlli. */
export interface AuditScanSummary {
  id: number;
  website_id: number;
  started_at: string;
  finished_at: string | null;
  status: string;
  trigger: string;
  pages_found: number;
  pages_checked: number;
  critical_count: number;
  warning_count: number;
  info_count: number;
  /** 0-100. Nullo finché il giro non ha un esito. */
  score: number | null;
  message: string | null;
  /** Quali controlli ha eseguito QUESTO giro: un referto vecchio può non
   *  averli tutti, e «nessun rilievo» su un'area mai guardata non è «a posto». */
  checks: string[];
}

/** Un rilievo: cosa è stato guardato, cosa è uscito, cosa farne. */
export interface AuditFinding {
  id: number;
  url: string;
  check_id: string;
  code: string;
  severity: string;
  title: string;
  detail: string;
  reference: string;
  action: string;
  excerpt: string | null;
  /** Su quante pagine compare: un form senza protezione nel footer esce ovunque. */
  pages_count: number;
  /** Area del referto, già risolta dal backend. */
  area: string;
}

export interface AuditScanDetail extends AuditScanSummary {
  findings: AuditFinding[];
}

/**
 * Le tre categorie del referto.
 *
 * `info` qui NON significa quello che significa nella scansione decreti. Là è
 * «legittimo, non toccare»; qui è **«a posto»**: un controllo passato. Resta
 * nel referto perché dice all'operatore cosa non deve rifare, e perché un
 * documento fatto di soli problemi non si manda al cliente.
 */
export const SEVERITY_LABELS: Record<string, string> = {
  critical: "Da sistemare",
  warning: "Da valutare",
  info: "A posto",
};

export const SEVERITY_DESCRIPTIONS: Record<string, string> = {
  critical: "Violazione dimostrabile o difetto che costa posizionamento: si interviene.",
  warning: "Dipende da come lavora il cliente, o richiede una verifica a mano.",
  info: "Controllo passato: niente da fare.",
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

/** Stessa lettura del punteggio SEO del crawl, perché si legge nella stessa pagina. */
export function scoreBand(score: number | null): "good" | "warn" | "bad" | "none" {
  if (score === null || score === undefined) return "none";
  if (score >= 85) return "good";
  if (score >= 60) return "warn";
  return "bad";
}

export function scoreClass(score: number | null): string {
  const banda = scoreBand(score);
  if (banda === "good") return "text-emerald-600 border-emerald-500/30 bg-emerald-500/5 dark:text-emerald-400";
  if (banda === "warn") return "text-amber-600 border-amber-500/30 bg-amber-500/5 dark:text-amber-400";
  if (banda === "bad") return "text-danger border-danger/30 bg-danger/5";
  return "text-muted border-line bg-paper dark:text-[#9999a0] dark:border-[#2a2a2e] dark:bg-[#131316]";
}

/** Stati in cui un giro NON ha ancora un esito: i conteggi a zero non
 *  significano «nessun rilievo», significano «non lo sappiamo ancora». */
export const SCAN_STATUS_NOT_DONE = ["pending", "running"];

export function scanInCorso(status: string): boolean {
  return SCAN_STATUS_NOT_DONE.includes(status);
}

export const SCAN_STATUS_LABELS: Record<string, string> = {
  pending: "In coda",
  running: "In corso",
  completed: "Completati",
  partial: "Parziali",
  failed: "Falliti",
};

/** I controlli disponibili, nell'ordine in cui vanno mostrati. */
export async function listControlliApi(): Promise<ControlloCatalogo[]> {
  return jsonOrThrow(await authFetch(`${BASE}/catalogo`));
}

/**
 * Esegue i controlli su un sito. Sincrona: risponde a giro finito.
 * `checks` vuoto = tutti, ed è il caso normale.
 */
export async function runAuditScanApi(
  websiteId: number,
  checks: string[] = [],
  maxPages?: number
): Promise<AuditScanDetail> {
  return jsonOrThrow(
    await authFetch(
      `${BASE}/run`,
      jsonBody("POST", { website_id: websiteId, checks, max_pages: maxPages ?? null })
    )
  );
}

/** Lo storico dei giri di un sito, dal più recente. */
export async function listAuditScansApi(websiteId: number): Promise<AuditScanSummary[]> {
  const qs = new URLSearchParams({ website_id: String(websiteId) });
  return jsonOrThrow(await authFetch(`${BASE}?${qs.toString()}`));
}

/** Il referto di un giro: intestazione più rilievi, già ordinati per gravità. */
export async function getAuditScanApi(scanId: number): Promise<AuditScanDetail> {
  return jsonOrThrow(await authFetch(`${BASE}/${scanId}`));
}

// ── Coda ─────────────────────────────────────────────────────────────────────
// L'alternativa al bulk dal browser: la coda vive nel database, quindi
// ricaricare la pagina non la perde e da qualunque postazione si vede a che
// punto è arrivata.

export interface AuditQueueStatus {
  pending: number;
  running: number;
  oldest_queued_at: string | null;
  done: number;
}

/** Accoda il giro di più siti. `already` = quelli che erano già in coda. */
export async function queueAuditScansApi(
  websiteIds: number[],
  checks: string[] = []
): Promise<{ queued: number; already: number }> {
  return jsonOrThrow(
    await authFetch(`${BASE}/coda`, jsonBody("POST", { website_ids: websiteIds, checks }))
  );
}

/** Stato della coda visibile a chi chiede. Lo interroga il banner dell'elenco. */
export async function getAuditQueueApi(): Promise<AuditQueueStatus> {
  return jsonOrThrow(await authFetch(`${BASE}/coda`));
}
