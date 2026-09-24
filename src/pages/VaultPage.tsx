import { useState } from "react";
import { type VaultItem } from "../api/vault";
import { Button } from "../components/ui/Button";
import { Checkbox } from "../components/ui/Checkbox";
import { Icon } from "../components/ui/Icon";
import { Input } from "../components/ui/Input";
import { PageSectionHeader } from "../components/ui/PageSectionHeader";
import { SegmentedSwitch } from "../components/ui/SegmentedSwitch";
import { VaultImportModal } from "../features/vault/VaultImportModal";
import { VaultItemModal } from "../features/vault/VaultItemModal";
import { VaultRequestModal } from "../features/vault/VaultRequestModal";
import { VaultList } from "../features/vault/VaultList";
import { type VaultView } from "../features/vault/grouping";
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
  const [importAperto, setImportAperto] = useState(false);
  const [richiestaAperta, setRichiestaAperta] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <div className="mx-auto flex h-full w-full flex-col px-6 py-8 min-h-0 animate-fadeIn">
      <div className="flex flex-none flex-wrap items-center justify-between gap-3">
        <PageSectionHeader
          icon={<Icon name="key" className="w-6 h-6" />}
          title="Cassaforte"
          lead="Credenziali condivise, cifrate e tracciate."
        />
        <SegmentedSwitch
          value={view}
          onChange={setView}
          ariaLabel="Come raggruppare le credenziali"
          options={[
            { value: "client", label: <><Icon name="users" className="w-3.5 h-3.5" />Cliente</> },
            { value: "website", label: <><Icon name="target" className="w-3.5 h-3.5" />Siti</> },
            { value: "social", label: <><Icon name="globe" className="w-3.5 h-3.5" />Social</> },
            {
              value: "client-tree",
              label: <><Icon name="list" className="w-3.5 h-3.5" />Cliente › siti e social</>,
              title: "Per cliente, con siti e profili social annidati",
            },
            { value: "app", label: <><Icon name="grid" className="w-3.5 h-3.5" />App</> },
          ]}
        />
      </div>

      {companyId == null ? (
        <p className="mt-6 text-sm text-muted dark:text-muted-dark">
          Nessuna azienda selezionata.
        </p>
      ) : (
        <>
          <div className="mt-4 flex flex-none flex-wrap items-center gap-3">
            <Input
              placeholder="Cerca etichetta, utente, URL…"
              // Senza nome e con l'autofill attivo il browser ci infilava la mail
              // dell'account appena apriva un campo password altrove nella pagina.
              name="cerca-cassaforte"
              autoComplete="off"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-64"
            />
            <button
              type="button"
              onClick={() => setSoloDaRinnovare((v) => !v)}
              className="inline-flex shrink-0 items-center gap-2 self-start text-[12.5px] text-ink dark:text-[#f4f4f7]"
            >
              <Checkbox checked={soloDaRinnovare} onChange={setSoloDaRinnovare} />
              Solo da rinnovare
            </button>
            <Button
              variant="secondary"
              className="ml-auto"
              onClick={() => setRichiestaAperta(true)}
              title="Manda un link a un cliente perché inserisca lui la password"
            >
              <Icon name="mail" className="mr-1 h-4 w-4" />
              Richiedi credenziale
            </Button>
            <Button
              variant="secondary"
              onClick={() => setImportAperto(true)}
            >
              <Icon name="upload" className="mr-1 h-4 w-4" />
              Importa da CSV
            </Button>
            <Button
              onClick={() => {
                setInModifica(null);
                setModaleAperta(true);
              }}
            >
              <Icon name="plus" className="mr-1 h-4 w-4" />
              Nuova credenziale
            </Button>
          </div>

          <div className="mt-4 min-h-0 flex-1 overflow-auto">
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
          </div>

          <VaultRequestModal
            open={richiestaAperta}
            onClose={() => setRichiestaAperta(false)}
            companyId={companyId}
            onCreated={() => setReloadKey((k) => k + 1)}
          />

          <VaultImportModal
            open={importAperto}
            onClose={() => setImportAperto(false)}
            companyId={companyId}
            onImported={() => setReloadKey((k) => k + 1)}
          />

          <VaultItemModal
            open={modaleAperta}
            onClose={() => setModaleAperta(false)}
            companyId={companyId}
            item={inModifica}
            onSaved={() => setReloadKey((k) => k + 1)}
          />
        </>
      )}
    </div>
  );
}
