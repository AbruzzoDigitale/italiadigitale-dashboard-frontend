import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { Spinner } from "../../components/ui/Spinner";
import { cancelOracleActionApi, confirmOracleActionApi } from "../../api/oracle";

/**
 * La scheda di conferma: l'unico punto in cui l'Oracolo può cambiare qualcosa.
 *
 * I due pulsanti mandano solo l'id. Cosa verrà fatto è già deciso e congelato sul
 * server: da qui non si può modificare, solo accettare o rifiutare esattamente ciò
 * che è scritto sopra. Per questo il riepilogo e i dettagli stanno in primo piano e
 * i pulsanti sotto — si legge, poi si decide.
 */

type Stato = "pending" | "confirmed" | "cancelled" | "failed";

export function OracleActionCard({
  azioneId,
  riepilogo,
  dettagli,
}: {
  azioneId: number;
  riepilogo: string;
  dettagli: Record<string, string>;
}) {
  const [stato, setStato] = useState<Stato>("pending");
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const decidi = async (scelta: "confirm" | "cancel") => {
    setInCorso(true);
    setErrore(null);
    try {
      const esito =
        scelta === "confirm"
          ? await confirmOracleActionApi(azioneId)
          : await cancelOracleActionApi(azioneId);
      setStato(esito.state as Stato);
    } catch (e) {
      setErrore((e as Error).message);
    } finally {
      setInCorso(false);
    }
  };

  const chiusa = stato !== "pending";

  return (
    <div
      className={`mt-2 rounded-lg border px-3 py-2.5 ${
        stato === "confirmed"
          ? "border-emerald-300 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30"
          : stato === "pending"
            ? "border-brand-magenta/40 bg-paper dark:bg-[#1c1c20]"
            : "border-line dark:border-[#2a2a2e] bg-cream dark:bg-[#1c1c20]"
      }`}
    >
      <div className="flex items-start gap-2">
        <Icon
          name={stato === "confirmed" ? "check-circle" : "alert-triangle"}
          className={`w-4 h-4 mt-px shrink-0 ${
            stato === "confirmed" ? "text-emerald-600 dark:text-emerald-400" : "text-brand-magenta"
          }`}
        />
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold text-ink dark:text-[#f4f4f7]">{riepilogo}</p>

          {Object.keys(dettagli).length ? (
            <dl className="mt-1.5 grid grid-cols-[auto,1fr] gap-x-3 gap-y-0.5 text-[11px]">
              {Object.entries(dettagli).map(([etichetta, valore]) => (
                <div key={etichetta} className="contents">
                  <dt className="text-muted dark:text-[#9999a0]">{etichetta}</dt>
                  <dd className="text-ink dark:text-[#f4f4f7] truncate">{valore}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          {errore ? <p className="mt-1.5 text-[11px] text-danger">{errore}</p> : null}

          {chiusa ? (
            <p className="mt-1.5 text-[11px] text-muted dark:text-[#9999a0]">
              {stato === "confirmed"
                ? "Fatto."
                : stato === "cancelled"
                  ? "Annullata: non è stato modificato nulla."
                  : "Non eseguita."}
            </p>
          ) : (
            <div className="mt-2 flex items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                disabled={inCorso}
                onClick={() => void decidi("confirm")}
              >
                {inCorso ? <Spinner size="sm" /> : "Conferma"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={inCorso}
                onClick={() => void decidi("cancel")}
              >
                Annulla
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
