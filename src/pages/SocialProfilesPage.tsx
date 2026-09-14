import { SocialProfilesTab } from "../features/company/SocialProfilesTab";
import { Icon } from "../components/ui/Icon";
import { PageSectionHeader } from "../components/ui/PageSectionHeader";
import { useAuth } from "../hooks/useAuth";
import { useSelectedCompanyId } from "../hooks/useSelectedCompanyId";

/**
 * Registro dei profili social gestiti dall'azienda, visibile a tutti
 * (admin, PM e operatori); la gestione è riservata ad admin e PM.
 */
export function SocialProfilesPage() {
  const { user, activeCompanyId } = useAuth();
  const { selectedCompanyId } = useSelectedCompanyId(
    activeCompanyId ?? user?.company_id ?? null
  );
  const currentCompanyId = selectedCompanyId ?? activeCompanyId ?? user?.company_id ?? null;

  // Tutti (anche gli operatori) possono aggiungere/gestire i profili social;
  // solo admin/PM possono creare nuovi TIPI di piattaforma dal dropdown.
  const canCreatePlatforms = !!user?.is_admin || user?.access_level === "project_manager";

  return (
    <div className="px-6 py-8 mx-auto w-full h-full flex flex-col min-h-0 animate-fadeIn">
      <PageSectionHeader icon={<Icon name="globe" className="w-6 h-6" />} title="Profili social" />

      {currentCompanyId != null && (
        <div className="flex-1 min-h-0">
          <SocialProfilesTab
            companyId={currentCompanyId}
            canManage
            canCreatePlatforms={canCreatePlatforms}
            fillHeight
          />
        </div>
      )}
    </div>
  );
}
