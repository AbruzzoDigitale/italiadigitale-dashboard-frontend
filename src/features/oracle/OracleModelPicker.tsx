import { useEffect, useState } from "react";
import { listOracleModelsApi, type OracleModel } from "../../api/oracle";

const CHIAVE = "oracolo.modello";

/**
 * Sceglie con quale modello rispondere.
 *
 * I modelli non sono una lista nel codice: sono i profili LLM che l'azienda ha
 * configurato dal pannello, filtrati su quelli il cui provider sa chiamare gli
 * strumenti. Il giorno in cui viene aggiunto un profilo OpenAI o Anthropic compare
 * qui da solo, senza toccare niente.
 *
 * La scelta si ricorda in `localStorage`: è una comodità per chi guarda, non uno
 * stato che deve sopravvivere o essere condiviso — se il browser la perde, si torna
 * al predefinito dell'azienda e non è successo niente. Per questo ogni accesso è
 * protetto: in una finestra anonima leggere può sollevare.
 */
function leggiScelta(): string | null {
  try {
    return localStorage.getItem(CHIAVE);
  } catch {
    return null;
  }
}

function salvaScelta(slug: string | null) {
  try {
    if (slug) localStorage.setItem(CHIAVE, slug);
    else localStorage.removeItem(CHIAVE);
  } catch {
    /* archiviazione non disponibile: la scelta vale per questa sessione */
  }
}

export function useOracleModel() {
  const [modelli, setModelli] = useState<OracleModel[]>([]);
  const [scelto, setScelto] = useState<string | null>(leggiScelta());

  useEffect(() => {
    let vivo = true;
    listOracleModelsApi().then((m) => {
      if (!vivo) return;
      setModelli(m);
      // Una scelta salvata che non esiste più — profilo rinominato o disattivato —
      // va scartata in silenzio, non trascinata fino a un errore dal server.
      setScelto((attuale) => (attuale && m.some((x) => x.slug === attuale) ? attuale : null));
    });
    return () => {
      vivo = false;
    };
  }, []);

  const cambia = (slug: string | null) => {
    setScelto(slug);
    salvaScelta(slug);
  };

  return { modelli, scelto, cambia };
}

export function OracleModelPicker({
  modelli,
  scelto,
  onCambia,
  disabilitato,
}: {
  modelli: OracleModel[];
  scelto: string | null;
  onCambia: (slug: string | null) => void;
  disabilitato?: boolean;
}) {
  // Con un modello solo non c'è niente da scegliere: la tendina sarebbe rumore.
  if (modelli.length < 2) return null;

  return (
    <label className="flex items-center gap-1.5 text-[11px] text-muted dark:text-[#9999a0]">
      <span className="sr-only">Modello</span>
      <select
        value={scelto ?? ""}
        disabled={disabilitato}
        onChange={(e) => onCambia(e.target.value || null)}
        className="bg-transparent rounded px-1 py-0.5 -ml-1 text-[11px] text-muted dark:text-[#9999a0]
                   hover:text-ink dark:hover:text-[#f4f4f7] focus:outline-none
                   focus:ring-1 focus:ring-brand-magenta disabled:opacity-50 cursor-pointer"
      >
        <option value="">
          {modelli.find((m) => m.predefinito)?.model_name ?? "predefinito"} (predefinito)
        </option>
        {modelli
          .filter((m) => !m.predefinito)
          .map((m) => (
            <option key={m.slug} value={m.slug}>
              {m.model_name} · {m.provider}
            </option>
          ))}
      </select>
    </label>
  );
}
