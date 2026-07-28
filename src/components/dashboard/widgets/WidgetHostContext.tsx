import { createContext, useContext } from "react";

/**
 * Contesto fornito dal DashboardGrid a ciascun widget: permette al widget di sapere se
 * è in modalità modifica e di aggiornare la PROPRIA config (persistita nel layout).
 */
interface WidgetHost {
  editing: boolean;
  updateConfig: (patch: Record<string, unknown>) => void;
}

const WidgetHostContext = createContext<WidgetHost>({ editing: false, updateConfig: () => {} });

export const WidgetHostProvider = WidgetHostContext.Provider;

export function useWidgetHost(): WidgetHost {
  return useContext(WidgetHostContext);
}
