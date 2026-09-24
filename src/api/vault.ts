import { authFetch, API_BASE } from "./auth";

// ─────────────────────────────────────────────────────────────────────────────
// Cassaforte credenziali: sostituisce il passaggio di password via Google
// Password, email in chiaro e chat.
//
// I valori cifrati non escono mai dall'elenco: si sa solo se ci sono. Per
// leggerli serve sbloccare con la propria password, che rilascia un token a
// vita breve tenuto SOLO in memoria — niente localStorage, così chiudere il
// tab richiude la cassaforte.
//
// Vedi app/api/v1/endpoints/vault.py e VAULT_DESIGN.md.
// ─────────────────────────────────────────────────────────────────────────────

const BASE = `${API_BASE}/api/v1/vault`;

export type VaultKind =
  | "password"
  | "ssh"
  | "ftp"
  | "wordpress"
  | "database"
  | "hosting"
  | "dns"
  | "api_key"
  | "social"
  | "app"
  | "other";

export const VAULT_KIND_LABELS: Record<VaultKind, string> = {
  password: "Password",
  ssh: "SSH",
  ftp: "FTP / SFTP",
  wordpress: "WordPress",
  database: "Database",
  hosting: "Pannello hosting",
  dns: "DNS / registrar",
  api_key: "Chiave API",
  social: "Social",
  app: "App / software",
  other: "Altro",
};

/** Campi che hanno senso per tipo: il resto resta nascosto nel form. */
export const VAULT_KIND_FIELDS: Record<
  VaultKind,
  Array<"host" | "port" | "username" | "email" | "url" | "path" | "private_key" | "totp">
> = {
  password: ["url", "username", "email"],
  ssh: ["host", "port", "username", "path", "private_key"],
  ftp: ["host", "port", "username", "path"],
  wordpress: ["url", "username", "email"],
  database: ["host", "port", "username", "path"],
  hosting: ["url", "username", "email"],
  dns: ["url", "username", "email"],
  api_key: ["url"],
  social: ["url", "username", "email", "totp"],
  app: ["url", "username", "email", "totp"],
  other: ["url", "username", "email"],
};

export type VaultTargetType =
  | "client"
  | "website"
  | "social_profile"
  | "user"
  | "contract";

export const VAULT_TARGET_LABELS: Record<VaultTargetType, string> = {
  client: "Cliente",
  website: "Sito",
  social_profile: "Profilo social",
  user: "Utente",
  contract: "Contratto",
};

export interface VaultLink {
  target_type: VaultTargetType;
  target_id: number;
  /** Nome risolto dal backend: evita una chiamata per ogni collegamento. */
  target_label: string | null;
  /** Cliente di appartenenza di siti, profili e contratti. */
  client_id: number | null;
  client_name: string | null;
  platform: string | null;
}

export interface VaultGrant {
  user_id: number;
  permission: "view" | "manage";
  user_name: string | null;
  /** Chi ha condiviso: una credenziale che compare senza spiegazione inquieta. */
  granted_by_user_id: number | null;
  granted_by_name: string | null;
  created_at: string | null;
}

export interface VaultItem {
  id: number;
  company_id: number;
  kind: VaultKind;
  label: string;
  username: string | null;
  email: string | null;
  url: string | null;
  host: string | null;
  port: number | null;
  path: string | null;
  note: string | null;
  is_active: boolean;
  owner_user_id: number | null;
  owner_name: string | null;
  has_secret: boolean;
  has_totp: boolean;
  has_private_key: boolean;
  rotation_days: number | null;
  last_rotated_at: string | null;
  next_rotation_at: string | null;
  rotation_due: boolean;
  can_manage: boolean;
  links: VaultLink[];
  grants: VaultGrant[];
  sort_order: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface VaultItemInput {
  company_id: number;
  kind: VaultKind;
  label: string;
  username?: string | null;
  email?: string | null;
  url?: string | null;
  host?: string | null;
  port?: number | null;
  path?: string | null;
  note?: string | null;
  rotation_days?: number | null;
  secret?: string | null;
  totp?: string | null;
  private_key?: string | null;
  owner_user_id?: number | null;
  links?: Array<{ target_type: VaultTargetType; target_id: number }>;
  grants?: Array<{ user_id: number; permission: "view" | "manage" }>;
}

export interface VaultRevealed {
  id: number;
  secret: string | null;
  totp: string | null;
  private_key: string | null;
}

export interface VaultStatus {
  available: boolean;
  can_create: boolean;
  kinds: VaultKind[];
  target_types: VaultTargetType[];
  kms_enabled: boolean;
}

/** Allineato a VAULT_ACTIONS in app/models/vault.py: quella è la fonte unica. */
export type VaultAction =
  | "reveal"
  | "copy"
  | "export"
  | "share_created"
  | "share_viewed"
  | "share_denied"
  | "rotated"
  | "request_created"
  | "request_submitted";

export const VAULT_ACTION_LABELS: Record<VaultAction, string> = {
  reveal: "Rivelata",
  copy: "Copiata",
  export: "Esportata",
  share_created: "Link creato",
  share_viewed: "Link aperto",
  share_denied: "Password del link errata",
  rotated: "Rinnovata",
  request_created: "Richiesta inviata",
  request_submitted: "Richiesta compilata",
};

export interface VaultAccess {
  id: number;
  item_id: number | null;
  item_label: string;
  user_id: number | null;
  user_name: string | null;
  share_id: number | null;
  action: VaultAction;
  ip: string | null;
  created_at: string;
}

export interface VaultPolicy {
  rotation_days: number;
  rotation_warn_days: number;
  share_max_days: number;
  share_require_password: boolean;
  unlock_ttl_minutes: number;
}

/** Sollevato quando la cassaforte è bloccata o lo sblocco è scaduto (428). */
export class VaultLockedError extends Error {
  constructor(message = "Cassaforte bloccata") {
    super(message);
    this.name = "VaultLockedError";
  }
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = (body as { detail?: string })?.detail ?? "Errore imprevisto";
    if (res.status === 428) throw new VaultLockedError(detail);
    throw new Error(detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ── Token di sblocco: solo in memoria, mai persistito ────────────────────────

let vaultToken: string | null = null;
let vaultExpiresAt = 0;

export function vaultRemainingMs(): number {
  return Math.max(0, vaultExpiresAt - Date.now());
}

export function isVaultUnlocked(): boolean {
  return vaultRemainingMs() > 0 && !!vaultToken;
}

export function lockVault(): void {
  vaultToken = null;
  vaultExpiresAt = 0;
}

export async function unlockVaultApi(password: string): Promise<number> {
  const res = await authFetch(`${BASE}/unlock`, {
    method: "POST",
    body: JSON.stringify({ password }),
  });
  const data = await jsonOrThrow<{
    token: string;
    expires_at: string;
    valid_minutes: number;
  }>(res);
  vaultToken = data.token;
  vaultExpiresAt = new Date(data.expires_at).getTime();
  return data.valid_minutes;
}

function unlockedHeaders(): Record<string, string> {
  if (!vaultToken) throw new VaultLockedError();
  return { "X-Vault-Token": vaultToken };
}

// ── Chiamate ────────────────────────────────────────────────────────────────

export async function vaultStatusApi(): Promise<VaultStatus> {
  return jsonOrThrow(await authFetch(`${BASE}/status`));
}

export interface VaultListFilters {
  companyId?: number;
  kind?: VaultKind;
  targetType?: VaultTargetType;
  targetId?: number;
  q?: string;
  needsRotation?: boolean;
}

export async function listVaultItemsApi(f: VaultListFilters = {}): Promise<VaultItem[]> {
  const p = new URLSearchParams();
  if (f.companyId != null) p.set("company_id", String(f.companyId));
  if (f.kind) p.set("kind", f.kind);
  if (f.targetType) p.set("target_type", f.targetType);
  if (f.targetId != null) p.set("target_id", String(f.targetId));
  if (f.q) p.set("q", f.q);
  if (f.needsRotation) p.set("needs_rotation", "true");
  const qs = p.toString();
  return jsonOrThrow(await authFetch(`${BASE}/items${qs ? `?${qs}` : ""}`));
}

export async function getVaultItemApi(id: number): Promise<VaultItem> {
  return jsonOrThrow(await authFetch(`${BASE}/items/${id}`));
}

export async function createVaultItemApi(body: VaultItemInput): Promise<VaultItem> {
  return jsonOrThrow(
    await authFetch(`${BASE}/items`, { method: "POST", body: JSON.stringify(body) })
  );
}

export async function updateVaultItemApi(
  id: number,
  body: Partial<VaultItemInput>
): Promise<VaultItem> {
  return jsonOrThrow(
    await authFetch(`${BASE}/items/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    })
  );
}

export async function deleteVaultItemApi(id: number): Promise<void> {
  await jsonOrThrow<void>(await authFetch(`${BASE}/items/${id}`, { method: "DELETE" }));
}

/** Richiede la cassaforte sbloccata. Ogni chiamata finisce nel registro accessi. */
export async function revealVaultItemApi(id: number): Promise<VaultRevealed> {
  return jsonOrThrow(
    await authFetch(`${BASE}/items/${id}/reveal`, {
      method: "POST",
      headers: unlockedHeaders(),
    })
  );
}

export async function rotateVaultItemApi(
  id: number,
  body: { secret?: string | null; totp?: string | null; private_key?: string | null }
): Promise<VaultItem> {
  return jsonOrThrow(
    await authFetch(`${BASE}/items/${id}/rotate`, {
      method: "POST",
      headers: unlockedHeaders(),
      body: JSON.stringify(body),
    })
  );
}

export async function setVaultLinksApi(
  id: number,
  links: Array<{ target_type: VaultTargetType; target_id: number }>
): Promise<VaultItem> {
  return jsonOrThrow(
    await authFetch(`${BASE}/items/${id}/links`, {
      method: "PUT",
      body: JSON.stringify(links),
    })
  );
}

export async function setVaultGrantsApi(
  id: number,
  grants: Array<{ user_id: number; permission: "view" | "manage" }>
): Promise<VaultItem> {
  return jsonOrThrow(
    await authFetch(`${BASE}/items/${id}/grants`, {
      method: "PUT",
      body: JSON.stringify(grants),
    })
  );
}

export async function listVaultAccessesApi(filtri?: {
  itemId?: number;
  companyId?: number;
  action?: VaultAction;
  /** Ultimi N giorni. Assente = tutto lo storico. */
  days?: number;
  limit?: number;
}): Promise<VaultAccess[]> {
  const p = new URLSearchParams();
  if (filtri?.itemId != null) p.set("item_id", String(filtri.itemId));
  if (filtri?.companyId != null) p.set("company_id", String(filtri.companyId));
  if (filtri?.action) p.set("action", filtri.action);
  if (filtri?.days != null) p.set("days", String(filtri.days));
  if (filtri?.limit != null) p.set("limit", String(filtri.limit));
  const qs = p.toString();
  return jsonOrThrow(await authFetch(`${BASE}/accesses${qs ? `?${qs}` : ""}`));
}

export async function getVaultPolicyApi(companyId: number): Promise<VaultPolicy> {
  return jsonOrThrow(await authFetch(`${BASE}/policy?company_id=${companyId}`));
}

export async function updateVaultPolicyApi(
  companyId: number,
  body: Partial<VaultPolicy>
): Promise<VaultPolicy> {
  return jsonOrThrow(
    await authFetch(`${BASE}/policy?company_id=${companyId}`, {
      method: "PUT",
      body: JSON.stringify(body),
    })
  );
}

// ── Import da gestore esterno ───────────────────────────────────────────────

export interface VaultImportRow {
  label: string;
  url?: string | null;
  username?: string | null;
  email?: string | null;
  secret?: string | null;
  note?: string | null;
}

export interface VaultImportResult {
  created: number;
  skipped: number;
  errors: string[];
}

/**
 * Importa voci gia' strutturate. Il CSV NON viene caricato sul server: lo parsa
 * il browser e manda queste righe, cosi' un file con tutte le password dentro
 * non finisce in un body multipart che potrebbe essere loggato.
 */
export async function importVaultItemsApi(body: {
  company_id: number;
  rows: VaultImportRow[];
  kind?: VaultKind;
  skip_duplicates?: boolean;
  links?: Array<{ target_type: VaultTargetType; target_id: number }>;
}): Promise<VaultImportResult> {
  return jsonOrThrow(
    await authFetch(`${BASE}/import`, { method: "POST", body: JSON.stringify(body) })
  );
}

// ── Richiesta di credenziale a un esterno ───────────────────────────────────
//
// L'opposto della condivisione: non consegna un segreto, lo raccoglie. Serve a
// togliere di mezzo il "mandami la password su WhatsApp".

export interface VaultRequest {
  id: number;
  company_id: number;
  item_id: number | null;
  kind: VaultKind;
  label: string;
  username: string | null;
  email: string | null;
  url: string | null;
  recipient_note: string | null;
  message: string | null;
  status: "pending" | "submitted" | "cancelled" | "expired";
  has_password: boolean;
  expires_at: string;
  opened_at: string | null;
  used_at: string | null;
  created_by_name: string | null;
  created_at: string;
  /** Presente solo alla creazione: è il link da inviare. */
  url_pubblico: string | null;
}

export interface VaultRequestInput {
  company_id: number;
  item_id?: number | null;
  kind?: VaultKind;
  label: string;
  username?: string | null;
  email?: string | null;
  url?: string | null;
  host?: string | null;
  port?: number | null;
  path?: string | null;
  note?: string | null;
  message?: string | null;
  recipient_note?: string | null;
  access_password?: string | null;
  expires_days?: number | null;
}

export async function createVaultRequestApi(body: VaultRequestInput): Promise<VaultRequest> {
  return jsonOrThrow(
    await authFetch(`${BASE}/requests`, { method: "POST", body: JSON.stringify(body) })
  );
}

export async function listVaultRequestsApi(companyId?: number): Promise<VaultRequest[]> {
  const qs = companyId != null ? `?company_id=${companyId}` : "";
  return jsonOrThrow(await authFetch(`${BASE}/requests${qs}`));
}

export async function cancelVaultRequestApi(id: number): Promise<void> {
  await jsonOrThrow<void>(await authFetch(`${BASE}/requests/${id}`, { method: "DELETE" }));
}

// ── Lato pubblico: nessuna autenticazione, `fetch` nudo di proposito ────────

export interface VaultPublicRequest {
  label: string;
  kind: VaultKind;
  username: string | null;
  email: string | null;
  url: string | null;
  host: string | null;
  port: number | null;
  path: string | null;
  note: string | null;
  message: string | null;
  azienda: string | null;
  requires_password: boolean;
  needs_secret: boolean;
  needs_private_key: boolean;
}

export async function getPublicRequestApi(token: string): Promise<VaultPublicRequest> {
  return jsonOrThrow(await fetch(`${BASE}/public/request/${encodeURIComponent(token)}`));
}

export async function submitPublicRequestApi(
  token: string,
  body: {
    access_password?: string | null;
    secret?: string | null;
    private_key?: string | null;
    totp?: string | null;
    username?: string | null;
    email?: string | null;
    url?: string | null;
  }
): Promise<void> {
  await jsonOrThrow<void>(
    await fetch(`${BASE}/public/request/${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

// ── Condivisione in uscita ──────────────────────────────────────────────────
//
// Il verso opposto della richiesta: qui un segreto esce. Per questo la password
// del link non è opzionale e non la scegliamo noi — la genera il server e la
// mostra una volta sola, alla creazione.

export interface VaultShare {
  id: number;
  item_id: number | null;
  item_label: string;
  /** Le etichette di tutte le credenziali del link. */
  item_labels: string[];
  status: "active" | "expired" | "exhausted" | "revoked";
  expires_at: string;
  max_views: number | null;
  view_count: number;
  views_left: number | null;
  revoked_at: string | null;
  recipient_note: string | null;
  created_by_name: string | null;
  created_at: string;
  /** Solo alla creazione: dopo non sono più rileggibili. */
  url_pubblico: string | null;
  password: string | null;
  /** null = non era stato chiesto di inviare l'email. */
  email_inviata: boolean | null;
  email_dettaglio: string | null;
}

export interface VaultShareInput {
  item_ids: number[];
  expires_days?: number | null;
  max_views?: number | null;
  recipient_note?: string | null;
  /** La password del link non viaggia MAI nell'email: si detta a parte. */
  send_email?: boolean;
  recipient_email?: string | null;
  /** Sconsigliato: link e password nello stesso messaggio si annullano a vicenda. */
  include_password?: boolean;
}

/** Richiede la cassaforte sbloccata: stanno uscendo dei segreti, come una rivelazione. */
export async function createVaultShareApi(body: VaultShareInput): Promise<VaultShare> {
  return jsonOrThrow(
    await authFetch(`${BASE}/shares`, {
      method: "POST",
      headers: unlockedHeaders(),
      body: JSON.stringify(body),
    })
  );
}

export async function listVaultSharesApi(itemId: number): Promise<VaultShare[]> {
  return jsonOrThrow(await authFetch(`${BASE}/items/${itemId}/shares`));
}

export async function revokeVaultShareApi(shareId: number): Promise<void> {
  await jsonOrThrow<void>(await authFetch(`${BASE}/shares/${shareId}`, { method: "DELETE" }));
}

export interface VaultSharedPreview {
  label: string;
  kind: VaultKind;
}

export interface VaultPublicShare {
  credenziali: VaultSharedPreview[];
  azienda: string | null;
  expires_at: string;
  views_left: number | null;
}

export interface VaultSharedCredential {
  label: string;
  kind: VaultKind;
  username: string | null;
  email: string | null;
  url: string | null;
  note: string | null;
  secret: string | null;
  totp: string | null;
  private_key: string | null;
}

export interface VaultShareRevealed {
  credenziali: VaultSharedCredential[];
  views_left: number | null;
}

export async function getPublicShareApi(token: string): Promise<VaultPublicShare> {
  return jsonOrThrow(await fetch(`${BASE}/public/share/${encodeURIComponent(token)}`));
}

export async function revealPublicShareApi(
  token: string,
  password: string
): Promise<VaultShareRevealed> {
  return jsonOrThrow(
    await fetch(`${BASE}/public/share/${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    })
  );
}


// ── Condivisione interna, anche su più credenziali insieme ──────────────────
//
// Un permesso fa comparire la credenziale nella cassaforte del collega: non è
// una copia, è la stessa voce vista da un'altra persona. Revocare il permesso
// gliela toglie di nuovo.

export interface VaultBulkResult {
  aggiornate: number;
  invariate: number;
  /** Voci che non puoi gestire: contate e non elencate, per non rivelarne l'esistenza. */
  non_permesse: number;
}

export async function bulkVaultGrantsApi(body: {
  item_ids: number[];
  grants: Array<{ user_id: number; permission: "view" | "manage" }>;
  mode: "add" | "remove";
}): Promise<VaultBulkResult> {
  return jsonOrThrow(
    await authFetch(`${BASE}/items/bulk/grants`, {
      method: "POST",
      body: JSON.stringify(body),
    })
  );
}
