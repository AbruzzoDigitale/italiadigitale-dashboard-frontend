import React from "react";
import { Icon } from "./Icon";

export interface AccordionItem<T = any> {
  id: string | number;
  data: T;
}

export interface AccordionProps<T = any> {
  items: AccordionItem<T>[];
  isOpen: Record<string | number, boolean>;
  onToggle: (id: string | number) => void;
  renderHeader: (item: T, isOpen: boolean, onToggle: () => void) => React.ReactNode;
  renderContent: (item: T) => React.ReactNode;
  className?: string;
  itemClassName?: string;
  headerClassName?: string;
  contentClassName?: string;
  chevronClassName?: string;
}

export function Accordion<T = any>({
  items,
  isOpen,
  onToggle,
  renderHeader,
  renderContent,
  className = "",
  itemClassName = "rounded-lg border border-line dark:border-line-dark bg-paper dark:bg-ink-soft overflow-hidden",
  headerClassName = "px-4 py-3 hover:bg-cream dark:hover:bg-ink-2 transition-colors",
  contentClassName = "border-t border-line dark:border-line-dark px-4 py-3 bg-cream dark:bg-ink-2",
  chevronClassName = "w-4 h-4 transition-transform flex-shrink-0",
}: AccordionProps<T>) {
  const containerClassName = className.trim() ? className : "space-y-3";

  return (
    <div className={containerClassName}>
      {items.map((item) => {
        const open = !!isOpen[item.id];
        return (
          <div key={item.id} className={itemClassName}>
            <button
              type="button"
              onClick={() => onToggle(item.id)}
              className={`w-full text-left ${headerClassName}`}
            >
              {renderHeader(item.data, open, () => onToggle(item.id))}
              <Icon
                name="chevron-down"
                className={`${chevronClassName} ${open ? "rotate-180" : ""}`}
              />
            </button>

            {open && (
              <div className={contentClassName}>
                {renderContent(item.data)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
