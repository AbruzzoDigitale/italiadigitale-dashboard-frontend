/* ============================================================
   PIPELINE.JS — Modulo gestione pipeline commerciale
   Estende i preventivi (store quotes) con un campo pipelineStage
   e una timeline stageHistory. NON sostituisce quote.status (che
   resta per backward compat); la pipeline è una vista aggiuntiva.
   ============================================================ */

const Pipeline = {

  STAGES: [
    { id: 'bozza',             label: 'Bozza',             color: '#9ca3af', icon: '📝', desc: 'Include bozze locali + bozze su Fatture in Cloud non ancora inviate al cliente' },
    { id: 'inviato',           label: 'Inviato',           color: '#3b82f6', icon: '📤', desc: 'Spedito al cliente: manuale, conferma via mail o stato FiC' },
    { id: 'in_trattativa',     label: 'In trattativa',     color: '#f59e0b', icon: '💬', desc: 'Periodo tra invio e decisione: cliente può chiedere modifiche' },
    { id: 'accettato',         label: 'Accettato',         color: '#10b981', icon: '✅', desc: 'Cliente ha detto sì (conferma manuale richiesta). Reminder invio contratto a 7/14gg.' },
    { id: 'contratto_inviato', label: 'Contratto inviato', color: '#8b5cf6', icon: '📄', desc: 'Doc contrattuale spedito ad Adobe Sign per firma' },
    { id: 'firmato',           label: 'Firmato',           color: '#06b6d4', icon: '✍️', desc: 'Firma elettronica ricevuta — parte automation brief team + Trello' },
    { id: 'in_produzione',     label: 'In produzione',     color: '#0891b2', icon: '🔧', desc: 'Brief consegnato al team, lavoro in corso' },
    { id: 'completato',        label: 'Completato',        color: '#16a34a', icon: '🏁', desc: 'Tutte le fasi del lavoro evase + fatturato' },
    { id: 'perso',             label: 'Perso',             color: '#ef4444', icon: '❌', desc: 'Non procede. Reminder ogni 2 settimane per follow-up.' },
  ],

  /** Deriva lo stage corrente: usa quote.pipelineStage se presente,
      altrimenti mappa dal vecchio quote.status. */
  stageOf(quote) {
    if (!quote) return 'bozza';
    if (quote.pipelineStage) return quote.pipelineStage;
    const m = {
      bozza: 'bozza', inviato: 'inviato', accettato: 'accettato',
      rifiutato: 'perso', da_approvare: 'bozza', in_revisione: 'bozza',
    };
    return m[quote.status] || 'bozza';
  },

  stageMeta(id) { return this.STAGES.find(s => s.id === id) || this.STAGES[0]; },

  /** Stage successivo nella sequenza (escluso 'perso' che si imposta a parte). */
  nextStage(currentId) {
    const i = this.STAGES.findIndex(s => s.id === currentId);
    if (i < 0) return 'inviato';
    // skip 'perso' nella progressione naturale
    for (let j = i + 1; j < this.STAGES.length; j++) {
      if (this.STAGES[j].id !== 'perso') return this.STAGES[j].id;
    }
    return currentId;
  },

  prevStage(currentId) {
    const i = this.STAGES.findIndex(s => s.id === currentId);
    if (i <= 0) return currentId;
    return this.STAGES[i - 1].id;
  },

  async setStage(quoteId, newStage, note = '') {
    const q = await DB.get('quotes', quoteId);
    if (!q) return null;
    const prev = this.stageOf(q);
    if (prev === newStage) return q;
    q.pipelineStage = newStage;
    q.stageHistory = q.stageHistory || [];
    q.stageHistory.push({
      stage: newStage, prev,
      ts: new Date().toISOString(),
      by: State.currentUser ? State.currentUser.username : null,
      note: note || null,
    });
    // Aggiorna anche quote.status (backward compat con badge/dashboard)
    if (newStage === 'accettato' || newStage === 'firmato' || newStage === 'in_produzione' || newStage === 'completato') q.status = 'accettato';
    else if (newStage === 'perso') q.status = 'rifiutato';
    else if (newStage === 'inviato' || newStage === 'contratto_inviato') q.status = 'inviato';
    else q.status = 'bozza';
    await DB.put('quotes', q);
    return q;
  },

  // ===========================================================
  // Bozze su FiC: scarica dal backend e merge con bozze locali
  // ===========================================================
  async fetchFicDrafts() {
    if (!window.Sync || !Sync.enabled() || !Sync._loadToken()) return [];
    try {
      // Finestra di import configurabile (default: solo mese corrente per
      // non importare tutto in fase di test). Override da settings.
      const from = (await DB.getSetting('pipeline_fic_from', null)) || this._firstOfMonth();
      const to   = (await DB.getSetting('pipeline_fic_to',   null)) || this._lastOfMonth();
      const qs = new URLSearchParams({ from, to, sort: '-id' });
      const drafts = await Sync._api('GET', '/fic/quote-drafts?' + qs.toString());
      return Array.isArray(drafts) ? drafts : [];
    } catch (e) {
      console.warn('[pipeline] fetch bozze FiC fallito:', e.message);
      return [];
    }
  },

  _firstOfMonth() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; },
  _lastOfMonth()  { const d = new Date(d=new Date()); const end = new Date(d.getFullYear(), d.getMonth()+1, 0); return `${end.getFullYear()}-${String(end.getMonth()+1).padStart(2,'0')}-${String(end.getDate()).padStart(2,'0')}`; },

  /** Recupera il dettaglio completo di una bozza FiC (voci, totali, cliente). */
  async fetchFicDraftDetail(ficId) {
    if (!window.Sync || !Sync.enabled() || !Sync._loadToken()) return null;
    try {
      return await Sync._api('GET', '/fic/quote/' + encodeURIComponent(ficId));
    } catch (e) {
      console.warn('[pipeline] fetch dettaglio FiC fallito:', e.message);
      return null;
    }
  },

  /** Importa una bozza FiC come quote locale CON tutte le voci e i totali. */
  async importFicDraft(fic) {
    // Recupera prima il dettaglio completo (voci, totali, cliente)
    const detail = await this.fetchFicDraftDetail(fic.id);
    const q = State.createNewQuote();
    q.ficId = fic.id;
    q.number = (detail && detail.number) || (fic.number ? String(fic.number) : q.number);
    q.date = (detail && detail.date) || fic.date || q.date;
    q.tag = (detail && detail.subject) || fic.subject || '';
    q.notes = (detail && detail.notes) || `[Importato da Fatture in Cloud bozza #${fic.id}]`;
    q.discountPct = 0;
    q.discountEur = 0;
    q.lines = [];

    // Cliente: cerca per nome o crea al volo
    const ent = (detail && detail.entity) || { name: fic.entity };
    if (ent && ent.name) {
      const clients = await DB.all('clients');
      let local = clients.find(c => (c.name || '').toLowerCase() === ent.name.toLowerCase());
      if (!local) {
        local = {
          name: ent.name,
          vat: ent.vat_number || '',
          cf: ent.tax_code || '',
          addr: ent.address_street || '',
          zip: ent.address_postal_code || '',
          city: ent.address_city || '',
          prov: ent.address_province || '',
          email: ent.email || '',
          pec: ent.certified_email || '',
          sdi: ent.ei_code || '',
          phone: ent.phone || '',
          ficId: ent.id || null,
          fromFic: true,
        };
        const cid = await DB.put('clients', local);
        local.id = cid;
      }
      q.clientId = local.id;
      q.clientName = local.name;
    }

    // Voci complete con prezzi
    if (detail && Array.isArray(detail.items_list)) {
      q.lines = detail.items_list.map(it => ({
        productId: null,
        ficProductId: it.product_id || null,
        name: it.name || '',
        category: (it.category && it.category.name) || '',
        net: parseFloat(it.net_price) || 0,
        vat: it.vat && it.vat.value != null ? (parseFloat(it.vat.value) / 100) : 0.22,
        udm: it.measure || '',
        quantity: parseFloat(it.qty) || 1,
        discountPct: parseFloat(it.discount) || 0,
      }));
    }

    q.pipelineStage = 'bozza';
    q.status = 'bozza';
    State.currentQuote = q;
    const id = await State.saveQuote();
    return id;
  },

  /** Modale 'Dettagli' per ghost card FiC (anteprima rapida prima di importare). */
  async openFicDraftDetail(ficId) {
    const overlay = document.createElement('div');
    overlay.className = 'rem-modal';
    overlay.innerHTML = `<div class="rem-modal__box" style="max-width:640px">
      <h3>Dettaglio bozza Fatture in Cloud #${ficId}</h3>
      <div id="ficDetailBody" style="margin:14px 0;font-size:var(--fs-sm);max-height:60vh;overflow:auto">⏳ Caricamento…</div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn--ghost" data-act="close">Chiudi</button>
        <button class="btn btn--primary" data-act="import">Importa nel preventivatore</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('[data-act="close"]').addEventListener('click', () => overlay.remove());

    const detail = await this.fetchFicDraftDetail(ficId);
    const body = overlay.querySelector('#ficDetailBody');
    if (!detail) { body.innerHTML = '<i>Impossibile caricare i dettagli.</i>'; return; }

    const fmt = n => '€ ' + (Number(n) || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const ent = detail.entity || {};
    const items = (detail.items_list || []).map(it => `
      <tr>
        <td style="padding:6px;border-bottom:1px solid var(--ad-line)">${(it.name || '').replace(/[<>]/g,'')}</td>
        <td style="padding:6px;text-align:center;border-bottom:1px solid var(--ad-line)">${it.qty || 1}${it.measure ? ' ' + it.measure : ''}</td>
        <td style="padding:6px;text-align:right;border-bottom:1px solid var(--ad-line)">${fmt(it.net_price)}</td>
        <td style="padding:6px;text-align:right;border-bottom:1px solid var(--ad-line)">${it.discount ? it.discount + '%' : '—'}</td>
      </tr>
    `).join('');

    body.innerHTML = `
      <div style="background:rgba(0,0,0,.04);padding:10px;border-radius:8px;margin-bottom:10px">
        <b>${(ent.name || '—').replace(/[<>]/g,'')}</b> · ${ent.address_city || ''} ${ent.address_province ? '(' + ent.address_province + ')' : ''}<br>
        ${ent.vat_number ? 'P.IVA ' + ent.vat_number : ''} ${ent.tax_code ? '· CF ' + ent.tax_code : ''}<br>
        ${ent.email ? '✉️ ' + ent.email : ''} ${ent.phone ? '· ☎ ' + ent.phone : ''}
      </div>
      <div style="margin-bottom:10px"><b>Preventivo #${detail.number || '—'}</b> · ${detail.date || ''} · <i>${(detail.subject || '').replace(/[<>]/g,'')}</i></div>
      <table style="width:100%;font-size:12px;border-collapse:collapse">
        <thead><tr style="background:rgba(0,0,0,.06)">
          <th style="padding:6px;text-align:left">Voce</th>
          <th style="padding:6px;text-align:center">Qty</th>
          <th style="padding:6px;text-align:right">Prezzo</th>
          <th style="padding:6px;text-align:right">Sconto</th>
        </tr></thead>
        <tbody>${items}</tbody>
        <tfoot>
          <tr><td colspan="3" style="padding:8px 6px;text-align:right;font-weight:600">Totale netto</td><td style="padding:8px 6px;text-align:right;font-weight:600">${fmt(detail.amount_net)}</td></tr>
          <tr><td colspan="3" style="padding:2px 6px;text-align:right;opacity:.7">Totale lordo (IVA incl.)</td><td style="padding:2px 6px;text-align:right;opacity:.7">${fmt(detail.amount_gross)}</td></tr>
        </tfoot>
      </table>
      ${detail.notes ? '<div style="margin-top:10px;padding:10px;background:rgba(245,158,11,.1);border-radius:6px;font-size:11px">📝 ' + detail.notes.replace(/[<>]/g,'') + '</div>' : ''}
    `;
    overlay.querySelector('[data-act="import"]').addEventListener('click', async () => {
      overlay.remove();
      await this.importFicDraft({ id: ficId, number: detail.number, subject: detail.subject, date: detail.date, entity: ent.name });
      App._toast('Bozza FiC importata col dettaglio completo', 'success');
      await this.render();
    });
  },

  // ===========================================================
  // RENDER vista kanban
  // ===========================================================
  async render() {
    const board = document.getElementById('pipBoard');
    if (!board) return;
    const quotes = await DB.all('quotes');
    const clients = await DB.all('clients');
    const cByName = new Map(clients.map(c => [c.id, c]));

    // Escludo richieste pending (vivono in 'Richieste') e quelle eliminate
    const visible = quotes
      .filter(q => q.status !== 'da_approvare' && !q._deleted)
      .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));

    // Bozze FiC: solo quelle SENZA contropartita locale (per ficId)
    const ficDrafts = await this.fetchFicDrafts();
    const localFicIds = new Set(visible.filter(q => q.ficId).map(q => q.ficId));
    const ghostDrafts = ficDrafts.filter(f => !localFicIds.has(f.id));

    // Stat top
    const totals = { count: visible.length, value: 0, won: 0 };
    for (const q of visible) {
      const t = State.calcQuote(q);
      if (this.stageOf(q) !== 'perso') totals.value += t.net;
      if (['accettato', 'contratto_inviato', 'firmato', 'in_produzione', 'completato'].includes(this.stageOf(q))) totals.won += t.net;
    }

    // Stat header
    const statsEl = document.getElementById('pipStats');
    if (statsEl) {
      statsEl.innerHTML = `
        <div class="pip-stat"><div class="pip-stat__label">Totale preventivi</div><div class="pip-stat__value">${totals.count}</div></div>
        <div class="pip-stat"><div class="pip-stat__label">Valore pipeline (netto)</div><div class="pip-stat__value">${State.formatEur(totals.value)}</div></div>
        <div class="pip-stat"><div class="pip-stat__label">Vinto (da accettato in poi)</div><div class="pip-stat__value">${State.formatEur(totals.won)}</div></div>
      `;
    }

    // Raggruppa per stage
    const byStage = {};
    for (const s of this.STAGES) byStage[s.id] = [];
    for (const q of visible) byStage[this.stageOf(q)].push(q);

    // Colonna "Bozza": ordinamento manuale via draftOrder.
    // Prima i quote con draftOrder numerico (asc), poi quelli senza
    // (fallback su updatedAt desc già applicato sopra).
    byStage.bozza.sort((a, b) => {
      const ao = (typeof a.draftOrder === 'number') ? a.draftOrder : null;
      const bo = (typeof b.draftOrder === 'number') ? b.draftOrder : null;
      if (ao != null && bo != null) return ao - bo;
      if (ao != null) return -1;   // a con ordine manuale → prima
      if (bo != null) return 1;
      return 0;                     // entrambi senza ordine → mantieni updatedAt desc
    });

    board.innerHTML = this.STAGES.map(s => {
      const ghostHtml = (s.id === 'bozza')
        ? ghostDrafts.map(f => this._ghostCardHtml(f)).join('')
        : '';
      const localHtml = byStage[s.id].map(q => this._cardHtml(q, cByName.get(q.clientId))).join('');
      const totalCount = byStage[s.id].length + (s.id === 'bozza' ? ghostDrafts.length : 0);
      const descSafe = String(s.desc || '').replace(/"/g, '&quot;');
      // Box "+ Nuova bozza" SOLO sulla colonna Bozza: shortcut per
      // creare un preventivo vuoto direttamente dalla pipeline.
      const newDraftBox = s.id === 'bozza' ? `
        <button class="pip-new-draft" type="button" data-act="new-draft">
          <span class="pip-new-draft__plus">+</span>
          <span class="pip-new-draft__label">Nuova bozza</span>
          <span class="pip-new-draft__hint">Crea preventivo vuoto</span>
        </button>
      ` : '';
      return `
      <div class="pip-col" data-stage="${s.id}">
        <div class="pip-col__head" style="border-top-color:${s.color}">
          <span class="pip-col__icon" aria-hidden="true">${s.icon}</span>
          <span class="pip-col__label">${s.label}</span>
          <button class="pip-col__info" type="button" aria-label="Info ${s.label}" title="${descSafe}" data-stage-info="${s.id}">
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="8" cy="8" r="6.5"/>
              <line x1="8" y1="7" x2="8" y2="11"/>
              <circle cx="8" cy="5" r="0.7" fill="currentColor" stroke="none"/>
            </svg>
          </button>
          <span class="pip-col__count">${totalCount}</span>
        </div>
        <div class="pip-col__body">
          ${newDraftBox}${ghostHtml}${localHtml || (ghostHtml ? '' : '<div class="pip-empty">—</div>')}
        </div>
      </div>`;
    }).join('');

    this._bindCardActions();
    this._bindDragAndDrop();
    this._bindStageInfo();
    this._bindNewDraft();
  },

  /** Click su "+ Nuova bozza" nella colonna Bozza:
      crea un quote vuoto e apre l'editor preventivo. */
  _bindNewDraft() {
    const board = document.getElementById('pipBoard');
    if (!board) return;
    board.querySelectorAll('[data-act="new-draft"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        // Genera quote vuoto via State (genera number + struttura standard)
        if (typeof State.createNewQuote === 'function') {
          State.createNewQuote();
        } else {
          State.currentQuote = { lines: [], status: 'bozza', pipelineStage: 'bozza' };
        }
        // Navigation all'editor preventivo
        if (window.App && App.navigate) {
          App.navigate('preventivo');
        }
      });
    });
  },

  /** Click sull'icona "i" delle colonne → toggle popover con descrizione.
      Sostituisce il title nativo che è sgradevole + non si vede su touch. */
  _bindStageInfo() {
    const board = document.getElementById('pipBoard');
    if (!board) return;
    // chiudi qualunque popover aperto al click fuori
    document.removeEventListener('click', this._closeStageInfoOnDocClick || (()=>{}));
    this._closeStageInfoOnDocClick = (e) => {
      if (!e.target.closest('.pip-stage-popover') && !e.target.closest('.pip-col__info')) {
        document.querySelectorAll('.pip-stage-popover').forEach(p => p.remove());
      }
    };
    document.addEventListener('click', this._closeStageInfoOnDocClick);

    board.querySelectorAll('[data-stage-info]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.stageInfo;
        const meta = this.stageMeta(id);
        // Toggle: se esiste già un popover, chiudilo
        const existing = document.querySelector('.pip-stage-popover[data-for="' + id + '"]');
        document.querySelectorAll('.pip-stage-popover').forEach(p => p.remove());
        if (existing) return;
        const pop = document.createElement('div');
        pop.className = 'pip-stage-popover';
        pop.dataset.for = id;
        pop.innerHTML = `
          <div class="pip-stage-popover__head">
            <span>${meta.icon}</span> <b>${meta.label}</b>
          </div>
          <div class="pip-stage-popover__body">${String(meta.desc || '').replace(/[<>]/g, '')}</div>
        `;
        // Posizionamento: sotto al bottone i
        const r = btn.getBoundingClientRect();
        pop.style.left = Math.max(8, r.left - 8) + 'px';
        pop.style.top = (r.bottom + window.scrollY + 6) + 'px';
        document.body.appendChild(pop);
      });
    });
  },

  // ===========================================================
  // Drag & drop tra colonne (HTML5 nativo, niente librerie)
  // + riordino intra-colonna nella sola colonna 'Bozza'
  // ===========================================================
  _bindDragAndDrop() {
    const board = document.getElementById('pipBoard');
    if (!board) return;

    // Card draggable (escluse le ghost FiC: si avanzano solo dopo import)
    board.querySelectorAll('.pip-card:not(.pip-card--ghost)').forEach(card => {
      card.setAttribute('draggable', 'true');
      card.addEventListener('dragstart', (e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/quote-id', card.dataset.id);
        // marca lo stage di origine per distinguere intra-colonna vs transizione
        const sourceCol = card.closest('.pip-col');
        if (sourceCol) e.dataTransfer.setData('text/source-stage', sourceCol.dataset.stage || '');
        card.classList.add('is-dragging');
        document.body.classList.add('pip-dragging');
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('is-dragging');
        document.body.classList.remove('pip-dragging');
        board.querySelectorAll('.pip-col.is-drop-target').forEach(c => c.classList.remove('is-drop-target'));
        board.querySelectorAll('.pip-card.is-drop-before, .pip-card.is-drop-after')
          .forEach(c => c.classList.remove('is-drop-before', 'is-drop-after'));
      });
    });

    // Solo dentro la colonna 'Bozza' attivo gli indicatori di insert
    // before/after sulle singole card per il riordino manuale.
    const draftCol = board.querySelector('.pip-col[data-stage="bozza"]');
    if (draftCol) {
      draftCol.querySelectorAll('.pip-card:not(.pip-card--ghost)').forEach(card => {
        card.addEventListener('dragover', (e) => {
          if (!e.dataTransfer.types.includes('text/quote-id')) return;
          // Mostra l'indicatore SOLO se l'origine è anch'essa Bozza
          // (per gli arrivi da altre colonne basta l'evidenza della colonna).
          // dataTransfer.getData() non è leggibile durante dragover su tutti
          // i browser → ricado su: hide se non-bozza non posso saperlo qui.
          // Soluzione: indicatore comunque utile anche per gli arrivi
          // (definisce la posizione di insert quando si entra in Bozza).
          e.preventDefault();
          e.stopPropagation();
          const rect = card.getBoundingClientRect();
          const isBefore = (e.clientY - rect.top) < rect.height / 2;
          // pulisci indicatori sulle altre card della stessa colonna
          draftCol.querySelectorAll('.pip-card.is-drop-before, .pip-card.is-drop-after')
            .forEach(c => { if (c !== card) c.classList.remove('is-drop-before', 'is-drop-after'); });
          card.classList.toggle('is-drop-before', isBefore);
          card.classList.toggle('is-drop-after', !isBefore);
        });
        card.addEventListener('dragleave', () => {
          card.classList.remove('is-drop-before', 'is-drop-after');
        });
        card.addEventListener('drop', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const isBefore = card.classList.contains('is-drop-before');
          card.classList.remove('is-drop-before', 'is-drop-after');
          draftCol.classList.remove('is-drop-target');
          const quoteId = parseInt(e.dataTransfer.getData('text/quote-id'), 10);
          if (!quoteId) return;
          const targetCardId = parseInt(card.dataset.id, 10);
          if (quoteId === targetCardId) return;
          await this._reorderDrafts(quoteId, targetCardId, isBefore);
          await this.render();
        });
      });
    }

    // Colonne come drop target (transizione di stage o fallback "fine colonna")
    board.querySelectorAll('.pip-col').forEach(col => {
      col.addEventListener('dragover', (e) => {
        if (!e.dataTransfer.types.includes('text/quote-id')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        col.classList.add('is-drop-target');
      });
      col.addEventListener('dragleave', (e) => {
        // dragleave scatta anche su elementi interni: ignora se restiamo dentro la colonna
        if (col.contains(e.relatedTarget)) return;
        col.classList.remove('is-drop-target');
      });
      col.addEventListener('drop', async (e) => {
        e.preventDefault();
        col.classList.remove('is-drop-target');
        const quoteId = parseInt(e.dataTransfer.getData('text/quote-id'), 10);
        const targetStage = col.dataset.stage;
        if (!quoteId || !targetStage) return;
        const q = await DB.get('quotes', quoteId);
        if (!q) return;
        const currentStage = this.stageOf(q);
        if (currentStage === targetStage) {
          // Drop nella stessa colonna ma fuori da ogni card:
          // per Bozza significa "metti in fondo" al riordino manuale.
          if (targetStage === 'bozza') {
            await this._reorderDrafts(quoteId, null, false);
            await this.render();
          }
          return;
        }
        await this._transition(quoteId, currentStage, targetStage);
        await this.render();
      });
    });
  },

  /** Riassegna draftOrder ai quote della colonna Bozza.
      @param quoteId  id del quote trascinato
      @param targetCardId  id della card sopra/sotto cui rilasciare
                          (null = metti in fondo)
      @param before  true se va inserito PRIMA della target */
  async _reorderDrafts(quoteId, targetCardId, before) {
    const quotes = await DB.all('quotes');
    // Considera solo i quote che attualmente sono in stage 'bozza'
    const drafts = quotes.filter(q => !q._deleted && this.stageOf(q) === 'bozza' && q.status !== 'da_approvare');
    if (!drafts.length) return;

    // Ordinamento corrente (stesso criterio del render):
    drafts.sort((a, b) => {
      const ao = (typeof a.draftOrder === 'number') ? a.draftOrder : null;
      const bo = (typeof b.draftOrder === 'number') ? b.draftOrder : null;
      if (ao != null && bo != null) return ao - bo;
      if (ao != null) return -1;
      if (bo != null) return 1;
      return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
    });

    // Rimuovi il dragged dalla posizione attuale
    const dragged = drafts.find(q => q.id === quoteId);
    if (!dragged) return;
    const without = drafts.filter(q => q.id !== quoteId);

    // Calcola nuovo indice
    let insertAt = without.length; // default: in coda
    if (targetCardId != null) {
      const idx = without.findIndex(q => q.id === targetCardId);
      if (idx >= 0) insertAt = before ? idx : idx + 1;
    }

    const reordered = [...without.slice(0, insertAt), dragged, ...without.slice(insertAt)];

    // Persisti draftOrder solo dove cambia (passi di 10 per future inserzioni)
    for (let i = 0; i < reordered.length; i++) {
      const q = reordered[i];
      const want = (i + 1) * 10;
      if (q.draftOrder !== want) {
        q.draftOrder = want;
        q.updatedAt = new Date().toISOString();
        await DB.put('quotes', q);
      }
    }
  },

  /** Card per una bozza FiC NON ancora importata. */
  _ghostCardHtml(fic) {
    return `
      <div class="pip-card pip-card--ghost" data-fic-id="${fic.id}">
        <div class="pip-card__client">${(fic.entity || '— cliente —').replace(/[<>]/g, '')}</div>
        <div class="pip-card__meta">
          <span class="pip-card__badge" title="Bozza esistente su Fatture in Cloud">FiC</span>
          <span class="pip-card__num">#${fic.number || '—'}</span>
          ${fic.subject ? `<span class="pip-card__tag" title="${(fic.subject || '').replace(/"/g, '&quot;')}">· ${(fic.subject || '').slice(0, 24)}</span>` : ''}
        </div>
        <div class="pip-card__row">
          <span class="pip-card__total">${State.formatEur(fic.amount_net || 0)}</span>
        </div>
        <div class="pip-card__actions" style="display:flex;gap:6px">
          <button class="btn btn--ghost btn--sm" data-act="fic-detail" title="Vedi dettagli completi del preventivo su FiC">👁 Dettagli</button>
          <button class="btn btn--secondary btn--sm" data-act="import-fic" title="Crea un preventivo locale con voci, prezzi e cliente">Importa</button>
        </div>
      </div>
    `;
  },

  _cardHtml(q, client) {
    const t = State.calcQuote(q);
    const name = (client && client.name) || q.clientName || '— cliente non assegnato —';
    const subject = q.tag || q.subject || '';
    return `
      <div class="pip-card" data-id="${q.id}">
        <div class="pip-card__client">${name}</div>
        <div class="pip-card__meta">
          <span class="pip-card__num">#${q.number || '—'}</span>
          ${subject ? `<span class="pip-card__tag" title="${subject.replace(/"/g, '&quot;')}">· ${subject.slice(0, 24)}</span>` : ''}
        </div>
        <div class="pip-card__row">
          <span class="pip-card__total">${State.formatEur(t.net)}</span>
          ${t.monthly > 0 ? `<span class="pip-card__monthly">+ ${State.formatEur(t.monthly)}/mese</span>` : ''}
        </div>
        <div class="pip-card__actions">
          <button class="btn btn--ghost btn--sm" data-act="open"  title="Apri nell'editor">Apri</button>
          <button class="btn btn--ghost btn--sm" data-act="panel" title="Azioni rapide & dettagli">⋯</button>
          <button class="btn btn--secondary btn--sm" data-act="next" title="Passa allo stage successivo">→</button>
        </div>
      </div>
    `;
  },

  _bindCardActions() {
    document.querySelectorAll('#pipBoard .pip-card').forEach(card => {
      const isGhost = card.classList.contains('pip-card--ghost');
      const id = isGhost ? null : parseInt(card.dataset.id, 10);
      const ficId = isGhost ? parseInt(card.dataset.ficId, 10) : null;
      card.querySelectorAll('[data-act]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const act = btn.dataset.act;
          if (act === 'fic-detail' && ficId) {
            return this.openFicDraftDetail(ficId);
          }
          if (act === 'import-fic' && ficId) {
            const drafts = await this.fetchFicDrafts();
            const fic = drafts.find(d => d.id === ficId);
            if (!fic) return App._toast('Bozza FiC non più disponibile', 'error');
            await this.importFicDraft(fic);
            App._toast(`Bozza FiC #${fic.number} importata con dettaglio completo`, 'success');
            return this.render();
          }
          if (act === 'open' && id)  return App.openQuote(id);
          if (act === 'panel' && id) return this.openDetail(id);
          if (act === 'next' && id) {
            const q = await DB.get('quotes', id);
            const cur = this.stageOf(q);
            const nx = this.nextStage(cur);
            await this._transition(id, cur, nx);
            return this.render();
          }
        });
      });
    });
  },

  /** Esegue setStage + hook automatici della transizione (reminders, brief, ecc.). */
  async _transition(quoteId, from, to, note = '') {
    await this.setStage(quoteId, to, note);
    App._toast(`${this.stageMeta(from).label} → ${this.stageMeta(to).label}`, 'success');
    if (window.Reminders) {
      if (to === 'accettato') await Reminders.promptInvioContrattoSlots(quoteId);
      else if (to === 'perso') await Reminders.promptFollowUpPerso(quoteId);
    }
    if (to === 'firmato') await this._onSigned(quoteId);
  },

  /** Quando entra in 'firmato': registra data firma, chiede data inizio
      lavori, poi manda brief operativo a Mattia + suggerisce Trello. */
  async _onSigned(quoteId) {
    const q = await DB.get('quotes', quoteId);
    if (!q) return;

    // Registra timestamp firma (per la dashboard Situazione clienti)
    if (!q.signedAt) {
      q.signedAt = new Date().toISOString();
      await DB.put('quotes', q);
    }

    // Prompt data inizio prevista (slots rapidi)
    try {
      const startDate = await this._promptExpectedStart(q);
      if (startDate) {
        q.expectedStartDate = startDate;
        await DB.put('quotes', q);
      }
    } catch (e) { console.warn('expectedStart prompt:', e); }
    const clients = await DB.all('clients');
    const client = clients.find(c => c.id === q.clientId);
    const briefOps = await this._renderTemplate('template_brief_ops', q, client);
    const teamEmail = (await DB.getSetting('automation_team_email', '')) || 'mattia@abruzzodigitale.com';
    try { await navigator.clipboard.writeText(briefOps); } catch {}
    App._openMail({
      to: teamEmail,
      subject: `Brief operativo: ${this._subjectFor(q, client)}`,
      body: briefOps,
    });

    // Automazione Trello: crea card "Brief operativo {client}" sulla board
    // configurata in Personalizza → Automazioni (setting automation_team_trello).
    // Lista target: "Informazioni" (default). Body = briefOperativo del quote.
    const trelloUrl = (await DB.getSetting('automation_team_trello', '')) || '';
    if (trelloUrl && window.Sync && Sync.enabled() && Sync._loadToken() && q.syncId) {
      try {
        const result = await Sync._api('POST', '/trello/card-from-quote', {
          quoteSyncId: q.syncId,
          listName: 'Informazioni',
          boardUrl: trelloUrl,
        });
        App._toast(`📋 Card Trello creata: ${result.cardName}`, 'success');
        // Opzionale: log link nella console per click rapido
        if (result.cardUrl) console.log('[Trello]', result.cardName, '→', result.cardUrl);
      } catch (e) {
        const msg = String(e.message || e);
        App._toast(`⚠ Trello: ${msg.slice(0, 80)}`, 'error');
        console.warn('[Trello] errore creazione card:', e);
      }
    } else if (!trelloUrl) {
      App._toast('ℹ Configura URL board Trello in Personalizza → Automazioni per attivare la card automatica.', 'info');
    }
  },

  /** Modale slot 'Quando iniziano i lavori?' al passaggio in firmato. */
  _promptExpectedStart(q) {
    return new Promise((resolve) => {
      const today = new Date();
      const fmt = d => d.toISOString().slice(0, 10);
      const addDays = n => { const d = new Date(today); d.setDate(d.getDate() + n); return fmt(d); };
      const nextMonthFirst = () => { const d = new Date(today.getFullYear(), today.getMonth() + 1, 1); return fmt(d); };
      const overlay = document.createElement('div');
      overlay.className = 'rem-modal';
      overlay.innerHTML = `
        <div class="rem-modal__box">
          <h3>Data inizio lavori</h3>
          <p>Quando partono i lavori per <b>${(q.clientName || '—').replace(/[<>]/g,'')}</b>? Verrà mostrata nella scheda "Situazione clienti".</p>
          <div class="rem-modal__slots">
            <button class="btn btn--secondary" data-d="${fmt(today)}">Oggi (${fmt(today)})</button>
            <button class="btn btn--secondary" data-d="${addDays(7)}">Tra 7 giorni (${addDays(7)})</button>
            <button class="btn btn--secondary" data-d="${addDays(14)}">Tra 14 giorni (${addDays(14)})</button>
            <button class="btn btn--secondary" data-d="${nextMonthFirst()}">Inizio prossimo mese (${nextMonthFirst()})</button>
            <button class="btn btn--ghost" data-d="custom">Personalizzata…</button>
            <button class="btn btn--ghost" data-d="skip">Decido dopo</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      overlay.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-d]');
        if (!btn) { if (e.target === overlay) { overlay.remove(); resolve(null); } return; }
        let v = btn.dataset.d;
        if (v === 'skip') { overlay.remove(); return resolve(null); }
        if (v === 'custom') {
          const s = prompt('Data inizio (AAAA-MM-GG):', fmt(today));
          if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) { overlay.remove(); return resolve(null); }
          v = s;
        }
        overlay.remove();
        resolve(v);
      });
    });
  },

  /** Oggetto preventivo: "Social Media Marketing - Cliente" (basato su aree delle lines). */
  _subjectFor(quote, client) {
    const AREA = { social: 'Social Media Marketing', web: 'Sito Web & E-commerce', menu: 'Menu Digitale' };
    const counts = { social: 0, web: 0, menu: 0 };
    for (const l of (quote.lines || [])) { if (l && counts[l.area] != null) counts[l.area]++; }
    const sorted = Object.entries(counts).sort((a,b) => b[1] - a[1]);
    const dominant = sorted[0] && sorted[0][1] > 0 ? sorted[0][0] : null;
    const titolo = dominant ? AREA[dominant] : 'Servizi Marketing';
    const cliName = (client && client.name) || quote.clientName || 'Cliente';
    return `${titolo} - ${cliName}`;
  },

  // ===========================================================
  // PANNELLO DETTAGLIO (sotto la board) — azioni rapide stage
  // ===========================================================
  async openDetail(quoteId) {
    const q = await DB.get('quotes', quoteId);
    if (!q) return;
    const clients = await DB.all('clients');
    const c = clients.find(x => x.id === q.clientId);
    const stage = this.stageOf(q);
    const meta = this.stageMeta(stage);

    // Modal sovrimpressione centrato (al posto del pannello sotto il board).
    // Rimuoviamo eventuale pannello legacy + costruiamo modal nuovo ogni volta.
    const legacyPanel = document.getElementById('pipDetail');
    if (legacyPanel) legacyPanel.hidden = true;
    const existing = document.getElementById('pipDetailModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'pipDetailModal';
    modal.className = 'rem-modal pip-detail-modal pip-detail-modal--full';
    modal.innerHTML = '<div class="rem-modal__box pip-detail-modal__box pip-detail-modal__box--full"><div id="pipDetail" class="pip-detail"></div></div>';
    document.body.appendChild(modal);
    // Stili INLINE per garantire fullscreen anche se il CSS in cache del browser
    // ha ancora la regola .rem-modal__box { max-width: 460px } legacy.
    // Bypass definitivo: lo style inline ha priorità sui CSS in cache.
    const boxEl = modal.querySelector('.rem-modal__box');
    if (boxEl) {
      Object.assign(boxEl.style, {
        maxWidth: 'none',
        width: '96vw',
        height: '94vh',
        maxHeight: '94vh',
        padding: '0',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      });
    }
    const innerEl = modal.querySelector('#pipDetail');
    if (innerEl) {
      Object.assign(innerEl.style, {
        flex: '1 1 auto',
        overflow: 'auto',
        padding: '24px 32px 28px',
      });
    }
    // Chiudi su click backdrop o ESC
    const close = () => { modal.remove(); const lp = document.getElementById('pipDetail-old'); };
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    document.addEventListener('keydown', function escClose(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escClose); }
    });
    const panel = modal.querySelector('#pipDetail');
    panel.hidden = false;
    panel.innerHTML = `
      <div class="pip-detail__head" style="border-left-color:${meta.color}">
        <div>
          <div class="pip-detail__client">${(c && c.name) || q.clientName || '—'}</div>
          <div class="pip-detail__meta">
            Preventivo <b>#${q.number || '—'}</b> · ${meta.icon} <b>${meta.label}</b>
            · <span style="opacity:.7">${meta.desc}</span>
          </div>
        </div>
        <button class="btn btn--ghost btn--sm" id="pipDetailClose">Chiudi ✕</button>
      </div>

      <div class="pip-detail__cols">
        <div class="pip-detail__col">
          <h4>Avanzamento</h4>
          <div class="pip-stage-row">
            <button class="btn btn--ghost btn--sm" id="pipStageBack">← Indietro</button>
            <button class="btn btn--primary btn--sm" id="pipStageNext">Avanza →</button>
            <button class="btn btn--secondary btn--sm" id="pipStageLost" style="margin-left:auto">Marca come perso</button>
          </div>
          <h4 style="margin-top:18px">Storico fasi</h4>
          <ol class="pip-history">
            ${(q.stageHistory || []).slice().reverse().map(h => `
              <li>
                <b>${this.stageMeta(h.stage).label}</b>
                <span style="opacity:.6"> · ${new Date(h.ts).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })} · ${h.by || '—'}</span>
                ${h.note ? `<div style="opacity:.7;font-style:italic">${h.note.replace(/[<>]/g, '')}</div>` : ''}
              </li>
            `).join('') || '<li style="opacity:.6">— nessun cambio fase ancora —</li>'}
          </ol>
        </div>

        <div class="pip-detail__col">
          <h4>Azioni rapide</h4>
          <div class="pip-actions">
            <button class="btn btn--secondary btn--sm" data-act="email"   title="Apri client email con bozza messaggio">📧 Invia email cliente</button>
            <button class="btn btn--secondary btn--sm" data-act="whatsapp" title="Apri WhatsApp con messaggio pronto">💬 WhatsApp cliente</button>
            <button class="btn btn--secondary btn--sm" data-act="contract" title="Genera testo contratto dal template e copialo">📄 Genera contratto</button>
            <button class="btn btn--secondary btn--sm" data-act="sign"     title="Istruzioni firma elettronica Adobe">✍️ Firma con Adobe Sign</button>
            <button class="btn btn--secondary btn--sm" data-act="brief"    title="Genera brief operativo per il team">📋 Brief team (mail + Trello)</button>
            <button class="btn btn--secondary btn--sm" data-act="drive"    title="Apri cartella Drive cliente">📂 Cartella Drive</button>
          </div>
          <div id="pipActionStatus" style="margin-top:14px;font-size:var(--fs-sm);line-height:1.5;color:var(--ad-mute)"></div>
        </div>
      </div>

      <div class="pip-detail__brief">
        <div class="pip-detail__brief-col">
          <h4>Appunti commerciali</h4>
          <p class="pip-detail__brief-hint">Note interne tra un appuntamento e l'altro. Non vanno al cliente, servono a strutturare il brief operativo.</p>
          <textarea class="pip-detail__textarea" id="pipDetailAppunti" placeholder="Es. Decisore Marco (CFO), budget +20% se ROAS provato…">${(q.appuntiCommerciali || '').replace(/[<>]/g, '')}</textarea>
        </div>
        <div class="pip-detail__brief-col">
          <h4>Brief operativo</h4>
          <p class="pip-detail__brief-hint">Istruzioni operative per il team. Al passaggio in Firmato popola la mail di automation e la card Trello.</p>
          <textarea class="pip-detail__textarea" id="pipDetailBrief" placeholder="Es. Obiettivo follower +20% in 3 mesi, ToV elegante, lun/mer/ven, 1 reel/sett…">${(q.briefOperativo || '').replace(/[<>]/g, '')}</textarea>
        </div>
        <div class="pip-detail__brief-foot">
          <span class="pip-detail__brief-status" id="pipDetailBriefStatus"></span>
          <button class="btn btn--primary btn--sm" id="pipDetailBriefSave">Salva brief + appunti</button>
        </div>
      </div>
    `;

    // Salva inline appunti + brief direttamente nel quote (no più passaggio per
    // editor preventivo). Stesso pattern UX di Situazione clienti.
    const saveBtn = panel.querySelector('#pipDetailBriefSave');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const appunti = panel.querySelector('#pipDetailAppunti').value;
        const brief   = panel.querySelector('#pipDetailBrief').value;
        const statusEl = panel.querySelector('#pipDetailBriefStatus');
        try {
          const fresh = await DB.get('quotes', quoteId);
          if (!fresh) throw new Error('Preventivo non trovato');
          fresh.appuntiCommerciali = appunti;
          fresh.briefOperativo = brief;
          await DB.put('quotes', fresh);
          statusEl.textContent = '✓ Salvato';
          statusEl.style.color = 'var(--ad-success)';
          App._toast('Brief e appunti salvati', 'success');
          setTimeout(() => { statusEl.textContent = ''; }, 3000);
        } catch (e) {
          statusEl.textContent = 'Errore: ' + (e.message || e);
          statusEl.style.color = 'var(--ad-danger)';
        }
      });
    }

    panel.querySelector('#pipDetailClose').addEventListener('click', () => {
      // Se siamo nel modal sovrimpressione, chiudi tutto il modal
      const modal = document.getElementById('pipDetailModal');
      if (modal) modal.remove();
      else { panel.hidden = true; panel.innerHTML = ''; }
    });
    panel.querySelector('#pipStageBack').addEventListener('click', async () => {
      const p = this.prevStage(stage);
      if (p === stage) return App._toast('Sei già al primo stage', 'error');
      await this.setStage(quoteId, p);
      App._toast(`Tornato a "${this.stageMeta(p).label}"`, 'success');
      await this.render();
      this.openDetail(quoteId);
    });
    panel.querySelector('#pipStageNext').addEventListener('click', async () => {
      const n = this.nextStage(stage);
      await this.setStage(quoteId, n);
      App._toast(`Avanzato a "${this.stageMeta(n).label}"`, 'success');
      await this.render();
      this.openDetail(quoteId);
    });
    panel.querySelector('#pipStageLost').addEventListener('click', async () => {
      const note = prompt('Motivo (opzionale):') || '';
      await this.setStage(quoteId, 'perso', note);
      App._toast('Preventivo marcato come perso', 'success');
      await this.render();
      this.openDetail(quoteId);
    });

    // Azioni rapide — implementazione MVP "manuale ma rapido"
    panel.querySelectorAll('.pip-actions [data-act]').forEach(btn => {
      btn.addEventListener('click', () => this._doAction(btn.dataset.act, q, c));
    });
  },

  // ===========================================================
  // AZIONI RAPIDE — Fase 1: manuali ma pre-popolate
  // ===========================================================
  async _doAction(act, q, client) {
    const statusEl = document.getElementById('pipActionStatus');
    const setStatus = (html, kind = 'info') => {
      if (!statusEl) return;
      const c = { ok: 'var(--ad-success)', err: 'var(--ad-pink)', info: 'inherit' };
      statusEl.innerHTML = `<div style="color:${c[kind]}">${html}</div>`;
    };
    const totals = State.calcQuote(q);

    if (act === 'email') {
      if (!client || !client.email) { setStatus('⚠️ Cliente senza email. Aggiorna l\'anagrafica.', 'err'); return; }
      const body = `Ciao ${client.contact || client.name},\n\n` +
        `come anticipato, ti invio il preventivo ${q.number || ''} per la nostra collaborazione.\n` +
        `Totale netto: ${State.formatEur(totals.net)}\n` +
        (totals.monthly ? `Canone mensile: ${State.formatEur(totals.monthly)}\n` : '') +
        `\nResto a disposizione per qualsiasi chiarimento.\n\nA presto,\n` +
        `${(State.currentUser && State.currentUser.name) || 'Abruzzo Digitale'}`;
      await App._openMail({
        to: client.email,
        subject: `Preventivo ${q.number || ''} — Abruzzo Digitale`,
        body,
      });
      setStatus(`✉️ Apertura compositore mail per ${client.email}.`, 'ok');
    }

    else if (act === 'whatsapp') {
      const phone = (client && (client.phone || client.whatsapp || client.mobile) || '').replace(/[^\d+]/g, '');
      if (!phone) { setStatus('⚠️ Cliente senza numero di telefono.', 'err'); return; }
      const msg = encodeURIComponent(
        `Ciao ${client.contact || client.name}! Ti ho inviato il preventivo ${q.number || ''} via email. ` +
        `Totale: ${State.formatEur(totals.net)}${totals.monthly ? ' + ' + State.formatEur(totals.monthly) + '/mese' : ''}. ` +
        `Fammi sapere se ti torna 👍`
      );
      window.open(`https://wa.me/${phone.replace('+', '')}?text=${msg}`, '_blank');
      setStatus('💬 WhatsApp Web aperto con messaggio pronto.', 'ok');
    }

    else if (act === 'contract') {
      const txt = await Pipeline._renderTemplate('template_contract', q, client);
      await navigator.clipboard.writeText(txt).catch(() => {});
      setStatus(
        `📄 Testo contratto copiato negli appunti (${txt.length} caratteri). Incollalo nel tuo Word/Acrobat per firma.<br>` +
        `<details style="margin-top:8px"><summary style="cursor:pointer">Anteprima</summary><pre style="margin:8px 0 0;white-space:pre-wrap;background:var(--ad-cream);padding:10px;border-radius:6px;font-size:11px;max-height:240px;overflow:auto">${txt.replace(/[<>]/g, '')}</pre></details>`,
        'ok'
      );
    }

    else if (act === 'sign') {
      setStatus(
        `✍️ <b>Firma elettronica con Adobe</b><br>` +
        `1. Esporta il preventivo come PDF (bottone "Esporta PDF" nell'editor).<br>` +
        `2. Apri <a href="https://acrobat.adobe.com/link/sign/" target="_blank" rel="noopener" style="color:var(--ad-success);text-decoration:underline">Adobe Acrobat Sign</a> e carica il PDF.<br>` +
        `3. Aggiungi l'email del cliente come firmatario e invia.<br>` +
        `4. Quando torna firmato, marca lo stage come <b>"Firmato"</b> qui sotto.<br><br>` +
        `<span style="opacity:.7">⚙️ Integrazione automatica via Adobe Sign API: richiede piano <i>Acrobat Sign Solutions</i> (il piano Standard DC potrebbe non includerla — verifica). La attiveremo in Fase 2.</span>`,
        'info'
      );
    }

    else if (act === 'brief') {
      const briefTxt = await Pipeline._renderTemplate('template_brief', q, client);
      await navigator.clipboard.writeText(briefTxt).catch(() => {});
      const teamEmail = (await DB.getSetting('automation_team_email', '')) || '';
      const trelloUrl = (await DB.getSetting('automation_team_trello', '')) || '';
      await App._openMail({
        to: teamEmail,
        subject: `Brief operativo: ${(client && client.name) || q.clientName || ''} — ${q.number || ''}`,
        body: briefTxt,
      });
      let html = `📋 Brief copiato negli appunti e aperto in email${teamEmail ? ` (a ${teamEmail})` : ' (destinatario da compilare)'}.`;
      if (trelloUrl) html += `<br>→ <a href="${trelloUrl}" target="_blank" rel="noopener" style="color:var(--ad-success);text-decoration:underline">Apri board Trello</a> e incolla il brief in una card nuova.`;
      else html += `<br><span style="opacity:.7">Configura URL board Trello in Personalizza → Automazioni per il link rapido.</span>`;
      setStatus(html, 'ok');
    }

    else if (act === 'drive') {
      const url = q.driveFolderUrl;
      if (url) {
        window.open(url, '_blank');
        setStatus(`📂 Aperta cartella Drive del cliente.`, 'ok');
      } else {
        const nu = prompt('URL cartella Google Drive di questo cliente:');
        if (nu) {
          q.driveFolderUrl = nu.trim();
          await DB.put('quotes', q);
          setStatus(`📂 URL Drive salvato. Ricarica per aprire.`, 'ok');
        }
      }
    }
  },

  // ===========================================================
  // TEMPLATE — sostituzione campi {{...}} su contratto/brief
  // ===========================================================
  DEFAULT_CONTRACT: [
    'CONTRATTO DI FORNITURA SERVIZI',
    '',
    'Tra:',
    'Italia Digitale SRL — P.IVA 02196170670 — C.so G. Garibaldi 62, Giulianova (TE)',
    '(di seguito "Abruzzo Digitale")',
    '',
    'e',
    '{{client.name}}',
    'P.IVA: {{client.vat}}',
    'Indirizzo: {{client.addr}}, {{client.zip}} {{client.city}} ({{client.prov}})',
    'Email: {{client.email}}',
    '(di seguito "Cliente")',
    '',
    'OGGETTO',
    'Fornitura dei seguenti servizi come da preventivo {{quote.number}} del {{quote.date}}:',
    '{{quote.linesList}}',
    '',
    'CORRISPETTIVO',
    'Importo netto totale: {{quote.totalNet}}',
    '{{quote.monthlyLine}}',
    'IVA esclusa, ove dovuta secondo legge.',
    '',
    'DURATA',
    'Il presente contratto ha validità a partire dalla firma digitale.',
    '',
    'Luigi Di Giovanni — Abruzzo Digitale            {{client.name}}',
    '_________________                              _________________',
  ].join('\n'),

  /** Brief OPERATIVO (NO dati economici) — per Mattia / team produzione.
      Auto-inviato al passaggio in stage 'firmato'. */
  DEFAULT_BRIEF_OPS: [
    'BRIEF OPERATIVO — {{quote.subject}}',
    'Riferimento: Preventivo #{{quote.number}} del {{quote.date}}',
    'Owner: {{quote.owner}}',
    '',
    '═════════════════════════════════════════════',
    'LAVORAZIONE',
    '═════════════════════════════════════════════',
    '{{quote.linesListOps}}',
    '',
    '═════════════════════════════════════════════',
    'CONTATTO CLIENTE',
    '═════════════════════════════════════════════',
    'Nome:      {{client.name}}',
    'Referente: {{client.contact}}',
    'Email:     {{client.email}}',
    'Telefono:  {{client.phone}}',
    '',
    'BRIEF OPERATIVO (dal commerciale):',
    '{{quote.briefOperativo}}',
    '',
    'APPUNTI COMMERCIALI:',
    '{{quote.appuntiCommerciali}}',
    '',
    'NOTE PREVENTIVO:',
    '{{quote.notes}}',
  ].join('\n'),

  DEFAULT_BRIEF: [
    'BRIEF OPERATIVO — {{client.name}}',
    'Preventivo: #{{quote.number}} del {{quote.date}}',
    'Owner: {{quote.owner}}',
    '',
    '═════════════════════════════════════════════',
    'VOCI VENDUTE',
    '═════════════════════════════════════════════',
    '{{quote.linesList}}',
    '',
    'TOTALE NETTO: {{quote.totalNet}}',
    '{{quote.monthlyLine}}',
    '',
    '═════════════════════════════════════════════',
    'CONTATTO CLIENTE',
    '═════════════════════════════════════════════',
    'Nome:      {{client.name}}',
    'Referente: {{client.contact}}',
    'Email:     {{client.email}}',
    'Telefono:  {{client.phone}}',
    '',
    '═════════════════════════════════════════════',
    'NOTE',
    '═════════════════════════════════════════════',
    '{{quote.notes}}',
  ].join('\n'),

  async _renderTemplate(key, quote, client) {
    let tpl = await DB.getSetting(key, null);
    if (!tpl || typeof tpl !== 'string' || !tpl.trim()) {
      if (key === 'template_contract')      tpl = Pipeline.DEFAULT_CONTRACT;
      else if (key === 'template_brief_ops') tpl = Pipeline.DEFAULT_BRIEF_OPS;
      else                                   tpl = Pipeline.DEFAULT_BRIEF;
    }
    const totals = State.calcQuote(quote);

    // Lista voci CON dati economici (template_contract / template_brief storico)
    const linesList = (quote.lines || [])
      .map(l => `  • ${l.name}${l.category ? ' (' + l.category + ')' : ''} — ${l.quantity || 1}× ${State.formatEur(l.net || 0)}${l.discountPct ? ` (sconto ${l.discountPct}%)` : ''}`)
      .join('\n');

    // Lista voci OPERATIVA (NO economici) — usata dal brief team Mattia.
    // Mostra nome + categoria + quantità + descrizione operativa.
    const linesListOps = await Pipeline._buildOpsLines(quote);

    const monthlyLine = totals.monthly > 0 ? `Canone mensile: ${State.formatEur(totals.monthly)}/mese` : '';
    const subject = Pipeline._subjectFor(quote, client);

    const vars = {
      'client.name':    (client && client.name) || quote.clientName || '',
      'client.contact': (client && client.contact) || '',
      'client.vat':     (client && client.vat) || '',
      'client.addr':    (client && client.addr) || '',
      'client.city':    (client && client.city) || '',
      'client.zip':     (client && client.zip) || '',
      'client.prov':    (client && client.prov) || '',
      'client.email':   (client && client.email) || '',
      'client.phone':   (client && client.phone) || '',
      'quote.number':   quote.number || '',
      'quote.date':     quote.date || '',
      'quote.subject':  subject,
      'quote.notes':    (quote.notes || '').replace(/^\[Op\]\s*/, ''),
      'quote.briefOperativo':     quote.briefOperativo || '(non compilato)',
      'quote.appuntiCommerciali': quote.appuntiCommerciali || '(nessun appunto)',
      'quote.totalNet': State.formatEur(totals.net),
      'quote.linesList':    linesList,
      'quote.linesListOps': linesListOps,
      'quote.monthlyLine':  monthlyLine,
      'quote.owner':    (State.currentUser && State.currentUser.name) || 'Abruzzo Digitale',
    };
    return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ''));
  },

  /** Costruisce le righe operative (NO prezzi) per il brief team.
      Cerca la descrizione operativa pescando dal box configuratore
      originale (es. "4-6 post · Facebook + Instagram"). */
  async _buildOpsLines(quote) {
    // Indice box configuratore per descrizione operativa
    const boxDesc = new Map();
    if (window.ConfiguratorData) {
      for (const area of ConfiguratorData.areas) {
        for (const sec of area.sections) {
          for (const box of (sec.boxes || [])) {
            if (box.desc) boxDesc.set(box.label, box.desc);
            if (box.includes) for (const inc of box.includes) if (inc.label && inc.desc) boxDesc.set(inc.label, inc.desc);
          }
        }
      }
    }
    return (quote.lines || []).map(l => {
      const qty = l.quantity || 1;
      const udm = l.udm || '';
      const cat = l.category ? ` [${l.category}]` : '';
      const desc = boxDesc.get(l.name) || '';
      const qtyTxt = (qty > 1 ? `${qty}× ` : '') + (udm ? udm : '');
      let row = `  • ${l.name}${cat}` + (qtyTxt.trim() ? `  ·  ${qtyTxt.trim()}` : '');
      if (desc) row += `\n      ${desc}`;
      return row;
    }).join('\n');
  },
};

window.Pipeline = Pipeline;
