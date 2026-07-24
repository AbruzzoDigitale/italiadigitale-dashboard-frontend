import { useCallback, useEffect, useRef, useState } from "react";
import {
  getDashboardLayoutApi,
  updateDashboardLayoutApi,
  type DashboardWidget,
} from "../api/dashboardLayout";
import type { WidgetInstance } from "../components/dashboard/widgets/types";

function toInstances(widgets: DashboardWidget[]): WidgetInstance[] {
  return widgets.map((w) => ({
    id: w.id,
    type: w.type,
    config: w.config ?? {},
    x: w.x,
    y: w.y,
    w: w.w,
    h: w.h,
  }));
}

/**
 * Carica e salva il layout dashboard dell'utente per l'azienda attiva.
 * Salvataggio ottimistico fire-and-forget (mirror del pattern preferenze).
 */
export function useDashboardLayout(companyId: number | null) {
  const [widgets, setWidgets] = useState<WidgetInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  // `initialized` = l'utente ha già configurato la dashboard almeno una volta.
  // Serve a distinguere "mai toccata" (→ mostra widget di default) da "svuotata di
  // proposito" (→ rispetta la scelta e mostra stato vuoto).
  const [initialized, setInitialized] = useState(false);
  const settingsRef = useRef<Record<string, unknown>>({});

  useEffect(() => {
    if (companyId == null) {
      setWidgets([]);
      setInitialized(false);
      setLoading(false);
      setLoaded(true);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoaded(false);
    getDashboardLayoutApi(companyId)
      .then((layout) => {
        if (cancelled) return;
        settingsRef.current = layout.settings ?? {};
        setInitialized(Boolean((layout.settings as { initialized?: boolean } | null)?.initialized));
        setWidgets(toInstances(layout.widgets ?? []));
      })
      .catch(() => {
        if (!cancelled) setWidgets([]);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const persist = useCallback(
    (next: WidgetInstance[]) => {
      if (companyId == null) return;
      void updateDashboardLayoutApi({
        company_id: companyId,
        widgets: next.map((w) => ({
          id: w.id,
          type: w.type,
          config: w.config,
          x: w.x,
          y: w.y,
          w: w.w,
          h: w.h,
        })),
        settings: settingsRef.current,
      }).catch(() => {});
    },
    [companyId],
  );

  const setAndPersist = useCallback(
    (next: WidgetInstance[]) => {
      settingsRef.current = { ...settingsRef.current, initialized: true };
      setInitialized(true);
      setWidgets(next);
      persist(next);
    },
    [persist],
  );

  return { widgets, setWidgets: setAndPersist, loading, loaded, initialized };
}
