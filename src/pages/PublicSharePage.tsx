import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  getPublicShareApi,
  revealPublicShareApi,
  type VaultPublicShare,
  type VaultShareRevealed,
} from "../api/vault";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { Input } from "../components/ui/Input";
import { Skeleton } from "../components/ui/Skeleton";

/**
 * Pagina con cui consegniamo una credenziale a un esterno.
 *
 * Il gemello speculare di `PublicCredentialPage`, e il più delicato dei due:
 * là si raccoglieva un segreto, qui lo si consegna. Di conseguenza:
 *
 * - il segreto arriva **solo** dopo la password, in una POST — non compare mai
 *   in un URL, dove finirebbe nella cronologia e nei log del server;
 * - la prima schermata dice soltanto di cosa si tratta, non a chi appartiene né
 *   dove si usa: quei campi escono insieme al segreto;
 * - ogni apertura riuscita consuma il link e finisce nel registro accessi.
 */

const GUSCIO =
  "flex min-h-[100dvh] items-center justify-center bg-cream p-4 dark:bg-[#0E0F0E]";
const CARD =
  "w-full max-w-lg rounded-2xl border border-line bg-paper p-7 shadow-md dark:border-line-dark dark:bg-[#131316]";

/** Campo in chiaro con il bottone per copiarlo, senza mostrarlo due volte. */
function Riga({
  etichetta,
  valore,
  segreto = false,
}: {
  etichetta: string;
  valore: string;
  segreto?: boolean;
}) {
  const [visibile, setVisibile] = useState(!segreto);
  const [copiato, setCopiato] = useState(false);

  async function copia() {
    await navigator.clipboard.writeText(valore);
    setCopiato(true);
    setTimeout(() => setCopiato(false), 2000);
  }

  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted dark:text-muted-dark">{etichetta}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg border border-line bg-cream px-3 py-2 font-mono text-sm dark:border-line-dark dark:bg-[#0E0F0E]">
          {visibile ? valore : "•".repeat(Math.min(valore.length, 24))}
        </code>
        {segreto && (
          <Button
            variant="secondary"
            onClick={() => setVisibile((v) => !v)}
            title={visibile ? "Nascondi" : "Mostra"}
            aria-label={visibile ? "Nascondi" : "Mostra"}
          >
            <Icon name={visibile ? "eye-off" : "eye"} className="h-4 w-4" />
          </Button>
        )}
        <Button variant="secondary" onClick={() => void copia()} title="Copia" aria-label="Copia">
          <Icon name={copiato ? "check" : "copy"} className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function PublicSharePage() {
  const { token = "" } = useParams();
  const [dati, setDati] = useState<VaultPublicShare | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [inCorso, setInCorso] = useState(false);
  const [aperta, setAperta] = useState<VaultShareRevealed | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setDati(await getPublicShareApi(token));
      } catch (e) {
        setErrore(e instanceof Error ? e.message : "Link non valido");
      } finally {
        setCaricamento(false);
      }
    })();
  }, [token]);

  async function apri() {
    if (!password.trim()) return;
    setErrore(null);
    setInCorso(true);
    try {
      const r = await revealPublicShareApi(token, password.trim());
      setAperta(r);
      // La password del link non serve più: fuori dallo stato.
      setPassword("");
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Apertura non riuscita");
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

  if (!dati) {
    return (
      <div className={GUSCIO}>
        <div className={`${CARD} text-center`}>
          <Icon name="alert-triangle" className="mx-auto mb-3 h-10 w-10 text-warning" />
          <h1 className="mb-2 text-lg font-semibold">Link non utilizzabile</h1>
          <p className="text-sm text-muted dark:text-muted-dark">
            {errore ?? "Può essere scaduto, esaurito o revocato."} Chiedi un nuovo link
            a chi te l'ha mandato.
          </p>
        </div>
      </div>
    );
  }

  if (aperta) {
    return (
      <div className={GUSCIO}>
        <div className={CARD}>
          <div className="mb-4 flex items-center gap-2">
            <Icon name="key" className="h-5 w-5" />
            <h1 className="text-lg font-semibold">
              {aperta.credenziali.length === 1
                ? aperta.credenziali[0].label
                : `${aperta.credenziali.length} credenziali`}
            </h1>
          </div>

          <div className="flex flex-col gap-5">
            {aperta.credenziali.map((c, idx) => (
              <div
                key={`${c.label}-${idx}`}
                className={
                  aperta.credenziali.length > 1
                    ? "rounded-xl border border-line p-4 dark:border-line-dark"
                    : ""
                }
              >
                {aperta.credenziali.length > 1 && (
                  <p className="mb-3 font-semibold">{c.label}</p>
                )}
                <div className="flex flex-col gap-3">
                  {c.url && <Riga etichetta="Indirizzo" valore={c.url} />}
                  {c.username && <Riga etichetta="Nome utente" valore={c.username} />}
                  {c.email && <Riga etichetta="Email" valore={c.email} />}
                  {c.secret && <Riga etichetta="Password" valore={c.secret} segreto />}
                  {c.totp && <Riga etichetta="Codice TOTP" valore={c.totp} segreto />}
                  {c.private_key && (
                    <Riga etichetta="Chiave privata" valore={c.private_key} segreto />
                  )}
                  {c.note && (
                    <p className="rounded-lg border border-line bg-cream p-3 text-sm dark:border-line-dark dark:bg-[#0E0F0E]">
                      {c.note}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          <p className="mt-5 text-xs text-muted dark:text-muted-dark">
            Salvale adesso in un posto sicuro: chiudendo questa pagina non si rivedono.
            {aperta.views_left != null &&
              ` Restano ${aperta.views_left} aperture su questo link.`}
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
          <h1 className="text-lg font-semibold">
            {dati.credenziali.length === 1
              ? dati.credenziali[0].label
              : `${dati.credenziali.length} credenziali per te`}
          </h1>
        </div>

        {dati.azienda && (
          <p className="mb-3 text-sm text-muted dark:text-muted-dark">
            Condivise da <strong>{dati.azienda}</strong>
          </p>
        )}

        {dati.credenziali.length > 1 && (
          <ul className="mb-4 flex flex-col gap-1 rounded-lg border border-line bg-cream p-3 text-sm dark:border-line-dark dark:bg-[#0E0F0E]">
            {dati.credenziali.map((c, idx) => (
              <li key={`${c.label}-${idx}`} className="flex items-center gap-2">
                <Icon name="key" className="h-3 w-3 shrink-0 text-muted dark:text-muted-dark" />
                {c.label}
              </li>
            ))}
          </ul>
        )}

        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void apri();
          }}
        >
          <Input
            type="password"
            label="Password del link"
            autoComplete="one-time-code"
            autoFocus
            placeholder="Te l'hanno comunicata a parte"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {errore && <p className="text-sm text-danger">{errore}</p>}

          <Button type="submit" loading={inCorso} className="mt-1">
            {dati.credenziali.length === 1 ? "Apri la credenziale" : "Apri le credenziali"}
          </Button>
        </form>

        <p className="mt-4 text-xs text-muted dark:text-muted-dark">
          Il link scade il {new Date(dati.expires_at).toLocaleDateString("it-IT")}
          {dati.views_left != null && ` e consente ancora ${dati.views_left} aperture`}.
          Ogni apertura viene registrata.
        </p>
      </div>
    </div>
  );
}
