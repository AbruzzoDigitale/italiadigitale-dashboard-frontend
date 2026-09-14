import type { FieldCondition, FormField, FormSection } from "../../api/forms";

/**
 * Valutazione dei campi condizionali, gemella di `_matches` in
 * app/services/forms.py. Il backend resta l'autorità — qui serve solo a non
 * mostrare domande che non c'entrano mentre si compila.
 */

export type AnswerMap = Record<string, string | string[] | boolean | number | null | undefined>;

function isEmpty(value: AnswerMap[string]): boolean {
  return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
}

export function conditionMatches(condition: FieldCondition | null, answers: AnswerMap): boolean {
  if (!condition) return true;
  const current = answers[condition.field_key];

  if (condition.operator === "filled") return !isEmpty(current);
  if (condition.operator === "empty") return isEmpty(current);
  if (current === null || current === undefined) return false;

  if (condition.operator === "eq") return String(current) === String(condition.value);
  if (condition.operator === "neq") return String(current) !== String(condition.value);
  if (condition.operator === "in") {
    const allowed = (Array.isArray(condition.value) ? condition.value : [condition.value]).map(String);
    if (Array.isArray(current)) return current.some((c) => allowed.includes(String(c)));
    return allowed.includes(String(current));
  }
  return true;
}

/** Campi da mostrare date le risposte attuali (sezione nascosta = campi nascosti). */
export function visibleFields(
  fields: FormField[],
  sections: FormSection[],
  answers: AnswerMap
): FormField[] {
  const sectionVisible = new Map<number, boolean>();
  sections.forEach((s) => sectionVisible.set(s.id, conditionMatches(s.visible_if, answers)));

  return [...fields]
    .sort((a, b) => a.position - b.position)
    .filter((field) => {
      if (field.section_id != null && sectionVisible.get(field.section_id) === false) return false;
      return conditionMatches(field.visible_if, answers);
    });
}

/** Sezioni visibili che hanno almeno un campo da mostrare. */
export function visibleSections(
  fields: FormField[],
  sections: FormSection[],
  answers: AnswerMap
): FormSection[] {
  const shown = visibleFields(fields, sections, answers);
  const withFields = new Set(shown.map((f) => f.section_id).filter((id): id is number => id != null));
  return [...sections].sort((a, b) => a.position - b.position).filter((s) => withFields.has(s.id));
}

/**
 * Obbligatori ancora mancanti fra i campi VISIBILI: un campo nascosto da una
 * condizione non blocca la consegna, esattamente come lato server.
 */
export function missingRequired(
  fields: FormField[],
  sections: FormSection[],
  answers: AnswerMap,
  attachmentCounts: Record<string, number> = {}
): FormField[] {
  return visibleFields(fields, sections, answers).filter((field) => {
    if (!field.is_required) return false;
    // I campi automatici li riempie il server col contesto.
    if (field.source) return false;
    if (field.field_type === "file") return !attachmentCounts[field.key];
    return isEmpty(answers[field.key]);
  });
}
