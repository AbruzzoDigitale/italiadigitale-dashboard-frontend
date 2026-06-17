import { useCallback, useEffect, useMemo, useState } from "react";
import type { CompositionItem, FlattenedCatalog } from "../features/configurator/types";

interface UseConfiguratorSelectionResult {
  composition: CompositionItem[];
  selectedServiceIds: number[];
  selectedBundles: CompositionItem[];
  bundleGroupSelections: Record<string, Record<string, string>>;
  canSelectBox: (boxId: string) => boolean;
  addBox: (boxId: string) => void;
  removeBox: (boxId: string) => void;
  changeInstances: (boxId: string, delta: number) => void;
  applySwap: (boxId: string, includeId: string, optionId: string) => void;
  resetComposition: () => void;
}

export function useConfiguratorSelection(catalog: FlattenedCatalog): UseConfiguratorSelectionResult {
  const [composition, setComposition] = useState<CompositionItem[]>([]);

  useEffect(() => {
    setComposition((prev) => {
      let changed = false;
      const next: CompositionItem[] = [];

      prev.forEach((item) => {
        const found = catalog.productByBoxId.get(item.boxId);
        if (!found) {
          changed = true;
          return;
        }
        if (item.serviceId !== found.box.serviceId) {
          changed = true;
          next.push({ ...item, serviceId: found.box.serviceId });
          return;
        }
        next.push(item);
      });

      return changed ? next : prev;
    });
  }, [catalog.productByBoxId]);

  const selectedServiceIds = useMemo(
    () => Array.from(new Set(composition
      .map((item) => item.serviceId)
      .filter((serviceId): serviceId is number => typeof serviceId === "number" && Number.isFinite(serviceId))
    )).sort((a, b) => a - b),
    [composition]
  );

  const canSelectBox = useCallback((boxId: string) => {
    const found = catalog.productByBoxId.get(boxId);
    if (!found) return false;
    if (found.box.canSelect === false) return false;
    if (found.box.requiresAnyBox && found.box.requiresAnyBox.length > 0) {
      return composition.some((entry) => found.box.requiresAnyBox?.includes(entry.boxId));
    }
    return true;
  }, [catalog.productByBoxId, composition]);

  const addBox = useCallback((boxId: string) => {
    const found = catalog.productByBoxId.get(boxId);
    if (!found || !canSelectBox(boxId)) return;

    setComposition((prev) => {
      const next = [...prev];
      if (found.box.exclusiveGroup) {
        const filtered = next.filter((item) => {
          const entry = catalog.productByBoxId.get(item.boxId);
          return entry?.box.exclusiveGroup !== found.box.exclusiveGroup;
        });
        filtered.push({ boxId, serviceId: found.box.serviceId, instances: 1, swaps: {} });
        return filtered;
      }

      const existingIndex = next.findIndex((item) => item.boxId === boxId);
      if (existingIndex >= 0) {
        next[existingIndex] = { ...next[existingIndex], instances: next[existingIndex].instances + 1 };
        return next;
      }

      next.push({ boxId, serviceId: found.box.serviceId, instances: 1, swaps: {} });
      return next;
    });
  }, [canSelectBox, catalog.productByBoxId]);

  const removeBox = useCallback((boxId: string) => {
    setComposition((prev) => prev.filter((item) => item.boxId !== boxId));
  }, []);

  const changeInstances = useCallback((boxId: string, delta: number) => {
    setComposition((prev) => prev.map((item) => (
      item.boxId === boxId
        ? { ...item, instances: Math.max(1, item.instances + delta) }
        : item
    )));
  }, []);

  const applySwap = useCallback((boxId: string, includeId: string, optionId: string) => {
    setComposition((prev) => prev.map((item) => (
      item.boxId === boxId
        ? { ...item, swaps: { ...item.swaps, [includeId]: optionId } }
        : item
    )));
  }, []);

  const resetComposition = useCallback(() => {
    setComposition([]);
  }, []);

  const selectedBundles = useMemo(
    () => composition.filter((item) => catalog.productByBoxId.get(item.boxId)?.box.isBundle),
    [catalog.productByBoxId, composition]
  );

  const bundleGroupSelections = useMemo(() => {
    const entries = selectedBundles.map((item) => {
      const found = catalog.productByBoxId.get(item.boxId);
      const groups: Record<string, string> = {};
      found?.box.includes?.forEach((includeItem) => {
        if (!includeItem.group) return;
        groups[includeItem.group] = item.swaps[includeItem.id] ?? includeItem.id;
      });
      return [item.boxId, groups] as const;
    });
    return Object.fromEntries(entries);
  }, [catalog.productByBoxId, selectedBundles]);

  return {
    composition,
    selectedServiceIds,
    selectedBundles,
    bundleGroupSelections,
    canSelectBox,
    addBox,
    removeBox,
    changeInstances,
    applySwap,
    resetComposition,
  };
}
