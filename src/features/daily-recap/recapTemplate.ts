/* eslint-disable @typescript-eslint/no-explicit-any */
// ─────────────────────────────────────────────────────────────────────────────
// Template componibile del recap giornaliero (formattazione stile WhatsApp).
//
// Un template è una lista di BLOCCHI:
//  - "text":  testo libero con formattazioni WhatsApp (*grassetto*, _corsivo_,
//             ~barrato~, ```monospazio```), emoji e variabili {{...}}.
//  - "tasks": elenco automatico di task (arretrate, completate, ...) con campi
//             configurabili e ordinabili per riga.
//
// Il rendering produce TESTO SEMPLICE con i marcatori WhatsApp: incollato in
// chat, WhatsApp lo formatta da solo.
// ─────────────────────────────────────────────────────────────────────────────

export type RecapTaskSource = "overdue" | "done" | "in_progress" | "in_review" | "todo";
export type RecapTaskField = "client" | "title" | "hours" | "deadline" | "urgency" | "note";

export interface RecapTextBlock {
  id: string;
  type: "text";
  content: string;
}

export interface RecapTasksBlock {
  id: string;
  type: "tasks";
  source: RecapTaskSource;
  /** Riga di intestazione della sezione; supporta {{count}}. */
  title: string;
  /** Campi da mostrare per ogni task, NELL'ORDINE scelto. */
  fields: RecapTaskField[];
  /** Urgenza come emoji (🟢⚪🟠🔴) oppure testo (Bassa/Normale/...). */
  urgencyEmoji: boolean;
  /** Prefisso di ogni riga task. */
  bullet: string;
  /** Se true la sezione sparisce quando non ci sono task. */
  hideWhenEmpty: boolean;
  /** Testo mostrato al posto dell'elenco quando vuoto (se hideWhenEmpty è false). */
  emptyText: string;
}

export type RecapBlock = RecapTextBlock | RecapTasksBlock;

export interface RecapTemplate {
  blocks: RecapBlock[];
}

export const RECAP_SOURCE_LABELS: Record<RecapTaskSource, string> = {
  overdue: "Task arretrate",
  done: "Completate",
  in_progress: "In corso",
  in_review: "Fatte e in revisione",
  todo: "Da fare",
};

export const RECAP_FIELD_LABELS: Record<RecapTaskField, string> = {
  client: "Nome cliente",
  title: "Titolo task",
  hours: "Tempo di lavorazione",
  deadline: "Data di scadenza",
  urgency: "Urgenza",
  note: "Nota rimando",
};

/** Variabili disponibili nei blocchi di testo. */
export const RECAP_VARIABLES: Array<{ key: string; label: string }> = [
  { key: "operatore", label: "Nome operatore" },
  { key: "data", label: "Data (estesa)" },
  { key: "task_oggi", label: "Task di oggi (totale)" },
  { key: "completate", label: "N. completate" },
  { key: "in_corso", label: "N. in corso" },
  { key: "da_fare", label: "N. da fare" },
  { key: "in_revisione", label: "N. in revisione" },
  { key: "arretrate", label: "N. arretrate" },
  { key: "ore_oggi", label: "Ore pianificate oggi" },
  { key: "capacita", label: "Capacità del giorno (h)" },
  { key: "ore_tracciate", label: "Ore tracciate" },
  { key: "ore_arretrato", label: "Ore da recuperare" },
];

export function newBlockId(): string {
  return Math.random().toString(36).slice(2, 10);
}

const URGENCY_EMOJI: Record<string, string> = {
  low: "🟢",
  normal: "⚪",
  high: "🟠",
  critical: "🔴",
};
const URGENCY_LABEL: Record<string, string> = {
  low: "Bassa",
  normal: "Normale",
  high: "Alta",
  critical: "Critica",
};

function fmtHours(value: number | null | undefined): string {
  const v = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return v % 1 === 0 ? String(v) : v.toFixed(1);
}

/** Durata in linguaggio umano: 0.5 → "30 min", 1 → "1 ora", 1.5 → "1 ora 30 min", 2 → "2 ore". */
function fmtDurationWords(value: number | null | undefined): string {
  const hours = typeof value === "number" && Number.isFinite(value) ? value : 0;
  const totalMinutes = Math.round(hours * 60);
  if (totalMinutes <= 0) return "0 min";
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const hLabel = h === 1 ? "1 ora" : `${h} ore`;
  if (h > 0 && m > 0) return `${hLabel} ${m} min`;
  if (h > 0) return hLabel;
  return `${m} min`;
}

function fmtDeadline(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "";
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

function taskFieldText(task: any, field: RecapTaskField, urgencyEmoji: boolean): string {
  switch (field) {
    case "client":
      return task?.client_name ? `[${task.client_name}]` : "";
    case "title":
      return task?.title ?? "Senza titolo";
    case "hours": {
      const hours = typeof task?.estimated_hours === "number" ? task.estimated_hours : task?.effective_load_hours;
      return `(${fmtDurationWords(hours)})`;
    }
    case "deadline": {
      const d = fmtDeadline(task?.deadline_date);
      return d ? `scad. ${d}` : "";
    }
    case "urgency": {
      // Task senza urgenza esplicita = "Normale": il campo compare sempre,
      // così l'emoji dell'urgenza è visibile su ogni riga.
      const level = (task?.urgency_level as string | null) || "normal";
      return urgencyEmoji ? (URGENCY_EMOJI[level] ?? "⚪") : `(${URGENCY_LABEL[level] ?? level})`;
    }
    case "note": {
      const note = task?.left_behind_note || task?.left_behind_reason;
      return note ? `— ${note}` : "";
    }
    default:
      return "";
  }
}

function tasksForSource(selfData: any, source: RecapTaskSource): any[] {
  const recap = selfData?.recap;
  if (recap && Array.isArray(recap[source])) return recap[source];
  // Fallback senza recap strutturato: deriva dai task del giorno.
  const tasks: any[] = selfData?.tasks ?? [];
  const isDone = (t: any) => t.is_completed || t.status === "completed" || t.status === "done";
  switch (source) {
    case "done":
      return tasks.filter(isDone);
    case "in_progress":
      return tasks.filter((t) => !isDone(t) && t.status === "in_progress");
    case "in_review":
      return tasks.filter((t) => !isDone(t) && t.status === "review");
    case "todo":
      return tasks.filter((t) => !isDone(t) && t.status !== "in_progress" && t.status !== "review");
    case "overdue":
      return [];
    default:
      return [];
  }
}

function buildVariables(selfData: any, dateIso: string): Record<string, string> {
  const displayName = selfData?.full_name || selfData?.username || "Utente";
  const [y, m, d] = dateIso.split("-").map(Number);
  const dateLabel = new Date(y, (m || 1) - 1, d || 1).toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const recap = selfData?.recap ?? {};
  return {
    operatore: displayName,
    data: dateLabel,
    task_oggi: String(recap.today_total ?? selfData?.tasks_total ?? 0),
    completate: String(recap.done_count ?? selfData?.tasks_completed ?? 0),
    in_corso: String(recap.in_progress_count ?? 0),
    da_fare: String(recap.todo_count ?? 0),
    in_revisione: String(recap.in_review_count ?? 0),
    arretrate: String(recap.overdue_count ?? 0),
    ore_oggi: fmtHours(recap.estimated_hours_today ?? selfData?.estimated_hours_total),
    capacita: fmtHours(recap.capacity_hours ?? selfData?.max_capacity_hours_day),
    ore_tracciate: fmtHours(recap.actual_hours_today ?? selfData?.actual_hours_total),
    ore_arretrato: fmtHours(recap.overdue_hours),
  };
}

function applyVariables(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (raw, key: string) => vars[key] ?? raw);
}

/** Rende il recap in testo (con marcatori WhatsApp) a partire dal template. */
export function renderRecapFromTemplate(template: RecapTemplate, selfData: any, dateIso: string): string {
  const vars = buildVariables(selfData, dateIso);
  const parts: string[] = [];

  for (const block of template.blocks) {
    if (block.type === "text") {
      parts.push(applyVariables(block.content, vars));
      continue;
    }
    const tasks = tasksForSource(selfData, block.source);
    if (tasks.length === 0 && block.hideWhenEmpty) continue;

    const lines: string[] = [];
    if (block.title.trim()) {
      lines.push(applyVariables(block.title.replace(/\{\{\s*count\s*\}\}/g, String(tasks.length)), vars));
    }
    if (tasks.length === 0) {
      if (block.emptyText.trim()) lines.push(block.emptyText);
    } else {
      for (const task of tasks) {
        const cells = block.fields
          .map((field) => taskFieldText(task, field, block.urgencyEmoji))
          .filter(Boolean);
        lines.push(`${block.bullet}${cells.join(" ")}`);
      }
    }
    parts.push(lines.join("\n"));
  }

  return parts.join("\n\n").trimEnd();
}

/** Template di serie: replica il recap storico dell'app. */
export function defaultRecapTemplate(): RecapTemplate {
  const tasksBlock = (
    source: RecapTaskSource,
    title: string,
    fields: RecapTaskField[] = ["client", "title", "hours"],
  ): RecapTasksBlock => ({
    id: newBlockId(),
    type: "tasks",
    source,
    title,
    fields,
    urgencyEmoji: true,
    bullet: "  - ",
    hideWhenEmpty: true,
    emptyText: "Nessuna",
  });

  return {
    blocks: [
      {
        id: newBlockId(),
        type: "text",
        content:
          "*RECAP — {{operatore}} — {{data}}*\n\n" +
          "Task di oggi: {{task_oggi}} (completate {{completate}} · in corso {{in_corso}} · da fare {{da_fare}})\n" +
          "Carico oggi: {{ore_oggi}}h / {{capacita}}h · Tracciate: {{ore_tracciate}}h",
      },
      tasksBlock("done", "*COMPLETATE ({{count}}):*"),
      tasksBlock("in_progress", "*IN CORSO ({{count}}):*"),
      tasksBlock("in_review", "*FATTE E IN REVISIONE ({{count}}):*"),
      tasksBlock("todo", "*DA FARE ({{count}}):*"),
      tasksBlock("overdue", "*ARRETRATE ({{count}}):*", ["client", "title", "hours", "deadline", "urgency", "note"]),
    ],
  };
}

// ── Anteprima WhatsApp: parser dei marcatori inline ──────────────────────────

export interface WaSegment {
  text: string;
  bold: boolean;
  italic: boolean;
  strike: boolean;
  mono: boolean;
}

/** Parser minimale dei marcatori WhatsApp per l'anteprima (una riga alla volta). */
export function parseWaLine(line: string): WaSegment[] {
  const segments: WaSegment[] = [];
  let bold = false;
  let italic = false;
  let strike = false;
  let buffer = "";
  let i = 0;

  const flush = (mono = false) => {
    if (buffer) segments.push({ text: buffer, bold, italic, strike, mono });
    buffer = "";
  };

  while (i < line.length) {
    if (line.startsWith("```", i)) {
      const end = line.indexOf("```", i + 3);
      if (end !== -1) {
        flush();
        buffer = line.slice(i + 3, end);
        flush(true);
        i = end + 3;
        continue;
      }
    }
    const ch = line[i];
    if (ch === "*") {
      flush();
      bold = !bold;
      i += 1;
      continue;
    }
    if (ch === "_") {
      flush();
      italic = !italic;
      i += 1;
      continue;
    }
    if (ch === "~") {
      flush();
      strike = !strike;
      i += 1;
      continue;
    }
    buffer += ch;
    i += 1;
  }
  flush();
  return segments;
}
