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
  updateVehicleApi,
  upsertAciRateApi,
  type EvidenceKind,
  type ExpenseSettings,
  type Vehicle,
  type VehicleUpdatePayload,
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

const FUELS = [
  { value: "benzina", label: "Benzina" },
  { value: "diesel", label: "Diesel" },
  { value: "ibrida", label: "Ibrida" },
  { value: "elettrica", label: "Elettrica" },
  { value: "gpl", label: "GPL" },
  { value: "metano", label: "Metano" },
];

// La proprietà cambia la dicitura che finisce sulla nota spese: l'auto del
// collaboratore "ce la concede dietro rimborso km", quella aziendale no.
const OWNERSHIPS = [
  { value: "dipendente", label: "Del collaboratore" },
  { value: "azienda", label: "Dell'azienda" },
];

const TABS: { key: Tab; label: string; icon: Parameters<typeof Icon>[0]["name"] }[] = [
  { key: "google", label: "Google", icon: "drive" },
  { key: "tariffe", label: "Tariffe", icon: "credit-card" },
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
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof ExpenseSettings>(key: K, value: ExpenseSettings[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      const updated = await updateExpenseSettingsApi(
        {
          origin_locked: form.origin_locked,
          daily_allowance: form.daily_allowance,
          default_rate_per_km: form.default_rate_per_km,
          aci_source: form.aci_source,
          daily_allowance_auto: form.daily_allowance_auto,
          evidence_required: form.evidence_required,
          google_account: form.google_account,
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
          header_declaration: form.header_declaration,
          header_vehicle_line: form.header_vehicle_line,
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

  const createSheet = async () => {
    try {
      const updated = await connectSheetApi(companyId);
      onSaved(updated);
      setForm(updated);
      toast.success("Modello caricato: i fogli dei collaboratori sono pronti");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Rendicontazione non preparata");
    }
  };

  const detachSheet = async () => {
    try {
      const updated = await disconnectSheetApi(companyId);
      onSaved(updated);
      setForm(updated);
      toast.success("Fogli scollegati (i file su Drive restano)");
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

  // L'altezza fissa va sul DIALOG, non sul corpo: quello ha `flex-1`
  // (flex-basis 0), che in colonna ha la precedenza sull'height e lascerebbe il
  // dialog dimensionato sul contenuto — cambiando scheda si accorciava.
  // Niente `mobileFullscreen` qui: porterebbe un `sm:h-auto` in conflitto, e su
  // telefono le impostazioni si usano dall'app, non da questa pagina.
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      icon={<Icon name="settings" className="h-5 w-5" />}
      title="Impostazioni rimborsi"
      description="Valgono per questa azienda."
      dialogClassName="h-[80vh]"
      subHeader={
        <div className="rounded-lg border border-line bg-paper p-2 dark:border-[#2a2a2e] dark:bg-[#131316]">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {TABS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[12px] font-semibold uppercase tracking-wider transition-colors ${
                  tab === item.key
                    ? "bg-ink text-paper dark:bg-[#f4f4f7] dark:text-[#0a0a0a]"
                    : "text-muted hover:bg-cream dark:text-[#9999a0] dark:hover:bg-[#1c1c20]"
                }`}
              >
                <Icon name={item.icon} className="h-4 w-4" />
                {item.label}
              </button>
            ))}
          </div>
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
            title="Account Google"
            hint="L'identità con cui il gestionale scrive i fogli e archivia su Drive."
          >
            <div className="grid gap-2 sm:grid-cols-2">
              <AccountChoice
                active={form.google_account === "azienda"}
                title="Account aziendale"
                description="Identità condivisa: regge anche i giri notturni e non dipende da nessuna persona."
                onClick={() => set("google_account", "azienda")}
              />
              <AccountChoice
                active={form.google_account === "personale"}
                title="Il mio account"
                description="I fogli nascono nel tuo Drive, a tuo nome. Se scolleghi il tuo Google, la sincronizzazione si ferma."
                onClick={() => set("google_account", "personale")}
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {form.google_connected ? (
                <span className="inline-flex items-center gap-1.5 rounded-pill border border-success/25 bg-success/10 px-2.5 py-1 text-[11px] font-semibold text-success">
                  <Icon name="check" className="h-3 w-3" />
                  {form.google_email}
                  {form.google_account === "personale" && form.google_user_name
                    ? ` · ${form.google_user_name}`
                    : ""}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-pill border border-warning/30 bg-warning/10 px-2.5 py-1 text-[11px] font-semibold text-warning">
                  <Icon name="alert-triangle" className="h-3 w-3" /> Non collegato
                </span>
              )}
              {form.google_error && <span className="text-[11px] text-danger">{form.google_error}</span>}
              <span className="flex-1" />
              {form.google_account === "personale" ? (
                <Link to="/profile">
                  <Button variant="ghost" size="sm" leftIcon={<Icon name="settings" className="h-3.5 w-3.5" />}>
                    Collega il tuo Google
                  </Button>
                </Link>
              ) : (
                <Link to={`/companies/${form.company_id}/brand?tab=google`}>
                  <Button variant="ghost" size="sm" leftIcon={<Icon name="settings" className="h-3.5 w-3.5" />}>
                    Apri impostazioni azienda
                  </Button>
                </Link>
              )}
            </div>

            {/* Cambiare identità non sposta i fogli già creati: restano nel Drive
                di prima, e da lì il gestionale non li raggiunge più. */}
            {form.google_account !== settings.google_account && form.user_sheets.length > 0 && (
              <p className="mt-2 rounded-md border border-warning/30 bg-warning/8 px-3 py-2 text-[11px] leading-relaxed text-warning">
                Ci sono già {form.user_sheets.length}{" "}
                {form.user_sheets.length === 1 ? "foglio" : "fogli"} nel Drive dell'account attuale. Cambiando
                identità il gestionale non potrà più scriverci: dovrai premere “Prepara i fogli” per rifarli
                nell'altro Drive, e i tab dei mesi passati vanno risincronizzati.
              </p>
            )}
          </Block>

          <Block
            title="Fogli di rendicontazione"
            hint="Uno per collaboratore, copia del modello dello studio, con un tab per mese."
          >
            {form.sheet_configured ? (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-1.5">
                  {form.user_sheets.length === 0 && (
                    <span className="text-[11px] text-muted dark:text-muted-dark">
                      Nessun foglio ancora: nasce da solo alla prima trasferta approvata di ciascuno.
                    </span>
                  )}
                  {form.user_sheets.map((sheet) => (
                    <a
                      key={sheet.user_id}
                      href={sheet.spreadsheet_url ?? undefined}
                      target="_blank"
                      rel="noopener"
                      className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-cream px-2.5 py-[3px] text-[11px] font-medium hover:text-brand-magenta dark:border-[#2a2a2e] dark:bg-[#1c1c20]"
                    >
                      <Icon name="document-text" className="h-3 w-3" />
                      {sheet.user_name ?? `Collaboratore ${sheet.user_id}`}
                    </a>
                  ))}
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
                <div className="flex">
                  <span className="flex-1" />
                  <Button variant="ghost" size="sm" onClick={detachSheet}>
                    Scollega tutto
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-[11px] leading-relaxed text-muted dark:text-muted-dark">
                  Il modello .xlsx viene caricato su Drive una volta sola; da lì nasce il foglio di ogni
                  collaboratore, con gli stessi colori, le stesse colonne e le stesse formule del file che lo studio
                  legge oggi.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" size="sm" onClick={createSheet} disabled={!form.google_connected}>
                    Prepara i fogli
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
          <Block
            title="Punto di partenza"
            hint="La sede si imposta nelle impostazioni dell'azienda; qui si decide solo se imporla."
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 truncate rounded-md border border-line bg-cream px-3 py-2.5 text-[12px] dark:border-[#2a2a2e] dark:bg-[#1c1c20]">
                {form.origin_address || "Nessuna sede impostata"}
              </span>
              <Link to={`/companies/${form.company_id}/brand?tab=settings`}>
                <Button variant="ghost" size="sm" leftIcon={<Icon name="settings" className="h-3.5 w-3.5" />}>
                  Cambia sede
                </Button>
              </Link>
            </div>
            <label className="mt-3 flex cursor-pointer items-start gap-2.5">
              <Checkbox checked={form.origin_locked} onChange={(v) => set("origin_locked", v)} />
              <span>
                <b className="block text-[12px]">Calcola sempre dalla sede</b>
                <span className="text-[11px] text-muted dark:text-muted-dark">
                  I chilometri si contano dalla sede alla destinazione, andata e ritorno, e chi inserisce non può
                  cambiare la partenza. Disattivandolo, l'indirizzo di partenza torna modificabile riga per riga.
                </span>
              </span>
            </label>
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
              label="Riga della targa"
              rows={2}
              value={form.header_vehicle_line}
              onChange={(e) => set("header_vehicle_line", e.target.value)}
            />
            <p className="mt-1 text-[11px] text-muted dark:text-muted-dark">
              Segnaposto: {"{targa}"}, {"{proprietario}"}, {"{modello}"} — il proprietario è quello scritto sul
              veicolo, altrimenti chi ha fatto la trasferta.
            </p>
            <Textarea
              className="mt-3"
              label="Testo di autorizzazione"
              rows={3}
              value={form.header_authorization}
              onChange={(e) => set("header_authorization", e.target.value)}
            />
            <Textarea
              className="mt-3"
              label="Dichiarazione in calce"
              rows={3}
              value={form.header_declaration}
              onChange={(e) => set("header_declaration", e.target.value)}
            />
            <p className="mt-1 text-[11px] text-muted dark:text-muted-dark">
              Segnaposto: {"{nome}"}, {"{azienda}"}, {"{piva}"}, {"{importo}"} — l'importo è il totale che risulta dal
              foglio, righe precompilate comprese.
            </p>
          </Block>
        </div>
      )}
    </Modal>
  );
}

function AccountChoice({
  active,
  title,
  description,
  onClick,
}: {
  active: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border p-3 text-left transition-colors ${
        active
          ? "border-brand-magenta bg-brand-magenta/5"
          : "border-line hover:bg-cream dark:border-[#2a2a2e] dark:hover:bg-[#1c1c20]"
      }`}
    >
      <span className="flex items-center gap-1.5">
        <Icon
          name={active ? "check-circle" : "information-circle"}
          className={`h-3.5 w-3.5 ${active ? "text-brand-magenta" : "text-muted dark:text-muted-dark"}`}
        />
        <b className="text-[12px]">{title}</b>
      </span>
      <span className="mt-1 block text-[11px] leading-relaxed text-muted dark:text-muted-dark">
        {description}
      </span>
    </button>
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
  // Una riga alla volta in modifica: il form si apre sotto il veicolo.
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<VehicleUpdatePayload>({});

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

  const openEdit = (vehicle: Vehicle) => {
    setEditing(vehicle.id);
    setDraft({
      plate: vehicle.plate,
      model: vehicle.model,
      fuel: vehicle.fuel,
      ownership: vehicle.ownership,
      owner_name: vehicle.owner_name,
      user_id: vehicle.user_id,
      notes: vehicle.notes,
    });
  };

  const setField = <K extends keyof VehicleUpdatePayload>(key: K, value: VehicleUpdatePayload[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const saveEdit = async (vehicle: Vehicle) => {
    if (!(draft.plate ?? "").trim()) {
      toast.error("La targa è obbligatoria");
      return;
    }
    try {
      await updateVehicleApi(vehicle.id, draft);
      setEditing(null);
      onChanged();
      toast.success("Veicolo aggiornato");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Veicolo non aggiornato");
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

  // Il predefinito è unico per ambito: il backend spegne gli altri della stessa
  // persona (o degli aziendali) quando se ne accende uno.
  const makeDefault = async (vehicle: Vehicle) => {
    try {
      await updateVehicleApi(vehicle.id, { is_default: !vehicle.is_default });
      onChanged();
      toast.success(
        vehicle.is_default ? "Non è più il predefinito" : `${vehicle.label} è ora il predefinito`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Operazione non riuscita");
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
                {vehicle.is_default && " · predefinito"}
              </span>
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                title={
                  vehicle.is_default
                    ? "È il veicolo predefinito"
                    : "Imponi come predefinito per chi non ne ha ancora usato uno"
                }
                onClick={() => makeDefault(vehicle)}
                className={`rounded-sm p-1.5 transition-colors ${
                  vehicle.is_default
                    ? "text-brand-magenta"
                    : "text-muted hover:text-ink dark:text-muted-dark dark:hover:text-white"
                }`}
              >
                <Icon name="star" className="h-4 w-4" />
              </button>
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
                title="Modifica"
                onClick={() => (editing === vehicle.id ? setEditing(null) : openEdit(vehicle))}
                className={`rounded-sm p-1.5 transition-colors ${
                  editing === vehicle.id
                    ? "text-brand-magenta"
                    : "text-muted hover:text-ink dark:text-muted-dark dark:hover:text-white"
                }`}
              >
                <Icon name="pencil" className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title="Disattiva"
                onClick={() => remove(vehicle)}
                className="rounded-sm p-1.5 text-muted transition-colors hover:bg-danger/10 hover:text-danger dark:text-muted-dark"
              >
                <Icon name="trash" className="h-3.5 w-3.5" />
              </button>
            </div>

            {editing === vehicle.id && (
              <div className="w-full border-t border-line pt-3 dark:border-[#2a2a2e]">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    label="Targa *"
                    value={draft.plate ?? ""}
                    onChange={(e) => setField("plate", e.target.value)}
                  />
                  <Input
                    label="Modello"
                    value={draft.model ?? ""}
                    onChange={(e) => setField("model", e.target.value)}
                    placeholder="Jeep Avenger"
                  />
                  <label className="block">
                    <span className="mb-1.5 block text-[11px] font-semibold text-muted dark:text-muted-dark">
                      Alimentazione
                    </span>
                    <SearchableSelect
                      menuLayer="portal"
                      value={draft.fuel ?? ""}
                      onChange={(v) => setField("fuel", v || null)}
                      options={[{ value: "", label: "Non indicata" }, ...FUELS]}
                      placeholder="Alimentazione"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[11px] font-semibold text-muted dark:text-muted-dark">
                      Intestato a
                    </span>
                    <SearchableSelect
                      menuLayer="portal"
                      value={draft.user_id ? String(draft.user_id) : ""}
                      onChange={(v) => setField("user_id", v ? Number(v) : null)}
                      options={[{ value: "", label: "Veicolo aziendale" }, ...people]}
                      placeholder="Collaboratore"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[11px] font-semibold text-muted dark:text-muted-dark">
                      Proprietà
                    </span>
                    <SearchableSelect
                      menuLayer="portal"
                      value={draft.ownership ?? "dipendente"}
                      onChange={(v) => setField("ownership", v)}
                      options={OWNERSHIPS}
                      placeholder="Proprietà"
                    />
                  </label>
                  <Input
                    label="Proprietario"
                    value={draft.owner_name ?? ""}
                    onChange={(e) => setField("owner_name", e.target.value || null)}
                    placeholder="Come compare in nota spese"
                  />
                </div>
                <Input
                  className="mt-3"
                  label="Note"
                  value={draft.notes ?? ""}
                  onChange={(e) => setField("notes", e.target.value || null)}
                />
                {/* La riga della targa in nota spese esce da questi campi: vale
                    la pena vederla prima di salvare. */}
                <p className="mt-2 text-[11px] text-muted dark:text-muted-dark">
                  In nota spese:{" "}
                  <i>
                    {draft.user_id && (draft.ownership ?? "dipendente") !== "azienda"
                      ? `targa auto: ${(draft.plate ?? "").toUpperCase()} di proprietà di ${
                          draft.owner_name?.trim() ||
                          people.find((p) => p.value === String(draft.user_id))?.label ||
                          "…"
                        } che ce la concede dietro rimborso km`
                      : `targa auto: ${(draft.plate ?? "").toUpperCase()} — veicolo aziendale`}
                  </i>
                </p>
                <div className="mt-3 flex gap-2">
                  <Button variant="primary" size="sm" onClick={() => saveEdit(vehicle)}>
                    Salva veicolo
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                    Annulla
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
