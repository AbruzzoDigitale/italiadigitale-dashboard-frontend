import { useMemo } from "react";
import {
  canCreateQuote as canCreateQuoteFromReadiness,
  evaluateSubmitReadiness,
  getCategoryCompositionState,
  getCategoryRequirementState,
  isCategoryActive,
  normalizeViolationMessage,
} from "../features/configurator/helpers";
import type {
  CategoryRequirementState,
  CompositionItem,
  CompositionWarningState,
  ValidationState,
} from "../features/configurator/types";
import type { useConfiguratorRules } from "./useConfiguratorRules";

type Rules = ReturnType<typeof useConfiguratorRules>;

/**
 * Derives all UI validation state from catalog rules + current composition.
 * Covers:
 *  - category required status
 *  - composition warnings (has_composition_issues / missing_required_children)
 *  - product dependency violations
 *  - canCreateQuote boolean + blockReasons list
 */
export function useConfiguratorValidation(
  rules: Rules,
  composition: CompositionItem[],
  selectedServiceIds: number[]
): ValidationState {
  return useMemo(() => {
    const activeAreaIds = new Set<string>();
    composition.forEach((item) => {
      const entry = rules.flatCatalog.productByBoxId.get(item.boxId);
      if (entry) activeAreaIds.add(entry.area.id);
    });

    // ── Category requirement states ─────────────────────────────────────
    const categoryRequirements = new Map<number, CategoryRequirementState>();
    rules.flatCatalog.areas.forEach((area) => {
      const areaActive = activeAreaIds.has(area.id) || isCategoryActive(area, selectedServiceIds);
      area.sections.forEach((section) => {
        const rawState = getCategoryRequirementState(section, section.boxes, selectedServiceIds);
        const state: CategoryRequirementState = areaActive
          ? rawState
          : {
              required: false,
              satisfied: true,
              showBadge: false,
              hint: rawState.hint,
            };
        categoryRequirements.set(section.categoryId, state);
      });
    });

    // ── Composition warnings (missing required children) ────────────────
    const compositionWarnings: CompositionWarningState[] = [];

    rules.flatCatalog.areas.forEach((area) => {
      const areaActive = activeAreaIds.has(area.id) || isCategoryActive(area, selectedServiceIds);
      if (!areaActive) return;

      // Area-level (macrocategoria) warning
      const areaState = getCategoryCompositionState(area, selectedServiceIds);
      if (areaState.hasCompositionIssues) {
        compositionWarnings.push({
          sectionId: area.id,
          sectionName: area.name,
          missing: areaState.missingRequiredChildren,
          message: areaState.message ?? "Composizione incompleta",
        });
      }

      // Section-level warning
      area.sections.forEach((section) => {
        if (section.hasCompositionIssues) {
          const missing = section.missingRequiredChildren ?? [];
          compositionWarnings.push({
            sectionId: section.id,
            sectionName: section.name,
            missing,
            message:
              section.compositionWarning ??
              (missing.length > 0
                ? `Composizione incompleta\nManca: ${missing.join(", ")}`
                : "Composizione incompleta"),
          });
        }
      });
    });

    // ── Product dependency violations ───────────────────────────────────
    const productViolations = new Map<string, string[]>();
    composition.forEach((item) => {
      const entry = rules.flatCatalog.productByBoxId.get(item.boxId);
      if (!entry) return;
      const messages = (entry.box.dependencyViolations ?? []).map(normalizeViolationMessage);
      if (messages.length > 0) {
        productViolations.set(item.boxId, messages);
      }
    });

    // ── Submit readiness ────────────────────────────────────────────────
    const readiness = evaluateSubmitReadiness(
      composition,
      rules.flatCatalog,
      selectedServiceIds
    );

    return {
      categoryRequirements,
      compositionWarnings,
      productViolations,
      canCreateQuote: canCreateQuoteFromReadiness(readiness),
      blockReasons: readiness.reasons,
    };
  }, [rules.flatCatalog, composition, selectedServiceIds]);
}
