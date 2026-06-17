import { useMemo, useState } from "react";
import { type Client } from "../../api/clients";
import { useAuth } from "../../hooks/useAuth";
import { Icon } from "../ui/Icon";
import { SearchableSelect } from "../ui/SearchableSelect";
import { ClientModal } from "./ClientModal";

type ClientSelectorWithCreateProps = {
  value: string;
  onChange: (value: string) => void;
  clients: Client[];
  companyId: number | null;
  clientsLoading?: boolean;
  disabled?: boolean;
  className?: string;
  menuLayer?: "local" | "portal";
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  includeEmptyOption?: boolean;
  emptyOptionLabel?: string;
  createButtonTitle?: string;
};

export function ClientSelectorWithCreate({
  value,
  onChange,
  clients,
  companyId,
  clientsLoading = false,
  disabled = false,
  className,
  menuLayer = "local",
  placeholder = "Seleziona cliente",
  searchPlaceholder = "Cerca cliente...",
  emptyMessage = "Nessun cliente",
  includeEmptyOption = false,
  emptyOptionLabel = "Nessun cliente",
  createButtonTitle = "Crea nuovo cliente",
}: ClientSelectorWithCreateProps) {
  const { user } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [localCreatedClients, setLocalCreatedClients] = useState<Client[]>([]);
  const isAdmin = !!user?.is_admin;

  const mergedClients = useMemo(() => {
    if (localCreatedClients.length === 0) return clients;
    const byId = new Map<number, Client>();
    clients.forEach((client) => byId.set(client.id, client));
    localCreatedClients.forEach((client) => byId.set(client.id, client));
    return Array.from(byId.values());
  }, [clients, localCreatedClients]);

  const baseOptions = useMemo(
    () => mergedClients.map((client) => ({
      value: String(client.id),
      label: client.commercial_name ?? client.name,
      keywords: `${client.commercial_name ?? ""} ${client.name} ${client.email ?? ""} ${client.city ?? ""} ${client.vat ?? ""}`,
    })),
    [mergedClients]
  );

  const options = useMemo(() => {
    if (clientsLoading && baseOptions.length === 0) {
      return [{ value: "", label: "Caricamento clienti...", disabled: true }];
    }
    if (includeEmptyOption) {
      return [{ value: "", label: emptyOptionLabel }, ...baseOptions];
    }
    return baseOptions;
  }, [baseOptions, clientsLoading, includeEmptyOption, emptyOptionLabel]);

  return (
    <>
      <div className={`flex gap-2 ${className ?? ""}`}>
        <SearchableSelect
          className="flex-1 min-w-0"
          value={value}
          onChange={onChange}
          options={options}
          placeholder={clientsLoading ? "Caricamento clienti..." : placeholder}
          searchPlaceholder={searchPlaceholder}
          emptyMessage={clientsLoading ? "Caricamento clienti..." : emptyMessage}
          disabled={disabled || clientsLoading}
          menuLayer={menuLayer}
        />
        <button
          type="button"
          title={createButtonTitle}
          onClick={() => setCreateOpen(true)}
          disabled={disabled || companyId == null}
          className="shrink-0 h-[42px] w-[42px] flex items-center justify-center rounded-md border border-line dark:border-[#2a2a2e] bg-paper dark:bg-ink-soft text-muted hover:text-ink dark:hover:text-[#f4f4f7] hover:border-ink dark:hover:border-[#f4f4f7] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Icon name="plus" className="w-4 h-4" />
        </button>
      </div>

      <ClientModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={(created) => {
          if (!created) return;
          setLocalCreatedClients((prev) => {
            const exists = prev.some((client) => client.id === created.id);
            if (exists) return prev;
            return [...prev, created];
          });
          onChange(String(created.id));
          setCreateOpen(false);
        }}
        companyId={companyId}
        isAdmin={isAdmin}
      />
    </>
  );
}
