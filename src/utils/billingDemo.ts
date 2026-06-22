import type { BillingItem } from "./billing";

// ─────────────────────────────────────────────────────────────────────────────
// Dati DEMO solo-frontend per la pagina Fatturazione.
//
// Servono per provare flusso e UI senza toccare alcun backend (nessuna scrittura
// su produzione). Riproducono lo scenario d'esempio del cliente D.G.L. più un
// secondo cliente per mostrare il raggruppamento. In fase di integrazione questo
// file può essere rimosso insieme al toggle "Modalità demo".
// ─────────────────────────────────────────────────────────────────────────────

export const DEMO_BILLING_ITEMS: BillingItem[] = [
  // ── D.G.L. S.R.L. ──────────────────────────────────────────────────────────
  {
    key: "demo:dgl:una_tantum:strategia",
    clientId: 9001,
    clientName: "D.G.L. S.R.L.",
    contractId: 7001,
    contractTitle: "Social Media Marketing Albergo Ristorante Val Vomano",
    workItemId: 80001,
    description: "Strategia Social Media Marketing",
    kind: "una_tantum",
    month: null,
    monthLabel: null,
    amount: 500,
    status: "fatturato",
    ficPlaceholder: true,
  },
  {
    key: "demo:dgl:canone:2026-06",
    clientId: 9001,
    clientName: "D.G.L. S.R.L.",
    contractId: 7001,
    contractTitle: "Social Media Marketing Albergo Ristorante Val Vomano",
    workItemId: 80002,
    description: "PED Giugno 2026 – Ristorante Albergo Val Vomano",
    kind: "canone",
    month: "2026-06",
    monthLabel: "Giugno 2026",
    amount: 750,
    status: "da_fatturare",
    ficPlaceholder: false,
  },
  {
    key: "demo:dgl:canone:2026-05",
    clientId: 9001,
    clientName: "D.G.L. S.R.L.",
    contractId: 7001,
    contractTitle: "Social Media Marketing Albergo Ristorante Val Vomano",
    workItemId: 80003,
    description: "PED Maggio 2026 – Ristorante Albergo Val Vomano",
    kind: "canone",
    month: "2026-05",
    monthLabel: "Maggio 2026",
    amount: 750,
    status: "da_fatturare",
    ficPlaceholder: false,
  },
  // ── Costa Verde S.a.s. ─────────────────────────────────────────────────────
  {
    key: "demo:costaverde:una_tantum:setup",
    clientId: 9002,
    clientName: "Costa Verde S.a.s.",
    contractId: 7002,
    contractTitle: "Social Media Marketing Costa Verde Mare",
    workItemId: 80010,
    description: "Setup canali e brand kit",
    kind: "una_tantum",
    month: null,
    monthLabel: null,
    amount: 300,
    status: "da_fatturare",
    ficPlaceholder: false,
  },
  {
    key: "demo:costaverde:canone:2026-06",
    clientId: 9002,
    clientName: "Costa Verde S.a.s.",
    contractId: 7002,
    contractTitle: "Social Media Marketing Costa Verde Mare",
    workItemId: 80011,
    description: "PED Giugno 2026 – Costa Verde Mare",
    kind: "canone",
    month: "2026-06",
    monthLabel: "Giugno 2026",
    amount: 620,
    status: "da_fatturare",
    ficPlaceholder: false,
  },
];
