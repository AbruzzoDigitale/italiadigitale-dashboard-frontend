import type { SwapOption } from "../../features/configurator/types";
import { SearchableSelect } from "../ui/SearchableSelect";

interface BundleIncludeRow {
  id: string;
  label: string;
  price: number | null;
  note?: string;
  group?: string;
}

interface BundleCardProps {
  boxId: string;
  includes: BundleIncludeRow[];
  swapOptionsByGroup: Record<string, SwapOption[]>;
  selectedByGroup: Record<string, string>;
  showPrice?: boolean;
  onSwap: (includeId: string, optionId: string) => void;
}

export function BundleCard({ boxId, includes, swapOptionsByGroup, selectedByGroup, showPrice = true, onSwap }: BundleCardProps) {
  return (
    <div className="cfg-item__includes">
      {includes.map((includeItem) => {
        const swapOptions = includeItem.group ? swapOptionsByGroup[includeItem.group] ?? [] : [];
        const selectedValue = includeItem.group ? (selectedByGroup[includeItem.group] ?? includeItem.id) : includeItem.id;

        return (
          <div className="cfg-include" key={`${boxId}-${includeItem.id}`}>
            <div>
              {includeItem.label}
              {includeItem.note ? ` (${includeItem.note})` : ""}
              {includeItem.group && swapOptions.length > 1 && (
                <SearchableSelect
                  className="mt-1 max-w-[260px]"
                  value={selectedValue}
                  onChange={(value) => onSwap(includeItem.id, value)}
                  options={swapOptions.map((option) => ({
                    value: option.id,
                    label: showPrice
                      ? `${option.label}${typeof option.price === "number" ? ` (€${option.price})` : ""}`
                      : option.label,
                  }))}
                  placeholder="Seleziona opzione"
                  searchPlaceholder="Cerca opzione…"
                  triggerClassName="py-1.5 text-[12px]"
                />
              )}
            </div>
            {showPrice && (
              <div className="cfg-include__price">
                {typeof includeItem.price === "number" ? `€${includeItem.price}` : "-"}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
