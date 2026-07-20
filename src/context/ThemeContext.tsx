import React, { createContext, useContext, useState, useEffect } from "react";
import { flushSync } from "react-dom";

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

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("app_theme", theme);
  }, [theme]);

  const toggleTheme = (origin?: { x: number; y: number }) => {
    const next: Theme = theme === "light" ? "dark" : "light";
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

    doc.startViewTransition!(() => {
      // Aggiorna lo stato React e applica subito la classe .dark, così lo snapshot
      // "new" della transizione è già col tema nuovo.
      flushSync(() => setTheme(next));
      root.classList.toggle("dark", next === "dark");
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
