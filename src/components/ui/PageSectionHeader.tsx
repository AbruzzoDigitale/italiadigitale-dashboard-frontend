import type { ReactNode } from "react";

interface PageSectionHeaderProps {
  eyebrow: string;
  eyebrowIcon?: ReactNode;
  title: string;
  lead?: string;
  actions?: ReactNode;
  className?: string;
}

export function PageSectionHeader({
  eyebrow,
  eyebrowIcon,
  title,
  lead,
  actions,
  className = "",
}: PageSectionHeaderProps) {
  return (
    <div className={`mb-5 flex items-start justify-between gap-4 ${className}`}>
      <div>
        <div className="section-eyebrow">
          {eyebrowIcon}
          {eyebrow}
        </div>
        <h1 className="section-title">{title}</h1>
        {lead && <p className="section-lead">{lead}</p>}
      </div>

      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
