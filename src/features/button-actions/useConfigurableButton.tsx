import { useCallback, useEffect, useMemo, useState } from "react";
import { getActionCatalogApi, type ActionCatalog } from "../../api/buttonActions";
import { ActionConfigModal } from "./ActionConfigModal";
import { ActionRunModal } from "./ActionRunModal";
import { useButtonState } from "./useButtonState";

// Tutto il contorno di un bottone configurabile in una riga sola per chi lo usa:
// stato delle righe, popup di configurazione e modale di esecuzione.
//
//   const avviso = useConfigurableButton(companyId, "website.update_notice", ids);
//   …
//   <ActionButton state={avviso.item(site.id)} … onRun={() => avviso.run([{…}])} />
//   {avviso.modals}
//
// I due modali vanno resi UNA volta sola nella pagina, non per riga: sono
// finestre, e una per sito significherebbe cento nodi inutili.

export interface ConfigurableButtonTarget {
  id: number;
  label: string;
}

export function useConfigurableButton(
  companyId: number | null,
  buttonKey: string,
  entityIds: number[],
) {
  const { state, byEntity, reload } = useButtonState(companyId, buttonKey, entityIds);
  const [catalog, setCatalog] = useState<ActionCatalog | null>(null);
  const [configuring, setConfiguring] = useState<{ entityId: number | null } | null>(null);
  const [running, setRunning] = useState<ConfigurableButtonTarget[] | null>(null);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const cat = await getActionCatalogApi();
        if (vivo) setCatalog(cat);
      } catch {
        // Senza catalogo i modali non si aprono: il bottone resta muto,
        // che è lo stesso comportamento di un bottone non configurato.
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const item = useCallback((entityId: number) => byEntity.get(entityId), [byEntity]);

  const label = state?.label ?? "";
  const canConfigure = state?.can_configure ?? false;

  const modals = useMemo(
    () => (
      <>
        {companyId != null && configuring && (
          <ActionConfigModal
            open
            onClose={() => setConfiguring(null)}
            companyId={companyId}
            buttonKey={buttonKey}
            entityId={configuring.entityId}
            onSaved={reload}
          />
        )}
        {companyId != null && running && running.length > 0 && (
          <ActionRunModal
            open
            onClose={() => setRunning(null)}
            companyId={companyId}
            buttonKey={buttonKey}
            targets={running}
            catalog={catalog}
            onDone={reload}
          />
        )}
      </>
    ),
    [companyId, buttonKey, configuring, running, catalog, reload],
  );

  return {
    state,
    label,
    canConfigure,
    item,
    /** Apre il popup di configurazione (solo admin). */
    configure: (entityId: number | null) => setConfiguring({ entityId }),
    /** Apre il modale di esecuzione su una o più righe. */
    run: (targets: ConfigurableButtonTarget[]) => setRunning(targets),
    /** Le righe selezionate sono configurate? Serve alla barra multipla.
     *  Lo stato si conosce solo per le righe a video: di una selezione fatta su
     *  un'altra pagina non si sa nulla, e non è un motivo per nascondere il
     *  bottone — la configurazione normale vale per tutte le righe. */
    allConfigured: (ids: number[]) => {
      const note = ids.filter((id) => byEntity.has(id));
      return note.length > 0 && note.every((id) => byEntity.get(id)?.configured);
    },
    reload,
    modals,
  };
}
