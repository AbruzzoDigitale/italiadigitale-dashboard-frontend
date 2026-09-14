import { useEffect, useRef, useState } from "react";
import { listQuickLinksApi, type QuickLink } from "../../api/quickLinks";
import { faviconFor, normalizeUrl } from "../../utils/quickLinks";
import { Icon } from "../ui/Icon";

// Numero di chip mostrati; i rimanenti finiscono nel dropdown "···".
const VISIBLE_COUNT = 4;

/**
 * Barra dei collegamenti rapidi al centro della navbar. Primi N link come chip,
 * il resto in un dropdown "···". Ogni link apre DIRETTAMENTE la pagina in una
 * nuova scheda del browser (anchor nativi, sempre cliccabili).
 */
export function QuickLinksBar() {
  const [links, setLinks] = useState<QuickLink[]>([]);
  const [menuOpen, setMenuOpen] = useState(false); // dropdown "···"
  const menuRef = useRef<HTMLDivElement | null>(null);

  const reload = () => {
    listQuickLinksApi()
      .then((data) => setLinks([...data].sort((a, b) => a.position - b.position)))
      .catch(() => setLinks([]));
  };

  useEffect(() => {
    let cancelled = false;
    listQuickLinksApi()
      .then((data) => { if (!cancelled) setLinks([...data].sort((a, b) => a.position - b.position)); })
      .catch(() => { if (!cancelled) setLinks([]); });
    return () => { cancelled = true; };
  }, []);

  // La sezione nel profilo emette questo evento dopo ogni modifica: teniamo la barra allineata.
  useEffect(() => {
    const onUpdated = () => reload();
    window.addEventListener("quick-links-updated", onUpdated);
    return () => window.removeEventListener("quick-links-updated", onUpdated);
  }, []);

  // Chiusura dropdown "···" cliccando fuori.
  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  if (links.length === 0) return null;

  const visible = links.slice(0, VISIBLE_COUNT);
  const overflow = links.slice(VISIBLE_COUNT);

  const chipClass =
    "inline-flex items-center gap-1.5 max-w-[160px] rounded-pill border border-line bg-paper px-2.5 py-1.5 text-[12px] font-semibold text-ink transition-colors hover:bg-cream dark:border-[#2a2a2e] dark:bg-[#1c1c20] dark:text-[#f4f4f7] dark:hover:bg-[#252529]";

  return (
    <div className="hidden md:flex items-center gap-1.5 min-w-0">
      {visible.map((link) => (
        <a
          key={link.id}
          href={normalizeUrl(link.url)}
          target="_blank"
          rel="noopener noreferrer"
          title={link.title}
          className={chipClass}
        >
          <img src={faviconFor(link)} alt="" className="h-4 w-4 flex-shrink-0 rounded-sm" />
          <span className="truncate">{link.title}</span>
        </a>
      ))}

      {overflow.length > 0 && (
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            title="Altri collegamenti"
            aria-label="Altri collegamenti"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-pill border bg-paper text-ink transition-colors hover:bg-cream dark:bg-[#1c1c20] dark:text-[#f4f4f7] dark:hover:bg-[#252529] ${menuOpen ? "border-brand-magenta text-brand-magenta" : "border-line dark:border-[#2a2a2e]"}`}
          >
            <Icon name="dots-horizontal" className="h-4 w-4" />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute left-1/2 top-[calc(100%+6px)] z-30 w-56 -translate-x-1/2 rounded-lg border border-line bg-paper p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.12)] dark:border-[#2a2a2e] dark:bg-[#131316]"
            >
              {overflow.map((link) => (
                <a
                  key={link.id}
                  href={normalizeUrl(link.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="w-full inline-flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] font-semibold text-ink hover:bg-cream dark:text-[#f4f4f7] dark:hover:bg-[#1c1c20]"
                >
                  <img src={faviconFor(link)} alt="" className="h-4 w-4 flex-shrink-0 rounded-sm" />
                  <span className="truncate">{link.title}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
