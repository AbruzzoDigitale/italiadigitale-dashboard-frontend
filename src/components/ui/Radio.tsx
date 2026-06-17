interface RadioProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  name?: string;
  disabled?: boolean;
  className?: string;
}

export function Radio({ checked, onChange, name, disabled = false, className = "" }: RadioProps) {
  return (
    <span className={`relative inline-flex h-4 w-4 flex-shrink-0 ${className}`}>
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
        className="absolute inset-0 h-full w-full opacity-0"
        style={{ cursor: disabled ? "not-allowed" : "pointer" }}
      />
      <span
        className={[
          "pointer-events-none flex h-4 w-4 items-center justify-center rounded-full border transition-colors",
          checked
            ? "border-ink bg-paper dark:border-[#f4f4f7] dark:bg-[#131316]"
            : "border-line bg-paper dark:border-[#3a3a3e] dark:bg-[#131316]",
          disabled ? "opacity-40" : "",
        ].join(" ")}
      >
        <span
          className={[
            "h-2 w-2 rounded-full transition-colors",
            checked ? "bg-ink dark:bg-[#f4f4f7]" : "bg-transparent",
          ].join(" ")}
        />
      </span>
    </span>
  );
}
