# Preventivatore Abruzzo Digitale

PWA offline-first per la gestione preventivi dell'agenzia. Cuore abruzzese, mente digitale.

## Cosa contiene

- **Schermata Pacchetti Social Media** — i 3 pacchetti (Visibilità €650 / Crescita €850 / Evoluzione €1200) come la grafica originale, con configurazione di durata, extra e sconto
- **Configuratore modulare** — Social/Web/Menu Digitale con card "famiglia" (es. Stories) che al click espande le varianti (× 3, × 4, × 5...)
- **Listino completo** — 71 servizi in 21 categorie, sincronizzati dal tuo Fatture in Cloud
- **Editor preventivo** — costruzione voce per voce con sconti per riga e totali
- **Anagrafica clienti** — completa con P.IVA, SDI, PEC pronta per Fatture in Cloud
- **Vista presentazione live** — fullscreen per mostrare i pacchetti al cliente in riunione
- **Storico preventivi** — con stato (bozza/inviato/accettato/rifiutato/da_approvare), duplica, ricerca
- **Integrazione Fatture in Cloud** — creazione bozza preventivo via Personal Access Token
- **Multi-utente con ruoli** — admin (Luigi, Lisa, Team) + operatori (vedono solo configuratore senza prezzi)
- **Permessi operatori configurabili** — l'admin decide per ogni operatore quali sezioni può vedere
- **Workflow approvazione** — operatori inviano richieste di preventivo all'admin che approva e rifinisce
- **Offline-first** — funziona su iPad/iPhone senza connessione, sincronizza quando torna online

## Changelog v1.4.0 (maggio 2026)

- Dashboard operatore ridisegnata: di default solo Dashboard, Configuratore, Editor preventivo
- Pulsante "Invia per approvazione" nel configuratore (composizione) — operatore non passa più per l'editor
- Prezzi completamente nascosti all'operatore nell'editor preventivo (colonne, totali, sidebar)
- Banner richieste pendenti in dashboard admin
- Sezione "Permessi operatori" in Impostazioni: spunta per ogni operatore quali viste può vedere
- Sistema famiglia/varianti: card unica (es. "Stories Meta") che al click apre il picker varianti
- Excel v4 (AD-prezzi-configuratore-v4.xlsx) con struttura famiglia + varianti illimitate
- Fix loghi Brand Agenzia: ripristinato sizing originale max-width 80% / max-height 70px

## Avvio rapido

### Modo più semplice — doppio click

1. **Doppio click su `index-standalone.html`** (consigliato — è un singolo file all-in-one)
2. Si apre l'app nel tuo browser predefinito
3. Credenziali default:
   - **luigi** / `luigi2026` — admin
   - **lisa**  / `lisa2026`  — admin
   - **team**  / `team2026`  — admin
   - **operatore** / `op2026` — operatore (vede solo configuratore senza prezzi)

L'app funziona così direttamente dal disco, senza server. I dati (clienti, preventivi, impostazioni) sono salvati nel browser stesso (IndexedDB).

> ⚠️ Cambia le password al primo accesso (Impostazioni → Utenti).

### Modo professionale — server locale o online (opzionale)

Se vuoi le funzionalità PWA complete (installazione come app, modalità offline garantita anche dopo riavvio del browser, push notifications future) serve un server HTTPS. Hai 3 opzioni:

**A) Server locale temporaneo** (richiede Python o Node)
```
python3 -m http.server 8000
```
e apri `http://localhost:8000`

**B) Hosting gratuito Netlify** (consigliato per uso in azienda)
1. Vai su https://app.netlify.com/drop
2. Trascina la cartella `preventivatore-abruzzo-digitale` nel browser
3. Netlify ti dà un URL pubblico HTTPS, accessibile da iPad/iPhone ovunque
4. Bookmark sull'iPad → installa come app

**C) Server tuo** (Aruba, Register, ecc.) — carica tutta la cartella tramite FTP.

### Installazione come app (PWA)

**Su iPad/iPhone:**
1. Apri Safari sulla URL del preventivatore
2. Tocca il pulsante "Condividi" → "Aggiungi alla schermata Home"
3. L'app si installa con icona Abruzzo Digitale e funziona offline

**Su Mac/PC:**
1. Apri Chrome/Edge/Safari sulla URL
2. Nella barra indirizzi compare un'icona "Installa" → click
3. L'app si apre come finestra autonoma, anche offline

## Ruoli e permessi

### Admin (Luigi, Lisa, Team)
Vede tutto: Dashboard, Pacchetti Social, Configuratore, Listino, Editor preventivo, Storico, Clienti, Profilo, Brand agenzia, Impostazioni.

### Operatore (operatore di default)
Di default vede solo: Dashboard, Configuratore, Editor preventivo.
Non vede mai i prezzi delle voci, dei totali, della pipeline.
Crea richieste di preventivo che vanno in stato `da_approvare`.
L'admin riceve un banner sulla dashboard con il numero di richieste pendenti.

### Personalizzare i permessi
Vai in **Impostazioni → Permessi operatori**. Per ogni operatore puoi spuntare quali viste vuoi rendere visibili. Salva, e la modifica è immediata.

## File AD-prezzi-configuratore-v4.xlsx

Nuovo file Excel per gestire prezzi e categorie FiC. Struttura:

- **Famiglia ID** — identificatore tecnico famiglia (vuoto = card singola)
- **Famiglia Nome** — nome visualizzato sulla card aggregata
- **Area** — `social`, `web`, `menu`
- **Sezione** — `meta`, `linkedin`, `tiktok`, ecc.
- **Variante ID** — ID univoco della variante
- **Variante Etichetta** — etichetta del bottone nel picker
- **Quantità** — numero unità della variante
- **Prezzo €** — prezzo base (per Menu Marketing/Management: semestrale)
- **Prezzo alt. €** — prezzo alternativo (per Menu: annuale)
- **Variante prezzo** — `annuale`, `semestrale`, `mensile`, `tantum`
- **Periodo** — `monthly` o `oneoff`
- **Bundle?** — S/N
- **Descrizione** — testo per il cliente
- **Categoria FiC** — categoria su Fatture in Cloud
- **Esiste su FiC?** — S/N
- **Note interne** — solo per te

Esempio: per "Stories Meta" con 3 varianti, usa la stessa Famiglia ID `meta-stories` su 3 righe. Nel configuratore vedrai UNA card "Stories Meta · 3 OPZIONI". Al click si apre il picker con i 3 prezzi.

## Integrazione Fatture in Cloud

### Generare il Personal Access Token

1. Accedi al tuo account Fatture in Cloud (https://secure.fattureincloud.it)
2. Vai in **Impostazioni → Account → API Sviluppatori** (oppure menu utente → API)
3. Sezione **Personal Access Token** → Genera nuovo token
4. Dai un nome (es. "Preventivatore Abruzzo Digitale")
5. Seleziona i permessi:
   - ✓ `entity.clients:r/w` (Clienti)
   - ✓ `issued_documents.quotes:r/w` (Preventivi)
   - ✓ `products:r` (Listino prodotti)
   - ✓ `settings:r` (Lettura dati account)
6. Copia il token (è mostrato una sola volta!)
7. Trova il **Company ID** nell'URL quando sei loggato in FiC: `secure.fattureincloud.it/...?company_id=XXXXX`

### Configurare nel preventivatore

1. Apri il preven