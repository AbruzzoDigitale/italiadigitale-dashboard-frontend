import type { ContractCommercialStage } from "../api/contracts";

const COMMERCIAL_STAGE_TONES: Record<ContractCommercialStage, string> = {
  bozza: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-500/10 dark:text-slate-200 dark:border-slate-500/20",
  inviato: "bg-info/10 text-info border-info/20",
  in_trattativa: "bg-warning/10 text-warning border-warning/20",
  accettato: "bg-success/10 text-success border-success/20",
  contratto_inviato: "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-200 dark:border-violet-500/20",
  firmato: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:border-emerald-500/20",
  in_produzione: "bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-200 dark:border-cyan-500/20",
  completato: "bg-success/10 text-success border-success/20",
  perso: "bg-danger/10 text-danger border-danger/20",
};

export function getCommercialStageTone(stage: ContractCommercialStage): string {
  return COMMERCIAL_STAGE_TONES[stage];
}
