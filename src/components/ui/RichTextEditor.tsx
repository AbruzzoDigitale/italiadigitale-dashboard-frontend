import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Icon } from "./Icon";

interface AttachmentPickerOption {
  id: number;
  name: string;
}

/** API imperativa per inserire contenuti al caret (usata dal drag&drop sulla descrizione). */
export interface RichTextEditorHandle {
  /** Sposta il caret nel punto schermo (x,y), se dentro l'editor. Mostra la "pipe". */
  placeCaretFromPoint: (x: number, y: number) => void;
  /** Inserisce un chip allegato (per id) al caret corrente. */
  insertAttachmentBadge: (id: number, name: string) => void;
  /** Inserisce un link al caret corrente. */
  insertLink: (url: string, text?: string) => void;
  focus: () => void;
}

interface TemplateVariableOption {
  token: string;
  label: string;
  group?: string;
}

interface RichTextEditorProps {
  label?: string;
  value: string;
  onChange: (nextValue: string) => void;
  placeholder?: string;
  disabled?: boolean;
  minHeightClassName?: string;
  className?: string;
  /** Sfondo trasparente + testo scuro (es. dentro una sticky note colorata). */
  transparent?: boolean;
  /** Se presente, mostra un pulsante "Allega" per inserire un badge file nel testo. */
  attachmentPicker?: {
    options: AttachmentPickerOption[];
    emptyHint?: string;
  };
  /** Toolbar "stile Gmail": aggiunge font, dimensione, colore testo e allineamento. */
  richToolbar?: boolean;
  /** Consente stili inline (colore/font/allineamento) nell'HTML salvato. Default = richToolbar. */
  allowStyles?: boolean;
  /** Se presente, mostra un menu "Variabili" per inserire segnaposto {{token}} al caret. */
  variablePicker?: {
    options: TemplateVariableOption[];
  };
}

// Font e dimensioni "email-safe" per la toolbar arricchita.
const FONT_FAMILIES: { label: string; value: string }[] = [
  { label: "Predefinito", value: "" },
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Georgia", value: "Georgia, 'Times New Roman', serif" },
  { label: "Times", value: "'Times New Roman', Times, serif" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
  { label: "Courier", value: "'Courier New', Courier, monospace" },
];

const FONT_SIZES: { label: string; value: string }[] = [
  { label: "Piccolo", value: "2" },
  { label: "Normale", value: "3" },
  { label: "Grande", value: "5" },
  { label: "Enorme", value: "6" },
];

// Proprietà di stile inline ammesse in modalità email (allowStyles).
const EMAIL_STYLE_ALLOW = new Set([
  "color",
  "background-color",
  "text-align",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "text-decoration",
]);

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

function sanitizeStyleAttribute(styleValue: string, allowStyles: boolean): string {
  const declarations = styleValue
    .split(";")
    .map((rawDeclaration) => rawDeclaration.trim())
    .filter(Boolean)
    .filter((declaration) => {
      const [property] = declaration.split(":");
      if (!property) return false;
      const key = property.trim().toLowerCase();
      // Modalità email: whitelist esplicita (colori/font/allineamento ammessi).
      if (allowStyles) return EMAIL_STYLE_ALLOW.has(key);
      // Default storico: si tengono gli stili tranne colore/sfondo.
      return key !== "color" && key !== "background" && key !== "background-color";
    });

  return declarations.join("; ");
}

function sanitizeRichTextHtml(rawHtml: string, allowStyles = false): string {
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
        const style = sanitizeStyleAttribute(attribute.value, allowStyles);
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

// ── Variabili: chip visivi ⇄ token canonici {{...}} ──────────────────────────
// Nell'editor le variabili si mostrano come "pill" con l'etichetta amichevole
// (es. "Nome cliente"); nell'HTML salvato restano `{{token}}` così il backend
// le risolve come sempre. Il caret le tratta come un'unità atomica.
const VAR_TOKEN_RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

/** Converte i `{{token}}` presenti nei nodi di testo in chip <span.tpl-var>. */
function tokensToChips(html: string, labelByToken: Map<string, string>): string {
  if (!html || !html.includes("{{")) return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text);

  for (const node of textNodes) {
    const text = node.textContent ?? "";
    if (!text.includes("{{")) continue;
    // Non toccare il testo già dentro un chip.
    if (node.parentElement?.closest?.(".tpl-var")) continue;
    VAR_TOKEN_RE.lastIndex = 0;
    if (!VAR_TOKEN_RE.test(text)) continue;

    const frag = doc.createDocumentFragment();
    let last = 0;
    VAR_TOKEN_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = VAR_TOKEN_RE.exec(text)) !== null) {
      const token = m[1];
      if (m.index > last) frag.appendChild(doc.createTextNode(text.slice(last, m.index)));
      if (labelByToken.has(token)) {
        const span = doc.createElement("span");
        span.className = "tpl-var";
        span.setAttribute("data-token", token);
        span.setAttribute("contenteditable", "false");
        span.textContent = labelByToken.get(token) ?? token;
        frag.appendChild(span);
      } else {
        frag.appendChild(doc.createTextNode(m[0]));
      }
      last = m.index + m[0].length;
    }
    if (last < text.length) frag.appendChild(doc.createTextNode(text.slice(last)));
    node.parentNode?.replaceChild(frag, node);
  }
  return doc.body.innerHTML;
}

/** Riconverte i chip <span.tpl-var> nei token canonici `{{token}}`. */
function chipsToTokens(html: string): string {
  if (!html || !html.includes("tpl-var")) return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("span.tpl-var").forEach((el) => {
    const token = el.getAttribute("data-token") || "";
    const text = token ? `{{${token}}}` : el.textContent ?? "";
    el.replaceWith(doc.createTextNode(text));
  });
  return doc.body.innerHTML;
}

export const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(function RichTextEditor({
  label,
  value,
  onChange,
  placeholder,
  disabled = false,
  minHeightClassName = "min-h-[132px]",
  className,
  transparent = false,
  attachmentPicker,
  richToolbar = false,
  allowStyles,
  variablePicker,
}: RichTextEditorProps, ref) {
  // In modalità email si conservano gli stili inline (colori/font/allineamento).
  const keepStyles = allowStyles ?? richToolbar;
  // Variabili: mappa token→etichetta per i chip (identità stabile via options memoizzate).
  const varOptions = variablePicker?.options;
  const tokenLabelMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const opt of varOptions ?? []) m.set(opt.token, opt.label);
    return m;
  }, [varOptions]);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const linkInputRef = useRef<HTMLInputElement | null>(null);
  const linkRangeRef = useRef<Range | null>(null);
  // Range dell'ultimo punto di drop (per inserire al caret anche dopo un upload async).
  const dropRangeRef = useRef<Range | null>(null);
  const [linkTooltipOpen, setLinkTooltipOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState("");
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [varMenuOpen, setVarMenuOpen] = useState(false);
  // Modifica di un link ESISTENTE: popover posizionato sotto il link cliccato.
  const editAnchorRef = useRef<HTMLAnchorElement | null>(null);
  const editLinkInputRef = useRef<HTMLInputElement | null>(null);
  const [linkEdit, setLinkEdit] = useState<{ top: number; left: number } | null>(null);
  const [editHref, setEditHref] = useState("");

  const normalizedValue = useMemo(() => normalizeInputHtml(value), [value]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    // While user is typing, avoid forcing innerHTML updates that would reset caret.
    if (document.activeElement === editor) return;

    // Confronto in forma canonica ({{token}}): l'editor mostra i chip, il valore usa i token.
    const sanitizedEditor = sanitizeRichTextHtml(editor.innerHTML, keepStyles);
    const currentCanonical = varOptions ? chipsToTokens(sanitizedEditor) : sanitizedEditor;
    const nextCanonical = sanitizeRichTextHtml(normalizedValue, keepStyles);
    if (currentCanonical === nextCanonical) return;

    editor.innerHTML = varOptions ? tokensToChips(normalizedValue, tokenLabelMap) : normalizedValue;
  }, [normalizedValue, keepStyles, varOptions, tokenLabelMap]);

  useEffect(() => {
    if (!linkTooltipOpen) return;
    linkInputRef.current?.focus();
    linkInputRef.current?.select();
  }, [linkTooltipOpen]);

  useEffect(() => {
    if (!linkEdit) return;
    editLinkInputRef.current?.focus();
    editLinkInputRef.current?.select();
  }, [linkEdit]);

  // Chiudi il menu allegati cliccando fuori dall'editor.
  useEffect(() => {
    if (!attachMenuOpen) return;
    const onDocMouseDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setAttachMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [attachMenuOpen]);

  // Chiudi il menu variabili cliccando fuori dall'editor.
  useEffect(() => {
    if (!varMenuOpen) return;
    const onDocMouseDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setVarMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [varMenuOpen]);

  const emitChange = () => {
    const sanitized = sanitizeRichTextHtml(editorRef.current?.innerHTML ?? "", keepStyles);
    // Salva sempre in forma canonica: i chip tornano `{{token}}`.
    onChange(varOptions ? chipsToTokens(sanitized) : sanitized);
  };

  const runCommand = (command: string, commandValue?: string) => {
    if (disabled) return;
    const editor = editorRef.current;
    if (!editor) return;

    editor.focus();
    // In modalità email vogliamo stili inline (es. <span style="color">), non tag <font>.
    if (richToolbar) {
      try {
        document.execCommand("styleWithCSS", false, "true");
      } catch {
        /* alcuni browser non supportano il toggle: si prosegue comunque */
      }
    }
    document.execCommand(command, false, commandValue);
    emitChange();
  };

  // Come runCommand ma ripristina prima la selezione salvata: serve ai controlli
  // (select font/dimensione, input colore) che rubano il focus all'editor.
  const applyWithSavedSelection = (command: string, commandValue?: string) => {
    if (disabled) return;
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    restoreSelectionRange();
    if (richToolbar) {
      try {
        document.execCommand("styleWithCSS", false, "true");
      } catch {
        /* no-op */
      }
    }
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

  const openAttachMenu = () => {
    if (disabled) return;
    saveSelectionRange();
    setAttachMenuOpen((prev) => !prev);
  };

  const openVarMenu = () => {
    if (disabled) return;
    saveSelectionRange();
    setVarMenuOpen((prev) => !prev);
  };

  // Inserisce la variabile come chip visivo (l'utente non digita mai le {{}}).
  const insertVariable = (token: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    restoreSelectionRange();
    const label = tokenLabelMap.get(token) ?? token;
    const chip =
      `<span class="tpl-var" data-token="${escapeHtml(token)}" contenteditable="false">` +
      `${escapeHtml(label)}</span>&nbsp;`;
    document.execCommand("insertHTML", false, chip);
    emitChange();
    setVarMenuOpen(false);
  };

  const insertAttachmentBadge = (option: AttachmentPickerOption) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    restoreSelectionRange();
    const safeName = escapeHtml(option.name);
    // contenteditable=false: il chip è atomico; sanitizeRichTextHtml lo preserva.
    const badge =
      `<span class="wi-attach-badge" data-attachment-id="${option.id}" ` +
      `contenteditable="false">${safeName}</span> `;
    document.execCommand("insertHTML", false, badge);
    emitChange();
    setAttachMenuOpen(false);
  };

  // ── API imperativa per il drag&drop ─────────────────────────────────────────
  const placeCaretFromPoint = (x: number, y: number) => {
    const editor = editorRef.current;
    if (!editor) return;
    let range: Range | null = null;
    const doc = document as Document & {
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    };
    if (typeof doc.caretRangeFromPoint === "function") {
      range = doc.caretRangeFromPoint(x, y);
    } else if (typeof doc.caretPositionFromPoint === "function") {
      const pos = doc.caretPositionFromPoint(x, y);
      if (pos) {
        range = document.createRange();
        range.setStart(pos.offsetNode, pos.offset);
        range.collapse(true);
      }
    }
    if (!range || !editor.contains(range.startContainer)) return;
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    dropRangeRef.current = range.cloneRange();
  };

  const insertHtmlAtCaret = (html: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const selection = window.getSelection();
    const liveInEditor =
      !!selection && selection.rangeCount > 0 && editor.contains(selection.getRangeAt(0).startContainer);
    if (!liveInEditor) {
      // Selezione persa (es. dopo un upload async): ripristina il punto di drop, o vai in fondo.
      const range = dropRangeRef.current?.cloneRange() ?? (() => {
        const r = document.createRange();
        r.selectNodeContents(editor);
        r.collapse(false);
        return r;
      })();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    document.execCommand("insertHTML", false, html);
    dropRangeRef.current = null;
    emitChange();
  };

  useImperativeHandle(ref, () => ({
    placeCaretFromPoint,
    insertAttachmentBadge: (id: number, name: string) => {
      insertHtmlAtCaret(
        `<span class="wi-attach-badge" data-attachment-id="${id}" contenteditable="false">${escapeHtml(name)}</span> `,
      );
    },
    insertLink: (url: string, text?: string) => {
      const safeUrl = escapeHtml(normalizeUrl(url));
      const label = escapeHtml((text ?? url).trim() || url);
      insertHtmlAtCaret(`<a href="${safeUrl}" target="_blank" rel="noreferrer noopener">${label}</a> `);
    },
    focus: () => editorRef.current?.focus(),
  }));

  // Rileva se il cursore/selezione è dentro un link e, in tal caso, apre il
  // popover di modifica posizionato SOTTO al link cliccato.
  const detectLinkAtCaret = () => {
    const editor = editorRef.current;
    const wrapper = wrapperRef.current;
    const selection = window.getSelection();
    if (!editor || !wrapper || !selection || selection.rangeCount === 0) {
      setLinkEdit(null);
      editAnchorRef.current = null;
      return;
    }
    let node: Node | null = selection.getRangeAt(0).startContainer;
    let anchor: HTMLAnchorElement | null = null;
    while (node && node !== editor) {
      if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === "A") {
        anchor = node as HTMLAnchorElement;
        break;
      }
      node = node.parentNode;
    }
    if (!anchor || !editor.contains(anchor)) {
      setLinkEdit(null);
      editAnchorRef.current = null;
      return;
    }
    editAnchorRef.current = anchor;
    setEditHref(anchor.getAttribute("href") ?? "");
    const a = anchor.getBoundingClientRect();
    const w = wrapper.getBoundingClientRect();
    setLinkEdit({ top: a.bottom - w.top + 6, left: Math.max(4, a.left - w.left) });
  };

  const closeLinkEdit = () => {
    setLinkEdit(null);
    editAnchorRef.current = null;
  };

  const applyEditHref = () => {
    const anchor = editAnchorRef.current;
    if (!anchor) return closeLinkEdit();
    const url = normalizeUrl(editHref);
    if (!url) return closeLinkEdit();
    anchor.setAttribute("href", url);
    anchor.setAttribute("target", "_blank");
    anchor.setAttribute("rel", "noreferrer noopener");
    emitChange();
    closeLinkEdit();
  };

  const removeEditLink = () => {
    const anchor = editAnchorRef.current;
    const parent = anchor?.parentNode;
    if (!anchor || !parent) return closeLinkEdit();
    while (anchor.firstChild) parent.insertBefore(anchor.firstChild, anchor);
    parent.removeChild(anchor);
    emitChange();
    closeLinkEdit();
  };

  // Bottoni della toolbar: su nota colorata (transparent) servono più contrasto.
  const toolbarBtnCls = transparent
    ? "rounded border border-black/25 px-2 py-0.5 text-xs font-bold text-[#241d0a] transition-colors hover:bg-black/15 disabled:cursor-not-allowed disabled:opacity-50"
    : "rounded border border-line px-2 py-0.5 text-xs font-semibold text-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 dark:border-line-dark dark:text-muted-dark dark:hover:text-paper";

  const selectCls =
    "rounded border border-line bg-paper px-1 py-0.5 text-xs text-ink outline-none disabled:opacity-50 dark:border-line-dark dark:bg-ink-soft dark:text-paper";

  // Variabili raggruppate per il menu (Azienda / Operatore / Cliente…).
  const variableGroups = (() => {
    const map = new Map<string, TemplateVariableOption[]>();
    for (const opt of variablePicker?.options ?? []) {
      const g = opt.group || "Variabili";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(opt);
    }
    return Array.from(map.entries());
  })();

  return (
    <div className={["flex flex-col gap-1.5", className ?? ""].join(" ").trim()}>
      {label ? <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">{label}</label> : null}

      <div
        ref={wrapperRef}
        className={
          transparent
            ? "relative text-[#3a2f14]"
            : "relative rounded-md border border-line bg-paper text-ink transition-colors duration-150 focus-within:border-ink dark:border-line-dark dark:bg-ink-soft dark:text-paper dark:focus-within:border-paper"
        }
      >
        <div className={`flex flex-wrap items-center gap-1 border-b px-2 py-1.5 ${transparent ? "border-black/20" : "border-line dark:border-line-dark"}`}>
          {richToolbar ? (
            <>
              <select
                aria-label="Carattere"
                disabled={disabled}
                defaultValue=""
                onChange={(event) => {
                  applyWithSavedSelection("fontName", event.target.value || "sans-serif");
                  event.currentTarget.selectedIndex = 0;
                }}
                className={selectCls}
                title="Carattere"
              >
                {FONT_FAMILIES.map((f) => (
                  <option key={f.label} value={f.value}>{f.label}</option>
                ))}
              </select>
              <select
                aria-label="Dimensione testo"
                disabled={disabled}
                defaultValue="3"
                onChange={(event) => applyWithSavedSelection("fontSize", event.target.value)}
                className={selectCls}
                title="Dimensione"
              >
                {FONT_SIZES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
              <label
                className={`${toolbarBtnCls} inline-flex cursor-pointer items-center gap-1`}
                title="Colore testo"
              >
                <span className="font-bold">A</span>
                <input
                  type="color"
                  disabled={disabled}
                  onChange={(event) => applyWithSavedSelection("foreColor", event.target.value)}
                  className="h-4 w-4 cursor-pointer border-0 bg-transparent p-0"
                  aria-label="Scegli colore testo"
                />
              </label>
              {[
                { id: "left", cmd: "justifyLeft", label: "⯇" },
                { id: "center", cmd: "justifyCenter", label: "≡" },
                { id: "right", cmd: "justifyRight", label: "⯈" },
              ].map((a) => (
                <button
                  key={a.id}
                  type="button"
                  disabled={disabled}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => runCommand(a.cmd)}
                  className={toolbarBtnCls}
                  aria-label={`Allinea a ${a.id}`}
                >
                  {a.label}
                </button>
              ))}
              <span className="mx-0.5 h-4 w-px self-center bg-line dark:bg-line-dark" aria-hidden />
            </>
          ) : null}

          {INLINE_COMMANDS.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={disabled}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => runCommand(item.command, item.value)}
              className={toolbarBtnCls}
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
              className={toolbarBtnCls}
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

          {attachmentPicker ? (
            <div className="relative">
              <button
                type="button"
                disabled={disabled}
                onMouseDown={(event) => event.preventDefault()}
                onClick={openAttachMenu}
                className={toolbarBtnCls}
                aria-label="Inserisci allegato"
                title="Inserisci un file allegato"
              >
                <Icon name="paperclip" className="h-3.5 w-3.5" />
              </button>

              {attachMenuOpen ? (
                <div className="absolute left-0 top-[calc(100%+6px)] z-20 max-h-64 w-64 overflow-y-auto rounded-md border border-line bg-paper p-1 shadow-lg dark:border-line-dark dark:bg-[#1b1b1f]">
                  {attachmentPicker.options.length === 0 ? (
                    <p className="px-2 py-2 text-[11px] text-muted dark:text-muted-dark">
                      {attachmentPicker.emptyHint ?? "Nessun file caricato da inserire."}
                    </p>
                  ) : (
                    attachmentPicker.options.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => insertAttachmentBadge(option)}
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-ink hover:bg-cream dark:text-paper dark:hover:bg-[#131316]"
                      >
                        <Icon name="paperclip" className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{option.name}</span>
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>
          ) : null}

          {variablePicker && variablePicker.options.length > 0 ? (
            <div className="relative ml-auto">
              <button
                type="button"
                disabled={disabled}
                onMouseDown={(event) => event.preventDefault()}
                onClick={openVarMenu}
                className={toolbarBtnCls}
                aria-label="Inserisci variabile"
                title="Inserisci una variabile"
              >
                + Variabile
              </button>

              {varMenuOpen ? (
                <div className="absolute right-0 top-[calc(100%+6px)] z-20 max-h-72 w-60 overflow-y-auto rounded-md border border-line bg-paper p-1 shadow-lg dark:border-line-dark dark:bg-[#1b1b1f]">
                  {variableGroups.map(([group, opts]) => (
                    <div key={group} className="mb-1 last:mb-0">
                      <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted dark:text-muted-dark">
                        {group}
                      </div>
                      {opts.map((opt) => (
                        <button
                          key={opt.token}
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => insertVariable(opt.token)}
                          className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs text-ink hover:bg-cream dark:text-paper dark:hover:bg-[#131316]"
                        >
                          <span className="truncate">{opt.label}</span>
                          <span className="shrink-0 font-mono text-[10px] text-muted dark:text-muted-dark">
                            {`{{${opt.token}}}`}
                          </span>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div
          ref={editorRef}
          contentEditable={!disabled}
          role="textbox"
          aria-multiline
          data-placeholder={placeholder ?? "Scrivi qui..."}
          onMouseUp={() => { saveSelectionRange(); detectLinkAtCaret(); }}
          onKeyUp={() => { saveSelectionRange(); detectLinkAtCaret(); }}
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
            "[&_.tpl-var]:inline-block [&_.tpl-var]:align-baseline [&_.tpl-var]:rounded [&_.tpl-var]:bg-brand-magenta/10 [&_.tpl-var]:px-1.5 [&_.tpl-var]:py-[1px] [&_.tpl-var]:text-[12px] [&_.tpl-var]:font-semibold [&_.tpl-var]:text-brand-magenta [&_.tpl-var]:cursor-default [&_.tpl-var]:select-none",
          ].join(" ")}
        />

        {linkEdit ? (
          <div
            style={{ top: linkEdit.top, left: linkEdit.left }}
            className="absolute z-30 w-72 max-w-[calc(100%-8px)] rounded-md border border-line bg-paper p-2 shadow-lg dark:border-line-dark dark:bg-[#1b1b1f]"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Modifica link</span>
              <a
                href={normalizeUrl(editHref)}
                target="_blank"
                rel="noreferrer noopener"
                className="text-[11px] font-semibold text-brand-magenta hover:underline"
              >
                Apri ↗
              </a>
            </div>
            <input
              ref={editLinkInputRef}
              type="text"
              value={editHref}
              onChange={(event) => setEditHref(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") { event.preventDefault(); applyEditHref(); }
                if (event.key === "Escape") { event.preventDefault(); closeLinkEdit(); }
              }}
              placeholder="https://example.com"
              className="mt-1 w-full rounded-md border border-line px-2 py-1.5 text-xs text-ink outline-none focus:border-ink dark:border-line-dark dark:bg-ink-soft dark:text-paper dark:focus:border-paper"
            />
            <div className="mt-2 flex justify-between gap-1">
              <button
                type="button"
                onClick={removeEditLink}
                className="rounded border border-line px-2 py-1 text-xs font-semibold text-danger hover:bg-danger/10 dark:border-line-dark"
              >
                Rimuovi
              </button>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={closeLinkEdit}
                  className="rounded border border-line px-2 py-1 text-xs font-semibold text-muted hover:text-ink dark:border-line-dark dark:text-muted-dark dark:hover:text-paper"
                >
                  Chiudi
                </button>
                <button
                  type="button"
                  onClick={applyEditHref}
                  className="rounded border border-line bg-ink px-2 py-1 text-xs font-semibold text-paper hover:opacity-90 dark:border-line-dark dark:bg-paper dark:text-ink"
                >
                  Aggiorna
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

    </div>
  );
});
