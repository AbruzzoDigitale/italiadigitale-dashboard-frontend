import { useState } from "react";
import { Link } from "react-router-dom";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Textarea } from "../../components/ui/Textarea";
import { Checkbox } from "../../components/ui/Checkbox";
import { Icon } from "../../components/ui/Icon";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import { useToast } from "../../context/ToastContext";
import {
  connectSheetApi,
  createVehicleApi,
  deleteVehicleApi,
  disconnectSheetApi,
  rotateShareTokenApi,
  updateExpenseSettingsApi,
  upsertAciRateApi,
  type EvidenceKind,
  type ExpenseSettings,
  type Vehicle,
} from "../../api/expenses";
import { EVIDENCE_META, num } from "./format";

// Configurazione del modulo per l'azienda: chi scrive su Google, quanto vale un
// chilometro, quali prove pretendere, dove finisce l'archivio, chi legge il
// link condiviso. Tutto riservato agli admin.

interface Props {
  open: boolean;
  settings: ExpenseSettings;
  vehicles: Vehicle[];
  people: { value: string; label: string }[];
  companyId: number | null;
  onClose: () => void;
  onSaved: (settings: ExpenseSettings) => void;
  onVehiclesChanged: () => void;
}

type Tab = "google" | "tariffe" | "veicoli" | "nota";

const TABS: { key: Tab; label: string; icon: Parameters<typeof Icon>[0]["name"] }[] = [
  { key: "google", label: "Google e condivisione", icon: "drive" },
  { key: "tariffe", label: "Tariffe e prove", icon: "credit-card" },
  { key: "veicoli", label: "Veicoli", icon: "target" },
  { key: "nota", label: "Nota spese", icon: "document-text" },
];

export function SettingsModal({
  open,
  settings,
  vehicles,
  people,
  companyId,
  onClose,
  onSaved,
  onVehiclesChanged,
}: Props) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("google");
  // Come per la modale delle trasferte: la pagina rimonta il componente a ogni
  // apertura, quindi lo stato si inizializza dalle props una volta sola.
  const [form, setForm] = useState(settings);
  const [mapsKey, setMapsKey] = useState("");
  const [sheetId, setSheetId] = useState("");
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof ExpenseSettings>(key: K, value: ExpenseSettings[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      const updated = await updateExpenseSettingsApi(
        {
          origin_address: form.origin_address,
          daily_allowance: form.daily_allowance,
          default_rate_per_km: form.default_rate_per_km,
          aci_source: form.aci_source,
          daily_allowance_auto: form.daily_allowance_auto,
          evidence_required: form.evidence_required,
          sheet_name: form.sheet_name,
          auto_sync: form.auto_sync,
          accountant_email: form.accountant_email,
          accountant_name: form.accountant_name,
          drive_root_path: form.drive_root_path,
          retention_years: form.retention_years,
          auto_archive: form.auto_archive,
          share_enabled: form.share_enabled,
          header_company: form.header_company,
          header_vat: form.header_vat,
          header_sign_place: form.header_sign_place,
          header_authorization: form.header_authorization,
          // La chiave Maps si invia solo se è stata riscritta: il campo parte
          // vuoto perché il backend non restituisce mai il segreto.
          ...(mapsKey.trim() ? { maps_api_key: mapsKey.trim() } : {}),
        },
        companyId
      );
      onSaved(updated);
      toast.success("Impostazioni salvate");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Salvataggio non riuscito");
    } finally {
      setSaving(false);
    }
  };

  const toggleEvidence = (kind: EvidenceKind) => {
    const current = form.evidence_required;
    set(
      "evidence_required",
      current.includes(kind) ? current.filter((k) => k !== kind) : [...current, kind]
    );
  };

  const createSheet = async (existingId?: string) => {
    try {
      const updated = await connectSheetApi(companyId, existingId);
      onSaved(updated);
      setForm(updated);
      toast.success(existingId ? "Foglio collegato" : "Foglio creato e condiviso");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Foglio non collegato");
    }
  };

  const detachSheet = async () => {
    try {
      const updated = await disconnectSheetApi(companyId);
      onSaved(updated);
      setForm(updated);
      toast.success("Foglio scollegato (il file su Drive resta)");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Operazione non riuscita");
    }
  };

  const rotateShare = async () => {
    try {
      const updated = await rotateShareTokenApi(companyId);
      onSaved(updated);
      setForm(updated);
      toast.success("Nuovo link generato: il precedente non funziona più");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Token non rigenerato");
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      icon={<Icon name="settings" className="h-5 w-5" />}
      title="Impostazioni rimborsi"
      description="Valgono per questa azienda."
      mobileFullscreen
      subHeader={
        <div className="flex flex-wrap gap-1 px-1">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`inline-flex items-center gap-2 rounded-md px-3.5 py-2.5 text-[13px] font-semibold transition-colors ${
                tab === item.key
                  ? "bg-brand-magenta text-white"
                  : "text-muted hover:bg-cream dark:text-muted-dark dark:hover:bg-[#1c1c20]"
              }`}
            >
              <Icon name={item.icon} className="h-4 w-4" />
              {item.label}
            </button>
          ))}
        </div>
      }
      footer={
        <div className="flex items-center gap-2">
          <span className="flex-1" />
          <Button variant="ghost" onClick={onClose}>
            Chiudi
          </Button>
          <Button variant="primary" loading={saving} onClick={save}>
            Salva impostazioni
          </Button>
        </div>
      }
    >
      {tab === "google" && (
        <div className="flex flex-col gap-4">
          <Block
            title="Account Google aziendale"
            hint="L'identità con cui girano le automazioni. Si collega dalle impostazioni dell'azienda, non da qui."
          >
            <div className="flex flex-wrap items-center gap-2">
              {form.google_connected ? (
                <span className="inline-flex items-center gap-1.5 rounded-pill border border-success/25 bg-success/10 px-2.5 py-1 text-[11px] font-semibold text-success">
                  <Icon name="check" className="h-3 w-3" /> {form.google_email}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-pill border border-warning/30 bg-warning/10 px-2.5 py-1 text-[11px] font-semibold text-warning">
                  <Icon name="alert-triangle" className="h-3 w-3" /> Non collegato
                </span>
              )}
              {form.google_error && <span className="text-[11px] text-danger">{form.google_error}</span>}
              <span className="flex-1" />
              <Link to={`/companies/${form.company_id}/brand?tab=google`}>
                <Button variant="ghost" size="sm" leftIcon={<Icon name="settings" className="h-3.5 w-3.5" />}>
                  Apri impostazioni azienda
                </Button>
              </Link>
            </div>
          </Block>

          <Block title="Foglio del commercialista" hint="Un foglio Google nativo, un tab per mese, condiviso in sola lettura.">
            {form.sheet_configured ? (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={form.sheet_url}
                    target="_blank"
                    rel="noopener"
                    className="truncate text-[11px] font-semibold text-brand-magenta hover:underline"
                  >
                    {form.sheet_url}
                  </a>
                  <span className="flex-1" />
                  <Button variant="ghost" size="sm" onClick={detachSheet}>
                    Scollega
                  </Button>
                </div>
                <label className="flex cursor-pointer items-center gap-2">
                  <Checkbox checked={form.auto_sync} onChange={(v) => set("auto_sync", v)} />
                  <span className="text-[12px]">
                    Sincronizzazione automatica
                    <span className="ml-1 text-muted dark:text-muted-dark">
                      — le righe approvate partono da sole col giro schedulato
                    </span>
                  </span>
                </label>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Input
                  label="Nome del foglio"
                  value={form.sheet_name}
                  onChange={(e) => set("sheet_name", e.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" size="sm" onClick={() => createSheet()} disabled={!form.google_connected}>
                    Crea il foglio
                  </Button>
                </div>
                <div className="flex items-end gap-2">
                  <Input
                    label="…oppure collega un foglio esistente (ID)"
                    value={sheetId}
                    onChange={(e) => setSheetId(e.target.value)}
                    placeholder="1IhastYpQCfzEfzlvz_szm4Aw70Ho3dn0"
                    hint="Deve essere un foglio Google nativo, non un .xlsx caricato su Drive."
                  />
                  <Button variant="secondary" size="sm" onClick={() => createSheet(sheetId.trim())} disabled={!sheetId.trim()}>
                    Collega
                  </Button>
                </div>
              </div>
            )}
          </Block>

          <Block title="Commercialista" hint="Riceve l'accesso in lettura al foglio e alla cartella dell'archivio.">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Studio"
                value={form.accountant_name}
                onChange={(e) => set("accountant_name", e.target.value)}
                placeholder="Studio commerciale"
              />
              <Input
                label="Email"
                type="email"
                value={form.accountant_email}
                onChange={(e) => set("accountant_email", e.target.value)}
                placeholder="studio@commercialista.it"
              />
            </div>
          </Block>

          <Block title="Link web condiviso" hint="Vista live in sola lettura, senza login. Si revoca rigenerando il token.">
            <label className="flex cursor-pointer items-center gap-2">
              <Checkbox checked={form.share_enabled} onChange={(v) => set("share_enabled", v)} />
              <span className="text-[12px]">Attiva il link condivisibile</span>
            </label>
            {form.share_url && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 truncate rounded-md border border-line bg-cream px-2.5 py-1.5 font-mono text-[10px] dark:border-[#2a2a2e] dark:bg-[#1c1c20]">
                  {form.share_url}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigator.clipboard?.writeText(form.share_url ?? "")}
                >
                  Copia
                </Button>
                <Button variant="ghost" size="sm" onClick={rotateShare}>
                  Rigenera
                </Button>
              </div>
            )}
          </Block>

          <Block title="Archivio su Drive" hint="Dove finiscono nota spese, CSV e giustificativi di ogni mese.">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Percorso cartella"
                value={form.drive_root_path}
                onChange={(e) => set("drive_root_path", e.target.value)}
                placeholder="Amministrazione/Trasferte"
                disabled={Boolean(form.drive_folder_id)}
                hint={form.drive_folder_id ? "Cartella già creata: per cambiarla scollega la cartella su Drive." : undefined}
              />
              <Input
                label="Anni di conservazione"
                type="number"
                min="1"
                value={String(form.retention_years)}
                onChange={(e) => set("retention_years", Number(e.target.value) || 10)}
                hint="Il termine di accertamento fiscale è dieci anni."
              />
            </div>
            <label className="mt-2 flex cursor-pointer items-center gap-2">
              <Checkbox checked={form.auto_archive} onChange={(v) => set("auto_archive", v)} />
              <span className="text-[12px]">Archiviazione automatica il primo del mese</span>
            </label>
          </Block>
        </div>
      )}

      {tab === "tariffe" && (
        <div className="flex flex-col gap-4">
          <Block title="Punto di partenza" hint="Da qui si calcolano le distanze quando non si indica un'altra partenza.">
            <Input
              label="Sede aziendale"
              value={form.origin_address}
              onChange={(e) => set("origin_address", e.target.value)}
              placeholder="Via Galileo Galilei 2, Giulianova (TE)"
            />
          </Block>

          <Block title="Tariffe" hint="La quota per veicolo si imposta nella scheda Veicoli; qui c'è quella di ripiego.">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Quota €/km di default"
                type="number"
                step="0.0001"
                min="0"
                value={String(form.default_rate_per_km)}
                onChange={(e) => set("default_rate_per_km", Number(e.target.value) || 0)}
              />
              <Input
                label="Indennità di trasferta €/giorno"
                type="number"
                step="0.01"
                min="0"
                value={String(form.daily_allowance)}
                onChange={(e) => set("daily_allowance", Number(e.target.value) || 0)}
              />
            </div>
            <Input
              className="mt-3"
              label="Fonte della tabella"
              value={form.aci_source}
              onChange={(e) => set("aci_source", e.target.value)}
              placeholder="Tabella ACI · banca dati 01/01/2025 · percorrenza fino a 15.000 km"
            />
            <label className="mt-2 flex cursor-pointer items-center gap-2">
              <Checkbox checked={form.daily_allowance_auto} onChange={(v) => set("daily_allowance_auto", v)} />
              <span className="text-[12px]">Applica l'indennità di trasferta alle nuove righe</span>
            </label>
          </Block>

          <Block title="Google Maps" hint="La chiave resta sul server: l'autocomplete e il calcolo passano dal backend.">
            <Input
              label={form.maps_configured ? "Chiave API (già configurata)" : "Chiave API"}
              type="password"
              value={mapsKey}
              onChange={(e) => setMapsKey(e.target.value)}
              placeholder={form.maps_configured ? "•••••••• — scrivi per sostituirla" : "AIza…"}
              hint="Servono Places API (New) e Routes API con fatturazione attiva."
            />
          </Block>

          <Block title="Prove documentali richieste" hint="Le trasferte senza queste prove vengono segnalate come incomplete.">
            <div className="flex flex-col gap-2">
              {(Object.keys(EVIDENCE_META) as EvidenceKind[]).map((kind) => (
                <label key={kind} className="flex cursor-pointer items-start gap-2.5">
                  <Checkbox
                    checked={form.evidence_required.includes(kind)}
                    onChange={() => toggleEvidence(kind)}
                  />
                  <span>
                    <b className="block text-[12px]">{EVIDENCE_META[kind].label}</b>
                    <span className="text-[11px] text-muted dark:text-muted-dark">{EVIDENCE_META[kind].hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </Block>
        </div>
      )}

      {tab === "veicoli" && (
        <VehiclesTab
          vehicles={vehicles}
          people={people}
          companyId={companyId}
          aciSource={form.aci_source}
          onChanged={onVehiclesChanged}
        />
      )}

      {tab === "nota" && (
        <div className="flex flex-col gap-4">
          <Block title="Intestazione della nota spese" hint="Compare in cima al PDF e sul cartiglio del foglio.">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Ragione sociale"
                value={form.header_company}
                onChange={(e) => set("header_company", e.target.value)}
              />
              <Input label="Partita IVA" value={form.header_vat} onChange={(e) => set("header_vat", e.target.value)} />
              <Input
                label="Luogo di firma"
                value={form.header_sign_place}
                onChange={(e) => set("header_sign_place", e.target.value)}
                placeholder="Montorio al Vomano"
              />
            </div>
            <Textarea
              className="mt-3"
              label="Testo di autorizzazione"
              rows={3}
              value={form.header_authorization}
              onChange={(e) => set("header_authorization", e.target.value)}
            />
          </Block>
        </div>
      )}
    </Modal>
  );
}

function Block({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line p-3 dark:border-[#2a2a2e]">
      <header className="mb-3">
        <b className="block text-[12px]">{title}</b>
        <span className="text-[11px] text-muted dark:text-muted-dark">{hint}</span>
      </header>
      {children}
    </section>
  );
}

function VehiclesTab({
  vehicles,
  people,
  companyId,
  aciSource,
  onChanged,
}: {
  vehicles: Vehicle[];
  people: { value: string; label: string }[];
  companyId: number | null;
  aciSource: string;
  onChanged: () => void;
}) {
  const toast = useToast();
  const year = new Date().getFullYear();
  const [plate, setPlate] = useState("");
  const [model, setModel] = useState("");
  const [owner, setOwner] = useState("");
  const [rate, setRate] = useState("");
  const [rateDrafts, setRateDrafts] = useState<Record<number, string>>({});

  const add = async () => {
    if (!plate.trim()) {
      toast.error("Indica la targa");
      return;
    }
    try {
      await createVehicleApi({
        company_id: companyId,
        plate: plate.trim(),
        model: model.trim() || null,
        user_id: owner ? Number(owner) : null,
        rate_per_km: rate ? Number(rate.replace(",", ".")) : undefined,
        rate_year: year,
      });
      setPlate("");
      setModel("");
      setOwner("");
      setRate("");
      onChanged();
      toast.success("Veicolo aggiunto");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Veicolo non aggiunto");
    }
  };

  const saveRate = async (vehicle: Vehicle) => {
    const value = rateDrafts[vehicle.id];
    if (!value) return;
    try {
      await upsertAciRateApi(
        { vehicle_id: vehicle.id, year, rate_per_km: Number(value.replace(",", ".")), source: aciSource },
        companyId
      );
      setRateDrafts((current) => ({ ...current, [vehicle.id]: "" }));
      onChanged();
      toast.success(`Quota ${year} aggiornata`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Quota non salvata");
    }
  };

  const remove = async (vehicle: Vehicle) => {
    try {
      await deleteVehicleApi(vehicle.id);
      onChanged();
      toast.success("Veicolo disattivato");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Operazione non riuscita");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Block title="Nuovo veicolo" hint="Ogni auto ha la sua quota ACI: è quella che moltiplica i chilometri.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Targa *" value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="GM141EM" />
          <Input label="Modello" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Jeep Avenger" />
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold text-muted dark:text-muted-dark">Intestato a</span>
            <SearchableSelect
              menuLayer="portal"
              value={owner}
              onChange={setOwner}
              options={[{ value: "", label: "Veicolo aziendale" }, ...people]}
              placeholder="Collaboratore"
            />
          </label>
          <Input
            label={`Quota €/km ${year}`}
            type="number"
            step="0.0001"
            min="0"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            placeholder="0,4927"
          />
        </div>
        <Button className="mt-3" variant="primary" size="sm" onClick={add} leftIcon={<Icon name="plus" className="h-3.5 w-3.5" />}>
          Aggiungi veicolo
        </Button>
      </Block>

      <div className="flex flex-col gap-2">
        {vehicles.length === 0 && (
          <p className="rounded-md border border-dashed border-line px-3 py-6 text-center text-[12px] text-muted dark:border-[#2a2a2e] dark:text-muted-dark">
            Nessun veicolo registrato.
          </p>
        )}
        {vehicles.map((vehicle) => (
          <div
            key={vehicle.id}
            className="flex flex-wrap items-center gap-3 rounded-md border border-line px-3 py-2.5 dark:border-[#2a2a2e]"
          >
            <span className="min-w-0 flex-1">
              <b className="block text-[12px]">{vehicle.label}</b>
              <span className="block text-[11px] text-muted dark:text-muted-dark">
                {vehicle.user_name ?? "Veicolo aziendale"} · quota oggi {num(vehicle.current_rate_per_km, 4)} €/km
                {vehicle.rates.length > 0 && ` · storico ${vehicle.rates.map((r) => r.year).join(", ")}`}
              </span>
            </span>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                step="0.0001"
                min="0"
                className="w-28"
                placeholder={`Quota ${year}`}
                value={rateDrafts[vehicle.id] ?? ""}
                onChange={(e) => setRateDrafts((current) => ({ ...current, [vehicle.id]: e.target.value }))}
              />
              <Button variant="secondary" size="sm" onClick={() => saveRate(vehicle)} disabled={!rateDrafts[vehicle.id]}>
                Salva quota
              </Button>
              <button
                type="button"
                title="Disattiva"
                onClick={() => remove(vehicle)}
                className="rounded-sm p-1.5 text-muted transition-colors hover:bg-danger/10 hover:text-danger dark:text-muted-dark"
              >
                <Icon name="trash" className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
