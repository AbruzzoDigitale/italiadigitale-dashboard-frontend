import { useMemo } from "react";
import type { CatalogTreeResponse } from "../api/catalog";
import {
  evaluateSubmitReadiness,
  flattenCatalogTree,
  getCategoryRequirementState,
  isCategoryActive,
  normalizeViolationMessage,
} from "../features/configurator/helpers";

export function useConfiguratorRules(
  tree: CatalogTreeResponse | null,
  selectedIds: number[]
) {
  return useMemo(() => {
    const flatCatalog = flattenCatalogTree(tree?.roots ?? []);
    const selectedComposition = selectedIds.flatMap((serviceId) => {
      const entry = flatCatalog.productByServiceId.get(serviceId);
      if (!entry) return [];
      return [{
        boxId: entry.box.id,
        serviceId,
        instances: 1,
        swaps: {},
      }];
    });
    const submitReadiness = evaluateSubmitReadiness(selectedComposition, flatCatalog, selectedIds);
    const requiredServiceIds = new Set<number>(submitReadiness.requiredServiceIds);
    const requiredCategoryIds = new Set<number>(submitReadiness.requiredCategoryIds);
    const messagesByBoxId = new Map<string, string[]>();
    const categoryRequirementById = new Map<number, ReturnType<typeof getCategoryRequirementState>>();

    selectedIds.forEach((serviceId) => {
      const entry = flatCatalog.productByServiceId.get(serviceId);
      if (!entry) return;
      const messages = (entry.box.dependencyViolations ?? []).map(normalizeViolationMessage);
      if (messages.length > 0) {
        messagesByBoxId.set(entry.box.id, messages);
      }
    });

    flatCatalog.areas.forEach((area) => {
      const areaActive = isCategoryActive(area, selectedIds);
      area.sections.forEach((section) => {
        const state = getCategoryRequirementState(section, section.boxes, selectedIds);
        categoryRequirementById.set(section.categoryId, state);
        if (areaActive && state.required && !state.satisfied) {
          requiredCategoryIds.add(section.categoryId);
        }
      });
    });

    return {
      treeRoots: tree?.roots ?? [],
      selectedIds,
      flatCatalog,
      categoryRequirementById,
      requiredServiceIds,
      requiredCategoryIds,
      messagesByBoxId,
      submitReadiness,
    };
  }, [selectedIds, tree]);
}
