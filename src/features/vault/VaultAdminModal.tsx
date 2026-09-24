import { useState } from "react";
import { Icon } from "../../components/ui/Icon";
import { Modal } from "../../components/ui/Modal";
import { SegmentedSwitch } from "../../components/ui/SegmentedSwitch";
import { VaultAccessLogPanel } from "./VaultAccessLogPanel";
import { VaultPolicyPanel } from "./VaultPolicyPanel";
import { VaultRequestsPanel } from "./VaultRequestsPanel";
import { VaultSharesPanel } from "./VaultSharesPanel";

/**
 * Le tre cose che un admin deve poter guardare sulla cassaforte, in un posto solo.
 *
 * Stanno insieme perché rispondono alla stessa domanda da tre angolazioni: chi
 * è entrato (registro), cosa è uscito (link), e con quali regole (impostazioni).
 * Tre bottoni separati nell'intestazione della pagina sarebbero stati tre
 * bottoni in più da ignorare.
 */

type Scheda = "registro" | "link" | "richieste" | "regole";

interface Props {
  open: boolean;
  onClose: () => void;
  companyId: number;
}

export function VaultAdminModal({ open, onClose, companyId }: Props) {
  const [scheda, setScheda] = useState<Scheda>("registro");

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Amministrazione cassaforte"
      description="Chi è entrato, cosa è uscito, e con quali regole."
      size="xl"
      subHeader={
        <div className="px-6 py-3">
          <SegmentedSwitch
            value={scheda}
            onChange={setScheda}
            ariaLabel="Sezione"
            options={[
              {
                value: "registro",
                label: (
                  <>
                    <Icon name="list" className="w-3.5 h-3.5" />
                    Registro accessi
                  </>
                ),
              },
              {
                value: "link",
                label: (
                  <>
                    <Icon name="link" className="w-3.5 h-3.5" />
                    Link condivisi
                  </>
                ),
              },
              {
                value: "richieste",
                label: (
                  <>
                    <Icon name="bell" className="w-3.5 h-3.5" />
                    Richieste
                  </>
                ),
              },
              {
                value: "regole",
                label: (
                  <>
                    <Icon name="settings" className="w-3.5 h-3.5" />
                    Regole
                  </>
                ),
              },
            ]}
          />
        </div>
      }
    >
      {scheda === "registro" && <VaultAccessLogPanel companyId={companyId} />}
      {scheda === "link" && <VaultSharesPanel companyId={companyId} />}
      {scheda === "richieste" && <VaultRequestsPanel companyId={companyId} />}
      {scheda === "regole" && <VaultPolicyPanel companyId={companyId} />}
    </Modal>
  );
}
