import { describe, expect, it } from "vitest";
import { isMaintenanceTitle, withMaintenancePrefix } from "./maintenance";

describe("isMaintenanceTitle", () => {
  it("riconosce manutenzione e aggiornamento, in ogni declinazione", () => {
    expect(isMaintenanceTitle("Manutenzione sito — abruzzodigitale.it")).toBe(true);
    expect(isMaintenanceTitle("manutenzioni di settembre")).toBe(true);
    expect(isMaintenanceTitle("Aggiornamento plugin WordPress")).toBe(true);
    expect(isMaintenanceTitle("aggiornamenti sito cliente")).toBe(true);
  });

  it("non scatta su parole diverse o titoli vuoti", () => {
    expect(isMaintenanceTitle("Post Instagram di agosto")).toBe(false);
    expect(isMaintenanceTitle("PED settembre")).toBe(false);
    expect(isMaintenanceTitle("")).toBe(false);
    expect(isMaintenanceTitle(null)).toBe(false);
  });
});

describe("withMaintenancePrefix", () => {
  it("lascia stare il titolo che lo dice già", () => {
    expect(withMaintenancePrefix("Manutenzione sito — pippo.it")).toBe("Manutenzione sito — pippo.it");
    expect(withMaintenancePrefix("Aggiornamento tema")).toBe("Aggiornamento tema");
  });

  it("antepone la dicitura agli altri", () => {
    expect(withMaintenancePrefix("pippo.it")).toBe("Manutenzione sito — pippo.it");
    expect(withMaintenancePrefix("  pippo.it  ")).toBe("Manutenzione sito — pippo.it");
    expect(withMaintenancePrefix("")).toBe("Manutenzione sito");
  });
});
