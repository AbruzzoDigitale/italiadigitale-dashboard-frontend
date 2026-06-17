import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { CreateQuotePayload, QuoteLineItem } from "../../api/quotes";
import { createQuoteFromConfiguratorPreviewApi } from "../../api/quotes";
import { createClientApi, getClientsApi, type Client } from "../../api/clients";
import { createRequestFromConfiguratorApi, updateRequestStatusApi } from "../../api/requests";
import { ConfiguratorDialog } from "../../components/configurator/ConfiguratorDialog";
import { BundleCard } from "../../components/configurator/BundleCard";
import { CategorySection } from "../../components/configurator/CategorySection";
import { ProductCard } from "../../components/configurator/ProductCard";
import { Button } from "../../components/ui/Button";
import { FadePresence } from "../../components/ui/FadePresence";
import { Icon, type IconName } from "../../components/ui/Icon";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import { Skeleton } from "../../components/ui/Skeleton";
import { Textarea } from "../../components/ui/Textarea";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../hooks/useAuth";
import { useCatalogTree } from "../../hooks/useCatalogTree";
import { useCompanies } from "../../hooks/useCompanies";
import { useConfiguratorRules } from "../../hooks/useConfiguratorRules";
import { useConfiguratorSelection } from "../../hooks/useConfiguratorSelection";
import { useConfiguratorValidation } from "../../hooks/useConfiguratorValidation";
import {
  buildConfiguratorPayload,
  getBundlePrice,
  getProductBadgeState,
} from "./helpers";
import { normalizeCompanyPayload } from "../../utils/companyPayload";
import type { ConfigBox } from "./types";
import "../../pages/ConfiguratorModularPage.css";

type OperatorSubmitForm = {
  clientId: number | null;
  title: string;
  notes: string;
  createNewClient: boolean;
  newClientName: string;
  newClientContact: string;
  newClientVat: string;
  newClientEmail: string;
};

type GroupedBox =
  | { kind: "single"; box: ConfigBox }
  | { kind: "family"; familyId: string; familyLabel: string; familyDesc: string; variants: ConfigBox[] };

const CONFIGURATOR_SOURCE = "preventivatore-abruzzo-digitale";
const CONFIGURATOR_VERSION = "3.0";

const EMPTY_OPERATOR_FORM: OperatorSubmitForm = {
  clientId: null,
  title: "",
  notes: "",
  createNewClient: false,
  newClientName: "",
  newClientContact: "",
  newClientVat: "",
  newClientEmail: "",
};

const ICON_NAMES = new Set<IconName>([
  "home", "users", "settings", "logout", "moon", "sun", "menu", "x", "chevron-right", "chevron-down",
  "shield", "activity", "bell", "building", "user-circle", "plus", "pencil", "trash", "search", "upload",
  "check", "eye", "eye-off", "key", "globe", "target", "tools", "refresh-cw", "list", "star", "alert-triangle", "info",
]);

function renderCatalogIcon(icon: string | null | undefined, iconName: IconName | undefined, fallback: IconName, className: string) {
  if (typeof icon === "string" && icon.trim().length > 0) {
    if (ICON_NAMES.has(icon as IconName)) {
      return <Icon name={icon as IconName} className={className} />;
    }
    return <span className={className}>{icon}</span>;
  }
  return <Icon name={iconName ?? fallback} className={className} />;
}

function ConfiguratorAreaSkeleton() {
  return (
    <div className="cfg-area-intro">
      <div className="space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-5/6" />
      </div>
      <div className="mt-4 grid gap-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-11/12" />
      </div>
    </div>
  );
}

function groupBoxesByFamily(boxes: ConfigBox[]): GroupedBox[] {
  const families = new Map<string, ConfigBox[]>();
  const groups: GroupedBox[] = [];

  boxes.forEach((box) => {
    if (!box.family) {
      groups.push({ kind: "single", box });
      return;
    }

    const variants = families.get(box.family) ?? [];
    variants.push(box);
    families.set(box.family, variants);
  });

  families.forEach((variants, familyId) => {
    const first = variants[0];
    groups.push({
      kind: "family",
      familyId,
      familyLabel: first.familyLabel || first.label,
      familyDesc: first.familyDesc || "",
      variants,
    });
  });

  return groups;
}

export function ConfiguratorModularPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user, permissions } = useAuth();
  const { companies } = useCompanies();

  const [currentAreaId, setCurrentAreaId] = useState<string>("");
  const [months, setMonths] = useState<number>(6);
  const [discountPct, setDiscountPct] = useState<number>(0);
  const [menuBillingMode, setMenuBillingMode] = useState<"semestral" | "annual">("semestral");
  const [pickerVariants, setPickerVariants] = useState<ConfigBox[] | null>(null);
  const [dragOverCanvas, setDragOverCanvas] = useState(false);
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [workflowSubmitting, setWorkflowSubmitting] = useState(false);
  const [operatorForm, setOperatorForm] = useState<OperatorSubmitForm>(EMPTY_OPERATOR_FORM);

  const isOperator = !!user && !user.is_admin;
  const canViewCatalogPrices = permissions?.can_view_catalog_prices ?? !!user?.is_admin;
  const effectiveCompanyId = user?.company_id ?? companies[0]?.id ?? null;

  const [selectedServiceIdsForTree, setSelectedServiceIdsForTree] = useState<number[]>([]);

  const { tree, isLoading: catalogLoading, error: catalogError } = useCatalogTree(effectiveCompanyId, selectedServiceIdsForTree);
  const rules = useConfiguratorRules(tree, selectedServiceIdsForTree);
  const {
    composition,
    selectedServiceIds,
    bundleGroupSelections,
    canSelectBox,
    addBox,
    removeBox,
    changeInstances,
    applySwap,
    resetComposition,
  } = useConfiguratorSelection(rules.flatCatalog);

  const validation = useConfiguratorValidation(rules, composition, selectedServiceIds);

  const areas = rules.flatCatalog.areas;
  const currentArea = useMemo(
    () => areas.find((area) => area.id === currentAreaId) ?? areas[0] ?? null,
    [areas, currentAreaId]
  );

  const isSubmitting = workflowSubmitting;
  const isMenuArea = !!currentArea?.durationField;

  useEffect(() => {
    setSelectedServiceIdsForTree((prev) => {
      if (prev.length === selectedServiceIds.length && prev.every((value, index) => value === selectedServiceIds[index])) {
        return prev;
      }
      return selectedServiceIds;
    });
  }, [selectedServiceIds]);

  useEffect(() => {
    if (!currentArea && areas[0]) {
      setCurrentAreaId(areas[0].id);
      return;
    }
    if (currentAreaId && areas.some((area) => area.id === currentAreaId)) return;
    if (areas[0]) setCurrentAreaId(areas[0].id);
  }, [areas, currentArea, currentAreaId]);

  const resetAll = useCallback(() => {
    resetComposition();
    setMonths(6);
    setDiscountPct(0);
    setMenuBillingMode("semestral");
  }, [resetComposition]);

  const compositionState = useMemo(() => {
    const items = composition.flatMap((item) => {
      const found = rules.flatCatalog.productByBoxId.get(item.boxId);
      if (!found) return [];

      const bundlePrice = found.box.isBundle
        ? getBundlePrice(found.box, item.swaps, {
            effectiveMonths: isMenuArea ? (menuBillingMode === "annual" ? 12 : 6) : months,
            swapOptionsByGroup: rules.flatCatalog.swapOptionsByGroup,
          })
        : null;

      const unitPrice = found.box.isBundle
        ? (bundlePrice?.unitPrice ?? null)
        : (typeof found.box.price === "number" ? found.box.price : null);
      const effectiveIncludes = bundlePrice?.includes ?? found.box.includes ?? [];

      return [{
        ...item,
        area: found.area,
        section: found.section,
        box: found.box,
        unitPrice,
        subtotal: typeof unitPrice === "number" ? unitPrice * item.instances : null,
        effectiveIncludes,
      }];
    });

    const effectiveMonths = isMenuArea ? (menuBillingMode === "annual" ? 12 : 6) : months;
    const monthly = items
      .filter((item) => item.box.period === "monthly")
      .reduce((sum, item) => sum + (typeof item.subtotal === "number" ? item.subtotal : 0), 0);
    const oneoff = items
      .filter((item) => item.box.period === "oneoff")
      .reduce((sum, item) => sum + (typeof item.subtotal === "number" ? item.subtotal : 0), 0);
    const subtotal = oneoff + monthly * effectiveMonths;
    const discount = subtotal * (discountPct / 100);
    const net = Math.max(0, subtotal - discount);

    return {
      items,
      effectiveMonths,
      monthly,
      oneoff,
      subtotal,
      discount,
      net,
    };
  }, [composition, discountPct, isMenuArea, menuBillingMode, months, rules.flatCatalog]);

  const validationMessages = useMemo(() => {
    return Array.from(new Set(validation.blockReasons));
  }, [validation.blockReasons]);

  const currentAreaWarning = useMemo(() => {
    if (!currentArea) return null;
    return validation.compositionWarnings.find((w) => w.sectionId === currentArea.id) ?? null;
  }, [currentArea, validation.compositionWarnings]);

  const canCreateQuote = validation.canCreateQuote;

  const visibleComposition = compositionState.items;

  const buildQuoteLines = useCallback((): QuoteLineItem[] => {
    const lines: QuoteLineItem[] = [];
    compositionState.items.forEach((item) => {
      if (item.box.isBundle) {
        item.effectiveIncludes.forEach((includeItem) => {
          const period = includeItem.note?.toLowerCase().includes("mensile") ? "monthly" : "oneoff";
          lines.push({
            productId: null,
            ficProductId: includeItem.ficProductId ?? null,
            area: item.area.id,
            boxId: item.boxId,
            name: includeItem.label,
            category: item.section.name,
            net: typeof includeItem.price === "number" ? includeItem.price : 0,
            vat: 0.22,
            udm: period === "monthly" ? "Mese" : "una tantum",
            quantity: period === "monthly" ? compositionState.effectiveMonths * item.instances : item.instances,
            discountPct: 0,
            period,
            included: true,
          });
        });
        return;
      }

      lines.push({
        productId: null,
        ficProductId: null,
        area: item.area.id,
        boxId: item.boxId,
        name: item.box.label,
        category: item.section.name,
        net: typeof item.unitPrice === "number" ? item.unitPrice : 0,
        vat: 0.22,
        udm: item.box.period === "monthly" ? "Mese" : "una tantum",
        quantity: item.box.period === "monthly" ? compositionState.effectiveMonths * item.instances : item.instances,
        discountPct: 0,
        period: item.box.period,
      });
    });
    return lines;
  }, [compositionState.effectiveMonths, compositionState.items]);

  const buildCreatePayload = useCallback((params: { clientId: number | null; notes: string; tag: string }): CreateQuotePayload => ({
    ...normalizeCompanyPayload(
      user?.company_id ?? null,
      user?.company_ids ?? (user?.company_id != null ? [user.company_id] : [])
    ),
    date: new Date().toISOString().slice(0, 10),
    tag: params.tag,
    client_id: params.clientId,
    notes: params.notes,
    discount_pct: canViewCatalogPrices ? discountPct : 0,
    discount_eur: 0,
    lines: buildQuoteLines(),
    configurator: buildConfiguratorPayload({
      source: CONFIGURATOR_SOURCE,
      version: CONFIGURATOR_VERSION,
      currentAreaId: currentArea?.id ?? "",
      months,
      effectiveMonths: compositionState.effectiveMonths,
      menuBillingMode,
      discountPct,
      composition,
      catalog: rules.flatCatalog,
    }) as unknown as Record<string, unknown>,
  }), [buildQuoteLines, canViewCatalogPrices, composition, compositionState.effectiveMonths, currentArea?.id, discountPct, menuBillingMode, months, rules.flatCatalog, user?.company_id]);

  const loadClients = useCallback(async () => {
    if (!isOperator) return;
    setClientsLoading(true);
    try {
      const list = await getClientsApi({ company_id: user?.company_id ?? undefined });
      setClients(list.data);
    } catch {
      toast.error("Impossibile caricare i clienti");
    } finally {
      setClientsLoading(false);
    }
  }, [isOperator, toast, user?.company_id]);

  useEffect(() => {
    if (!submitModalOpen || !isOperator) return;
    void loadClients();
  }, [isOperator, loadClients, submitModalOpen]);

  const resolveOperatorClient = useCallback(async () => {
    if (operatorForm.createNewClient) {
      const name = operatorForm.newClientName.trim();
      if (!name) throw new Error("Inserisci almeno Nome / Ragione sociale del nuovo cliente");
      const companyPayload = normalizeCompanyPayload(
        user?.company_id ?? null,
        user?.company_ids ?? (user?.company_id != null ? [user.company_id] : [])
      );
      const created = await createClientApi({
        name,
        contact: operatorForm.newClientContact.trim() || null,
        vat: operatorForm.newClientVat.trim() || null,
        email: operatorForm.newClientEmail.trim() || null,
        ...companyPayload,
      });
      return created.id;
    }

    if (!operatorForm.clientId) {
      throw new Error("Seleziona un cliente o inseriscine uno nuovo");
    }

    return operatorForm.clientId;
  }, [operatorForm, user?.company_id, user?.company_ids]);

  const createQuoteAsAdmin = useCallback(async () => {
    setWorkflowSubmitting(true);
    try {
      const payload = buildCreatePayload({
        clientId: null,
        notes: "",
        tag: `Configuratore ${currentArea?.id ?? ""}`,
      });
      const preview = await createQuoteFromConfiguratorPreviewApi(payload);
      toast.success("Preview pronta: completa i dati nell'editor preventivo");
      navigate("/preventivo", {
        state: {
          preview,
          previewPayload: payload,
        },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore creazione preventivo");
    } finally {
      setWorkflowSubmitting(false);
    }
  }, [buildCreatePayload, currentArea?.id, navigate, toast]);

  const submitOperatorRequest = useCallback(async () => {
    setWorkflowSubmitting(true);
    try {
      const clientId = await resolveOperatorClient();
      const request = await createRequestFromConfiguratorApi(buildCreatePayload({
        clientId,
        notes: operatorForm.notes.trim() ? `[Op] ${operatorForm.notes.trim()}` : "",
        tag: operatorForm.title.trim() || `Configuratore ${currentArea?.id ?? ""}`,
      }));
      await updateRequestStatusApi(request.id, "da_approvare");
      toast.success("Richiesta inviata all'admin");
      setSubmitModalOpen(false);
      setOperatorForm(EMPTY_OPERATOR_FORM);
      resetAll();
      navigate("/requests");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore invio richiesta");
    } finally {
      setWorkflowSubmitting(false);
    }
  }, [buildCreatePayload, currentArea?.id, navigate, operatorForm.notes, operatorForm.title, resetAll, resolveOperatorClient, toast]);

  const handleCreateQuote = useCallback(async () => {
    if (!canCreateQuote) {
      toast.error(validationMessages[0] ?? "Configurazione non valida");
      return;
    }

    if (isOperator) {
      setSubmitModalOpen(true);
      return;
    }

    await createQuoteAsAdmin();
  }, [canCreateQuote, createQuoteAsAdmin, isOperator, toast, validationMessages]);

  const combinedCatalogError = catalogError;

  return (
    <div className="configurator-modular-page configurator-modular-page--with-overlay mx-auto w-full max-w-[1440px] px-10 py-8 pb-20 animate-fadeIn">
      {catalogLoading && (
        <div className="cfg-loading-overlay" role="status" aria-live="polite">
          Aggiornamento regole catalogo in corso...
        </div>
      )}

      <div className="section-eyebrow">Configuratore preventivi</div>
      <h1 className="section-title">Configuratore modulare</h1>
      <p className="section-lead">
        Seleziona prodotti singoli e bundle dal catalogo backend. Regole, dipendenze, inclusi e swap vengono ricalcolati in tempo reale dal tree.
      </p>

      <FadePresence show={!!combinedCatalogError} className="ui-presence--block">
        <div className="mb-4 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] text-danger">
          {combinedCatalogError}
        </div>
      </FadePresence>

      <div className="cfg-tabs">
        {areas.map((area) => (
          <button
            key={area.id}
            type="button"
            className={`cfg-tab ${area.id === currentArea?.id ? "is-active" : ""}`}
            onClick={() => setCurrentAreaId(area.id)}
          >
            <span className="cfg-tab__icon" aria-hidden>
              {renderCatalogIcon(area.icon, area.icon_name, "globe", "w-5 h-5")}
            </span>
            <span className="cfg-tab__name">{area.name}</span>
          </button>
        ))}
      </div>

      <div className="cfg-layout">
        <div className="cfg-palette">
          {catalogLoading && areas.length === 0 ? (
            <ConfiguratorAreaSkeleton />
          ) : (
            <div className="cfg-area-intro">
              <p>{currentArea?.desc ?? "Nessuna area disponibile"}</p>
              <FadePresence show={!!currentAreaWarning} className="ui-presence--block">
                <div className="cfg-section__composition-warning" style={{ marginTop: 8 }}>
                  {(currentAreaWarning?.message ?? "").split("\n").map((line, i) => (
                    <div key={i} className={i === 0 ? "cfg-section__composition-warning__title" : "cfg-section__composition-warning__detail"}>{line}</div>
                  ))}
                </div>
              </FadePresence>
            </div>
          )}

          {currentArea?.sections.map((section) => {
            const grouped = groupBoxesByFamily(section.boxes);
            const requirementState = validation.categoryRequirements.get(section.categoryId) ?? {
              required: section.required === true,
              satisfied: true,
              showBadge: false,
              hint: section.requiredHint ?? "",
            };
            const sectionWarning = validation.compositionWarnings.find((w) => w.sectionId === section.id);
            return (
              <CategorySection
                key={section.id}
                section={section}
                requirementState={requirementState}
                icon={renderCatalogIcon(section.icon, section.icon_name, "list", "w-4 h-4")}
                compositionWarning={sectionWarning?.message ?? null}
              >
                <div className="cfg-boxes">
                  {grouped.map((group) => {
                    if (group.kind === "family") {
                      const familyLocked = group.variants.every((variant) => !canSelectBox(variant.id));
                      const familyRequired = group.variants.some((variant) => (
                        (typeof variant.serviceId === "number" && rules.requiredServiceIds.has(variant.serviceId))
                        || rules.requiredCategoryIds.has(variant.categoryId)
                      ));
                      const prices = group.variants
                        .map((variant) => variant.price)
                        .filter((price): price is number => typeof price === "number");
                      const min = prices.length > 0 ? Math.min(...prices) : null;
                      const max = prices.length > 0 ? Math.max(...prices) : null;
                      const period = group.variants[0]?.period ?? "oneoff";

                      return (
                        <button
                          type="button"
                          key={group.familyId}
                          className={`cfg-box cfg-box--family ${familyLocked ? "is-locked" : ""} ${familyRequired ? "is-required" : ""}`}
                          onClick={() => !familyLocked && setPickerVariants(group.variants)}
                          disabled={familyLocked}
                        >
                          <div className="cfg-box__top">
                            <span className={`cfg-box__period-badge cfg-box__period-badge--${period}`}>
                              {period === "monthly" ? "M" : "·"}
                            </span>
                            <span className="cfg-box__family-badge">{group.variants.length} opzioni</span>
                          </div>
                          <div className="cfg-box__label">{group.familyLabel}</div>
                          {!!group.familyDesc && <div className="cfg-box__desc">{group.familyDesc}</div>}
                          {canViewCatalogPrices && (
                            <div className="cfg-box__price">
                              {min == null || max == null
                                ? "Prezzo non disponibile"
                                : (min === max ? `€${min}` : `€${min}–${max}`)}
                              {min != null && max != null && (
                                <small>{period === "monthly" ? "/mese" : "una tantum"} - scegli al click</small>
                              )}
                            </div>
                          )}
                        </button>
                      );
                    }

                    const isLockedByRules = !canSelectBox(group.box.id);
                    const isAdded = composition.some((entry) => entry.boxId === group.box.id);
                    const isRequired = (typeof group.box.serviceId === "number" && rules.requiredServiceIds.has(group.box.serviceId))
                      || rules.requiredCategoryIds.has(group.box.categoryId);
                    const isSelected = typeof group.box.serviceId === "number" && selectedServiceIds.includes(group.box.serviceId);
                    const badgeState = getProductBadgeState(group.box, isSelected);
                    const messages = Array.from(new Set(group.box.lockReasons ?? []));

                    return (
                      <ProductCard
                        key={group.box.id}
                        box={group.box}
                        isAdded={isAdded}
                        isRequired={isRequired}
                        isLocked={isLockedByRules}
                        showPrice={canViewCatalogPrices}
                        badgeState={badgeState}
                        lockMessage={messages[0]}
                        onDragStart={(event) => {
                          event.dataTransfer.setData("text/box-id", group.box.id);
                          event.dataTransfer.effectAllowed = "copy";
                        }}
                        onAdd={() => addBox(group.box.id)}
                      />
                    );
                  })}
                </div>
              </CategorySection>
            );
          })}
        </div>

        <aside
          className={`cfg-canvas ${dragOverCanvas ? "is-drag-over" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOverCanvas(true);
          }}
          onDragLeave={() => setDragOverCanvas(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOverCanvas(false);
            const boxId = event.dataTransfer.getData("text/box-id");
            if (boxId) addBox(boxId);
          }}
        >
          <div className="cfg-canvas__header">
            <div className="cfg-canvas__title">Composizione</div>
            <div className="cfg-canvas__count">{visibleComposition.length} {visibleComposition.length === 1 ? "voce" : "voci"}</div>
          </div>

          <div className="cfg-canvas__items">
            {visibleComposition.length === 0 ? (
              <div className="cfg-canvas__empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="4" y="4" width="6" height="6" rx="1" />
                  <rect x="14" y="4" width="6" height="6" rx="1" />
                  <rect x="4" y="14" width="6" height="6" rx="1" />
                  <rect x="14" y="14" width="6" height="6" rx="1" />
                </svg>
                <h3>Nessuna voce</h3>
                <p>Trascina o clicca le card dalla tavolozza per comporre il preventivo.</p>
              </div>
            ) : (
              visibleComposition.map((item) => {
                const violationMessages = rules.messagesByBoxId.get(item.boxId) ?? [];
                return (
                  <div key={item.boxId} className={`cfg-item ${violationMessages.length > 0 ? "is-invalid" : ""}`}>
                    <div className="cfg-item__main">
                      <div className="cfg-item__info">
                        <div className="cfg-item__name">
                          {item.box.label}
                          {item.box.isBundle ? " · Bundle" : ""}
                          {item.instances > 1 ? ` x ${item.instances}` : ""}
                        </div>
                        {canViewCatalogPrices && (
                          <div className="cfg-item__meta">
                            {typeof item.unitPrice === "number" ? (
                              <>
                                €{item.unitPrice}
                                {item.box.period === "monthly" ? "/mese" : " una tantum"}
                                {item.instances > 1 && typeof item.subtotal === "number" ? ` - totale €${item.subtotal}` : ""}
                              </>
                            ) : (
                              "Prezzo non disponibile"
                            )}
                          </div>
                        )}
                        {violationMessages.length > 0 && (
                          <div className="cfg-item__warning">{violationMessages.join(" · ")}</div>
                        )}
                      </div>

                      <div className="cfg-item__qty">
                        <button type="button" onClick={() => changeInstances(item.boxId, -1)}>−</button>
                        <span>{item.instances}</span>
                        <button type="button" onClick={() => changeInstances(item.boxId, +1)}>+</button>
                      </div>

                      <button type="button" className="cfg-item__remove" onClick={() => removeBox(item.boxId)} title="Rimuovi">×</button>
                    </div>

                    {item.box.isBundle && item.effectiveIncludes.length > 0 && (
                      <BundleCard
                        boxId={item.boxId}
                        includes={item.effectiveIncludes}
                        swapOptionsByGroup={rules.flatCatalog.swapOptionsByGroup}
                        selectedByGroup={bundleGroupSelections[item.boxId] ?? {}}
                        showPrice={canViewCatalogPrices}
                        onSwap={(includeId, optionId) => applySwap(item.boxId, includeId, optionId)}
                      />
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="cfg-totals">
            <FadePresence show={validationMessages.length > 0} className="ui-presence--block">
              <div className="cfg-validation">
                <Icon name="alert-triangle" className="w-4 h-4" />
                <div>
                  <b>Submit bloccato</b>
                  <div>{validationMessages.join(" · ")}</div>
                </div>
              </div>
            </FadePresence>

            <div className="cfg-controls">
              {isMenuArea ? (
                <div className="field" style={{ gridColumn: "span 2" }}>
                  <label>Durata bundle</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      className={`btn btn--sm ${menuBillingMode === "semestral" ? "btn--magenta" : "btn--ghost"}`}
                      onClick={() => setMenuBillingMode("semestral")}
                    >
                      Semestrale (6 mesi)
                    </button>
                    <button
                      type="button"
                      className={`btn btn--sm ${menuBillingMode === "annual" ? "btn--magenta" : "btn--ghost"}`}
                      onClick={() => setMenuBillingMode("annual")}
                    >
                      Annuale (12 mesi)
                    </button>
                  </div>
                </div>
              ) : (
                <div className="field">
                  <label>Mesi durata</label>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={24}
                    step={1}
                    value={months}
                    onChange={(event) => setMonths(Math.max(1, Math.min(24, Number(event.target.value) || 1)))}
                  />
                </div>
              )}

              {canViewCatalogPrices && (
                <div className="field">
                  <label>Sconto %</label>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={discountPct}
                    onChange={(event) => setDiscountPct(Math.max(0, Math.min(100, Number(event.target.value) || 0)))}
                  />
                </div>
              )}
            </div>

            {canViewCatalogPrices && compositionState.monthly > 0 && (
              <div className="cfg-totals__row">
                <span>Canone mensile</span>
                <b>€{compositionState.monthly.toFixed(0)}/mese</b>
              </div>
            )}
            {canViewCatalogPrices && compositionState.oneoff > 0 && (
              <div className="cfg-totals__row">
                <span>Una tantum</span>
                <b>€{compositionState.oneoff.toFixed(0)}</b>
              </div>
            )}
            {canViewCatalogPrices && compositionState.discount > 0 && (
              <div className="cfg-totals__row" style={{ color: "var(--ad-pink)" }}>
                <span>Sconto {discountPct}%</span>
                <b>-€{compositionState.discount.toFixed(0)}</b>
              </div>
            )}

            {canViewCatalogPrices && (
              <div className="cfg-totals__main">
                <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", color: "var(--ad-mute)", fontWeight: 700 }}>
                  Totale netto
                </span>
                <b>€{compositionState.net.toFixed(0)}</b>
              </div>
            )}

            <div className="cfg-actions">
              <button
                className="btn btn--magenta btn--lg"
                type="button"
                disabled={!canCreateQuote || isSubmitting}
                onClick={handleCreateQuote}
                title={!canCreateQuote ? validationMessages.join(" · ") : undefined}
              >
                {isSubmitting ? "Invio in corso..." : isOperator ? "Invia richiesta" : "Crea preventivo"}
              </button>
              <button className="btn btn--ghost btn--sm" type="button" onClick={resetAll}>
                Azzera composizione
              </button>
            </div>
          </div>
        </aside>
      </div>

      <ConfiguratorDialog
        open={submitModalOpen && isOperator}
        title="Invia richiesta"
        subtitle="Compila i dati. Il cliente e obbligatorio."
        maxWidth={640}
        disableClose={isSubmitting}
        onClose={() => {
          if (isSubmitting) return;
          setSubmitModalOpen(false);
        }}
        footer={(
          <>
            <Button variant="ghost" size="sm" type="button" disabled={isSubmitting} onClick={() => setSubmitModalOpen(false)}>
              Annulla
            </Button>
            <Button variant="primary" type="button" loading={isSubmitting} onClick={submitOperatorRequest}>
              Invia richiesta
            </Button>
          </>
        )}
      >
        <div className="cfg-modal-stack">
          <div className="field">
            <label>Cliente *</label>
            <div className="cfg-modal-client-row">
              <SearchableSelect
                className="cfg-modal-client-select"
                value={operatorForm.clientId != null ? String(operatorForm.clientId) : ""}
                placeholder="- Seleziona cliente esistente -"
                searchPlaceholder="Cerca cliente..."
                emptyMessage="Nessun cliente trovato"
                menuPlacement="bottom"
                menuLayer="portal"
                disabled={operatorForm.createNewClient || clientsLoading || isSubmitting}
                onChange={(raw) => {
                  setOperatorForm((prev) => ({ ...prev, clientId: raw ? Number(raw) : null }));
                }}
                options={clients.map((client) => ({
                  value: String(client.id),
                  label: `${client.name}${client.vat ? ` - P.IVA ${client.vat}` : ""}`,
                  keywords: `${client.name} ${client.vat ?? ""} ${client.contact ?? ""} ${client.email ?? ""}`,
                }))}
              />
              <button
                type="button"
                title={operatorForm.createNewClient ? "Annulla nuovo cliente" : "Crea nuovo cliente"}
                className="cfg-modal-client-toggle"
                disabled={isSubmitting}
                onClick={() => setOperatorForm((prev) => ({
                  ...prev,
                  createNewClient: !prev.createNewClient,
                  clientId: prev.createNewClient ? prev.clientId : null,
                }))}
              >
                <Icon name={operatorForm.createNewClient ? "x" : "plus"} className="w-4 h-4" />
              </button>
            </div>
          </div>

          {operatorForm.createNewClient && (
            <div className="cfg-modal-card">
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", color: "var(--ad-mute)", fontWeight: 700, marginBottom: 10 }}>
                Nuovo cliente (verra salvato in anagrafica)
              </div>
              <div className="field cfg-modal-field-gap">
                <label>Nome / Ragione sociale *</label>
                <input className="input" value={operatorForm.newClientName} disabled={isSubmitting} onChange={(event) => setOperatorForm((prev) => ({ ...prev, newClientName: event.target.value }))} />
              </div>
              <div className="field cfg-modal-field-gap">
                <label>Persona di riferimento</label>
                <input className="input" value={operatorForm.newClientContact} disabled={isSubmitting} onChange={(event) => setOperatorForm((prev) => ({ ...prev, newClientContact: event.target.value }))} />
              </div>
              <div className="cfg-modal-grid-2">
                <div className="field">
                  <label>P. IVA</label>
                  <input className="input" value={operatorForm.newClientVat} disabled={isSubmitting} maxLength={11} onChange={(event) => setOperatorForm((prev) => ({ ...prev, newClientVat: event.target.value }))} />
                </div>
                <div className="field">
                  <label>Email</label>
                  <input className="input" type="email" value={operatorForm.newClientEmail} disabled={isSubmitting} onChange={(event) => setOperatorForm((prev) => ({ ...prev, newClientEmail: event.target.value }))} />
                </div>
              </div>
            </div>
          )}

          <div className="field">
            <label>Riferimento / titolo richiesta</label>
            <input className="input" maxLength={120} value={operatorForm.title} disabled={isSubmitting} onChange={(event) => setOperatorForm((prev) => ({ ...prev, title: event.target.value }))} />
          </div>

          <div className="field">
            <label>Note per l'admin (opzionale)</label>
            <Textarea className="input cfg-modal-textarea" rows={3} value={operatorForm.notes} disabled={isSubmitting} onChange={(event) => setOperatorForm((prev) => ({ ...prev, notes: event.target.value }))} />
          </div>
        </div>
      </ConfiguratorDialog>

      <ConfiguratorDialog
        open={!!pickerVariants}
        title={pickerVariants?.[0]?.familyLabel || "Varianti"}
        subtitle="Scegli la variante da aggiungere"
        maxWidth={520}
        onClose={() => setPickerVariants(null)}
      >
        <div className="cfg-family-picker__list">
          {pickerVariants?.map((variant) => {
            const disabled = !canSelectBox(variant.id);
            const messages = variant.lockReasons ?? [];
            return (
              <button
                key={variant.id}
                type="button"
                className={`cfg-variant ${disabled ? "is-locked" : ""}`}
                disabled={disabled}
                onClick={() => {
                  addBox(variant.id);
                  setPickerVariants(null);
                }}
              >
                <div>
                  <div className="cfg-variant__label">{variant.variantLabel || variant.label}</div>
                  {!!variant.desc && <div className="cfg-variant__desc">{variant.desc}</div>}
                  {messages.length > 0 && <div className="cfg-box__warning">{messages[0]}</div>}
                </div>
                {canViewCatalogPrices && (
                  <div className="cfg-variant__price">
                    {typeof variant.price === "number" ? (
                      <>
                        €{variant.price}
                        <small>{variant.period === "monthly" ? "/mese" : "una tantum"}</small>
                      </>
                    ) : (
                      "Prezzo non disponibile"
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </ConfiguratorDialog>
    </div>
  );
}
