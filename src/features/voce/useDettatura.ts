import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Dettatura col riconoscimento vocale del browser.
 *
 * Non manda l'audio da nessuna parte: la trascrizione avviene nel browser (su Chrome
 * passa dai servizi di Google, su Safari da quelli di Apple), quindi non costa niente
 * per parola e non aggiunge un giro di rete nostro. Un Whisper vero — registrare e
 * mandare l'audio a un modello — darebbe una trascrizione migliore sui nomi propri e
 * sul rumore, ma vuol dire caricare l'audio, pagarlo e aspettarlo: ha senso come
 * secondo passo, se questo si rivela insufficiente.
 *
 * Non è disponibile ovunque (Firefox non la implementa): `supportata` dice se c'è, e
 * chi chiama deve nascondere il pulsante invece di mostrarne uno che non fa niente.
 */

type Riconoscitore = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionLikeEvent) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

interface SpeechRecognitionLikeEvent {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}

function costruttore(): (new () => Riconoscitore) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => Riconoscitore;
    webkitSpeechRecognition?: new () => Riconoscitore;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useDettatura(onTesto: (testo: string, definitivo: boolean) => void) {
  const Costruttore = useMemo(costruttore, []);
  const [inAscolto, setInAscolto] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const riconoscitore = useRef<Riconoscitore | null>(null);
  // In un ref: la callback cambia a ogni render e non deve ricreare il riconoscitore.
  const callback = useRef(onTesto);
  callback.current = onTesto;

  const ferma = useCallback(() => {
    riconoscitore.current?.stop();
    setInAscolto(false);
  }, []);

  const avvia = useCallback(() => {
    if (!Costruttore || riconoscitore.current) return;
    setErrore(null);

    const r = new Costruttore();
    r.lang = "it-IT";
    r.continuous = true;
    // I risultati provvisori si vedono mentre si parla: senza, si resta dieci secondi
    // davanti a un campo fermo chiedendosi se stia funzionando.
    r.interimResults = true;

    r.onresult = (e) => {
      let parziale = "";
      let definitivo = "";
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const testo = e.results[i][0]?.transcript ?? "";
        if (e.results[i].isFinal) definitivo += testo;
        else parziale += testo;
      }
      if (definitivo) callback.current(definitivo.trim(), true);
      else if (parziale) callback.current(parziale.trim(), false);
    };
    r.onerror = (e) => {
      // "no-speech" e "aborted" sono normali: l'utente ha smesso o non ha detto niente.
      if (e.error && !["no-speech", "aborted"].includes(e.error)) {
        setErrore(
          e.error === "not-allowed"
            ? "Microfono non consentito: autorizzalo nelle impostazioni del browser."
            : "Riconoscimento vocale non riuscito."
        );
      }
      setInAscolto(false);
    };
    r.onend = () => {
      riconoscitore.current = null;
      setInAscolto(false);
    };

    riconoscitore.current = r;
    try {
      r.start();
      setInAscolto(true);
    } catch {
      riconoscitore.current = null;
      setErrore("Non è stato possibile avviare il microfono.");
    }
  }, [Costruttore]);

  // Smontando si interrompe: un riconoscitore lasciato acceso tiene il microfono.
  useEffect(
    () => () => {
      riconoscitore.current?.abort();
      riconoscitore.current = null;
    },
    []
  );

  return { supportata: Costruttore !== null, inAscolto, errore, avvia, ferma };
}
