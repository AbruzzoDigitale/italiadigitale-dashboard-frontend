import { useEffect, useRef, useState } from "react";
import { searchApi, type SearchGroup } from "../../api/search";

/**
 * Cerca mentre si digita, senza tempestare il server.
 *
 * Due accorgimenti che sembrano dettagli e non lo sono: si aspettano 250 ms di
 * silenzio prima di partire, e ogni nuova richiesta annulla la precedente. Senza il
 * secondo, la risposta a "Ros" può arrivare dopo quella a "Rossi" e sovrascriverla —
 * si finisce a guardare i risultati di una ricerca che non si sta più facendo.
 */
export function useSearch(query: string) {
  const [gruppi, setGruppi] = useState<SearchGroup[]>([]);
  const [inCorso, setInCorso] = useState(false);
  const annulla = useRef<AbortController | null>(null);

  useEffect(() => {
    const pulita = query.trim();
    annulla.current?.abort();

    if (pulita.length < 2) {
      setGruppi([]);
      setInCorso(false);
      return;
    }

    setInCorso(true);
    const timer = setTimeout(() => {
      const controller = new AbortController();
      annulla.current = controller;
      searchApi(pulita, controller.signal)
        .then((r) => setGruppi(r.gruppi))
        .catch((e) => {
          if ((e as Error)?.name !== "AbortError") setGruppi([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setInCorso(false);
        });
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => () => annulla.current?.abort(), []);

  return { gruppi, inCorso };
}
