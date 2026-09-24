import { Icon } from "../../components/ui/Icon";
import { useShortcutLabel } from "./useOracleShortcut";

/**
 * La barra nella navbar: non è un campo di testo, è un pulsante che *sembra* un campo.
 *
 * Scriverci dentro davvero vorrebbe dire gestire due stati della stessa domanda — uno
 * qui e uno nel dialogo — e perderne uno al primo carattere. Così il clic apre il
 * dialogo e si scrive lì, che è anche dove si legge la risposta.
 *
 * La scorciatoia mostrata cambia col sistema operativo: ⌘K su Mac, Ctrl K altrove.
 */
export function OracleSearchBar({ onOpen }: { onOpen: () => void }) {
  const scorciatoia = useShortcutLabel();

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Chiedi all'Oracolo"
      className="hidden md:flex items-center gap-2 h-9 w-56 lg:w-72 px-3 rounded-pill
                 border border-line dark:border-[#2a2a2e] bg-paper dark:bg-[#1c1c20]
                 text-muted dark:text-[#9999a0] hover:border-brand-magenta
                 hover:text-ink dark:hover:text-[#f4f4f7] transition-colors"
    >
      <Icon name="search" className="w-4 h-4 shrink-0" />
      <span className="flex-1 text-left text-[12px] truncate">Chiedi all'Oracolo…</span>
      <kbd
        className="shrink-0 rounded border border-line dark:border-[#2a2a2e] px-1.5 py-0.5
                   text-[10px] font-sans text-muted dark:text-[#9999a0] tabular-nums"
      >
        {scorciatoia}
      </kbd>
    </button>
  );
}
