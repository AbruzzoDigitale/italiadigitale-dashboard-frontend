import { Badge } from "../ui/Badge";
import { Input } from "../ui/Input";
import { Checkbox } from "../ui/Checkbox";
import { SearchableSelect } from "../ui/SearchableSelect";
import { Textarea } from "../ui/Textarea";
import type { Company } from "../../api/companies";
import type { SocialPackageDraft } from "../../features/social-packages/draft";
import { slugify } from "../../features/social-packages/draft";

interface SocialPackageFormProps {
  form: SocialPackageDraft;
  companyOptions: Company[];
  onChange: (patch: Partial<SocialPackageDraft>) => void;
}

export function SocialPackageForm({ form, companyOptions, onChange }: SocialPackageFormProps) {
  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-2">
        <Badge variant={form.is_active ? "success" : "default"}>{form.is_active ? "Attivo" : "Disattivo"}</Badge>
        <span className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
          Dati generali
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted dark:text-[#9999a0]">Azienda</span>
          <SearchableSelect
            value={form.company_id != null ? String(form.company_id) : ""}
            onChange={(value) => onChange({ company_id: value ? Number(value) : null })}
            options={[
              { value: "", label: "Seleziona azienda" },
              ...companyOptions.map((company) => ({ value: String(company.id), label: company.name })),
            ]}
            placeholder="Seleziona azienda"
            searchPlaceholder="Cerca azienda…"
          />
        </label>

        <Input
          label="Area"
          value={form.area}
          onChange={(e) => onChange({ area: e.target.value })}
          placeholder="social, campagne, branding..."
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="Nome pacchetto"
          value={form.title}
          onChange={(e) => onChange({ title: e.target.value, slug: form.slug || slugify(e.target.value) })}
          placeholder="Pacchetto Social Basic"
        />
        <Input
          label="Slug"
          value={form.slug}
          onChange={(e) => onChange({ slug: slugify(e.target.value) })}
          placeholder="pacchetto-social-basic"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="Badge prezzo"
          value={form.price_badge}
          onChange={(e) => onChange({ price_badge: e.target.value })}
          placeholder="Il piu scelto"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Input
          label="Prezzo base"
          type="number"
          value={form.base_price}
          onChange={(e) => onChange({ base_price: e.target.value })}
          placeholder="0"
        />
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted dark:text-[#9999a0]">Periodo</span>
          <SearchableSelect
            value={form.billing_period}
            onChange={(value) => onChange({ billing_period: value as SocialPackageDraft["billing_period"] })}
            options={[
              { value: "", label: "Nessuno" },
              { value: "oneoff", label: "Una tantum" },
              { value: "monthly", label: "Mensile" },
              { value: "yearly", label: "Annuale" },
            ]}
            placeholder="Nessuno"
            searchPlaceholder="Cerca periodo…"
          />
        </label>
        <Input
          label="Durata predefinita (mesi)"
          type="number"
          value={form.default_duration_months}
          onChange={(e) => onChange({ default_duration_months: e.target.value })}
          placeholder="12"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Input
          label="Sconto %"
          type="number"
          value={form.discount_pct}
          onChange={(e) => onChange({ discount_pct: e.target.value })}
        />
        <Input
          label="Valuta"
          value={form.currency}
          onChange={(e) => onChange({ currency: e.target.value.toUpperCase().slice(0, 3) })}
          placeholder="EUR"
        />
        <Input
          label="Ordine"
          type="number"
          value={form.sort_order}
          onChange={(e) => onChange({ sort_order: e.target.value })}
        />
      </div>

      <div className="grid gap-1.5">
        <label className="text-[11px] font-bold uppercase tracking-wider text-muted dark:text-[#9999a0]">Descrizione</label>
        <Textarea
          rows={4}
          value={form.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Descrizione del pacchetto sociale..."
          className="w-full px-3.5 py-2.5 rounded-md text-[13px] font-body text-ink dark:text-[#f4f4f7] placeholder:text-muted/60 dark:placeholder:text-[#9999a0]/60 border border-line dark:border-[#2a2a2e] bg-paper dark:bg-[#1c1c20] outline-none transition-colors focus:border-ink dark:focus:border-[#f4f4f7] resize-none"
        />
      </div>

      <label className="flex items-center gap-3 rounded-lg border border-line dark:border-[#2a2a2e] px-4 py-3 bg-cream/40 dark:bg-[#1c1c20]">
        <Checkbox
          checked={form.is_active}
          onChange={(v) => onChange({ is_active: v })}
        />
        <span className="text-sm font-body text-ink dark:text-[#f4f4f7]">Pacchetto attivo</span>
      </label>
    </div>
  );
}
