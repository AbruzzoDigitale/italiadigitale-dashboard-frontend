import { useCallback, useEffect, useRef, useState } from "react";
import { getDecreeQueueApi, type DecreeQueueStatus } from "../../api/websiteDecrees";
import { Icon } from "../../components/ui/Icon";

/**
 * Avanzamento della coda delle scansioni decreti.
 *
 * È l'unico pezzo di stato della funzione che sopravvive a un ricaricamento
 * della pagina, perché sta nel database e non nel browser: il bulk immediato
 * tiene l'avanzamento nello stato React e un F5 lo azzera, la coda no.
 *
 * Si interroga da sé finché c'è qualcosa in sospeso e sparisce quando la coda
 * si svuota, avvisando il genitore perché rilegga l'elenco.
 */

const INTERVALLO_MS = 15000;

interface WebsiteDecreeQueueBannerProps {
  /** Alzato dopo un accodamento: fa ripartire il controllo senza aspettare. */
  reloadKey?: number;
  /** Chiamato quando la coda passa da «qualcosa in sospeso» a vuota. */
  onSvuotata?: () => void;
}

function attesa(da: string | null): string {
  if (!da) return "";
  const minuti = Math.round((Date.now() - new Date(da).getTime()) / 60000);
  if (Number.isNaN(minuti) || minuti < 1) return "appena accodata";
  if (minuti < 60) return `in attesa da ${minuti} min`;
  const ore = Math.round(minuti / 60);
  return `in attesa da ${ore} ${ore === 1 ? "ora" : "ore"}`;
}

export function WebsiteDecreeQueueBanner({
  reloadKey = 0,
  onSvuotata,
}: WebsiteDecreeQueueBannerProps) {
  const [stato, setStato] = useState<DecreeQueueStatus | null>(null);
  // Serve a distinguere «coda appena svuotata» da «non c'è mai stata coda»:
  // solo la prima merita di avvisare il genitore.
  const avevaCoda = useRef(false);

  const controlla = useCallback(async () => {
    try {
      const nuovo = await getDecreeQueueApi();
      setStato(nuovo);
      const inSospeso = nuovo.pending + nuovo.running > 0;
      if (avevaCoda.current && !inSospeso) onSvuotata?.();
      avevaCoda.current = inSospeso;
    } catch {
      // Un controllo che fallisce non deve far comparire un errore sopra
      // l'elenco dei siti: si riproverà al giro dopo.
    }
  }, [onSvuotata]);

  useEffect(() => {
    void controlla();
  }, [controlla, reloadKey]);

  useEffect(() => {
    const inSospeso = (stato?.pending ?? 0) + (stato?.running ?? 0) > 0;
    if (!inSospeso) return;
    const t = window.setInterval(() => void controlla(), INTERVALLO_MS);
    return () => window.clearInterval(t);
  }, [stato, controlla]);

  const inSospeso = (stato?.pending ?? 0) + (stato?.running ?? 0) > 0;
  if (!stato || !inSospeso) return null;

  const totale = stato.done + stato.pending + stato.running;
  const percentuale = totale > 0 ? Math.round((stato.done / totale) * 100) : 0;

  return (
    <div className="mb-4 flex flex-none flex-col gap-2 rounded-md border border-brand-magenta/30 bg-brand-magenta/5 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-3">
        <Icon name="clock" className="h-4 w-4 text-brand-magenta" />
        <span className="text-[13px] font-semibold text-ink dark:text-[#f4f4f7]">
          Scansione decreti in coda: {stato.done} di {totale}
        </span>
        {stato.running > 0 && (
          <span className="text-[12px] text-muted dark:text-[#9999a0]">
            {stato.running} in esecuzione
          </span>
        )}
        <span className="text-[12px] text-muted dark:text-[#9999a0]">
          {attesa(stato.oldest_queued_at)}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-line dark:bg-[#2a2a2e]">
        <div
          className="h-full rounded-full bg-brand-magenta transition-all duration-500"
          style={{ width: `${percentuale}%` }}
        />
      </div>
      <p className="text-[11.5px] text-muted dark:text-[#9999a0]">
        La esegue il controllo automatico: puoi chiudere questa pagina, la coda resta. I referti
        compaiono nella scheda di ogni sito man mano che arrivano.
      </p>
    </div>
  );
}
