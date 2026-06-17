import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import type { SocialPackageBadge, SocialPackageBadgeItem, SocialPackageSection } from "../../api/socialPackages";

interface SocialPackageStructureEditorProps {
  packageId: number | null;
  sections: SocialPackageSection[];
  onCreateSection: () => void;
  onEditSection: (section: SocialPackageSection) => void;
  onDeleteSection: (section: SocialPackageSection) => void;
  onCreateBadge: (section: SocialPackageSection) => void;
  onEditBadge: (section: SocialPackageSection, badge: SocialPackageBadge) => void;
  onDeleteBadge: (section: SocialPackageSection, badge: SocialPackageBadge) => void;
  onCreateItem: (section: SocialPackageSection, badge: SocialPackageBadge) => void;
  onEditItem: (section: SocialPackageSection, badge: SocialPackageBadge, item: SocialPackageBadgeItem) => void;
  onDeleteItem: (section: SocialPackageSection, badge: SocialPackageBadge, item: SocialPackageBadgeItem) => void;
}

export function SocialPackageStructureEditor({
  packageId,
  sections,
  onCreateSection,
  onEditSection,
  onDeleteSection,
  onCreateBadge,
  onEditBadge,
  onDeleteBadge,
  onCreateItem,
  onEditItem,
  onDeleteItem,
}: SocialPackageStructureEditorProps) {
  const safeSections = sections ?? [];

  return (
    <div className="grid gap-4 rounded-2xl border border-line dark:border-[#2a2a2e] bg-paper dark:bg-[#131316] p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-line dark:border-[#2a2a2e] pb-4">
        <div>
          <h3 className="font-display text-lg font-bold tracking-tight text-ink dark:text-paper">Sezioni, badge e bullet</h3>
          <p className="text-sm text-muted dark:text-[#b0b0b7]">
            Gestione granulare della gerarchia social del pacchetto.
          </p>
        </div>
        <Button variant="secondary" leftIcon={<Icon name="plus" className="w-4 h-4" />} onClick={onCreateSection} disabled={!packageId}>
          Sezione
        </Button>
      </div>

      {!packageId ? (
        <div className="rounded-xl border border-dashed border-line dark:border-[#2a2a2e] bg-cream/30 dark:bg-[#1c1c20] px-4 py-6 text-sm text-muted dark:text-[#b0b0b7]">
          Salva prima il pacchetto per aggiungere sezioni, badge e contenuti annidati.
        </div>
      ) : safeSections.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line dark:border-[#2a2a2e] bg-cream/30 dark:bg-[#1c1c20] px-4 py-6 text-sm text-muted dark:text-[#b0b0b7]">
          Nessuna sezione definita. Crea la prima sezione per iniziare a comporre il pacchetto.
        </div>
      ) : (
        <div className="grid gap-4">
          {safeSections.map((section) => {
            const safeBadges = section.badges ?? [];

            return (
              <section key={section.id} className="rounded-2xl border border-line dark:border-[#2a2a2e] bg-paper dark:bg-[#141419] shadow-sm overflow-hidden">
              <div className="flex items-start justify-between gap-4 border-b border-line dark:border-[#2a2a2e] px-4 py-4 bg-cream/20 dark:bg-[#17171c]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-display text-base font-bold tracking-tight text-ink dark:text-paper">{section.title}</h4>
                    <Badge variant={section.is_active ? "success" : "default"}>{section.is_active ? "Attiva" : "Disattiva"}</Badge>
                    <Badge variant="info">{safeBadges.length} badge</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted dark:text-[#b0b0b7]">
                    {section.description || `Slug: ${section.slug}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" leftIcon={<Icon name="plus" className="w-4 h-4" />} onClick={() => onCreateBadge(section)}>
                    Badge
                  </Button>
                  <Button variant="ghost" size="sm" leftIcon={<Icon name="pencil" className="w-4 h-4" />} onClick={() => onEditSection(section)}>
                    Modifica
                  </Button>
                  <Button variant="ghost" size="sm" leftIcon={<Icon name="trash" className="w-4 h-4" />} onClick={() => onDeleteSection(section)}>
                    Elimina
                  </Button>
                </div>
              </div>

              <div className="p-4 bg-paper dark:bg-[#141419]">
                {safeBadges.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-line dark:border-[#2a2a2e] bg-cream/20 dark:bg-[#1c1c20] px-4 py-5 text-sm text-muted dark:text-[#b0b0b7]">
                    Nessun badge in questa sezione.
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {safeBadges.map((badge) => {
                      const safeItems = badge.items ?? [];

                      return (
                        <article key={badge.id} className="rounded-xl border border-line dark:border-[#2a2a2e] bg-cream/20 dark:bg-[#1a1a1f] p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h5 className="font-display text-sm font-bold tracking-tight text-ink dark:text-paper">{badge.title}</h5>
                              <Badge variant={badge.is_active ? "success" : "default"}>{badge.is_active ? "Attivo" : "Disattivo"}</Badge>
                              {badge.color && (
                                <Badge variant="warning">{badge.color}</Badge>
                              )}
                              <Badge variant="info">{safeItems.length} bullet</Badge>
                            </div>
                            <p className="mt-1 text-xs text-muted dark:text-[#b0b0b7]">
                              {badge.description || `Slug: ${badge.slug}`}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button variant="ghost" size="sm" leftIcon={<Icon name="plus" className="w-4 h-4" />} onClick={() => onCreateItem(section, badge)}>
                              Item
                            </Button>
                            <Button variant="ghost" size="sm" leftIcon={<Icon name="pencil" className="w-4 h-4" />} onClick={() => onEditBadge(section, badge)}>
                              Modifica
                            </Button>
                            <Button variant="ghost" size="sm" leftIcon={<Icon name="trash" className="w-4 h-4" />} onClick={() => onDeleteBadge(section, badge)}>
                              Elimina
                            </Button>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-2">
                          {safeItems.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-line dark:border-[#2a2a2e] bg-paper/70 dark:bg-[#141419] px-3 py-3 text-xs text-muted dark:text-[#b0b0b7]">
                              Nessun bullet item.
                            </div>
                          ) : (
                            safeItems.map((item) => (
                              <div
                                key={item.id}
                                className="flex flex-col gap-3 rounded-lg border border-line dark:border-[#2a2a2e] bg-paper dark:bg-[#141419] px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                              >
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-semibold text-ink dark:text-paper">{item.title}</span>
                                    <Badge variant={item.is_active ? "success" : "default"}>{item.is_active ? "Attivo" : "Disattivo"}</Badge>
                                  </div>
                                  {item.description && (
                                    <p className="mt-1 text-xs text-muted dark:text-[#b0b0b7]">{item.description}</p>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 self-start sm:self-auto">
                                  <Button variant="ghost" size="sm" leftIcon={<Icon name="pencil" className="w-4 h-4" />} onClick={() => onEditItem(section, badge, item)}>
                                    Modifica
                                  </Button>
                                  <Button variant="ghost" size="sm" leftIcon={<Icon name="trash" className="w-4 h-4" />} onClick={() => onDeleteItem(section, badge, item)}>
                                    Elimina
                                  </Button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
            );
          })}
        </div>
      )}

      <div className="rounded-xl border border-line dark:border-[#2a2a2e] bg-cream/40 dark:bg-[#1c1c20] px-4 py-3 text-xs text-muted dark:text-[#b0b0b7]">
        Le righe catalogo collegate sono gestite in una scheda separata, così la gerarchia editoriale resta pulita e modificabile senza ricaricare la pagina.
      </div>
    </div>
  );
}
