import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "../../ui/Icon";
import { useAuth } from "../../../hooks/useAuth";
import { canAccessRoute } from "../../../utils/access";
import { APP_SECTIONS, DEFAULT_SHORTCUTS, findSection, type AppSection } from "../../../utils/appSections";
import { useWidgetHost } from "../widgets/WidgetHostContext";
import type { WidgetInstance } from "../widgets/types";

/**
 * Scorciatoie alle sezioni del gestionale: una griglia di tessere, stile lanciatore.
 *
 * Quali sezioni mostrare — e in che ORDINE — sta nella config del widget
 * (`config.shortcuts`, un elenco ordinato di percorsi), quindi viaggia con il layout
 * della dashboard e non serve nulla lato backend.
 *
 * In "Personalizza" il widget si sdoppia: sopra le scorciatoie scelte, trascinabili per
 * riordinarle e con la × per toglierle; sotto quelle ancora disponibili, che si aggiungono
 * in coda con un clic. Il trascinamento della tessera non litiga con quello del widget
 * perché il grid avvia il proprio drag solo dalla barra in cima alla card.
 */
export function ShortcutsWidget({ instance }: { instance: WidgetInstance }) {
  const navigate = useNavigate();
  const { permissions } = useAuth();
  const { editing, updateConfig } = useWidgetHost();
  const [preso, setPreso] = useState<number | null>(null);
  const [sopra, setSopra] = useState<number | null>(null);

  const accessible = APP_SECTIONS.filter((s) => canAccessRoute(permissions, s.routeKey));
  const raw = instance.config.shortcuts;
  const chosen = Array.isArray(raw) ? (raw as unknown[]).filter((v): v is string => typeof v === "string") : null;
  // Mai mostrare un default che l'utente non potrebbe aprire.
  const paths = (chosen ?? DEFAULT_SHORTCUTS).filter((p) => accessible.some((s) => s.to === p));

  const scelte = paths.map((p) => findSection(p)).filter((s): s is AppSection => !!s);
  const restanti = accessible.filter((s) => !paths.includes(s.to));

  const aggiungi = (to: string) => updateConfig({ shortcuts: [...paths, to] });
  const rimuovi = (to: string) => updateConfig({ shortcuts: paths.filter((p) => p !== to) });
  const sposta = (da: number, a: number) => {
    if (da === a) return;
    const next = [...paths];
    const [mosso] = next.splice(da, 1);
    next.splice(a, 0, mosso);
    updateConfig({ shortcuts: next });
  };

  const finiscoDrag = () => {
    setPreso(null);
    setSopra(null);
  };

  return (
    <div className="flex h-full flex-col p-3">
      <div className="mb-2 flex flex-shrink-0 items-center gap-1.5">
        <Icon name="grid" className="h-4 w-4 flex-shrink-0 text-brand-magenta" />
        <span className="truncate text-[12px] font-semibold text-ink dark:text-[#f4f4f7]">Scorciatoie</span>
        {editing && (
          <span className="ml-auto truncate text-[10px] font-semibold text-muted dark:text-[#9999a0]">
            trascina per riordinare
          </span>
        )}
      </div>

      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
        {scelte.length === 0 && !editing ? (
          <div className="flex h-full items-center justify-center px-2 text-center text-[11px] text-muted dark:text-[#9999a0]">
            Nessuna scorciatoia: entra in “Personalizza” e scegli le sezioni.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(74px,1fr))] gap-1.5">
              {scelte.map((s, i) => (
                <div
                  key={s.to}
                  draggable={editing}
                  onDragStart={(e) => {
                    setPreso(i);
                    e.dataTransfer.effectAllowed = "move";
                    // Firefox non avvia il drag senza dati nel transfer.
                    e.dataTransfer.setData("text/plain", s.to);
                  }}
                  onDragEnd={finiscoDrag}
                  onDragOver={(e) => {
                    if (preso == null) return;
                    e.preventDefault();
                    if (sopra !== i) setSopra(i);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (preso != null) sposta(preso, i);
                    finiscoDrag();
                  }}
                  className={`relative ${preso === i ? "opacity-40" : ""} ${
                    sopra === i && preso !== i ? "rounded-md ring-2 ring-brand-magenta" : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => !editing && navigate(s.to)}
                    title={editing ? "Trascina per riordinare" : s.label}
                    className={`flex w-full flex-col items-center gap-1.5 rounded-md border border-line px-1.5 py-2 transition-colors dark:border-[#2a2a2e] ${
                      editing
                        ? "cursor-grab active:cursor-grabbing"
                        : "hover:border-brand-magenta hover:bg-cream dark:hover:bg-[#1c1c20]"
                    }`}
                  >
                    <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-brand-magenta/10 text-brand-magenta">
                      <Icon name={s.icon} className="h-4 w-4" />
                    </span>
                    <span className="w-full truncate text-center text-[10px] font-semibold leading-tight text-ink dark:text-[#f4f4f7]">
                      {s.label}
                    </span>
                  </button>
                  {editing && (
                    <button
                      type="button"
                      onClick={() => rimuovi(s.to)}
                      title="Togli dalle scorciatoie"
                      aria-label={`Togli ${s.label} dalle scorciatoie`}
                      className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full border border-line bg-paper text-muted shadow-1 transition-colors hover:text-danger dark:border-[#2a2a2e] dark:bg-[#131316] dark:text-[#9999a0]"
                    >
                      <Icon name="x" className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {editing && restanti.length > 0 && (
              <>
                <p className="mb-1.5 mt-3 text-[10px] font-bold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                  Disponibili
                </p>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(74px,1fr))] gap-1.5">
                  {restanti.map((s) => (
                    <button
                      key={s.to}
                      type="button"
                      onClick={() => aggiungi(s.to)}
                      title={`Aggiungi ${s.label}`}
                      className="flex flex-col items-center gap-1.5 rounded-md border border-dashed border-line/70 px-1.5 py-2 opacity-60 transition-opacity hover:opacity-100 dark:border-[#2a2a2e]"
                    >
                      <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-cream text-muted dark:bg-[#1c1c20] dark:text-[#9999a0]">
                        <Icon name={s.icon} className="h-4 w-4" />
                      </span>
                      <span className="w-full truncate text-center text-[10px] font-semibold leading-tight text-ink dark:text-[#f4f4f7]">
                        {s.label}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
