# Fatturazione — Design (handoff)

> Progettazione della sezione Fatturazione: dai preventivi/contratti alla fattura
> elettronica in bozza su Fatture in Cloud (FIC). Documento di riferimento condiviso,
> **prima** dell'implementazione.

## Decisioni prese
- **Legame lavorazione → voce di preventivo**: **snapshot congelato + fallback**.
  Verificato in `quotes.py`: `_sync_quote_items` fa `quote.quote_items.clear()` e **ricrea**
  i `quote_items` a ogni salvataggio del preventivo → un FK `quote_item_id` sarebbe **volatile**
  e si romperebbe. Quindi, alla generazione della task, **congeliamo uno snapshot della voce**
  sorgente in `work_items.billing_source` (JSON: `quote_id`, `line_key`, `label`, `description`,
  `billing_period`, `unit_net`, `quantity`, `discount_pct`, `vat`, `area_id`, `area_name`).
  Lo snapshot sopravvive alle modifiche/versioni del preventivo; la fatturazione legge da lì.
  Per le task legacy/senza snapshot, fallback di matching su titolo + descrizione + UDM + area/importo.
  ✅ Implementato: colonna `work_items.billing_source` (migrazione `a9b0c1d2e3f4`).
- **Creazione fattura FIC**: **nuova fattura ricostruita dai dati del preventivo** (voci
  scelte, senza quelle non dovute), `type: invoice`, e-invoice, con scadenza e oggetto,
  lasciata in **bozza**. Nessuna dipendenza da un endpoint "convert" di FIC. **Invio allo
  SDI sempre manuale in FIC.**

---

## 1. Stato attuale (cosa esiste)

- `billing_items` è un **overlay**: il "da fatturare" è **derivato a runtime** dalle
  lavorazioni **completate e collegate a un contratto**; la tabella persiste solo le righe
  già emesse. Vincolo unico su `work_item_id` (una riga per lavorazione).
  → `app/services/billing.py` (`build_billing_items`, `_derive`, `_completed_linked_work_items`).
- **Importo attuale** = prezzo dell'**intero contratto**: `selected_monthly` (canone) o
  `selected_one_time` (una tantum), da `_contract_amounts` → `_quote_links_payload`.
  **Non** c'è risoluzione per singola voce.
- **Tipo** canone/una_tantum = `is_ped || is_recurring` sulla lavorazione (`_billing_type`).
- **Mese di competenza** = `work_date` (fallback `updated_at`).
- **FIC**: `app/api/v1/endpoints/fic.py` crea **solo** `issued_documents` `type: "quote"`
  (`fic_push_quote`). Nessuna fattura, nessun `due_date`, nessun invio SDI, nessun
  "trasforma preventivo→fattura". Client inline `httpx`, helper riusabili:
  `_get_fic_token`, `_get_fic_company_id`, `_get_fic_vat_map`.
- `BILLING_FIC_PUSH_ENABLED = False` (`app/api/v1/endpoints/billing.py`): "Genera" scrive
  solo un numero segnaposto locale (`LOC YYYY/NNNN`). Hook reale documentato a
  `billing.py:155-160`.
- Voci preventivo: JSON `Quote.lines` **+** tabella normalizzata `quote_items`
  (`QuoteItem`: `label`, `description`, `billing_period`, `unit_net`, `quantity`,
  `discount_pct`, `vat_rate`, `catalog_service_id`, `source_area_id`, `meta`).
  Sconto 100% → `discountPct=100` ⇒ importo riga 0, ma la riga resta visibile.
- **Manca** qualunque legame lavorazione → voce di preventivo. Solo lavorazione → contratto
  (`WorkItemContractLink`) e `work_items.ai_source_contract_id`.

## 2. Il nodo centrale

Tutta la fatturazione **selettiva** (fatturare la strategia ma non la config Meta, un solo
mese e non sei, riconoscere le aree) dipende dal poter dire **a quale voce di preventivo**
corrisponde una lavorazione. Oggi non è possibile.

**Soluzione**: legame esplicito `work_items.quote_item_id`, valorizzato alla generazione
della task dal preventivo; fallback di matching per le task legacy.

## 3. Modello dati proposto

1. **`work_items.quote_item_id`** — FK `quote_items(id)`, nullable. Voce sorgente della
   lavorazione. Valorizzato dalla generazione task da contratto/preventivo.
   - ⚠️ **Versioni preventivo**: il preventivo si modifica *in place* (stesso `quote.id`),
     ma i `quote_items` possono essere ricreati al re-save → l'`id` cambia. Ancorare quindi
     il legame a un'**identità stabile** della voce: campo `line_key` stabile su `quote_items`
     (hash di `catalog_service_id` + `source_area_id` + `label`, o UUID persistito e
     ri-mappato al salvataggio). Il legame task usa `line_key`, non l'`id` volatile.

2. **`billing_items`** esteso (snapshot al momento dell'emissione):
   `quote_id`, `quote_item_id` (o `line_key`), `area` (nome), `unit_net`, `quantity`,
   `discount_pct`, `vat`, `due_date`, **`billing_document_id`** (raggruppamento).

3. **Nuova entità `billing_documents`** (= "fattura"): raggruppa N `billing_items` in un
   unico documento FIC. Serve per l'**accorpamento** (es. strategia + 1° mese in un'unica
   fattura).
   - Campi: `id`, `company_id`, `client_id`, `oggetto`, `due_date`, `numeration`,
     `state` (`bozza` | `emessa`), `fic_id`, `fic_document_url`, `invoice_number`,
     `total`, `created_at`.

## 4. Derivazione "da fatturare" per-voce / per-mese

- Importo riga dalla **specifica voce**: `net * qty * (1 − sconto%)`, con il suo
  `billing_period` e IVA (stessa formula di `_compute_quote_totals`).
- **Voci scontate 100% o "incluse"** (config Meta) → **skip**, nessuna riga da fatturare.
- **Canone**: ogni mese è già una **task PED distinta** (il modello lo prevede). Fatturare
  "un mese" = fatturare la task PED di quel mese ⇒ una riga, non sei.
- **Una tantum** (strategia): una sola riga, alla task completata.
- La lavorazione entra nel "da fatturare" quando **completata** (già oggi) **e** risolta la
  sua voce (via `quote_item_id`/fallback).

## 5. Integrazione FIC (nuova)

Nuovo endpoint, es. `POST /billing/documents/{id}/push-fic`:
- Crea un `issued_documents` **`type: "invoice"`** su FIC, ricostruito dalle righe del
  `billing_document`: `entity` = cliente, `items_list` dalle voci scelte, `e_invoice: true`,
  **`due_date`**, `numeration`, **oggetto ben visibile**, collegamento cliente.
- **Lasciato in bozza**: nessun `send`/invio SDI.
- Riusa i pattern di `fic_push_quote` (`_get_fic_token`, `_get_fic_company_id`,
  `_get_fic_vat_map`, POST `issued_documents`). Salva `fic_id`/url/numero sul
  `billing_document` e propaga sui `billing_items`.
- Dietro il flag `BILLING_FIC_PUSH_ENABLED` (default False → numero locale segnaposto).

## 6. I tre scenari sul flusso unico

- **Semplice** (sito 1000€): 1 voce → 1 lavorazione una-tantum → "Crea fattura" → bozza FIC
  con l'intera voce.
- **Intermedio** (SMM 3 voci: strategia una-tantum 500 + config Meta 100% + pacchetto 6×500):
  in Fatturazione le righe compaiono **per voce/mese**. Si selezionano **strategia** +
  **mese corrente** (la config Meta non compare, è a 0%), **"Accorpa in una fattura"** →
  1 bozza con oggetto + scadenza al **15**. Gli altri 5 mesi restano "da fatturare" nei mesi
  futuri man mano che le task PED diventano completate.
- **Complesso** (più preventivi/aree per lo stesso cliente, versioni):
  - **Versioni**: si fattura sempre contro l'**ultima versione**; il legame via `line_key`
    stabile regge i re-save del preventivo.
  - **Aree**: il legame porta `source_area_id`/descrizione ⇒ raggruppamento per area
    (web/social/grafica) immediato. Per le task senza legame, il **fallback** legge
    titolo + descrizione + UDM + importo per attribuirle alla voce/area corretta
    (es. "gestione profili Facebook e Instagram" vs "SMM LinkedIn/TikTok").

## 7. UI Fatturazione (evoluzione della pagina attuale)

- "Da fatturare" raggruppato **Cliente → Contratto/Preventivo → Area → Voce/Mese**, con
  checkbox di selezione.
- Selezione multipla → **"Crea fattura"**: modale con **oggetto** (precompilato dal
  preventivo), **scadenza** (default 15), anteprima righe (rimovibili / accorpabili), poi
  **"Genera bozza su FIC"**.
- Pannello **"Fatture dimenticate"** (già esistente) per i mesi arretrati con aging.
- Riga emessa: mostra numero/`fic_id` + link al documento FIC; "Annulla" cancella la riga
  **locale** ma **non** un documento FIC già emesso (renderlo esplicito in UI).

## 8. Sicurezza (fiscale)

- Si crea **solo la bozza** su FIC; **mai** invio automatico allo SDI (resta il tasto
  "Invia" interno a FIC).
- `BILLING_FIC_PUSH_ENABLED` è la valvola per abilitare la creazione reale della bozza.
- Idempotenza: `generate`/creazione documento non deve duplicare righe/documenti (vincolo
  unico su `work_item_id` già presente; aggiungere guardia su `billing_document`).

## 9. Fasi consigliate

> **Stato Fase 1 (in corso):**
> - ✅ Snapshot voce→lavorazione: `work_items.billing_source` (mig. `a9b0c1d2e3f4`),
>   valorizzato dalla generazione (click voce nel pannello contratto → precompila +
>   congela lo snapshot). Derivazione per-voce in `billing.py` (`_line_amount_from_source`).
> - ✅ Entità `billing_documents` (accorpamento) + `billing_items.billing_document_id`/
>   `area`/`due_date` (mig. `b0c1d2e3f4a5`). Endpoint `POST/GET /billing/documents`.
>   Oggetto precompilato + scadenza default = **15 del mese successivo** (override per richiesta).
>   Numero locale placeholder (`LOC AAAA/NNNN`); nessun FIC reale ancora.
> - ⏳ Da fare: policy voci 0€/incluse (skip), UI di raggruppamento/creazione fattura,
>   fallback matching per task legacy/AI senza snapshot.

1. **Fondamenta** (no FIC reale): `work_items.quote_item_id`/`line_key` + derivazione
   per-voce/mese + entità `billing_document` (accorpamento) + oggetto/scadenza. "Genera"
   continua col numero locale.
2. **FIC reale**: creazione bozza `type: invoice` (e-invoice, scadenza, oggetto), dietro
   flag; salvataggio `fic_id`/url/numero.
3. **Rifiniture**: fallback di matching per aree/legacy, UX accorpamento, gestione versioni
   preventivo, filtri/ricerca/export nella pagina.

## 10. Questioni aperte da chiarire

- **Numerazione/numerazioni FIC**: quale `numeration` per le fatture (es. `/FT`), e come si
  concilia col numero locale segnaposto durante la Fase 1.
- **Scadenza**: "il 15" — del mese corrente o del mese successivo alla competenza? Regola da
  fissare.
- **IVA / esigibilità / split payment**: mappare correttamente `vat` FIC (già c'è
  `_get_fic_vat_map`) e verificare regimi particolari.
- **Accorpamento cross-preventivo**: se si accorpano voci da preventivi diversi dello stesso
  cliente in un'unica fattura, definire come comporre oggetto e righe.
- **`line_key` stabile**: definire l'algoritmo esatto e la ri-mappatura al salvataggio del
  preventivo (per non rompere i legami task↔voce).
