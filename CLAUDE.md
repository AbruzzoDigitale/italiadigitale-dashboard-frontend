# Frontend — dashboard desktop Italia Digitale

SPA React 19 + TypeScript + Vite 8 + Tailwind. Servita da Firebase Hosting su
`dashboard.italiadigitale.agency`, parla con il backend FastAPI su Cloud Run.

Il backend è la fonte di verità: **qui non si duplica logica di business**. Se manca un dato,
manca un endpoint. Mappa cross-repo in `../docs/` — `DOMAINS.md` (dominio → file) e
`CONTRACTS.md` (quale file `src/api/` serve quale rotta).

Questo repo è anche l'**orchestratore**: il `Makefile` guida backend e mobile.

## Struttura

```
src/
├── App.tsx           rotte + <RouteAccess routeKey="..."> per i permessi
├── api/              un file per dominio (56). authFetch e API_BASE stanno in auth.ts
├── pages/            una pagina per rotta (+ <nome>-page.css quando serve)
├── features/         blocchi funzionali composti (company, notifications, websites, rimborsi…)
├── components/       ui/ (33 primitive) + una cartella per dominio
├── hooks/            logica riusabile
├── context/          Auth, Brand, Theme, Toast, Undo, BrowserTabs
├── layouts/          DashboardLayout
└── utils/
```

## Dove va cosa

| Cosa | Dove |
|---|---|
| Chiamata REST + tipi | `src/api/<dominio>.ts` |
| Pagina di una rotta | `src/pages/<Nome>Page.tsx`, registrata in `src/App.tsx` |
| Blocco funzionale | `src/features/<dominio>/` |
| Componente di dominio | `src/components/<dominio>/` |
| Primitiva UI | `src/components/ui/` — guardaci prima di crearne una nuova |
| Logica riusabile | `src/hooks/use<Cosa>.ts` |

Ogni file `src/api/*.ts` apre con un commento che cita l'endpoint backend corrispondente
(`Vedi app/api/v1/endpoints/websites.py`). **Mantieni la convenzione**: è il modo più rapido di
risalire al contratto.

## Cose che si sbagliano sempre

- Usa `authFetch` da `src/api/auth.ts`, mai `fetch` nudo: perderesti il JWT e la chiusura di
  sessione al 401.
- Le date dall'API sono **già in Europe/Rome** (il backend converte in un middleware). Non
  riconvertirle: otterresti un doppio offset.
- Ogni vista asincrona gestisce loading, errore e stato vuoto in modo esplicito.
- `RouteAccess` è uno specchio dei permessi, non il controllo vero: quello è nel backend.
- `.claude/worktrees/multi-op/` è una **copia integrale del repo** lasciata da un worktree. Se
  una ricerca restituisce due volte lo stesso file, è quella: ignorala.
- Se cambi la palette in `tailwind.config.js`, replica la modifica nel repo mobile: i token
  devono restare identici.

## File da non leggere per intero

`components/work-items/WorkItemFormModal.tsx` (4439 righe) · `pages/WorkloadPage.tsx` (3139) ·
`WorkItemsPage.tsx` (2513) · `ContractsPipelinePage.tsx` (2405) · `CompanyBrandPage.tsx` (1988) ·
`QuoteEditorPage.tsx` (1971) · `components/contracts/ContractDetailModal.tsx` (1710) ·
`features/websites/WebsitesTab.tsx` (1649) · `pages/ClientsSituationPage.tsx` (1544).

`../scripts/outline.sh <file>` per la struttura, poi `sed -n 'A,Bp'` per l'intervallo utile.

## Comandi

```bash
make dev             # :5173
make build           # tsc -b && vite build  ← verifica obbligatoria: qui emergono i tipi rotti
npm run lint
npm run test         # vitest

make dev-backend     # uvicorn del repo backend (serve prima: make google-proxy)
make google-proxy    # Cloud SQL Auth Proxy
make dev-mobile      # PWA su :5174, anche in LAN
```

`make deploy-hosting` (dashboard), `make deploy-backend`, `make deploy-mobile`, `make deploy-all`
toccano la **produzione**: solo su richiesta esplicita dell'utente. `VITE_API_URL` è build-time.

## Fuori dal repo

`Test/`, `Versione 2 Riconciliatore/`, `preventivatore-abruzzo-digitale*/`,
`Card pacchetti social*/`, gli zip e i file `handoff*.md` sono materiale locale, già in
`.gitignore`. `Test/` contiene **dati aziendali reali**: mai committarli, mai citarne il contenuto.

## Regole

TypeScript esplicito per props, payload e risposte. Componenti piccoli e componibili. Niente
logica duplicata fra pagine e componenti. Commit in inglese, Conventional Commits, branch da
`dev`; UI e commenti in italiano. `npm run lint` e `npm run build` prima della PR.
Dettagli in `CONTRIBUTING.md`.
