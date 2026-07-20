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
    <div className={`seg-switch ${className}`} role="group" aria-label="Cambia visualizzazione">
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
            className={`seg-switch-icon ${active ? "is-active" : ""}`}
          >
            <Icon name={option.icon} className="w-4 h-4" />
          </button>
        );
      })}
    </div>
  );
}
