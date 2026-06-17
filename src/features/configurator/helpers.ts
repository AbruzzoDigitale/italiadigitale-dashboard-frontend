import type {
  CatalogCategoryTreeNode,
  CatalogDependencyViolation,
  CatalogServicePrice,
  CatalogServiceTreeNode,
} from "../../api/catalog";
import type {
  BillingPeriod,
  BoxInclude,
  BundlePriceContext,
  BundlePriceResult,
  CategoryRequirementState,
  CompositionItem,
  ConfigArea,
  ConfigBox,
  ConfigSection,
  ConfiguratorSnapshotPayload,
  FlattenedBoxEntry,
  FlattenedCatalog,
  ProductBadgeState,
  SubmitReadiness,
  SwapOption,
} from "./types";

const ICON_NAMES = new Set([
  "home", "users", "settings", "logout", "moon", "sun", "menu", "x", "chevron-right", "chevron-down",
  "shield", "activity", "bell", "building", "user-circle", "plus", "pencil", "trash", "search", "upload",
  "check", "eye", "eye-off", "key", "globe", "target", "tools", "refresh-cw", "list", "star", "alert-triangle", "info",
]);

function asRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

export function iconFromCatalog(iconSet: string | null | undefined, iconName: string | null | undefined, fallback: string) {
  if (iconSet === "lucide" && iconName && ICON_NAMES.has(iconName)) return iconName;
  return fallback;
}

export function defaultPrice(prices: CatalogServicePrice[]) {
  if (!prices?.length) return null;
  return prices.find((price) => price.is_default) ?? prices[0];
}

export function billingPeriodFromService(service: CatalogServiceTreeNode): BillingPeriod {
  const meta = asRecord(service.meta);
  if (meta?.period === "monthly" || meta?.period === "oneoff") return meta.period;
  const price = defaultPrice(service.prices);
  return price?.billing_period === "monthly" ? "monthly" : "oneoff";
}

export function boxIdFromService(service: CatalogServiceTreeNode) {
  const meta = asRecord(service.meta);
  return typeof meta?.id === "string" ? meta.id : `svc-${service.id}`;
}

export function familyIdFromService(service: CatalogServiceTreeNode) {
  const meta = asRecord(service.meta);
  if (typeof meta?.family === "string") return meta.family;
  return boxIdFromService(service);
}

export function serviceRequiresAnyBox(service: CatalogServiceTreeNode) {
  const meta = asRecord(service.meta);
  const fromMeta = asStringArray(meta?.requiresAnyBox ?? meta?.requires_any_box);
  if (fromMeta.length > 0) return fromMeta;

  const requiredIds = service.dependencies
    .map((dependency) => dependency.required_service_id)
    .filter((id): id is number => typeof id === "number")
    .map((id) => `svc-${id}`);

  return requiredIds.length > 0 ? requiredIds : undefined;
}

export function normalizeViolationMessage(violation: CatalogDependencyViolation | string) {
  if (typeof violation === "string") return violation;
  return violation.message || violation.detail || "Vincolo non soddisfatto";
}

function normalizeSwapOptions(value: unknown) {
  const source = asRecord(value);
  const normalized: Record<string, SwapOption[]> = {};
  if (!source) return normalized;

  Object.entries(source).forEach(([groupKey, options]) => {
    if (!Array.isArray(options)) return;
    const entries: SwapOption[] = [];
    options.forEach((option) => {
      const record = asRecord(option);
      if (!record) return;
      const id = typeof record.id === "string" ? record.id : null;
      const label = typeof record.label === "string" ? record.label : null;
      const price = asNullableNumber(record.price);
      if (!id || !label) return;
      entries.push({
        id,
        label,
        price,
        note: typeof record.note === "string" ? record.note : undefined,
      });
    });
    if (entries.length > 0) normalized[groupKey] = entries;
  });

  return normalized;
}

export function isCategoryRequired(category: ConfigSection) {
  return category.required === true;
}

export function isCategorySatisfied(category: ConfigSection, selectedServiceIds: number[]) {
  if (!isCategoryRequired(category)) return true;
  const selectedSet = new Set(selectedServiceIds);
  return category.boxes.some((box) => {
    if (typeof box.serviceId !== "number") return false;
    if (!selectedSet.has(box.serviceId)) return false;
    if (box.canSelect === false) return false;
    if ((box.dependencyViolations ?? []).length > 0) return false;
    return true;
  });
}

export function getCategoryRequirementState(
  category: ConfigSection,
  services: ConfigBox[],
  selectedServiceIds: number[]
): CategoryRequirementState {
  const required = isCategoryRequired(category);
  if (!required) {
    return {
      required: false,
      satisfied: true,
      showBadge: false,
      hint: category.requiredHint ?? "",
    };
  }

  const selectedSet = new Set(selectedServiceIds);
  const satisfied = services.some((service) => {
    if (typeof service.serviceId !== "number") return false;
    if (!selectedSet.has(service.serviceId)) return false;
    if (service.canSelect === false) return false;
    if ((service.dependencyViolations ?? []).length > 0) return false;
    return true;
  });

  return {
    required,
    satisfied,
    showBadge: !satisfied && category.hideRequiresBadge !== true,
    hint: category.requiredHint ?? "Selezione obbligatoria",
  };
}

export function isCategoryActive(
  node: Pick<ConfigArea, "sections"> | Pick<ConfigSection, "boxes">,
  selectedServiceIds: number[]
): boolean {
  const selectedSet = new Set(selectedServiceIds);
  if ("sections" in node) {
    return node.sections.some((section) => isCategoryActive(section, selectedServiceIds));
  }

  return node.boxes.some((box) => {
    if (typeof box.serviceId !== "number") return false;
    return selectedSet.has(box.serviceId);
  });
}

export function getCategoryCompositionState(
  node: Pick<ConfigArea, "name" | "hasCompositionIssues" | "missingRequiredChildren" | "compositionWarning" | "sections">
    | Pick<ConfigSection, "name" | "hasCompositionIssues" | "missingRequiredChildren" | "compositionWarning" | "boxes">,
  selectedServiceIds: number[]
) {
  const active = isCategoryActive(node, selectedServiceIds);
  const hasCompositionIssues = active && node.hasCompositionIssues === true;
  const missingRequiredChildren = hasCompositionIssues ? (node.missingRequiredChildren ?? []) : [];
  const message = hasCompositionIssues
    ? (node.compositionWarning ?? (
      missingRequiredChildren.length > 0
        ? `${node.name}: Composizione incompleta. Manca: ${missingRequiredChildren.join(", ")}`
        : `${node.name}: Composizione incompleta`
    ))
    : null;

  return {
    active,
    hasCompositionIssues,
    missingRequiredChildren,
    message,
  };
}

export function getProductBadgeState(service: ConfigBox, isSelected = false): ProductBadgeState {
  const badges: ProductBadgeState["badges"] = [];
  if (service.productType === "bundle") badges.push("BUNDLE");
  if (service.canSelect === false) badges.push("PREREQUISITO");
  if (isSelected && (service.dependencyViolations ?? []).length > 0) badges.push("ATTENZIONE");

  return {
    badges,
    primary: badges[0],
  };
}

function includePriceNote(service: CatalogServiceTreeNode | undefined, fallbackPeriod: BillingPeriod) {
  const period = service ? billingPeriodFromService(service) : fallbackPeriod;
  return period === "monthly" ? "mensile" : undefined;
}

function buildSectionsFromCategoryNode(
  node: CatalogCategoryTreeNode,
  root: CatalogCategoryTreeNode,
  servicesById: Map<number, CatalogServiceTreeNode>,
  swapOptionsByGroup: Record<string, SwapOption[]>
): ConfigSection[] {
  const boxes: ConfigBox[] = [];

  node.services.forEach((service) => {
    if (service.product_type === "option") return;

    const serviceMeta = asRecord(service.meta);
    const servicePrice = defaultPrice(service.prices);
    const violationMessages = (service.dependency_violations ?? []).map(normalizeViolationMessage);

    if (service.product_type !== "bundle" && service.option_services.length > 0) {
      const familyId = familyIdFromService(service);
      service.option_services.filter((variant) => variant.is_active).forEach((variant) => {
        const variantMeta = asRecord(variant.meta);
        const variantPrice = defaultPrice(variant.prices);
        boxes.push({
          id: boxIdFromService(variant),
          serviceId: variant.id,
          categoryId: node.id,
          categoryName: node.name,
          label: variant.title,
          price: variantPrice?.amount ?? variant.base_amount ?? null,
          period: billingPeriodFromService(variant),
          desc: variant.description ?? undefined,
          family: familyId,
          familyLabel: typeof variantMeta?.familyLabel === "string" ? variantMeta.familyLabel : service.title,
          familyDesc: typeof variantMeta?.familyDesc === "string" ? variantMeta.familyDesc : (service.description ?? undefined),
          variantLabel: typeof variantMeta?.variantLabel === "string" ? variantMeta.variantLabel : variant.title,
          requiresAnyBox: serviceRequiresAnyBox(variant),
          canSelect: variant.can_select,
          lockReasons: (variant.dependency_violations ?? []).map(normalizeViolationMessage),
          dependencyViolations: variant.dependency_violations,
          exclusiveGroup: typeof variantMeta?.exclusiveGroup === "string" ? variantMeta.exclusiveGroup : undefined,
          productType: variant.product_type,
        });
      });
      return;
    }

    let includes: BoxInclude[] | undefined;
    if (service.product_type === "bundle") {
      const groupCounts = new Map<string, number>();
      service.bundle_items.forEach((bundleItem) => {
        if (!bundleItem.group_key) return;
        groupCounts.set(bundleItem.group_key, (groupCounts.get(bundleItem.group_key) ?? 0) + 1);
      });

      includes = service.bundle_items.map((bundleItem) => {
        const linkedService = servicesById.get(bundleItem.item_service_id);
        const linkedMeta = asRecord(linkedService?.meta);
        const linkedPrice = linkedService ? defaultPrice(linkedService.prices) : null;
        return {
          id: typeof linkedMeta?.id === "string" ? linkedMeta.id : `svc-${bundleItem.item_service_id}`,
          serviceId: linkedService?.id,
          label: linkedService?.title ?? `Servizio ${bundleItem.item_service_id}`,
          price: linkedPrice?.amount ?? linkedService?.base_amount ?? null,
          group: bundleItem.group_key ?? undefined,
          swappable: !!bundleItem.group_key && (groupCounts.get(bundleItem.group_key) ?? 0) > 1,
          note: includePriceNote(linkedService, "oneoff"),
          ficProductId: typeof linkedMeta?.ficProductId === "number" ? linkedMeta.ficProductId : null,
        } satisfies BoxInclude;
      });

      Object.assign(swapOptionsByGroup, normalizeSwapOptions(serviceMeta?.swapOptions));
    }

    boxes.push({
      id: boxIdFromService(service),
      serviceId: service.id,
      categoryId: node.id,
      categoryName: node.name,
      label: service.title,
      price: servicePrice?.amount ?? service.base_amount ?? null,
      period: billingPeriodFromService(service),
      desc: service.description ?? undefined,
      note: includePriceNote(service, "oneoff"),
      isBundle: service.product_type === "bundle",
      includes,
      requiresAnyBox: serviceRequiresAnyBox(service),
      exclusiveGroup: typeof serviceMeta?.exclusiveGroup === "string" ? serviceMeta.exclusiveGroup : undefined,
      canSelect: service.can_select,
      lockReasons: violationMessages,
      dependencyViolations: service.dependency_violations,
      productType: service.product_type,
    });
  });

  const sections: ConfigSection[] = [];
  if (boxes.length > 0) {
    const categoryMeta = asRecord(node.meta);
    sections.push({
      id: `cat-${node.id}`,
      categoryId: node.id,
      name: node.name,
      icon: node.icon,
      icon_set: node.icon_set,
      icon_name: iconFromCatalog(node.icon_set, node.icon_name, "list") as never,
      required: categoryMeta?.required === true,
      requiredHint: typeof categoryMeta?.requiredHint === "string" ? categoryMeta.requiredHint : undefined,
      hideRequiresBadge: categoryMeta?.hideRequiresBadge === true,
      hasCompositionIssues: node.has_composition_issues === true,
      missingRequiredChildren: Array.isArray(node.missing_required_children) ? node.missing_required_children : [],
      compositionWarning: node.composition_warning ?? null,
      boxes,
    });
  }

  node.children.forEach((child) => {
    sections.push(...buildSectionsFromCategoryNode(child, root, servicesById, swapOptionsByGroup));
  });

  return sections;
}

export function flattenCatalogTree(roots: CatalogCategoryTreeNode[]): FlattenedCatalog {
  const servicesById = new Map<number, CatalogServiceTreeNode>();
  const productByBoxId = new Map<string, FlattenedBoxEntry>();
  const productByServiceId = new Map<number, FlattenedBoxEntry>();
  const swapOptionsByGroup: Record<string, SwapOption[]> = {};

  const walkService = (service: CatalogServiceTreeNode) => {
    servicesById.set(service.id, service);
    service.option_services.forEach(walkService);
  };
  const walkCategory = (node: CatalogCategoryTreeNode) => {
    node.services.forEach(walkService);
    node.children.forEach(walkCategory);
  };
  roots.forEach(walkCategory);

  const areas = roots.map((root) => ({
    id: `root-${root.id}`,
    categoryId: root.id,
    name: root.name,
    icon: root.icon,
    icon_set: root.icon_set,
    icon_name: iconFromCatalog(root.icon_set, root.icon_name, "globe") as never,
    desc: root.description ?? `Componi il preventivo per l'area ${root.name}.`,
    sections: buildSectionsFromCategoryNode(root, root, servicesById, swapOptionsByGroup),
    durationField: /menu/i.test(root.slug) || /menu/i.test(root.name),
    hasCompositionIssues: root.has_composition_issues === true,
    missingRequiredChildren: Array.isArray(root.missing_required_children) ? root.missing_required_children : [],
    compositionWarning: root.composition_warning ?? null,
  } satisfies ConfigArea)).filter((area) => area.sections.length > 0);

  areas.forEach((area) => {
    area.sections.forEach((section) => {
      section.boxes.forEach((box) => {
        const entry = { area, section, box } satisfies FlattenedBoxEntry;
        productByBoxId.set(box.id, entry);
        if (typeof box.serviceId === "number") {
          productByServiceId.set(box.serviceId, entry);
        }
      });
    });
  });

  return { areas, swapOptionsByGroup, productByBoxId, productByServiceId };
}

export function getBundlePrice(box: ConfigBox, swaps: Record<string, string>, context: BundlePriceContext): BundlePriceResult {
  const includes = (box.includes ?? []).map((includeItem) => {
    const selectedId = includeItem.group ? swaps[includeItem.id] : undefined;
    if (!selectedId || !includeItem.group) return includeItem;
    const options = context.swapOptionsByGroup[includeItem.group] ?? [];
    const selected = options.find((option) => option.id === selectedId);
    if (!selected) return includeItem;
    return {
      ...includeItem,
      id: selected.id,
      label: selected.label,
      price: selected.price,
      note: selected.note,
    } satisfies BoxInclude;
  });

  let hasKnownPrice = false;
  const unitPrice = includes.reduce((sum, includeItem) => {
    const price = includeItem.price;
    if (typeof price !== "number") return sum;
    hasKnownPrice = true;
    return sum + price;
  }, 0);
  return { unitPrice: hasKnownPrice ? unitPrice : null, includes };
}

export function evaluateSubmitReadiness(
  composition: CompositionItem[],
  catalog: FlattenedCatalog,
  selectedServiceIds: number[] = [],
  extraReasons: string[] = []
): SubmitReadiness {
  const reasons = [...extraReasons];
  const violationMessages: string[] = [];
  const invalidSelectedBoxIds: string[] = [];
  const requiredServiceIds = new Set<number>();
  const requiredCategoryIds = new Set<number>();
  const unsatisfiedRequiredCategoryIds = new Set<number>();
  const activeAreaIds = new Set<string>();

  if (composition.length === 0) {
    reasons.push("Seleziona almeno un prodotto");
  }

  composition.forEach((item) => {
    const entry = catalog.productByBoxId.get(item.boxId);
    if (!entry) {
      invalidSelectedBoxIds.push(item.boxId);
      reasons.push(`Prodotto non piu disponibile: ${item.boxId}`);
      return;
    }

    activeAreaIds.add(entry.area.id);

    const violations = entry.box.dependencyViolations ?? [];
    if (entry.box.canSelect === false || violations.length > 0) {
      invalidSelectedBoxIds.push(item.boxId);
    }

    violations.forEach((violation) => {
      const message = normalizeViolationMessage(violation);
      violationMessages.push(message);
      if (typeof violation !== "string") {
        if (typeof violation.required_service_id === "number") requiredServiceIds.add(violation.required_service_id);
        if (typeof violation.required_category_id === "number") requiredCategoryIds.add(violation.required_category_id);
      }
    });
  });

  const uniqueViolationMessages = Array.from(new Set(violationMessages));
  if (uniqueViolationMessages.length > 0) {
    reasons.push(...uniqueViolationMessages);
  }

  const compositionIssueIds: string[] = [];

  // Enforce category requirements and composition issues only on active macro areas.
  catalog.areas.forEach((area) => {
    const areaActive = activeAreaIds.has(area.id) || isCategoryActive(area, selectedServiceIds);
    if (!areaActive) return;

    const areaCompositionState = getCategoryCompositionState(area, selectedServiceIds);
    if (areaCompositionState.hasCompositionIssues) {
      compositionIssueIds.push(area.id);
      if (areaCompositionState.message) reasons.push(areaCompositionState.message);
    }

    area.sections.forEach((section) => {
      if (section.hasCompositionIssues) {
        compositionIssueIds.push(section.id);
        const missing = section.missingRequiredChildren ?? [];
        const msg = section.compositionWarning ?? (missing.length > 0 ? `${section.name}: Composizione incompleta. Manca: ${missing.join(", ")}` : `${section.name}: Composizione incompleta`);
        reasons.push(msg);
      }
      const requirementState = getCategoryRequirementState(section, section.boxes, selectedServiceIds);
      if (requirementState.required && !requirementState.satisfied) {
        unsatisfiedRequiredCategoryIds.add(section.categoryId);
        if (requirementState.hint) {
          reasons.push(`${section.name}: ${requirementState.hint}`);
        }
      }
    });
  });

  return {
    canSubmit: composition.length > 0 && invalidSelectedBoxIds.length === 0 && unsatisfiedRequiredCategoryIds.size === 0 && compositionIssueIds.length === 0 && reasons.length === 0,
    reasons: Array.from(new Set(reasons)),
    violationMessages: uniqueViolationMessages,
    invalidSelectedBoxIds,
    requiredServiceIds: Array.from(requiredServiceIds),
    requiredCategoryIds: Array.from(requiredCategoryIds),
    unsatisfiedRequiredCategoryIds: Array.from(unsatisfiedRequiredCategoryIds),
    compositionIssueIds,
  };
}

export function canCreateQuote(state: Pick<SubmitReadiness, "canSubmit" | "reasons">) {
  return state.canSubmit && state.reasons.length === 0;
}

export function buildConfiguratorPayload(params: {
  source: string;
  version: string;
  currentAreaId: string;
  months: number;
  effectiveMonths: number;
  menuBillingMode: "semestral" | "annual";
  discountPct: number;
  composition: CompositionItem[];
  catalog: FlattenedCatalog;
}): ConfiguratorSnapshotPayload {
  const items = params.composition.flatMap((item) => {
    const entry = params.catalog.productByBoxId.get(item.boxId);
    if (!entry) return [];

    const priceResult = entry.box.isBundle
      ? getBundlePrice(entry.box, item.swaps, {
          effectiveMonths: params.effectiveMonths,
          swapOptionsByGroup: params.catalog.swapOptionsByGroup,
        })
      : {
          unitPrice: typeof entry.box.price === "number" ? entry.box.price : null,
          includes: entry.box.includes ?? [],
        };

    return [{
      id: item.boxId,
      serviceId: entry.box.serviceId,
      label: entry.box.label,
      areaId: entry.area.id,
      sectionId: entry.section.id,
      sectionName: entry.section.name,
      period: entry.box.period,
      isBundle: !!entry.box.isBundle,
      price: entry.box.price ?? null,
      computedPrice: priceResult.unitPrice,
      desc: entry.box.desc,
      family: entry.box.family,
      exclusiveGroup: entry.box.exclusiveGroup,
      includes: priceResult.includes,
    }];
  });

  return {
    source: params.source,
    version: params.version,
    areaId: params.currentAreaId,
    months: params.months,
    effectiveMonths: params.effectiveMonths,
    menuBillingMode: params.menuBillingMode,
    discountPct: params.discountPct,
    composition: params.composition.map((item) => ({
      boxId: item.boxId,
      instances: item.instances,
      swaps: item.swaps,
    })),
    items,
    swapOptions: params.catalog.swapOptionsByGroup,
  };
}
