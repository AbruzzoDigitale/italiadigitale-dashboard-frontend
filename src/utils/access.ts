import type { UserPermissions } from "../api/users";

export type AppRouteKey =
  | "dashboard"
  | "contracts"
  | "clients-situation"
  | "workload"
  | "daily-tasks"
  | "configurator"
  | "preventivo"
  | "requests"
  | "quotes"
  | "clients"
  | "social"
  | "catalog"
  | "llm"
  | "profile"
  | "work-items"
  | "admin";

export function canAccessRoute(
  permissions: UserPermissions | null,
  route: AppRouteKey
): boolean {
  if (!permissions) return false;
  if (route === "admin") return permissions.is_admin;

  switch (route) {
    case "dashboard":
      return permissions.allowed_views.includes("dashboard");
    case "contracts":
      return permissions.is_admin;
    case "clients-situation":
      return permissions.is_admin;
    case "workload":
      // Admins get the full workload page; every other authenticated user (operatore)
      // gets the restricted calendar-only / self-only view enforced inside WorkloadPage.
      return true;
    case "daily-tasks":
      // Come per il workload: ogni utente autenticato (operatore) accede. La pagina mostra
      // di default la vista "Mie task"; il toggle "Team" resta riservato agli admin.
      return true;
    case "configurator":
      return permissions.allowed_views.includes("configurator");
    case "preventivo":
      return permissions.allowed_views.includes("preventivo");
    case "requests":
      return permissions.can_view_requests || permissions.allowed_views.includes("requests");
    case "quotes":
      return permissions.can_view_quotes || permissions.allowed_views.includes("quotes");
    case "clients":
      return permissions.can_view_clients || permissions.allowed_views.includes("clients");
    case "social":
      return permissions.can_view_social_packages || permissions.allowed_views.includes("social");
    case "catalog":
      return permissions.can_view_catalog || permissions.allowed_views.includes("catalog");
    case "llm":
      return permissions.is_admin || permissions.can_use_llm || permissions.allowed_views.includes("llm");
    case "profile":
      return permissions.allowed_views.includes("profile");
    case "work-items":
      // All authenticated users can access; the API enforces fine-grained RBAC
      return true;
    default:
      return false;
  }
}

export function getFallbackRoute(permissions: UserPermissions | null): string {
  if (!permissions) return "/";
  if (permissions.allowed_views.includes("dashboard")) return "/";
  if (permissions.allowed_views.includes("workload")) return "/workload";
  if (permissions.allowed_views.includes("preventivo")) return "/preventivo";
  if (permissions.can_view_requests) return "/requests";
  if (permissions.can_view_catalog) return "/catalog";
  return "/profile";
}
