/**
 * Raggruppamento delle voci della cassaforte nelle viste richieste.
 *
 * Logica pura, separata dai componenti: la stessa voce compare in viste diverse
 * senza duplicare i dati, e questa parte si può leggere (e correggere) senza
 * aprire il JSX.
 *
 * Il backend risolve già i nomi dei bersagli e il cliente di appartenenza di
 * siti, profili e contratti (`VaultLink.client_id`), quindi qui non servono
 * altre chiamate.
 */

import type { VaultItem, VaultLink } from "../../api/vault";

export type VaultView = "client" | "website" | "social" | "client-tree" | "app";

export const VAULT_VIEW_LABELS: Record<VaultView, string> = {
  client: "Per cliente",
  website: "Per sito",
  social: "Per social",
  "client-tree": "Cliente › siti e social",
  app: "Per app / software",
};

export interface VaultGroup {
  key: string;
  label: string;
  /** Riga secondaria: piattaforma social, numero di voci, ecc. */
  sublabel?: string;
  items: VaultItem[];
  children?: VaultGroup[];
}

const SENZA_CLIENTE = "__nessuno__";

/** Cliente a cui una voce fa capo: link diretto, oppure quello del sito/profilo. */
function clienteDi(item: VaultItem): { id: number | string; nome: string } {
  const diretto = item.links.find((l) => l.target_type === "client");
  if (diretto) {
    return { id: diretto.target_id, nome: diretto.target_label ?? "Cliente" };
  }
  const indiretto = item.links.find((l) => l.client_id != null);
  if (indiretto?.client_id != null) {
    return { id: indiretto.client_id, nome: indiretto.client_name ?? "Cliente" };
  }
  return { id: SENZA_CLIENTE, nome: "Senza cliente" };
}

function perBersaglio(items: VaultItem[], tipo: VaultLink["target_type"]): VaultGroup[] {
  const mappa = new Map<string, VaultGroup>();
  const senza: VaultItem[] = [];

  for (const item of items) {
    const links = item.links.filter((l) => l.target_type === tipo);
    if (links.length === 0) {
      senza.push(item);
      continue;
    }
    // Una voce collegata a due siti compare sotto entrambi: è voluto, la
    // credenziale è davvero la stessa per tutti e due.
    for (const l of links) {
      const key = `${tipo}:${l.target_id}`;
      if (!mappa.has(key)) {
        mappa.set(key, {
          key,
          label: l.target_label ?? `#${l.target_id}`,
          sublabel: l.platform ?? l.client_name ?? undefined,
          items: [],
        });
      }
      mappa.get(key)!.items.push(item);
    }
  }

  const gruppi = [...mappa.values()].sort((a, b) => a.label.localeCompare(b.label));
  if (senza.length) {
    gruppi.push({ key: "__senza__", label: "Non collegate", items: senza });
  }
  return gruppi;
}

function perCliente(items: VaultItem[]): VaultGroup[] {
  const mappa = new Map<string, VaultGroup>();
  for (const item of items) {
    const c = clienteDi(item);
    const key = String(c.id);
    if (!mappa.has(key)) mappa.set(key, { key, label: c.nome, items: [] });
    mappa.get(key)!.items.push(item);
  }
  return [...mappa.values()].sort((a, b) => {
    // "Senza cliente" sempre in fondo, non in mezzo all'alfabeto.
    if (a.key === SENZA_CLIENTE) return 1;
    if (b.key === SENZA_CLIENTE) return -1;
    return a.label.localeCompare(b.label);
  });
}

/** Per cliente, con dentro i sottogruppi Siti e Social. */
function perClienteConSotto(items: VaultItem[]): VaultGroup[] {
  return perCliente(items).map((gruppo) => {
    const siti = perBersaglio(gruppo.items, "website").filter((g) => g.key !== "__senza__");
    const social = perBersaglio(gruppo.items, "social_profile").filter(
      (g) => g.key !== "__senza__"
    );
    const collegate = new Set<number>();
    for (const g of [...siti, ...social]) for (const i of g.items) collegate.add(i.id);

    const children: VaultGroup[] = [];
    if (siti.length) {
      children.push({
        key: `${gruppo.key}:siti`,
        label: "Siti",
        items: [],
        children: siti,
      });
    }
    if (social.length) {
      children.push({
        key: `${gruppo.key}:social`,
        label: "Social",
        items: [],
        children: social,
      });
    }
    return {
      ...gruppo,
      // In cima restano le voci del cliente non legate a un sito o a un profilo.
      items: gruppo.items.filter((i) => !collegate.has(i.id)),
      children,
    };
  });
}

/**
 * App e software: non hanno un'entità nel gestionale, quindi si raggruppano per
 * dominio dell'URL quando c'è — è ciò che fa finire insieme gli account Adobe
 * di clienti diversi. Senza URL si ripiega sull'etichetta.
 */
function perApp(items: VaultItem[]): VaultGroup[] {
  const candidate = items.filter((i) => i.kind === "app" || i.kind === "api_key");
  const mappa = new Map<string, VaultGroup>();
  for (const item of candidate) {
    let key = item.label.trim() || "Senza nome";
    if (item.url) {
      try {
        key = new URL(item.url).hostname.replace(/^www\./, "");
      } catch {
        // URL scritto a mano e non valido: si resta sull'etichetta.
      }
    }
    if (!mappa.has(key)) mappa.set(key, { key, label: key, items: [] });
    mappa.get(key)!.items.push(item);
  }
  return [...mappa.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export function groupItems(items: VaultItem[], view: VaultView): VaultGroup[] {
  switch (view) {
    case "client":
      return perCliente(items);
    case "website":
      return perBersaglio(items, "website");
    case "social":
      return perBersaglio(items, "social_profile");
    case "client-tree":
      return perClienteConSotto(items);
    case "app":
      return perApp(items);
  }
}

/** Voci totali di un gruppo, sottogruppi inclusi. */
export function contaGruppo(g: VaultGroup): number {
  return g.items.length + (g.children ?? []).reduce((n, c) => n + contaGruppo(c), 0);
}
