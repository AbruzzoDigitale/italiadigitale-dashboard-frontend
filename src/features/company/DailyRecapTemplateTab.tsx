/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState } from "react";
import { getRecapTemplateApi, saveRecapTemplateApi } from "../../api/dailyRecap";
import { EmojiPickerPopover } from "../../components/ui/EmojiPickerPopover";
import { WhatsAppPreview } from "../daily-recap/WhatsAppPreview";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { Input } from "../../components/ui/Input";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import { useToast } from "../../context/ToastContext";
import { useTheme } from "../../context/ThemeContext";
import { useAuth } from "../../hooks/useAuth";
import { getCompanyLogoUrl } from "../../utils/companyLogo";
import {
  defaultRecapTemplate,
  newBlockId,
  renderRecapFromTemplate,
  RECAP_FIELD_LABELS,
  RECAP_SOURCE_LABELS,
  RECAP_VARIABLES,
  type RecapBlock,
  type RecapTaskField,
  type RecapTasksBlock,
  type RecapTaskSource,
  type RecapTemplate,
  type RecapTextBlock,
} from "../daily-recap/recapTemplate";

// ── Dati finti per l'anteprima ───────────────────────────────────────────────
const SAMPLE_SELF = {
  full_name: "Luigi",
  recap: {
    today_total: 5,
    done_count: 2,
    in_progress_count: 1,
    todo_count: 2,
    in_review_count: 1,
    overdue_count: 2,
    estimated_hours_today: 6,
    today_hours: 4.5,
    capacity_hours: 8,
    actual_hours_today: 4.5,
    overdue_hours: 3,
    overdue_hours_weighted: 1.5,
    done: [
      { client_name: "TETO S.R.L.", title: "PED Agosto", estimated_hours: 1, deadline_date: "2026-08-01", urgency_level: "normal" },
      { client_name: "EDIMOBILI S.R.L.", title: "Storie promo", estimated_hours: 0.5, deadline_date: "2026-08-01", urgency_level: "low" },
    ],
    in_progress: [
      { client_name: "WECOVER", title: "Sito web", estimated_hours: 2, deadline_date: "2026-08-05", urgency_level: "high" },
    ],
    in_review: [
      { client_name: "ATLANTIC SRL", title: "PED Agosto", estimated_hours: 1.5, deadline_date: "2026-08-02", urgency_level: "normal" },
    ],
    todo: [
      { client_name: "PALME S.R.L.", title: "Reel Aquamarina", estimated_hours: 1, deadline_date: "2026-08-01", urgency_level: "normal" },
      { client_name: "MAICON SRL", title: "Banner ADV", estimated_hours: 1, deadline_date: "2026-08-03", urgency_level: "low" },
    ],
    overdue: [
      { client_name: "LAS MOBILI S.R.L.", title: "Editing reel", estimated_hours: 4, deadline_date: "2026-07-28", urgency_level: "critical", left_behind_note: "in attesa materiali" },
      { client_name: "SA.PA. S.A.S.", title: "ADV Asporto", estimated_hours: 1, deadline_date: "2026-07-30", urgency_level: "high" },
    ],
  },
};

const QUICK_EMOJIS = ["✅", "🔥", "💪", "🚀", "📌", "⏰", "⚠️", "🎯", "👏", "☕"];

const ALL_FIELDS = Object.keys(RECAP_FIELD_LABELS) as RecapTaskField[];

function MiniSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 flex-none rounded-pill transition-colors ${
        checked ? "bg-ink dark:bg-[#f4f4f7]" : "bg-line dark:bg-[#2a2a2e]"
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-paper transition-all dark:bg-ink ${
          checked ? "left-[18px]" : "left-0.5"
        }`}
      />
    </button>
  );
}

// ── Blocco testo: textarea + toolbar formattazioni WhatsApp/emoji/variabili ──
function TextBlockEditor({
  block,
  onChange,
}: {
  block: RecapTextBlock;
  onChange: (patch: Partial<RecapTextBlock>) => void;
}) {
  const areaRef = useRef<HTMLTextAreaElement | null>(null);

  const applyEdit = (next: string, caret: number) => {
    onChange({ content: next });
    requestAnimationFrame(() => {
      const area = areaRef.current;
      if (area) {
        area.focus();
        area.setSelectionRange(caret, caret);
      }
    });
  };

  const wrapSelection = (marker: string) => {
    const area = areaRef.current;
    if (!area) return;
    const { selectionStart: start, selectionEnd: end, value } = area;
    const selected = value.slice(start, end) || "testo";
    const next = value.slice(0, start) + marker + selected + marker + value.slice(end);
    applyEdit(next, start + marker.length + selected.length + marker.length);
  };

  const insertAtCursor = (text: string) => {
    const area = areaRef.current;
    if (!area) {
      onChange({ content: block.content + text });
      return;
    }
    const { selectionStart: start, selectionEnd: end, value } = area;
    const next = value.slice(0, start) + text + value.slice(end);
    applyEdit(next, start + text.length);
  };

  const toolBtn =
    "inline-grid h-7 min-w-7 place-items-center rounded-md border border-line px-1.5 text-[12px] font-semibold text-ink transition-colors hover:bg-cream dark:border-[#2a2a2e] dark:text-[#f4f4f7] dark:hover:bg-[#1c1c20]";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" title="Grassetto (*testo*)" className={`${toolBtn} font-black`} onClick={() => wrapSelection("*")}>
          B
        </button>
        <button type="button" title="Corsivo (_testo_)" className={`${toolBtn} italic`} onClick={() => wrapSelection("_")}>
          I
        </button>
        <button type="button" title="Barrato (~testo~)" className={`${toolBtn} line-through`} onClick={() => wrapSelection("~")}>
          S
        </button>
        <button type="button" title="Monospazio (```testo```)" className={`${toolBtn} font-mono`} onClick={() => wrapSelection("```")}>
          {"</>"}
        </button>

        <span className="mx-1 h-5 w-px bg-line dark:bg-[#2a2a2e]" />

        {QUICK_EMOJIS.map((emoji) => (
          <button key={emoji} type="button" className={toolBtn} onClick={() => insertAtCursor(emoji)}>
            {emoji}
          </button>
        ))}
        <EmojiPickerPopover
          onPick={insertAtCursor}
          renderTrigger={({ ref, toggle }) => (
            <button ref={ref} type="button" title="Tutte le emoji" className={toolBtn} onClick={toggle}>
              <Icon name="plus" className="h-3 w-3" />
            </button>
          )}
        />

        <span className="mx-1 h-5 w-px bg-line dark:bg-[#2a2a2e]" />

        <div className="w-56">
          <SearchableSelect
            value=""
            onChange={(key) => key && insertAtCursor(`{{${key}}}`)}
            options={RECAP_VARIABLES.map((v) => ({ value: v.key, label: v.label, keywords: v.key }))}
            placeholder="Inserisci variabile…"
            showAvatar={false}
            menuLayer="portal"
          />
        </div>
      </div>

      <textarea
        ref={areaRef}
        value={block.content}
        onChange={(event) => onChange({ content: event.target.value })}
        rows={Math.max(3, Math.min(10, block.content.split("\n").length + 1))}
        className="w-full resize-y rounded-md border border-line bg-paper px-3 py-2.5 font-body text-[13px] leading-relaxed text-ink outline-none transition-colors focus:border-ink dark:border-[#2a2a2e] dark:bg-ink-soft dark:text-paper dark:focus:border-paper"
        placeholder="Testo del recap… usa *grassetto*, _corsivo_, ~barrato~, ```monospazio``` e le variabili {{...}}"
      />
    </div>
  );
}

// ── Blocco task: sorgente + campi ordinabili + opzioni ───────────────────────
function TasksBlockEditor({
  block,
  onChange,
}: {
  block: RecapTasksBlock;
  onChange: (patch: Partial<RecapTasksBlock>) => void;
}) {
  const inactive = ALL_FIELDS.filter((f) => !block.fields.includes(f));
  const titleRef = useRef<HTMLInputElement | null>(null);

  const insertInTitle = (text: string) => {
    const el = titleRef.current;
    const start = el?.selectionStart ?? block.title.length;
    const end = el?.selectionEnd ?? start;
    const next = block.title.slice(0, start) + text + block.title.slice(end);
    onChange({ title: next });
    requestAnimationFrame(() => {
      if (el) {
        el.focus();
        el.setSelectionRange(start + text.length, start + text.length);
      }
    });
  };

  const moveField = (index: number, dir: -1 | 1) => {
    const next = [...block.fields];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange({ fields: next });
  };

  const emojiBtn =
    "inline-grid h-7 w-7 place-items-center rounded-md border border-line text-[13px] transition-colors hover:bg-cream dark:border-[#2a2a2e] dark:hover:bg-[#1c1c20]";

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
            Quali task
          </span>
          <SearchableSelect
            value={block.source}
            onChange={(v) => v && onChange({ source: v as RecapTaskSource })}
            options={(Object.keys(RECAP_SOURCE_LABELS) as RecapTaskSource[]).map((s) => ({
              value: s,
              label: RECAP_SOURCE_LABELS[s],
            }))}
            showAvatar={false}
            menuLayer="portal"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Input
            ref={titleRef}
            label="Titolo sezione"
            value={block.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="*ARRETRATE ({{count}}):*"
            hint="Supporta {{count}}, emoji e le formattazioni WhatsApp."
          />
          <div className="flex items-center gap-1.5">
            {["📌", "⚠️", "🔥", "✅", "⏰"].map((emoji) => (
              <button key={emoji} type="button" className={emojiBtn} onClick={() => insertInTitle(emoji)}>
                {emoji}
              </button>
            ))}
            <EmojiPickerPopover
              onPick={insertInTitle}
              renderTrigger={({ ref, toggle }) => (
                <button ref={ref} type="button" title="Tutte le emoji" className={emojiBtn} onClick={toggle}>
                  <Icon name="plus" className="h-3 w-3" />
                </button>
              )}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
          Campi della riga (in ordine)
        </span>
        <p className="text-[11.5px] text-muted dark:text-[#9999a0]">
          L'ordine dei campi è l'ordine nella riga: sposta "Urgenza" con le frecce per decidere dove
          va l'emoji (anche all'inizio).
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {block.fields.map((field, index) => (
            <span
              key={field}
              className="inline-flex items-center gap-1 rounded-pill border border-ink/20 bg-cream px-2 py-1 text-[11.5px] font-semibold text-ink dark:border-[#3c3c42] dark:bg-[#1c1c20] dark:text-[#f4f4f7]"
            >
              {field === "urgency"
                ? `Urgenza ${block.urgencyEmoji ? "🟠" : "(testo)"}`
                : RECAP_FIELD_LABELS[field]}
              <button type="button" title="Sposta a sinistra" className="opacity-60 hover:opacity-100 disabled:opacity-20" disabled={index === 0} onClick={() => moveField(index, -1)}>
                <Icon name="chevron-right" className="h-3 w-3 rotate-180" />
              </button>
              <button type="button" title="Sposta a destra" className="opacity-60 hover:opacity-100 disabled:opacity-20" disabled={index === block.fields.length - 1} onClick={() => moveField(index, 1)}>
                <Icon name="chevron-right" className="h-3 w-3" />
              </button>
              <button
                type="button"
                title="Rimuovi campo"
                className="opacity-60 hover:opacity-100"
                onClick={() => onChange({ fields: block.fields.filter((f) => f !== field) })}
              >
                <Icon name="x" className="h-3 w-3" />
              </button>
            </span>
          ))}
          {inactive.map((field) => (
            <button
              key={field}
              type="button"
              onClick={() => onChange({ fields: [...block.fields, field] })}
              className="inline-flex items-center gap-1 rounded-pill border border-dashed border-line px-2 py-1 text-[11.5px] font-semibold text-muted transition-colors hover:border-ink hover:text-ink dark:border-[#2a2a2e] dark:text-[#9999a0] dark:hover:border-[#f4f4f7] dark:hover:text-[#f4f4f7]"
            >
              <Icon name="plus" className="h-3 w-3" />
              {RECAP_FIELD_LABELS[field]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <label className="flex items-center gap-2 text-[12.5px] font-semibold text-ink dark:text-[#f4f4f7]">
          <MiniSwitch checked={block.urgencyEmoji} onChange={(v) => onChange({ urgencyEmoji: v })} />
          Urgenza con emoji (🟢⚪🟠🔴)
        </label>
        <label className="flex items-center gap-2 text-[12.5px] font-semibold text-ink dark:text-[#f4f4f7]">
          <MiniSwitch checked={block.hideWhenEmpty} onChange={(v) => onChange({ hideWhenEmpty: v })} />
          Nascondi la sezione se vuota
        </label>
        {!block.hideWhenEmpty && (
          <div className="w-56">
            <Input
              label="Testo se vuota"
              value={block.emptyText}
              onChange={(e) => onChange({ emptyText: e.target.value })}
              placeholder="Nessuna 🎉"
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tab principale ───────────────────────────────────────────────────────────
interface DailyRecapTemplateTabProps {
  companyId: number;
  isAdmin: boolean;
}

export function DailyRecapTemplateTab({ companyId, isAdmin }: DailyRecapTemplateTabProps) {
  const toast = useToast();
  const { theme } = useTheme();
  const { myCompanies } = useAuth();
  const company = myCompanies.find((c) => c.id === companyId);
  const companyLogoUrl = company ? getCompanyLogoUrl(company, theme) : null;
  const [template, setTemplate] = useState<RecapTemplate>(defaultRecapTemplate());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    getRecapTemplateApi(companyId)
      .then((saved) => setTemplate(saved ?? defaultRecapTemplate()))
      .catch(() => setTemplate(defaultRecapTemplate()))
      .finally(() => setLoading(false));
  }, [companyId]);

  const updateBlock = (id: string, patch: Partial<RecapBlock>) => {
    setTemplate((current) => ({
      blocks: current.blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as RecapBlock) : b)),
    }));
  };

  const moveBlock = (id: string, dir: -1 | 1) => {
    setTemplate((current) => {
      const index = current.blocks.findIndex((b) => b.id === id);
      const target = index + dir;
      if (index < 0 || target < 0 || target >= current.blocks.length) return current;
      const blocks = [...current.blocks];
      [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
      return { blocks };
    });
  };

  const removeBlock = (id: string) => {
    setTemplate((current) => ({ blocks: current.blocks.filter((b) => b.id !== id) }));
  };

  const addBlock = (type: "text" | "tasks") => {
    const block: RecapBlock =
      type === "text"
        ? { id: newBlockId(), type: "text", content: "" }
        : {
            id: newBlockId(),
            type: "tasks",
            source: "overdue",
            title: "*ARRETRATE ({{count}}):*",
            fields: ["client", "title", "hours", "deadline", "urgency"],
            urgencyEmoji: true,
            bullet: "  - ",
            hideWhenEmpty: true,
            emptyText: "Nessuna 🎉",
          };
    setTemplate((current) => ({ blocks: [...current.blocks, block] }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveRecapTemplateApi(companyId, template);
      toast.success("Template del recap salvato");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    try {
      await saveRecapTemplateApi(companyId, null);
      setTemplate(defaultRecapTemplate());
      toast.success("Ripristinato il recap di serie");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nel ripristino");
    } finally {
      setSaving(false);
    }
  };

  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate()
  ).padStart(2, "0")}`;
  const previewText = useMemo(
    () => renderRecapFromTemplate(template, SAMPLE_SELF, todayIso),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [template]
  );

  return (
    <div className="bg-paper dark:bg-[#131316] rounded-lg border border-line dark:border-[#2a2a2e] p-6">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="mb-1 font-display font-bold tracking-tight text-ink dark:text-[#f4f4f7]" style={{ fontSize: "17px" }}>
            Recap giornaliero
          </h2>
          <p className="font-body text-[13px] text-muted dark:text-[#9999a0]">
            Il messaggio della giornata dei tuoi operatori, componibile a blocchi: testo formattato per
            WhatsApp + elenchi automatici di task con i campi che scegli tu.
          </p>
        </div>
        {isAdmin && (
          <div className="flex flex-none items-center gap-2">
            <Button variant="ghost" onClick={() => void handleReset()} disabled={saving || loading}>
              Ripristina default
            </Button>
            <Button variant="primary" onClick={() => void handleSave()} loading={saving} disabled={loading}>
              Salva template
            </Button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="sp-skeleton h-28 rounded-xl border border-line dark:border-[#2a2a2e]" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
          {/* Editor a blocchi */}
          <div className="flex min-w-0 flex-col gap-3">
            {template.blocks.map((block, index) => (
              <div
                key={block.id}
                className="rounded-xl border border-line bg-cream/50 p-4 dark:border-[#2a2a2e] dark:bg-[#18181c]"
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                    <Icon name={block.type === "text" ? "annotation" : "list"} className="h-3.5 w-3.5" />
                    {block.type === "text" ? "Blocco testo" : `Elenco task · ${RECAP_SOURCE_LABELS[block.source]}`}
                  </span>
                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      title="Sposta su"
                      disabled={index === 0}
                      onClick={() => moveBlock(block.id, -1)}
                      className="inline-grid h-7 w-7 place-items-center rounded-md border border-line text-ink transition-colors hover:bg-paper disabled:opacity-30 dark:border-[#2a2a2e] dark:text-[#f4f4f7] dark:hover:bg-[#131316]"
                    >
                      <Icon name="chevron-down" className="h-3.5 w-3.5 rotate-180" />
                    </button>
                    <button
                      type="button"
                      title="Sposta giù"
                      disabled={index === template.blocks.length - 1}
                      onClick={() => moveBlock(block.id, 1)}
                      className="inline-grid h-7 w-7 place-items-center rounded-md border border-line text-ink transition-colors hover:bg-paper disabled:opacity-30 dark:border-[#2a2a2e] dark:text-[#f4f4f7] dark:hover:bg-[#131316]"
                    >
                      <Icon name="chevron-down" className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Elimina blocco"
                      onClick={() => removeBlock(block.id)}
                      className="inline-grid h-7 w-7 place-items-center rounded-md border border-danger/20 bg-danger/5 text-danger transition-colors hover:bg-danger/10"
                    >
                      <Icon name="trash" className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </div>

                {block.type === "text" ? (
                  <TextBlockEditor block={block} onChange={(patch) => updateBlock(block.id, patch)} />
                ) : (
                  <TasksBlockEditor block={block} onChange={(patch) => updateBlock(block.id, patch)} />
                )}
              </div>
            ))}

            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => addBlock("text")} leftIcon={<Icon name="plus" className="h-3.5 w-3.5" />}>
                Blocco testo
              </Button>
              <Button variant="secondary" onClick={() => addBlock("tasks")} leftIcon={<Icon name="plus" className="h-3.5 w-3.5" />}>
                Elenco task
              </Button>
            </div>
          </div>

          {/* Anteprima */}
          <div className="flex min-w-0 flex-col gap-2 xl:sticky xl:top-4 xl:self-start">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted dark:text-[#9999a0]">
              Anteprima WhatsApp (dati di esempio)
            </span>
            <WhatsAppPreview text={previewText} avatarUrl={companyLogoUrl} />
          </div>
        </div>
      )}
    </div>
  );
}
