import { Input } from "../ui/Input";
import { SearchableSelect } from "../ui/SearchableSelect";

export interface BillingFilterState {
  q: string;
  clientId: string;
  month: string;
  kind: "all" | "canone" | "una_tantum";
  status: "all" | "da_fatturare" | "fatturato";
}

export interface BillingFilterOption {
  value: string;
  label: string;
}

interface BillingFiltersProps {
  filters: BillingFilterState;
  onChange: (next: BillingFilterState) => void;
  clientOptions: BillingFilterOption[];
  monthOptions: BillingFilterOption[];
}

export function BillingFilters({ filters, onChange, clientOptions, monthOptions }: BillingFiltersProps) {
  const set = <K extends keyof BillingFilterState>(key: K, value: BillingFilterState[K]) =>
    onChange({ ...filters, [key]: value });

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
      <Input
        placeholder="Cerca voce o cliente…"
        value={filters.q}
        onChange={(event) => set("q", event.target.value)}
      />

      <SearchableSelect
        value={filters.clientId}
        onChange={(value) => set("clientId", value)}
        options={[{ value: "", label: "Tutti i clienti" }, ...clientOptions]}
        placeholder="Filtra cliente"
        searchPlaceholder="Cerca cliente…"
      />

      <SearchableSelect
        value={filters.month}
        onChange={(value) => set("month", value)}
        options={[{ value: "", label: "Tutti i mesi" }, ...monthOptions]}
        placeholder="Filtra mese"
        searchPlaceholder="Cerca mese…"
      />

      <SearchableSelect
        value={filters.kind}
        onChange={(value) => set("kind", value as BillingFilterState["kind"])}
        options={[
          { value: "all", label: "Tutti i tipi" },
          { value: "canone", label: "Canone" },
          { value: "una_tantum", label: "Una tantum" },
        ]}
        placeholder="Filtra tipo"
      />

      <SearchableSelect
        value={filters.status}
        onChange={(value) => set("status", value as BillingFilterState["status"])}
        options={[
          { value: "all", label: "Tutti gli stati" },
          { value: "da_fatturare", label: "Da fatturare" },
          { value: "fatturato", label: "Fatturato" },
        ]}
        placeholder="Filtra stato"
      />
    </div>
  );
}
