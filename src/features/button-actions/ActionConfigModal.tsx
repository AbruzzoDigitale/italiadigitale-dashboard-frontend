import { useEffect, useMemo, useState } from "react";
import {
  deleteButtonConfigApi,
  getActionCatalogApi,
  listButtonConfigsApi,
  saveButtonConfigApi,
  type ActionCatalog,
  type ActionSpec,
} from "../../api/buttonActions";
import { Button } from "../../components/ui/Button";
import { Checkbox } from "../../components/ui/Checkbox";
import { Icon } from "../../components/ui/Icon";
import { Modal } from "../../components/ui/Modal";
import { Spinner } from "../../components/ui/Spinner";
import { useToast } from "../../context/ToastContext";
import { ActionFieldInput } from "./ActionField";

// Popup di configurazione di un bottone: si sceglie COSA fa (l'elenco delle
// azioni collegabili) e con quali parametri. Lo vedono solo gli admin.
//
// «Applica a tutti i bottoni» è acceso di proposito: il caso normale è che il
// bottone si comporti allo stesso modo su ogni riga. Spegnendolo si configura
// solo la riga da cui si è aperto il popup — un'eccezione, e come tale rara.

interface Props {
  open: boolean;
  onClose: () => void;
  companyId: number;
  buttonKey: string;
  /** Riga da cui è stato aperto il popup (serve solo se non si applica a tutti). */
  entityId?: number | null;
  onSaved: () => void;
}

export function ActionConfigModal({ open, onClose, companyId, buttonKey, entityId, onSaved }: Props) {
  const toast = useToast();
  const [catalog, setCatalog] = useState<ActionCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  const [actionType, setActionType] = useState<string>("");
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [applyToAll, setApplyToAll] = useState(true);
  const [configured, setConfigured] = useState(false);

  const button = useMemo(
    () => catalog?.buttons.find((b) => b.key === buttonKey) ?? null,
    [catalog, buttonKey],
  );
  const actions: ActionSpec[] = useMemo(() => {
    if (!catalog || !button) return [];
    return catalog.actions.filter((a) => button.allowed_actions.includes(a.action_type));
  }, [catalog, button]);
  const action = actions.find((a) => a.action_type === actionType) ?? null;

  useEffect(() => {
    if (!open) return;
    let vivo = true;
    setLoading(true);
    void (async () => {
      try {
        const [cat, configs] = await Promise.all([
          getActionCatalogApi(),
          listButtonConfigsApi(companyId, buttonKey),
        ]);
        if (!vivo) return;
        setCatalog(cat);
        // Configurazione già presente: prima quella della riga, poi il jolly.
        const perRiga = entityId ? configs.find((c) => c.scope_id === entityId) : undefined;
        const perTutti = configs.find((c) => c.applies_to_all);
        const attuale = perRiga ?? perTutti;
        if (attuale) {
          setActionType(attuale.action_type);
          setConfig({ ...(attuale.config ?? {}) });
          setApplyToAll(attuale.applies_to_all);
          setConfigured(true);
        } else {
          const primo = cat.buttons.find((b) => b.key === buttonKey)?.allowed_actions[0] ?? "";
          setActionType(primo);
          setConfig({});
          setApplyToAll(true);
          setConfigured(false);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Impossibile leggere la configurazione");
      } finally {
        if (vivo) setLoading(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [open, companyId, buttonKey, entityId, toast]);

  // Cambiando azione i campi non hanno più senso: si riparte dai default.
  const changeAction = (next: string) => {
    setActionType(next);
    const spec = actions.find((a) => a.action_type === next);
    const iniziale: Record<string, unknown> = {};
    for (const f of spec?.fields ?? []) {
      if (f.default != null) iniziale[f.key] = f.default;
    }
    setConfig(iniziale);
  };

  const handleSave = async () => {
    if (!actionType) return;
    setSaving(true);
    try {
      await saveButtonConfigApi(companyId, {
        button_key: buttonKey,
        entity_id: applyToAll ? null : entityId ?? null,
        action_type: actionType,
        config,
        apply_to_all: applyToAll,
      });
      toast.success(
        applyToAll ? "Bottone configurato per tutte le righe." : "Bottone configurato per questa riga.",
      );
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Salvataggio non riuscito");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    try {
      await deleteButtonConfigApi(companyId, buttonKey, applyToAll ? null : entityId ?? null);
      toast.success("Azione scollegata: il bottone torna muto.");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impossibile scollegare l'azione");
    } finally {
      setRemoving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      icon={<Icon name="settings" className="h-5 w-5" />}
      title={button ? `Configura «${button.label}»` : "Configura bottone"}
      description={button?.description}
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          {configured ? (
            <Button variant="danger-ghost" onClick={handleRemove} loading={removing}>
              Scollega azione
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>
              Annulla
            </Button>
            <Button variant="primary" onClick={handleSave} loading={saving} disabled={!actionType}>
              Salva configurazione
            </Button>
          </div>
        </div>
      }
    >
      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {/* 1. Che azione fa il bottone */}
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
              Azione del bottone
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {actions.map((a) => {
                const attiva = a.action_type === actionType;
                return (
                  <button
                    key={a.action_type}
                    type="button"
                    onClick={() => changeAction(a.action_type)}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      attiva
                        ? "border-brand-magenta bg-brand-magenta/5"
                        : "border-line hover:border-brand-magenta/50 dark:border-[#2a2a2e]"
                    }`}
                  >
                    <p className="text-[13px] font-bold text-ink dark:text-[#f4f4f7]">{a.label}</p>
                    <p className="mt-0.5 text-[11.5px] leading-snug text-muted dark:text-[#9999a0]">
                      {a.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Parametri dell'azione scelta */}
          {action && (
            <div className="flex flex-col gap-3 rounded-lg border border-line p-4 dark:border-[#2a2a2e]">
              {action.fields.map((f) => (
                <ActionFieldInput
                  key={f.key}
                  field={f}
                  companyId={companyId}
                  value={config[f.key] ?? f.default ?? ""}
                  onChange={(v) => setConfig((prev) => ({ ...prev, [f.key]: v }))}
                />
              ))}
              {action.fields.length === 0 && (
                <p className="text-[12.5px] text-muted dark:text-[#9999a0]">
                  Questa azione non ha parametri.
                </p>
              )}
            </div>
          )}

          {/* 3. Portata della configurazione */}
          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line p-3 dark:border-[#2a2a2e]">
            <Checkbox checked={applyToAll} onChange={setApplyToAll} className="mt-0.5" />
            <span>
              <span className="block text-[13px] font-semibold text-ink dark:text-[#f4f4f7]">
                Applica a tutti i bottoni
              </span>
              <span className="block text-[11.5px] leading-snug text-muted dark:text-[#9999a0]">
                {applyToAll
                  ? "La configurazione vale per questo bottone su ogni riga dell'elenco, e cancella le eccezioni impostate sulle singole righe."
                  : "La configurazione vale solo per la riga da cui hai aperto questo popup."}
              </span>
            </span>
          </label>
        </div>
      )}
    </Modal>
  );
}
