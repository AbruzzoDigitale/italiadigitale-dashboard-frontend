// Parametro e link della comunicazione aperta per esteso.
//
// Sta in un modulo suo (e non nel componente) perché lo usano anche il centro
// notifiche e la pagina Comunicazioni: tenerlo insieme al modal romperebbe il
// fast refresh e legherebbe due cose che cambiano per motivi diversi.

export const COMM_PARAM = "comunicazione";

/**
 * Link condivisibile di una comunicazione, valido per qualunque ruolo: il modal
 * vive nel layout, quindi si apre su qualsiasi pagina. Si punta alla radice
 * perché /comunicazioni è riservata ad admin e PM, e chi non può entrarci viene
 * portato alla sua pagina di partenza conservando il parametro.
 */
export function communicationLink(id: number): string {
  return `/?${COMM_PARAM}=${id}`;
}
