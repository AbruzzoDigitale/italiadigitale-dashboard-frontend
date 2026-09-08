import { authFetch, API_BASE, type AuthUser, type AccessLevel } from "./auth";

/** User è lo stesso oggetto di AuthUser — re-export per convenienza nei componenti */
export type User = AuthUser;
export type { AccessLevel } from "./auth";

export interface UserPermissions {
  is_admin: boolean;
  /** true se l'utente è Project Manager (può gestire le task di tutti gli operatori della propria azienda) */
  is_project_manager: boolean;
  /** "admin" | "project_manager" | "operator" */
  access_level: AccessLevel;
  can_use_llm: boolean;
  can_generate_manual_tasks: boolean;
  can_manage_roles: boolean;
  can_assign_roles: boolean;
  allowed_views: string[];
  can_view_clients: boolean;
  can_manage_clients: boolean;
  can_view_quotes: boolean;
  can_manage_quotes: boolean;
  can_view_requests: boolean;
  can_manage_requests: boolean;
  can_view_social_packages: boolean;
  can_manage_social_packages: boolean;
  can_view_catalog: boolean;
  can_view_catalog_prices: boolean;
  can_manage_catalog: boolean;
  /** Può inviare/annullare l'invio al cliente di una task in revisione. Admin/PM sempre;
   *  per gli operatori è un permesso per-utente impostabile da admin. */
  can_send_to_client: boolean;
}

export interface CreateUserPayload {
  username: string;
  email: string;
  full_name: string;
  password: string;
  is_admin?: boolean;
  /** "admin" | "project_manager" | "operator". Se valorizzato vince su is_admin (che viene tenuto coerente lato backend). */
  access_level?: AccessLevel;
  company_id?: number | null;
  company_ids?: number[] | null;
  role_ids?: number[] | null;
  work_area_ids?: number[] | null;
  assigned_client_ids?: number[] | null;
  /** null = usa DEFAULT_OPERATOR_VIEWS */
  operator_permissions?: string[] | null;
  /** Partita IVA personale, per chi collabora con la propria. */
  vat_number?: string | null;
  /** Denominazione con cui fattura, se diversa da nome e cognome. */
  legal_name?: string | null;
  /** "femminile" | "maschile" | "altro" | vuoto (non dichiarato). */
  gender?: string | null;
}

export interface UpdateUserPayload {
  username?: string;
  email?: string;
  full_name?: string;
  is_admin?: boolean;
  /** "admin" | "project_manager" | "operator". Se valorizzato vince su is_admin. */
  access_level?: AccessLevel;
  is_active?: boolean;
  company_id?: number | null;
  company_ids?: number[] | null;
  role_ids?: number[] | null;
  work_area_ids?: number[] | null;
  assigned_client_ids?: number[] | null;
  phone?: string | null;
  role_label?: string | null;
  /** Partita IVA personale, per chi collabora con la propria. */
  vat_number?: string | null;
  /** Denominazione con cui fattura, se diversa da nome e cognome. */
  legal_name?: string | null;
  /** "femminile" | "maschile" | "altro" | vuoto (non dichiarato). */
  gender?: string | null;
  signature?: string | null;
  operator_permissions?: string[] | null;
  /** Disattiva il warning di conferma sullo scambio task (self-service). */
  swap_confirmation_disabled?: boolean;
}

/** Permessi operatore disponibili */
export const ALL_OPERATOR_VIEWS = [
  "dashboard", "social", "configurator", "catalog",
  "preventivo", "requests", "quotes", "clients",
  "profile", "brand", "settings", "llm",
] as const;

export type OperatorView = typeof ALL_OPERATOR_VIEWS[number];

function parseApiError(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;

  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail === "string" && detail.trim()) return detail;

  if (Array.isArray(detail) && detail.length > 0) {
    const messages = detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          const msg = (item as { msg?: unknown }).msg;
          if (typeof msg === "string" && msg.trim()) return msg;
        }
        return null;
      })
      .filter((msg): msg is string => !!msg);
    if (messages.length > 0) return messages.join("; ");
  }

  const message = (body as { message?: unknown }).message;
  if (typeof message === "string" && message.trim()) return message;

  const error = (body as { error?: unknown }).error;
  if (typeof error === "string" && error.trim()) return error;

  return fallback;
}

// ── API calls ────────────────────────────────────────────────────────────────────

export async function getUsersApi(companyId?: number): Promise<User[]> {
  const url = companyId
    ? `${API_BASE}/api/v1/users?company_id=${companyId}`
    : `${API_BASE}/api/v1/users`;
  const res = await authFetch(url);
  if (!res.ok) throw new Error("Impossibile recuperare la lista utenti");
  return res.json();
}

export async function createUserApi(payload: CreateUserPayload): Promise<User> {
  const res = await authFetch(`${API_BASE}/api/v1/users`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Errore nella creazione utente"));
  }
  return res.json();
}

export async function updateUserApi(
  id: number,
  payload: UpdateUserPayload
): Promise<User> {
  const res = await authFetch(`${API_BASE}/api/v1/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Errore nella modifica utente"));
  }
  return res.json();
}

export async function updateMeApi(payload: UpdateUserPayload): Promise<User> {
  const res = await authFetch(`${API_BASE}/api/v1/users/me`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Errore nell'aggiornamento profilo"));
  }
  return res.json();
}

export async function getMePermissionsApi(): Promise<UserPermissions> {
  const res = await authFetch(`${API_BASE}/api/v1/users/me/permissions`);
  if (!res.ok) throw new Error("Impossibile recuperare i permessi utente");
  return res.json();
}

/** field: 'avatar' | 'signature_image' */
export async function uploadUserFileApi(
  field: "avatar" | "signature_image",
  file: File
): Promise<User> {
  const token = localStorage.getItem("id_token");
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/api/v1/users/me/upload/${field}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Errore nel caricamento file"));
  }
  return res.json();
}

export async function deleteUserApi(id: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/api/v1/users/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Errore nell'eliminazione utente"));
  }
}

export async function replaceUserAssignedClientsApi(userId: number, clientIds: number[]): Promise<User> {
  const res = await authFetch(`${API_BASE}/api/v1/users/${userId}/assigned-clients`, {
    method: "PUT",
    body: JSON.stringify({ client_ids: clientIds }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Errore nell'aggiornamento clienti assegnati"));
  }
  return res.json();
}

export async function addUserAssignedClientApi(userId: number, clientId: number): Promise<User> {
  const res = await authFetch(`${API_BASE}/api/v1/users/${userId}/assigned-clients/${clientId}`, {
    method: "POST",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Errore nell'assegnazione cliente"));
  }
  return res.json();
}

export async function removeUserAssignedClientApi(userId: number, clientId: number): Promise<User> {
  const res = await authFetch(`${API_BASE}/api/v1/users/${userId}/assigned-clients/${clientId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, "Errore nella rimozione cliente assegnato"));
  }
  return res.json();
}

// ── Assegnazioni del proprio profilo (sola lettura) ──────────────────────────
// Vedi GET /api/v1/users/me/assignments. Chi può cambiarle è un admin, dalla
// gestione utenti: qui si mostrano soltanto.

export interface AssignmentItem {
  id: number;
  name: string;
  /** Colore del ruolo o dell'area, per usare gli stessi chip del resto del gestionale. */
  color?: string | null;
}

export interface MyAssignments {
  access_level: string;
  is_admin: boolean;
  companies: AssignmentItem[];
  roles: AssignmentItem[];
  work_areas: AssignmentItem[];
  clients: AssignmentItem[];
}

export async function getMyAssignmentsApi(): Promise<MyAssignments> {
  const res = await authFetch(`${API_BASE}/api/v1/users/me/assignments`);
  if (!res.ok) throw new Error("Assegnazioni non disponibili");
  return res.json() as Promise<MyAssignments>;
}

export interface MyClientCard {
  id: number;
  name: string;
  commercial_name: string | null;
  city: string | null;
  prov: string | null;
  contact: string | null;
  email: string | null;
  phone: string | null;
  is_lead: boolean;
  is_active: boolean;
  work_areas: AssignmentItem[];
  /** Solo per admin e project manager: per gli altri arrivano nulli. */
  vat: string | null;
  contracts_count: number | null;
}

/** GET /api/v1/users/me/clients — i clienti assegnati a chi chiede. */
export async function getMyClientsApi(): Promise<MyClientCard[]> {
  const res = await authFetch(`${API_BASE}/api/v1/users/me/clients`);
  if (!res.ok) throw new Error("Clienti non disponibili");
  return res.json() as Promise<MyClientCard[]>;
}
