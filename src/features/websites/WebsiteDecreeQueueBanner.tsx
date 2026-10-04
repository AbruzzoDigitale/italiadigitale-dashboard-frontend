import { getDecreeQueueApi } from "../../api/websiteDecrees";
import { WebsiteScanQueueBanner } from "./WebsiteScanQueueBanner";

/**
 * Avanzamento della coda delle scansioni decreti.
 *
 * La meccanica — interrogazione periodica, barra, avviso quando la coda si
 * svuota — sta in `WebsiteScanQueueBanner`, condivisa con la coda dei controlli
 * tecnici. Qui restano solo le parole, che sono l'unica differenza.
 */

interface WebsiteDecreeQueueBannerProps {
  reloadKey?: number;
  onSvuotata?: () => void;
}

export function WebsiteDecreeQueueBanner({
  reloadKey = 0,
  onSvuotata,
}: WebsiteDecreeQueueBannerProps) {
  return (
    <WebsiteScanQueueBanner
      titolo="Scansione decreti in coda"
      leggiStato={getDecreeQueueApi}
      nota="La esegue il controllo automatico: puoi chiudere questa pagina, la coda resta. I referti compaiono nella scheda di ogni sito man mano che arrivano."
      reloadKey={reloadKey}
      onSvuotata={onSvuotata}
    />
  );
}
