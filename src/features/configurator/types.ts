import type { IconName } from "../../components/ui/Icon";
import type {
  CatalogCategoryTreeNode,
  CatalogDependencyViolation,
  CatalogServicePrice,
  CatalogServiceTreeNode,
} from "../../api/catalog";

export type BillingPeriod = "monthly" | "oneoff";

export interface SwapOption {
  id: string;
  label: string;
  price: number | null;
  note?: string;
}

export interface BoxInclude {
  id: string;
  serviceId?: number;
  label: string;
  price: number | null;
  swappable?: boolean;
  group?: string;
  note?: string;
  ficProductId?: number | null;
}

export interface ConfigBox {
  id: string;
  serviceId?: number;
  categoryId: number;
  categoryName: string;
  label: string;
  price?: number | null;
  period: BillingPeriod;
  desc?: string;
  note?: string;
  isBundle?: boolean;
  includes?: BoxInclude[];
  family?: string;
  familyLabel?: string;
  familyDesc?: string;
  variantLabel?: string;
  requiresAnyBox?: string[];
  exclusiveGroup?: string;
  canSelect?: boolean;
  lockReasons?: string[];
  dependencyViolations?: Array<CatalogDependencyViolation | string>;
  productType: "service" | "bundle" | "option";
}

export interface ConfigSection {
  id: string;
  categoryId: number;
  name: string;
  icon: string | null;
  icon_set?: string | null;
  icon_name?: IconName;
  required?: boolean;
  requiredHint?: string;
  hideRequiresBadge?: boolean;
  /** Mapped from backend has_composition_issues */
  hasCompositionIssues?: boolean;
  /** Mapped from backend missing_required_children */
  missingRequiredChildren?: string[];
  /** Mapped from backend composition_warning */
  compositionWarning?: string | null;
  boxes: ConfigBox[];
  requiresBox?: string;
}

export interface ConfigArea {
  id: string;
  categoryId: number;
  name: string;
  icon: string | null;
  icon_set?: string | null;
  icon_name?: IconName;
  desc: string;
  sections: ConfigSection[];
  durationField?: boolean;
  /** Mapped from root category has_composition_issues */
  hasCompositionIssues?: boolean;
  missingRequiredChildren?: string[];
  compositionWarning?: string | null;
}

export interface CompositionItem {
  boxId: string;
  serviceId?: number;
  instances: number;
  swaps: Record<string, string>;
}

export interface FlattenedBoxEntry {
  area: ConfigArea;
  section: ConfigSection;
  box: ConfigBox;
}

export interface FlattenedCatalog {
  areas: ConfigArea[];
  swapOptionsByGroup: Record<string, SwapOption[]>;
  productByBoxId: Map<string, FlattenedBoxEntry>;
  productByServiceId: Map<number, FlattenedBoxEntry>;
}

export interface SubmitReadiness {
  canSubmit: boolean;
  reasons: string[];
  violationMessages: string[];
  invalidSelectedBoxIds: string[];
  requiredServiceIds: number[];
  requiredCategoryIds: number[];
  unsatisfiedRequiredCategoryIds?: number[];
  compositionIssueIds?: string[];
}

export interface CategoryRequirementState {
  required: boolean;
  satisfied: boolean;
  showBadge: boolean;
  hint: string;
}

export type ProductBadge = "BUNDLE" | "PREREQUISITO" | "ATTENZIONE";

export interface ProductBadgeState {
  badges: ProductBadge[];
  primary?: ProductBadge;
}

export interface ConfiguratorSnapshotItem {
  id: string;
  serviceId?: number;
  label: string;
  areaId: string;
  sectionId?: string;
  sectionName?: string;
  period: BillingPeriod;
  isBundle: boolean;
  price: number | null;
  computedPrice: number | null;
  desc?: string;
  family?: string;
  exclusiveGroup?: string;
  includes: BoxInclude[];
}

export interface ConfiguratorSnapshotPayload {
  source: string;
  version: string;
  areaId: string;
  months: number;
  effectiveMonths: number;
  menuBillingMode: "semestral" | "annual";
  discountPct: number;
  composition: Array<{
    boxId: string;
    instances: number;
    swaps: Record<string, string>;
  }>;
  items: ConfiguratorSnapshotItem[];
  swapOptions: Record<string, SwapOption[]>;
}

export interface BundlePriceContext {
  effectiveMonths: number;
  swapOptionsByGroup: Record<string, SwapOption[]>;
}

export interface BundlePriceResult {
  unitPrice: number | null;
  includes: BoxInclude[];
}

export interface CatalogRuleView {
  treeRoots: CatalogCategoryTreeNode[];
  flatCatalog: FlattenedCatalog;
  requiredServiceIds: Set<number>;
  requiredCategoryIds: Set<number>;
  messagesByBoxId: Map<string, string[]>;
  submitReadiness: SubmitReadiness;
}

export interface CompositionWarningState {
  sectionId: string;
  sectionName: string;
  missing: string[];
  message: string;
}

export interface ValidationState {
  /** Category requirement states keyed by categoryId */
  categoryRequirements: Map<number, CategoryRequirementState>;
  /** Composition warnings (missing required children) per section */
  compositionWarnings: CompositionWarningState[];
  /** Violation messages per boxId */
  productViolations: Map<string, string[]>;
  /** Whether Crea preventivo should be enabled */
  canCreateQuote: boolean;
  /** Reasons Crea preventivo is blocked */
  blockReasons: string[];
}

export interface CatalogMetaRecord {
  [key: string]: unknown;
}

export type CatalogTreeLikeService = CatalogServiceTreeNode;
export type CatalogTreeLikeCategory = CatalogCategoryTreeNode;
export type CatalogPriceLike = CatalogServicePrice;
