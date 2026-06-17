import { Icon, type IconName } from "./Icon";

export interface ViewModeToggleOption<T extends string> {
  value: T;
  icon: IconName;
  title: string;
}

interface ViewModeToggleProps<T extends string> {
  value: T;
  onChange: (next: T) => void;
  options: Array<ViewModeToggleOption<T>>;
  className?: string;
}

export function ViewModeToggle<T extends string>({ value, onChange, options, className = "" }: ViewModeToggleProps<T>) {
  return (
    <div
      className={`inline-flex items-center rounded-md border border-line dark:border-line-dark p-0.5 bg-paper dark:bg-[#1c1c20] ${className}`}
      role="group"
      aria-label="Cambia visualizzazione"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            title={option.title}
            aria-label={option.title}
            aria-pressed={active}
            className={`h-8 w-8 inline-flex items-center justify-center rounded transition-colors ${
              active
                ? "bg-ink text-paper dark:bg-paper dark:text-ink"
                : "text-muted dark:text-muted-dark hover:text-ink dark:hover:text-paper"
            }`}
          >
            <Icon name={option.icon} className="w-4 h-4" />
          </button>
        );
      })}
    </div>
  );
}
