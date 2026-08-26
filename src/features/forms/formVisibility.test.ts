import { describe, expect, it } from "vitest";
import type { FormField, FormSection } from "../../api/forms";
import { conditionMatches, missingRequired, visibleFields } from "./formVisibility";

/**
 * Questa logica è il gemello lato client di `_matches` / `visible_fields` in
 * app/services/forms.py. Se le due divergono, l'utente vede un modulo che il
 * server rifiuta (o viceversa): i casi qui sotto sono gli stessi del collaudo
 * backend, così la differenza salta fuori subito.
 */

function campo(over: Partial<FormField> & { key: string }): FormField {
  return {
    id: 0,
    section_id: null,
    label: over.key,
    field_type: "text",
    help_text: null,
    is_required: false,
    position: 0,
    options: null,
    allow_other: false,
    source: null,
    visible_if: null,
    config: null,
    ...over,
  };
}

function sezione(over: Partial<FormSection> & { id: number }): FormSection {
  return { title: "", description: null, position: 0, visible_if: null, ...over };
}

describe("conditionMatches", () => {
  it("senza condizione mostra sempre", () => {
    expect(conditionMatches(null, {})).toBe(true);
  });

  it("eq confronta come testo, così 'NO' e 'no' restano distinti", () => {
    expect(conditionMatches({ field_key: "t", operator: "eq", value: "NO" }, { t: "NO" })).toBe(true);
    expect(conditionMatches({ field_key: "t", operator: "eq", value: "NO" }, { t: "SI" })).toBe(false);
  });

  it("neq è il contrario di eq", () => {
    expect(conditionMatches({ field_key: "t", operator: "neq", value: "NO" }, { t: "SI" })).toBe(true);
  });

  it("in accetta sia un valore singolo sia una scelta multipla", () => {
    const cond = { field_key: "t", operator: "in" as const, value: ["A", "B"] };
    expect(conditionMatches(cond, { t: "B" })).toBe(true);
    expect(conditionMatches(cond, { t: ["C", "A"] })).toBe(true);
    expect(conditionMatches(cond, { t: "Z" })).toBe(false);
  });

  it("filled ed empty trattano stringa vuota e lista vuota come «non compilato»", () => {
    const filled = { field_key: "t", operator: "filled" as const };
    const empty = { field_key: "t", operator: "empty" as const };
    expect(conditionMatches(filled, { t: "x" })).toBe(true);
    expect(conditionMatches(filled, { t: "" })).toBe(false);
    expect(conditionMatches(filled, { t: [] })).toBe(false);
    expect(conditionMatches(empty, { t: undefined })).toBe(true);
  });

  it("una risposta assente non soddisfa un confronto di uguaglianza", () => {
    expect(conditionMatches({ field_key: "t", operator: "eq", value: "NO" }, {})).toBe(false);
  });
});

describe("visibleFields", () => {
  const campi = [
    campo({ key: "tema", options: ["SI", "NO"], field_type: "select", position: 0 }),
    campo({
      key: "problemi",
      position: 1,
      is_required: true,
      visible_if: { field_key: "tema", operator: "eq", value: "NO" },
    }),
  ];

  it("nasconde il campo finché la condizione non si avvera", () => {
    expect(visibleFields(campi, [], { tema: "SI" }).map((f) => f.key)).toEqual(["tema"]);
  });

  it("lo mostra quando la condizione si avvera", () => {
    expect(visibleFields(campi, [], { tema: "NO" }).map((f) => f.key)).toEqual(["tema", "problemi"]);
  });

  it("una sezione nascosta nasconde tutti i suoi campi", () => {
    const sezioni = [sezione({ id: 7, visible_if: { field_key: "tema", operator: "eq", value: "NO" } })];
    const dentro = [campo({ key: "dettaglio", section_id: 7 })];
    expect(visibleFields(dentro, sezioni, { tema: "SI" })).toHaveLength(0);
    expect(visibleFields(dentro, sezioni, { tema: "NO" })).toHaveLength(1);
  });
});

describe("missingRequired", () => {
  const campi = [
    campo({ key: "tema", is_required: true }),
    campo({
      key: "problemi",
      is_required: true,
      visible_if: { field_key: "tema", operator: "eq", value: "NO" },
    }),
    campo({ key: "data", is_required: true, source: "today" }),
    campo({ key: "prova", is_required: true, field_type: "file" }),
  ];

  it("un obbligatorio nascosto non blocca la consegna", () => {
    const mancanti = missingRequired(campi, [], { tema: "SI" }, { prova: 1 });
    expect(mancanti.map((f) => f.key)).toEqual([]);
  });

  it("quando la condizione si avvera l'obbligatorio torna a contare", () => {
    const mancanti = missingRequired(campi, [], { tema: "NO" }, { prova: 1 });
    expect(mancanti.map((f) => f.key)).toEqual(["problemi"]);
  });

  it("i campi automatici non si pretendono da chi compila", () => {
    const mancanti = missingRequired(campi, [], { tema: "SI" }, { prova: 1 });
    expect(mancanti.map((f) => f.key)).not.toContain("data");
  });

  it("un allegato obbligatorio senza file manca", () => {
    const mancanti = missingRequired(campi, [], { tema: "SI" }, {});
    expect(mancanti.map((f) => f.key)).toEqual(["prova"]);
  });
});
