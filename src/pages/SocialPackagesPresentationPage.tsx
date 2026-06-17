import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { listSocialPackagesApi, getSocialPackageApi, type SocialPackageDetail } from "../api/socialPackages";
import { formatCurrency } from "../features/social-packages/draft";
import { useCreateQuoteFromConfigurator } from "../hooks/useCreateQuoteFromConfigurator";
import { Spinner } from "../components/ui/Spinner";
import { Textarea } from "../components/ui/Textarea";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../context/ToastContext";
import "./SocialPackagesPresentationPage.css";

type Accent = "visibility" | "growth" | "evolution";

interface SocialPresentationPackage {
  id: number;
  title: string;
  description: string | null;
  base_price: number | null;
  currency: string;
  billing_period: "oneoff" | "monthly" | "yearly" | null;
  price_badge: string | null;
  included: string[];
  monthly: string[];
  accent: Accent;
}

function accentFromPackage(item: SocialPackageDetail, index: number): Accent {
  const slug = (item.slug || "").toLowerCase();
  const title = (item.title || "").toLowerCase();
  if (slug.includes("visibil") || title.includes("visibil")) return "visibility";
  if (slug.includes("crescit") || title.includes("crescit")) return "growth";
  if (slug.includes("evoluz") || title.includes("evoluz")) return "evolution";
  return (["visibility", "growth", "evolution"] as Accent[])[index % 3];
}

function periodLabel(period: SocialPresentationPackage["billing_period"]) {
  if (period === "monthly") return "al mese";
  if (period === "yearly") return "all'anno";
  return "una tantum";
}

function titleFallback(sectionTitle: string, tone: string | null) {
  const toneValue = (tone || "").toLowerCase();
  if (toneValue === "included") return "included";
  if (toneValue === "monthly") return "monthly";
  const lowered = sectionTitle.toLowerCase();
  if (lowered.includes("inclus")) return "included";
  if (lowered.includes("mese") || lowered.includes("mens")) return "monthly";
  return "other";
}

function toPresentationPackage(item: SocialPackageDetail, index: number): SocialPresentationPackage {
  const included: string[] = [];
  const monthly: string[] = [];

  item.sections
    .filter((section) => section.is_active !== false)
    .forEach((section) => {
      section.badges
        .filter((badge) => badge.is_active !== false)
        .forEach((badge) => {
          const bucket = titleFallback(section.title, badge.tone ?? null);
          badge.items
            .filter((entry) => entry.is_active !== false)
            .forEach((entry) => {
              const text = entry.title?.trim();
              if (!text) return;
              if (bucket === "included") included.push(text);
              else if (bucket === "monthly") monthly.push(text);
            });
        });
    });

  if (included.length === 0 && monthly.length === 0) {
    const fallbackItems = item.sections
      .flatMap((section) => section.badges)
      .flatMap((badge) => badge.items)
      .filter((entry) => entry.is_active !== false)
      .map((entry) => entry.title?.trim())
      .filter((entry): entry is string => Boolean(entry));
    fallbackItems.forEach((entry, i) => {
      if (i % 2 === 0) included.push(entry);
      else monthly.push(entry);
    });
  }

  return {
    id: item.id,
    title: item.title,
    description: item.description,
    base_price: item.base_price,
    currency: item.currency,
    billing_period: item.billing_period,
    price_badge: item.price_badge,
    included,
    monthly,
    accent: accentFromPackage(item, index),
  };
}

export function SocialPackagesPresentationPage() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [packages, setPackages] = useState<SocialPresentationPackage[]>([]);

  // Configuratore state
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [months, setMonths] = useState(6);
  const [billing, setBilling] = useState<"mensile" | "semestrale" | "annuale">("mensile");
  const [discountPct, setDiscountPct] = useState(0);
  const [discountEur, setDiscountEur] = useState(0);
  const [notes, setNotes] = useState("");
  const { createQuote, isSubmitting: creating } = useCreateQuoteFromConfigurator();
  const configRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const list = await listSocialPackagesApi({
          company_id: user?.company_id ?? undefined,
          include_inactive: true,
        });
        const active = list.filter((item) => item.is_active);
        const detailed = await Promise.all(active.map((item) => getSocialPackageApi(item.id)));
        if (!cancelled) {
          setPackages(detailed.map((item, index) => toPresentationPackage(item, index)));
        }
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : "Errore caricamento pacchetti attivi");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [toast, user?.company_id]);

  const orderedPackages = useMemo(
    () => [...packages].sort((a, b) => (a.base_price ?? 0) - (b.base_price ?? 0)),
    [packages]
  );

  const selectedPack = useMemo(
    () => orderedPackages.find((p) => p.id === selectedId) ?? null,
    [orderedPackages, selectedId]
  );

  // Totali identici al prototipo
  const STRATEGY_PRICE = 500;
  const META_BM_PRICE = 250;
  const baseTotal = (selectedPack?.base_price ?? 0) * months;
  const subtotal = baseTotal + STRATEGY_PRICE;
  const discountAmount = subtotal * (discountPct / 100) + discountEur;
  const total = Math.max(0, subtotal - discountAmount);

  function selectPack(id: number) {
    setSelectedId(id);
    setMonths(6);
    setDiscountPct(0);
    setDiscountEur(0);
    setNotes("");
    setTimeout(() => configRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }

  async function generateQuote() {
    if (!selectedPack) return;
    try {
      const quote = await createQuote({
        notes: notes || null,
        discount_pct: discountPct,
        discount_eur: discountEur,
        company_id: user?.company_id ?? null,
        tag: `Pacchetto ${selectedPack.title} · ${months} mesi`,
        configurator: {
          type: "social_pack",
          pack_id: selectedPack.id,
          pack_title: selectedPack.title,
          months,
          billing,
        },
        lines: [
          {
            name: `${selectedPack.title} × ${months} mesi`,
            net: selectedPack.base_price ?? 0,
            quantity: months,
            period: "monthly",
            category: "Social Media",
          },
          {
            name: "Strategia social media (una tantum)",
            net: STRATEGY_PRICE,
            quantity: 1,
            period: "oneoff",
            category: "Social Media",
          },
          {
            name: "Config. Meta Business Manager",
            net: META_BM_PRICE,
            quantity: 1,
            period: "oneoff",
            category: "Social Media",
            discountPct: 100,
            autoAdded: true,
          },
        ],
      });
      const nextSearch = new URLSearchParams(location.search);
      nextSearch.set("quote_id", String(quote.id));
      navigate({ pathname: "/preventivo", search: `?${nextSearch.toString()}` }, { state: { quoteId: quote.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nella creazione preventivo");
    }
  }

  return (
    <div className="social-presentation-page">

      {/* ── Hero scuro ── */}
      <div className="social-hero-section">
        <div className="social-hero__title">Pacchetti Social Media</div>
        <div className="social-hero__sub">
          <strong>Durata minima: 6 mesi</strong> · IVA esclusa
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Spinner size="lg" />
          </div>
        ) : orderedPackages.length === 0 ? (
          <div className="social-presentation-empty">Nessun pacchetto attivo disponibile per questa azienda.</div>
        ) : (
          <section className="social-hero__deck">
            {orderedPackages.map((item) => (
              <article
                key={item.id}
                className={`social-pack social-pack--${item.accent}${selectedId === item.id ? " is-selected" : ""}`}
                onClick={() => selectPack(item.id)}
              >
                <h2 className="social-pack__name">{item.title}</h2>
                <p className="social-pack__desc">{item.description || "Pacchetto social personalizzato per la crescita del brand."}</p>

                <div className="social-pack__group-title">Incluso per te:</div>
                <ul className="social-pack__list">
                  {(item.included.length ? item.included : ["Definizione strategica iniziale"]).map((row, idx) => (
                    <li key={`${item.id}-inc-${idx}`}>{row}</li>
                  ))}
                </ul>

                <div className="social-pack__group-title">Cosa realizziamo ogni mese:</div>
                <ul className="social-pack__list">
                  {(item.monthly.length ? item.monthly : ["Produzione contenuti ricorrenti"]).map((row, idx) => (
                    <li key={`${item.id}-mon-${idx}`}>{row}</li>
                  ))}
                </ul>

                <div className="social-pack__price">
                  {formatCurrency(item.base_price, item.currency)}
                  <small>{periodLabel(item.billing_period)}</small>
                  {item.price_badge && <div className="social-pack__badge">{item.price_badge}</div>}
                </div>
              </article>
            ))}
          </section>
        )}
      </div>

      {/* ── Configuratore (visibile solo dopo selezione) ── */}
      {selectedPack && (
        <div className="pack-config-block configurator-modular-page" ref={configRef}>
          <h2 className="pack-config-block__title">Configura: {selectedPack.title}</h2>

          <div className="cfg-layout">
            {/* ── Left: form ── */}
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

              <div className="field">
                <label>Fatturazione</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {(["mensile", "semestrale", "annuale"] as const).map((b) => (
                    <button
                      key={b}
                      type="button"
                      className={`btn btn--sm ${billing === b ? "btn--magenta" : "btn--ghost"}`}
                      onClick={() => setBilling(b)}
                    >
                      {b.charAt(0).toUpperCase() + b.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="field">
                <label>Durata (mesi)</label>
                <input
                  type="number"
                  className="input"
                  min={6}
                  max={36}
                  value={months}
                  onChange={(e) => setMonths(Math.max(6, parseInt(e.target.value) || 6))}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div className="field">
                  <label>Sconto %</label>
                  <input
                    type="number"
                    className="input"
                    min={0}
                    max={100}
                    step={0.5}
                    value={discountPct}
                    onChange={(e) => setDiscountPct(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))}
                  />
                </div>
                <div className="field">
                  <label>Sconto €</label>
                  <input
                    type="number"
                    className="input"
                    min={0}
                    step={10}
                    value={discountEur}
                    onChange={(e) => setDiscountEur(Math.max(0, parseFloat(e.target.value) || 0))}
                  />
                </div>
              </div>

              <div className="field">
                <label>Note per il preventivo</label>
                <Textarea
                  className="input cfg-modal-textarea"
                  rows={3}
                  placeholder="Eventuali note da includere nel preventivo..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

            </div>

            {/* ── Right: riepilogo sticky (identico a Composizione) ── */}
            <div className="cfg-canvas">
              <div className="cfg-canvas__header">
                <div className="cfg-canvas__title">Riepilogo</div>
                <div className="cfg-canvas__count">{months} mesi</div>
              </div>

              <div className="cfg-canvas__items">
                <div className="cfg-item">
                  <div className="cfg-item__main">
                    <div className="cfg-item__info">
                      <span className="cfg-item__name">{selectedPack.title} × {months} mesi</span>
                      <span className="cfg-item__meta">mensile · social media</span>
                    </div>
                    <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                      {formatCurrency(baseTotal, selectedPack.currency)}
                    </span>
                  </div>
                </div>
                <div className="cfg-item">
                  <div className="cfg-item__main">
                    <div className="cfg-item__info">
                      <span className="cfg-item__name">Strategia social media</span>
                      <span className="cfg-item__meta">una tantum</span>
                    </div>
                    <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                      {formatCurrency(STRATEGY_PRICE, selectedPack.currency)}
                    </span>
                  </div>
                </div>
                <div className="cfg-item" style={{ opacity: 0.6 }}>
                  <div className="cfg-item__main">
                    <div className="cfg-item__info">
                      <span className="cfg-item__name">Config. Meta Business Manager</span>
                      <span className="cfg-item__meta">
                        una tantum ·{" "}
                        <span style={{ color: "var(--ad-info)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>incluso</span>
                      </span>
                    </div>
                    <span style={{ textDecoration: "line-through", fontVariantNumeric: "tabular-nums" }}>
                      {formatCurrency(META_BM_PRICE, selectedPack.currency)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="cfg-totals">
                {discountAmount > 0 && (
                  <div className="cfg-totals__row" style={{ color: "var(--ad-pink)" }}>
                    <span>Sconto applicato</span>
                    <span>−{formatCurrency(discountAmount, selectedPack.currency)}</span>
                  </div>
                )}
                <div className="cfg-totals__main">
                  <span>Totale</span>
                  <b>{formatCurrency(total, selectedPack.currency)}</b>
                </div>
              </div>

              <div className="cfg-actions">
                <button
                  className="btn btn--magenta btn--lg"
                  onClick={generateQuote}
                  disabled={creating}
                >
                  {creating ? "Creazione..." : "Genera Preventivo →"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
