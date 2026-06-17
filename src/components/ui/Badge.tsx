import React from "react";

type BadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "admin"
  | "user";

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const variantMap: Record<BadgeVariant, string> = {
  default:
    "bg-line text-ink dark:bg-line-dark dark:text-paper",
  success:
    "bg-success/10 text-success border border-success/20",
  warning:
    "bg-warning/10 text-warning border border-warning/20",
  danger:
    "bg-danger/10 text-danger border border-danger/20",
  info: "bg-info/10 text-info border border-info/20",
  admin:
    "bg-brand-purple text-white",
  user: "bg-line text-muted dark:bg-line-dark dark:text-muted-dark",
};

export function Badge({
  variant = "default",
  children,
  className = "",
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-pill text-[11px] font-semibold uppercase tracking-wider ${variantMap[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
