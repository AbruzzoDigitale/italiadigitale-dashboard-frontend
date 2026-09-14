import { useState } from "react";
import { useBrowserTabs } from "../context/BrowserTabsContext";
import { faviconFor, hostLabel, isEmbeddableUrl, normalizeUrl, toEmbedUrl } from "../utils/quickLinks";
import { Icon } from "../components/ui/Icon";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";

/**
 * Browser interno a schede. Le schede vivono nel BrowserTabsContext (condiviso con la
 * barra collegamenti rapidi della navbar). Ogni scheda è un iframe; poiché molti siti
 * bloccano l'incorporamento (X-Frame-Options / CSP) e non è rilevabile in modo
 * affidabile, mostriamo SEMPRE il bottone "Apri in nuova scheda" come via d'uscita.
 */
export function BrowserPage() {
  const { tabs, activeId, openTab, closeTab, setActive } = useBrowserTabs();
  const [urlDraft, setUrlDraft] = useState("");
  const [showUrlBar, setShowUrlBar] = useState(false);

  const activeTab = tabs.find((t) => t.id === activeId) ?? null;

  const submitUrl = (e: React.FormEvent) => {
    e.preventDefault();
    const url = urlDraft.trim();
    if (!url) return;
    openTab(normalizeUrl(url));
    setUrlDraft("");
    setShowUrlBar(false);
  };

  return (
    <div className="flex h-full flex-col bg-cream dark:bg-ink">
      {/* ── Barra schede ─────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-line bg-paper px-2 py-1.5 dark:border-[#2a2a2e] dark:bg-[#131316]">
        <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {tabs.map((tab) => {
            const isActive = tab.id === activeId;
            return (
              <div
                key={tab.id}
                onClick={() => setActive(tab.id)}
                className={`group flex flex-shrink-0 cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] font-semibold transition-colors ${
                  isActive
                    ? "bg-cream text-ink dark:bg-[#1c1c20] dark:text-[#f4f4f7]"
                    : "text-muted hover:bg-cream dark:text-[#9999a0] dark:hover:bg-[#1c1c20]"
                }`}
              >
                <img src={faviconFor(tab)} alt="" className="h-4 w-4 flex-shrink-0 rounded-sm" />
                <span className="max-w-[160px] truncate">{tab.title}</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                  className="grid h-4 w-4 flex-shrink-0 place-items-center rounded text-muted transition-colors hover:text-danger dark:text-[#9999a0]"
                  aria-label={`Chiudi ${tab.title}`}
                  title="Chiudi scheda"
                >
                  <Icon name="x" className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setShowUrlBar((v) => !v)}
          title="Nuova scheda"
          aria-label="Nuova scheda"
          className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-md border border-line text-ink transition-colors hover:bg-cream dark:border-[#2a2a2e] dark:text-[#f4f4f7] dark:hover:bg-[#1c1c20]"
        >
          <Icon name="plus" className="h-4 w-4" />
        </button>
      </div>

      {/* ── Barra URL (nuova scheda manuale) ─────────────────── */}
      {showUrlBar && (
        <form
          onSubmit={submitUrl}
          className="flex items-center gap-2 border-b border-line bg-paper px-3 py-2 dark:border-[#2a2a2e] dark:bg-[#131316]"
        >
          <div className="flex-1">
            <Input
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              placeholder="Incolla un indirizzo, es. esempio.com"
              autoFocus
            />
          </div>
          <Button type="submit" size="sm" variant="secondary">Vai</Button>
        </form>
      )}

      {/* ── Contenuto ────────────────────────────────────────── */}
      {activeTab ? (
        isEmbeddableUrl(toEmbedUrl(activeTab.url)) ? (
          <div className="flex min-h-0 flex-1 flex-col">
            {/* Avviso fallback: sempre visibile, alcuni siti possono comunque bloccare l'iframe. */}
            <div className="flex items-center justify-between gap-3 border-b border-line bg-cream px-3 py-2 text-[12px] text-muted dark:border-[#2a2a2e] dark:bg-[#131316] dark:text-[#9999a0]">
              <span className="flex min-w-0 items-center gap-2">
                <Icon name="info" className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">Il sito non si vede? Alcuni siti ne bloccano l'apertura qui dentro.</span>
              </span>
              <button
                type="button"
                onClick={() => window.open(normalizeUrl(activeTab.url), "_blank", "noopener")}
                className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-pill border border-line bg-paper px-2.5 py-1 text-[11px] font-semibold text-ink transition-colors hover:bg-cream dark:border-[#2a2a2e] dark:bg-[#1c1c20] dark:text-[#f4f4f7] dark:hover:bg-[#252529]"
              >
                <Icon name="upload" className="h-3.5 w-3.5" />
                Apri in nuova scheda
              </button>
            </div>
            <iframe
              key={activeTab.id}
              src={toEmbedUrl(activeTab.url)}
              title={activeTab.title}
              className="min-h-0 w-full flex-1 border-0 bg-white"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-presentation"
            />
          </div>
        ) : (
          // Sito che blocca l'incorporamento: card pulita, niente pagina bianca.
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
            <img src={faviconFor(activeTab)} alt="" className="h-12 w-12 rounded-md" />
            <div>
              <p className="font-display text-[17px] font-bold tracking-tight text-ink dark:text-[#f4f4f7]">
                {activeTab.title || hostLabel(activeTab.url)}
              </p>
              <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted dark:text-[#9999a0]">
                Questo sito non consente di essere mostrato dentro il gestionale. Aprilo in una nuova scheda del browser.
              </p>
            </div>
            <Button
              variant="primary"
              onClick={() => window.open(normalizeUrl(activeTab.url), "_blank", "noopener")}
              leftIcon={<Icon name="upload" className="h-4 w-4" />}
            >
              Apri in nuova scheda
            </Button>
          </div>
        )
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-paper text-muted dark:bg-[#1c1c20] dark:text-[#9999a0]">
            <Icon name="globe" className="h-7 w-7" />
          </div>
          <p className="font-display text-[17px] font-bold tracking-tight text-ink dark:text-[#f4f4f7]">
            Nessuna scheda aperta
          </p>
          <p className="max-w-sm text-[13px] text-muted dark:text-[#9999a0]">
            Aggiungi collegamenti rapidi dal tuo profilo, poi aprili nel gestionale — oppure usa il
            pulsante "+" qui sopra per digitare un indirizzo.
          </p>
        </div>
      )}
    </div>
  );
}
