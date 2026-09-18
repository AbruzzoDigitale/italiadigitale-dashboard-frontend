import { useState } from "react";
import { type VaultItem } from "../../api/vault";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { VaultItemModal } from "../vault/VaultItemModal";
import { VaultList } from "../vault/VaultList";

/**
 * Accessi di un sito, visti dalla scheda del sito.
 *
 * Non è più una cassaforte a sé: è la cassaforte unica filtrata sui
 * collegamenti a questo sito. Le stesse credenziali si vedono anche dalla
 * pagina Cassaforte, raggruppate per cliente o per social.
 */

interface WebsiteSecretsPanelProps {
  websiteId: number;
  companyId: number;
}

export function WebsiteSecretsPanel({ websiteId, companyId }: WebsiteSecretsPanelProps) {
  const [modaleAperta, setModaleAperta] = useState(false);
  const [inModifica, setInModifica] = useState<VaultItem | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <div className="rounded-lg border border-line bg-surface p-3 dark:border-line-dark dark:bg-surface-dark">
      <div className="mb-2 flex items-center gap-2">
        <Icon name="key" className="h-4 w-4" />
        <h3 className="font-semibold">Accessi</h3>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          onClick={() => {
            setInModifica(null);
            setModaleAperta(true);
          }}
        >
          <Icon name="plus" className="mr-1 h-4 w-4" />
          Aggiungi
        </Button>
      </div>

      <VaultList
        filters={{ companyId, targetType: "website", targetId: websiteId }}
        view="website"
        reloadKey={reloadKey}
        onEdit={(item) => {
          setInModifica(item);
          setModaleAperta(true);
        }}
        emptyHint="Nessun accesso salvato per questo sito."
      />

      <VaultItemModal
        open={modaleAperta}
        onClose={() => setModaleAperta(false)}
        companyId={companyId}
        item={inModifica}
        linkFisso={{ target_type: "website", target_id: websiteId }}
        onSaved={() => setReloadKey((k) => k + 1)}
      />
    </div>
  );
}
