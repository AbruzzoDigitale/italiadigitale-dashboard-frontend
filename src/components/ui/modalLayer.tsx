import { createContext, useContext } from "react";

/**
 * Segnala ai campi che si stanno disegnando dentro un Modal.
 *
 * Il corpo del Modal è `overflow-y-auto`: un menu a tendina disegnato in
 * posizione assoluta al suo interno viene tagliato, o peggio allunga il modal
 * facendolo scrollare. La soluzione è disegnarlo in un portale sopra tutto —
 * `SearchableSelect` sa già farlo con `menuLayer="portal"`, ma finora andava
 * ricordato caso per caso (33 file nel repo lo passavano a mano).
 *
 * Con questo contesto il comportamento giusto è il default: dentro un Modal i
 * menu vanno in portale da soli. La prop esplicita continua a vincere, per i
 * casi in cui serve il contrario.
 */
export const InsideModalContext = createContext(false);

export function useInsideModal(): boolean {
  return useContext(InsideModalContext);
}
