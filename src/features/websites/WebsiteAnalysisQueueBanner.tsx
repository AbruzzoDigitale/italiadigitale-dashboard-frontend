import { getWebsiteScanQueueApi } from "../../api/websites";
import { WebsiteScanQueueBanner } from "./WebsiteScanQueueBanner";

/**
 * Avanzamento della coda dell'analisi automatica (PageSpeed).
 *
 * Perché esiste: «Metti in coda» scriveva la coda nel database — quindi il
 * lavoro sopravviveva già a un F5 — ma non la mostrava più. Chiuso il toast,
 * l'operatore non aveva modo di sapere se quei siti erano ancora in attesa o
 * già fatti, e la coda sembrava non essere mai esistita. Qui il lavoro e la sua
 * visibilità tornano a durare quanto la coda, come per decreti e controlli.
 *
 * La nota in fondo dichiara due cose che altrimenti fanno sembrare il banner
 * rotto: che il giro passa **ogni ora** e ne prende tre per volta (quindi su
 * venti siti ci vogliono ore, non minuti), e che il conteggio comprende i siti
 * diventati scaduti da soli — non solo quelli accodati a mano. Senza la seconda
 * riga l'operatore vede un numero che non ha creato lui e pensa a un errore.
 */

interface WebsiteAnalysisQueueBannerProps {
  reloadKey?: number;
  onSvuotata?: () => void;
}

export function WebsiteAnalysisQueueBanner({
  reloadKey = 0,
  onSvuotata,
}: WebsiteAnalysisQueueBannerProps) {
  return (
    <WebsiteScanQueueBanner
      titolo="Analisi automatica in coda"
      leggiStato={getWebsiteScanQueueApi}
      nota="La esegue il controllo automatico ogni ora, tre siti per volta: su molti siti ci vogliono ore, e puoi chiudere la pagina senza perdere la coda. Il conteggio comprende anche i siti diventati scaduti da soli con la cadenza aziendale, non solo quelli accodati a mano."
      reloadKey={reloadKey}
      onSvuotata={onSvuotata}
    />
  );
}
