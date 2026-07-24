import { Badge } from "../../ui/Badge";

type Variant = "default" | "success" | "warning" | "danger" | "info";

const WI: Record<string, [string, Variant]> = {
  planned: ["Da fare", "default"],
  in_progress: ["In corso", "info"],
  review: ["Revisione", "warning"],
  completed: ["Completata", "success"],
  blocked: ["Bloccata", "danger"],
  cancelled: ["Annullata", "default"],
};

export function WorkItemStatusBadge({ status }: { status: string }) {
  const [label, v] = WI[status] ?? [status, "default"];
  return <Badge variant={v}>{label}</Badge>;
}

const Q: Record<string, Variant> = {
  bozza: "default",
  da_approvare: "warning",
  in_revisione: "warning",
  inviato: "info",
  in_trattativa: "info",
  accettato: "success",
  perso: "danger",
  rifiutato: "danger",
};

export function QuoteStatusBadge({ status }: { status: string }) {
  return <Badge variant={Q[status] ?? "default"}>{status.replace(/_/g, " ")}</Badge>;
}

const STAGE: Record<string, Variant> = {
  bozza: "default",
  inviato: "info",
  in_trattativa: "info",
  accettato: "success",
  contratto_inviato: "info",
  firmato: "success",
  in_produzione: "warning",
  completato: "success",
  perso: "danger",
};

export function ContractStageBadge({ stage }: { stage: string }) {
  return <Badge variant={STAGE[stage] ?? "default"}>{stage.replace(/_/g, " ")}</Badge>;
}
