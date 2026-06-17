import type { ReactNode } from "react";
import type { CategoryRequirementState, ConfigSection } from "../../features/configurator/types";
import { FadePresence } from "../ui/FadePresence";

interface CategorySectionProps {
  section: ConfigSection;
  requirementState: CategoryRequirementState;
  icon: ReactNode;
  children: ReactNode;
  /** Optional composition warning for this section (from useConfiguratorValidation) */
  compositionWarning?: string | null;
}

export function CategorySection({ section, requirementState, icon, children, compositionWarning }: CategorySectionProps) {
  const isRequired = requirementState.required;
  const isUnsatisfied = isRequired && !requirementState.satisfied;
  const isSatisfied = isRequired && requirementState.satisfied;
  const hasCompositionIssue = section.hasCompositionIssues || !!compositionWarning;

  const sectionClass = [
    "cfg-section",
    isUnsatisfied ? "cfg-section--required cfg-section--required-glow" : "",
    isRequired && requirementState.satisfied ? "cfg-section--required-ok" : "",
  ].filter(Boolean).join(" ");

  // Build composition warning text
  const warningText = compositionWarning
    ?? (section.hasCompositionIssues
      ? (section.compositionWarning
        ?? ((section.missingRequiredChildren ?? []).length > 0
          ? `Composizione incompleta\nManca: ${section.missingRequiredChildren!.join(", ")}`
          : "Composizione incompleta"))
      : null);

  return (
    <div className={sectionClass}>
      <div className="cfg-section__header">
        <div className="cfg-section__icon" aria-hidden>
          {icon}
        </div>
        <div className="cfg-section__name">{section.name}</div>
        {isUnsatisfied && requirementState.showBadge && (
          <div className="cfg-section__badge">Richiesto</div>
        )}
        {isSatisfied && (
          <div className="cfg-section__badge cfg-section__badge--ok">Completa</div>
        )}
      </div>

      <FadePresence show={isUnsatisfied && !!requirementState.hint} className="ui-presence--block">
        <div className="cfg-section__hint">{requirementState.hint}</div>
      </FadePresence>

      <FadePresence show={hasCompositionIssue && !!warningText} className="ui-presence--block">
        <div className="cfg-section__composition-warning">
          {(warningText ?? "").split("\n").map((line, i) => (
            <div key={i} className={i === 0 ? "cfg-section__composition-warning__title" : "cfg-section__composition-warning__detail"}>
              {line}
            </div>
          ))}
        </div>
      </FadePresence>

      {children}
    </div>
  );
}

