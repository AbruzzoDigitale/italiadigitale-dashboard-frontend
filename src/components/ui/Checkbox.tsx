interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export function Checkbox({ checked, onChange, disabled = false, className = "" }: CheckboxProps) {
  return (
    <span className={`relative inline-flex h-4 w-4 flex-shrink-0 ${className}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="absolute inset-0 h-full w-full opacity-0"
        style={{ cursor: disabled ? "not-allowed" : "pointer" }}
      />
      <span
        className={[
          "pointer-events-none flex h-4 w-4 items-center justify-center rounded-[4px] border transition-colors",
          checked
            ? "border-ink bg-ink dark:border-[#f4f4f7] dark:bg-[#f4f4f7]"
            : "border-line bg-paper dark:border-[#3a3a3e] dark:bg-[#131316]",
          disabled ? "opacity-40" : "",
        ].join(" ")}
      >
        {checked && (
          <svg
            viewBox="0 0 10 8"
            fill="none"
            className="h-2.5 w-2.5 text-paper dark:text-[#131316]"
            aria-hidden="true"
          >
            <path
              d="M1 4l2.5 2.5L9 1"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
    </span>
  );
}
