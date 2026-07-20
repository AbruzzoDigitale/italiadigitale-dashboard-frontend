import { authFetch, API_BASE } from "./auth";

// ─────────────────────────────────────────────────────────────────────────────
// Riconciliazione con Fatture in Cloud (area admin).
//   incassi   = ciclo attivo  (fatture emesse -> registro l'incasso)
//   pagamenti = ciclo passivo (spese -> abbino ai movimenti bancari e registro)
// Flusso: upload Excel -> anteprima (dry-run) -> conferma. Vedi
// app/api/v1/endpoints/fic_reconcile.py sul backend.
// ─────────────────────────────────────────────────────────────────────────────

const BASE = `${API_BASE}/api/v1/fic/reconcile`;

export type ReconcileTipo = "incassi" | "pagamenti";
export type LineEsito = "da_registrare" | "ok" | "skip" | "errore";
/** Confidenza dell'abbinamento: certo (verde), incerto (giallo), nessuno (rosso). */
export type Confidenza = "certo" | "incerto" | "nessuno";
export type RunState = "anteprima" | "registrato";

export interface PaymentAccount {
  id: number;
  name: string;
}

export interface ReconcileLine {
  id: number;
  tipo: ReconcileTipo;
  numero_fattura: number | null;
  importo: number | null;
  data_movimento: string | null; // "YYYY-MM-DD"
  beneficiario: string | null;
  descrizione: string | null;
  /** Scadenza della prima rata non pagata (YYYY-MM-DD). */
  scadenza: string | null;
  /** Giorni di ritardo se scaduta (>0), altrimenti null. */
  giorni_ritardo: number | null;
  /** Residuo aperto della fattura (somma rate non pagate, al netto note di credito). */
  importo_dovuto: number | null;
  /** Il bonifico abbinato copre solo una rata/acconto: la fattura resta aperta. */
  is_acconto: boolean;
  fic_document_id: number | null;
  fic_document_url: string | null;
  esito: LineEsito;
  confidenza: Confidenza | null;
  match_reason: string | null;
  messaggio: string | null;
  errore: string | null;
  raw_json: Record<string, unknown> | null;
  registered_at: string | null;
}

/** Stato di un bonifico persistito: da abbinare, abbinato, o ignorato. */
export type MovementStato = "libero" | "usato" | "ignorato";

export interface ReconcileMovement {
  id: number;
  importo: number | null;
  data: string | null; // "YYYY-MM-DD"
  pagante: string | null;
  causale: string | null;
  nfatture: number[];
  stato: MovementStato;
  assigned_line_id: number | null;
}

export interface ReconcileRun {
  id: number;
  tipo: ReconcileTipo;
  file_name: string | null;
  payment_account_id: number | null;
  payment_account_name: string | null;
  dry_run: boolean;
  state: RunState;
  righe_totali: number;
  righe_ok: number;
  righe_ko: number;
  user_id: number | null;
  created_at: string | null;
  lines?: ReconcileLine[];
  movements?: ReconcileMovement[];
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string })?.detail ?? "Errore imprevisto");
  }
  return res.json() as Promise<T>;
}

export async function listPaymentAccountsApi(): Promise<{
  fic_company_id: number;
  accounts: PaymentAccount[];
}> {
  const res = await authFetch(`${BASE}/payment-accounts`);
  return jsonOrThrow(res);
}

/** Upload dell'Excel. dry_run=true => solo anteprima (nessuna scrittura su FIC). */
export async function uploadReconciliationApi(params: {
  tipo: ReconcileTipo;
  file: File;
  paymentAccountId: number;
  dryRun: boolean;
  anno?: number;
}): Promise<ReconcileRun> {
  const fd = new FormData();
  fd.append("file", params.file);
  fd.append("payment_account_id", String(params.paymentAccountId));
  fd.append("dry_run", String(params.dryRun));
  if (params.anno) fd.append("anno", String(params.anno));

  // FormData: NON impostare Content-Type manualmente (il browser aggiunge il boundary).
  const token = localStorage.getItem("id_token");
  const res = await fetch(`${BASE}/${params.tipo}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  return jsonOrThrow(res);
}

/** Conferma e registra su FIC. Se `lineIds` è passato, registra solo quelle righe. */
export async function confirmRunApi(runId: number, lineIds?: number[]): Promise<ReconcileRun> {
  const res = await authFetch(`${BASE}/runs/${runId}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(lineIds && lineIds.length ? { line_ids: lineIds } : {}),
  });
  return jsonOrThrow(res);
}

export async function retryRunApi(runId: number): Promise<ReconcileRun> {
  const res = await authFetch(`${BASE}/runs/${runId}/retry`, { method: "POST" });
  return jsonOrThrow(res);
}

export async function listRunsApi(tipo?: ReconcileTipo): Promise<{ runs: ReconcileRun[] }> {
  const suffix = tipo ? `?tipo=${tipo}` : "";
  const res = await authFetch(`${BASE}/runs${suffix}`);
  return jsonOrThrow(res);
}

export async function getRunApi(runId: number): Promise<ReconcileRun> {
  const res = await authFetch(`${BASE}/runs/${runId}`);
  return jsonOrThrow(res);
}

/** Assegna manualmente un bonifico a una fattura (riga). */
export async function assignMovementApi(
  runId: number,
  movementId: number,
  lineId: number,
): Promise<ReconcileRun> {
  const res = await authFetch(`${BASE}/runs/${runId}/movements/${movementId}/assign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ line_id: lineId }),
  });
  return jsonOrThrow(res);
}

/** Annulla l'abbinamento di una riga: il bonifico torna disponibile. */
export async function unassignLineApi(runId: number, lineId: number): Promise<ReconcileRun> {
  const res = await authFetch(`${BASE}/runs/${runId}/lines/${lineId}/unassign`, { method: "POST" });
  return jsonOrThrow(res);
}

/** Marca un bonifico come non pertinente (giroconto, rimborso, ecc.). */
export async function ignoreMovementApi(runId: number, movementId: number): Promise<ReconcileRun> {
  const res = await authFetch(`${BASE}/runs/${runId}/movements/${movementId}/ignore`, { method: "POST" });
  return jsonOrThrow(res);
}

/** Ripristina un bonifico ignorato tra quelli da abbinare. */
export async function restoreMovementApi(runId: number, movementId: number): Promise<ReconcileRun> {
  const res = await authFetch(`${BASE}/runs/${runId}/movements/${movementId}/restore`, { method: "POST" });
  return jsonOrThrow(res);
}
