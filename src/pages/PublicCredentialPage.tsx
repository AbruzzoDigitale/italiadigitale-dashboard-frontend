import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  getPublicRequestApi,
  submitPublicRequestApi,
  type VaultPublicRequest,
} from "../api/vault";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { Input } from "../components/ui/Input";
import { Skeleton } from "../components/ui/Skeleton";
import { Textarea } from "../components/ui/Textarea";

/**
 * Pagina pubblica con cui un cliente ci consegna una credenziale.
 *
 * Non richiede account. Mostra solo i campi in chiaro che abbiamo precompilato
 * e raccoglie la password: **non restituisce mai un segreto**, nemmeno dopo
 * l'invio. Chi intercettasse il link potrebbe al massimo scrivere una password
 * sbagliata, non leggerne una.
 *
 * Il link si consuma all'invio, non all'apertura: ricaricare la pagina o
 * aprirla due volte non la brucia.
 */

const GUSCIO =
  "flex min-h-[100dvh] items-center justify-center bg-cream p-4 dark:bg-[#0E0F0E]";
const CARD =
  "w-full max-w-lg rounded-2xl border border-line bg-paper p-7 shadow-md dark:border-line-dark dark:bg-[#131316]";

export function PublicCredentialPage() {
  const { token = "" } = useParams();
  const [dati, setDati] = useState<VaultPublicRequest | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [secret, setSecret] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [username, setUsername] = useState("");
  const [url, setUrl] = useState("");
  const [inCorso, setInCorso] = useState(false);
  const [inviato, setInviato] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const d = await getPublicRequestApi(token);
        setDati(d);
        setUsername(d.username ?? "");
        setUrl(d.url ?? "");
      } catch (e) {
        setErrore(e instanceof Error ? e.message : "Link non valido");
      } finally {
        setCaricamento(false);
      }
    })();
  }, [token]);

  async function invia() {
    if (!secret && !privateKey) {
      setErrore("Inserisci la password prima di inviare.");
      return;
    }
    setErrore(null);
    setInCorso(true);
    try {
      await submitPublicRequestApi(token, {
        access_password: password || null,
        secret: secret || null,
        private_key: privateKey || null,
        username: username || null,
        url: url || null,
      });
      setInviato(true);
      // Ripulisce subito: il valore non deve restare nella pagina dopo l'invio.
      setSecret("");
      setPrivateKey("");
      setPassword("");
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Invio non riuscito");
    } finally {
      setInCorso(false);
    }
  }

  if (caricamento) {
    return (
      <div className={GUSCIO}>
        <div className={CARD}>
          <Skeleton className="mb-3 h-6 w-2/3" />
          <Skeleton className="mb-2 h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    );
  }

  if (inviato) {
    return (
      <div className={GUSCIO}>
        <div className={`${CARD} text-center`}>
          <Icon name="check-circle" className="mx-auto mb-3 h-10 w-10 text-success" />
          <h1 className="mb-2 text-lg font-semibold">Ricevuto, grazie.</h1>
          <p className="text-sm text-muted dark:text-muted-dark">
            La credenziale è stata salvata in forma cifrata. Questo link non è più
            utilizzabile: se devi correggere qualcosa, chiedine uno nuovo.
          </p>
        </div>
      </div>
    );
  }

  if (!dati) {
    return (
      <div className={GUSCIO}>
        <div className={`${CARD} text-center`}>
          <Icon name="alert-triangle" className="mx-auto mb-3 h-10 w-10 text-warning" />
          <h1 className="mb-2 text-lg font-semibold">Link non utilizzabile</h1>
          <p className="text-sm text-muted dark:text-muted-dark">
            {errore ?? "Può essere scaduto, già usato o revocato."} Chiedi un nuovo link
            a chi te l'ha mandato.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={GUSCIO}>
      <div className={CARD}>
        <div className="mb-4 flex items-center gap-2">
          <Icon name="key" className="h-5 w-5" />
          <h1 className="text-lg font-semibold">{dati.label}</h1>
        </div>

        {dati.azienda && (
          <p className="mb-3 text-sm text-muted dark:text-muted-dark">
            Richiesta da <strong>{dati.azienda}</strong>
          </p>
        )}

        {dati.message && (
          <p className="mb-4 rounded-lg border border-line bg-cream p-3 text-sm dark:border-line-dark dark:bg-[#0E0F0E]">
            {dati.message}
          </p>
        )}

        <div className="flex flex-col gap-3">
          {dati.url !== null && (
            <Input label="Indirizzo" value={url} onChange={(e) => setUrl(e.target.value)} />
          )}
          <Input
            label="Nome utente"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />

          {dati.requires_password && (
            <Input
              type="password"
              label="Password del link"
              autoComplete="one-time-code"
              placeholder="Te l'hanno comunicata a parte"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}

          <Input
            type="password"
            label="Password da consegnare"
            autoComplete="new-password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
          />

          {dati.needs_private_key && (
            <Textarea
              label="Chiave privata (se serve)"
              className="font-mono text-xs"
              rows={4}
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
            />
          )}

          {errore && <p className="text-sm text-danger">{errore}</p>}

          <Button onClick={() => void invia()} loading={inCorso} className="mt-1">
            Invia in modo sicuro
          </Button>

          <p className="text-xs text-muted dark:text-muted-dark">
            Quello che scrivi viene cifrato e salvato in una cassaforte: non viene inviato
            per email né mostrato in chiaro a nessuno. Il link funziona una volta sola.
          </p>
        </div>
      </div>
    </div>
  );
}
