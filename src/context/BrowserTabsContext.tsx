import React, { createContext, useCallback, useContext, useState } from "react";
import { hostLabel } from "../utils/quickLinks";

/** Una scheda aperta nel browser interno (stato solo in memoria, per sessione). */
export interface BrowserTab {
  id: string;
  url: string;
  title: string;
}

interface BrowserTabsContextValue {
  tabs: BrowserTab[];
  activeId: string | null;
  /** Apre una scheda (o riattiva quella con la stessa url) e la rende attiva. */
  openTab: (url: string, title?: string) => void;
  closeTab: (id: string) => void;
  setActive: (id: string) => void;
}

const BrowserTabsContext = createContext<BrowserTabsContextValue | null>(null);

function makeId(): string {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function BrowserTabsProvider({ children }: { children: React.ReactNode }) {
  const [tabs, setTabs] = useState<BrowserTab[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const openTab = useCallback(
    (url: string, title?: string) => {
      const existing = tabs.find((t) => t.url === url);
      if (existing) {
        setActiveId(existing.id);
        return;
      }
      const tab: BrowserTab = { id: makeId(), url, title: title?.trim() || hostLabel(url) };
      setTabs((prev) => [...prev, tab]);
      setActiveId(tab.id);
    },
    [tabs],
  );

  const closeTab = useCallback(
    (id: string) => {
      const idx = tabs.findIndex((t) => t.id === id);
      if (idx === -1) return;
      const next = tabs.filter((t) => t.id !== id);
      setTabs(next);
      // Se chiudo la scheda attiva, sposto l'attivo su una scheda vicina.
      if (activeId === id) {
        setActiveId(next.length === 0 ? null : next[Math.min(idx, next.length - 1)].id);
      }
    },
    [tabs, activeId],
  );

  const setActive = useCallback((id: string) => setActiveId(id), []);

  return (
    <BrowserTabsContext.Provider value={{ tabs, activeId, openTab, closeTab, setActive }}>
      {children}
    </BrowserTabsContext.Provider>
  );
}

export function useBrowserTabs(): BrowserTabsContextValue {
  const ctx = useContext(BrowserTabsContext);
  if (!ctx) throw new Error("useBrowserTabs must be used inside BrowserTabsProvider");
  return ctx;
}
