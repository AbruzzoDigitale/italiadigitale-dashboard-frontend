import { useEffect, useRef } from "react";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "./ThemeContext";
import { getUiPreferencesApi, saveUiPreferenceApi } from "../api/preferences";

type Theme = "light" | "dark";

/**
 * Tema chiaro/scuro persistito sul DB per utente × azienda (ui_preferences →
 * theme_by_company). Il localStorage resta solo come cache per il primo paint
 * (login/pre-caricamento); appena nota l'azienda attiva si applica il tema
 * salvato, e ogni toggle viene persistito per l'azienda corrente.
 */
export function ThemeCompanySync() {
  const { user, activeCompanyId } = useAuth();
  const { theme, applyTheme } = useTheme();

  // Mappa completa {companyId: theme} dal server: il PUT fa merge per chiave
  // top-level, quindi va sempre rispedita intera.
  const mapRef = useRef<Record<string, Theme>>({});
  const loadedForRef = useRef<string | null>(null);
  // Finché il load per (utente, azienda) non è concluso NON si salva: altrimenti
  // il tema di cache (localStorage) sovrascriverebbe quello salvato sul DB.
  const readyRef = useRef(false);

  const companyKey = activeCompanyId != null ? String(activeCompanyId) : null;

  // Carica dal DB a login/cambio azienda e applica il tema salvato.
  useEffect(() => {
    if (!user || companyKey == null) return;
    const key = `${user.id}:${companyKey}`;
    if (loadedForRef.current === key) return;
    loadedForRef.current = key;
    readyRef.current = false;

    getUiPreferencesApi()
      .then((prefs) => {
        const raw = (prefs.theme_by_company ?? {}) as Record<string, unknown>;
        const map: Record<string, Theme> = {};
        for (const [k, v] of Object.entries(raw)) {
          if (v === "light" || v === "dark") map[k] = v;
        }
        mapRef.current = map;
        const saved = map[companyKey];
        if (saved && saved !== theme) applyTheme(saved);
      })
      .catch(() => {
        /* endpoint non raggiungibile: resta il tema della cache locale */
      })
      .finally(() => {
        readyRef.current = true;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, companyKey]);

  // Persisti il tema corrente per l'azienda attiva (solo su cambi reali).
  useEffect(() => {
    if (!user || companyKey == null || !readyRef.current) return;
    if (mapRef.current[companyKey] === theme) return;
    mapRef.current = { ...mapRef.current, [companyKey]: theme };
    void saveUiPreferenceApi({ theme_by_company: mapRef.current }).catch(() => {
      /* salvataggio fallito: riproverà al prossimo cambio */
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, user?.id, companyKey]);

  return null;
}
