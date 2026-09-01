import { useEffect, useMemo, useRef, useState } from "react";
import type { EmailTemplateVariable } from "../../api/emailTemplates";

// Piccolo menu "+ Variabile" per inserire un segnaposto in un campo di testo
// semplice (es. l'oggetto). L'utente sceglie dall'elenco raggruppato: non digita
// mai le {{}}. Usato dove non c'è l'editor a chip (che è solo per il corpo HTML).
export function VariableMenu({
  variables,
  onInsert,
  disabled,
}: {
  variables: EmailTemplateVariable[];
  onInsert: (token: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const groups = useMemo(() => {
    const map = new Map<string, EmailTemplateVariable[]>();
    for (const v of variables) {
      const g = v.group || "Variabili";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(v);
    }
    return Array.from(map.entries());
  }, [variables]);

  if (variables.length === 0) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
        className="rounded border border-line px-2 py-0.5 text-[11px] font-semibold text-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 dark:border-line-dark dark:text-muted-dark dark:hover:text-paper"
        title="Inserisci una variabile"
      >
        + Variabile
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+6px)] z-20 max-h-72 w-60 overflow-y-auto rounded-md border border-line bg-paper p-1 shadow-lg dark:border-line-dark dark:bg-[#1b1b1f]">
          {groups.map(([group, opts]) => (
            <div key={group} className="mb-1 last:mb-0">
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted dark:text-muted-dark">
                {group}
              </div>
              {opts.map((opt) => (
                <button
                  key={opt.token}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onInsert(opt.token);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs text-ink hover:bg-cream dark:text-paper dark:hover:bg-[#131316]"
                >
                  <span className="truncate">{opt.label}</span>
                  <span className="shrink-0 font-mono text-[10px] text-muted dark:text-muted-dark">{`{{${opt.token}}}`}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
