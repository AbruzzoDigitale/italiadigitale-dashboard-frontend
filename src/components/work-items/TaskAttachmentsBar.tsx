import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "../ui/Icon";
import { ResourceIcon } from "./ResourceIcon";
import { attachmentIconName } from "../../utils/attachmentIcon";
import { detectResourceType, resourceChipLabel } from "../../utils/taskResources";
import { attachmentDisplayName, type WorkItemAttachment } from "../../api/workItems";

interface ResourceLike {
  type: string;
  title: string;
  url: string;
}

interface TaskAttachmentsBarProps {
  attachments: WorkItemAttachment[];
  resources: ResourceLike[];
  pendingFiles: File[];
  /** In modifica compare il "+" per aggiungere file/link da qui. */
  editing: boolean;
  max?: number;
  onOpenAttachment: (id: number) => void;
  onOpenResource: (url: string) => void;
  onAddFile: () => void;
  onAddLink: (url: string) => void;
}

interface ChipData {
  key: string;
  label: string;
  title: string;
  icon: ReactNode;
  onClick?: () => void;
  muted?: boolean;
}

const CHIP_CLS =
  "inline-flex max-w-[190px] items-center gap-1.5 rounded-md border border-line bg-paper px-2 py-1 text-[11px] font-medium text-ink transition-colors dark:border-line-dark dark:bg-[#1c1c20] dark:text-paper";

function Chip({ chip }: { chip: ChipData }) {
  const inner = (
    <>
      <span className="grid h-3.5 w-3.5 shrink-0 place-items-center">{chip.icon}</span>
      <span className="min-w-0 truncate">{chip.label}</span>
    </>
  );
  if (chip.onClick) {
    return (
      <button
        type="button"
        title={chip.title}
        onClick={(e) => { e.stopPropagation(); chip.onClick?.(); }}
        className={`${CHIP_CLS} cursor-pointer hover:border-ink dark:hover:border-paper ${chip.muted ? "opacity-60" : ""}`}
      >
        {inner}
      </button>
    );
  }
  return (
    <span title={chip.title} className={`${CHIP_CLS} ${chip.muted ? "opacity-60" : ""}`}>
      {inner}
    </span>
  );
}

/**
 * Barra compatta sotto la descrizione: allegati + collegamenti + file in attesa come chip
 * (icona + label). Mostra i primi `max`, il resto in un chip "+N" con popover cliccabile.
 * In modifica un "+" apre un menu Carica file / Aggiungi link.
 */
export function TaskAttachmentsBar({
  attachments,
  resources,
  pendingFiles,
  editing,
  max = 4,
  onOpenAttachment,
  onOpenResource,
  onAddFile,
  onAddLink,
}: TaskAttachmentsBarProps) {
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [linkMode, setLinkMode] = useState(false);
  const [linkDraft, setLinkDraft] = useState("");
  const menuWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuWrapRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
        setLinkMode(false);
        setLinkDraft("");
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  const chips: ChipData[] = [
    ...attachments.map((a) => ({
      key: `a${a.id}`,
      label: attachmentDisplayName(a),
      title: attachmentDisplayName(a),
      icon: <Icon name={attachmentIconName(a.content_type, a.original_filename)} className="h-3.5 w-3.5" />,
      onClick: () => onOpenAttachment(a.id),
    })),
    ...resources
      .filter((r) => (r.url ?? "").trim())
      .map((r, i) => ({
        key: `r${i}-${r.url}`,
        label: resourceChipLabel(r.title, r.url),
        title: r.url,
        icon: <ResourceIcon type={r.type || detectResourceType(r.url)} className="h-3.5 w-3.5" />,
        onClick: () => onOpenResource(r.url),
      })),
    ...pendingFiles.map((f, i) => ({
      key: `p${i}-${f.name}`,
      label: f.name,
      title: `${f.name} · in attesa di caricamento`,
      icon: <Icon name={attachmentIconName(f.type, f.name)} className="h-3.5 w-3.5" />,
      muted: true,
    })),
  ];

  if (chips.length === 0 && !editing) return null;

  const shown = chips.slice(0, max);
  const rest = chips.slice(max);

  const confirmLink = () => {
    const url = linkDraft.trim();
    if (url) onAddLink(url);
    setLinkDraft("");
    setLinkMode(false);
    setMenuOpen(false);
  };

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {shown.map((chip) => (
        <Chip key={chip.key} chip={chip} />
      ))}

      {rest.length > 0 && (
        <span
          className="relative"
          onMouseEnter={() => setOverflowOpen(true)}
          onMouseLeave={() => setOverflowOpen(false)}
        >
          <button
            type="button"
            tabIndex={0}
            onFocus={() => setOverflowOpen(true)}
            onBlur={() => setOverflowOpen(false)}
            onClick={(e) => { e.stopPropagation(); setOverflowOpen((v) => !v); }}
            aria-label={`Altri ${rest.length} allegati`}
            className={`${CHIP_CLS} cursor-pointer text-muted hover:border-ink hover:text-ink dark:text-muted-dark dark:hover:border-paper dark:hover:text-paper`}
          >
            +{rest.length}
          </button>
          {overflowOpen && (
            <span
              role="tooltip"
              className="absolute bottom-full left-0 z-50 mb-2 flex max-h-64 w-max max-w-[260px] flex-col gap-1 overflow-y-auto rounded-lg border border-line bg-paper p-2 shadow-lg dark:border-line-dark dark:bg-[#1c1c20]"
            >
              {rest.map((chip) => (
                <Chip key={chip.key} chip={chip} />
              ))}
            </span>
          )}
        </span>
      )}

      {editing && (
        <div ref={menuWrapRef} className="relative">
          <button
            type="button"
            onClick={() => { setMenuOpen((v) => !v); setLinkMode(false); }}
            aria-label="Aggiungi allegato o collegamento"
            title="Aggiungi file o link"
            className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-md border border-dashed border-line text-muted transition-colors hover:border-ink hover:text-ink dark:border-line-dark dark:text-muted-dark dark:hover:border-paper dark:hover:text-paper"
          >
            <Icon name="plus" className="h-3.5 w-3.5" />
          </button>
          {menuOpen && (
            <div className="absolute bottom-full left-0 z-50 mb-2 w-56 rounded-lg border border-line bg-paper p-1.5 shadow-lg dark:border-line-dark dark:bg-[#1c1c20]">
              {!linkMode ? (
                <>
                  <button
                    type="button"
                    onClick={() => { onAddFile(); setMenuOpen(false); }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-ink hover:bg-cream dark:text-paper dark:hover:bg-[#131316]"
                  >
                    <Icon name="upload" className="h-3.5 w-3.5 shrink-0" /> Carica file
                  </button>
                  <button
                    type="button"
                    onClick={() => setLinkMode(true)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-ink hover:bg-cream dark:text-paper dark:hover:bg-[#131316]"
                  >
                    <Icon name="link" className="h-3.5 w-3.5 shrink-0" /> Aggiungi link
                  </button>
                </>
              ) : (
                <div className="p-1">
                  <input
                    autoFocus
                    type="text"
                    value={linkDraft}
                    onChange={(e) => setLinkDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); confirmLink(); }
                      if (e.key === "Escape") { e.preventDefault(); setLinkMode(false); setLinkDraft(""); }
                    }}
                    placeholder="https://…  o  \\nas\\percorso"
                    className="w-full rounded-md border border-line bg-paper px-2 py-1.5 text-xs text-ink outline-none focus:border-ink dark:border-line-dark dark:bg-[#0E0F0E] dark:text-paper dark:focus:border-paper"
                  />
                  <div className="mt-1.5 flex justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => { setLinkMode(false); setLinkDraft(""); }}
                      className="rounded border border-line px-2 py-1 text-[11px] font-semibold text-muted hover:text-ink dark:border-line-dark dark:text-muted-dark dark:hover:text-paper"
                    >
                      Annulla
                    </button>
                    <button
                      type="button"
                      onClick={confirmLink}
                      disabled={!linkDraft.trim()}
                      className="rounded border border-line bg-ink px-2 py-1 text-[11px] font-semibold text-paper hover:opacity-90 disabled:opacity-40 dark:border-line-dark dark:bg-paper dark:text-ink"
                    >
                      Aggiungi
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
