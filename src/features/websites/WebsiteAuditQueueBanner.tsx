import { getAuditQueueApi } from "../../api/websiteAudits";
import { WebsiteScanQueueBanner } from "./WebsiteScanQueueBanner";

/**
 * Avanzamento della coda dei controlli tecnici.
 *
 * Stessa meccanica della coda decreti, in `WebsiteScanQueueBanner`: qui
 * cambiano solo le parole e la rotta da interrogare.
 */

interface WebsiteAuditQueueBannerProps {
  reloadKey?: number;
  onSvuotata?: () => void;
}

export function WebsiteAuditQueueBanner({
  reloadKey = 0,
  onSvuotata,
}: WebsiteAuditQueueBannerProps) {
  return (
    <WebsiteScanQueueBanner
      titolo="Controlli tecnici in coda"
      leggiStato={getAuditQueueApi}
      nota="Li esegue il controllo automatico: puoi chiudere questa pagina, la coda resta. I referti compaiono nella scheda di ogni sito man mano che arrivano."
      reloadKey={reloadKey}
      onSvuotata={onSvuotata}
    />
  );
}
