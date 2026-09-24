import { useEffect, useState } from "react";
import { DropdownMenu } from "../../components/ui/DropdownMenu";
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
 * Usa il `DropdownMenu` del gestionale, non un `<select>` nativo: dentro al campo di
 * testo un controllo di sistema stonerebbe, e quello del sito si apre in un portal —
 * quindi non viene tagliato dal riquadro, e sa aprirsi verso l'alto quando sta in
 * fondo alla pagina, che è esattamente dove si trova.
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

  const predefinito = modelli.find((m) => m.predefinito);
  const attivo = (scelto ? modelli.find((m) => m.slug === scelto) : predefinito) ?? predefinito;

  return (
    <DropdownMenu
      label="Modello"
      triggerLabel={attivo?.model_name ?? "modello"}
      variant="ghost"
      size="sm"
      align="left"
      disabled={disabilitato}
      className="!px-1.5 !text-[11px] !font-normal !normal-case !tracking-normal"
      items={modelli.map((m) => ({
        key: m.slug,
        label: m.predefinito ? `${m.model_name} (predefinito)` : m.model_name,
        trailing: m.provider,
        // Il predefinito si sceglie azzerando la preferenza, non fissandone lo slug:
        // così se domani l'azienda cambia il predefinito, chi non ha scelto lo segue.
        onClick: () => onCambia(m.predefinito ? null : m.slug),
        active: m.slug === attivo?.slug,
      }))}
    />
  );
}
