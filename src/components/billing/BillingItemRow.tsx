import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { formatEur } from "../../api/quotes";
import type { BillingItem, BillingStatus } from "../../utils/billing";

interface BillingItemRowProps {
  item: BillingItem;
  onSetStatus: (key: string, status: BillingStatus, ficPlaceholder?: boolean) => void;
}

export function BillingItemRow({ item, onSetStatus }: BillingItemRowProps) {
  const isBilled = item.status === "fatturato";

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-paper px-4 py-3 transition-colors hover:border-ink/30 dark:border-[#2a2a2e] dark:bg-[#16161a] md:flex-row md:items-center md:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-[14px] font-semibold text-ink dark:text-paper">
            {item.description}
          </span>
          <Badge variant={item.kind === "canone" ? "info" : "default"}>
            {item.kind === "canone" ? "Canone" : "Una tantum"}
          </Badge>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted dark:text-muted-dark">
          <span className="inline-flex items-center gap-1">
            <Icon name="document-text" className="h-3.5 w-3.5" />
            {item.contractTitle}
          </span>
          {item.monthLabel && (
            <span className="inline-flex items-center gap-1">
              <Icon name="calendar" className="h-3.5 w-3.5" />
              {item.monthLabel}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 md:justify-end">
        <div className="text-right">
          <div className="text-[15px] font-bold text-ink dark:text-paper">{formatEur(item.amount)}</div>
          <Badge variant={isBilled ? "success" : "warning"}>
            {isBilled ? "Fatturato" : "Da fatturare"}
          </Badge>
        </div>

        {isBilled ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSetStatus(item.key, "da_fatturare")}
            title="Annulla lo stato fatturato"
          >
            Annulla
          </Button>
        ) : (
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Icon name="credit-card" className="h-3.5 w-3.5" />}
            onClick={() => onSetStatus(item.key, "fatturato", true)}
            title="Placeholder: da collegare all'endpoint fattura FIC"
          >
            Genera fattura su FIC
          </Button>
        )}
      </div>
    </div>
  );
}
