import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import type { SocialPackageCatalogItem } from "../../api/socialPackages";
import { formatCurrency } from "../../features/social-packages/draft";

export interface SocialPackageCatalogOption {
  id: number;
  label: string;
  category?: string | null;
  area?: string | null;
}

interface SocialPackageCatalogItemsEditorProps {
  packageId: number | null;
  items: SocialPackageCatalogItem[];
  serviceOptions: SocialPackageCatalogOption[];
  onCreateItem: () => void;
  onEditItem: (item: SocialPackageCatalogItem) => void;
  onDeleteItem: (item: SocialPackageCatalogItem) => void;
}

export function SocialPackageCatalogItemsEditor({
  packageId,
  items,
  serviceOptions,
  onCreateItem,
  onEditItem,
  onDeleteItem,
}: SocialPackageCatalogItemsEditorProps) {
  const serviceLabelById = new Map(serviceOptions.map((option) => [option.id, option.label]));

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-bold tracking-tight text-ink dark:text-paper">Righe catalogo collegate</h3>
          <p className="text-sm text-muted dark:text-[#9999a0]">
            Collegamenti diretti ai servizi del catalogo e alle regole di preventivazione.
          </p>
        </div>
        <Button variant="secondary" leftIcon={<Icon name="plus" className="w-4 h-4" />} onClick={onCreateItem} disabled={!packageId}>
          Riga
        </Button>
      </div>

      {!packageId ? (
        <div className="rounded-xl border border-dashed border-line dark:border-[#2a2a2e] bg-cream/30 dark:bg-[#1c1c20] px-4 py-6 text-sm text-muted dark:text-[#9999a0]">
          Salva prima il pacchetto per aggiungere righe collegate al catalogo.
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line dark:border-[#2a2a2e] bg-cream/30 dark:bg-[#1c1c20] px-4 py-6 text-sm text-muted dark:text-[#9999a0]">
          Nessuna riga catalogo definita.
        </div>
      ) : (
        <div className="grid gap-3">
          {items
            .slice()
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((item) => (
              <article key={item.id} className="rounded-xl border border-line dark:border-[#2a2a2e] bg-paper dark:bg-[#141419] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-display text-sm font-bold tracking-tight text-ink dark:text-paper">{item.title}</h4>
                      <Badge variant={item.is_active ? "success" : "default"}>{item.is_active ? "Attiva" : "Disattiva"}</Badge>
                      {item.is_included && <Badge variant="warning">Inclusa</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-muted dark:text-[#9999a0]">
                      {item.description || serviceLabelById.get(item.service_id ?? -1) || "Riga catalogo"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted dark:text-[#9999a0]">
                      <span className="rounded-full border border-line dark:border-[#2a2a2e] px-2 py-1">
                        {item.service_name || serviceLabelById.get(item.service_id ?? -1) || "Servizio non collegato"}
                      </span>
                      <span className="rounded-full border border-line dark:border-[#2a2a2e] px-2 py-1">
                        {formatCurrency(item.unit_amount, "EUR")}
                      </span>
                      <span className="rounded-full border border-line dark:border-[#2a2a2e] px-2 py-1">
                        x{item.quantity}
                      </span>
                      <span className="rounded-full border border-line dark:border-[#2a2a2e] px-2 py-1">
                        {item.billing_period ?? "n/d"}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="ghost" size="sm" leftIcon={<Icon name="pencil" className="w-4 h-4" />} onClick={() => onEditItem(item)}>
                      Modifica
                    </Button>
                    <Button variant="ghost" size="sm" leftIcon={<Icon name="trash" className="w-4 h-4" />} onClick={() => onDeleteItem(item)}>
                      Elimina
                    </Button>
                  </div>
                </div>
              </article>
            ))}
        </div>
      )}
    </div>
  );
}
