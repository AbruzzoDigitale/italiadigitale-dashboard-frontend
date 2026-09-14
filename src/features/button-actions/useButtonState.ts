import { useCallback, useEffect, useState } from "react";
import { getButtonStateApi, type ButtonState, type ButtonStateItem } from "../../api/buttonActions";

// Stato dei bottoni configurabili di un elenco, in UNA sola chiamata.
// Chiedere riga per riga significherebbe una richiesta per sito: la pagina dei
// siti ne mostra fino a cento.
export interface ButtonStateMap {
  /** Metadati del bottone (etichetta, se l'utente può configurarlo). */
  state: ButtonState | null;
  /** entity_id → stato di quella riga. */
  byEntity: Map<number, ButtonStateItem>;
  loading: boolean;
  reload: () => void;
}

export function useButtonState(
  companyId: number | null,
  buttonKey: string,
  entityIds: number[],
): ButtonStateMap {
  const [state, setState] = useState<ButtonState | null>(null);
  const [byEntity, setByEntity] = useState<Map<number, ButtonStateItem>>(new Map());
  const [loading, setLoading] = useState(false);
  // Gli id cambiano identità a ogni render (è un array nuovo): la chiave
  // stabile è la loro stringa, altrimenti l'effetto gira all'infinito.
  const idsKey = entityIds.join(",");

  const load = useCallback(async () => {
    if (!companyId || !idsKey) {
      setState(null);
      setByEntity(new Map());
      return;
    }
    setLoading(true);
    try {
      const ids = idsKey.split(",").map(Number);
      const data = await getButtonStateApi(companyId, buttonKey, ids);
      setState(data);
      setByEntity(new Map(data.items.filter((i) => i.entity_id != null).map((i) => [i.entity_id as number, i])));
    } catch {
      // Un bottone che non sa il proprio stato semplicemente non si mostra:
      // non è un errore da sbattere in faccia a chi sta guardando l'elenco.
      setState(null);
      setByEntity(new Map());
    } finally {
      setLoading(false);
    }
  }, [companyId, buttonKey, idsKey]);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, byEntity, loading, reload: () => void load() };
}
