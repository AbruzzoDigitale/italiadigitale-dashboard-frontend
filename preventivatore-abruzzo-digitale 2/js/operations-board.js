/* ============================================================
   OPERATIONS-BOARD.JS — Board lavorazioni (Kanban)
   Sezione: Situazione operativa kanban (spec tecnica Parte 3).
   Riflesso sintetico delle task del modulo workload, viste per
   STATO. Indicatore peso ⏱ colorato per soglia, capacità sprint.
   Drag&drop tra colonne per cambiare stato (con stessa conferma
   workload_dnd_skip_confirm).
   ============================================================ */

const OperationsBoard = {

  COLUMNS: [
    { id: 'todo',        label: 'Da fare',       color: '#888780' },
    { id: 'in_progress', label: 'In corso',      color: '#378ADD' },
    { id: 'blocked',     label: 'Approvazione',  color: '#EF9F27' }, // riusiamo "blocked" come "in attesa di approvazione"
    { id: 'done',        label: 'Fatto',         color: '#639922' },
  ],

  /* Soglie badge peso (ore stimate sulla singola task) */
  WEIGHT_THRESHOLDS: {
    soft:  4,   // ≤4h → grigio (standard)
    mid:   8,   // 5-8h → ambra
    // >8h → rosso (anti-pattern: spezzare)
  },

  // Stato interno
  _items: [],
  _clients: [],
  _operators: [],
  _filterClientId: 'all',
  _filterAssignee: 'all',
  _viewMode: 'global',       // 'global' (board unica) | 'by-client' (N board per cliente)
  _search: '',
  _searchDebounce: null,

  // ===========================================================
  // ENTRY POINT
  // ===========================================================
  async render() {
    const root = document.getElementById('operationsBoardRoot');
    if (!root) return;

    await this._loadData();

    const bodyHtml = this._viewMode === 'by-client'
      ? this._boardsByClientHtml()
      : this._boardHtml();
    root.innerHTML = `
      ${this._headerHtml()}
      ${bodyHtml}
      ${this._footerHtml()}
    `;
    this._bindToolbar();
    this._bindCards();
  },

  // ===========================================================
  // DATA
  // ===========================================================
  async _loadData() {
    const allItems = await DB.all('workitems');
    this._items = allItems.filter(w => !w._deleted && w.status !== 'cancelled');
    this._clients = await DB.all('clients');
    // Operatori dedup
    const usersRaw = await DB.all('users');
    const map = new Map();
    for (const u of usersRaw) {
      if (!u || !u.username) continue;
      const ex = map.get(u.username);
      if (!ex || (u.updatedAt || '') > (ex.updatedAt || '')) map.set(u.username, u);
    }
    this._operators = [...map.values()].filter(u => Array.isArray(u.teams) && u.teams.length > 0);
  },

  /** Item filtrati per cliente/assegnatario/search */
  _filteredItems() {
    let arr = this._items;
    if (this._filterClientId !== 'all') {
      const cid = this._filterClientId === 'none' ? null : Number(this._filterClientId);
      arr = arr.filter(w => (w.clientId || null) === cid);
    }
    if (this._filterAssignee !== 'all') {
      if (this._filterAssignee === 'none') arr = arr.filter(w => !w.assignedTo);
      else                                  arr = arr.filter(w => w.assignedTo === this._filterAssignee);
    }
    if (this._search && this._search.trim()) {
      const q = this._search.trim().toLowerCase();
      arr = arr.filter(w => {
        const hay = [w.title || '', w.clientName || '', w.description || '', w.area || ''].join(' ').toLowerCase();
        const op = w.assignedTo ? this._operators.find(o => o.username === w.assignedTo) : null;
        const opName = op ? (op.name || op.username || '').toLowerCase() : '';
        return hay.includes(q) || opName.includes(q) || (w.assignedTo || '').toLowerCase().includes(q);
      });
    }
    return arr;
  },

  // ===========================================================
  // HTML
  // ===========================================================
  _headerHtml() {
    const clientOpts = [
      `<option value="all" ${this._filterClientId === 'all' ? 'selected' : ''}>Tutti i progetti</option>`,
      `<option value="none" ${this._filterClientId === 'none' ? 'selected' : ''}>— senza cliente —</option>`,
      ...this._clients
        .slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''))
        .map(c => `<option value="${c.id}" ${String(c.id) === String(this._filterClientId) ? 'selected' : ''}>${(c.name || '').replace(/[<>]/g, '')}</option>`)
    ].join('');
    const assigneeOpts = [
      `<option value="all" ${this._filterAssignee === 'all' ? 'selected' : ''}>Tutti gli assegnatari</option>`,
      `<option value="none" ${this._filterAssignee === 'none' ? 'selected' : ''}>— Non assegnato —</option>`,
      ...this._operators
        .map(o => `<option value="${o.username}" ${this._filterAssignee === o.username ? 'selected' : ''}>${(o.name || o.username).replace(/[<>]/g, '')}</option>`)
    ].join('');
    const visible = this._filteredItems();
    const filterLabel = this._viewMode === 'by-client'
      ? 'Per cliente'
      : (this._filterClientId === 'all'
          ? 'Tutti i progetti'
          : (this._filterClientId === 'none'
              ? 'Senza cliente'
              : (this._clients.find(c => String(c.id) === String(this._filterClientId))?.name || '')));
    return `
      <div class="ob-header">
        <div class="ob-header__left">
          <h2 class="ob-header__title">Board lavorazioni — ${filterLabel.replace(/[<>]/g, '')}</h2>
          <p class="ob-header__sub">${visible.length} task · stato sincronizzato con il modulo Lavorazioni</p>
        </div>
        <div class="ob-header__right">
          <div class="wl-search" role="search">
            <svg class="wl-search__icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="search" id="obSearchInput" class="wl-search__input" placeholder="Cerca task, cliente, operatore…" value="${(this._search || '').replace(/"/g, '&quot;')}" autocomplete="off">
            ${this._search ? '<button class="wl-search__clear" data-act="ob-search-clear" title="Pulisci">×</button>' : ''}
          </div>
          <select class="input ob-filter" id="obFilterClient" ${this._viewMode === 'by-client' ? 'disabled title="Disabilitato nella vista Per cliente"' : ''}>${clientOpts}</select>
          <select class="input ob-filter" id="obFilterAssignee">${assigneeOpts}</select>
          <div class="ob-view-toggle" role="group" aria-label="Modalità di visualizzazione">
            <button class="ob-view-btn ${this._viewMode === 'global' ? 'is-active' : ''}" data-act="ob-view-global" title="Una board sola con tutte le lavorazioni filtrate">🗂 Globale</button>
            <button class="ob-view-btn ${this._viewMode === 'by-client' ? 'is-active' : ''}" data-act="ob-view-by-client" title="Una board per cliente (mirroring dei dati)">👤 Per cliente</button>
          </div>
          <button class="btn btn--primary btn--sm" data-act="ob-new">+ Nuovo task</button>
        </div>
      </div>
    `;
  },

  _boardHtml() {
    const items = this._filteredItems();
    return `
      <div class="ob-board">
        ${this.COLUMNS.map(col => this._columnHtml(col, items)).join('')}
      </div>
    `;
  },

  /** Vista per cliente: una board kanban per cliente.
      I dati sono "mirroring" della board globale — stessi workitems, raggruppati. */
  _boardsByClientHtml() {
    const items = this._filteredItems();
    if (items.length === 0) {
      return `<div class="ob-empty"><p style="color:var(--ad-mute)">${this._search ? 'Nessun risultato per la ricerca.' : 'Nessuna lavorazione attiva da mostrare.'}</p></div>`;
    }
    // Raggruppa per clientName (o "— Senza cliente —")
    const byClient = new Map();
    for (const w of items) {
      const key = w.clientName || '— Senza cliente —';
      if (!byClient.has(key)) byClient.set(key, []);
      byClient.get(key).push(w);
    }
    const clientBlocks = [...byClient.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([clientName, clientItems]) => {
        const totalH = clientItems.reduce((s, w) => s + (Number(w.weightHours) || 0), 0);
        const palette = (window.Workload && Workload._clientPaletteOf)
          ? Workload._clientPaletteOf(clientName)
          : { bg: '#e8e6e0', fg: '#1a1a1a' };
        return `
          <div class="ob-client-block">
            <div class="ob-client-block__head">
              <span class="ob-client-block__dot" style="background:${palette.bg}"></span>
              <span class="ob-client-block__name">${clientName.replace(/[<>]/g, '')}</span>
              <span class="ob-client-block__meta">${clientItems.length} task · ${this._fmtH(totalH)}h</span>
            </div>
            <div class="ob-board ob-board--compact">
              ${this.COLUMNS.map(col => this._columnHtml(col, clientItems)).join('')}
            </div>
          </div>
        `;
      }).join('');
    return `<div class="ob-by-client">${clientBlocks}</div>`;
  },

  _columnHtml(col, items) {
    const colItems = items.filter(w => w.status === col.id);
    return `
      <div class="ob-col" data-status="${col.id}">
        <div class="ob-col__head">
          <span class="ob-col__dot" style="background:${col.color}"></span>
          <span class="ob-col__label">${col.label}</span>
          <span class="ob-col__count">${colItems.length}</span>
        </div>
        <div class="ob-col__body">
          ${colItems.map(w => this._cardHtml(w)).join('')}
        </div>
      </div>
    `;
  },

  _cardHtml(w) {
    const hours = Number(w.weightHours) || 0;
    const weightCls = hours <= this.WEIGHT_THRESHOLDS.soft ? 'ob-weight--soft'
                    : hours <= this.WEIGHT_THRESHOLDS.mid ? 'ob-weight--mid'
                    : 'ob-weight--heavy';
    const op = w.assignedTo ? this._operators.find(o => o.username === w.assignedTo) : null;
    const palette = op ? (Workload?.ROLE_PALETTE?.[Workload._primaryRoleKey?.(op)] || { bg: '#e8e6e0', fg: '#1a1a1a' }) : { bg: '#f5f4ef', fg: '#888780' };
    const initials = op ? (op.name || op.username || '?').split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase() : '?';
    const isUrgent = w.dueDate && Workload && Workload._dueClass(w.dueDate, w.status) === 'wl-due--late' || Workload?._dueClass(w.dueDate, w.status) === 'wl-due--urgent';
    const taskId = w.taskCode || ('WL-' + String(w.id).padStart(3, '0'));
    const progress = Math.max(0, Math.min(100, Number(w.progress) || 0));
    const isDone = w.status === 'done';

    return `
      <div class="ob-card ${isUrgent ? 'ob-card--urgent' : ''} ${isDone ? 'ob-card--done' : ''}" data-id="${w.id}" draggable="true" title="${(w.title || '').replace(/"/g,'&quot;')}">
        <div class="ob-card__head">
          <span class="ob-card__id">${taskId}</span>
          ${isUrgent ? '<span class="ob-card__flag">🚩 Urgente</span>' : ''}
        </div>
        <div class="ob-card__title">${(w.title || '— senza titolo —').replace(/[<>]/g, '')}</div>
        ${w.status === 'in_progress' && progress > 0 ? `
          <div class="ob-card__progress"><div class="ob-card__progress-fill" style="width:${progress}%"></div></div>
        ` : ''}
        <div class="ob-card__foot">
          <span class="ob-weight ${weightCls}" title="Ore stimate">${isDone ? '✓' : '⏱'} ${this._fmtH(hours)}h</span>
          <div class="ob-card__avatar" style="background:${palette.bg};color:${palette.fg}" title="${op ? (op.name || op.username) : 'Non assegnato'}">${initials}</div>
        </div>
      </div>
    `;
  },

  _footerHtml() {
    const items = this._filteredItems();
    const totalEst = items.reduce((s, w) => s + (Number(w.weightHours) || 0), 0);
    // Capacità sprint = somma capacità giornaliera operatori × 5 giorni
    const totalCap = this._operators.reduce((s, op) => {
      const cap = Number(op.dailyCapacityHours) > 0 ? Number(op.dailyCapacityHours) : 8;
      return s + cap * 5;
    }, 0);
    return `
      <div class="ob-footer">
        <span class="ob-footer__hint">ⓘ Il badge ⏱ mostra le ore stimate. Trascina una card tra colonne per cambiare stato.</span>
        <span class="ob-footer__stat">Capacità sprint settimanale: <b>${this._fmtH(totalEst)}h</b> / ${totalCap}h</span>
      </div>
    `;
  },

  _fmtH(n) {
    const v = Number(n) || 0;
    return v.toFixed(1).replace(/\.0$/, '');
  },

  // ===========================================================
  // BIND
  // ===========================================================
  _bindToolbar() {
    const root = document.getElementById('operationsBoardRoot');
    if (!root) return;
    root.querySelector('#obFilterClient')?.addEventListener('change', async (e) => {
      this._filterClientId = e.target.value;
      await this.render();
    });
    root.querySelector('#obFilterAssignee')?.addEventListener('change', async (e) => {
      this._filterAssignee = e.target.value;
      await this.render();
    });
    root.querySelector('[data-act="ob-new"]')?.addEventListener('click', () => {
      if (window.Workload) Workload.openNewModal();
    });
    // Toggle vista globale / per-cliente
    root.querySelector('[data-act="ob-view-global"]')?.addEventListener('click', async () => {
      if (this._viewMode === 'global') return;
      this._viewMode = 'global';
      await this.render();
    });
    root.querySelector('[data-act="ob-view-by-client"]')?.addEventListener('click', async () => {
      if (this._viewMode === 'by-client') return;
      this._viewMode = 'by-client';
      // In modalità per-cliente, il filtro client diventa "all" (mostra tutti)
      this._filterClientId = 'all';
      await this.render();
    });
    // Search
    const searchInput = root.querySelector('#obSearchInput');
    if (searchInput) {
      try { searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length); } catch {}
      if (this._search) setTimeout(() => searchInput.focus(), 0);
      clearTimeout(this._searchDebounce);
      searchInput.addEventListener('input', (e) => {
        clearTimeout(this._searchDebounce);
        const v = e.target.value;
        this._searchDebounce = setTimeout(async () => {
          this._search = v;
          await this.render();
        }, 180);
      });
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          clearTimeout(this._searchDebounce);
          this._search = '';
          this.render();
        }
      });
    }
    root.querySelector('[data-act="ob-search-clear"]')?.addEventListener('click', async () => {
      this._search = '';
      await this.render();
    });
  },

  _bindCards() {
    const root = document.getElementById('operationsBoardRoot');
    if (!root) return;
    // Click card → modale dettaglio (riusa Workload)
    root.querySelectorAll('.ob-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = parseInt(card.dataset.id, 10);
        if (!id || !window.Workload) return;
        // Workload._operators per dropdown nel dettaglio
        Workload._operators = this._operators;
        Workload._clients = this._clients;
        Workload.openDetailModal(id);
      });
      card.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/ob-id', card.dataset.id);
        e.dataTransfer.effectAllowed = 'move';
        card.classList.add('is-dragging');
        document.body.classList.add('ob-dragging');
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('is-dragging');
        document.body.classList.remove('ob-dragging');
        document.querySelectorAll('.ob-col.is-drop-target').forEach(c => c.classList.remove('is-drop-target'));
      });
    });

    // Drop sulle colonne
    root.querySelectorAll('.ob-col').forEach(col => {
      col.addEventListener('dragover', (e) => {
        if (!e.dataTransfer.types.includes('text/ob-id')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        col.classList.add('is-drop-target');
      });
      col.addEventListener('dragleave', (e) => {
        if (col.contains(e.relatedTarget)) return;
        col.classList.remove('is-drop-target');
      });
      col.addEventListener('drop', async (e) => {
        e.preventDefault();
        col.classList.remove('is-drop-target');
        const id = parseInt(e.dataTransfer.getData('text/ob-id'), 10);
        if (!id) return;
        const targetStatus = col.dataset.status;
        await this._handleStatusChange(id, targetStatus);
      });
    });
  },

  async _handleStatusChange(workitemId, targetStatus) {
    const w = await DB.get('workitems', workitemId);
    if (!w || w.status === targetStatus) return;
    const skip = !!(await DB.getSetting('workload_dnd_skip_confirm', false));
    if (!skip) {
      const ok = await this._confirmStatusChange(w, targetStatus);
      if (!ok) return;
    }
    const fresh = await DB.get('workitems', workitemId);
    if (!fresh) return;
    fresh.status = targetStatus;
    if (targetStatus === 'done') {
      fresh.progress = 100;
      if (!fresh.completedAt) fresh.completedAt = new Date().toISOString();
    } else {
      fresh.completedAt = null;
      if (targetStatus !== 'in_progress' && fresh.progress === 100) fresh.progress = 0;
    }
    fresh.updatedAt = new Date().toISOString();
    await DB.put('workitems', fresh);
    App._toast(`Stato cambiato in "${this.COLUMNS.find(c => c.id === targetStatus)?.label}"`, 'success');
    await this.render();
  },

  _confirmStatusChange(w, targetStatus) {
    return new Promise((resolve) => {
      const fromLabel = this.COLUMNS.find(c => c.id === w.status)?.label || w.status;
      const toLabel   = this.COLUMNS.find(c => c.id === targetStatus)?.label || targetStatus;
      const overlay = document.createElement('div');
      overlay.className = 'rem-modal wl-modal';
      overlay.innerHTML = `
        <div class="rem-modal__box wl-modal__box wl-dnd-confirm">
          <h3>Confermi il cambio di stato?</h3>
          <p class="wl-dnd-confirm__title">${(w.title || '— senza titolo —').replace(/[<>]/g, '')}</p>
          <div class="wl-dnd-confirm__move">
            <div class="wl-dnd-confirm__row">
              <span class="wl-dnd-confirm__label">Stato</span>
              <span class="wl-dnd-confirm__from">${fromLabel}</span>
              <span class="wl-dnd-confirm__arrow">→</span>
              <span class="wl-dnd-confirm__to">${toLabel}</span>
            </div>
          </div>
          <label class="wl-dnd-confirm__skip">
            <input type="checkbox" id="obDndSkip">
            <span>Non mostrare più questo messaggio (puoi riattivarlo in <b>Lavorazioni → ⚙ Team &amp; Capacità</b>)</span>
          </label>
          <div class="wl-form__foot">
            <button type="button" class="btn btn--ghost" data-act="cancel">Annulla</button>
            <button type="button" class="btn btn--primary" data-act="confirm">Conferma</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      const close = (r) => { overlay.remove(); resolve(r); };
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
      overlay.querySelector('[data-act="cancel"]').addEventListener('click', () => close(false));
      overlay.querySelector('[data-act="confirm"]').addEventListener('click', async () => {
        if (overlay.querySelector('#obDndSkip').checked) await DB.setSetting('workload_dnd_skip_confirm', true);
        close(true);
      });
    });
  },
};

window.OperationsBoard = OperationsBoard;
