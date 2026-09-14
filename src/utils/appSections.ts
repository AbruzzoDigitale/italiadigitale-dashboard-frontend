/**
 * Catalogo delle sezioni del gestionale, in forma di DATI (niente JSX).
 *
 * È la sorgente unica sia della sidebar (`layouts/DashboardLayout.tsx`, che ci costruisce
 * sopra le voci con le icone) sia del widget "Scorciatoie": una voce aggiunta qui compare
 * in entrambi, e non c'è modo che i due elenchi divergano.
 */

import type { IconName } from "../components/ui/Icon";
import type { AppRouteKey } from "./access";

export type AppSectionGroup = "overview" | "operations" | "commercial" | "catalog" | "account" | "admin";

export interface AppSection {
  label: string;
  to: string;
  icon: IconName;
  routeKey: AppRouteKey;
  group: AppSectionGroup;
}

export const APP_SECTIONS: AppSection[] = [
  { label: "Dashboard", to: "/", icon: "home", routeKey: "dashboard", group: "overview" },
  { label: "Lavorazioni", to: "/work-items", icon: "list", routeKey: "work-items", group: "operations" },
  { label: "Workload", to: "/workload", icon: "calendar", routeKey: "workload", group: "operations" },
  { label: "Attività del giorno", to: "/daily-tasks", icon: "clock", routeKey: "daily-tasks", group: "operations" },
  { label: "Comunicazioni", to: "/comunicazioni", icon: "annotation", routeKey: "comunicazioni", group: "operations" },
  { label: "Controllo PED", to: "/controllo-ped", icon: "check-circle", routeKey: "controllo-ped", group: "operations" },
  { label: "Profili social", to: "/profili-social", icon: "globe", routeKey: "social-profiles", group: "operations" },
  { label: "Monitoraggio social", to: "/monitoraggio-social", icon: "activity", routeKey: "social-monitors", group: "operations" },
  { label: "Siti web", to: "/siti-web", icon: "target", routeKey: "websites", group: "operations" },
  { label: "Prenotazione sale", to: "/prenotazione-sale", icon: "calendar", routeKey: "prenotazione-sale", group: "operations" },
  { label: "Rimborsi trasferte", to: "/rimborsi", icon: "map-pin", routeKey: "rimborsi", group: "operations" },
  { label: "Report", to: "/report", icon: "document-text", routeKey: "reports", group: "operations" },
  // Browser interno nascosto per ora (non ancora affidabile): i collegamenti
  // rapidi aprono direttamente in una nuova scheda. Riabilitare quando pronto.
  // { label: "Browser", to: "/browser", icon: "globe", routeKey: "profile", group: "operations" },
  { label: "Clienti", to: "/clients", icon: "users", routeKey: "clients", group: "commercial" },
  { label: "Situazione clienti", to: "/clients-situation", icon: "activity", routeKey: "clients-situation", group: "commercial" },
  { label: "Richieste", to: "/requests", icon: "mail", routeKey: "requests", group: "commercial" },
  { label: "Preventivi", to: "/quotes", icon: "document-text", routeKey: "quotes", group: "commercial" },
  { label: "Pipeline commerciale", to: "/contracts-pipeline", icon: "target", routeKey: "contracts", group: "commercial" },
  { label: "Fatturazione", to: "/fatturazione", icon: "credit-card", routeKey: "fatturazione", group: "commercial" },
  { label: "Catalogo", to: "/catalog", icon: "grid", routeKey: "catalog", group: "catalog" },
  { label: "Configuratore", to: "/configuratore", icon: "tools", routeKey: "configurator", group: "catalog" },
  { label: "Pacchetti Social", to: "/social-packages", icon: "star", routeKey: "social", group: "catalog" },
  { label: "Presentazione Social", to: "/social-packages-presentation", icon: "eye", routeKey: "social", group: "catalog" },
  { label: "Profilo", to: "/profile", icon: "user-circle", routeKey: "profile", group: "account" },
  { label: "Documenti", to: "/documenti", icon: "document-text", routeKey: "documenti", group: "admin" },
  { label: "Storico email", to: "/storico-email", icon: "mail", routeKey: "admin", group: "admin" },
  { label: "Utenti", to: "/users", icon: "shield-check", routeKey: "admin", group: "admin" },
  { label: "Aziende", to: "/companies", icon: "building", routeKey: "admin", group: "admin" },
];

/** Scorciatoie proposte a chi non ha ancora scelto le proprie. */
export const DEFAULT_SHORTCUTS = [
  "/work-items",
  "/daily-tasks",
  "/workload",
  "/clients",
  "/prenotazione-sale",
  "/rimborsi",
];

export function findSection(to: string): AppSection | undefined {
  return APP_SECTIONS.find((s) => s.to === to);
}
