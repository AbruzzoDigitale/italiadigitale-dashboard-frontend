import { useCallback, useEffect, useState } from "react";
import {
  createWebsiteCategoryApi,
  createWebsiteStatusApi,
  createWebsiteTypeApi,
  deleteWebsiteCategoryApi,
  deleteWebsiteStatusApi,
  deleteWebsiteTypeApi,
  listWebsiteCategoriesApi,
  listWebsiteStatusesApi,
  listWebsiteTypesApi,
  updateWebsiteCategoryApi,
  updateWebsiteStatusApi,
  getWebsiteScanSettingsApi,
  scanIntervalLabel,
  updateWebsiteScanSettingsApi,
  updateWebsiteTypeApi,
  type WebsiteCategory,
  type WebsiteScanSettings,
  type WebsiteStatus,
  type WebsiteType,
} from "../../api/websites";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Checkbox } from "../../components/ui/Checkbox";
import { ColorHexField } from "../../components/ui/ColorHexField";
import { Icon } from "../../components/ui/Icon";
import { Input } from "../../components/ui/Input";
import { Modal } from "../../components/ui/Modal";
import { useToast } from "../../context/ToastContext";

type TaxonomyKind = "type" | "category" | "status";

type TaxonomyFormState = {
  name: string;
  color: string;
  /** Solo per i tipi: se prevedono la scelta di un tema. */
  uses_themes: boolean;
  /** Solo per gli stati: quello proposto ai siti nuovi. */
  is_default: boolean;
};

const EMPTY_FORM: TaxonomyFormState = { name: "", color: "", uses_themes: false, is_default: false };

const KIND_LABELS: Record<TaxonomyKind, { singular: string; plural: string; hint: string }> = {
  type: {
    singular: "Tipo di sito",
    plural: "Tipi di sito",
    hint: "WordPress, Shopify, sito a codice… Attiva «usa i temi» sui tipi che prevedono un tema.",
  },
  category: {
    singular: "Categoria",
    plural: "Categorie",
    hint: "Sito vetrina, e-commerce, agency… Servono anche ai temi, per dire a cosa sono adatti.",
  },
  status: {
    singular: "Stato",
    plural: "Stati",
    hint: "Online, in lavorazione, da creare… Lo stato predefinito è quello proposto ai siti nuovi.",
  },
};

/** Riga generica di una tassonomia: i tre elenchi condividono la stessa forma. */
type TaxonomyRow = {
  id: number;
  name: string;
  color: string | null;
  websites_count: number;
  uses_themes?: boolean;
  themes_count?: number;
  is_default?: boolean;
};

// Cadenze proposte: coprono i casi reali senza costringere a contare i giorni.
const INTERVAL_PRESETS = [1, 3, 7, 14, 30] as const;

interface WebsiteTaxonomiesTabProps {
  companyId: number;
  /** Creazione, modifica ed eliminazione: riservate ad admin e project manager. */
  canManage: boolean;
  /** La cadenza della scansione automatica la cambia solo un admin. */
  isAdmin: boolean;
}

/**
 * Pannello Azienda → Siti web: tipi di sito, categorie e stati configurabili.
 * Gemello dei tab Aree/Etichette/Piattaforme social.
 */
export function WebsiteTaxonomiesTab({ companyId, canManage, isAdmin }: WebsiteTaxonomiesTabProps) {
  const toast = useToast();
  const [types, setTypes] = useState<WebsiteType[]>([]);
  const [categories, setCategories] = useState<WebsiteCategory[]>([]);
  const [statuses, setStatuses] = useState<WebsiteStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalKind, setModalKind] = useState<TaxonomyKind | null>(null);
  const [editing, setEditing] = useState<TaxonomyRow | null>(null);
  const [deleting, setDeleting] = useState<{ kind: TaxonomyKind; row: TaxonomyRow } | null>(null);
  const [form, setForm] = useState<TaxonomyFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  const [scanSettings, setScanSettings] = useState<WebsiteScanSettings | null>(null);
  const [intervalDraft, setIntervalDraft] = useState("7");
  const [savingInterval, setSavingInterval] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [t, c, s, settings] = await Promise.all([
        listWebsiteTypesApi(companyId),
        listWebsiteCategoriesApi(companyId),
        listWebsiteStatusesApi(companyId),
        getWebsiteScanSettingsApi(companyId),
      ]);
      setTypes(t);
      setCategories(c);
      setStatuses(s);
      setScanSettings(settings);
      setIntervalDraft(String(settings.scan_interval_days));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel caricamento delle tassonomie");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = (kind: TaxonomyKind) => {
    setModalKind(kind);
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  };

  const openEdit = (kind: TaxonomyKind, row: TaxonomyRow) => {
    setModalKind(kind);
    setEditing(row);
    setForm({
      name: row.name,
      color: row.color ?? "",
      uses_themes: row.uses_themes ?? false,
      is_default: row.is_default ?? false,
    });
    setFormError(null);
  };

  const closeModal = () => {
    if (saving) return;
    setModalKind(null);
    setEditing(null);
    setFormError(null);
  };

  const handleSave = async () => {
    if (!modalKind) return;
    if (!form.name.trim()) {
      setFormError("Il nome è obbligatorio");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const name = form.name.trim();
      const color = form.color.trim() || null;
      if (modalKind === "type") {
        const payload = { name, color, uses_themes: form.uses_themes };
        if (editing) await updateWebsiteTypeApi(editing.id, payload);
        else await createWebsiteTypeApi({ company_id: companyId, ...payload });
      } else if (modalKind === "category") {
        const payload = { name, color };
        if (editing) await updateWebsiteCategoryApi(editing.id, payload);
        else await createWebsiteCategoryApi({ company_id: companyId, ...payload });
      } else {
        const payload = { name, color, is_default: form.is_default };
        if (editing) await updateWebsiteStatusApi(editing.id, payload);
        else await createWebsiteStatusApi({ company_id: companyId, ...payload });
      }
      toast.success(editing ? "Modifica salvata" : `${KIND_LABELS[modalKind].singular} creato`);
      setModalKind(null);
      setEditing(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setRemoving(true);
    try {
      if (deleting.kind === "type") await deleteWebsiteTypeApi(deleting.row.id);
      else if (deleting.kind === "category") await deleteWebsiteCategoryApi(deleting.row.id);
      else await deleteWebsiteStatusApi(deleting.row.id);
      toast.success("Elemento eliminato");
      setDeleting(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nell'eliminazione");
    } finally {
      setRemoving(false);
    }
  };

  const saveInterval = async (days: number) => {
    setSavingInterval(true);
    try {
      const updated = await updateWebsiteScanSettingsApi(companyId, days);
      setScanSettings(updated);
      setIntervalDraft(String(updated.scan_interval_days));
      toast.success(
        `Scansione automatica ${scanIntervalLabel(updated.scan_interval_days)}` +
          (updated.rescheduled
            ? ` · ${updated.rescheduled} ${updated.rescheduled === 1 ? "sito riallineato" : "siti riallineati"}`
            : "")
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nel salvataggio della cadenza");
      // Il campo torna al valore realmente salvato, per non lasciare un numero fantasma.
      if (scanSettings) setIntervalDraft(String(scanSettings.scan_interval_days));
    } finally {
      setSavingInterval(false);
    }
  };

  const renderScanSettings = () => (
    <div className="rounded-lg border border-line bg-paper p-5 dark:border-[#2a2a2e] dark:bg-[#131316]">
      <div className="mb-4">
        <h3
          className="mb-1 font-display font-bold tracking-tight text-ink dark:text-[#f4f4f7]"
          style={{ fontSize: "15px" }}
        >
          Scansione automatica
        </h3>
        <p className="font-body text-[12.5px] text-muted dark:text-[#9999a0]">
          Ogni quanto rianalizzare i siti (punteggi PageSpeed e dati del dominio). Il controllo
          passa comunque ogni ora e prende solo i siti scaduti: qui decidi la cadenza, non quante
          volte gira il controllo.
        </p>
      </div>

      {!isAdmin ? (
        <p className="text-[13px] text-ink dark:text-[#f4f4f7]">
          Attualmente: <strong>{scanSettings ? scanIntervalLabel(scanSettings.scan_interval_days) : "—"}</strong>.
          La cadenza la può cambiare un admin.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {INTERVAL_PRESETS.map((days) => {
              const active = scanSettings?.scan_interval_days === days;
              return (
                <button
                  key={days}
                  type="button"
                  disabled={savingInterval}
                  onClick={() => saveInterval(days)}
                  className={`rounded-md border px-3 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-50 ${
                    active
                      ? "border-ink bg-ink text-paper dark:border-[#f4f4f7] dark:bg-[#f4f4f7] dark:text-ink"
                      : "border-line text-ink hover:bg-cream dark:border-[#2a2a2e] dark:text-[#f4f4f7] dark:hover:bg-[#1c1c20]"
                  }`}
                >
                  {scanIntervalLabel(days)}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="w-32">
              <Input
                label="Oppure ogni"
                type="number"
                min={1}
                max={365}
                value={intervalDraft}
                onChange={(event) => setIntervalDraft(event.target.value)}
                hint="giorni (1-365)"
              />
            </div>
            <Button
              variant="secondary"
              loading={savingInterval}
              disabled={
                !intervalDraft.trim() ||
                Number(intervalDraft) === scanSettings?.scan_interval_days ||
                Number(intervalDraft) < 1 ||
                Number(intervalDraft) > 365
              }
              onClick={() => saveInterval(Number(intervalDraft))}
              className="mb-[2px]"
            >
              Applica
            </Button>
          </div>

          {scanSettings && (
            <p className="text-[12px] text-muted dark:text-[#9999a0]">
              {scanSettings.scan_enabled_count === 0
                ? "Nessun sito ha l'analisi automatica accesa."
                : `${scanSettings.scan_enabled_count} ${
                    scanSettings.scan_enabled_count === 1 ? "sito verrà rianalizzato" : "siti verranno rianalizzati"
                  } ${scanIntervalLabel(scanSettings.scan_interval_days)}.`}
              {" Cambiando cadenza i siti già analizzati vengono riallineati subito."}
            </p>
          )}
        </div>
      )}
    </div>
  );

  const renderSection = (kind: TaxonomyKind, rows: TaxonomyRow[]) => (
    <div className="rounded-lg border border-line bg-paper p-5 dark:border-[#2a2a2e] dark:bg-[#131316]">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3
            className="mb-1 font-display font-bold tracking-tight text-ink dark:text-[#f4f4f7]"
            style={{ fontSize: "15px" }}
          >
            {KIND_LABELS[kind].plural}
          </h3>
          <p className="font-body text-[12.5px] text-muted dark:text-[#9999a0]">{KIND_LABELS[kind].hint}</p>
        </div>
        {canManage && (
          <Button
            variant="secondary"
            onClick={() => openCreate(kind)}
            leftIcon={<Icon name="plus" className="w-3.5 h-3.5" />}
          >
            Aggiungi
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-line px-4 py-6 text-sm text-muted dark:border-[#2a2a2e] dark:text-[#9999a0]">
          Nessun elemento: {canManage ? "creane uno." : "chiedi a un admin di crearne uno."}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((row) => (
            <div
              key={row.id}
              className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-cream px-3 py-2.5 dark:border-[#2a2a2e] dark:bg-[#1c1c20]"
            >
              <span
                className="h-3 w-3 flex-none rounded-full border border-line dark:border-[#2a2a2e]"
                style={{ backgroundColor: row.color ?? "transparent" }}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold text-ink dark:text-[#f4f4f7]">
                {row.name}
              </span>
              {row.uses_themes && <Badge variant="info">Usa i temi</Badge>}
              {row.is_default && <Badge variant="success">Predefinito</Badge>}
              <span className="text-[11px] text-muted dark:text-[#9999a0]">
                {row.websites_count} {row.websites_count === 1 ? "sito" : "siti"}
                {row.themes_count != null && row.themes_count > 0
                  ? ` · ${row.themes_count} ${row.themes_count === 1 ? "tema" : "temi"}`
                  : ""}
              </span>
              {canManage && (
                <div className="flex flex-none items-center gap-1">
                  <button
                    type="button"
                    title="Modifica"
                    aria-label="Modifica"
                    onClick={() => openEdit(kind, row)}
                    className="inline-grid h-7 w-7 place-items-center rounded-md border border-line text-ink transition-colors hover:bg-paper dark:border-[#2a2a2e] dark:text-[#f4f4f7] dark:hover:bg-[#131316]"
                  >
                    <Icon name="pencil" className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Elimina"
                    aria-label="Elimina"
                    onClick={() => setDeleting({ kind, row })}
                    className="inline-grid h-7 w-7 place-items-center rounded-md border border-danger/20 bg-danger/5 text-danger transition-colors hover:bg-danger/10"
                  >
                    <Icon name="trash" className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="sp-skeleton h-48 rounded-lg border border-line dark:border-[#2a2a2e]"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</div>
      )}

      {renderScanSettings()}

      {renderSection("type", types)}
      {renderSection("category", categories)}
      {renderSection("status", statuses)}

      <Modal
        open={modalKind !== null}
        onClose={closeModal}
        title={
          modalKind
            ? `${editing ? "Modifica" : "Nuovo"} ${KIND_LABELS[modalKind].singular.toLowerCase()}`
            : ""
        }
        description={modalKind ? KIND_LABELS[modalKind].hint : ""}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={closeModal} disabled={saving}>
              Annulla
            </Button>
            <Button variant="primary" onClick={handleSave} loading={saving}>
              Salva
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {formError && (
            <div className="rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
              {formError}
            </div>
          )}

          <Input
            label="Nome"
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            placeholder={modalKind === "type" ? "WordPress" : modalKind === "category" ? "Sito vetrina" : "Online"}
          />

          <ColorHexField
            label="Colore"
            value={form.color}
            onChange={(value) => setForm((current) => ({ ...current, color: value }))}
            hint="Usato per la pastiglia colorata nel registro siti."
          />

          {modalKind === "type" && (
            <button
              type="button"
              onClick={() => setForm((current) => ({ ...current, uses_themes: !current.uses_themes }))}
              className="inline-flex items-center gap-2 self-start text-sm text-ink dark:text-[#f4f4f7]"
            >
              <Checkbox
                checked={form.uses_themes}
                onChange={(checked) => setForm((current) => ({ ...current, uses_themes: checked }))}
              />
              Questo tipo usa i temi
            </button>
          )}

          {modalKind === "status" && (
            <button
              type="button"
              onClick={() => setForm((current) => ({ ...current, is_default: !current.is_default }))}
              className="inline-flex items-center gap-2 self-start text-sm text-ink dark:text-[#f4f4f7]"
            >
              <Checkbox
                checked={form.is_default}
                onChange={(checked) => setForm((current) => ({ ...current, is_default: checked }))}
              />
              Stato predefinito per i siti nuovi
            </button>
          )}
        </div>
      </Modal>

      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Elimina elemento"
        description="Un elemento ancora usato da qualche sito non può essere eliminato."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)} disabled={removing}>
              Annulla
            </Button>
            <Button variant="danger" onClick={handleDelete} loading={removing}>
              Elimina
            </Button>
          </>
        }
      >
        <p className="font-body text-sm text-ink dark:text-[#f4f4f7]">
          Sei sicuro di voler eliminare <strong>{deleting?.row.name}</strong>?
        </p>
      </Modal>
    </div>
  );
}
