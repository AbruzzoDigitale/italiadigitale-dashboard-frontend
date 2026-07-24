import React, { createContext, useContext, useState, useEffect, useRef } from "react";

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  /** `origin` = punto di partenza del reveal circolare (di norma le coordinate del click). */
  toggleTheme: (origin?: { x: number; y: number }) => void;
}

type DocumentWithViewTransition = Document & {
  startViewTransition?: (callback: () => void) => { finished: Promise<void> };
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem("app_theme") as Theme) ?? "light";
  });
  // Tema "effettivo" (classe .dark applicata): durante il reveal lo stato React
  // resta indietro di proposito, quindi i toggle rapidi si basano su questo ref.
  const effectiveTheme = useRef<Theme>(theme);

  useEffect(() => {
    effectiveTheme.current = theme;
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("app_theme", theme);
  }, [theme]);

  const toggleTheme = (origin?: { x: number; y: number }) => {
    const next: Theme = effectiveTheme.current === "light" ? "dark" : "light";
    effectiveTheme.current = next;
    const root = document.documentElement;
    const doc = document as DocumentWithViewTransition;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    // Fallback: niente View Transitions API o reduced-motion → cambio istantaneo.
    if (typeof doc.startViewTransition !== "function" || reducedMotion) {
      setTheme(next);
      return;
    }

    // Origine + raggio del reveal circolare (copre lo schermo dal punto di click).
    const x = origin?.x ?? window.innerWidth / 2;
    const y = origin?.y ?? window.innerHeight / 2;
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    root.style.setProperty("--vt-x", `${x}px`);
    root.style.setProperty("--vt-y", `${y}px`);
    root.style.setProperty("--vt-r", `${radius}px`);

    // Sospendi le transition CSS per-elemento (transition-colors & co.) finché dura
    // il reveal: lo snapshot "new" deve nascere già completamente nel tema nuovo,
    // altrimenti il cerchio rivela contenuto ancora in dissolvenza (wipe debole e scattoso).
    root.classList.add("vt-theme-switch");

    // Dentro la transizione SOLO il flip della classe .dark: è puro CSS e lo
    // snapshot "new" è pronto in un frame. La ri-renderizzata React (layout,
    // pagina, grafici…) è pesante e, se eseguita qui dentro o durante il reveal,
    // blocca il main thread: l'animazione va a tempo reale, i frame saltano e il
    // cerchio "teletrasporta" invece di partire dal bottone. Quindi lo stato
    // React si aggiorna a reveal concluso.
    const transition = doc.startViewTransition!(() => {
      root.classList.toggle("dark", next === "dark");
    });
    transition.finished.finally(() => {
      root.classList.remove("vt-theme-switch");
      setTheme(next);
    });
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
