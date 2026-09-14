import { authFetch, API_BASE } from "./auth";

// ─────────────────────────────────────────────────────────────────────────────
// Cassaforte degli accessi di un sito: SSH, FTP, WordPress, database, API.
//
// I valori cifrati non escono mai dall'elenco: si sa solo se ci sono. Per
// leggerli serve sbloccare la cassaforte con la propria password, che rilascia
// un token a vita breve tenuto SOLO in memoria — niente localStorage, così un
// tab chiuso richiude la cassaforte.
// Vedi app/api/v1/endpoints/website_secrets.py.
// ─────────────────────────────────────────────────────────────────────────────

const BASE = `${API_BASE}/api/v1/website-secrets`;

export type SecretKind =
  | "ssh"
  | "ftp"
  | "wordpress"
  | "database"
  | "hosting"
  | "dns"
  | "api_key"
  | "other";

export const SECRET_KIND_LABELS: Record<SecretKind, string> = {
  ssh: "SSH",
  ftp: "FTP / SFTP",
  wordpress: "WordPress",
  database: "Database",
  hosting: "Pannello hosting",
  dns: "DNS / registrar",
  api_key: "Chiave API",
  other: "Altro",
};

/** Campi che hanno senso mostrare per tipo: il resto resta nascosto nel form. */
export const SECRET_KIND_FIELDS: Record<SecretKind, Array<"host" | "port" | "username" | "url" | "path" | "private_key">> = {
  ssh: ["host", "port", "username", "path", "private_key"],
  ftp: ["host", "port", "username", "path"],
  wordpress: ["url", "username"],
  database: ["host", "port", "username", "path"],
  hosting: ["url", "username"],
  dns: ["url", "username"],
  api_key: ["url"],
  other: ["url", "username"],
};

export interface WebsiteSecret {
  id: number;
  website_id: number;
  company_id: number;
  kind: SecretKind;
  label: string;
  host: string | null;
  port: number | null;
  username: string | null;
  url: string | null;
  path: string | null;
  note: string | null;
  /** Se c'è una password/token salvato. Il valore non viaggia mai qui. */
  has_secret: boolean;
  has_private_key: boolean;
  visible_to_operators: boolean;
  owner_user_id: number | null;
  owner_name: string | null;
  can_manage: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string | null;
}

export interface WebsiteSecretPayload {
  kind: SecretKind;
  label: string;
  host?: string | null;
  port?: number | null;
  username?: string | null;
  url?: string | null;
  path?: string | null;
  note?: string | null;
  visible_to_operators?: boolean;
  /** Assente = lascia com'è; stringa vuota = cancella il valore salvato. */
  secret?: string | null;
  private_key?: string | null;
}

export interface VaultStatus {
  available: boolean;
  can_manage: boolean;
  kinds: SecretKind[];
}

export interface SecretAccess {
  id: number;
  secret_id: number | null;
  website_id: number | null;
  secret_label: string;
  user_id: number | null;
  user_name: string | null;
  created_at: string;
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
  return res.json() as Promise<T>;
}

// ── Token di sblocco: solo in memoria, mai persistito ────────────────────────

let vaultToken: string | null = null;
let vaultExpiresAt = 0;

/** Millisecondi di sblocco rimanenti, 0 se chiusa. */
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
  const data = await jsonOrThrow<{ token: string; expires_at: string; valid_minutes: number }>(res);
  vaultToken = data.token;
  vaultExpiresAt = new Date(data.expires_at).getTime();
  return data.valid_minutes;
}

// ── Chiamate ────────────────────────────────────────────────────────────────

export async function vaultStatusApi(): Promise<VaultStatus> {
  return jsonOrThrow(await authFetch(`${BASE}/status`));
}

export async function listWebsiteSecretsApi(websiteId: number): Promise<WebsiteSecret[]> {
  return jsonOrThrow(await authFetch(`${BASE}?website_id=${websiteId}`));
}

export async function createWebsiteSecretApi(
  websiteId: number,
  body: WebsiteSecretPayload
): Promise<WebsiteSecret> {
  return jsonOrThrow(
    await authFetch(BASE, {
      method: "POST",
      body: JSON.stringify({ ...body, website_id: websiteId }),
    })
  );
}

export async function updateWebsiteSecretApi(
  secretId: number,
  body: Partial<WebsiteSecretPayload>
): Promise<WebsiteSecret> {
  return jsonOrThrow(
    await authFetch(`${BASE}/${secretId}`, { method: "PATCH", body: JSON.stringify(body) })
  );
}

export async function deleteWebsiteSecretApi(secretId: number): Promise<void> {
  const res = await authFetch(`${BASE}/${secretId}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string })?.detail ?? "Errore nell'eliminazione");
  }
}

export async function revealWebsiteSecretApi(
  secretId: number
): Promise<{ id: number; secret: string | null; private_key: string | null }> {
  if (!isVaultUnlocked()) throw new VaultLockedError();
  return jsonOrThrow(
    await authFetch(`${BASE}/${secretId}/reveal`, {
      method: "POST",
      headers: { "X-Vault-Token": vaultToken as string },
    })
  );
}

export async function listSecretAccessesApi(websiteId: number, limit = 50): Promise<SecretAccess[]> {
  return jsonOrThrow(await authFetch(`${BASE}/accesses?website_id=${websiteId}&limit=${limit}`));
}

/** Riepilogo di una voce senza rivelare nulla: "deploy@1.2.3.4:22". */
export function secretSummary(s: WebsiteSecret): string {
  const parti: string[] = [];
  if (s.username && s.host) parti.push(`${s.username}@${s.host}${s.port ? `:${s.port}` : ""}`);
  else if (s.host) parti.push(`${s.host}${s.port ? `:${s.port}` : ""}`);
  else if (s.username) parti.push(s.username);
  if (s.url) parti.push(s.url.replace(/^https?:\/\/(www\.)?/, ""));
  if (s.path) parti.push(s.path);
  return parti.join(" · ");
}
