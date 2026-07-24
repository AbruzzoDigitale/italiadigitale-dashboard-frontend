import { API_BASE, authFetch } from "./auth";

// Rinnovo silenzioso della sessione.
//
// Il token normale dura 3 ore, quello con "Ricordami" 30 giorni. Senza rinnovo
// l'utente verrebbe buttato fuori allo scadere anche mentre sta lavorando: qui,
// finché l'app è aperta, quando il token ha superato buona parte della sua vita
// se ne chiede uno nuovo (della STESSA durata: lo decide il backend leggendo il
// claim `rem`). Se il rinnovo fallisce non si fa nulla di traumatico — al primo
// 401 interviene il gestore globale che porta al login.

const TOKEN_KEY = "id_token";
/** Si rinnova quando è trascorsa più di questa frazione della vita del token. */
const RENEW_AFTER = 0.6;
/** Ogni quanto ricontrollare mentre l'app resta aperta. */
const CHECK_MS = 5 * 60 * 1000;

interface TokenTimes {
  iat: number;
  exp: number;
}

/** Legge `iat`/`exp` dal JWT senza librerie (payload base64url). */
export function readTokenTimes(token: string): TokenTimes | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    const exp = typeof json.exp === "number" ? json.exp * 1000 : null;
    const iat = typeof json.iat === "number" ? json.iat * 1000 : null;
    if (!exp) return null;
    // Token vecchi (emessi prima dell'introduzione di `iat`): si assume 3 ore.
    return { exp, iat: iat ?? exp - 3 * 60 * 60 * 1000 };
  } catch {
    return null;
  }
}

/** Vero se conviene rinnovare adesso. */
export function needsRenewal(token: string, now: number = Date.now()): boolean {
  const t = readTokenTimes(token);
  if (!t) return false;
  if (now >= t.exp) return false; // già scaduto: ci pensa il 401 → login
  const life = t.exp - t.iat;
  if (life <= 0) return false;
  return now - t.iat > life * RENEW_AFTER;
}

let inflight: Promise<void> | null = null;

/** Se serve, chiede un token nuovo e lo salva al posto di quello corrente. */
export async function renewTokenIfNeeded(): Promise<void> {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token || !needsRenewal(token)) return;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await authFetch(`${API_BASE}/api/v1/auth/refresh`, { method: "POST" });
      if (!res.ok) return; // 401 → ci pensa il gestore globale
      const body = await res.json();
      if (body?.access_token) localStorage.setItem(TOKEN_KEY, body.access_token);
    } catch {
      // rete assente: si riprova al giro dopo
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/**
 * Avvia il rinnovo silenzioso: controlla subito, poi a intervalli regolari e
 * ogni volta che si torna sulla scheda (caso tipico: portatile riaperto dopo ore).
 * Ritorna la funzione per fermarlo.
 */
export function startSilentRenew(): () => void {
  void renewTokenIfNeeded();
  const timer = window.setInterval(() => void renewTokenIfNeeded(), CHECK_MS);
  const onVisible = () => {
    if (!document.hidden) void renewTokenIfNeeded();
  };
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onVisible);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", onVisible);
  };
}
