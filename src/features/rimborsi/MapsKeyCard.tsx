import { useEffect, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { Input } from "../../components/ui/Input";
import { Spinner } from "../../components/ui/Spinner";
import { useToast } from "../../context/ToastContext";
import { getExpenseSettingsApi, updateExpenseSettingsApi } from "../../api/expenses";

// Chiave Google Maps dell'azienda: sta qui, con l'account Google e i mittenti,
// e non nelle impostazioni dei Rimborsi. È una credenziale dell'organizzazione —
// il modulo trasferte la usa, ma non è roba da configurare mentre si stabilisce
// quanto vale un chilometro.
//
// Il backend non restituisce mai il valore: dice solo se c'è. Il campo parte
// vuoto e si invia solo quando lo si riscrive.

export function MapsKeyCard({ companyId }: { companyId: number | null }) {
  const toast = useToast();
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getExpenseSettingsApi(companyId)
      .then((settings) => {
        if (alive) setConfigured(settings.maps_configured);
      })
      .catch(() => {
        if (alive) setConfigured(false);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [companyId]);

  const save = async () => {
    if (!value.trim()) {
      toast.error("Incolla la chiave");
      return;
    }
    setSaving(true);
    try {
      const updated = await updateExpenseSettingsApi({ maps_api_key: value.trim() }, companyId);
      setConfigured(updated.maps_configured);
      setValue("");
      setEditing(false);
      toast.success("Chiave Google Maps salvata");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Chiave non salvata");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-line bg-paper p-6 dark:border-[#2a2a2e] dark:bg-[#131316]">
      <h2
        className="mb-1 font-display font-bold tracking-tight text-ink dark:text-[#f4f4f7]"
        style={{ fontSize: "17px" }}
      >
        Chiave Google Maps
      </h2>
      <p className="font-body text-[13px] text-muted dark:text-[#9999a0]">
        Serve ai rimborsi trasferte per suggerire gli indirizzi e misurare i chilometri. È una chiave del progetto
        Google Cloud, diversa dall'account qui accanto: Maps si paga a chiamata e non passa dal login. Resta sul
        server, cifrata — il frontend non la vede mai.
      </p>

      <div className="mt-4">
        {loading ? (
          <Spinner />
        ) : configured && !editing ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-pill border border-success/25 bg-success/10 px-2.5 py-1 text-[11px] font-semibold text-success">
              <Icon name="check" className="h-3 w-3" /> Chiave configurata
            </span>
            <span className="flex-1" />
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
              Sostituisci
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Input
              label="Chiave API"
              type="password"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="AIza…"
              hint="Servono Places API (New) e Routes API abilitate, con fatturazione attiva."
            />
            <div className="flex gap-2">
              <Button variant="primary" size="sm" loading={saving} onClick={save}>
                Salva chiave
              </Button>
              {configured && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setValue("");
                    setEditing(false);
                  }}
                >
                  Annulla
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
