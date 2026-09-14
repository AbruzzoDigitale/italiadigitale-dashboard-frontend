import { useEffect, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { Input } from "../../components/ui/Input";
import { Spinner } from "../../components/ui/Spinner";
import { useToast } from "../../context/ToastContext";
import {
  getExpenseSettingsApi,
  updateExpenseSettingsApi,
  type ExpenseSettings,
} from "../../api/expenses";

// Sede dell'agenzia: l'indirizzo da cui partono i calcoli chilometrici delle
// trasferte. Sta nelle impostazioni dell'azienda perché è un dato di anagrafica,
// non una preferenza del modulo rimborsi — lì resta solo l'interruttore che
// decide se imporla come partenza o lasciarla modificabile riga per riga.

export function OfficeAddressCard({ companyId }: { companyId: number | null }) {
  const toast = useToast();
  const [settings, setSettings] = useState<ExpenseSettings | null>(null);
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const cfg = await getExpenseSettingsApi(companyId);
        if (cancelled) return;
        setSettings(cfg);
        setAddress(cfg.origin_address);
      } catch {
        if (!cancelled) setSettings(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await updateExpenseSettingsApi({ origin_address: address.trim() }, companyId);
      setSettings(updated);
      toast.success("Sede aggiornata");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Salvataggio non riuscito");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-paper dark:bg-[#131316] rounded-lg border border-line dark:border-[#2a2a2e] p-6">
      <h2
        className="font-display font-bold tracking-tight text-ink dark:text-[#f4f4f7] mb-1"
        style={{ fontSize: "17px" }}
      >
        Sede dell'agenzia
      </h2>
      <p className="font-body text-[13px] text-muted dark:text-[#9999a0] mb-5">
        L'indirizzo da cui si calcolano i chilometri delle trasferte. Con la partenza fissa attiva, ogni percorso
        viene misurato da qui alla destinazione scelta, andata e ritorno.
      </p>

      {loading ? (
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[280px] flex-1">
            <Input
              label="Indirizzo"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Via Matteotti 4, Giulianova (TE)"
              hint={
                settings?.origin_locked
                  ? "Partenza fissa attiva: nelle trasferte questo indirizzo non è modificabile."
                  : "Partenza fissa disattivata: nelle trasferte l'indirizzo si può cambiare riga per riga."
              }
            />
          </div>
          <Button
            variant="primary"
            loading={saving}
            onClick={save}
            disabled={address.trim() === (settings?.origin_address ?? "")}
            leftIcon={<Icon name="check" className="h-4 w-4" />}
          >
            Salva sede
          </Button>
        </div>
      )}
    </div>
  );
}
