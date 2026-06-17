import { describe, expect, it } from "vitest";
import type { CatalogCategoryTreeNode, CatalogServiceTreeNode } from "../../api/catalog";
import {
  buildConfiguratorPayload,
  evaluateSubmitReadiness,
  flattenCatalogTree,
  getBundlePrice,
  getCategoryRequirementState,
  getProductBadgeState,
  isCategoryRequired,
  isCategorySatisfied,
} from "./helpers";
import type { BillingPeriod, CompositionItem } from "./types";

function makeService(overrides: Partial<CatalogServiceTreeNode>): CatalogServiceTreeNode {
  return {
    id: 1,
    company_id: 7,
    category_id: 10,
    parent_service_id: null,
    title: "Servizio",
    slug: "servizio",
    description: null,
    icon: null,
    icon_set: null,
    icon_name: null,
    meta: null,
    product_type: "service",
    base_amount: 100,
    base_billing_period: "oneoff",
    currency: "EUR",
    sort_order: 0,
    is_active: true,
    created_at: "2026-05-22T00:00:00Z",
    updated_at: "2026-05-22T00:00:00Z",
    prices: [],
    dependencies: [],
    bundle_items: [],
    option_services: [],
    can_select: true,
    dependency_violations: [],
    ...overrides,
  };
}

function makeCategory(overrides: Partial<CatalogCategoryTreeNode>): CatalogCategoryTreeNode {
  return {
    id: 10,
    company_id: 7,
    parent_id: null,
    name: "Area Web",
    slug: "web",
    description: "Area Web",
    icon: null,
    icon_set: null,
    icon_name: null,
    meta: null,
    sort_order: 0,
    is_active: true,
    created_at: "2026-05-22T00:00:00Z",
    updated_at: "2026-05-22T00:00:00Z",
    children: [],
    services: [],
    ...overrides,
  };
}

describe("configurator helpers", () => {
  it("maps bundle swap groups and hides bundle components from top-level boxes", () => {
    const hostingBase = makeService({
      id: 2,
      title: "Hosting Base",
      slug: "hosting-base",
      base_amount: 150,
      meta: { id: "hosting-base" },
    });
    const hostingPro = makeService({
      id: 3,
      title: "Hosting Pro",
      slug: "hosting-pro",
      base_amount: 300,
      meta: { id: "hosting-pro", isBundleComponent: true },
    });
    const bundle = makeService({
      id: 1,
      title: "Sito Corporate",
      slug: "sito-corporate",
      product_type: "bundle",
      base_amount: 0,
      meta: {
        id: "bundle-site-corporate",
        swapOptions: {
          hosting: [
            { id: "hosting-base", label: "Hosting Base", price: 150 },
            { id: "hosting-pro", label: "Hosting Pro", price: 300 },
          ],
        },
      },
      bundle_items: [
        { item_service_id: 2, group_key: "hosting", group_label: "Hosting", is_required: true, min_select: 1, max_select: 1, sort_order: 0 },
        { item_service_id: 3, group_key: "hosting", group_label: "Hosting", is_required: true, min_select: 1, max_select: 1, sort_order: 1 },
      ],
      option_services: [hostingBase, hostingPro],
    });

    const flat = flattenCatalogTree([
      makeCategory({ services: [bundle] }),
    ]);

    expect(flat.areas[0]?.sections[0]?.boxes).toHaveLength(1);
    expect(flat.areas[0]?.sections[0]?.boxes[0]?.isBundle).toBe(true);
    expect(flat.swapOptionsByGroup.hosting?.map((entry) => entry.id)).toEqual(["hosting-base", "hosting-pro"]);
    expect(flat.areas[0]?.sections[0]?.boxes[0]?.includes?.map((entry) => entry.id)).toEqual(["hosting-base", "hosting-pro"]);
  });

  it("maps swapped bundle option pricing for dropdown selections", () => {
    const bundle = {
      id: "bundle-site-corporate",
      categoryId: 10,
      categoryName: "Area Web",
      label: "Sito Corporate",
      price: 0,
      period: "oneoff" as BillingPeriod,
      isBundle: true,
      canSelect: true,
      productType: "bundle",
      includes: [
        { id: "hosting-base", label: "Hosting Base", price: 150, group: "hosting", swappable: true },
      ],
    };

    const result = getBundlePrice(bundle, { "hosting-base": "hosting-pro" }, {
      effectiveMonths: 6,
      swapOptionsByGroup: {
        hosting: [
          { id: "hosting-base", label: "Hosting Base", price: 150 },
          { id: "hosting-pro", label: "Hosting Pro", price: 300 },
        ],
      },
    });

    expect(result.unitPrice).toBe(300);
    expect(result.includes[0]?.id).toBe("hosting-pro");
    expect(result.includes[0]?.label).toBe("Hosting Pro");
  });

  it("disables submit and highlights required dependency targets when violations are open", () => {
    const requiredService = makeService({
      id: 5,
      title: "Dominio",
      slug: "dominio",
      meta: { id: "dominio" },
    });
    const blockedService = makeService({
      id: 6,
      title: "Campagna Meta",
      slug: "campagna-meta",
      meta: { id: "campagna-meta" },
      can_select: false,
      dependency_violations: [
        {
          dependency_rule_id: 301,
          required_service_id: 5,
          required_category_id: 10,
          message: "Richiede il servizio 'Dominio'",
        },
      ],
    });

    const flat = flattenCatalogTree([
      makeCategory({ services: [requiredService, blockedService] }),
    ]);

    const composition: CompositionItem[] = [
      { boxId: "campagna-meta", serviceId: 6, instances: 1, swaps: {} },
    ];

    const readiness = evaluateSubmitReadiness(composition, flat);
    const payload = buildConfiguratorPayload({
      source: "test",
      version: "1.0",
      currentAreaId: flat.areas[0]?.id ?? "root-10",
      months: 6,
      effectiveMonths: 6,
      menuBillingMode: "semestral",
      discountPct: 0,
      composition,
      catalog: flat,
    });

    expect(readiness.canSubmit).toBe(false);
    expect(readiness.requiredServiceIds).toContain(5);
    expect(readiness.requiredCategoryIds).toContain(10);
    expect(readiness.reasons).toContain("Richiede il servizio 'Dominio'");
    expect(payload.composition).toEqual([
      { boxId: "campagna-meta", instances: 1, swaps: {} },
    ]);
  });

  it("category required non soddisfatta -> badge and highlight state", () => {
    const requiredService = makeService({
      id: 11,
      title: "Dominio",
      slug: "dominio",
      meta: { id: "dominio" },
    });
    const root = makeCategory({
      meta: { required: true, requiredHint: "Selezione obbligatoria" },
      services: [requiredService],
    });
    const flat = flattenCatalogTree([root]);
    const section = flat.areas[0].sections[0];

    expect(isCategoryRequired(section)).toBe(true);
    expect(isCategorySatisfied(section, [])).toBe(false);

    const state = getCategoryRequirementState(section, section.boxes, []);
    expect(state.required).toBe(true);
    expect(state.satisfied).toBe(false);
    expect(state.showBadge).toBe(true);
    expect(state.hint).toBe("Selezione obbligatoria");

    const readiness = evaluateSubmitReadiness([], flat, []);
    expect(readiness.canSubmit).toBe(false);
    // Inactive macro area: required categories must not block submit by themselves.
    expect(readiness.unsatisfiedRequiredCategoryIds).toEqual([]);
    expect(readiness.reasons).toContain("Seleziona almeno un prodotto");
  });

  it("category required soddisfatta -> removes error badge state", () => {
    const requiredService = makeService({
      id: 12,
      title: "Campagna valida",
      slug: "campagna-valida",
      meta: { id: "campagna-valida" },
      can_select: true,
      dependency_violations: [],
    });
    const root = makeCategory({
      meta: { required: true },
      services: [requiredService],
    });
    const flat = flattenCatalogTree([root]);
    const section = flat.areas[0].sections[0];

    const state = getCategoryRequirementState(section, section.boxes, [12]);
    expect(state.required).toBe(true);
    expect(state.satisfied).toBe(true);
    expect(state.showBadge).toBe(false);
  });

  it("product can_select false -> prerequisito badge and blocked state source", () => {
    const blocked = makeService({
      id: 13,
      title: "Prodotto bloccato",
      slug: "prodotto-bloccato",
      meta: { id: "prodotto-bloccato" },
      can_select: false,
      dependency_violations: [{ dependency_rule_id: 1, required_service_id: 99, required_category_id: null, message: "Serve prerequisito" }],
    });
    const flat = flattenCatalogTree([makeCategory({ services: [blocked] })]);
    const box = flat.areas[0].sections[0].boxes[0];

    const badge = getProductBadgeState(box, false);
    expect(badge.badges).toContain("PREREQUISITO");
    expect(box.canSelect).toBe(false);
    expect(box.lockReasons?.[0]).toBe("Serve prerequisito");
  });

  it("has_composition_issues su category blocca submit e accumula compositionIssueIds", () => {
    const service = makeService({
      id: 20,
      title: "Servizio A",
      slug: "servizio-a",
      meta: { id: "servizio-a" },
    });
    const root = makeCategory({
      id: 20,
      services: [service],
      has_composition_issues: true,
      missing_required_children: ["Servizio B"],
      composition_warning: null,
    });
    const flat = flattenCatalogTree([root]);
    const composition: CompositionItem[] = [
      { boxId: "servizio-a", serviceId: 20, instances: 1, swaps: {} },
    ];
    const readiness = evaluateSubmitReadiness(composition, flat, [20]);
    expect(readiness.canSubmit).toBe(false);
    expect(readiness.compositionIssueIds.length).toBeGreaterThan(0);
    expect(readiness.reasons.some((r) => r.includes("Composizione incompleta"))).toBe(true);
  });

  it("bottone Crea preventivo disabilitato quando regole non rispettate (unsatisfied required)", () => {
    const requiredChild = makeCategory({
      id: 301,
      name: "Gestione e Strategia",
      meta: { required: true },
      services: [
        makeService({ id: 30, title: "Voce richiesta", slug: "voce-richiesta", meta: { id: "voce-richiesta" } }),
      ],
    });
    const activatingChild = makeCategory({
      id: 302,
      name: "Altro",
      services: [
        makeService({ id: 31, title: "Prodotto attivatore", slug: "prodotto-attivatore", meta: { id: "prodotto-attivatore" } }),
      ],
    });
    const root = makeCategory({
      id: 300,
      name: "Social",
      children: [requiredChild, activatingChild],
    });
    const flat = flattenCatalogTree([root]);
    const readiness = evaluateSubmitReadiness(
      [{ boxId: "prodotto-attivatore", serviceId: 31, instances: 1, swaps: {} }],
      flat,
      [31]
    );
    expect(readiness.canSubmit).toBe(false);
    expect(readiness.unsatisfiedRequiredCategoryIds).toContain(301);
  });

  it("attiva solo Web: Social non blocca finche non selezionata", () => {
    const webBundle = makeService({ id: 501, slug: "web-bundle", title: "Bundle Web", meta: { id: "web-bundle" } });
    const socialService = makeService({ id: 601, slug: "social-base", title: "Social Base", meta: { id: "social-base" } });

    const webRoot = makeCategory({
      id: 500,
      name: "Web",
      has_composition_issues: true,
      missing_required_children: ["Manutenzione", "Aggiornamento"],
      children: [makeCategory({ id: 501, services: [webBundle] })],
    });
    const socialRoot = makeCategory({
      id: 600,
      name: "Social",
      has_composition_issues: true,
      missing_required_children: ["Gestione", "Strategia"],
      children: [makeCategory({ id: 601, services: [socialService] })],
    });

    const flat = flattenCatalogTree([webRoot, socialRoot]);
    const readinessWebOnly = evaluateSubmitReadiness(
      [{ boxId: "web-bundle", serviceId: 501, instances: 1, swaps: {} }],
      flat,
      [501]
    );

    expect(readinessWebOnly.canSubmit).toBe(false);
    expect(readinessWebOnly.reasons.some((msg) => msg.includes("Web") || msg.includes("Manutenzione") || msg.includes("Aggiornamento"))).toBe(true);
    expect(readinessWebOnly.reasons.some((msg) => msg.includes("Social") || msg.includes("Gestione") || msg.includes("Strategia"))).toBe(false);

    const readinessWebAndSocial = evaluateSubmitReadiness(
      [
        { boxId: "web-bundle", serviceId: 501, instances: 1, swaps: {} },
        { boxId: "social-base", serviceId: 601, instances: 1, swaps: {} },
      ],
      flat,
      [501, 601]
    );

    expect(readinessWebAndSocial.canSubmit).toBe(false);
    expect(readinessWebAndSocial.reasons.some((msg) => msg.includes("Social") || msg.includes("Gestione") || msg.includes("Strategia"))).toBe(true);
  });

  it("bundle con swap in payload include l'opzione selezionata", () => {
    const optA = makeService({ id: 40, slug: "opt-a", meta: { id: "opt-a" } });
    const optB = makeService({ id: 41, slug: "opt-b", meta: { id: "opt-b" } });
    const bundle = makeService({
      id: 42,
      title: "Bundle con swap",
      slug: "bundle-swap",
      product_type: "bundle",
      meta: { id: "bundle-swap", swapOptions: { grp: [{ id: "opt-a", label: "A", price: 100 }, { id: "opt-b", label: "B", price: 200 }] } },
      bundle_items: [
        { item_service_id: 40, group_key: "grp", group_label: "Grp", is_required: true, min_select: 1, max_select: 1, sort_order: 0 },
        { item_service_id: 41, group_key: "grp", group_label: "Grp", is_required: true, min_select: 1, max_select: 1, sort_order: 1 },
      ],
      option_services: [optA, optB],
    });
    const flat = flattenCatalogTree([makeCategory({ services: [bundle] })]);
    const composition: CompositionItem[] = [
      { boxId: "bundle-swap", serviceId: 42, instances: 1, swaps: { "opt-a": "opt-b" } },
    ];
    const payload = buildConfiguratorPayload({
      source: "test",
      version: "1.0",
      currentAreaId: flat.areas[0]?.id ?? "",
      months: 6,
      effectiveMonths: 6,
      menuBillingMode: "semestral",
      discountPct: 0,
      composition,
      catalog: flat,
    });
    expect(payload.composition[0]?.swaps?.["opt-a"]).toBe("opt-b");
  });
});
