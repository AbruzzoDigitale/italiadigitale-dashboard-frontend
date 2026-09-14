// ─────────────────────────────────────────────────────────────────────────────
// Stato di una lavorazione: etichetta, colore e casi speciali della revisione.
//
// FONTE UNICA. Prima viveva dentro WorkloadPage e l'accordion era l'unico posto a
// mostrare lo stato: "Attività del giorno" usava lo stesso slot per la percentuale di
// avanzamento, quindi lì lo stato non si vedeva affatto. Chi mostra una card di
// lavorazione importa da qui, così la stessa task si legge uguale ovunque.
// ─────────────────────────────────────────────────────────────────────────────

/** Consegnata al cliente e in attesa: colore ciano, come nella board Lavorazioni. */
export const SENT_TO_CLIENT_COLOR = "#2ec3f3";

/** Approvata/pronta ma non ancora pubblicata. Usata anche nell'intestazione del modal. */
export const AWAITING_PUBLISH_BADGE = {
  label: "In pubblicazione",
  color: "#0c8a57",
  title: "Approvata/pronta ma non ancora pubblicata",
} as const;

/** Stessa palette della board Lavorazioni: lo stesso stato ha lo stesso colore ovunque. */
export const TASK_STATUS_META: Record<string, { label: string; color: string }> = {
  in_progress: { label: "In corso", color: "#378ADD" },
  planned: { label: "Da fare", color: "#888780" },
  review: { label: "In revisione", color: "#EF9F27" },
  completed: { label: "Completata", color: "#639922" },
  done: { label: "Completata", color: "#639922" },
  blocked: { label: "Bloccata", color: "#E24B4A" },
  cancelled: { label: "Annullata", color: "#8c8d87" },
};

export function taskStatusMeta(status: string): { label: string; color: string } {
  return TASK_STATUS_META[status] ?? { label: status, color: "#8c8d87" };
}

/**
 * In revisione E già consegnata al cliente: non pesa sull'operatore e si distingue a
 * colpo d'occhio dalla revisione interna, che invece richiede lavoro.
 */
export function isSentToClient(task: { status: string; delivered_to_client_at?: string | null }): boolean {
  return task.status === "review" && !!task.delivered_to_client_at;
}

/**
 * Le tre etichette che descrivono lo stato di una lavorazione in una card, nell'ordine
 * in cui vanno mostrate. Ricavarle qui evita che ogni pagina se le ricomponga a modo suo.
 */
export function taskStatusBadges(task: {
  status: string;
  delivered_to_client_at?: string | null;
  client_approved_at?: string | null;
}): Array<{ key: string; label: string; color: string; title?: string }> {
  const badges: Array<{ key: string; label: string; color: string; title?: string }> = [];
  if (task.client_approved_at) {
    badges.push({ key: "awaiting-publish", ...AWAITING_PUBLISH_BADGE });
  }
  if (isSentToClient(task)) {
    badges.push({
      key: "status",
      label: "Al cliente",
      color: SENT_TO_CLIENT_COLOR,
      title: "Consegnata al cliente, in attesa (non pesa sull'operatore)",
    });
  } else {
    const meta = taskStatusMeta(task.status);
    badges.push({ key: "status", label: meta.label, color: meta.color });
  }
  return badges;
}
