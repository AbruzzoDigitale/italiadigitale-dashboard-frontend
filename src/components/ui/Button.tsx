import React, { forwardRef } from "react";
import { Spinner } from "./Spinner";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "danger-ghost";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const base =
  "inline-flex items-center justify-center gap-2 font-body font-bold rounded-pill uppercase tracking-wide transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-magenta focus-visible:ring-offset-2 disabled:opacity-40 disabled:pointer-events-none select-none";

const variantMap: Record<Variant, string> = {
  primary:
    "bg-brand-magenta text-white border border-brand-magenta hover:bg-[#a30f6e] hover:border-[#a30f6e] active:scale-[0.98] !rounded-[8px] !normal-case !tracking-normal dark:bg-brand-magenta dark:text-white dark:border-brand-magenta dark:hover:bg-[#a30f6e]",
  secondary:
    "bg-paper text-ink border border-ink hover:bg-cream dark:bg-ink-2 dark:text-paper dark:border-line-dark",
  ghost:
    "bg-transparent text-ink border border-transparent hover:bg-cream dark:text-paper dark:hover:bg-ink-2",
  danger:
    "bg-danger text-white border border-danger hover:bg-red-700 active:scale-95",
  "danger-ghost":
    "text-danger border border-transparent hover:bg-danger/10",
};

const sizeMap: Record<Size, string> = {
  sm: "px-3 py-[7px] text-[11px]",
  md: "px-[18px] py-[11px] text-[13px]",
  lg: "px-[26px] py-[14px] text-[15px]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      leftIcon,
      rightIcon,
      children,
      disabled,
      className = "",
      ...rest
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`${base} ${variantMap[variant]} ${sizeMap[size]} ${className}`}
        {...rest}
      >
        {loading ? (
          <Spinner size="sm" />
        ) : (
          leftIcon && <span className="leading-none">{leftIcon}</span>
        )}
        {children}
        {!loading && rightIcon && (
          <span className="leading-none">{rightIcon}</span>
        )}
      </button>
    );
  }
);

Button.displayName = "Button";
