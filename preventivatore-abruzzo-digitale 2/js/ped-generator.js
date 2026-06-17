/* ============================================================
   PED-GENERATOR.JS — Generatore Piani Editoriali Social
   Wizard conversazionale step-by-step (stile Claude Code).
   - Selezione cliente + mese
   - Conferma strategia (fonte: Canva / Drive PDF / Google Doc)
   - Modalità: auto-immagini (sistema sceglie) vs manuale (operatore)
   - Selezione immagini con check anti-ripetizione (memoria PED)
   - Generazione PED su template Canva del cliente (placeholder)
   - Invio al responsabile → trigger Trello (placeholder)
   Tutte le integrazioni Canva/Drive/Trello sono stubbed lato server:
   ritornano mock realistici finché Luigi non abilita i token.
   ============================================================ */

const PedGenerator = {

  // ----------------------------------------------------------
  // Stato di sessione del wizard. Tutto in memoria: l'unico
  // sink persistente è il record PED salvato su /ped/briefs.
  // ----------------------------------------------------------
  _state: null,

  _newSession() {
    const now = new Date();
    return {
      stepIndex: 0,
      clientSyncId: null,
      clientName: '',
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      // Fonte strategia: 'canva' (default) | 'drive_pdf' | 'google_doc'
      strategySource: 'canva',
      strategyRef: '',              // URL/ID risorsa
      strategyResourceName: '',
      strategyConfirmed: false,
      // STEP 4 — Fonti media: provider selezionati + cartelle di lavoro.
      // sources: array di { provider: 'canva'|'drive', folderId, folderName }
      sources: [],
      // Modalità: 'auto' (sistema sceglie media) | 'manual' (operatore sceglie)
      // — vive sullo step Fonti perché lì si decide il livello di automatismo.
      mode: 'auto',
      // Asset selezionati per il mese — array di { id, name, url, variant, hash }
      selectedAssets: [],
      // Brief libero del mese
      brief: '',
      // ID del record persistito (popolato dopo il primo save)
      briefId: null,
      // True quando il cliente ha già brief precedenti: skip steps stabili
      hasPriorPed: false,
      onboardingSummary: null,     // { lastBriefAt, lastBriefMonth, strategy, sources }
      // Brand Kit Canva associato al cliente (persistente cross-month).
      // canvaBrandKitId è l'identificativo principale del Brand Kit Canva
      // (deriva dal brand_id dei brand-templates raggruppati). Se Canva non
      // ritorna brand_id, usiamo come surrogato l'ID di un singolo template.
      canvaBrandKitId: null,
      canvaBrandKitName: '',
      canvaBrandId: null,                  // ID brand vero (null se surrogato)
      canvaBrandTemplateIds: [],           // template collegati a questo brand
      // Legacy field — back-compat per record salvati nelle versioni precedenti
      canvaBrandTemplateId: null,
      canvaBrandTemplateName: '',
    };
  },

  // ----------------------------------------------------------
  // ENTRY POINT — viene chiamata da App.navigate('ped-generator')
  // ----------------------------------------------------------
  async render() {
    const root = document.getElementById('pedGeneratorRoot');
    if (!root) return;
    if (!this._state) this._state = this._newSession();

    root.innerHTML = `
      <div class="ped-shell">
        <aside class="ped-sidebar">
          <div class="ped-sidebar__title">Avanzamento</div>
          <ol class="ped-steps" id="pedSteps"></ol>
          <div class="ped-sidebar__hint">Suggerimento: rispondi alle domande in ordine. Puoi sempre tornare indietro cliccando uno step già fatto.</div>
        </aside>
        <main class="ped-stream" id="pedStream"></main>
      </div>
    `;
    this._renderSteps();
    this._renderStream();
  },

  // ----------------------------------------------------------
  // STEP DEFINITION — definizione canonica di TUTTI gli step.
  // _visibleSteps() filtra in base allo stato: skip 'assets' in modalità
  // auto, skip 'client/strategy/sources' se il cliente ha già onboarding.
  // ----------------------------------------------------------
  _allSteps() {
    return [
      { id: 'client',    label: 'Cliente',          render: () => this._renderClientStep() },
      { id: 'month',     label: 'Mese di lavoro',   render: () => this._renderMonthStep() },
      { id: 'strategy',  label: 'Strategia',        render: () => this._renderStrategyStep() },
      { id: 'sources',   label: 'Fonti',            render: () => this._renderSourcesStep() },
      { id: 'assets',    label: 'Media',            render: () => this._renderAssetsStep() },
      { id: 'preview',   label: 'Anteprima',        render: () => this._renderPreviewStep() },
      { id: 'review',    label: 'Revisione',        render: () => this._renderReviewStep() },
      { id: 'send',      label: 'Invio',            render: () => this._renderSendStep() },
    ];
  },

  _visibleSteps() {
    const s = this._state;
    const skipped = new Set();
    // Modalità auto → niente selezione manuale media
    if (s.mode === 'auto') skipped.add('assets');
    // Cliente con onboarding già fatto e non in fase "Aggiorna" → salto
    // cliente/strategia/fonti dopo la prima volta. Resta possibile entrare
    // negli step "stabili" cliccando la voce nella sidebar.
    if (s.hasPriorPed && !s._editOnboarding) {
      skipped.add('strategy');
      skipped.add('sources');
    }
    return this._allSteps().filter(st => !skipped.has(st.id));
  },

  /** Compat: i renderer step usano ancora `_steps()` per i lookup. */
  _steps() { return this._visibleSteps(); },

  _renderSteps() {
    const ol = document.getElementById('pedSteps');
    if (!ol) return;
    const s = this._state;
    const steps = this._visibleSteps();
    ol.innerHTML = steps.map((st, i) => {
      const done = i < s.stepIndex;
      const active = i === s.stepIndex;
      return `<li class="ped-step ${done ? 'is-done' : ''} ${active ? 'is-active' : ''}" data-step="${i}">
        <span class="ped-step__dot">${done ? '✓' : (i + 1)}</span>
        <span class="ped-step__label">${st.label}</span>
      </li>`;
    }).join('');
    ol.querySelectorAll('.ped-step').forEach(el => {
      el.addEventListener('click', () => {
        this._state.stepIndex = parseInt(el.dataset.step, 10);
        this._renderSteps();
        this._renderStream();
      });
    });
  },

  _renderStream() {
    const stream = document.getElementById('pedStream');
    if (!stream) return;
    const steps = this._steps();
    const cur = steps[this._state.stepIndex];
    stream.innerHTML = '';

    // Disegno una "card storico" per ogni step già fatto, poi la card attiva.
    for (let i = 0; i < this._state.stepIndex; i++) {
      const past = steps[i];
      stream.appendChild(this._historyCard(past));
    }
    const activeCard = document.createElement('div');
    activeCard.className = 'ped-card ped-card--active';
    activeCard.innerHTML = `
      <div class="ped-card__head">
        <span class="ped-card__eyebrow">Step ${this._state.stepIndex + 1} di ${steps.length}</span>
        <h3 class="ped-card__title">${cur.label}</h3>
      </div>
      <div class="ped-card__body" id="pedActiveBody"></div>
    `;
    stream.appendChild(activeCard);
    cur.render();
    stream.scrollTop = stream.scrollHeight;
  },

  _historyCard(step) {
    const s = this._state;
    const div = document.createElement('div');
    div.className = 'ped-card ped-card--history';
    let summary = '—';
    if (step.id === 'client')   summary = s.clientName || '—';
    if (step.id === 'month')    summary = new Date(s.year, s.month - 1, 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
    if (step.id === 'strategy') summary = `${({canva:'Canva',drive_pdf:'Drive PDF',google_doc:'Google Doc'})[s.strategySource]}${s.strategyResourceName ? ' · ' + s.strategyResourceName : ''} · ${s.strategyConfirmed ? 'confermata' : 'da confermare'}`;
    if (step.id === 'sources') {
      const provs = (s.sources || []).map(x => x.provider).filter((v,i,a) => a.indexOf(v) === i);
      const modeLabel = s.mode === 'auto' ? 'sistema sceglie' : 'scelgo io (guidato AI)';
      summary = `${(s.sources || []).length} cartelle · ${provs.join(' + ') || 'nessun account'} · ${modeLabel}`;
    }
    if (step.id === 'assets') {
      const dist = this._mediaDistribution(s.selectedAssets);
      summary = `${s.selectedAssets.length} media selezionati (${dist.foto} foto · ${dist.reel} reel · ${dist.carosello} caroselli placeholder)`;
    }
    div.innerHTML = `
      <div class="ped-card__head">
        <span class="ped-card__eyebrow">${step.label}</span>
        <button class="ped-link" type="button">Modifica</button>
      </div>
      <div class="ped-card__summary">${summary}</div>
    `;
    div.querySelector('button').addEventListener('click', () => {
      const idx = this._steps().findIndex(s2 => s2.id === step.id);
      this._state.stepIndex = idx;
      this._renderSteps();
      this._renderStream();
    });
    return div;
  },

  // ==========================================================
  // STEP 1 — Selezione cliente
  // ==========================================================
  async _renderClientStep() {
    const body = document.getElementById('pedActiveBody');
    if (!body) return;
    body.innerHTML = `
      <p class="ped-question">Per quale cliente stai preparando il piano editoriale di questo mese?</p>
      <div id="pedQuickClients"></div>
      <div class="ped-search" style="margin-top: 14px">
        <input class="input" type="search" id="pedClientSearch" placeholder="Cerca tra tutti i clienti dell'agenzia…" autocomplete="off">
      </div>
      <div id="pedClientList" class="ped-client-list"><div class="ped-loading">Carico clienti operativi…</div></div>
    `;
    // Pull async dei "clienti salvati" (con PED storici) — non blocca il render
    this._renderQuickClients();
    const list = document.getElementById('pedClientList');
    const search = document.getElementById('pedClientSearch');

    // Carico TUTTI i clienti disponibili (locali + FiC). Il PED si può
    // generare anche per clienti non ancora flaggati come "social": il
    // wizard guida l'operatore, il flag operativo si aggiorna a valle.
    // Convenzione brand+aliases come in Situazione clienti.
    let clients = [];
    const seen = new Set();
    const pushClient = (c) => {
      const key = (c.syncId || c.ficId || c.name || '').toString();
      if (!key || seen.has(key)) return;
      seen.add(key);
      clients.push(c);
    };
    // 1. Locali (IndexedDB) — già con brand + aliases curati
    try {
      const all = await DB.all('clients');
      for (const c of all) if (!c.deleted) pushClient(c);
    } catch (_) {}
    // 2. FiC — TUTTI i clienti dell'anagrafica Fatture in Cloud
    let ficWarning = null;
    try {
      if (window.Sync && Sync._api) {
        const fic = await Sync._api('GET', '/fic/clients');
        // /fic/clients ritorna { data: [...] } o array; gestisco entrambi
        const arr = Array.isArray(fic) ? fic : (fic.data || fic.clients || []);
        for (const f of arr) {
          // Mappo lo schema FiC al nostro: { name, brand, vat_number, syncId(=>fic_id) }
          pushClient({
            syncId: f.syncId || ('fic-' + (f.id || f.ficId || '')),
            ficId: f.id || f.ficId,
            name: f.name || f.ragione_sociale,
            brand: f.brand || f.name || f.ragione_sociale,
            aliases: f.aliases || [],
            vatNumber: f.vat_number || f.vatNumber,
            _fromFic: true,
          });
        }
      }
    } catch (e) {
      ficWarning = e && e.message ? e.message : String(e);
    }
    clients.sort((a, b) => (a.brand || a.name || '').localeCompare(b.brand || b.name || '', 'it'));

    const renderList = (filter = '') => {
      const q = filter.trim().toLowerCase();
      const filtered = q ? clients.filter(c => {
        const hay = [c.brand, c.name, ...(c.aliases || [])].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
      }) : clients.slice(0, 60); // limito i primi 60 quando il search è vuoto, evito lag
      if (!clients.length) {
        list.innerHTML = `<div class="ped-empty">Nessun cliente trovato.${ficWarning ? `<br><small>Backend FiC: ${ficWarning}</small>` : ''}<br>Sincronizza l'anagrafica da <b>Clienti → Sincronizza da FiC</b> e riprova.</div>`;
        return;
      }
      if (!filtered.length) {
        list.innerHTML = `<div class="ped-empty">Nessun cliente combacia con «${filter}». Prova con un'altra parola.</div>`;
        return;
      }
      const totalLabel = q ? `${filtered.length} match` : `mostro i primi ${filtered.length} di ${clients.length}`;
      list.innerHTML = `<div class="ped-list-meta">${totalLabel}${ficWarning ? ` · <span class="ped-warn-inline">⚠ FiC offline</span>` : ''}</div>` + filtered.map(c => {
        const showSub = c.brand && c.name && c.brand !== c.name;
        const meta = c.vatNumber ? `P.IVA ${c.vatNumber}` : (c._fromFic ? 'da Fatture in Cloud' : 'cliente locale');
        return `
          <button class="ped-client-card" data-sync-id="${c.syncId || ''}" data-name="${(c.brand || c.name || '').replace(/"/g, '&quot;')}">
            <div class="ped-client-card__avatar">${((c.brand || c.name || '?')[0] || '?').toUpperCase()}</div>
            <div class="ped-client-card__body">
              <div class="ped-client-card__brand">${c.brand || c.name || '—'}</div>
              ${showSub ? `<div class="ped-client-card__sub">${c.name}</div>` : ''}
              <div class="ped-client-card__meta">${meta}${c.socialSubtype || c.socialType ? ` · ${c.socialSubtype || c.socialType}` : ''}</div>
            </div>
          </button>
        `;
      }).join('');
      list.querySelectorAll('.ped-client-card').forEach(btn => {
        btn.addEventListener('click', async () => {
          this._state.clientSyncId = btn.dataset.syncId;
          this._state.clientName   = btn.dataset.name;
          await this._loadOnboardingState();
          if (this._state.hasPriorPed) {
            this._showOnboardingShortcut();
          } else {
            this._advance();
          }
        });
      });
    };
    renderList('');
    search.addEventListener('input', () => renderList(search.value));
  },

  /** Carica la lista di "clienti salvati" (= con PED storici) e li mostra
   *  come riga orizzontale di quick-access card sopra la search. Click su
   *  una card seleziona il cliente e fa partire l'onboarding shortcut. */
  async _renderQuickClients() {
    const wrap = document.getElementById('pedQuickClients');
    if (!wrap) return;
    let clients = [];
    try {
      if (window.Sync && Sync._api) {
        const data = await Sync._api('GET', '/ped/clients-with-ped');
        clients = (data && data.clients) || [];
      }
    } catch (_) {}
    if (!clients.length) {
      wrap.innerHTML = ''; // niente quick-access se nessun PED storico
      return;
    }
    const safe = s => String(s == null ? '' : s).replace(/[<>]/g, '');
    wrap.innerHTML = `
      <div class="ped-quick-clients">
        <div class="ped-quick-clients__head">
          <span class="ped-quick-clients__label">⚡ Clienti già impostati</span>
          <span class="ped-quick-clients__hint">Click per riprendere subito dal mese di lavoro</span>
        </div>
        <div class="ped-quick-clients__list">
          ${clients.map(c => `
            <button class="ped-quick-client-card" type="button" data-sync-id="${safe(c.clientSyncId)}" data-name="${safe(c.brand)}">
              <div class="ped-quick-client-card__avatar">${safe((c.brand || '?')[0] || '?').toUpperCase()}</div>
              <div class="ped-quick-client-card__body">
                <div class="ped-quick-client-card__brand">${safe(c.brand)}</div>
                <div class="ped-quick-client-card__meta">ultimo: ${safe(c.lastBriefMonth)} · ${safe(c.lastStatus || 'bozza')}</div>
                <div class="ped-quick-client-card__count">${c.totalBriefs} PED in storico</div>
              </div>
            </button>
          `).join('')}
        </div>
      </div>
    `;
    wrap.querySelectorAll('.ped-quick-client-card').forEach(btn => {
      btn.addEventListener('click', async () => {
        this._state.clientSyncId = btn.dataset.syncId;
        this._state.clientName   = btn.dataset.name;
        await this._loadOnboardingState();
        if (this._state.hasPriorPed) {
          this._showOnboardingShortcut();
        } else {
          this._advance();
        }
      });
    });
  },

  /** Pull stato onboarding del cliente. Se ha già brief, pre-popola
   *  strategia + fonti dallo storico e mette _hasPriorPed=true così
   *  _visibleSteps salta strategy/sources. */
  async _loadOnboardingState() {
    const s = this._state;
    s.hasPriorPed = false;
    s.onboardingSummary = null;
    try {
      if (window.Sync && Sync._api) {
        const data = await Sync._api('GET', `/ped/onboarding-state?clientSyncId=${encodeURIComponent(s.clientSyncId)}`);
        // Brand Kit Canva: vive sul cliente, non sul brief — lo pre-popoliamo
        // SEMPRE (anche se il cliente non ha ancora alcun brief PED).
        if (data && data.brandKit && data.brandKit.id) {
          s.canvaBrandKitId         = data.brandKit.id;
          s.canvaBrandKitName       = data.brandKit.name || '';
          s.canvaBrandId            = data.brandKit.brandId || null;
          s.canvaBrandTemplateIds   = Array.isArray(data.brandKit.templateIds) ? data.brandKit.templateIds : [];
          // Back-compat: popoliamo anche i campi legacy
          s.canvaBrandTemplateId    = data.brandKit.id;
          s.canvaBrandTemplateName  = data.brandKit.name || '';
        }
        if (data && data.hasPriorPed) {
          s.hasPriorPed = true;
          s.onboardingSummary = data;
          // Pre-populate strategia + fonti dallo storico
          if (data.strategy) {
            s.strategySource = data.strategy.source || s.strategySource;
            s.strategyRef = data.strategy.ref || '';
            s.strategyResourceName = data.strategy.resourceName || '';
            s.strategyConfirmed = true;
          }
          if (data.mode) s.mode = data.mode;
          if (Array.isArray(data.sources)) s.sources = data.sources;
        }
      }
    } catch (_) { /* offline / endpoint vecchio → flusso completo */ }
  },

  /** Banner inline nello step Cliente: mostra config precedente e dà la
   *  scelta tra "Conferma e vai al mese" o "Aggiorna strategia/fonti".
   *  Recap dettagliato: lista cartelle + link alla strategia + brand kit. */
  _showOnboardingShortcut() {
    const s = this._state;
    const body = document.getElementById('pedActiveBody');
    if (!body) return;
    const o = s.onboardingSummary || {};
    const sourceLabel = ({canva:'Canva', drive_pdf:'Drive PDF', google_doc:'Google Doc'})[s.strategySource] || s.strategySource;
    const strategyHref = this._strategyHref(s.strategySource, s.strategyRef);
    const strategyNameSafe = (s.strategyResourceName || s.strategyRef || '—').replace(/[<>]/g, '');
    const sources = Array.isArray(s.sources) ? s.sources : [];
    const brandKitName = s.canvaBrandKitName || s.canvaBrandTemplateName || '';
    const brandKitLine = brandKitName
      ? `<div class="ped-recap__row"><span class="ped-recap__label">✨ Brand Kit Canva</span><span class="ped-recap__value">${brandKitName.replace(/[<>]/g, '')}</span></div>`
      : `<div class="ped-recap__row"><span class="ped-recap__label">✨ Brand Kit Canva</span><span class="ped-recap__value ped-recap__value--muted">non collegato</span></div>`;
    const sourcesList = sources.length
      ? `<ul class="ped-recap__list">${sources.map(src => {
          const url = this._sourceHref(src);
          const prov = src.provider === 'canva' ? '🎨 Canva' : (src.provider === 'drive' ? '🗂️ Drive' : src.provider);
          const name = (src.folderName || '(senza nome)').replace(/[<>]/g, '');
          const link = url ? `<a href="${url}" target="_blank" rel="noopener" class="ped-recap__link">↗ apri</a>` : '';
          return `<li class="ped-recap__item"><span class="ped-recap__prov">${prov}</span><span class="ped-recap__name">${name}</span>${link}</li>`;
        }).join('')}</ul>`
      : `<div class="ped-recap__value ped-recap__value--muted">nessuna cartella collegata — dovrai aggiungerle in "Aggiorna"</div>`;

    body.innerHTML = `
      <div class="ped-card ped-card--note">
        <div class="ped-card__head">
          <span class="ped-card__eyebrow">Cliente già impostato</span>
          <h3 class="ped-card__title">${s.clientName}</h3>
        </div>
        <div class="ped-card__body">
          <p style="margin:0 0 14px 0">Questo cliente ha già un PED precedente (mese <b>${o.lastBriefMonth || '—'}</b>, stato <i>${o.lastStatus || 'bozza'}</i>). Posso riusare la configurazione, oppure aggiornarla.</p>

          <div class="ped-recap">
            <div class="ped-recap__row">
              <span class="ped-recap__label">📋 Strategia</span>
              <span class="ped-recap__value">
                <span class="ped-recap__badge">${sourceLabel}</span>
                <span class="ped-recap__name">${strategyNameSafe}</span>
                ${strategyHref ? `<a href="${strategyHref}" target="_blank" rel="noopener" class="ped-recap__link">↗ apri e rileggi</a>` : ''}
              </span>
            </div>

            ${brandKitLine}

            <div class="ped-recap__row ped-recap__row--block">
              <span class="ped-recap__label">📂 Fonti media (${sources.length})</span>
              ${sourcesList}
            </div>

            <div class="ped-recap__row">
              <span class="ped-recap__label">⚙️ Modalità</span>
              <span class="ped-recap__value">${s.mode === 'auto' ? 'sistema sceglie (auto)' : 'scelgo io (guidato AI)'}</span>
            </div>
          </div>

          <div class="ped-actions" style="justify-content:flex-start; margin-top:14px">
            <button class="btn btn--primary" type="button" id="pedOnbConfirm">Confermo, vai al mese</button>
            <button class="btn btn--secondary" type="button" id="pedOnbEdit">Aggiorna strategia / fonti</button>
            <button class="ped-link" type="button" id="pedOnbBack">Cambia cliente</button>
          </div>
        </div>
      </div>
    `;
    document.getElementById('pedOnbConfirm').addEventListener('click', () => {
      s._editOnboarding = false;
      this._advance(); // va a Mese; sidebar salta strategy/sources
    });
    document.getElementById('pedOnbEdit').addEventListener('click', () => {
      s._editOnboarding = true;
      s.hasPriorPed = false; // riapri tutti gli step questa volta
      this._advance();
    });
    document.getElementById('pedOnbBack').addEventListener('click', () => {
      s.clientSyncId = null; s.clientName = ''; s.hasPriorPed = false;
      this._renderClientStep();
    });
  },

  /** Deriva URL apribile dalla strategia salvata.
   *  - canva: ref può essere URL diretto OPPURE ID design → costruisce edit URL
   *  - drive_pdf / google_doc: ref è di solito un fileId Drive → URL Drive viewer
   *  - Se ref è già http(s) → ritorna tal quale */
  _strategyHref(source, ref) {
    if (!ref) return '';
    const r = String(ref).trim();
    if (/^https?:\/\//i.test(r)) return r;
    if (source === 'canva') {
      // Canva design ID → edit URL canonico
      return `https://www.canva.com/design/${encodeURIComponent(r)}/edit`;
    }
    if (source === 'drive_pdf' || source === 'google_doc') {
      return `https://drive.google.com/file/d/${encodeURIComponent(r)}/view`;
    }
    return '';
  },

  /** URL apribile per una fonte media (cartella Canva / Drive). */
  _sourceHref(src) {
    if (!src || !src.folderId) return '';
    if (src.provider === 'canva') {
      return `https://www.canva.com/folder/${encodeURIComponent(src.folderId)}`;
    }
    if (src.provider === 'drive') {
      return `https://drive.google.com/drive/folders/${encodeURIComponent(src.folderId)}`;
    }
    return '';
  },

  // ==========================================================
  // STEP 2 — Mese di lavoro
  // Default: mese e anno correnti. UI compatta: mostra il default in
  // chiaro + link "Cambia" che espande due select (anno + mese).
  // ==========================================================
  _renderMonthStep() {
    const body = document.getElementById('pedActiveBody');
    if (!body) return;
    const s = this._state;
    // Forza default a "oggi" se l'utente non ha ancora toccato.
    // (Il _newSession lo fa già, ma se l'utente arriva qui da uno step
    // precedente la sessione potrebbe essere vecchia.)
    if (!s._monthTouched) {
      const now = new Date();
      s.year = now.getFullYear();
      s.month = now.getMonth() + 1;
    }
    const months = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
    const now = new Date();
    const isCurrent = s.year === now.getFullYear() && s.month === (now.getMonth() + 1);
    const years = [];
    for (let y = now.getFullYear() - 1; y <= now.getFullYear() + 2; y++) years.push(y);

    body.innerHTML = `
      <p class="ped-question">Su quale mese stiamo lavorando?</p>
      <div class="ped-month-display" id="pedMonthDisplay">
        <div class="ped-month-display__label">${months[s.month - 1]} <span class="ped-month-display__year">${s.year}</span></div>
        ${isCurrent ? '<div class="ped-month-display__badge">mese corrente</div>' : ''}
        <button type="button" class="ped-link" id="pedMonthEdit">Cambia mese</button>
      </div>
      <div class="ped-month-editor" id="pedMonthEditor" hidden>
        <label class="ped-field" style="flex:1">
          <span class="ped-field__label">Anno</span>
          <select class="input" id="pedYearSel">
            ${years.map(y => `<option value="${y}" ${y === s.year ? 'selected' : ''}>${y}</option>`).join('')}
          </select>
        </label>
        <label class="ped-field" style="flex:2">
          <span class="ped-field__label">Mese</span>
          <select class="input" id="pedMonthSel">
            ${months.map((m, i) => `<option value="${i + 1}" ${(i + 1) === s.month ? 'selected' : ''}>${m}</option>`).join('')}
          </select>
        </label>
      </div>
      <div class="ped-actions">
        <button class="btn btn--primary" type="button" id="pedMonthNext">Continua</button>
      </div>
    `;
    const editor = document.getElementById('pedMonthEditor');
    const display = document.getElementById('pedMonthDisplay');
    document.getElementById('pedMonthEdit').addEventListener('click', () => {
      editor.hidden = false;
      display.classList.add('is-collapsed');
    });
    const yearSel = document.getElementById('pedYearSel');
    const monthSel = document.getElementById('pedMonthSel');
    const onChange = () => {
      s.year = parseInt(yearSel.value, 10);
      s.month = parseInt(monthSel.value, 10);
      s._monthTouched = true;
      // Aggiorno il display sopra senza ridisegnare tutto
      display.querySelector('.ped-month-display__label').innerHTML = `${months[s.month - 1]} <span class="ped-month-display__year">${s.year}</span>`;
      const nowD = new Date();
      const isCur = s.year === nowD.getFullYear() && s.month === (nowD.getMonth() + 1);
      const badge = display.querySelector('.ped-month-display__badge');
      if (isCur && !badge) display.insertAdjacentHTML('beforeend', '<div class="ped-month-display__badge">mese corrente</div>');
      if (!isCur && badge) badge.remove();
    };
    yearSel.addEventListener('change', onChange);
    monthSel.addEventListener('change', onChange);
    document.getElementById('pedMonthNext').addEventListener('click', () => this._advance());
  },

  // ==========================================================
  // STEP 3 — Strategia: scegli la fonte + naviga il progetto
  // dell'account collegato (Canva/Drive). Niente più copia-incolla
  // link: l'operatore sceglie dalla lista dei suoi progetti.
  // ==========================================================
  async _renderStrategyStep() {
    const body = document.getElementById('pedActiveBody');
    if (!body) return;
    const s = this._state;
    body.innerHTML = `
      <p class="ped-question">La strategia approvata dal cliente dove si trova?</p>
      <div class="ped-source-grid">
        <label class="ped-source-card ${s.strategySource === 'canva' ? 'is-selected' : ''}">
          <input type="radio" name="pedSrc" value="canva" ${s.strategySource === 'canva' ? 'checked' : ''}>
          <div class="ped-source-card__title">Progetto Canva</div>
          <div class="ped-source-card__sub">Naviga i progetti della cartella Canva del cliente. Fonte primaria.</div>
        </label>
        <label class="ped-source-card ${s.strategySource === 'drive_pdf' ? 'is-selected' : ''}">
          <input type="radio" name="pedSrc" value="drive_pdf" ${s.strategySource === 'drive_pdf' ? 'checked' : ''}>
          <div class="ped-source-card__title">PDF su Drive</div>
          <div class="ped-source-card__sub">Sfoglia la cartella Drive del cliente e scegli il PDF della strategia.</div>
        </label>
        <label class="ped-source-card ${s.strategySource === 'google_doc' ? 'is-selected' : ''}">
          <input type="radio" name="pedSrc" value="google_doc" ${s.strategySource === 'google_doc' ? 'checked' : ''}>
          <div class="ped-source-card__title">Google Doc</div>
          <div class="ped-source-card__sub">Scegli il documento Google con la strategia condivisa col cliente.</div>
        </label>
      </div>

      <div class="ped-conn" id="pedConnBox"></div>

      <div class="ped-picker" id="pedStrategyPicker"></div>

      <details class="ped-fallback">
        <summary>Inserisci link manualmente</summary>
        <label class="ped-field" style="margin-top:10px">
          <span class="ped-field__label">Link o ID della risorsa</span>
          <input class="input" type="text" id="pedStrategyRef" value="${(s.strategyRef || '').replace(/"/g, '&quot;')}" placeholder="https://canva.com/design/... oppure ID Drive">
        </label>
      </details>

      <div class="ped-confirm-box" id="pedStrategyPreview">
        <div class="ped-confirm-box__title">Anteprima strategia</div>
        <div class="ped-confirm-box__body">Scegli una risorsa qui sopra e premi <b>Analizza</b> per vedere i punti chiave estratti dalla strategia. Il sistema controllerà tone of voice, pillar, target e frequenza pubblicazioni proposti.</div>
      </div>
      <div class="ped-actions">
        <button class="btn btn--secondary" type="button" id="pedStrategyAnalyze">Analizza strategia</button>
        <button class="btn btn--primary" type="button" id="pedStrategyConfirm">La strategia è confermata, procedi</button>
      </div>
    `;

    // Click handler sulla source card. Dopo il cambio source ridisegno
    // sia connection box sia picker (Canva vs Drive sono provider diversi).
    body.querySelectorAll('.ped-source-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target && e.target.tagName === 'INPUT') return;
        const val = card.querySelector('input').value;
        s.strategySource = val;
        body.querySelectorAll('.ped-source-card').forEach(c => c.classList.remove('is-selected'));
        card.classList.add('is-selected');
        const radio = card.querySelector('input');
        if (radio) radio.checked = true;
        this._renderConnBox();
        this._renderStrategyPicker();
      });
    });
    const refInput = document.getElementById('pedStrategyRef');
    if (refInput) refInput.addEventListener('input', e => { s.strategyRef = e.target.value; });
    document.getElementById('pedStrategyAnalyze').addEventListener('click', () => this._analyzeStrategy());
    document.getElementById('pedStrategyConfirm').addEventListener('click', () => {
      if (!s.strategyRef && !s.strategyResourceName) {
        App._toast && App._toast('Seleziona prima una risorsa dalla lista o incolla il link', 'info');
        return;
      }
      s.strategyConfirmed = true;
      this._advance();
    });

    this._renderConnBox();
    this._renderStrategyPicker();
  },

  // ----------------------------------------------------------
  // Box "stato collegamento account" per il provider scelto.
  // Mostra: provider, account connesso (se OAuth ok) o bottone
  // "Collega account" + link diretto a Impostazioni → Integrazioni.
  // ----------------------------------------------------------
  async _renderConnBox() {
    const box = document.getElementById('pedConnBox');
    if (!box) return;
    const s = this._state;
    const provider = s.strategySource === 'canva' ? 'canva'
                   : s.strategySource === 'drive_pdf' ? 'google_drive'
                   : 'google_drive';  // google_doc anche da Drive
    const label = provider === 'canva' ? 'Canva' : 'Google Drive';
    box.innerHTML = `<div class="ped-loading">Verifico stato collegamento ${label}…</div>`;
    let info = { connected: false, account: null, _serverErr: null };
    try {
      if (window.Sync && Sync._api) {
        info = await Sync._api('GET', `/ped/integrations/status?provider=${provider}`);
      }
    } catch (e) {
      info._serverErr = e && e.message ? e.message : String(e);
    }
    if (info.connected) {
      box.innerHTML = `
        <div class="ped-conn__row ped-conn__row--ok">
          <div class="ped-conn__icon">✓</div>
          <div class="ped-conn__body">
            <div class="ped-conn__title">${label} — OAuth attivo</div>
            <div class="ped-conn__sub">Account: ${info.account || '—'}</div>
          </div>
          <a class="ped-link" href="#" data-act="settings">Gestisci account</a>
        </div>
      `;
    } else if (info.credsOnly) {
      // Stato intermedio: credenziali OK ma login utente non completato.
      box.innerHTML = `
        <div class="ped-conn__row ped-conn__row--off">
          <div class="ped-conn__icon">!</div>
          <div class="ped-conn__body">
            <div class="ped-conn__title">${label} — credenziali OK, ma serve il login</div>
            <div class="ped-conn__sub">Hai salvato client_id e client_secret nell'app ${label}, ma non hai ancora autorizzato il tuo account con un login. Senza OAuth, il sistema non legge i tuoi progetti veri (vedi sotto solo dati simulati).</div>
          </div>
          <button class="btn btn--secondary" type="button" data-act="settings">Completa il login</button>
        </div>
      `;
    } else {
      box.innerHTML = `
        <div class="ped-conn__row ped-conn__row--off">
          <div class="ped-conn__icon">!</div>
          <div class="ped-conn__body">
            <div class="ped-conn__title">${label} non collegato</div>
            <div class="ped-conn__sub">Collega l'account per navigare i progetti reali. ${info._serverErr ? `<i>(backend offline: ${info._serverErr})</i>` : ''}</div>
          </div>
          <button class="btn btn--secondary" type="button" data-act="connect">Collega ${label}</button>
        </div>
      `;
    }
    box.querySelectorAll('[data-act]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        if (el.dataset.act === 'settings' || el.dataset.act === 'connect') {
          // Naviga alla view Integrazioni dove c'è il setup OAuth dettagliato.
          if (window.App && App.navigate) App.navigate('integrations');
        }
      });
    });
  },

  // ----------------------------------------------------------
  // Picker progetti: lista navigabile dei progetti del cliente
  // per il provider selezionato. Search + click → setta strategyRef
  // e strategyResourceName senza che l'operatore debba copiare URL.
  // ----------------------------------------------------------
  async _renderStrategyPicker() {
    const picker = document.getElementById('pedStrategyPicker');
    if (!picker) return;
    const s = this._state;
    picker.innerHTML = `
      <div class="ped-picker__head">
        <div class="ped-picker__title">Progetti disponibili per ${s.clientName}</div>
        <div class="ped-search" style="margin:0">
          <input class="input" id="pedPickerSearch" type="search" placeholder="Cerca nei progetti…">
        </div>
      </div>
      <div class="ped-picker__list" id="pedPickerList"><div class="ped-loading">Carico progetti…</div></div>
    `;
    const list = document.getElementById('pedPickerList');
    let items = [];
    let serverErr = null;
    let usingMock = false;
    let apiInfo = null;
    try {
      if (window.Sync && Sync._api) {
        const data = await Sync._api('POST', '/ped/resources/list', {
          provider: s.strategySource,
          clientSyncId: s.clientSyncId,
          kind: 'strategy',
        });
        items = (data && data.items) || [];
        apiInfo = data;
      }
    } catch (e) {
      serverErr = e && e.message ? e.message : String(e);
    }
    if (!items.length) { items = this._mockStrategyResources(); usingMock = true; }
    const render = (q = '') => {
      const ql = q.trim().toLowerCase();
      const filtered = ql ? items.filter(it => (it.name || '').toLowerCase().includes(ql)) : items;
      if (!filtered.length) {
        list.innerHTML = `<div class="ped-empty">Nessun progetto combacia con «${q}».</div>`;
        return;
      }
      list.innerHTML = filtered.map(it => `
        <button class="ped-picker__item ${s.strategyRef === it.ref ? 'is-selected' : ''}" type="button" data-ref="${it.ref}" data-name="${(it.name || '').replace(/"/g, '&quot;')}">
          <div class="ped-picker__icon">${it.icon || (s.strategySource === 'canva' ? '🎨' : '📄')}</div>
          <div class="ped-picker__body">
            <div class="ped-picker__name">${it.name}</div>
            <div class="ped-picker__meta">${it.subtitle || ''}${it.modified ? ` · aggiornato ${it.modified}` : ''}</div>
          </div>
          ${s.strategyRef === it.ref ? '<div class="ped-picker__check">✓</div>' : ''}
        </button>
      `).join('');
      list.querySelectorAll('.ped-picker__item').forEach(btn => {
        btn.addEventListener('click', () => {
          s.strategyRef = btn.dataset.ref;
          s.strategyResourceName = btn.dataset.name;
          render(document.getElementById('pedPickerSearch').value);
          // Aggiorno anche l'input fallback se aperto
          const refInput = document.getElementById('pedStrategyRef');
          if (refInput) refInput.value = btn.dataset.ref;
        });
      });
    };
    render('');
    document.getElementById('pedPickerSearch').addEventListener('input', e => render(e.target.value));
    if (serverErr) {
      picker.insertAdjacentHTML('beforeend', `<div class="ped-warn">⚠ Backend non risponde (${serverErr}). Mostro progetti simulati.</div>`);
    } else if (usingMock && apiInfo && apiInfo._notConfigured) {
      picker.insertAdjacentHTML('beforeend', `<div class="ped-warn">⚠ ${apiInfo.reason || 'Account non collegato'}. Vai in <b>Integrazioni</b> per completare il login e vedere i progetti reali. Per ora ti mostro 3 progetti simulati.</div>`);
    } else if (usingMock && apiInfo && apiInfo._apiError) {
      picker.insertAdjacentHTML('beforeend', `<div class="ped-warn">⚠ Errore API ${apiInfo.provider}: ${apiInfo.message || ('HTTP ' + apiInfo.status)}. Mostro progetti simulati.</div>`);
    } else if (usingMock) {
      picker.insertAdjacentHTML('beforeend', `<div class="ped-warn">⚠ Mostro progetti simulati (account non ancora collegato via OAuth). Vai in <b>Integrazioni → Canva → Connetti il mio account</b> per vedere i progetti veri.</div>`);
    }
  },

  _mockStrategyResources() {
    const src = this._state.strategySource;
    if (src === 'canva') return [
      { ref: 'canva-strategy-2026',     name: 'Strategia social 2026 — approvata',  subtitle: 'Cartella cliente · Canva Pro',           modified: 'mar 2026', icon: '🎨' },
      { ref: 'canva-strategy-2025-q4',  name: 'Strategia Q4 2025',                  subtitle: 'Cartella cliente · Canva Pro',           modified: 'ott 2025', icon: '🎨' },
      { ref: 'canva-brief-spring-2026', name: 'Brief campagna primavera 2026',      subtitle: 'Cartella cliente · Canva Pro',           modified: 'feb 2026', icon: '🎨' },
    ];
    if (src === 'drive_pdf') return [
      { ref: 'drive-strategy-final.pdf', name: 'Strategia_2026_FINALE.pdf',        subtitle: 'Drive · cartella Strategie',             modified: 'mar 2026', icon: '📄' },
      { ref: 'drive-strategy-v2.pdf',    name: 'Strategia_2026_v2.pdf',            subtitle: 'Drive · cartella Strategie',             modified: 'feb 2026', icon: '📄' },
    ];
    return [
      { ref: 'gdoc-strategy-2026',       name: 'Strategia 2026 — doc condiviso',   subtitle: 'Google Doc · cartella Strategie',        modified: 'mar 2026', icon: '📝' },
      { ref: 'gdoc-pillar-2026',         name: 'Pillar contenuti 2026',            subtitle: 'Google Doc · cartella Strategie',        modified: 'gen 2026', icon: '📝' },
    ];
  },

  async _analyzeStrategy() {
    const s = this._state;
    const box = document.getElementById('pedStrategyPreview');
    box.querySelector('.ped-confirm-box__body').innerHTML = `<div class="ped-loading">Lettura della strategia in corso…</div>`;
    let data = null;
    let serverErr = null;
    try {
      if (window.Sync && Sync._api) {
        data = await Sync._api('POST', '/ped/strategy/parse', { source: s.strategySource, ref: s.strategyRef, clientSyncId: s.clientSyncId });
      }
    } catch (e) {
      serverErr = e && e.message ? e.message : String(e);
    }
    // Fallback: se il backend non ha l'endpoint (404) o è offline, uso il
    // mock locale così l'operatore può comunque proseguire. Avviso chiaro
    // nella note in basso così Luigi sa che deve riavviare il server.
    if (!data) data = { ...this._mockStrategyParse(), _serverErr: serverErr };
    box.querySelector('.ped-confirm-box__body').innerHTML = `
      <div class="ped-kv"><b>Tone of voice:</b> ${data.tone || '—'}</div>
      <div class="ped-kv"><b>Pillar contenuti:</b> ${(data.pillars || []).join(' · ') || '—'}</div>
      <div class="ped-kv"><b>Target:</b> ${data.target || '—'}</div>
      <div class="ped-kv"><b>Frequenza:</b> ${data.frequency || '—'}</div>
      ${data.warnings && data.warnings.length ? `<div class="ped-warn">⚠ ${data.warnings.join(' · ')}</div>` : ''}
      ${data._serverErr ? `<div class="ped-warn">⚠ Endpoint <code>/ped/strategy/parse</code> non risponde (${data._serverErr}). Mostro dati simulati. <b>Riavvia il backend</b> per applicare le modifiche server.</div>` : ''}
      <div class="ped-source-note">Fonte: ${data.source || s.strategySource} · ${data._mock || data._serverErr ? 'dati simulati (integrazione Canva/Drive da abilitare)' : 'live'}</div>
    `;
  },

  _mockStrategyParse() {
    return {
      tone: 'Caldo, professionale, ispirazionale',
      pillars: ['Behind the scenes', 'Prodotti & servizi', 'Testimonianze', 'Lifestyle locale'],
      target: '25–45 anni, area Abruzzo, interessi lifestyle e qualità della vita',
      frequency: '3 post a settimana + 2 reel + 1 carosello',
      warnings: [],
      source: 'mock',
      _mock: true,
    };
  },

  // ==========================================================
  // STEP 4 — Fonti media: account Canva/Drive + cartelle di lavoro
  // + scelta auto/manuale. Lo step Media (5) appare SOLO se mode='manual'.
  // ==========================================================
  async _renderSourcesStep() {
    const body = document.getElementById('pedActiveBody');
    if (!body) return;
    const s = this._state;
    body.innerHTML = `
      <p class="ped-question">Da dove deve prendere i media il sistema? Collega gli account e indica le cartelle del cliente.</p>

      <section class="ped-sources-section">
        <div class="ped-sources-section__head">
          <h3 class="ped-sources-section__title">🎨 Brand Kit Canva del cliente</h3>
          <p class="ped-sources-section__hint">Il logo, i colori e i font che il sistema applicherà al design generato. Si configura UNA volta per cliente, viene riusato in tutti i PED.</p>
        </div>
        <div id="pedBrandKitWrap" class="ped-brand-kit-wrap"></div>
      </section>

      <section class="ped-sources-section">
        <div class="ped-sources-section__head">
          <h3 class="ped-sources-section__title">📁 Cartelle media (foto e video)</h3>
          <p class="ped-sources-section__hint">Le cartelle Canva e Drive da cui il sistema sceglierà foto e reel per i post di questo mese.</p>
        </div>
        <div class="ped-provider-grid" id="pedProviderGrid"></div>
        <div id="pedSourcesPickerWrap" class="ped-sources-folders"></div>
      </section>

      <div class="ped-mode-section">
        <div class="ped-field__label" style="margin-bottom:6px">E ora: chi sceglie i media tra quelli disponibili?</div>
        <div class="ped-mode-grid">
          <label class="ped-mode-card ${s.mode === 'auto' ? 'is-selected' : ''}">
            <input type="radio" name="pedMode" value="auto" ${s.mode === 'auto' ? 'checked' : ''}>
            <div class="ped-mode-card__title">🤖 Sistema sceglie</div>
            <div class="ped-mode-card__sub">Il tool seleziona dalle cartelle sopra i media coerenti con la strategia (foto + reel), evita ripetizioni e prepara il PED. Tu vai direttamente alla revisione.</div>
            <ul class="ped-mode-card__bullets">
              <li>Anti-ripetizione attiva (memoria PED)</li>
              <li>Tolleranza per varianti già usate (modificata 30–50%, scontornata, con logo)</li>
              <li>Più veloce: si salta lo step Media</li>
            </ul>
          </label>
          <label class="ped-mode-card ${s.mode === 'guided' ? 'is-selected' : ''}">
            <input type="radio" name="pedMode" value="guided" ${s.mode === 'guided' ? 'checked' : ''}>
            <div class="ped-mode-card__title">🤝 Scelgo io, guidato dall'AI</div>
            <div class="ped-mode-card__sub">L'AI fa una pre-selezione, tu approvi/sostituisci ogni media uno per uno. Lo step Media diventa interattivo: pre-selezione AI + scelta finale tua. Più controllo per situazioni delicate (nuovo cliente, cambio strategia).</div>
            <ul class="ped-mode-card__bullets">
              <li>AI propone, tu decidi su ogni media</li>
              <li>Avviso "già usata" su ogni media riproposto</li>
              <li>Si attiva lo step <b>Media</b> successivo con preview + filtri</li>
            </ul>
          </label>
        </div>
      </div>

      <div class="ped-actions">
        <button class="btn btn--primary" type="button" id="pedSourcesNext">Continua</button>
      </div>
    `;

    // Click handler mode card
    body.querySelectorAll('.ped-mode-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target && e.target.tagName === 'INPUT') return;
        const val = card.querySelector('input').value;
        s.mode = val;
        body.querySelectorAll('.ped-mode-card').forEach(c => c.classList.remove('is-selected'));
        card.classList.add('is-selected');
        const radio = card.querySelector('input');
        if (radio) radio.checked = true;
        // Rilancio renderSteps perché la sidebar deve riflettere "Media" visibile/non
        this._renderSteps();
      });
    });
    document.getElementById('pedSourcesNext').addEventListener('click', () => {
      if (!s.sources || !s.sources.length) {
        App._toast && App._toast('Aggiungi almeno una cartella media (Canva o Drive)', 'info');
        return;
      }
      this._advance();
    });

    await this._renderProviderCards();
    this._renderSourcesFolders();
    this._renderBrandKitWrap();
  },

  /** Sezione "Brand Kit": permette di collegare il Brand Kit Canva del
   *  cliente (la sezione "Brand" che vedi nel menu laterale Canva, con
   *  logo + colori + font + voce + foto + grafica + icone + grafici).
   *
   *  Importante: l'API Connect di Canva NON espone l'entità Brand Kit in
   *  maniera diretta. La nostra lista è derivata raggruppando i
   *  brand-templates per `brand_id`. Salvare un brand_id sul cliente ci
   *  permetterà in fase 2 (scrittura PED su Canva) di:
   *  - filtrare i template del cliente per brand_id
   *  - applicare lo styling del brand (colori/font) tramite autofill
   *
   *  Persistenza: `canvaBrandKitId` + `canvaBrandKitName` sul cliente.
   *  I vecchi campi `canvaBrandTemplateId/Name` restano per backward-compat. */
  async _renderBrandKitWrap() {
    const wrap = document.getElementById('pedBrandKitWrap');
    if (!wrap) return;
    const s = this._state;
    // Backward-compat: se prima era stato salvato un template come "brand kit", lo riusiamo
    const currentBrandId = s.canvaBrandKitId || s.canvaBrandTemplateId || '';
    const currentBrandName = s.canvaBrandKitName || s.canvaBrandTemplateName || '';
    wrap.innerHTML = `
      <div class="ped-brand-kit-status">
        ${currentBrandName ? `
          <div class="ped-brand-kit-status__active">
            <span class="ped-brand-kit-status__label">✨ Brand Kit attivo:</span>
            <span class="ped-brand-kit-status__value">${currentBrandName.replace(/[<>]/g, '')}</span>
            <button class="ped-link" type="button" id="pedBrandKitChange">Cambia</button>
          </div>
        ` : `
          <div class="ped-brand-kit-status__empty">
            <span>Nessun Brand Kit collegato per questo cliente.</span>
            <button class="btn btn--secondary btn--sm" type="button" id="pedBrandKitChoose">Collega Brand Kit Canva</button>
          </div>
        `}
        <div class="ped-brand-kit-hint">
          <small>💡 Su Canva il <b>Brand Kit</b> sta nel menu a sinistra sotto "Brand" e raccoglie linee guida, logo, colori, font, voce del brand, foto, grafica, icone, grafici. Collegandolo qui, lo useremo per personalizzare i PED generati per questo cliente.</small>
        </div>
      </div>
      <div id="pedBrandKitPicker"></div>
    `;
    const chooseBtn = document.getElementById('pedBrandKitChoose') || document.getElementById('pedBrandKitChange');
    if (chooseBtn) chooseBtn.addEventListener('click', () => this._openBrandKitPicker());
  },

  /** Apre il picker dei Brand Kit Canva (derivati dal raggruppamento dei
   *  brand-templates per brand_id). */
  async _openBrandKitPicker() {
    const picker = document.getElementById('pedBrandKitPicker');
    if (!picker) return;
    picker.innerHTML = `
      <div class="ped-folder-picker">
        <div class="ped-folder-picker__head">
          <div class="ped-folder-picker__title">✨ Collega Brand Kit Canva</div>
          <button class="ped-link" type="button" id="pedBrandKitCancel">Chiudi</button>
        </div>
        <div class="ped-folder-picker__list" id="pedBrandKitList"><div class="ped-loading">Carico i Brand Kit dal tuo account Canva…</div></div>
      </div>
    `;
    document.getElementById('pedBrandKitCancel').addEventListener('click', () => {
      picker.innerHTML = '';
    });
    const list = document.getElementById('pedBrandKitList');
    let items = [];
    let errMsg = null;
    let apiNote = null;
    try {
      if (window.Sync && Sync._api) {
        const data = await Sync._api('GET', '/ped/canva/brand-kits');
        items = (data && data.items) || [];
        apiNote = data && data._note;
        if (data && data._notConfigured) errMsg = 'Canva non collegato (OAuth non completato — Integrazioni → Canva)';
        else if (data && data._apiError) errMsg = data.message || 'Errore API Canva';
      }
    } catch (e) {
      errMsg = e && e.message ? e.message : String(e);
    }
    if (!items.length) {
      list.innerHTML = `<div class="ped-folder-picker__empty">
        ${errMsg ? `⚠ ${errMsg}<br><br>` : ''}
        Nessun Brand Kit trovato nell'account Canva.<br>
        <small>Su Canva, vai nel menu laterale a sinistra → <b>Brand</b> → crea un Brand Kit per il cliente, oppure crea almeno 1 Brand Template legato al brand. Una volta creato, ricarica questa pagina.</small>
      </div>`;
      return;
    }
    list.innerHTML = `
      ${apiNote ? `<div class="ped-folder-picker__hint"><small>ℹ️ ${apiNote}</small></div>` : ''}
      ${items.map(it => {
        const safe = v => String(v == null ? '' : v).replace(/[<>"]/g, '');
        const tplCount = (it.templates || []).length;
        const tplsList = tplCount && it.brandId
          ? `<div class="ped-picker__sublist">${it.templates.slice(0, 3).map(t => `<span class="ped-picker__sub-chip">📄 ${safe(t.name)}</span>`).join('')}${tplCount > 3 ? `<span class="ped-picker__sub-more">+${tplCount - 3} altri</span>` : ''}</div>`
          : '';
        return `
          <button class="ped-picker__item" type="button"
                  data-id="${safe(it.id)}"
                  data-name="${safe(it.name).replace(/"/g, '&quot;')}"
                  data-brand-id="${safe(it.brandId || '')}"
                  data-template-ids="${(it.templateIds || []).join(',')}">
            <div class="ped-picker__icon">${it.icon || '✨'}</div>
            <div class="ped-picker__body">
              <div class="ped-picker__name">${safe(it.name)}</div>
              <div class="ped-picker__meta">${safe(it.subtitle)}${it.modified ? ` · aggiornato ${it.modified}` : ''}</div>
              ${tplsList}
            </div>
          </button>`;
      }).join('')}
    `;
    list.querySelectorAll('.ped-picker__item').forEach(btn => {
      btn.addEventListener('click', async () => {
        const s = this._state;
        s.canvaBrandKitId = btn.dataset.id;
        s.canvaBrandKitName = btn.dataset.name;
        s.canvaBrandId = btn.dataset.brandId || null;
        s.canvaBrandTemplateIds = (btn.dataset.templateIds || '').split(',').filter(Boolean);
        // Mantengo anche i vecchi field per back-compat con record esistenti
        s.canvaBrandTemplateId = s.canvaBrandKitId;
        s.canvaBrandTemplateName = s.canvaBrandKitName;
        // Persist sul cliente
        try {
          if (window.DB && s.clientSyncId) {
            const all = await DB.all('clients');
            const c = all.find(x => x.syncId === s.clientSyncId);
            if (c) {
              c.canvaBrandKitId = s.canvaBrandKitId;
              c.canvaBrandKitName = s.canvaBrandKitName;
              c.canvaBrandId = s.canvaBrandId;
              c.canvaBrandTemplateIds = s.canvaBrandTemplateIds;
              // Back-compat
              c.canvaBrandTemplateId = s.canvaBrandKitId;
              c.canvaBrandTemplateName = s.canvaBrandKitName;
              await DB.put('clients', c);
            }
          }
        } catch (_) {}
        App._toast && App._toast(`Brand Kit "${s.canvaBrandKitName}" collegato a ${s.clientName}`, 'success');
        document.getElementById('pedBrandKitPicker').innerHTML = '';
        this._renderBrandKitWrap();
      });
    });
  },

  /** Card per ogni provider possibile (Canva / Drive): mostra stato
   *  collegamento + bottone "Aggiungi cartella" (apre il picker cartelle). */
  async _renderProviderCards() {
    const root = document.getElementById('pedProviderGrid');
    if (!root) return;
    const providers = [
      { key: 'canva', label: 'Canva',       sub: 'Brand Kit + cartelle progetti del cliente',     mapping: 'canva' },
      { key: 'drive', label: 'Google Drive', sub: 'Cartelle media del cliente (foto, reel, doc)', mapping: 'google_drive' },
    ];
    root.innerHTML = providers.map(p => `<div class="ped-provider-card" data-prov="${p.key}" data-loading="1">
      <div class="ped-provider-card__head">
        <div class="ped-provider-card__icon">${p.key === 'canva' ? '🎨' : '🗂️'}</div>
        <div class="ped-provider-card__body">
          <div class="ped-provider-card__title">${p.label}</div>
          <div class="ped-provider-card__sub">${p.sub}</div>
        </div>
        <div class="ped-provider-card__status" data-status="${p.key}">…</div>
      </div>
      <div class="ped-provider-card__actions" data-actions="${p.key}"></div>
    </div>`).join('');
    // Status async
    for (const p of providers) {
      this._fetchProviderStatus(p);
    }
  },

  async _fetchProviderStatus(p) {
    const card = document.querySelector(`[data-prov="${p.key}"]`);
    if (!card) return;
    const statusEl = card.querySelector(`[data-status="${p.key}"]`);
    const actionsEl = card.querySelector(`[data-actions="${p.key}"]`);
    let info = { connected: false, account: null, _serverErr: null };
    try {
      if (window.Sync && Sync._api) {
        info = await Sync._api('GET', `/ped/integrations/status?provider=${p.mapping}`);
      }
    } catch (e) {
      info._serverErr = e && e.message ? e.message : String(e);
    }
    if (info.connected) {
      statusEl.innerHTML = `<span class="ped-conn-pill ped-conn-pill--ok">✓ OAuth attivo</span>`;
      actionsEl.innerHTML = `
        <div class="ped-provider-account">${info.account || '—'}</div>
        <button class="btn btn--secondary btn--sm" type="button" data-add="${p.key}">+ Aggiungi cartella</button>
        <button class="ped-link" type="button" data-disconnect="${p.key}">Cambia account</button>
      `;
    } else if (info.credsOnly) {
      statusEl.innerHTML = `<span class="ped-conn-pill ped-conn-pill--warn">⚠ manca OAuth</span>`;
      actionsEl.innerHTML = `
        <div class="ped-provider-account" style="color:#92400e">Credenziali app salvate, ma il login utente non è stato fatto.</div>
        <button class="btn btn--primary btn--sm" type="button" data-connect="${p.key}">Completa login ${p.label}</button>
        <button class="ped-link" type="button" data-add="${p.key}">+ Aggiungi cartella simulata</button>
      `;
    } else {
      statusEl.innerHTML = `<span class="ped-conn-pill ped-conn-pill--off">non collegato</span>`;
      actionsEl.innerHTML = `
        <button class="btn btn--primary btn--sm" type="button" data-connect="${p.key}">Collega ${p.label}</button>
        ${info._serverErr ? `<div class="ped-tag ped-tag--todo" title="${info._serverErr}">backend offline</div>` : ''}
      `;
    }
    actionsEl.querySelectorAll('[data-connect],[data-disconnect]').forEach(b => {
      b.addEventListener('click', () => {
        if (window.App && App.navigate) App.navigate('integrations');
      });
    });
    actionsEl.querySelectorAll('[data-add]').forEach(b => {
      b.addEventListener('click', () => this._openFolderPicker(p.key));
    });
  },

  _renderSourcesFolders() {
    const root = document.getElementById('pedSourcesPickerWrap');
    if (!root) return;
    const s = this._state;
    if (!s.sources.length) {
      root.innerHTML = `<div class="ped-empty">Nessuna cartella selezionata. Clicca <b>+ Aggiungi cartella</b> sopra per scegliere da dove il sistema deve leggere i media.</div>`;
      return;
    }
    root.innerHTML = `
      <div class="ped-field__label" style="margin:14px 0 8px">Cartelle media selezionate</div>
      <ul class="ped-folder-list">
        ${s.sources.map((f, i) => `
          <li class="ped-folder-item">
            <span class="ped-folder-item__icon">${f.provider === 'canva' ? '🎨' : '🗂️'}</span>
            <span class="ped-folder-item__name">${f.folderName}</span>
            <span class="ped-folder-item__meta">${f.provider === 'canva' ? 'Canva' : 'Drive'}</span>
            <button class="ped-link" type="button" data-rm="${i}">Rimuovi</button>
          </li>
        `).join('')}
      </ul>
    `;
    root.querySelectorAll('[data-rm]').forEach(b => {
      b.addEventListener('click', () => {
        const idx = parseInt(b.dataset.rm, 10);
        s.sources.splice(idx, 1);
        this._renderSourcesFolders();
      });
    });
  },

  /** Picker con drill-down: click cartella entra dentro, breadcrumb torna su,
   *  bottone "Seleziona questa" per scegliere il livello corrente. */
  async _openFolderPicker(provider) {
    const s = this._state;
    const root = document.getElementById('pedSourcesPickerWrap');
    if (!root) return;
    root.innerHTML = `
      <div class="ped-folder-picker">
        <div class="ped-folder-picker__head">
          <div class="ped-folder-picker__title">${provider === 'canva' ? '🎨 Cartelle Canva' : '🗂️ Cartelle Drive'}</div>
          <div class="ped-search" style="margin:0; flex:1; max-width:280px;">
            <input class="input" id="pedFolderSearch" type="search" placeholder="Cerca cartella…" autocomplete="off">
          </div>
          <button class="ped-link" type="button" id="pedFolderCancel">Chiudi</button>
        </div>
        <nav class="ped-folder-picker__crumbs" id="pedFolderCrumbs"></nav>
        <div class="ped-folder-picker__list" id="pedFolderList"><div class="ped-loading">Carico cartelle del cliente…</div></div>
        <div class="ped-folder-picker__foot" id="pedFolderFoot"></div>
      </div>
    `;
    document.getElementById('pedFolderCancel').addEventListener('click', () => this._renderSourcesFolders());

    // State del picker: include breadcrumb per drill-down e mode (root/navigate).
    // breadcrumb: array di {id, name, driveId?} dalla radice. Vuoto = sono al root.
    this._folderPickerState = {
      provider,
      allItems: [],
      data: null,
      query: '',
      isMock: false,
      breadcrumb: [],  // [{id, name, driveId?}, ...]
    };

    await this._loadFolderLevel();

    // Search ibrida:
    //  - ≤1 char: filter client-side su livello corrente (istantaneo)
    //  - ≥2 char: ricerca GLOBALE via server (cerca in TUTTO l'account,
    //    non solo nel breadcrumb corrente)
    const searchInput = document.getElementById('pedFolderSearch');
    let searchTimer;
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim();
      this._folderPickerState.query = q.toLowerCase();
      clearTimeout(searchTimer);
      if (q.length >= 2) {
        // Search globale: debounce 350ms per non spammare server
        this._renderFolderPickerList(); // intanto mostro filter client-side
        searchTimer = setTimeout(() => this._runGlobalSearch(q), 350);
      } else {
        // Reset alla lista del livello corrente
        this._folderPickerState.globalResults = null;
        this._renderFolderPickerList();
      }
    });
  },

  /** Ricerca globale lato server: cerca in TUTTE le cartelle del provider,
   *  non solo nel livello corrente del breadcrumb. */
  async _runGlobalSearch(query) {
    const st = this._folderPickerState;
    if (!st) return;
    const list = document.getElementById('pedFolderList');
    if (list) list.insertAdjacentHTML('afterbegin', '<div class="ped-folder-picker__searching">🔎 Ricerca globale in tutto l\'account…</div>');
    try {
      if (window.Sync && Sync._api) {
        const data = await Sync._api('POST', '/ped/resources/search', {
          provider: st.provider,
          query,
          kind: 'media_folder',
        });
        st.globalResults = (data && data.items) || [];
        st.query = query.toLowerCase();
        this._renderFolderPickerList();
      }
    } catch (e) {
      st.globalResults = [];
      this._renderFolderPickerList();
    }
  },

  /** Carica il livello corrente (root o dentro una cartella) dal server. */
  async _loadFolderLevel() {
    const s = this._state;
    const st = this._folderPickerState;
    const list = document.getElementById('pedFolderList');
    if (list) list.innerHTML = '<div class="ped-loading">Carico cartelle…</div>';

    let items = [];
    let data = null;
    const isRoot = st.breadcrumb.length === 0;
    const current = isRoot ? null : st.breadcrumb[st.breadcrumb.length - 1];

    try {
      if (window.Sync && Sync._api) {
        data = await Sync._api('POST', '/ped/resources/list', {
          provider: st.provider,
          clientSyncId: s.clientSyncId,
          kind: 'media_folder',
          // Modalità navigate solo se siamo dentro una cartella
          navigate: !isRoot,
          parentId: isRoot ? undefined : current.id,
          driveId: isRoot ? undefined : (current.driveId || undefined),
        });
        items = (data && data.items) || [];
      }
    } catch {}

    let usingMock = false;
    if (!items.length && isRoot) {
      items = this._mockMediaFolders(st.provider);
      usingMock = true;
    }
    // Niente fallback mock quando siamo dentro una cartella: una cartella
    // può legittimamente non avere sotto-cartelle.

    st.allItems = items;
    st.data = data;
    st.isMock = usingMock;
    st.query = '';
    const searchInput = document.getElementById('pedFolderSearch');
    if (searchInput) searchInput.value = '';

    this._renderFolderPickerCrumbs();
    this._renderFolderPickerList();
    this._renderFolderPickerFoot();
  },

  /** Breadcrumb cliccabile per tornare a livelli superiori. */
  _renderFolderPickerCrumbs() {
    const el = document.getElementById('pedFolderCrumbs');
    if (!el) return;
    const st = this._folderPickerState;
    const providerLabel = st.provider === 'canva' ? 'Canva' : 'Drive';
    let html = `<button class="ped-folder-crumb" type="button" data-crumb="-1">${providerLabel}</button>`;
    st.breadcrumb.forEach((b, i) => {
      html += `<span class="ped-folder-crumb__sep">›</span>`;
      html += `<button class="ped-folder-crumb ${i === st.breadcrumb.length - 1 ? 'is-current' : ''}" type="button" data-crumb="${i}">${String(b.name).replace(/[<>]/g, '')}</button>`;
    });
    el.innerHTML = html;
    el.querySelectorAll('[data-crumb]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = parseInt(btn.dataset.crumb, 10);
        // -1 = torna al root; altrimenti tieni i primi (idx+1) elementi
        st.breadcrumb = idx === -1 ? [] : st.breadcrumb.slice(0, idx + 1);
        await this._loadFolderLevel();
      });
    });
  },

  /** Footer del picker: bottone "Seleziona questa cartella" se siamo
   *  dentro un livello specifico, oppure niente al root. */
  _renderFolderPickerFoot() {
    const el = document.getElementById('pedFolderFoot');
    if (!el) return;
    const s = this._state;
    const st = this._folderPickerState;
    if (!st.breadcrumb.length) {
      el.innerHTML = `<span class="ped-folder-picker__foot-hint">Clicca una cartella per entrare, oppure usa <b>Seleziona</b> sulla riga per aggiungerla come fonte.</span>`;
      return;
    }
    const current = st.breadcrumb[st.breadcrumb.length - 1];
    el.innerHTML = `
      <span class="ped-folder-picker__foot-hint">Sei in <b>${String(current.name).replace(/[<>]/g, '')}</b>. Naviga ancora o:</span>
      <button class="btn btn--primary btn--sm" type="button" id="pedFolderSelectCurrent">
        ✓ Seleziona questa cartella
      </button>
    `;
    const sel = document.getElementById('pedFolderSelectCurrent');
    if (sel) sel.addEventListener('click', () => {
      if (s.sources.some(x => x.provider === st.provider && x.folderId === current.id)) {
        App._toast && App._toast('Cartella già aggiunta', 'info');
        return;
      }
      // Path leggibile come folderName
      const path = st.breadcrumb.map(b => b.name).join(' › ');
      s.sources.push({
        provider: st.provider,
        folderId: current.id,
        folderName: path,
        driveId: current.driveId || null,
      });
      this._renderSourcesFolders();
    });
  },

  /** Rendering separato della lista per re-render dopo search. */
  _renderFolderPickerList() {
    const s = this._state;
    const list = document.getElementById('pedFolderList');
    if (!list) return;
    const { provider, allItems, data, query, isMock, globalResults } = this._folderPickerState;
    const account = data && data._account;
    const isLive = !!(data && data._live);
    const depths = data && data._depths;
    const counts = data && data.counts;

    // Decide quale lista mostrare:
    //  - globalResults presente → search globale lato server attiva
    //  - altrimenti → filter client-side su allItems del livello corrente
    const q = (query || '').toLowerCase();
    let filtered;
    let isGlobalSearch = false;
    if (globalResults && q.length >= 2) {
      // Risultati search globale: già filtrati lato server, non rifiltro client
      filtered = globalResults;
      isGlobalSearch = true;
    } else {
      filtered = q
        ? allItems.filter(it =>
            ((it.name || '') + ' ' + (it.subtitle || '')).toLowerCase().includes(q))
        : allItems;
    }

    // Banner contestuale per provider (mostra SEMPRE i totali, non i filtrati)
    let banner = '';
    if (provider === 'canva' && isLive) {
      banner = `
        <div class="ped-folder-picker__account">
          <span><b>${allItems.length}</b> cartelle Canva caricate${depths ? ` (${depths.d0} top + ${depths.d1} sub + ${depths.d2} sub-sub)` : ''}${account ? ` · account: <b>${String(account).replace(/[<>]/g, '')}</b>` : ''}${q ? ` · <b>${filtered.length}</b> filtrate per "${String(query).replace(/[<>]/g, '')}"` : ''}</span>
          <span class="ped-folder-picker__tip">Se mancano cartelle del team, verifica di aver collegato Canva con l'account membro del team Abruzzo Digitale (Impostazioni → Integrazioni → Canva → Disconnetti e riconnetti).</span>
        </div>`;
    } else if ((provider === 'drive' || provider === 'google_drive') && isLive) {
      banner = `
        <div class="ped-folder-picker__account">
          <span><b>${allItems.length}</b> elementi Drive${counts ? ` (${counts.sharedDrives} Drive condivisi + ${counts.myDriveFolders} cartelle in My Drive)` : ''}${q ? ` · <b>${filtered.length}</b> filtrati per "${String(query).replace(/[<>]/g, '')}"` : ''}</span>
          ${counts && counts.sharedDrives === 0 ? `<span class="ped-folder-picker__tip">⚠ Nessun Drive condiviso visto. Se ne hai col tuo account Workspace, verifica di aver disconnesso e riconnesso Google dopo l'aggiornamento dello scope (drive.readonly).</span>` : ''}
        </div>`;
    } else if (isMock) {
      banner = `<div class="ped-folder-picker__account"><span>⚠ ${(data && data.reason) || 'Mostro dati simulati'} — la chiamata API non è andata live (riavvia il backend o ricollega l'account)</span></div>`;
    }

    // Banner search globale
    if (isGlobalSearch) {
      banner += `<div class="ped-folder-picker__global-banner">🌐 <b>Ricerca globale</b> attiva su tutto l'account ${provider}: ${filtered.length} risultati per "${String(query).replace(/[<>]/g, '')}". <small>Cancella la ricerca per tornare alla navigazione cartelle.</small></div>`;
    }

    // Empty state quando la search non trova niente
    if (q && !filtered.length) {
      list.innerHTML = banner + `
        <div class="ped-folder-picker__empty">
          Nessuna cartella combacia con <b>"${String(query).replace(/[<>]/g, '')}"</b>.<br>
          <small>${isGlobalSearch ? 'La ricerca globale ha controllato tutto l\'account. Prova un termine diverso o' : `Prova con un termine più corto o`} pulisci la ricerca per vedere tutte le ${allItems.length} cartelle.</small>
        </div>`;
      return;
    }

    // Ogni riga ha 3 zone:
    //   - icona + nome + meta (zona principale, cliccabile per ENTRARE dentro)
    //   - bottone "Apri" (esplicito per drill-down)
    //   - bottone "Seleziona" (sceglie questa cartella come fonte)
    list.innerHTML = banner + filtered.map(it => {
      const itemData = JSON.stringify({
        id: it.id,
        name: it.name || '',
        driveId: it._driveId || null,
        hasChildren: it._hasChildren !== false,
      }).replace(/"/g, '&quot;');
      return `
      <div class="ped-picker__item ped-picker__item--row" data-item="${itemData}">
        <button class="ped-picker__item-main" type="button" data-act="open">
          <div class="ped-picker__icon">${it.icon || '📁'}</div>
          <div class="ped-picker__body">
            <div class="ped-picker__name">${this._highlightMatch(it.name, q)}</div>
            <div class="ped-picker__meta">${this._highlightMatch(it.subtitle || '', q)}${it.modified ? ` · aggiornata ${it.modified}` : ''}</div>
          </div>
          ${it._hasChildren !== false ? '<span class="ped-picker__open-hint">apri →</span>' : ''}
        </button>
        <button class="ped-picker__item-select" type="button" data-act="select" title="Seleziona questa cartella come fonte media">
          ✓ Seleziona
        </button>
      </div>
    `;}).join('');

    // Handler: "Apri" → entra dentro; "Seleziona" → aggiungi come fonte
    list.querySelectorAll('.ped-picker__item--row').forEach(row => {
      const itemData = JSON.parse(row.dataset.item);
      const openBtn = row.querySelector('[data-act="open"]');
      const selBtn  = row.querySelector('[data-act="select"]');

      if (openBtn) openBtn.addEventListener('click', async () => {
        if (!itemData.hasChildren) {
          App._toast && App._toast('Questa cartella non ha sotto-cartelle navigabili', 'info');
          return;
        }
        // Push nel breadcrumb e ricarica
        const { breadcrumb } = this._folderPickerState;
        breadcrumb.push({
          id: itemData.id,
          name: itemData.name,
          driveId: itemData.driveId,
        });
        await this._loadFolderLevel();
      });

      if (selBtn) selBtn.addEventListener('click', () => {
        if (s.sources.some(x => x.provider === provider && x.folderId === itemData.id)) {
          App._toast && App._toast('Cartella già aggiunta', 'info');
          return;
        }
        // Path leggibile: breadcrumb corrente + nome cartella
        const st = this._folderPickerState;
        const pathParts = st.breadcrumb.map(b => b.name).concat(itemData.name);
        s.sources.push({
          provider,
          folderId: itemData.id,
          folderName: pathParts.join(' › '),
          driveId: itemData.driveId,
        });
        this._renderSourcesFolders();
      });
    });
  },

  /** Evidenzia in `<mark>` la porzione di testo che matcha la query. */
  _highlightMatch(text, query) {
    if (!query || !text) return String(text || '').replace(/[<>]/g, '');
    const safe = String(text).replace(/[<>]/g, '');
    // Escape caratteri regex nella query
    const escaped = String(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('(' + escaped + ')', 'gi');
    return safe.replace(re, '<mark class="ped-mark">$1</mark>');
  },

  _mockMediaFolders(provider) {
    if (provider === 'canva') return [
      { id: 'canva-folder-brandkit',  name: 'Brand Kit — ' + (this._state.clientName || 'cliente'), subtitle: 'Cartella Canva del cliente · 124 elementi', icon: '🎨', modified: 'mar 2026' },
      { id: 'canva-folder-shooting',  name: 'Shooting 2026',                                       subtitle: 'Cartella Canva · 68 foto · 12 reel',        icon: '📷', modified: 'feb 2026' },
      { id: 'canva-folder-templates', name: 'Template PED',                                        subtitle: 'Cartella Canva · 8 template',               icon: '📐', modified: 'gen 2026' },
    ];
    return [
      { id: 'drive-folder-shooting-2026', name: 'Shooting 2026',                  subtitle: 'Drive · 312 file',           icon: '🗂️', modified: 'mar 2026' },
      { id: 'drive-folder-archivio',      name: 'Archivio media storico',         subtitle: 'Drive · 1.4k file',          icon: '🗂️', modified: 'dic 2025' },
      { id: 'drive-folder-reel-raw',      name: 'Reel raw — da editare',          subtitle: 'Drive · 24 file',            icon: '🎬', modified: 'feb 2026' },
    ];
  },

  // ==========================================================
  // STEP 5 — Selezione media (foto + reel selezionabili,
  // caroselli "DA CREARE" mostrati come placeholder disabilitato).
  // Source: Brand Kit Canva del cliente + cartella Drive (mock per ora).
  // ==========================================================
  async _renderAssetsStep() {
    const body = document.getElementById('pedActiveBody');
    if (!body) return;
    const s = this._state;
    const distHint = this._strategyDistributionHint(); // es. { foto: 50, reel: 20, carosello: 30 }
    body.innerHTML = `
      <p class="ped-question">${s.mode === 'auto' ? 'Ecco la pre-selezione del sistema dal Brand Kit Canva e dalla cartella Drive del cliente. Conferma o modifica.' : 'Scegli i media da usare questo mese. Foto e reel sono nel Brand Kit Canva e in Drive. I caroselli verranno creati da zero in fase di produzione.'}</p>
      <div class="ped-media-tabs" id="pedMediaTabs">
        <button class="ped-media-tab is-active" type="button" data-tab="all">Tutti</button>
        <button class="ped-media-tab" type="button" data-tab="foto">📷 Foto</button>
        <button class="ped-media-tab" type="button" data-tab="reel">🎬 Reel</button>
        <button class="ped-media-tab" type="button" data-tab="carosello">🎠 Caroselli</button>
      </div>
      <div class="ped-strategy-hint">Distribuzione consigliata dalla strategia: <b>${distHint.foto}% foto</b> · <b>${distHint.reel}% reel</b> · <b>${distHint.carosello}% caroselli</b> (i caroselli sono placeholder, vengono creati in fase 2).</div>
      <div id="pedAssetsGrid" class="ped-assets-grid"><div class="ped-loading">Lettura Brand Kit Canva e cartella Drive del cliente…</div></div>
      <div class="ped-actions">
        <button class="btn btn--secondary" type="button" id="pedAssetsReload">Ricarica</button>
        <button class="btn btn--primary" type="button" id="pedAssetsNext">Continua con ${s.selectedAssets.length || 0} media</button>
      </div>
    `;
    document.getElementById('pedAssetsReload').addEventListener('click', () => this._loadAssets());
    document.getElementById('pedAssetsNext').addEventListener('click', () => {
      if (!s.selectedAssets.length) { App._toast && App._toast('Seleziona almeno un media', 'info'); return; }
      this._advance();
    });
    // Tab filter
    body.querySelectorAll('.ped-media-tab').forEach(t => {
      t.addEventListener('click', () => {
        body.querySelectorAll('.ped-media-tab').forEach(x => x.classList.remove('is-active'));
        t.classList.add('is-active');
        this._currentMediaTab = t.dataset.tab;
        this._renderAssetsGrid();
      });
    });
    this._currentMediaTab = 'all';
    await this._loadAssets();
  },

  async _loadAssets() {
    const s = this._state;
    const grid = document.getElementById('pedAssetsGrid');
    if (!grid) return;
    grid.innerHTML = `<div class="ped-loading">Lettura Brand Kit Canva e cartella Drive del cliente…</div>`;
    this._loadedAssets = [];
    try {
      if (window.Sync && Sync._api) {
        const data = await Sync._api('POST', '/ped/assets/list', { clientSyncId: s.clientSyncId, year: s.year, month: s.month, mode: s.mode });
        this._loadedAssets = data.assets || [];
      }
    } catch (_) { /* offline */ }
    // Backwards-compat: se il backend è vecchio e non manda mediaType,
    // o se gli asset arrivati hanno thumbnail vuote/non valide, uso il
    // mock locale completo (foto+reel+caroselli con SVG thumb integrate).
    const needFallback = !this._loadedAssets.length
      || this._loadedAssets.some(a => !a.mediaType)
      || this._loadedAssets.every(a => !a.thumbUrl && a.mediaType !== 'carosello');
    if (needFallback) this._loadedAssets = this._mockAssets();
    this._renderAssetsGrid();
  },

  _renderAssetsGrid() {
    const s = this._state;
    const grid = document.getElementById('pedAssetsGrid');
    if (!grid) return;
    const tab = this._currentMediaTab || 'all';
    const assets = (this._loadedAssets || []).filter(a => tab === 'all' ? true : a.mediaType === tab);
    if (!assets.length) {
      grid.innerHTML = `<div class="ped-empty">Nessun media in questa categoria per il cliente. Aggiungi contenuti al Brand Kit Canva o alla cartella Drive del cliente.</div>`;
      return;
    }
    grid.innerHTML = assets.map(a => {
      const used = a.usedBefore;
      const placeholder = a.mediaType === 'carosello'; // caroselli: solo placeholder, non selezionabili
      const checked = s.selectedAssets.find(x => x.id === a.id) ? 'checked' : '';
      const isSel = !!checked;
      const sourceTag = a.source === 'drive' ? '🗂️ Drive' : '🎨 Canva';
      return `
        <label class="ped-asset ${used ? 'is-used' : ''} ${isSel ? 'is-selected' : ''} ${placeholder ? 'is-placeholder' : ''}" data-id="${a.id}">
          <input type="checkbox" ${checked} ${placeholder ? 'disabled' : ''} data-id="${a.id}">
          <div class="ped-asset__thumb" style="${a.thumbUrl ? `background-image:url('${a.thumbUrl}')` : ''}">
            ${placeholder
              ? `<div class="ped-asset__placeholder ped-asset__placeholder--carosello">
                  <div class="ped-asset__placeholder-icon">🎠</div>
                  <div class="ped-asset__placeholder-text">CAROSELLO<br>da creare</div>
                </div>`
              : (a.thumbUrl
                  ? ''
                  : `<div class="ped-asset__placeholder ped-asset__placeholder--${a.mediaType}">
                      <div class="ped-asset__placeholder-icon">${a.mediaType === 'reel' ? '🎬' : '📷'}</div>
                    </div>`)
            }
            <div class="ped-asset__source-tag">${sourceTag}</div>
            ${used ? `<div class="ped-asset__badge">⚠ già usata ${a.usedBefore.date || ''}</div>` : ''}
          </div>
          <div class="ped-asset__body">
            <div class="ped-asset__name">${a.name || a.id}</div>
            <div class="ped-asset__meta">
              <span class="ped-tag ped-tag--type" data-type="${a.mediaType}">${a.mediaType === 'foto' ? 'foto' : (a.mediaType === 'reel' ? 'reel' : 'carosello')}</span>
              ${a.variant && a.variant !== 'originale' && !placeholder ? `<span class="ped-tag" data-variant="${a.variant}">${a.variant}</span>` : ''}
              ${placeholder ? `<span class="ped-tag ped-tag--todo">fase 2</span>` : ''}
            </div>
          </div>
        </label>
      `;
    }).join('');
    grid.querySelectorAll('input[type="checkbox"]:not([disabled])').forEach(cb => {
      cb.addEventListener('change', () => {
        const id = cb.dataset.id;
        const asset = (this._loadedAssets || []).find(a => a.id === id);
        if (cb.checked) {
          if (!s.selectedAssets.find(x => x.id === id)) s.selectedAssets.push(asset);
        } else {
          s.selectedAssets = s.selectedAssets.filter(x => x.id !== id);
        }
        cb.closest('.ped-asset').classList.toggle('is-selected', cb.checked);
        const next = document.getElementById('pedAssetsNext');
        if (next) next.textContent = `Continua con ${s.selectedAssets.length} media`;
      });
    });
  },

  /** Mock realistici: foto + reel veri, caroselli come placeholder.
   *  thumbUrl: usiamo data-URI SVG così non dipendiamo da rete. */
  _mockAssets() {
    const svgThumb = (label, color) => `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 130'>
        <rect width='200' height='130' fill='${color}'/>
        <text x='100' y='75' fill='white' font-family='sans-serif' font-size='15' font-weight='600' text-anchor='middle'>${label}</text>
      </svg>`
    )}`;
    return [
      // Brand Kit Canva — foto
      { id: 'canva-photo-01', name: 'Shooting interno locale',     mediaType: 'foto', source: 'canva', variant: 'originale',            thumbUrl: svgThumb('Foto locale', '#235634'),    driveMatch: true,  usedBefore: null },
      { id: 'canva-photo-02', name: 'Dettaglio piatto signature',  mediaType: 'foto', source: 'canva', variant: 'originale',            thumbUrl: svgThumb('Dettaglio piatto', '#3b82f6'), driveMatch: true,  usedBefore: { date: 'mar 2026' } },
      { id: 'canva-photo-03', name: 'Vista esterna sera',          mediaType: 'foto', source: 'canva', variant: 'parzialmente modificata', thumbUrl: svgThumb('Esterno sera', '#1f2937'), driveMatch: true,  usedBefore: null },
      { id: 'drive-photo-04', name: 'Persone al tavolo',           mediaType: 'foto', source: 'drive', variant: 'originale',            thumbUrl: svgThumb('Persone tavolo', '#7c3aed'), driveMatch: false, usedBefore: null },
      { id: 'canva-photo-05', name: 'Logo + claim',                mediaType: 'foto', source: 'canva', variant: 'con testi/logo',       thumbUrl: svgThumb('Logo + claim', '#dc2626'),   driveMatch: true,  usedBefore: { date: 'apr 2026' } },
      { id: 'drive-photo-06', name: 'BTS staff cucina',            mediaType: 'foto', source: 'drive', variant: 'originale',            thumbUrl: svgThumb('BTS cucina', '#ea580c'),     driveMatch: true,  usedBefore: null },
      // Reel — disponibili
      { id: 'canva-reel-01',  name: 'Reel preparazione signature',  mediaType: 'reel', source: 'canva', variant: 'originale',            thumbUrl: svgThumb('Reel signature', '#7c2d12'), driveMatch: true,  usedBefore: null },
      { id: 'drive-reel-02',  name: 'Reel apertura locale',         mediaType: 'reel', source: 'drive', variant: 'originale',            thumbUrl: svgThumb('Reel apertura', '#0d9488'),  driveMatch: false, usedBefore: null },
      // Caroselli — placeholder fase 2
      { id: 'carousel-ph-01', name: 'Carosello "Collezione Estate"', mediaType: 'carosello', source: 'canva', variant: 'carosello',     thumbUrl: null, driveMatch: false, usedBefore: null },
      { id: 'carousel-ph-02', name: 'Carosello "Tutorial signature"', mediaType: 'carosello', source: 'canva', variant: 'carosello',    thumbUrl: null, driveMatch: false, usedBefore: null },
    ];
  },

  /** Distribuzione media nel set selezionato. Usata per summary + generazione. */
  _mediaDistribution(assets) {
    const dist = { foto: 0, reel: 0, carosello: 0 };
    for (const a of (assets || [])) {
      if (a.mediaType === 'foto') dist.foto++;
      else if (a.mediaType === 'reel') dist.reel++;
      else if (a.mediaType === 'carosello') dist.carosello++;
    }
    return dist;
  },

  /** Hint distribuzione % suggerita dalla strategia (lato server in futuro). */
  _strategyDistributionHint() {
    // Default ragionevole se non c'è strategia parsata: 50/20/30 (brief Luigi).
    return { foto: 50, reel: 20, carosello: 30 };
  },

  // ==========================================================
  // STEP — ANTEPRIMA: visualizzazione "social mirroring" del PED
  // Layout pulito: grid 3 colonne tipo IG profile, con possibilità
  // di switch a "feed" verticale single-column tipo bacheca IG.
  // Genera il PED se non ancora fatto. Bottoni: Modifica (→ Review tecnica),
  // Rigenera tutto, Vai all'invio.
  // ==========================================================
  async _renderPreviewStep() {
    const body = document.getElementById('pedActiveBody');
    if (!body) return;
    const s = this._state;
    body.innerHTML = `<div class="ped-loading">📐 Genero il piano editoriale completo con Gemini, leggo le tue cartelle, scelgo i media e scrivo i copy…<br><br><small>Operazione che può richiedere 5-15 secondi.</small></div>`;
    if (!s._lastGenerate) {
      await this._runGeneration();
    }
    this._paintPreviewBody();
  },

  /** Renderizza l'anteprima feed-style: grid o stack con post tipo IG. */
  _paintPreviewBody() {
    const body = document.getElementById('pedActiveBody');
    if (!body) return;
    const s = this._state;
    const gen = s._lastGenerate || {};
    const posts = gen.posts || [];
    const dist = gen.distribution || { foto: 0, reel: 0, carosello: 0 };
    const cadenza = gen.cadenza || {};
    const poolStats = gen.poolStats || {};
    const scanReport = gen.scanReport || [];
    const monthLabel = new Date(s.year, s.month - 1, 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
    const aiOn = !!gen.aiAvailable;
    const viewMode = s._previewViewMode || 'grid'; // 'grid' | 'feed' | 'phone'

    // Banner diagnostico se ci sono problemi di scan o AI
    let warnings = '';
    if (!aiOn) {
      warnings += `<div class="ped-warn">⚠ ${gen.aiReason || 'AI non disponibile'}. I copy non sono stati generati. Configura Gemini in Integrazioni → Google AI.</div>`;
    }
    if (scanReport.length) {
      const totalFound = scanReport.reduce((s, r) => s + (r.found || 0), 0);
      const hasErrors = scanReport.some(r => r.error);
      const showWarning = totalFound === 0 || hasErrors;
      if (showWarning) {
        warnings += `<div class="ped-warn">
          ${totalFound === 0 ? '⚠ <b>0 media trovati</b>' : `ℹ️ ${totalFound} media trovati, ma alcune fonti hanno problemi`} nelle ${scanReport.length} cartelle selezionate. Dettaglio:
          <ul style="margin:6px 0 0 18px">
            ${scanReport.map(r => {
              const folder = String(r.folderName || '').replace(/[<>]/g, '');
              let detail = `<b>${folder}</b> (${r.provider}): ${r.found} asset (${r.foto || 0} foto, ${r.reel || 0} reel)`;
              if (r.recursedAuto) detail += ` <i>· auto-discesa in ${r.subfoldersScanned}/${r.subfoldersFound} sotto-cartelle</i>`;
              else if (r.subfoldersFound) detail += ` <i>· ${r.subfoldersFound} sotto-cartelle non scese (file diretti trovati)</i>`;
              if (r.error) detail += ` <span style="color:#dc2626">· ERRORE: ${String(r.error).replace(/[<>]/g, '')}</span>`;
              return `<li>${detail}</li>`;
            }).join('')}
          </ul>
          ${totalFound === 0 ? '<small>Suggerimento: naviga DENTRO le cartelle del picker (click sul nome) per scegliere quelle che contengono davvero le foto. Il sistema auto-scende 1 livello se la cartella scelta ha solo sub-cartelle.</small>' : ''}
        </div>`;
      }
    }
    if (gen.aiErrors && gen.aiErrors.length) {
      warnings += `<div class="ped-warn">⚠ Gemini ha avuto ${gen.aiErrors.length} errori sui copy. Vai in Revisione per rigenerare i singoli post falliti.</div>`;
    }

    // Header con stats
    const cliBrand = s.clientName || '';
    const headerHtml = `
      <header class="ped-preview-head">
        <div class="ped-preview-head__title">
          <div class="ped-preview-head__brand">${cliBrand.replace(/[<>]/g, '')}</div>
          <div class="ped-preview-head__month">${monthLabel}</div>
        </div>
        <div class="ped-preview-head__stats">
          <span><b>${dist.foto}</b> post foto</span>
          <span>·</span>
          <span><b>${dist.reel}</b> reel</span>
          <span>·</span>
          <span><b>${dist.carosello}</b> caroselli</span>
          <span class="ped-preview-head__sep">|</span>
          <span class="ped-preview-head__cadenza">cadenza: ${cadenza.foto || 0}/${cadenza.reel || 0}/${cadenza.carosello || 0}</span>
        </div>
        <div class="ped-preview-head__toggle">
          <button class="ped-preview-toggle ${viewMode === 'grid' ? 'is-active' : ''}" type="button" data-view="grid" title="Vista griglia (tipo profilo IG)">⊞ Griglia</button>
          <button class="ped-preview-toggle ${viewMode === 'feed' ? 'is-active' : ''}" type="button" data-view="feed" title="Vista feed (tipo bacheca IG)">▭ Feed</button>
          <button class="ped-preview-toggle ${viewMode === 'phone' ? 'is-active' : ''}" type="button" data-view="phone" title="Vista smartphone (simulazione feed IG dentro un mockup)">📱 Visual</button>
        </div>
      </header>`;

    // Render dei post in modalità griglia o feed
    let postsHtml = '';
    if (!posts.length) {
      postsHtml = `<div class="ped-preview-empty">Nessun post generato. ${poolStats.total === 0 ? 'Le fonti scelte non contengono foto/video. Torna allo step Fonti e scegli cartelle con media.' : 'Verifica la cadenza del cliente in Situazione clienti.'}</div>`;
    } else if (viewMode === 'grid') {
      postsHtml = `<div class="ped-preview-grid">${posts.map((p, i) => this._previewTileHtml(p, i)).join('')}</div>`;
    } else if (viewMode === 'phone') {
      postsHtml = this._renderPhonePreview(posts, s);
    } else {
      postsHtml = `<div class="ped-preview-feed">${posts.map((p, i) => this._previewFeedHtml(p, i)).join('')}</div>`;
    }

    // Debug panel: mostra raw scanReport + sample dei post generati.
    // Collapsible, per capire al volo perché tile sono vuoti o cosa Gemini ritorna.
    const debugHtml = `
      <details class="ped-debug-panel">
        <summary>🔬 Debug — cosa il server ha generato (clicca per espandere)</summary>
        <div class="ped-debug-panel__body">
          <h4>Scan report fonti</h4>
          ${scanReport.length ? `<pre>${JSON.stringify(scanReport, null, 2)}</pre>` : '<i>Nessun report scan (usate fonti pre-passate o cache).</i>'}
          <h4>Pool stats</h4>
          <pre>${JSON.stringify(poolStats, null, 2)}</pre>
          <h4>Posts generati (primi 4, completi)</h4>
          <pre>${JSON.stringify(posts.slice(0, 4), null, 2)}</pre>
          ${gen.aiErrors && gen.aiErrors.length ? `<h4>Errori AI</h4><pre>${JSON.stringify(gen.aiErrors, null, 2)}</pre>` : ''}
          <h4>Sources passate al server</h4>
          <pre>${JSON.stringify(s.sources, null, 2)}</pre>
          <h4>Cadenza calcolata</h4>
          <pre>${JSON.stringify(cadenza, null, 2)}</pre>
        </div>
      </details>`;

    body.innerHTML = `
      ${warnings}
      ${headerHtml}
      ${postsHtml}
      <div class="ped-actions" style="margin-top:24px">
        <button class="btn btn--secondary" type="button" id="pedPreviewBack">↩ Modifica fonti</button>
        <button class="btn btn--secondary" type="button" id="pedPreviewRegen">↻ Rigenera tutto</button>
        <button class="btn btn--secondary" type="button" id="pedPreviewToReview">✎ Revisione tecnica (modifica i copy)</button>
        <button class="btn btn--primary" type="button" id="pedPreviewGo">Conferma e procedi</button>
      </div>
      ${debugHtml}
    `;

    // Bind toggle vista
    body.querySelectorAll('.ped-preview-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        s._previewViewMode = btn.dataset.view;
        this._paintPreviewBody();
      });
    });
    // Bind click su singolo post → apre la vista dettaglio (modal con info copy)
    body.querySelectorAll('[data-post-preview-index]').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.postPreviewIndex, 10);
        this._openPostPreviewModal(idx);
      });
    });
    // Bind footer actions
    document.getElementById('pedPreviewBack').addEventListener('click', () => {
      const v = this._visibleSteps();
      const i = v.findIndex(st => st.id === 'sources');
      s.stepIndex = i;
      this._renderSteps(); this._renderStream();
    });
    document.getElementById('pedPreviewRegen').addEventListener('click', async () => {
      s._lastGenerate = null;
      await this._renderPreviewStep();
    });
    document.getElementById('pedPreviewToReview').addEventListener('click', () => {
      // Vai allo step Revisione (next nel flow)
      this._advance();
    });
    document.getElementById('pedPreviewGo').addEventListener('click', () => {
      // Skip Revisione, vai direttamente a Invio
      const v = this._visibleSteps();
      const sendIdx = v.findIndex(st => st.id === 'send');
      if (sendIdx >= 0) { s.stepIndex = sendIdx; this._renderSteps(); this._renderStream(); }
    });
  },

  /** Tile in modalità GRIGLIA (3 colonne tipo IG profile). */
  _previewTileHtml(post, idx) {
    const safe = s => String(s == null ? '' : s).replace(/[<>]/g, '');
    const isFoto = post.type === 'foto';
    const isReel = post.type === 'reel';
    const isCar  = post.type === 'carosello' || post.placeholder;
    const c = post.copy || {};
    const headline = isFoto ? c.headline : (isReel ? c.hook : '');
    const typeBadge = isFoto ? '📷' : isReel ? '🎬' : '🎠';
    const typeLabel = isFoto ? 'POST FOTO' : isReel ? 'REEL' : 'CAROSELLO';
    // Pillar/reasoning dal planner Gemini
    const pillar = post.pillar || (post.slot && post.slot.pillar) || '';
    const theme = post.theme || (post.slot && post.slot.theme) || '';
    const week = post.weekIndex || (post.slot && post.slot.weekIndex) || '';

    // Header pillar (sempre visibile sopra il tile, anche se c'è thumb)
    const pillarChip = pillar ? `
      <div class="ped-preview-tile__pillar">
        <span class="ped-preview-tile__pillar-name">${safe(pillar)}</span>
        ${week ? `<span class="ped-preview-tile__week">sett. ${week}</span>` : ''}
      </div>` : '';

    if (isCar) {
      return `
        <div class="ped-preview-tile ped-preview-tile--carousel" data-post-preview-index="${idx}">
          ${pillarChip}
          <div class="ped-preview-tile__badge">${typeBadge}</div>
          <div class="ped-preview-tile__placeholder-text">
            <div class="ped-preview-tile__type">CAROSELLO</div>
            ${theme ? `<div class="ped-preview-tile__filename">${safe(theme)}</div>` : ''}
            <small>da creare in fase 2</small>
          </div>
        </div>`;
    }

    const thumb = this._resolveThumbUrl(post);
    const thumbStyle = thumb ? `background-image:url('${safe(thumb)}')` : '';
    const captionSnippet = isFoto ? (c.body || '') : (c.caption || '');
    const shortName = post.name ? safe(post.name).replace(/\.[a-z0-9]+$/i, '').slice(0, 30) : '';

    return `
      <div class="ped-preview-tile ${thumb ? '' : 'ped-preview-tile--no-thumb'}" data-post-preview-index="${idx}" style="${thumbStyle}">
        ${pillarChip}
        <div class="ped-preview-tile__badge">${typeBadge}</div>
        ${headline ? `<div class="ped-preview-tile__hook">${safe(headline).slice(0, 60)}${headline.length > 60 ? '…' : ''}</div>` : ''}
        ${!thumb ? `<div class="ped-preview-tile__placeholder-text">
          <div class="ped-preview-tile__type">${typeLabel}</div>
          ${theme ? `<div class="ped-preview-tile__theme">${safe(theme)}</div>` : ''}
          ${shortName ? `<div class="ped-preview-tile__filename">${shortName}</div>` : ''}
          ${headline ? `<div class="ped-preview-tile__copy-snippet">${safe(headline).slice(0, 80)}</div>` : ''}
          ${captionSnippet && !headline ? `<div class="ped-preview-tile__copy-snippet">${safe(captionSnippet).slice(0, 80)}…</div>` : ''}
        </div>` : ''}
      </div>`;
  },

  /** Risolve thumbnail con fallback intelligente:
   *  - Per Drive: usa il proxy server-side /ped/drive/thumb che inietta
   *    il bearer OAuth (l'URL thumbnailLink diretto richiede auth header
   *    e non funziona da <img src>).
   *  - Per Canva: usa thumbUrl diretto (è pubblico).
   *  - Per altri: thumbUrl o null.
   */
  _resolveThumbUrl(post) {
    if (post.id && post.id.startsWith('drive:')) {
      const driveFileId = post.id.slice('drive:'.length);
      const base = (window.Sync && Sync.baseUrl && Sync.baseUrl()) || '';
      const tok = (window.Sync && Sync._loadToken && Sync._loadToken()) || '';
      // Include il JWT come query param perché <img src> non manda Authorization header
      return `${base}/ped/drive/thumb?id=${encodeURIComponent(driveFileId)}&tok=${encodeURIComponent(tok)}`;
    }
    if (post.thumbUrl) return post.thumbUrl;
    return null;
  },

  /** Tile in modalità FEED (single column tipo bacheca IG). */
  _previewFeedHtml(post, idx) {
    const safe = s => String(s == null ? '' : s).replace(/[<>]/g, '');
    const isFoto = post.type === 'foto';
    const isReel = post.type === 'reel';
    const isCar  = post.type === 'carosello' || post.placeholder;
    const c = post.copy || {};

    // Header IG-style
    const cliName = this._state.clientName || '';
    const initial = cliName ? cliName[0].toUpperCase() : '?';
    const handle = cliName.replace(/[<>]/g, '').toLowerCase().replace(/\s+/g, '_');
    const headerHtml = `
      <div class="ped-feed-card__head">
        <div class="ped-feed-card__avatar">${initial}</div>
        <div class="ped-feed-card__user">
          <div class="ped-feed-card__username">${handle}</div>
          <div class="ped-feed-card__type">${isFoto ? 'Post' : isReel ? 'Reel' : 'Carosello'}</div>
        </div>
        <button class="ped-link" type="button" data-post-preview-index="${idx}">Dettagli</button>
      </div>`;

    // Image — Drive thumbnail richiede proxy con JWT, _resolveThumbUrl lo gestisce
    const resolvedThumb = !isCar ? this._resolveThumbUrl(post) : null;
    let imageHtml = '';
    if (isCar) {
      imageHtml = `<div class="ped-feed-card__image ped-feed-card__image--carousel">
        <div class="ped-feed-card__placeholder">🎠<br><small>CAROSELLO da creare</small></div>
      </div>`;
    } else if (resolvedThumb) {
      imageHtml = `<div class="ped-feed-card__image" style="background-image:url('${safe(resolvedThumb)}')"></div>`;
    } else {
      imageHtml = `<div class="ped-feed-card__image ped-feed-card__image--placeholder">${isReel ? '🎬' : '📷'}</div>`;
    }

    // Caption sotto l'immagine
    let captionHtml = '';
    if (isFoto) {
      captionHtml = `
        <div class="ped-feed-card__caption">
          <span class="ped-feed-card__bold">${safe(c.headline || '')}</span>
          ${c.body ? '<br>' + safe(c.body) : ''}
          ${c.hashtags && c.hashtags.length ? `<div class="ped-feed-card__hashtags">${c.hashtags.map(h => '#' + safe(h)).join(' ')}</div>` : ''}
        </div>`;
    } else if (isReel) {
      captionHtml = `
        <div class="ped-feed-card__caption">
          ${c.hook ? `<div class="ped-feed-card__hook">${safe(c.hook)}</div>` : ''}
          ${c.caption ? safe(c.caption) : ''}
          ${c.hashtags && c.hashtags.length ? `<div class="ped-feed-card__hashtags">${c.hashtags.map(h => '#' + safe(h)).join(' ')}</div>` : ''}
        </div>`;
    } else {
      captionHtml = `<div class="ped-feed-card__caption" style="opacity:.7"><i>Qui andrà il carosello a tema X — copy da scrivere in fase 2.</i></div>`;
    }

    return `
      <article class="ped-feed-card ${isCar ? 'is-placeholder' : ''}">
        ${headerHtml}
        ${imageHtml}
        ${captionHtml}
      </article>`;
  },

  /** Vista VISUAL: mockup smartphone con feed Instagram simulato.
   *  Ispirato al template Canva base-PED che usa Luigi: un device frame
   *  centrale con dentro il feed dei post, scrollabile come un IG vero.
   *  Mostra a sinistra le info del piano (per orientarsi), a destra il
   *  mockup vero e proprio. */
  _renderPhonePreview(posts, s) {
    const safe = v => String(v == null ? '' : v).replace(/[<>]/g, '');
    const cliName = s.clientName || '';
    const handle = cliName.replace(/[<>]/g, '').toLowerCase().replace(/\s+/g, '_');
    const initial = cliName ? cliName[0].toUpperCase() : '?';
    const totalPosts = posts.filter(p => !p.placeholder && p.type !== 'carosello').length;
    const totalReels = posts.filter(p => p.type === 'reel').length;
    const totalCar   = posts.filter(p => p.type === 'carosello' || p.placeholder).length;

    // Mini-recap a sinistra (legenda + tip)
    const sideHtml = `
      <aside class="ped-phone-side">
        <div class="ped-phone-side__title">Simulazione feed</div>
        <p class="ped-phone-side__hint">Così apparirà il feed Instagram del cliente quando il PED sarà pubblicato. Scorri il telefono come faresti su IG.</p>
        <div class="ped-phone-side__stats">
          <div><b>${totalPosts}</b> <span>post foto</span></div>
          <div><b>${totalReels}</b> <span>reel</span></div>
          <div><b>${totalCar}</b> <span>caroselli (placeholder)</span></div>
        </div>
        <div class="ped-phone-side__legend">
          <div><span class="ped-phone-side__chip ped-phone-side__chip--foto">📷</span> Post foto</div>
          <div><span class="ped-phone-side__chip ped-phone-side__chip--reel">🎬</span> Reel</div>
          <div><span class="ped-phone-side__chip ped-phone-side__chip--car">🎠</span> Carosello</div>
        </div>
        <p class="ped-phone-side__tip"><b>💡 Tip:</b> click su una card del feed per aprire i dettagli del post (copy completo + opzione rigenera).</p>
      </aside>`;

    // Header del profilo (in cima al phone)
    const profileHeader = `
      <div class="ped-phone__profile">
        <div class="ped-phone__avatar">${initial}</div>
        <div class="ped-phone__profile-info">
          <div class="ped-phone__profile-name">${safe(cliName)}</div>
          <div class="ped-phone__profile-handle">@${handle}</div>
          <div class="ped-phone__profile-stats">
            <span><b>${totalPosts + totalReels + totalCar}</b> post</span>
            <span><b>—</b> follower</span>
            <span><b>—</b> seguiti</span>
          </div>
        </div>
      </div>`;

    // Feed cards dentro il phone
    const feedCards = posts.map((p, i) => this._phoneFeedCardHtml(p, i, cliName, handle, initial)).join('');

    return `
      <div class="ped-phone-wrap">
        ${sideHtml}
        <div class="ped-phone-stage">
          <div class="ped-phone">
            <div class="ped-phone__notch"></div>
            <div class="ped-phone__screen">
              <div class="ped-phone__statusbar">
                <span>9:41</span>
                <span class="ped-phone__statusbar-right">●●●● 5G ▮▮▮</span>
              </div>
              <div class="ped-phone__topbar">
                <span class="ped-phone__topbar-title">${safe(handle)}</span>
                <span class="ped-phone__topbar-icons">＋ ☰</span>
              </div>
              <div class="ped-phone__scroll">
                ${profileHeader}
                ${feedCards}
                <div class="ped-phone__scroll-end">— Fine del feed —</div>
              </div>
              <div class="ped-phone__tabbar">
                <span>🏠</span><span>🔍</span><span>➕</span><span>♥</span><span>${initial}</span>
              </div>
            </div>
            <div class="ped-phone__home-indicator"></div>
          </div>
        </div>
      </div>
    `;
  },

  /** Singola card dentro il phone feed. Identica nella forma al post IG vero. */
  _phoneFeedCardHtml(post, idx, cliName, handle, initial) {
    const safe = v => String(v == null ? '' : v).replace(/[<>]/g, '');
    const isFoto = post.type === 'foto';
    const isReel = post.type === 'reel';
    const isCar  = post.type === 'carosello' || post.placeholder;
    const c = post.copy || {};
    const resolvedThumb = !isCar ? this._resolveThumbUrl(post) : null;
    const typeBadge = isFoto ? '' : isReel ? '<span class="ped-phone__type-badge">🎬 REEL</span>' : '<span class="ped-phone__type-badge">🎠</span>';

    let imageHtml = '';
    if (isCar) {
      imageHtml = `<div class="ped-phone__post-image ped-phone__post-image--car">
        <div class="ped-phone__post-image-text">🎠<br><small>CAROSELLO<br>da creare</small></div>
      </div>`;
    } else if (resolvedThumb) {
      imageHtml = `<div class="ped-phone__post-image" style="background-image:url('${safe(resolvedThumb)}')">${typeBadge}</div>`;
    } else {
      imageHtml = `<div class="ped-phone__post-image ped-phone__post-image--ph">${isReel ? '🎬' : '📷'}${typeBadge}</div>`;
    }

    let caption = '';
    if (isFoto) {
      caption = `<b>${safe(c.headline || '')}</b>${c.body ? '<br>' + safe(c.body) : ''}`;
    } else if (isReel) {
      caption = `${c.hook ? `<b>${safe(c.hook)}</b><br>` : ''}${safe(c.caption || '')}`;
    } else {
      caption = `<i style="opacity:.7">Qui andrà il copy del carosello a tema "${safe(post.theme || post.pillar || '—')}"</i>`;
    }
    const tags = c.hashtags && c.hashtags.length
      ? `<div class="ped-phone__post-tags">${c.hashtags.map(h => '#' + safe(h)).join(' ')}</div>`
      : '';

    return `
      <article class="ped-phone__post ${isCar ? 'is-placeholder' : ''}" data-post-preview-index="${idx}">
        <header class="ped-phone__post-head">
          <div class="ped-phone__post-avatar">${initial}</div>
          <div class="ped-phone__post-userblock">
            <div class="ped-phone__post-user">${safe(handle)}</div>
            ${post.pillar ? `<div class="ped-phone__post-pillar">${safe(post.pillar)}</div>` : ''}
          </div>
          <div class="ped-phone__post-more">⋯</div>
        </header>
        ${imageHtml}
        <div class="ped-phone__post-actions">
          <span>♥</span><span>💬</span><span>↗</span>
          <span class="ped-phone__post-bookmark">🔖</span>
        </div>
        <div class="ped-phone__post-likes"><b>—</b> «mi piace»</div>
        <div class="ped-phone__post-caption">${caption}</div>
        ${tags}
      </article>`;
  },

  /** Modal dettaglio post: click su tile/Dettagli apre questo. */
  _openPostPreviewModal(idx) {
    const s = this._state;
    const post = (s._lastGenerate && s._lastGenerate.posts && s._lastGenerate.posts[idx]) || null;
    if (!post) return;
    const safe = s => String(s == null ? '' : s).replace(/[<>]/g, '');
    const c = post.copy || {};
    const existing = document.getElementById('pedPostPreviewModal');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.id = 'pedPostPreviewModal';
    overlay.className = 'rem-modal ped-post-modal';
    const isCar = post.type === 'carosello' || post.placeholder;
    const isFoto = post.type === 'foto';
    const isReel = post.type === 'reel';
    // Estrai info pianificazione (pillar, tema, settimana, reasoning)
    const pillar = post.pillar || (post.slot && post.slot.pillar) || '';
    const theme = post.theme || (post.slot && post.slot.theme) || '';
    const week = post.weekIndex || (post.slot && post.slot.weekIndex) || '';
    const suggestedSubject = post.slot && post.slot.suggestedSubject || '';
    const slotReasoning = post.reasoning || (post.slot && post.slot.reasoning) || '';
    const mediaReasoning = c.mediaReasoning || '';
    const thumb = this._resolveThumbUrl(post);

    // Sezione "Pianificazione" sempre in alto
    const planSection = `
      <div class="ped-post-modal__plan">
        <div class="ped-post-modal__plan-row">
          <span class="ped-post-modal__plan-label">Pillar</span>
          <span class="ped-post-modal__plan-value ped-post-modal__plan-value--pillar">${safe(pillar || '—')}</span>
        </div>
        ${theme ? `<div class="ped-post-modal__plan-row">
          <span class="ped-post-modal__plan-label">Tema</span>
          <span class="ped-post-modal__plan-value">${safe(theme)}</span>
        </div>` : ''}
        ${week ? `<div class="ped-post-modal__plan-row">
          <span class="ped-post-modal__plan-label">Settimana</span>
          <span class="ped-post-modal__plan-value">${week}</span>
        </div>` : ''}
        ${suggestedSubject ? `<div class="ped-post-modal__plan-row">
          <span class="ped-post-modal__plan-label">Soggetto AI</span>
          <span class="ped-post-modal__plan-value">${safe(suggestedSubject)}</span>
        </div>` : ''}
        ${slotReasoning ? `<div class="ped-post-modal__reasoning"><b>Perché questo post:</b> ${safe(slotReasoning)}</div>` : ''}
        ${mediaReasoning ? `<div class="ped-post-modal__reasoning"><b>Perché questo media:</b> ${safe(mediaReasoning)}</div>` : ''}
      </div>`;

    overlay.innerHTML = `
      <div class="rem-modal__box ped-post-modal__box">
        <header class="ped-post-modal__head">
          <div>
            <div class="ped-post-modal__type">${isFoto ? '📷 Post foto' : isReel ? '🎬 Reel' : '🎠 Carosello placeholder'} · #${post.index || idx + 1}${pillar ? ` · <span style="color:var(--ad-accent, #235634)">${safe(pillar)}</span>` : ''}</div>
            ${post.name ? `<div class="ped-post-modal__meta">📁 ${safe(post.sourceFolder || '')} · ${safe(post.name)}</div>` : ''}
          </div>
          <button class="contract-modal__close" data-act="close" aria-label="Chiudi">×</button>
        </header>
        <div class="ped-post-modal__body">
          <div class="ped-post-modal__visual">
            ${thumb && !isCar ? `<div class="ped-post-modal__image" style="background-image:url('${safe(thumb)}')"></div>` : `<div class="ped-post-modal__image ped-post-modal__image--placeholder">${isFoto ? '📷' : isReel ? '🎬' : '🎠'}</div>`}
          </div>
          <div class="ped-post-modal__copy">
            ${planSection}
            ${isFoto ? `
              <div class="ped-post-modal__field"><span>Headline</span><div>${safe(c.headline || '')}</div></div>
              <div class="ped-post-modal__field"><span>Body</span><div>${safe(c.body || '')}</div></div>
              ${c.hashtags && c.hashtags.length ? `<div class="ped-post-modal__field"><span>Hashtags</span><div>${c.hashtags.map(h => '#' + safe(h)).join(' ')}</div></div>` : ''}
              ${c.cta ? `<div class="ped-post-modal__field"><span>CTA</span><div>${safe(c.cta)}</div></div>` : ''}
            ` : isReel ? `
              <div class="ped-post-modal__field"><span>Concept</span><div>${safe(c.concept || '')}</div></div>
              <div class="ped-post-modal__field"><span>Hook (3″)</span><div style="color:var(--ad-accent, #235634);font-weight:600">${safe(c.hook || '')}</div></div>
              <div class="ped-post-modal__field"><span>Caption</span><div>${safe(c.caption || '')}</div></div>
              ${c.hashtags && c.hashtags.length ? `<div class="ped-post-modal__field"><span>Hashtags</span><div>${c.hashtags.map(h => '#' + safe(h)).join(' ')}</div></div>` : ''}
              ${c.soundtype ? `<div class="ped-post-modal__field"><span>Sound</span><div>🎵 ${safe(c.soundtype)}</div></div>` : ''}
            ` : `
              <div class="ped-post-modal__field"><span>Note placeholder</span><div><i>${safe(post.body)}</i></div></div>
            `}
          </div>
        </div>
        <footer class="ped-post-modal__foot">
          ${!isCar ? `<button class="btn btn--secondary btn--sm" type="button" data-act="regen-modal">↻ Rigenera questo post</button>` : ''}
          <button class="btn btn--primary btn--sm" type="button" data-act="close">Chiudi</button>
        </footer>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelectorAll('[data-act="close"]').forEach(b => b.addEventListener('click', close));
    const regen = overlay.querySelector('[data-act="regen-modal"]');
    if (regen) regen.addEventListener('click', async () => { close(); await this._regenerateSinglePost(idx); });
  },

  // ==========================================================
  // STEP 6 — Revisione: GENERA il PED (se non già generato),
  // mostra preview + permette modifiche, poi va all'Invio.
  // ==========================================================
  async _renderReviewStep() {
    const body = document.getElementById('pedActiveBody');
    if (!body) return;
    const s = this._state;
    body.innerHTML = `<div class="ped-loading">Carico la revisione tecnica…</div>`;
    // Se arrivato qui dall'Anteprima il PED è già generato. Se per qualche
    // motivo non lo è (es. accesso diretto via sidebar), genera ora.
    if (!s._lastGenerate) {
      await this._runGeneration();
    }
    this._paintReviewBody();
  },

  _paintReviewBody() {
    const body = document.getElementById('pedActiveBody');
    if (!body) return;
    const s = this._state;
    const monthLabel = new Date(s.year, s.month - 1, 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
    const gen = s._lastGenerate || {};
    const posts = gen.posts || [];
    const dist = gen.distribution || { foto: 0, reel: 0, carosello: 0 };
    const cadenza = gen.cadenza || {};
    const poolStats = gen.poolStats || {};
    const aiOn = !!gen.aiAvailable;

    // Banner generale: stato AI + counter media + counter post
    const aiBanner = !aiOn
      ? `<div class="ped-warn">⚠ ${gen.aiReason || 'AI non disponibile'}. I copy non sono stati generati. Configura Gemini in Integrazioni → Google AI e clicca <b>Rigenera</b>.</div>`
      : (gen.aiErrors && gen.aiErrors.length
          ? `<div class="ped-warn">⚠ Gemini ha avuto ${gen.aiErrors.length} errori durante la generazione. Puoi rigenerare i singoli post falliti dalle card sotto.</div>`
          : `<div class="ped-success-banner">✅ Piano editoriale generato con <b>Gemini</b>. ${posts.filter(p => !p.placeholder).length} post con copy AI + ${dist.carosello} caroselli placeholder.</div>`);

    body.innerHTML = `
      <p class="ped-question">PED di <b>${s.clientName}</b> per <b>${monthLabel}</b>. Rivedi i ${posts.length} contenuti generati, modifica quello che serve, poi vai all'invio.</p>

      ${aiBanner}

      <div class="ped-summary">
        <div class="ped-summary__row"><b>Cadenza cliente:</b> ${cadenza.foto || 0} foto · ${cadenza.reel || 0} reel · ${cadenza.carosello || 0} caroselli ${cadenza.stories ? `· ${cadenza.stories} stories (flusso separato)` : ''} <small style="opacity:.6">(${cadenza.source || ''})</small></div>
        <div class="ped-summary__row"><b>Pool media scansionato:</b> ${poolStats.total || 0} totali, ${poolStats.fresh || 0} disponibili dopo anti-ripetizione (${poolStats.foto || 0} foto + ${poolStats.reel || 0} reel)</div>
        <div class="ped-summary__row"><b>Selezione finale:</b> ${dist.foto} foto + ${dist.reel} reel + ${dist.carosello} caroselli placeholder</div>
      </div>

      <div class="ped-posts-list" id="pedPostsList">
        ${posts.map((p, i) => this._postCardHtml(p, i)).join('')}
      </div>

      <label class="ped-field" style="margin-top:18px">
        <span class="ped-field__label">Note del responsabile / istruzioni aggiuntive</span>
        <textarea class="input" id="pedBrief" rows="3" placeholder="Es. cambiare il tono sul terzo post, allineare i reel al claim del mese, ecc.">${s.brief}</textarea>
      </label>

      <div class="ped-actions">
        <button class="btn btn--secondary" type="button" id="pedReviewBack">↩ Modifica fonti/cadenza</button>
        <button class="btn btn--secondary" type="button" id="pedReviewRegen">↻ Rigenera tutto</button>
        <button class="btn btn--primary" type="button" id="pedReviewGo" ${posts.length ? '' : 'disabled'}>Vai all'invio</button>
      </div>
    `;

    document.getElementById('pedBrief').addEventListener('input', e => { s.brief = e.target.value; });
    document.getElementById('pedReviewBack').addEventListener('click', () => {
      const v = this._visibleSteps();
      const fallbackIdx = v.findIndex(st => st.id === 'sources');
      s.stepIndex = fallbackIdx;
      this._renderSteps(); this._renderStream();
    });
    document.getElementById('pedReviewRegen').addEventListener('click', async () => {
      s._lastGenerate = null;
      await this._renderReviewStep();
    });
    document.getElementById('pedReviewGo').addEventListener('click', () => this._advance());

    // Bind handler per ogni post card: rigenera, modifica testo, espandi
    body.querySelectorAll('.ped-post-card').forEach(card => {
      const idx = parseInt(card.dataset.postIndex, 10);
      const post = posts[idx];
      if (!post) return;
      const regenBtn = card.querySelector('[data-act="regen-post"]');
      if (regenBtn) regenBtn.addEventListener('click', () => this._regenerateSinglePost(idx));
      const editBtn = card.querySelector('[data-act="toggle-edit"]');
      if (editBtn) editBtn.addEventListener('click', () => {
        card.classList.toggle('is-editing');
      });
      const saveBtn = card.querySelector('[data-act="save-edit"]');
      if (saveBtn) saveBtn.addEventListener('click', () => {
        // Applica le modifiche manuali al post
        const fields = ['headline','body','cta','hashtags','concept','hook','caption','soundtype'];
        for (const f of fields) {
          const inp = card.querySelector(`[data-edit-field="${f}"]`);
          if (!inp) continue;
          if (f === 'hashtags') {
            post.copy = post.copy || {};
            post.copy[f] = inp.value.split(/[,\s]+/).map(x => x.replace(/^#/, '').trim()).filter(Boolean);
          } else {
            post.copy = post.copy || {};
            post.copy[f] = inp.value;
          }
        }
        card.classList.remove('is-editing');
        this._paintReviewBody(); // ridisegna con i valori aggiornati
      });
    });
  },

  /** Render di una singola card post (foto/reel/carosello) nella revisione. */
  _postCardHtml(post, idx) {
    const safe = s => String(s == null ? '' : s).replace(/[<>]/g, '');
    const isFoto = post.type === 'foto';
    const isReel = post.type === 'reel';
    const isCar  = post.type === 'carosello' || post.placeholder;
    const c = post.copy || {};
    const typeIcon = isFoto ? '📷' : isReel ? '🎬' : '🎠';
    const typeLabel = isFoto ? 'Post foto' : isReel ? 'Reel' : 'Carosello (placeholder)';

    // Header
    const headerHtml = `
      <div class="ped-post-card__head">
        <div class="ped-post-card__type">
          <span class="ped-post-card__icon">${typeIcon}</span>
          <span class="ped-post-card__num">#${post.index || idx + 1}</span>
          <span class="ped-post-card__label">${typeLabel}</span>
        </div>
        <div class="ped-post-card__actions">
          ${!isCar ? `<button class="ped-link" type="button" data-act="regen-post" title="Rigenera questo singolo post con AI">↻ Rigenera</button>` : ''}
          <button class="ped-link" type="button" data-act="toggle-edit">✎ Modifica</button>
        </div>
      </div>`;

    // Thumb (se foto/reel con media). Usa _resolveThumbUrl così Drive passa
    // dal proxy server-side (richiede JWT in query): altrimenti l'<img> fallisce
    // perché thumbnailLink Drive non si apre senza Authorization header.
    const resolvedThumb = !isCar ? this._resolveThumbUrl(post) : null;
    const thumbHtml = !isCar && resolvedThumb
      ? `<div class="ped-post-card__thumb" style="background-image:url('${safe(resolvedThumb)}')"></div>`
      : !isCar
        ? `<div class="ped-post-card__thumb ped-post-card__thumb--placeholder">${typeIcon}</div>`
        : `<div class="ped-post-card__thumb ped-post-card__thumb--carousel">
             <div class="ped-post-card__thumb-text">CAROSELLO<br><small>da creare in fase 2</small></div>
           </div>`;

    // Copy display (view mode)
    let copyView = '';
    if (isFoto) {
      copyView = `
        <div class="ped-post-card__copy">
          <div class="ped-post-card__headline">${safe(c.headline || '(no headline)')}</div>
          <div class="ped-post-card__body">${safe(c.body || '')}</div>
          ${c.hashtags && c.hashtags.length ? `<div class="ped-post-card__hashtags">${c.hashtags.map(h => '#' + safe(h)).join(' ')}</div>` : ''}
          ${c.cta ? `<div class="ped-post-card__cta">CTA: <b>${safe(c.cta)}</b></div>` : ''}
        </div>`;
    } else if (isReel) {
      copyView = `
        <div class="ped-post-card__copy">
          <div class="ped-post-card__concept"><b>Concept:</b> ${safe(c.concept || '')}</div>
          <div class="ped-post-card__hook"><b>Hook (3″):</b> ${safe(c.hook || '')}</div>
          <div class="ped-post-card__caption">${safe(c.caption || '')}</div>
          ${c.hashtags && c.hashtags.length ? `<div class="ped-post-card__hashtags">${c.hashtags.map(h => '#' + safe(h)).join(' ')}</div>` : ''}
          ${c.soundtype ? `<div class="ped-post-card__sound">🎵 ${safe(c.soundtype)}</div>` : ''}
        </div>`;
    } else {
      copyView = `
        <div class="ped-post-card__copy ped-post-card__copy--placeholder">
          <i>«${safe(post.headline)}»</i><br>
          <i>«${safe(post.body)}»</i>
        </div>`;
    }

    // Edit form (hidden by default, attivato da .is-editing sulla card)
    let editForm = '';
    if (isFoto) {
      editForm = `
        <div class="ped-post-card__edit">
          <label><span>Headline</span><input class="input" type="text" data-edit-field="headline" value="${safe(c.headline || '')}"></label>
          <label><span>Body</span><textarea class="input" rows="3" data-edit-field="body">${safe(c.body || '')}</textarea></label>
          <label><span>Hashtags <small>(separati da spazio o virgola)</small></span><input class="input" type="text" data-edit-field="hashtags" value="${safe((c.hashtags || []).join(' '))}"></label>
          <label><span>CTA</span><input class="input" type="text" data-edit-field="cta" value="${safe(c.cta || '')}"></label>
          <div class="ped-actions"><button class="btn btn--primary btn--sm" type="button" data-act="save-edit">Salva modifiche</button></div>
        </div>`;
    } else if (isReel) {
      editForm = `
        <div class="ped-post-card__edit">
          <label><span>Concept</span><input class="input" type="text" data-edit-field="concept" value="${safe(c.concept || '')}"></label>
          <label><span>Hook</span><input class="input" type="text" data-edit-field="hook" value="${safe(c.hook || '')}"></label>
          <label><span>Caption</span><textarea class="input" rows="3" data-edit-field="caption">${safe(c.caption || '')}</textarea></label>
          <label><span>Hashtags</span><input class="input" type="text" data-edit-field="hashtags" value="${safe((c.hashtags || []).join(' '))}"></label>
          <label><span>Sound</span><input class="input" type="text" data-edit-field="soundtype" value="${safe(c.soundtype || '')}"></label>
          <div class="ped-actions"><button class="btn btn--primary btn--sm" type="button" data-act="save-edit">Salva modifiche</button></div>
        </div>`;
    }

    // Banner errore AI per card: se Gemini ha fallito su questo slot,
    // mostriamo errore reale invece di un copy che sembra valido.
    const aiErrorHtml = post.aiFailed
      ? `<div class="ped-post-card__ai-error">
           <b>⚠ Gemini non ha generato il copy per questo post</b>
           <div class="ped-post-card__ai-error__msg">${safe(post.aiError || 'errore sconosciuto')}</div>
           <small>Clicca <b>↻ Rigenera</b> per riprovare oppure <b>✎ Modifica</b> per scriverlo a mano.</small>
         </div>`
      : '';

    return `
      <div class="ped-post-card ${isCar ? 'is-placeholder' : ''} ${post.aiFailed ? 'is-ai-failed' : ''}" data-post-index="${idx}">
        ${headerHtml}
        ${aiErrorHtml}
        <div class="ped-post-card__body-wrap">
          ${thumbHtml}
          ${copyView}
        </div>
        ${editForm}
        ${!isCar && post.name ? `<div class="ped-post-card__meta">📁 ${safe(post.sourceFolder || '')} · ${safe(post.name || '')}</div>` : ''}
      </div>`;
  },

  /** Rigenera il copy di UN singolo post chiamando di nuovo l'endpoint AI. */
  async _regenerateSinglePost(idx) {
    const s = this._state;
    const gen = s._lastGenerate;
    if (!gen || !gen.posts || !gen.posts[idx]) return;
    const post = gen.posts[idx];
    if (post.placeholder) return; // niente AI sui caroselli
    const card = document.querySelector(`[data-post-index="${idx}"]`);
    if (card) card.classList.add('is-regenerating');
    try {
      // Chiamo /llm/regenerate-post passando il media + style/strategy
      const result = await Sync._api('POST', '/ped/posts/regenerate', {
        clientSyncId: s.clientSyncId,
        media: { id: post.id, name: post.name, type: post.type, sourceFolder: post.sourceFolder },
        strategy: { tone: gen.style && gen.style.toneOfVoice },
        style: gen.style,
        monthLabel: new Date(s.year, s.month - 1, 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }),
        clientName: s.clientName,
      });
      if (result && result.copy) {
        gen.posts[idx] = { ...post, copy: result.copy };
        this._paintReviewBody();
        App._toast && App._toast(`Post #${post.index || idx + 1} rigenerato`, 'success');
      }
    } catch (e) {
      App._toast && App._toast('Errore rigenerazione: ' + (e.message || e), 'error');
    } finally {
      if (card) card.classList.remove('is-regenerating');
    }
  },

  _progressLineHtml(key, info, fallbackText) {
    const status = info && info.status ? info.status : 'ok';
    const icon = status === 'ok' ? '✅' : (status === 'skipped' ? '⏭️' : '⚠️');
    const note = (info && info.note) ? info.note : fallbackText;
    return `<div class="ped-progress__step" data-key="${key}">${icon} ${note}</div>`;
  },

  // ==========================================================
  // STEP 7 — INVIO al responsabile + Trello.
  // Lo step "Revisione" (precedente) ora si occupa di GENERARE il PED
  // e mostrare la preview con possibilità di modifica. Questo step
  // chiude il flusso: solo invio + chiusura/nuovo PED.
  // ==========================================================
  async _renderSendStep() {
    const body = document.getElementById('pedActiveBody');
    if (!body) return;
    const s = this._state;
    body.innerHTML = `
      <p class="ped-question">Tutto pronto. Vuoi inviare il PED al responsabile e aggiornare la card Trello?</p>
      <div class="ped-summary">
        <div class="ped-summary__row"><b>PED:</b> ${s.briefId ? `#${s.briefId}` : 'in bozza'} per ${s.clientName}</div>
        <div class="ped-summary__row"><b>Mese:</b> ${new Date(s.year, s.month - 1, 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}</div>
        <div class="ped-summary__row"><b>Stato Canva:</b> ${s._lastGenerate && s._lastGenerate.canvaUrl ? `<a href="${s._lastGenerate.canvaUrl}" target="_blank" rel="noopener">apri design</a>` : 'design Canva da generare (integrazione da abilitare)'}</div>
      </div>
      <div class="ped-card ped-card--note">
        <div class="ped-card__head"><span class="ped-card__eyebrow">Cosa succederà al click su «Invia»</span></div>
        <ol class="ped-todo">
          <li>📧 Notifica al responsabile (mail Luigi/Lisa) con link al design Canva</li>
          <li>✅ Card Trello del cliente passa da «da fare» a «in esecuzione»</li>
          <li>💾 Stato del brief PED salvato come <i>inviato_responsabile</i> (la conferma cliente passerà al successivo «approvato»)</li>
        </ol>
      </div>
      <div class="ped-actions">
        <button class="btn btn--secondary" type="button" id="pedSendBack">Torna alla revisione</button>
        <button class="btn btn--primary" type="button" id="pedSendGo">Invia al responsabile</button>
      </div>
      <div id="pedSendResult"></div>
    `;
    document.getElementById('pedSendBack').addEventListener('click', () => {
      const reviewIdx = this._visibleSteps().findIndex(st => st.id === 'review');
      if (reviewIdx >= 0) { s.stepIndex = reviewIdx; this._renderSteps(); this._renderStream(); }
    });
    document.getElementById('pedSendGo').addEventListener('click', () => this._sendToManager());
  },

  async _sendToManager() {
    const s = this._state;
    const result = document.getElementById('pedSendResult');
    result.innerHTML = `<div class="ped-loading">Invio in corso…</div>`;
    let resp = { ok: true, _mock: true };
    try {
      if (window.Sync && Sync._api && s.briefId) {
        resp = await Sync._api('POST', '/ped/memory', {
          clientSyncId: s.clientSyncId,
          briefId: s.briefId,
          eventType: 'inviato_responsabile',
          channel: null,
          notes: 'Invio al responsabile dal Generatore PED',
        });
      }
    } catch (e) {
      resp = { ok: false, error: e && e.message ? e.message : String(e) };
    }
    if (resp && resp.ok === false) {
      result.innerHTML = `<div class="ped-warn">Errore: ${resp.error}. Riprova.</div>`;
      return;
    }
    result.innerHTML = `
      <div class="ped-card ped-card--success" style="margin-top:12px">
        <div class="ped-card__head"><span class="ped-card__eyebrow">Fatto</span><h3 class="ped-card__title">PED inviato al responsabile ${resp._mock ? '(simulato)' : ''}</h3></div>
        <div class="ped-card__body">
          <div class="ped-kv">📧 Mail interna inviata${resp._mock ? ' (mock — integrazione Gmail da abilitare)' : ''}</div>
          <div class="ped-kv">✅ Card Trello aggiornata${resp._mock ? ' (mock — integrazione Trello da abilitare)' : ''}</div>
          <div class="ped-kv">💾 Brief #${s.briefId || 'mock'} ora in stato <i>inviato_responsabile</i></div>
        </div>
        <div class="ped-actions">
          <button class="btn btn--primary" type="button" id="pedNewSession2">Nuovo PED</button>
        </div>
      </div>
    `;
    document.getElementById('pedNewSession2').addEventListener('click', () => {
      this._state = this._newSession();
      this.render();
    });
  },

  async _runGeneration() {
    const s = this._state;
    // Chiamata server (o mock locale se backend giù)
    const payload = {
      clientSyncId: s.clientSyncId,
      clientName: s.clientName,
      year: s.year, month: s.month,
      strategySource: s.strategySource,
      strategyRef: s.strategyRef,
      sources: s.sources,
      mode: s.mode,
      assets: s.selectedAssets,
      brief: s.brief,
    };
    let result;
    try {
      if (window.Sync && Sync._api) {
        result = await Sync._api('POST', '/ped/briefs/generate', payload);
      } else {
        result = await this._mockGenerate(payload);
      }
    } catch (e) {
      result = await this._mockGenerate(payload);
      result._serverErr = e && e.message ? e.message : String(e);
    }
    s._lastGenerate = result || {};
    if (result && result.briefId) s.briefId = result.briefId;
  },

  // Funzione legacy mantenuta per backward compat se serve in futuro.
  async _runGenerationLegacy() {
    const s = this._state;
    const steps = ['save', 'canva', 'foto', 'reel', 'carousel', 'memory', 'trello'];
    let payload = {
      clientSyncId: s.clientSyncId,
      clientName: s.clientName,
      year: s.year, month: s.month,
      strategySource: s.strategySource,
      strategyRef: s.strategyRef,
      mode: s.mode,
      assets: s.selectedAssets,
      brief: s.brief,
    };

    let result;
    try {
      if (window.Sync && Sync._api) {
        result = await Sync._api('POST', '/ped/briefs/generate', payload);
      } else {
        result = await this._mockGenerate(payload);
      }
    } catch (e) {
      result = { ok: false, error: e.message || String(e) };
    }

    for (const key of steps) {
      await this._tickStep(key, result && result.steps && result.steps[key]);
    }

    const box = document.getElementById('pedResultBox');
    if (!result || result.ok === false) {
      box.innerHTML = `<div class="ped-warn">Errore generazione: ${(result && result.error) || 'sconosciuto'}. Lo stato è stato salvato comunque, puoi ritentare.</div>`;
      return;
    }
    s.briefId = result.briefId || null;
    box.innerHTML = `
      <div class="ped-card ped-card--success">
        <div class="ped-card__head"><span class="ped-card__eyebrow">Fatto</span><h3 class="ped-card__title">PED ${result.mock ? '(simulato)' : ''} pronto per la revisione</h3></div>
        <div class="ped-card__body">
          <div class="ped-kv"><b>Canva:</b> ${result.canvaUrl ? `<a href="${result.canvaUrl}" target="_blank" rel="noopener">${result.canvaUrl}</a>` : 'integrazione da abilitare'}</div>
          <div class="ped-kv"><b>Trello:</b> ${result.trelloMoved ? 'card spostata su «In esecuzione»' : 'integrazione da abilitare (mock)'}</div>
          <div class="ped-kv"><b>Memoria PED:</b> ${s.selectedAssets.length} immagini salvate come "usate" per ${s.clientName} (${s.year}-${String(s.month).padStart(2,'0')})</div>
        </div>
        <div class="ped-actions">
          <button class="btn btn--secondary" id="pedNewSession">Nuovo PED</button>
          <button class="btn btn--primary" id="pedNotifyMgr">Notifica al responsabile</button>
        </div>
      </div>
    `;
    document.getElementById('pedNewSession').addEventListener('click', () => { this._state = this._newSession(); this.render(); });
    document.getElementById('pedNotifyMgr').addEventListener('click', () => {
      App._toast && App._toast('Email al responsabile preparata (placeholder)', 'success');
    });
  },

  async _tickStep(key, payloadStep) {
    return new Promise(res => {
      setTimeout(() => {
        const el = document.querySelector(`[data-key="${key}"]`);
        if (el) {
          const status = payloadStep ? payloadStep.status : 'ok';
          const icon = status === 'ok' ? '✅' : (status === 'skipped' ? '⏭️' : '⚠️');
          const note = payloadStep && payloadStep.note ? ` — <i>${payloadStep.note}</i>` : '';
          el.innerHTML = el.innerHTML.replace('⏳', icon) + note;
        }
        res();
      }, 600);
    });
  },

  _mockGenerate(payload) {
    const dist = this._mediaDistribution(payload.assets);
    return Promise.resolve({
      ok: true, mock: true,
      briefId: 'mock-' + Date.now(),
      canvaUrl: null,
      trelloMoved: false,
      steps: {
        save:     { status: 'ok',      note: 'brief salvato in DB locale' },
        canva:    { status: 'skipped', note: 'token Canva non configurato (Impostazioni → Integrazioni)' },
        foto:     { status: 'skipped', note: `${dist.foto} foto da inserire al collegamento Canva` },
        reel:     { status: 'skipped', note: `${dist.reel} reel da inserire al collegamento Canva` },
        carousel: { status: 'ok',      note: `${dist.carosello} placeholder carosello pronti per fase 2` },
        memory:   { status: 'ok',      note: `${(payload.assets || []).length} media marcati "usati"` },
        trello:   { status: 'skipped', note: 'integrazione Trello in standby' },
      },
    });
  },

  // ----------------------------------------------------------
  // Util
  // ----------------------------------------------------------
  _advance() {
    const steps = this._steps();
    if (this._state.stepIndex < steps.length - 1) this._state.stepIndex++;
    this._renderSteps();
    this._renderStream();
  },
};

window.PedGenerator = PedGenerator;
