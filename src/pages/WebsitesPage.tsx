import { useState } from "react";
import { WebsitesTab } from "../features/websites/WebsitesTab";
import { WebsiteThemesTab } from "../features/websites/WebsiteThemesTab";
import { Icon } from "../components/ui/Icon";
import { PageSectionHeader } from "../components/ui/PageSectionHeader";
import { SegmentedSwitch } from "../components/ui/SegmentedSwitch";
import { useAuth } from "../hooks/useAuth";
import { useSelectedCompanyId } from "../hooks/useSelectedCompanyId";

type WebsitesView = "siti" | "temi";

/**
 * Registro dei siti web dei clienti, visibile a tutti (admin, PM e operatori),
 * con la sezione dei temi accanto. Le tassonomie (tipo, categoria, stato) si
 * configurano dal pannello Azienda → Siti web.
 */
export function WebsitesPage() {
  const { user, activeCompanyId } = useAuth();
  const { selectedCompanyId } = useSelectedCompanyId(activeCompanyId ?? user?.company_id ?? null);
  const currentCompanyId = selectedCompanyId ?? activeCompanyId ?? user?.company_id ?? null;

  const [view, setView] = useState<WebsitesView>(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    return tab === "temi" ? "temi" : "siti";
  });

  const changeView = (next: WebsitesView) => {
    setView(next);
    const params = new URLSearchParams(window.location.search);
    if (next === "siti") params.delete("tab");
    else params.set("tab", next);
    const qs = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
  };

  // Solo PM e admin possono condividere un campo personalizzato con l'azienda.
  const canShareFields = !!user?.is_admin || user?.access_level === "project_manager";

  return (
    <div className="mx-auto flex h-full w-full flex-col px-6 py-8 min-h-0 animate-fadeIn">
      <div className="flex flex-none flex-wrap items-center justify-between gap-3">
        <PageSectionHeader icon={<Icon name="globe" className="w-6 h-6" />} title="Siti web" />
        <SegmentedSwitch
          value={view}
          onChange={changeView}
          ariaLabel="Sezione siti web"
          options={[
            { value: "siti", label: <><Icon name="list" className="w-3.5 h-3.5" />Siti</> },
            { value: "temi", label: <><Icon name="grid" className="w-3.5 h-3.5" />Temi</> },
          ]}
        />
      </div>

      {currentCompanyId != null && (
        <div className="min-h-0 flex-1">
          {view === "siti" ? (
            <WebsitesTab
              companyId={currentCompanyId}
              canManage
              canShareFields={canShareFields}
              fillHeight
            />
          ) : (
            <WebsiteThemesTab companyId={currentCompanyId} fillHeight />
          )}
        </div>
      )}
    </div>
  );
}
