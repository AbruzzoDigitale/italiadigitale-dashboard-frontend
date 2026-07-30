// Macchina a stati della scheda Revisione: derivazione fase + pulsanti contestuali.
// Condiviso tra ReviewTab (azioni inline) e WorkItemFormModal (footer del modale).
import type { ReviewSource } from "../../api/reviewComments";

export type ReviewPhase =
  | "lavorazione"
  | "interna"
  | "approvata_interna"
  | "cliente"
  | "approvata_cliente"
  | "pubblicazione"
  | "none";

/** Deriva la fase corrente da status + review_stage + client_approved_at. */
export function deriveReviewPhase(
  status: string | null | undefined,
  reviewStage: string | null | undefined,
  clientApprovedAt: string | null | undefined,
): ReviewPhase {
  if (status === "review") return (reviewStage as ReviewPhase) || "interna";
  if (clientApprovedAt) return "pubblicazione";
  if (status === "in_progress") return "lavorazione";
  return "none";
}

export type ReviewActionKey =
  | "sendToReview"
  | "approveInternally"
  | "sendToClient"
  | "approveClient"
  | "publish"
  | "complete"
  | "sendBack"
  | "reopen";

export interface ReviewActionButton {
  key: ReviewActionKey;
  label: string;
}

/** Coppia di pulsanti (primario/secondario) per la fase corrente. */
export function reviewPhaseButtons(phase: ReviewPhase): {
  primary?: ReviewActionButton;
  secondary?: ReviewActionButton;
} {
  const sendBack: ReviewActionButton = { key: "sendBack", label: "Rimanda indietro e correggi" };
  switch (phase) {
    case "lavorazione":
      return { primary: { key: "sendToReview", label: "Invia per la revisione" } };
    case "interna":
      return { primary: { key: "approveInternally", label: "Approva internamente" }, secondary: sendBack };
    case "approvata_interna":
      return { primary: { key: "sendToClient", label: "Invia al cliente" }, secondary: sendBack };
    case "cliente":
      return { primary: { key: "approveClient", label: "Approva (cliente)" }, secondary: sendBack };
    case "approvata_cliente":
      return { primary: { key: "publish", label: "Metti in pubblicazione" }, secondary: sendBack };
    case "pubblicazione":
      return {
        primary: { key: "complete", label: "Completa" },
        secondary: { key: "reopen", label: "Torna alla revisione" },
      };
    default:
      return {};
  }
}

export const REVIEW_PHASE_LABEL: Record<ReviewPhase, string> = {
  lavorazione: "In lavorazione",
  interna: "Revisione interna",
  approvata_interna: "Approvata internamente",
  cliente: "Revisione cliente",
  approvata_cliente: "Approvata dal cliente",
  pubblicazione: "In pubblicazione",
  none: "",
};

/** Fonte del rimando (rework) in base alla fase: le fasi cliente sono rimandi del cliente. */
export function sendBackSource(phase: ReviewPhase): ReviewSource {
  return phase === "cliente" || phase === "approvata_cliente" ? "cliente" : "interna";
}
