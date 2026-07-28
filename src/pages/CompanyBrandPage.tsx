import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { SignatureTemplateAdmin } from "../components/email/SignatureTemplateAdmin";
import { EmailAccountsSection } from "../components/email/EmailAccountsSection";
import { WorkloadWeightsSection } from "../components/workload/WorkloadWeightsSection";
import { useAuth } from "../hooks/useAuth";
import { useSelectedCompanyId } from "../hooks/useSelectedCompanyId";
import {
  getCompanyBrandApi,
  updateCompanyBrandApi,
  uploadCompanyAssetApi,
  type CompanyBrand,
  type UpdateCompanyBrandPayload,
  type CompanyAssetField,
  type CompanySettingResponse,
  listCompanySettingsApi,
  upsertCompanySettingApi,
  deleteCompanySettingApi,
  normalizeCompanySettingKey,
  listCompanyScheduleWindowsApi,
  syncCompanyItalianHolidaysApi,
  createCompanyScheduleWindowApi,
  updateCompanyScheduleWindowApi,
  deleteCompanyScheduleWindowApi,
  getCompanyApi,
  updateCompanyApi,
  listCardStylesApi,
  type CompanyScheduleWindow,
  type CompanyScheduleWindowKind,
  type CompanyScheduleWindowPayload,
  type CardStyleOption,
  type SocialPackageCardStyle,
} from "../api/companies";
import { useBrand } from "../context/BrandContext";
import { useToast } from "../context/ToastContext";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Icon } from "../components/ui/Icon";
import { Spinner } from "../components/ui/Spinner";
import { Badge } from "../components/ui/Badge";
import { Modal } from "../components/ui/Modal";
import { Checkbox } from "../components/ui/Checkbox";
import { SearchableSelect } from "../components/ui/SearchableSelect";
import { EmojiPickerField } from "../components/ui/EmojiPickerField";
import { ColorHexField } from "../components/ui/ColorHexField";
import { WorkAreasTab } from "../features/company/WorkAreasTab";
import { RolesTab } from "../features/company/RolesTab";
import { WorkTagsTab } from "../features/company/WorkTagsTab";
import { LlmSettingsTab } from "../features/company/LlmSettingsTab";
import { NotificheTab } from "../features/company/NotificheTab";

// ── Constants ─────────────────────────────────────────────────────────────────

// Intervalli per l'auto-archiviazione delle task completate ("" = mai).
const AUTO_ARCHIVE_OPTIONS = [
  { value: "", label: "Mai (disattivata)" },
  { value: "3", label: "Dopo 3 giorni" },
  { value: "7", label: "Dopo 1 settimana" },
  { value: "14", label: "Dopo 2 settimane" },
  { value: "30", label: "Dopo 1 mese" },
  { value: "90", label: "Dopo 3 mesi" },
  { value: "180", label: "Dopo 6 mesi" },
];

const KPI_OPTIONS = [
  { value: "active",   label: "Preventivi attivi" },
  { value: "accepted", label: "Accettati" },
  { value: "pipeline", label: "Pipeline" },
  { value: "clients",  label: "Clienti" },
];

interface LogoSlotMeta {
  field: CompanyAssetField;
  label: string;
  hint: string;
  wide?: boolean;
}

interface CompanySettingFormState {
  key: string;
  value: string;
  provider: string;
  label: string;
  is_secret: boolean;
  is_active: boolean;
}

type BrandTab = "login" | "brand" | "firma" | "email" | "media" | "settings" | "operations" | "notifiche" | "llm" | "areas" | "roles" | "tags";

const BRAND_TAB_LABELS: Record<BrandTab, string> = {
  login: "Login",
  brand: "Brand",
  firma: "Firma",
  email: "Email",
  media: "Media",
  settings: "Settings",
  operations: "Regole",
  notifiche: "Notifiche",
  llm: "LLM",
  areas: "Aree",
  roles: "Ruoli",
  tags: "Tag",
};

const SCHEDULE_KIND_OPTIONS: Array<{ value: CompanyScheduleWindowKind; label: string }> = [
  { value: "break", label: "Pausa" },
  { value: "holiday", label: "Festivo" },
  { value: "day_off", label: "Chiusura" },
  { value: "remote", label: "Remoto" },
];

const SCHEDULE_KIND_FILTER_OPTIONS: Array<{ value: "all" | CompanyScheduleWindowKind; label: string }> = [
  { value: "all", label: "Tutti i tipi" },
  ...SCHEDULE_KIND_OPTIONS,
];

const WEEKDAY_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: "Lun" },
  { value: 1, label: "Mar" },
  { value: 2, label: "Mer" },
  { value: 3, label: "Gio" },
  { value: 4, label: "Ven" },
  { value: 5, label: "Sab" },
  { value: 6, label: "Dom" },
];

interface ScheduleWindowFormState {
  kind: CompanyScheduleWindowKind;
  title: string;
  emoji: string;
  color: string;
  description: string;
  start_time: string;
  end_time: string;
  start_date: string;
  end_date: string;
  weekdays: number[];
  is_all_day: boolean;
  is_active: boolean;
}

const EMPTY_SCHEDULE_WINDOW_FORM: ScheduleWindowFormState = {
  kind: "break",
  title: "",
  emoji: "",
  color: "",
  description: "",
  start_time: "",
  end_time: "",
  start_date: "",
  end_date: "",
  weekdays: [],
  is_all_day: false,
  is_active: true,
};

function isValidHexColor(value: string) {
  return /^#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(value);
}

function isValidDateIso(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isValidTimeHHMM(value: string) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function toTimeHHMM(value: string | null | undefined) {
  if (!value) return "";
  const [hours, minutes] = value.split(":");
  if (!hours || !minutes) return "";
  return `${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}`;
}

function toScheduleWindowPayload(form: ScheduleWindowFormState): CompanyScheduleWindowPayload {
  return {
    kind: form.kind,
    title: form.title.trim(),
    emoji: form.emoji.trim() || null,
    color: form.color.trim() || null,
    description: form.description.trim() || null,
    start_time: form.start_time || null,
    end_time: form.end_time || null,
    start_date: form.start_date || null,
    end_date: form.end_date || null,
    weekdays: [...form.weekdays].sort((a, b) => a - b),
    is_all_day: form.is_all_day,
    is_active: form.is_active,
  };
}

function formatWeekdays(days: number[]) {
  if (!days.length) return "Nessun giorno";
  const byValue = new Map(WEEKDAY_OPTIONS.map((d) => [d.value, d.label]));
  return days.map((d) => byValue.get(d) || String(d)).join(", ");
}

function looksLikeSecretKey(key: string) {
  return /api_key|secret|token/i.test(key);
}

const LOGO_SLOTS: LogoSlotMeta[] = [
  { field: "logo_dark",             label: "Simbolo scuro",           hint: "Sidebar, favicon" },
  { field: "logo_light",            label: "Simbolo chiaro",          hint: "Su sfondi chiari" },
  { field: "logo_horizontal_dark",  label: "Logo orizzontale scuro",  hint: "Login, presentazioni" },
  { field: "logo_horizontal_light", label: "Logo orizzontale chiaro", hint: "Preventivi PDF" },
  { field: "logo_vertical_dark",    label: "Logo verticale scuro",    hint: "Splash, copertine" },
  { field: "logo_vertical_light",   label: "Logo verticale chiaro",   hint: "Documenti formali" },
  { field: "logo_hero",             label: "Hero / sfondo",           hint: "Max 8 MB", wide: true },
];

// ── Logo upload slot ──────────────────────────────────────────────────────────

interface LogoSlotProps extends LogoSlotMeta {
  currentUrl: string | null;
  companyId: number;
  onUploaded: (b: CompanyBrand) => void;
}

function LogoSlot({ field, label, hint, wide, currentUrl, companyId, onUploaded }: LogoSlotProps) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentUrl);

  useEffect(() => { setPreview(currentUrl); }, [currentUrl]);

  const handleChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      const updated = await uploadCompanyAssetApi(companyId, field, file);
      onUploaded(updated);
      toast.success(`${label} caricato`);
    } catch (err) {
      setPreview(currentUrl);
      toast.error(err instanceof Error ? err.message : "Errore upload");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }, [companyId, field, label, currentUrl, onUploaded, toast]);

  const isHero = field === "logo_hero";

  return (
    <div className={`flex flex-col gap-2 ${wide ? "col-span-full" : ""}`}>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
          {label}
        </p>
        <p className="text-[11px] text-muted dark:text-[#9999a0] opacity-70">{hint}</p>
      </div>

      {/* Preview */}
      <div
        className={`relative rounded-md border border-line dark:border-[#2a2a2e] bg-cream dark:bg-[#1c1c20] flex items-center justify-center overflow-hidden ${isHero ? "h-32" : "h-20"}`}
        style={isHero && preview ? {
          backgroundImage: `url(${preview})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        } : undefined}
      >
        {!isHero && (
          preview
            ? <img src={preview} alt={label} className="max-h-full max-w-full object-contain p-2" />
            : <Icon name="upload" className="w-8 h-8 text-muted opacity-30" />
        )}
        {isHero && !preview && (
          <Icon name="upload" className="w-8 h-8 text-muted opacity-30" />
        )}
        {uploading && (
          <div className="absolute inset-0 bg-paper/80 dark:bg-ink/80 flex items-center justify-center">
            <Spinner size="sm" />
          </div>
        )}
      </div>

      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md border border-line dark:border-[#2a2a2e] text-[11px] font-body font-bold uppercase tracking-wide text-muted dark:text-[#9999a0] hover:text-ink dark:hover:text-[#f4f4f7] hover:border-ink dark:hover:border-[#f4f4f7] transition-colors disabled:opacity-40"
      >
        <Icon name="upload" className="w-3.5 h-3.5" />
        {preview ? "Sostituisci" : "Carica"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml,image/webp"
        className="hidden"
        onChange={handleChange}
      />
    </div>
  );
}

// ── Color picker field ────────────────────────────────────────────────────────

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="w-[132px] max-w-full">
      <ColorHexField label={label} value={value} onChange={onChange} />
    </div>
  );
}

interface CompanySettingModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: CompanySettingFormState) => Promise<void>;
  saving: boolean;
  revealSecretValues: boolean;
  initial: CompanySettingFormState;
  isEdit: boolean;
}

function CompanySettingModal({
  open,
  onClose,
  onSubmit,
  saving,
  revealSecretValues,
  initial,
  isEdit,
}: CompanySettingModalProps) {
  const [form, setForm] = useState<CompanySettingFormState>(initial);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(initial);
      setError(null);
    }
  }, [initial, open]);

  const updateKey = (nextKey: string) => {
    const normalizedKey = nextKey;
    setForm((current) => ({
      ...current,
      key: normalizedKey,
      is_secret: current.is_secret || looksLikeSecretKey(normalizedKey),
    }));
  };

  const handleSubmit = async () => {
    const normalizedKey = normalizeCompanySettingKey(form.key);
    if (!normalizedKey) {
      setError("Inserisci una chiave valida");
      return;
    }
    if (!form.value.trim()) {
      setError("Inserisci un valore");
      return;
    }

    setError(null);
    await onSubmit({
      ...form,
      key: normalizedKey,
      provider: form.provider.trim(),
      label: form.label.trim(),
      value: form.value,
      is_secret: form.is_secret || looksLikeSecretKey(normalizedKey),
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Modifica setting" : "Nuovo setting"}
      description={revealSecretValues ? "Puoi vedere e modificare anche i valori segreti." : "I segreti restano mascherati finché non attivi la visualizzazione admin."}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Annulla
          </Button>
          <Button variant="primary" onClick={handleSubmit} loading={saving}>
            Salva
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && (
          <div className="rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        <Input
          label="Chiave"
          value={form.key}
          onChange={(e) => updateKey(e.target.value)}
          placeholder="fic.api_key"
          autoComplete="off"
        />

        <Input
          label="Provider"
          value={form.provider}
          onChange={(e) => setForm((current) => ({ ...current, provider: e.target.value }))}
          placeholder="fic"
          autoComplete="off"
        />

        <Input
          label="Label"
          value={form.label}
          onChange={(e) => setForm((current) => ({ ...current, label: e.target.value }))}
          placeholder="Chiave API Fatture in Cloud"
          autoComplete="off"
        />

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
            Valore
          </label>
          <input
            type={form.is_secret ? "password" : "text"}
            value={form.value}
            onChange={(e) => setForm((current) => ({ ...current, value: e.target.value }))}
            placeholder={form.is_secret && !revealSecretValues && isEdit ? "Valore segreto mascherato" : "Inserisci il valore"}
            className="w-full rounded-md border px-3 py-2.5 text-sm font-body bg-paper text-ink placeholder:text-muted border-line focus:border-ink focus:outline-none transition-colors duration-150 dark:bg-ink-soft dark:text-paper dark:border-line-dark dark:placeholder:text-muted-dark dark:focus:border-paper"
            autoComplete="off"
          />
          <p className="text-xs text-muted dark:text-[#9999a0]">
            {form.is_secret ? "Il valore è trattato come segreto." : "Il valore sarà visibile in chiaro."}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex items-center gap-2 rounded-md border border-line dark:border-[#2a2a2e] px-3 py-2.5">
            <Checkbox
              checked={form.is_secret}
              onChange={(v) => setForm((current) => ({ ...current, is_secret: v }))}
            />
            <span className="text-sm font-semibold text-ink dark:text-[#f4f4f7]">Segreto</span>
          </label>

          <label className="flex items-center gap-2 rounded-md border border-line dark:border-[#2a2a2e] px-3 py-2.5">
            <Checkbox
              checked={form.is_active}
              onChange={(v) => setForm((current) => ({ ...current, is_active: v }))}
            />
            <span className="text-sm font-semibold text-ink dark:text-[#f4f4f7]">Attivo</span>
          </label>
        </div>
      </div>
    </Modal>
  );
}

interface DeleteSettingModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  deleting: boolean;
  setting: CompanySettingResponse | null;
}

function DeleteSettingModal({ open, onClose, onConfirm, deleting, setting }: DeleteSettingModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Elimina setting"
      description="L'operazione rimuove la chiave selezionata."
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={deleting}>
            Annulla
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={deleting}>
            Elimina
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm text-muted dark:text-[#9999a0]">
        <p>
          Vuoi eliminare definitivamente <span className="font-semibold text-ink dark:text-[#f4f4f7]">{setting?.key}</span>?
        </p>
        {setting?.is_secret && (
          <Badge variant="warning" className="w-fit">
            Segreto
          </Badge>
        )}
      </div>
    </Modal>
  );
}

interface ScheduleWindowModalProps {
  open: boolean;
  isEdit: boolean;
  saving: boolean;
  initial: ScheduleWindowFormState;
  onClose: () => void;
  onSubmit: (payload: CompanyScheduleWindowPayload) => Promise<void>;
}

function ScheduleWindowModal({ open, isEdit, saving, initial, onClose, onSubmit }: ScheduleWindowModalProps) {
  const [form, setForm] = useState<ScheduleWindowFormState>(initial);
  const [error, setError] = useState<string | null>(null);

  const scheduleKindSelectOptions = SCHEDULE_KIND_OPTIONS.map((opt) => ({
    value: opt.value,
    label: opt.label,
  }));

  useEffect(() => {
    if (open) {
      setForm(initial);
      setError(null);
    }
  }, [initial, open]);

  const toggleWeekday = (day: number) => {
    setForm((current) => {
      const exists = current.weekdays.includes(day);
      return {
        ...current,
        weekdays: exists ? current.weekdays.filter((d) => d !== day) : [...current.weekdays, day],
      };
    });
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      setError("Il titolo è obbligatorio");
      return;
    }

    if (form.color && !isValidHexColor(form.color)) {
      setError("Il colore deve essere un hex valido (es. #0ea5e9)");
      return;
    }

    if (form.start_date && !isValidDateIso(form.start_date)) {
      setError("Formato start_date non valido (YYYY-MM-DD)");
      return;
    }
    if (form.end_date && !isValidDateIso(form.end_date)) {
      setError("Formato end_date non valido (YYYY-MM-DD)");
      return;
    }
    if (form.start_date && form.end_date && form.end_date < form.start_date) {
      setError("end_date non può essere minore di start_date");
      return;
    }

    if (form.is_all_day) {
      if (form.start_time || form.end_time) {
        setError("Con all-day attivo, start_time/end_time devono essere vuoti");
        return;
      }
    } else {
      const hasStart = !!form.start_time;
      const hasEnd = !!form.end_time;
      if (hasStart !== hasEnd) {
        setError("start_time ed end_time devono essere entrambi valorizzati o entrambi vuoti");
        return;
      }
      if (hasStart && hasEnd) {
        if (!isValidTimeHHMM(form.start_time) || !isValidTimeHHMM(form.end_time)) {
          setError("Formato orario non valido (HH:MM)");
          return;
        }
        if (form.end_time <= form.start_time) {
          setError("end_time deve essere maggiore di start_time");
          return;
        }
      }
    }

    const invalidDay = form.weekdays.some((d) => d < 0 || d > 6 || !Number.isInteger(d));
    if (invalidDay) {
      setError("weekdays deve contenere solo valori tra 0 e 6");
      return;
    }

    setError(null);
    await onSubmit(toScheduleWindowPayload(form));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Modifica regola operativa" : "Nuova regola operativa"}
      description="Configura pause, festivi, chiusure e remoto"
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Annulla</Button>
          <Button variant="primary" onClick={handleSubmit} loading={saving}>Salva</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <div className="rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</div>}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">Tipo</label>
            <SearchableSelect
              value={form.kind}
              onChange={(next) => setForm((c) => ({ ...c, kind: next as CompanyScheduleWindowKind }))}
              options={scheduleKindSelectOptions}
              placeholder="Seleziona tipo"
              searchPlaceholder="Cerca tipo..."
            />
          </div>
          <Input label="Titolo" value={form.title} onChange={(e) => setForm((c) => ({ ...c, title: e.target.value }))} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_92px_132px] gap-3 items-start">
          <Input label="Descrizione" value={form.description} onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))} />
          <div className="w-[92px] max-w-full">
            <EmojiPickerField
              label="Emoji"
              value={form.emoji}
              onChange={(value) => setForm((c) => ({ ...c, emoji: value }))}
              searchPlaceholder="Cerca emoji..."
            />
          </div>
          <div className="w-[132px] max-w-full">
            <ColorHexField
              label="Colore"
              value={form.color}
              onChange={(value) => setForm((c) => ({ ...c, color: value }))}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Data inizio" type="date" value={form.start_date} onChange={(e) => setForm((c) => ({ ...c, start_date: e.target.value }))} />
          <Input label="Data fine" type="date" value={form.end_date} onChange={(e) => setForm((c) => ({ ...c, end_date: e.target.value }))} />
          <Input label="Ora inizio" type="time" value={form.start_time} onChange={(e) => setForm((c) => ({ ...c, start_time: e.target.value }))} disabled={form.is_all_day} />
          <Input label="Ora fine" type="time" value={form.end_time} onChange={(e) => setForm((c) => ({ ...c, end_time: e.target.value }))} disabled={form.is_all_day} />
        </div>

        <div className="flex flex-wrap gap-2">
          {WEEKDAY_OPTIONS.map((day) => {
            const selected = form.weekdays.includes(day.value);
            return (
              <button
                key={day.value}
                type="button"
                onClick={() => toggleWeekday(day.value)}
                className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${selected ? "border-ink bg-ink text-paper dark:border-paper dark:bg-paper dark:text-ink" : "border-line text-muted hover:border-ink hover:text-ink dark:border-[#2a2a2e] dark:text-[#9999a0] dark:hover:border-paper dark:hover:text-paper"}`}
              >
                {day.label}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex items-center gap-2 rounded-md border border-line dark:border-[#2a2a2e] px-3 py-2.5">
            <Checkbox checked={form.is_all_day} onChange={(v) => setForm((c) => ({ ...c, is_all_day: v, start_time: v ? "" : c.start_time, end_time: v ? "" : c.end_time }))} />
            <span className="text-sm font-semibold text-ink dark:text-[#f4f4f7]">Tutto il giorno</span>
          </label>
          <label className="flex items-center gap-2 rounded-md border border-line dark:border-[#2a2a2e] px-3 py-2.5">
            <Checkbox checked={form.is_active} onChange={(v) => setForm((c) => ({ ...c, is_active: v }))} />
            <span className="text-sm font-semibold text-ink dark:text-[#f4f4f7]">Attiva</span>
          </label>
        </div>
      </div>
    </Modal>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type FormState = UpdateCompanyBrandPayload & { notif_sound_enabled?: boolean | null };

export function CompanyBrandPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { user, permissions, myCompanies, activeCompanyId } = useAuth();
  const { refetch: refetchGlobalBrand } = useBrand();
  const { selectedCompanyId } = useSelectedCompanyId(activeCompanyId ?? user?.company_id ?? null);

  const routeCompanyId = Number(id);
  const companyId = selectedCompanyId ?? routeCompanyId;
  const selectedCompanyName = myCompanies.find((company) => company.id === companyId)?.name;
  const companyName = selectedCompanyName ?? (location.state as { name?: string } | null)?.name ?? `Azienda #${companyId}`;

  useEffect(() => {
    if (!selectedCompanyId) return;
    if (!Number.isFinite(routeCompanyId)) return;
    if (selectedCompanyId === routeCompanyId) return;

    navigate(
      {
        pathname: `/companies/${selectedCompanyId}/brand`,
        search: location.search,
      },
      {
        replace: true,
        state: { ...(location.state as object | null), name: selectedCompanyName },
      }
    );
  }, [location.search, location.state, navigate, routeCompanyId, selectedCompanyId, selectedCompanyName]);

  const [brand, setBrand] = useState<CompanyBrand | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [form, setForm] = useState<FormState>({});
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<CompanySettingResponse[]>([]);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [showSecretValues, setShowSecretValues] = useState(false);
  const [settingModalOpen, setSettingModalOpen] = useState(false);
  const [settingSaving, setSettingSaving] = useState(false);
  const [settingDeleting, setSettingDeleting] = useState(false);
  const [settingToDelete, setSettingToDelete] = useState<CompanySettingResponse | null>(null);
  const [settingInitial, setSettingInitial] = useState<CompanySettingFormState>({
    key: "",
    value: "",
    provider: "",
    label: "",
    is_secret: false,
    is_active: true,
  });
  const [settingEditingKey, setSettingEditingKey] = useState<string | null>(null);
  const [scheduleWindows, setScheduleWindows] = useState<CompanyScheduleWindow[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleKindFilter, setScheduleKindFilter] = useState<"all" | CompanyScheduleWindowKind>("all");
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [scheduleModalSaving, setScheduleModalSaving] = useState(false);
  const [scheduleEditing, setScheduleEditing] = useState<CompanyScheduleWindow | null>(null);
  const [scheduleDeleteTarget, setScheduleDeleteTarget] = useState<CompanyScheduleWindow | null>(null);
  const [scheduleDeleting, setScheduleDeleting] = useState(false);
  const [holidaySyncing, setHolidaySyncing] = useState(false);
  const [openingTime, setOpeningTime] = useState("");
  const [closingTime, setClosingTime] = useState("");
  const [companyTimeError, setCompanyTimeError] = useState<string | null>(null);
  const [companyTimeSaving, setCompanyTimeSaving] = useState(false);
  const [companyTimeLoading, setCompanyTimeLoading] = useState(false);
  const [cardStyle, setCardStyle] = useState<SocialPackageCardStyle>("sober");
  const [cardStyleOptions, setCardStyleOptions] = useState<CardStyleOption[]>([]);
  const [cardStyleSaving, setCardStyleSaving] = useState(false);
  // Tab iniziale da ?tab= (serve al ritorno dall'OAuth Google del tab Email,
  // che ricarica la pagina; rende anche i tab linkabili).
  const [activeTab, setActiveTab] = useState<BrandTab>(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    return t && (Object.keys(BRAND_TAB_LABELS) as string[]).includes(t) ? (t as BrandTab) : "login";
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (activeTab === "login") params.delete("tab");
    else params.set("tab", activeTab);
    const qs = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
  }, [activeTab]);
  const canEditSettings = !!user?.is_admin;
  const canManageRoles = !!permissions?.can_manage_roles || !!permissions?.is_admin;

  useEffect(() => {
    setIsLoading(true);
    getCompanyBrandApi(companyId)
      .then((b) => {
        setBrand(b);
        setForm({
          login_title:        b.login_title        ?? "",
          login_subtitle:     b.login_subtitle     ?? "",
          login_tagline:      b.login_tagline      ?? "",
          app_name:           b.app_name           ?? "",
          app_short_name:     b.app_short_name     ?? "",
          primary_color:      b.primary_color      ?? "#2b1342",
          bg_color:           b.bg_color           ?? "#0a0a0a",
          theme_color:        b.theme_color        ?? "#2b1342",
          dashboard_kpis:     b.dashboard_kpis     ?? ["active", "accepted", "pipeline", "clients"],
          auto_archive_completed_days: b.auto_archive_completed_days ?? null,
          // Contatti / firma
          website:            b.website            ?? "",
          contact_email:      b.contact_email      ?? "",
          phone:              b.phone              ?? "",
          address:            b.address            ?? "",
          address_maps_url:   b.address_maps_url   ?? "",
          signature_logo_url: b.signature_logo_url ?? "",
          facebook_url:       b.facebook_url       ?? "",
          instagram_url:      b.instagram_url      ?? "",
          linkedin_url:       b.linkedin_url       ?? "",
          tiktok_url:         b.tiktok_url         ?? "",
          youtube_url:        b.youtube_url        ?? "",
        });
      })
      .catch(() => toast.error("Impossibile caricare il brand"))
      .finally(() => setIsLoading(false));
  }, [companyId, toast]);

  useEffect(() => {
    setCompanyTimeLoading(true);
    getCompanyApi(companyId)
      .then((company) => {
        setOpeningTime(toTimeHHMM(company.opening_time));
        setClosingTime(toTimeHHMM(company.closing_time));
        setCardStyle(company.social_packages_card_style ?? "sober");
      })
      .catch(() => {
        setOpeningTime("");
        setClosingTime("");
        toast.error("Impossibile recuperare gli orari aziendali");
      })
      .finally(() => setCompanyTimeLoading(false));
  }, [companyId, toast]);

  useEffect(() => {
    if (!canEditSettings) return;
    listCardStylesApi().then(setCardStyleOptions).catch(() => setCardStyleOptions([]));
  }, [canEditSettings]);

  const handleCardStyleChange = useCallback(async (style: SocialPackageCardStyle) => {
    const previous = cardStyle;
    setCardStyle(style);
    setCardStyleSaving(true);
    try {
      await updateCompanyApi(companyId, { social_packages_card_style: style });
      toast.success("Stile card pacchetti aggiornato");
    } catch (err) {
      setCardStyle(previous);
      toast.error(err instanceof Error ? err.message : "Errore aggiornamento stile card");
    } finally {
      setCardStyleSaving(false);
    }
  }, [cardStyle, companyId, toast]);

  const set = useCallback((k: string, v: unknown) =>
    setForm((f) => ({ ...f, [k]: v })), []);

  const toggleKpi = useCallback((kpi: string) =>
    setForm((f) => {
      const current = f.dashboard_kpis ?? [];
      return {
        ...f,
        dashboard_kpis: current.includes(kpi)
          ? current.filter((k) => k !== kpi)
          : [...current, kpi],
      };
    }), []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const updated = await updateCompanyBrandApi(companyId, form);
      setBrand(updated);
      refetchGlobalBrand();
      toast.success("Brand aggiornato");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore");
    } finally {
      setSaving(false);
    }
  }, [companyId, form, toast, refetchGlobalBrand]);

  const handleUploaded = useCallback((updated: CompanyBrand) => {
    setBrand(updated);
    refetchGlobalBrand();
  }, [refetchGlobalBrand]);

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    setSettingsError(null);
    try {
      const items = await listCompanySettingsApi(companyId, {
        include_secret_values: canEditSettings && showSecretValues,
      });
      setSettings(items);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Impossibile recuperare i settings";
      setSettingsError(message);
      toast.error(message);
    } finally {
      setSettingsLoading(false);
    }
  }, [companyId, canEditSettings, showSecretValues, toast]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const loadScheduleWindows = useCallback(async () => {
    setScheduleLoading(true);
    setScheduleError(null);
    try {
      const items = await listCompanyScheduleWindowsApi(companyId);
      setScheduleWindows(items);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Impossibile recuperare le regole operative";
      setScheduleError(message);
      toast.error(message);
    } finally {
      setScheduleLoading(false);
    }
  }, [companyId, toast]);

  useEffect(() => {
    loadScheduleWindows();
  }, [loadScheduleWindows]);

  const handleSyncItalianHolidays = useCallback(async () => {
    if (!canEditSettings) return;
    setHolidaySyncing(true);
    try {
      const result = await syncCompanyItalianHolidaysApi(companyId);
      await loadScheduleWindows();
      toast.success(
        `Festivita sincronizzate (${result.year}): ${result.created} create, ${result.updated} aggiornate, ${result.skipped} invariate`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore sincronizzazione festivita italiane");
    } finally {
      setHolidaySyncing(false);
    }
  }, [canEditSettings, companyId, loadScheduleWindows, toast]);

  const openNewScheduleWindow = useCallback(() => {
    setScheduleEditing(null);
    setScheduleModalOpen(true);
  }, []);

  const openEditScheduleWindow = useCallback((window: CompanyScheduleWindow) => {
    setScheduleEditing(window);
    setScheduleModalOpen(true);
  }, []);

  const handleSaveScheduleWindow = useCallback(async (payload: CompanyScheduleWindowPayload) => {
    if (!canEditSettings) return;
    setScheduleModalSaving(true);
    try {
      const saved = scheduleEditing
        ? await updateCompanyScheduleWindowApi(companyId, scheduleEditing.id, payload)
        : await createCompanyScheduleWindowApi(companyId, payload);
      setScheduleWindows((current) => {
        const next = current.filter((item) => item.id !== saved.id);
        return [...next, saved].sort((a, b) => {
          const byKind = a.kind.localeCompare(b.kind);
          if (byKind !== 0) return byKind;
          return a.title.localeCompare(b.title);
        });
      });
      setScheduleModalOpen(false);
      setScheduleEditing(null);
      toast.success(scheduleEditing ? "Regola aggiornata" : "Regola creata");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore salvataggio regola");
    } finally {
      setScheduleModalSaving(false);
    }
  }, [canEditSettings, companyId, scheduleEditing, toast]);

  const handleDeleteScheduleWindow = useCallback(async () => {
    if (!canEditSettings || !scheduleDeleteTarget) return;
    setScheduleDeleting(true);
    try {
      await deleteCompanyScheduleWindowApi(companyId, scheduleDeleteTarget.id);
      setScheduleWindows((current) => current.filter((item) => item.id !== scheduleDeleteTarget.id));
      setScheduleDeleteTarget(null);
      toast.success("Regola eliminata");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore eliminazione regola");
    } finally {
      setScheduleDeleting(false);
    }
  }, [canEditSettings, companyId, scheduleDeleteTarget, toast]);

  const handleToggleScheduleActive = useCallback(async (window: CompanyScheduleWindow) => {
    if (!canEditSettings) return;
    const prev = window.is_active;
    setScheduleWindows((current) => current.map((item) => item.id === window.id ? { ...item, is_active: !prev } : item));
    try {
      const updated = await updateCompanyScheduleWindowApi(companyId, window.id, { is_active: !prev });
      setScheduleWindows((current) => current.map((item) => item.id === window.id ? updated : item));
    } catch (err) {
      setScheduleWindows((current) => current.map((item) => item.id === window.id ? { ...item, is_active: prev } : item));
      toast.error(err instanceof Error ? err.message : "Errore aggiornamento stato regola");
    }
  }, [canEditSettings, companyId, toast]);

  const handleSaveCompanyTimes = useCallback(async () => {
    if (!canEditSettings) return;
    const hasOpening = !!openingTime;
    const hasClosing = !!closingTime;

    if (hasOpening !== hasClosing) {
      setCompanyTimeError("Orario di apertura e chiusura devono essere entrambi valorizzati o entrambi vuoti");
      return;
    }

    if (hasOpening && (!isValidTimeHHMM(openingTime) || !isValidTimeHHMM(closingTime))) {
      setCompanyTimeError("Formato orario non valido (HH:MM)");
      return;
    }

    if (hasOpening && closingTime <= openingTime) {
      setCompanyTimeError("L'orario di chiusura deve essere dopo quello di apertura");
      return;
    }

    setCompanyTimeError(null);
    setCompanyTimeSaving(true);
    try {
      const updated = await updateCompanyApi(companyId, {
        opening_time: hasOpening ? openingTime : null,
        closing_time: hasClosing ? closingTime : null,
      });
      setOpeningTime(toTimeHHMM(updated.opening_time));
      setClosingTime(toTimeHHMM(updated.closing_time));
      toast.success("Orari azienda aggiornati");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore aggiornamento orari azienda");
    } finally {
      setCompanyTimeSaving(false);
    }
  }, [canEditSettings, closingTime, companyId, openingTime, toast]);

  const openNewSetting = useCallback(() => {
    setSettingEditingKey(null);
    setSettingInitial({
      key: "",
      value: "",
      provider: "",
      label: "",
      is_secret: false,
      is_active: true,
    });
    setSettingModalOpen(true);
  }, []);

  const openEditSetting = useCallback((setting: CompanySettingResponse) => {
    setSettingEditingKey(setting.key);
    setSettingInitial({
      key: setting.key,
      value: setting.is_secret && !showSecretValues ? "" : (setting.value ?? ""),
      provider: setting.provider ?? "",
      label: setting.label ?? "",
      is_secret: setting.is_secret,
      is_active: setting.is_active,
    });
    setSettingModalOpen(true);
  }, [showSecretValues]);

  const handleSaveSetting = useCallback(async (payload: CompanySettingFormState) => {
    if (!canEditSettings) return;
    setSettingSaving(true);
    try {
      const updated = await upsertCompanySettingApi(companyId, payload.key, {
        value: payload.value,
        provider: payload.provider || null,
        label: payload.label || null,
        is_secret: payload.is_secret,
        is_active: payload.is_active,
      });
      setSettings((current) => {
        const next = current.filter((item) => item.key !== updated.key);
        return [...next, updated].sort((a, b) => {
          const providerA = (a.provider ?? "").localeCompare(b.provider ?? "");
          if (providerA !== 0) return providerA;
          return a.key.localeCompare(b.key);
        });
      });
      setSettingModalOpen(false);
      toast.success("Setting salvato");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nel salvataggio");
    } finally {
      setSettingSaving(false);
    }
  }, [companyId, canEditSettings, toast]);

  const handleDeleteSetting = useCallback(async () => {
    if (!canEditSettings || !settingToDelete) return;
    setSettingDeleting(true);
    try {
      await deleteCompanySettingApi(companyId, settingToDelete.key);
      setSettings((current) => current.filter((item) => item.key !== settingToDelete.key));
      setSettingToDelete(null);
      toast.success("Setting eliminato");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nell'eliminazione");
    } finally {
      setSettingDeleting(false);
    }
  }, [canEditSettings, companyId, settingToDelete, toast]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-40">
        <Spinner size="lg" />
      </div>
    );
  }

  const bgColor   = (form.bg_color as string)   || "#0a0a0a";
  const loginTitle    = (form.login_title as string)    || "";
  const loginSubtitle = (form.login_subtitle as string) || "";
  const loginTagline  = (form.login_tagline as string)  || "";
  const scheduleModalInitial: ScheduleWindowFormState = scheduleEditing
    ? {
      kind: scheduleEditing.kind,
      title: scheduleEditing.title,
      emoji: scheduleEditing.emoji ?? "",
      color: scheduleEditing.color ?? "",
      description: scheduleEditing.description ?? "",
      start_time: scheduleEditing.start_time ?? "",
      end_time: scheduleEditing.end_time ?? "",
      start_date: scheduleEditing.start_date ?? "",
      end_date: scheduleEditing.end_date ?? "",
      weekdays: scheduleEditing.weekdays ?? [],
      is_all_day: scheduleEditing.is_all_day,
      is_active: scheduleEditing.is_active,
    }
    : EMPTY_SCHEDULE_WINDOW_FORM;
  const filteredScheduleWindows = scheduleKindFilter === "all"
    ? scheduleWindows
    : scheduleWindows.filter((item) => item.kind === scheduleKindFilter);
  const scheduleKindLabels = new Map(SCHEDULE_KIND_OPTIONS.map((item) => [item.value, item.label]));

  return (
    <div className="px-6 py-8 pb-20 mx-auto w-full animate-fadeIn">

      {/* ── Back ── */}
      <button
        onClick={() => navigate("/companies")}
        className="flex items-center gap-1.5 text-[13px] font-body text-muted dark:text-[#9999a0] hover:text-ink dark:hover:text-[#f4f4f7] transition-colors mb-6"
      >
        <Icon name="chevron-right" className="w-3.5 h-3.5 rotate-180" />
        Aziende
      </button>

      {/* ── Header ── */}
      <div className="mb-8">
        <h1 className="section-title flex items-center gap-2.5">
          <Icon name="pencil" className="w-6 h-6" />
          {companyName}
        </h1>
      </div>

      <div className="mb-6 rounded-lg border border-line dark:border-[#2a2a2e] bg-paper dark:bg-[#131316] p-2">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-7">
          {(Object.keys(BRAND_TAB_LABELS) as BrandTab[]).map((tab) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`inline-flex items-center justify-center rounded-md px-3 py-2 text-[12px] font-semibold uppercase tracking-wider transition-colors ${
                  isActive
                    ? "bg-ink text-paper dark:bg-[#f4f4f7] dark:text-[#0a0a0a]"
                    : "text-muted hover:bg-cream dark:text-[#9999a0] dark:hover:bg-[#1c1c20]"
                }`}
              >
                {BRAND_TAB_LABELS[tab]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-6">

        {activeTab === "login" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
            <div className="bg-paper dark:bg-[#131316] rounded-lg border border-line dark:border-[#2a2a2e] p-6">
              <h2
                className="font-display font-bold tracking-tight text-ink dark:text-[#f4f4f7] mb-1"
                style={{ fontSize: "17px" }}
              >
                Schermata di login
              </h2>
              <p className="font-body text-[13px] text-muted dark:text-[#9999a0] mb-5">
                Testi e sfondo della pagina di accesso
              </p>
              <div className="flex flex-col gap-4">
                <Input
                  label="Titolo"
                  value={loginTitle}
                  onChange={(e) => set("login_title", e.target.value)}
                  placeholder="Abruzzo Digitale"
                />
                <Input
                  label="Sottotitolo"
                  value={loginSubtitle}
                  onChange={(e) => set("login_subtitle", e.target.value)}
                  placeholder="Accedi al pannello"
                />
                <Input
                  label="Tagline"
                  value={loginTagline}
                  onChange={(e) => set("login_tagline", e.target.value)}
                  placeholder="Cuore Abruzzese, Mente Digitale."
                />
                <ColorField
                  label="Colore sfondo"
                  value={bgColor}
                  onChange={(v) => set("bg_color", v)}
                />
              </div>
            </div>

            <div className="rounded-lg overflow-hidden border border-line dark:border-[#2a2a2e] sticky top-5 flex flex-col">
              <div className="flex items-center gap-1.5 px-3 py-2 bg-[#1c1c1e] flex-shrink-0">
                <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
                <span className="flex-1 mx-3 h-5 rounded bg-[#2a2a2e] flex items-center justify-center">
                  <span className="font-body text-[9px] text-white/25">login</span>
                </span>
              </div>
              <div
                className="flex-1 flex items-center justify-center px-6"
                style={{ background: bgColor }}
              >
                <div className="w-full max-w-[300px] flex flex-col items-center text-center">
                  <div
                    className="w-16 h-16 rounded-xl flex items-center justify-center mb-6 overflow-hidden"
                    style={{ background: "rgba(255,255,255,0.08)" }}
                  >
                    {brand?.logo_vertical_dark ? (
                      <img src={brand.logo_vertical_dark} className="w-14 h-14 object-contain" alt="" />
                    ) : (
                      <svg viewBox="0 0 32 32" className="w-9 h-9">
                        <rect width="32" height="32" rx="6" fill="white" fillOpacity=".15" />
                        <path d="M8 16h16M16 8v16" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                      </svg>
                    )}
                  </div>
                  <p
                    className="font-display font-bold text-white uppercase tracking-tight leading-tight mb-2"
                    style={{ fontSize: "26px" }}
                  >
                    {loginTitle || "TITOLO"}
                  </p>
                  <p className="font-body text-white/50 mb-1" style={{ fontSize: "13px" }}>
                    {loginSubtitle || "Sottotitolo"}
                  </p>
                  {loginTagline && (
                    <p
                      className="font-body italic"
                      style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)" }}
                    >
                      {loginTagline}
                    </p>
                  )}
                  <div className="w-full flex flex-col gap-2 mt-8">
                    <div
                      className="w-full rounded-md px-4 py-2.5 text-left"
                      style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}
                    >
                      <span className="font-body text-white/30" style={{ fontSize: "12px" }}>nome utente</span>
                    </div>
                    <div
                      className="w-full rounded-md px-4 py-2.5 text-left"
                      style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}
                    >
                      <span className="font-body text-white/30" style={{ fontSize: "12px" }}>••••••••</span>
                    </div>
                    <div
                      className="w-full rounded-pill py-2.5 font-body font-bold uppercase text-center mt-1"
                      style={{ fontSize: "12px", background: "#ffffff", color: bgColor, letterSpacing: "0.08em" }}
                    >
                      ACCEDI
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "brand" && (
          <>
            <div className="bg-paper dark:bg-[#131316] rounded-lg border border-line dark:border-[#2a2a2e] p-6">
              <h2
                className="font-display font-bold tracking-tight text-ink dark:text-[#f4f4f7] mb-1"
                style={{ fontSize: "17px" }}
              >
                Colori & App
              </h2>
              <p className="font-body text-[13px] text-muted dark:text-[#9999a0] mb-5">
                Colori principali e nome visualizzato nel browser / manifest
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                <ColorField
                  label="Colore primario"
                  value={(form.primary_color as string) || "#2b1342"}
                  onChange={(v) => set("primary_color", v)}
                />
                <ColorField
                  label="Colore tema (browser)"
                  value={(form.theme_color as string) || "#2b1342"}
                  onChange={(v) => set("theme_color", v)}
                />
                <Input
                  label="Nome app"
                  value={(form.app_name as string) ?? ""}
                  onChange={(e) => set("app_name", e.target.value)}
                  placeholder="Italia Digitale"
                />
                <Input
                  label="Nome breve (manifest)"
                  value={(form.app_short_name as string) ?? ""}
                  onChange={(e) => set("app_short_name", e.target.value)}
                  placeholder="ID"
                  hint="Max 12 caratteri per PWA"
                />
              </div>
            </div>

            <div className="bg-paper dark:bg-[#131316] rounded-lg border border-line dark:border-[#2a2a2e] p-6">
              <h2
                className="font-display font-bold tracking-tight text-ink dark:text-[#f4f4f7] mb-1"
                style={{ fontSize: "17px" }}
              >
                Contatti & Firma
              </h2>
              <p className="font-body text-[13px] text-muted dark:text-[#9999a0] mb-5">
                Dati aziendali usati nella firma email (uguali per tutti gli utenti). I dati personali restano da compilare nella firma.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                <Input
                  label="Sito web"
                  value={(form.website as string) ?? ""}
                  onChange={(e) => set("website", e.target.value)}
                  placeholder="https://www.abruzzodigitale.com"
                />
                <Input
                  label="Email aziendale"
                  value={(form.contact_email as string) ?? ""}
                  onChange={(e) => set("contact_email", e.target.value)}
                  placeholder="info@abruzzodigitale.com"
                />
                <Input
                  label="Telefono fisso"
                  value={(form.phone as string) ?? ""}
                  onChange={(e) => set("phone", e.target.value)}
                  placeholder="+39 085 956 4770"
                />
                <Input
                  label="Indirizzo"
                  value={(form.address as string) ?? ""}
                  onChange={(e) => set("address", e.target.value)}
                  placeholder="Corso Giuseppe Garibaldi 62, Giulianova"
                />
                <Input
                  label="Link Google Maps"
                  value={(form.address_maps_url as string) ?? ""}
                  onChange={(e) => set("address_maps_url", e.target.value)}
                  placeholder="https://maps.google.com/…"
                  hint="Opzionale: link cliccabile dell'indirizzo"
                />
                <Input
                  label="Logo firma (URL)"
                  value={(form.signature_logo_url as string) ?? ""}
                  onChange={(e) => set("signature_logo_url", e.target.value)}
                  placeholder="https://…/logo.png"
                  hint="Opzionale: logo dedicato alla firma email"
                />
                <Input
                  label="Facebook"
                  value={(form.facebook_url as string) ?? ""}
                  onChange={(e) => set("facebook_url", e.target.value)}
                  placeholder="https://www.facebook.com/abruzzodigitale"
                />
                <Input
                  label="Instagram"
                  value={(form.instagram_url as string) ?? ""}
                  onChange={(e) => set("instagram_url", e.target.value)}
                  placeholder="https://www.instagram.com/abruzzodigitale/"
                />
                <Input
                  label="LinkedIn"
                  value={(form.linkedin_url as string) ?? ""}
                  onChange={(e) => set("linkedin_url", e.target.value)}
                  placeholder="https://www.linkedin.com/company/abruzzo-digitale"
                />
                <Input
                  label="TikTok"
                  value={(form.tiktok_url as string) ?? ""}
                  onChange={(e) => set("tiktok_url", e.target.value)}
                  placeholder="https://www.tiktok.com/@abruzzodigitale"
                />
                <Input
                  label="YouTube"
                  value={(form.youtube_url as string) ?? ""}
                  onChange={(e) => set("youtube_url", e.target.value)}
                  placeholder="https://www.youtube.com/@abruzzodigitale"
                />
              </div>
            </div>

            <div className="bg-paper dark:bg-[#131316] rounded-lg border border-line dark:border-[#2a2a2e] p-6">
              <h2
                className="font-display font-bold tracking-tight text-ink dark:text-[#f4f4f7] mb-1"
                style={{ fontSize: "17px" }}
              >
                Loghi
              </h2>
              <p className="font-body text-[13px] text-muted dark:text-[#9999a0] mb-5">
                PNG · JPEG · SVG · WebP — Logo hero max 8 MB
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
                {LOGO_SLOTS.map((slot) => (
                  <LogoSlot
                    key={slot.field}
                    field={slot.field}
                    label={slot.label}
                    hint={slot.hint}
                    wide={slot.wide}
                    currentUrl={brand ? (brand[slot.field as keyof CompanyBrand] as string | null) : null}
                    companyId={companyId}
                    onUploaded={handleUploaded}
                  />
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <Button variant="primary" onClick={handleSave} loading={saving} size="lg">
                Salva modifiche
              </Button>
            </div>
          </>
        )}

        {activeTab === "firma" && <SignatureTemplateAdmin companyId={companyId} />}

        {activeTab === "email" && (
          <EmailAccountsSection
            companies={[]}
            defaultCompanyId={companyId}
            scope="company"
            lockCompany
            title="Email aziendale"
            description="Mittenti condivisi dell'organizzazione (es. info@): usati come mittente aziendale, indipendenti dagli account personali degli operatori. Le credenziali sono cifrate."
          />
        )}

        {activeTab === "media" && (
          <>
            <div className="bg-paper dark:bg-[#131316] rounded-lg border border-line dark:border-[#2a2a2e] p-6">
              <h2
                className="font-display font-bold tracking-tight text-ink dark:text-[#f4f4f7] mb-1"
                style={{ fontSize: "17px" }}
              >
                KPI Dashboard
              </h2>
              <p className="font-body text-[13px] text-muted dark:text-[#9999a0] mb-5">
                Metriche visibili nella schermata principale
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {KPI_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex items-center gap-2.5 p-3 rounded-md border cursor-pointer transition-colors ${
                      (form.dashboard_kpis ?? []).includes(opt.value)
                        ? "border-ink dark:border-[#f4f4f7] bg-cream dark:bg-[#1c1c20]"
                        : "border-line dark:border-[#2a2a2e] hover:border-muted"
                    }`}
                  >
                    <Checkbox
                      checked={(form.dashboard_kpis ?? []).includes(opt.value)}
                      onChange={() => toggleKpi(opt.value)}
                    />
                    <span className="text-sm font-body font-semibold text-ink dark:text-[#f4f4f7]">
                      {opt.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </>
        )}

        {activeTab === "settings" && (
          <>
            {/* Auto-archiviazione delle lavorazioni completate */}
            <div className="bg-paper dark:bg-[#131316] rounded-lg border border-line dark:border-[#2a2a2e] p-6">
              <h2
                className="font-display font-bold tracking-tight text-ink dark:text-[#f4f4f7] mb-1"
                style={{ fontSize: "17px" }}
              >
                Archiviazione automatica
              </h2>
              <p className="font-body text-[13px] text-muted dark:text-[#9999a0] mb-5">
                Le lavorazioni completate vengono archiviate automaticamente dopo il periodo scelto.
                Restano consultabili e ricercabili nell'Archivio.
              </p>
              <div className="max-w-xs">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
                  Archivia le completate dopo
                </label>
                <div className="mt-1">
                  <SearchableSelect
                    value={form.auto_archive_completed_days == null ? "" : String(form.auto_archive_completed_days)}
                    onChange={(v) => setForm((f) => ({ ...f, auto_archive_completed_days: v === "" ? null : Number(v) }))}
                    options={AUTO_ARCHIVE_OPTIONS}
                    placeholder="Scegli un periodo"
                    showAvatar={false}
                  />
                </div>
              </div>
            </div>

            <div className="bg-paper dark:bg-[#131316] rounded-lg border border-line dark:border-[#2a2a2e] p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-5">
                <div>
                  <h2
                    className="font-display font-bold tracking-tight text-ink dark:text-[#f4f4f7] mb-1"
                    style={{ fontSize: "17px" }}
                  >
                    Settings azienda
                  </h2>
                  <p className="font-body text-[13px] text-muted dark:text-[#9999a0]">
                    Configurazioni tecniche per integrazioni e automazioni.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {canEditSettings && (
                    <button
                      type="button"
                      onClick={() => setShowSecretValues((current) => !current)}
                      className="inline-flex items-center gap-2 rounded-pill border border-line px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink transition-colors hover:bg-cream dark:border-[#2a2a2e] dark:text-[#f4f4f7] dark:hover:bg-[#1c1c20]"
                    >
                      <Icon name={showSecretValues ? "eye-off" : "eye"} className="w-3.5 h-3.5" />
                      {showSecretValues ? "Nascondi segreti" : "Mostra segreti"}
                    </button>
                  )}

                  {canEditSettings && (
                    <Button variant="primary" onClick={openNewSetting} leftIcon={<Icon name="plus" className="w-3.5 h-3.5" />}>
                      Nuovo setting
                    </Button>
                  )}
                </div>
              </div>

              {settingsError && (
                <div className="mb-4 rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
                  {settingsError}
                </div>
              )}

              {settingsLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Spinner size="md" />
                </div>
              ) : settings.length === 0 ? (
                <div className="rounded-md border border-dashed border-line dark:border-[#2a2a2e] px-4 py-8 text-sm text-muted dark:text-[#9999a0]">
                  Nessun setting configurato.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full border-separate border-spacing-y-2">
                    <thead>
                      <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                        <th className="px-3 py-1">Chiave</th>
                        <th className="px-3 py-1">Valore</th>
                        <th className="px-3 py-1">Provider</th>
                        <th className="px-3 py-1">Label</th>
                        <th className="px-3 py-1">Stato</th>
                        {canEditSettings && <th className="px-3 py-1 text-right">Azioni</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {settings.map((setting) => {
                        const valueText = setting.is_secret && !showSecretValues
                          ? (setting.has_value ? "••••••" : "—")
                          : (setting.value ?? "—");

                        return (
                          <tr key={setting.id} className="align-top bg-cream dark:bg-[#1c1c20]">
                            <td className="px-3 py-3 rounded-l-md">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-[13px] text-ink dark:text-[#f4f4f7]">
                                  {setting.key}
                                </span>
                                {setting.is_secret && (
                                  <Badge variant="warning">Segreto</Badge>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-3 text-[13px] text-muted dark:text-[#9999a0] break-all">
                              {valueText}
                            </td>
                            <td className="px-3 py-3 text-[13px] text-muted dark:text-[#9999a0]">
                              {setting.provider ?? "—"}
                            </td>
                            <td className="px-3 py-3 text-[13px] text-muted dark:text-[#9999a0]">
                              {setting.label ?? "—"}
                            </td>
                            <td className="px-3 py-3">
                              <Badge variant={setting.is_active ? "success" : "default"}>
                                {setting.is_active ? "Attivo" : "Disattivo"}
                              </Badge>
                            </td>
                            {canEditSettings && (
                              <td className="px-3 py-3 rounded-r-md">
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => openEditSetting(setting)}
                                    className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink transition-colors hover:bg-paper dark:border-[#2a2a2e] dark:text-[#f4f4f7] dark:hover:bg-[#131316]"
                                  >
                                    <Icon name="pencil" className="w-3.5 h-3.5" />
                                    Modifica
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setSettingToDelete(setting)}
                                    className="inline-flex items-center gap-1.5 rounded-md border border-danger/20 bg-danger/5 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-danger transition-colors hover:bg-danger/10"
                                  >
                                    <Icon name="trash" className="w-3.5 h-3.5" />
                                    Elimina
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </>
        )}

        {activeTab === "operations" && (
          <>
          <div className="bg-paper dark:bg-[#131316] rounded-lg border border-line dark:border-[#2a2a2e] p-6 mb-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-5">
              <div>
                <h2 className="font-display font-bold tracking-tight text-ink dark:text-[#f4f4f7] mb-1" style={{ fontSize: "17px" }}>
                  Orari azienda
                </h2>
                <p className="font-body text-[13px] text-muted dark:text-[#9999a0]">
                  Orari usati per calcolo carico e disponibilita.
                </p>
              </div>
              {canEditSettings && (
                <Button
                  variant="primary"
                  onClick={handleSaveCompanyTimes}
                  loading={companyTimeSaving}
                  disabled={companyTimeLoading}
                >
                  Salva
                </Button>
              )}
            </div>

            {companyTimeError && (
              <div className="mb-4 rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
                {companyTimeError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Orario apertura"
                type="time"
                value={openingTime}
                onChange={(e) => {
                  setOpeningTime(e.target.value);
                  setCompanyTimeError(null);
                }}
                disabled={!canEditSettings || companyTimeLoading}
              />
              <Input
                label="Orario chiusura"
                type="time"
                value={closingTime}
                onChange={(e) => {
                  setClosingTime(e.target.value);
                  setCompanyTimeError(null);
                }}
                disabled={!canEditSettings || companyTimeLoading}
              />
            </div>

            <p className="mt-3 text-xs text-muted dark:text-[#9999a0]">
              Inserisci entrambi gli orari oppure lasciali vuoti.
            </p>
          </div>

          {canEditSettings && (
            <div className="bg-paper dark:bg-[#131316] rounded-lg border border-line dark:border-[#2a2a2e] p-6">
              <div className="mb-4">
                <h2 className="font-display font-bold tracking-tight text-ink dark:text-[#f4f4f7] mb-1" style={{ fontSize: "17px" }}>
                  Stile card pacchetti social
                </h2>
                <p className="font-body text-[13px] text-muted dark:text-[#9999a0]">
                  Aspetto delle card nella pagina di presentazione dei pacchetti social.
                </p>
              </div>
              <div className="max-w-xs">
                <SearchableSelect
                  value={cardStyle}
                  onChange={(value) => { if (value) void handleCardStyleChange(value as SocialPackageCardStyle); }}
                  options={(cardStyleOptions.length > 0
                    ? cardStyleOptions
                    : [{ id: "sober", label: "Sobrio" }, { id: "tech", label: "Digital / Tech" }, { id: "rail", label: "Progressione" }] as CardStyleOption[]
                  ).map((s) => ({ value: s.id, label: s.label }))}
                  placeholder="Stile card"
                  disabled={cardStyleSaving}
                />
              </div>
            </div>
          )}

          <div className="bg-paper dark:bg-[#131316] rounded-lg border border-line dark:border-[#2a2a2e] p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-5">
              <div>
                <h2 className="font-display font-bold tracking-tight text-ink dark:text-[#f4f4f7] mb-1" style={{ fontSize: "17px" }}>
                  Regole operative
                </h2>
                <p className="font-body text-[13px] text-muted dark:text-[#9999a0]">
                  Pause, festivi/chiusure e remoto con regole ricorrenti o su date specifiche.
                </p>
              </div>
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                {canEditSettings && (
                  <Button
                    variant="ghost"
                    iconOnly
                    loading={holidaySyncing}
                    onClick={() => void handleSyncItalianHolidays()}
                    disabled={holidaySyncing}
                    title={holidaySyncing ? "Sincronizzazione..." : "Sincronizza festività italiane"}
                    aria-label="Sincronizza festività italiane"
                    leftIcon={<Icon name="refresh-cw" className="w-4 h-4" />}
                  />
                )}
                <div className="w-full sm:w-[220px]">
                  <SearchableSelect
                    value={scheduleKindFilter}
                    onChange={(next) => setScheduleKindFilter(next as "all" | CompanyScheduleWindowKind)}
                    options={SCHEDULE_KIND_FILTER_OPTIONS}
                    placeholder="Filtra tipo"
                    searchPlaceholder="Cerca tipo..."
                  />
                </div>
                {canEditSettings && (
                  <Button variant="primary" onClick={openNewScheduleWindow} leftIcon={<Icon name="plus" className="w-3.5 h-3.5" />}>
                    Nuova regola
                  </Button>
                )}
              </div>
            </div>

            {scheduleError && (
              <div className="mb-4 rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
                {scheduleError}
              </div>
            )}

            {scheduleLoading ? (
              <div className="flex items-center justify-center py-10"><Spinner size="md" /></div>
            ) : filteredScheduleWindows.length === 0 ? (
              <div className="rounded-md border border-dashed border-line dark:border-[#2a2a2e] px-4 py-8 text-sm text-muted dark:text-[#9999a0]">
                Nessuna regola operativa configurata.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {filteredScheduleWindows.map((window) => (
                  <div key={window.id} className="rounded-md border border-line dark:border-[#2a2a2e] bg-cream dark:bg-[#1c1c20] px-4 py-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="default">{scheduleKindLabels.get(window.kind) ?? window.kind}</Badge>
                          {window.color && <span className="inline-block w-3 h-3 rounded-full border border-line dark:border-[#2a2a2e]" style={{ backgroundColor: window.color }} />}
                          <span className="text-sm font-semibold text-ink dark:text-[#f4f4f7] truncate">
                            {window.emoji ? `${window.emoji} ` : ""}{window.title}
                          </span>
                          <Badge variant={window.is_active ? "success" : "default"}>{window.is_active ? "Attiva" : "Disattiva"}</Badge>
                        </div>
                        {window.description && <p className="mt-1 text-[13px] text-muted dark:text-[#9999a0]">{window.description}</p>}
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted dark:text-[#9999a0]">
                          <span>Orario: {window.is_all_day ? "All day" : (window.start_time && window.end_time ? `${window.start_time} - ${window.end_time}` : "—")}</span>
                          <span>Date: {window.start_date || window.end_date ? `${window.start_date ?? "—"} → ${window.end_date ?? "—"}` : "—"}</span>
                          <span>Giorni: {formatWeekdays(window.weekdays)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-2 rounded-md border border-line dark:border-[#2a2a2e] px-2.5 py-1.5">
                          <Checkbox checked={window.is_active} onChange={() => void handleToggleScheduleActive(window)} disabled={!canEditSettings} />
                          <span className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">Attiva</span>
                        </label>
                        {canEditSettings && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditScheduleWindow(window)}
                              className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink transition-colors hover:bg-paper dark:border-[#2a2a2e] dark:text-[#f4f4f7] dark:hover:bg-[#131316]"
                            >
                              <Icon name="pencil" className="w-3.5 h-3.5" />
                              Modifica
                            </button>
                            <button
                              type="button"
                              onClick={() => setScheduleDeleteTarget(window)}
                              className="inline-flex items-center gap-1.5 rounded-md border border-danger/20 bg-danger/5 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-danger transition-colors hover:bg-danger/10"
                            >
                              <Icon name="trash" className="w-3.5 h-3.5" />
                              Elimina
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <WorkloadWeightsSection companyId={companyId} canEdit={canEditSettings} />

          </>
        )}

        {activeTab === "notifiche" && (
          <NotificheTab companyId={companyId} isAdmin={!!user?.is_admin} />
        )}

        {activeTab === "llm" && (
          <LlmSettingsTab companyId={companyId} isAdmin={!!user?.is_admin} />
        )}

        {activeTab === "areas" && (
          <WorkAreasTab companyId={companyId} isAdmin={!!user?.is_admin} />
        )}

        {activeTab === "roles" && (
          <RolesTab companyId={companyId} canManageRoles={canManageRoles} />
        )}

        {activeTab === "tags" && (
          <WorkTagsTab companyId={companyId} isAdmin={!!user?.is_admin} />
        )}

        <CompanySettingModal
          open={settingModalOpen}
          onClose={() => setSettingModalOpen(false)}
          onSubmit={handleSaveSetting}
          saving={settingSaving}
          revealSecretValues={showSecretValues}
          initial={settingInitial}
          isEdit={settingEditingKey !== null}
        />

        <DeleteSettingModal
          open={!!settingToDelete}
          onClose={() => setSettingToDelete(null)}
          onConfirm={handleDeleteSetting}
          deleting={settingDeleting}
          setting={settingToDelete}
        />

        <ScheduleWindowModal
          open={scheduleModalOpen}
          isEdit={!!scheduleEditing}
          saving={scheduleModalSaving}
          initial={scheduleModalInitial}
          onClose={() => {
            if (scheduleModalSaving) return;
            setScheduleModalOpen(false);
            setScheduleEditing(null);
          }}
          onSubmit={handleSaveScheduleWindow}
        />

        <Modal
          open={!!scheduleDeleteTarget}
          onClose={() => setScheduleDeleteTarget(null)}
          title="Elimina regola operativa"
          description="L'operazione rimuove definitivamente la regola selezionata."
          size="md"
          footer={
            <>
              <Button variant="ghost" onClick={() => setScheduleDeleteTarget(null)} disabled={scheduleDeleting}>Annulla</Button>
              <Button variant="danger" onClick={handleDeleteScheduleWindow} loading={scheduleDeleting}>Elimina</Button>
            </>
          }
        >
          <p className="text-sm text-muted dark:text-[#9999a0]">
            Vuoi eliminare <span className="font-semibold text-ink dark:text-[#f4f4f7]">{scheduleDeleteTarget?.title}</span>?
          </p>
        </Modal>
      </div>
    </div>
  );
}
