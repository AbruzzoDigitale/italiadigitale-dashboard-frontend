import { useState } from "react";
import { type VaultItem } from "../api/vault";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { Input } from "../components/ui/Input";
import { VaultItemModal } from "../features/vault/VaultItemModal";
import { VaultList } from "../features/vault/VaultList";
import { VAULT_VIEW_LABELS, type VaultView } from "../features/vault/grouping";
import { useAuth } from "../hooks/useAuth";
import { useSelectedCompanyId } from "../hooks/useSelectedCompanyId";

/**
 * Cassaforte credenziali.
 *
 * Le stesse voci, guardate da angolazioni diverse: per cliente, per sito, per
 * social, per cliente con dentro siti e social, per app. Il raggruppamento è in
 * `features/vault/grouping.ts` — qui c'è solo l'inquadratura.
 */
export function VaultPage() {
  const { user, activeCompanyId } = useAuth();
  const { selectedCompanyId } = useSelectedCompanyId(activeCompanyId ?? user?.company_id ?? null);
  const companyId = selectedCompanyId ?? activeCompanyId ?? user?.company_id ?? null;

  const [view, setView] = useState<VaultView>("client");
  const [q, setQ] = useState("");
  const [soloDaRinnovare, setSoloDaRinnovare] = useState(false);
  const [modaleAperta, setModaleAperta] = useState(false);
  const [inModifica, setInModifica] = useState<VaultItem | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  if (companyId == null) {
    return <p className="p-6 text-sm text-muted dark:text-muted-dark">Nessuna azienda selezionata.</p>;
  }

  const apriNuova = () => {
    setInModifica(null);
    setModaleAperta(true);
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <Icon name="key" className="h-5 w-5" />
          Cassaforte
        </h1>
        <Button className="ml-auto" onClick={apriNuova}>
          <Icon name="plus" className="mr-1 h-4 w-4" />
          Nuova credenziale
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(VAULT_VIEW_LABELS) as VaultView[]).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={
              "rounded-full border px-3 py-1 text-sm transition " +
              (view === v
                ? "border-primary bg-primary/10 font-medium text-primary"
                : "border-line text-muted hover:bg-muted/5 dark:border-line-dark dark:text-muted-dark")
            }
          >
            {VAULT_VIEW_LABELS[v]}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          <Input
            placeholder="Cerca etichetta, utente, URL…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <label className="flex shrink-0 items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={soloDaRinnovare}
              onChange={(e) => setSoloDaRinnovare(e.target.checked)}
            />
            Solo da rinnovare
          </label>
        </div>
      </div>

      <VaultList
        filters={{
          companyId,
          q: q.trim() || undefined,
          needsRotation: soloDaRinnovare || undefined,
        }}
        view={view}
        reloadKey={reloadKey}
        onEdit={(item) => {
          setInModifica(item);
          setModaleAperta(true);
        }}
        emptyHint="La cassaforte è vuota. Aggiungi la prima credenziale."
      />

      <VaultItemModal
        open={modaleAperta}
        onClose={() => setModaleAperta(false)}
        companyId={companyId}
        item={inModifica}
        onSaved={() => setReloadKey((k) => k + 1)}
      />
    </div>
  );
}
