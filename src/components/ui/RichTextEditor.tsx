import { useEffect, useMemo, useRef, useState } from "react";

interface RichTextEditorProps {
  label?: string;
  value: string;
  onChange: (nextValue: string) => void;
  placeholder?: string;
  disabled?: boolean;
  minHeightClassName?: string;
  className?: string;
}

interface RichTextCommand {
  id: string;
  label: string;
  command: string;
  value?: string;
}

const INLINE_COMMANDS: RichTextCommand[] = [
  { id: "bold", label: "B", command: "bold" },
  { id: "italic", label: "I", command: "italic" },
  { id: "underline", label: "U", command: "underline" },
  { id: "olist", label: "1.", command: "insertOrderedList" },
  { id: "ulist", label: "-", command: "insertUnorderedList" },
  { id: "quote", label: "\"\"", command: "formatBlock", value: "blockquote" },
  { id: "clear", label: "Tx", command: "removeFormat" },
];

function containsHtmlTag(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeInputHtml(value: string): string {
  const normalized = value.trim();
  if (!normalized) return "";
  if (containsHtmlTag(normalized)) return normalized;
  return escapeHtml(normalized).replace(/\r?\n/g, "<br>");
}

function sanitizeStyleAttribute(styleValue: string): string {
  const declarations = styleValue
    .split(";")
    .map((rawDeclaration) => rawDeclaration.trim())
    .filter(Boolean)
    .filter((declaration) => {
      const [property] = declaration.split(":");
      if (!property) return false;
      const key = property.trim().toLowerCase();
      return key !== "color" && key !== "background" && key !== "background-color";
    });

  return declarations.join("; ");
}

function sanitizeRichTextHtml(rawHtml: string): string {
  const candidate = rawHtml.trim();
  if (!candidate) return "";
  const parser = new DOMParser();
  const documentRoot = parser.parseFromString(candidate, "text/html");

  documentRoot.querySelectorAll("script,style,iframe,object,embed").forEach((node) => node.remove());

  documentRoot.querySelectorAll("*").forEach((element) => {
    const attributes = Array.from(element.attributes);
    attributes.forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("on")) {
        element.removeAttribute(attribute.name);
        return;
      }
      if (name === "style") {
        const style = sanitizeStyleAttribute(attribute.value);
        if (style) {
          element.setAttribute("style", style);
        } else {
          element.removeAttribute("style");
        }
      }
    });
  });

  // Keep plain spaces in persisted HTML to avoid visible '&nbsp;' artifacts.
  documentRoot.querySelectorAll("*").forEach((element) => {
    element.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        node.textContent = (node.textContent ?? "").replace(/\u00A0/g, " ");
      }
    });
  });

  return documentRoot.body.innerHTML.replace(/&nbsp;/g, " ").trim();
}

export function hasRichTextContent(value: string): boolean {
  const html = sanitizeRichTextHtml(value);
  if (!html) return false;

  const parser = new DOMParser();
  const documentRoot = parser.parseFromString(html, "text/html");
  const text = (documentRoot.body.textContent ?? "").replace(/\u00A0/g, " ").trim();
  if (text.length > 0) return true;

  return !!documentRoot.body.querySelector("img,video,audio,table,ul,ol,blockquote,hr");
}

export function RichTextEditor({
  label,
  value,
  onChange,
  placeholder,
  disabled = false,
  minHeightClassName = "min-h-[132px]",
  className,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const linkInputRef = useRef<HTMLInputElement | null>(null);
  const linkRangeRef = useRef<Range | null>(null);
  const [linkTooltipOpen, setLinkTooltipOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState("");

  const normalizedValue = useMemo(() => normalizeInputHtml(value), [value]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    // While user is typing, avoid forcing innerHTML updates that would reset caret.
    if (document.activeElement === editor) return;

    const currentSanitized = sanitizeRichTextHtml(editor.innerHTML);
    const nextSanitized = sanitizeRichTextHtml(normalizedValue);
    if (currentSanitized === nextSanitized) return;

    editor.innerHTML = normalizedValue;
  }, [normalizedValue]);

  useEffect(() => {
    if (!linkTooltipOpen) return;
    linkInputRef.current?.focus();
    linkInputRef.current?.select();
  }, [linkTooltipOpen]);

  const emitChange = () => {
    const next = sanitizeRichTextHtml(editorRef.current?.innerHTML ?? "");
    onChange(next);
  };

  const runCommand = (command: string, commandValue?: string) => {
    if (disabled) return;
    const editor = editorRef.current;
    if (!editor) return;

    editor.focus();
    document.execCommand(command, false, commandValue);
    emitChange();
  };

  const saveSelectionRange = () => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return;
    linkRangeRef.current = range.cloneRange();
  };

  const restoreSelectionRange = () => {
    const selection = window.getSelection();
    if (!selection || !linkRangeRef.current) return;
    selection.removeAllRanges();
    selection.addRange(linkRangeRef.current);
  };

  const normalizeUrl = (raw: string): string => {
    const trimmed = raw.trim();
    if (!trimmed) return "";
    if (/^[a-z][a-z\d+\-.]*:/i.test(trimmed)) return trimmed;
    if (trimmed.startsWith("//")) return `https:${trimmed}`;
    return `https://${trimmed}`;
  };

  const openLinkTooltip = () => {
    if (disabled) return;
    saveSelectionRange();
    setLinkDraft("");
    setLinkTooltipOpen(true);
  };

  const closeLinkTooltip = () => {
    setLinkTooltipOpen(false);
    setLinkDraft("");
  };

  const confirmLink = () => {
    const url = normalizeUrl(linkDraft);
    if (!url) {
      closeLinkTooltip();
      return;
    }
    restoreSelectionRange();
    runCommand("createLink", url);
    closeLinkTooltip();
  };

  return (
    <div className={["flex flex-col gap-1.5", className ?? ""].join(" ").trim()}>
      {label ? <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">{label}</label> : null}

      <div className="rounded-md border border-line bg-paper text-ink transition-colors duration-150 focus-within:border-ink dark:border-line-dark dark:bg-ink-soft dark:text-paper dark:focus-within:border-paper">
        <div className="flex flex-wrap gap-1 border-b border-line px-2 py-1.5 dark:border-line-dark">
          {INLINE_COMMANDS.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={disabled}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => runCommand(item.command, item.value)}
              className="rounded border border-line px-2 py-0.5 text-xs font-semibold text-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 dark:border-line-dark dark:text-muted-dark dark:hover:text-paper"
              aria-label={`Applica ${item.id}`}
            >
              {item.label}
            </button>
          ))}

          <div className="relative">
            <button
              type="button"
              disabled={disabled}
              onMouseDown={(event) => event.preventDefault()}
              onClick={openLinkTooltip}
              className="rounded border border-line px-2 py-0.5 text-xs font-semibold text-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 dark:border-line-dark dark:text-muted-dark dark:hover:text-paper"
              aria-label="Inserisci link"
            >
              Link
            </button>

            {linkTooltipOpen ? (
              <div className="absolute left-0 top-[calc(100%+6px)] z-20 w-64 rounded-md border border-line bg-paper p-2 shadow-lg dark:border-line-dark dark:bg-[#1b1b1f]">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">URL</div>
                <input
                  ref={linkInputRef}
                  type="text"
                  value={linkDraft}
                  onChange={(event) => setLinkDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      confirmLink();
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      closeLinkTooltip();
                    }
                  }}
                  placeholder="https://example.com"
                  className="mt-1 w-full rounded-md border border-line px-2 py-1.5 text-xs text-ink outline-none focus:border-ink dark:border-line-dark dark:bg-ink-soft dark:text-paper dark:focus:border-paper"
                />
                <div className="mt-2 flex justify-end gap-1">
                  <button
                    type="button"
                    onClick={closeLinkTooltip}
                    className="rounded border border-line px-2 py-1 text-xs font-semibold text-muted hover:text-ink dark:border-line-dark dark:text-muted-dark dark:hover:text-paper"
                  >
                    Annulla
                  </button>
                  <button
                    type="button"
                    onClick={confirmLink}
                    className="rounded border border-line bg-ink px-2 py-1 text-xs font-semibold text-paper hover:opacity-90 dark:border-line-dark dark:bg-paper dark:text-ink"
                  >
                    Inserisci
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div
          ref={editorRef}
          contentEditable={!disabled}
          role="textbox"
          aria-multiline
          data-placeholder={placeholder ?? "Scrivi qui..."}
          onMouseUp={saveSelectionRange}
          onKeyUp={saveSelectionRange}
          onFocus={saveSelectionRange}
          onInput={emitChange}
          onBlur={emitChange}
          className={[
            "w-full px-3 py-2.5 text-sm font-body leading-relaxed outline-none",
            minHeightClassName,
            "empty:before:pointer-events-none empty:before:text-muted empty:before:content-[attr(data-placeholder)] dark:empty:before:text-muted-dark",
            "[&_a]:underline [&_a]:decoration-dotted [&_a]:underline-offset-2",
            "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-line [&_blockquote]:pl-2 [&_blockquote]:italic",
            "dark:[&_blockquote]:border-line-dark",
            "[&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5",
            "[&_p]:my-1 [&_span]:leading-relaxed [&_*]:max-w-full",
            "[&_img]:max-w-full [&_img]:h-auto",
          ].join(" ")}
        />
      </div>

    </div>
  );
}
