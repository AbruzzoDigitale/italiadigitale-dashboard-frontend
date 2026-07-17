import React, { createContext, useCallback, useContext, useEffect, useRef } from "react";
import { useToast } from "./ToastContext";

// ─────────────────────────────────────────────────────────────────────────────
// Undo globale: ogni operazione (crea/modifica/elimina) può registrare come
// annullarsi. L'annullamento avviene cliccando "Annulla" sul toast oppure con
// Ctrl/Cmd+Z (che NON viene intercettato quando si sta scrivendo in un campo).
// È best-effort: ripristina lo stato precedente noto; ogni azione si annulla una
// sola volta.
// ─────────────────────────────────────────────────────────────────────────────

export interface UndoableAction {
  /** Testo mostrato nel toast, es. «Lavorazione "X" eliminata». */
  label: string;
  /** Operazione inversa. Può essere async. */
  undo: () => void | Promise<void>;
}

interface UndoEntry extends UndoableAction {
  id: number;
  used: boolean;
}

interface UndoContextValue {
  registerUndo: (action: UndoableAction) => void;
}

const UndoContext = createContext<UndoContextValue | null>(null);

const MAX_STACK = 40;

export function UndoProvider({ children }: { children: React.ReactNode }) {
  const toast = useToast();
  const stackRef = useRef<UndoEntry[]>([]);
  const counterRef = useRef(0);

  const runUndo = useCallback(
    async (id?: number) => {
      const stack = stackRef.current;
      let entry: UndoEntry | undefined;
      if (id != null) {
        entry = stack.find((e) => e.id === id && !e.used);
      } else {
        for (let i = stack.length - 1; i >= 0; i--) {
          if (!stack[i].used) {
            entry = stack[i];
            break;
          }
        }
      }
      if (!entry || entry.used) return;
      entry.used = true;
      try {
        await entry.undo();
        toast.success(`Annullato · ${entry.label}`);
      } catch (e) {
        entry.used = false; // riprova possibile
        toast.error(`Impossibile annullare · ${(e as Error)?.message ?? entry.label}`);
      }
    },
    [toast]
  );

  const registerUndo = useCallback(
    (action: UndoableAction) => {
      const id = ++counterRef.current;
      stackRef.current.push({ ...action, id, used: false });
      if (stackRef.current.length > MAX_STACK) stackRef.current.shift();
      toast.action(action.label, "Annulla", () => void runUndo(id));
    },
    [toast, runUndo]
  );

  // Ctrl/Cmd+Z globale — ignora quando il focus è su un campo editabile
  // (lì vale l'undo nativo del testo).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
      if (e.key.toLowerCase() !== "z") return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
      if (stackRef.current.some((x) => !x.used)) {
        e.preventDefault();
        void runUndo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [runUndo]);

  return <UndoContext.Provider value={{ registerUndo }}>{children}</UndoContext.Provider>;
}

export function useUndo(): UndoContextValue {
  const ctx = useContext(UndoContext);
  if (!ctx) throw new Error("useUndo must be used inside UndoProvider");
  return ctx;
}
