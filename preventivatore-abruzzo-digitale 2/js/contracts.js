/* ============================================================
   CONTRACTS.JS — Situazione clienti (contratti formalizzati)
   - Una scheda PER CLIENTE che aggrega tutti i contratti firmati
     (stage: firmato / in_produzione / completato).
   - Badge dei servizi (social / web / menu / grafica) — un cliente
     può averne più di uno.
   - Click → dettaglio con elenco contratti, data firma, data inizio,
     totali, voci, azioni.
   ============================================================ */

const Contracts = {

  /** Stage che identificano un contratto "vivo" o storico. */
  ACTIVE_STAGES: ['firmato', 'in_produzione', 'completato'],

  /** Tipi di contratto. 'continuativo' = canone ricorrente (Social mensile…),
      'una_tantum' = pratica chiusa col preventivo (shooting, evento). */
  CONTRACT_TYPES: {
    continuativo: { label: 'Continuativo', icon: '↻', color: '#0891b2' },
    una_tantum:   { label: 'Una tantum',   icon: '◆', color: '#a16207' },
  },

  /** Deduce il tipo se non è esplicitato sul preventivo. Usa lines.period
      (monthly/annual = continuativo) o lines.udm (mese/anno/mensile = continuativo). */
  contractTypeOf(q) {
    if (q && q.contractType && this.CONTRACT_TYPES[q.contractType]) return q.contractType;
    const lines = (q && q.lines) || [];
    const hasRecurring = lines.some(l => {
      const p = String(l && l.period || '').toLowerCase();
      const u = String(l && l.udm || '').toLowerCase();
      return p === 'monthly' || p === 'annual' || p === 'mensile' || p === 'annuale'
          || ['mese','mesi','mensile','anno','annuale','annuali'].includes(u);
    });
    return hasRecurring ? 'continuativo' : 'una_tantum';
  },

  /** Modalità di visualizzazione (stile Esplora risorse Windows). */
  VIEW_MODES: ['grid', 'tile', 'list'],
  _viewMode: null,        // popolata da DB.getSetting al primo render

  AREA_META: {
    social:  { label: 'Social',  color: '#0891b2', icon: '●' },
    web:     { label: 'Web',     color: '#8b5cf6', icon: '●' },
    menu:    { label: 'Menu',    color: '#16a34a', icon: '●' },
    grafica: { label: 'Grafica', color: '#db2777', icon: '●' },
    altro:   { label: 'Altro',   color: '#6b7280', icon: '●' },
  },

  /** Palette stabile per gli avatar (8 tinte tenute basse di saturazione
      per non gridare). Hash deterministico dal nome cliente → stessa
      tinta a ogni render. Niente gradient bi-color (gimmicky). */
  AVATAR_PALETTE: [
    '#1f2937', '#374151', '#3f3f46', '#475569',  // grigi caldi/freddi
    '#0f766e', '#155e75', '#6b21a8', '#9f1239',  // ink-y vibrant
  ],
  _avatarColor(name) {
    const s = String(name || '?');
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return this.AVATAR_PALETTE[h % this.AVATAR_PALETTE.length];
  },

  /** Colori semantici per stato pipeline cliente. */
  STAGE_META: {
    firmato:       { label: 'Firmato',       color: '#d97706' }, // amber-600
    in_produzione: { label: 'In produzione', color: '#0891b2' }, // cyan-600
    completato:    { label: 'Completato',    color: '#16a34a' }, // green-600
  },

  /** Estrae l'insieme delle aree (servizi) di un preventivo. */
  _areasOf(q) {
    const set = new Set();
    for (const l of (q.lines || [])) if (l && l.area && this.AREA_META[l.area]) set.add(l.area);
    if (!set.size) set.add('altro');
    return Array.from(set);
  },

  /** Aggrega: { clientId|clientName → { client, contracts:[quote], areas:Set, lastSigned, nextStart } } */
  async aggregate() {
    const quotes = (await DB.all('quotes')).filter(q => !q._deleted && this.ACTIVE_STAGES.includes(q.pipelineStage));
    const clients = await DB.all('clients').then(arr => arr.filter(c => !c._deleted));
    const byClient = new Map(clients.map(c => [c.id, c]));
    const byClientName = new Map(clients.map(c => [String(c.name || '').toLowerCase().trim(), c]));
    const groups = new Map();

    for (const q of quotes) {
      // Risoluzione cliente: prima id, poi match per nome con anagrafica
      let clientObj = null;
      if (q.clientId != null && byClient.has(q.clientId)) clientObj = byClient.get(q.clientId);
      if (!clientObj && q.clientName) clientObj = byClientName.get(String(q.clientName).toLowerCase().trim());
      if (!clientObj) clientObj = { name: q.clientName || '— Senza cliente —', _fromQuote: true };

      const key = clientObj.id != null ? 'id:' + clientObj.id : 'name:' + (clientObj.name || '?').toLowerCase().trim();
      if (!groups.has(key)) {
        groups.set(key, { key, client: clientObj, contracts: [], areas: new Set() });
      }
      const g = groups.get(key);
      g.contracts.push(q);
      for (const a of this._areasOf(q)) g.areas.add(a);
    }

    // Calcola lastSigned + nextStart + area dominante per accent cromatico
    for (const g of groups.values()) {
      const signed = g.contracts.map(q => q.signedAt).filter(Boolean).sort();
      g.lastSigned = signed.length ? signed[signed.length - 1] : null;
      const starts = g.contracts.map(q => q.expectedStartDate).filter(Boolean).sort();
      g.nextStart = starts.length ? starts[0] : null;
      // Tipo aggregato del cliente: 'mixed' se ha entrambi i tipi
      const types = new Set(g.contracts.map(q => this.contractTypeOf(q)));
      g.contractTypeAgg = types.size > 1 ? 'mixed' : (Array.from(types)[0] || 'continuativo');

      // Conta i contratti per area → ordinamento per dominanza
      const counts = {};
      for (const q of g.contracts) {
        for (const a of this._areasOf(q)) counts[a] = (counts[a] || 0) + 1;
      }
      g.areasSorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([a]) => a);
      g.primaryArea   = g.areasSorted[0] || 'altro';
      g.secondaryArea = g.areasSorted[1] || null;

      // Stage prevalente del cliente (per pallino stato)
      const stageCounts = {};
      for (const q of g.contracts) {
        const s = q.pipelineStage || 'firmato';
        stageCounts[s] = (stageCounts[s] || 0) + 1;
      }
      g.dominantStage = Object.entries(stageCounts).sort((a, b) => b[1] - a[1])[0][0];

      // Canone mensile aggregato (lo precalcolo per non rifarlo in 3 view)
      g.monthly = g.contracts.reduce((s, q) => s + (State.calcQuote(q).monthly || 0), 0);
    }

    // Ordina per data firma desc
    return Array.from(groups.values()).sort((a, b) => {
      const ta = a.lastSigned ? new Date(a.lastSigned).getTime() : 0;
      const tb = b.lastSigned ? new Date(b.lastSigned).getTime() : 0;
      return tb - ta;
    });
  },

  // ===========================================================
  // VIEW MODE management
  // ===========================================================
  async _loadViewMode() {
    if (this._viewMode) return this._viewMode;
    const stored = await DB.getSetting('contracts_view_mode', 'grid');
    this._viewMode = this.VIEW_MODES.includes(stored) ? stored : 'grid';
    return this._viewMode;
  },

  async setViewMode(mode) {
    if (!this.VIEW_MODES.includes(mode)) return;
    this._viewMode = mode;
    await DB.setSetting('contracts_view_mode', mode);
    document.querySelectorAll('[data-view-mode]').forEach(b => {
      b.classList.toggle('is-active', b.dataset.viewMode === mode);
    });
    this.render();
  },

  // ===========================================================
  // RENDER
  // ===========================================================
  async render() {
    const list = document.getElementById('contractsList');
    const stats = document.getElementById('contractsStats');
    if (!list) return;

    await this._loadSort();
    const mode = await this._loadViewMode();
    // Aggiorna stato pulsanti toggle vista
    document.querySelectorAll('[data-view-mode]').forEach(b => {
      b.classList.toggle('is-active', b.dataset.viewMode === mode);
    });
    list.className = 'contracts-list contracts-list--' + mode;

    const groups = await this.aggregate();

    // Stats topbar — riga editorial, non card grid
    if (stats) {
      const totClients = groups.length;
      const totContracts = groups.reduce((s, g) => s + g.contracts.length, 0);
      const monthlyTot = groups.reduce((s, g) => s + (g.monthly || 0), 0);
      const byArea = { social: 0, web: 0, menu: 0, grafica: 0, altro: 0 };
      for (const g of groups) for (const a of g.areas) byArea[a] = (byArea[a] || 0) + 1;
      const areaStats = Object.entries(byArea)
        .filter(([k, n]) => n > 0 && k !== 'altro')
        .map(([a, n]) => {
          const m = this.AREA_META[a];
          return `<span class="contract-stat contract-stat--area">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${m.color};margin-right:4px"></span>${m.label} <b>${n}</b>
          </span>`;
        }).join('');
      stats.innerHTML = `
        <span class="contract-stat"><b>${totClients}</b> client${totClients===1?'e':'i'}</span>
        <span class="contract-stat"><b>${totContracts}</b> contratt${totContracts===1?'o':'i'}</span>
        ${monthlyTot > 0 ? `<span class="contract-stat"><b>${State.formatEur(monthlyTot)}</b>/mese ricorrente</span>` : ''}
        ${areaStats}
      `;
    }

    // Filtro area corrente (radio)
    const activeFilter = this._activeAreaFilter || 'all';
    const search = (document.getElementById('contractsSearch') || {}).value || '';
    const q = search.toLowerCase().trim();

    const typeFilter = this._activeTypeFilter || 'all';
    const visible = groups.filter(g => {
      if (activeFilter !== 'all' && !g.areas.has(activeFilter)) return false;
      if (typeFilter !== 'all') {
        if (typeFilter === 'continuativo' && g.contractTypeAgg === 'una_tantum') return false;
        if (typeFilter === 'una_tantum' && g.contractTypeAgg === 'continuativo') return false;
        // 'mixed' passa sia 'continuativo' che 'una_tantum'
      }
      if (!q) return true;
      const c = g.client || {};
      // La ricerca matcha anche brand e qualsiasi alias: l'operatore conosce
      // solo il brand commerciale ("La Perla Del Mare"), non la ragione sociale.
      const aliases = Array.isArray(c.aliases) ? c.aliases : [];
      const haystack = [c.name, c.brand, ...aliases, c.contact, c.email, c.phone, c.city, c.vat];
      return haystack.some(v => v && String(v).toLowerCase().includes(q));
    });

    if (!visible.length) {
      const isFiltered = (this._activeAreaFilter && this._activeAreaFilter !== 'all') || q;
      list.innerHTML = isFiltered
        ? `<div class="contracts-empty">
            <div class="contracts-empty__icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </div>
            <h3>Nessun risultato</h3>
            <p>Nessun cliente corrisponde ai filtri attivi. Prova a rimuovere la ricerca o seleziona "Tutti".</p>
          </div>`
        : `<div class="contracts-empty">
            <div class="contracts-empty__icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M20 7h-3V5a3 3 0 0 0-3-3h-4a3 3 0 0 0-3 3v2H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1zM9 5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2H9V5z"/></svg>
            </div>
            <h3>Nessun cliente con contratti attivi</h3>
            <p>Le schede compaiono qui automaticamente quando un preventivo passa allo stato <b>Firmato</b> nella Pipeline commerciale.</p>
            <span class="contracts-empty__path">
              <strong>Pipeline</strong>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
              trascina una bozza fino a <strong>Firmato</strong>
            </span>
          </div>`;
      return;
    }

    // Ordinamento Windows-style: applicato solo se l'utente ha cliccato su un header
    const sorted = this._applySort(visible);

    if (mode === 'list') {
      list.innerHTML = this._listRowsHtml(sorted);
      // Click sugli header → toggle ordinamento (none → asc → desc → none)
      list.querySelectorAll('[data-sort-key]').forEach(h => {
        h.addEventListener('click', () => this._cycleSort(h.dataset.sortKey));
      });
    } else {
      list.innerHTML = sorted.map(g => this._cardHtml(g, mode)).join('');
    }
    list.querySelectorAll('[data-open-client]').forEach(el => {
      const open = () => this._openClientDetail(el.dataset.openClient);
      el.addEventListener('click', open);
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      });
    });
  },

  /** Cicla l'ordinamento sulla colonna: none → asc → desc → none.
      Persistente in DB.setSetting tra le sessioni. */
  async _cycleSort(key) {
    const cur = this._sort || { key: null, dir: null };
    let next;
    if (cur.key !== key) next = { key, dir: 'asc' };
    else if (cur.dir === 'asc') next = { key, dir: 'desc' };
    else next = { key: null, dir: null };
    this._sort = next;
    await DB.setSetting('contracts_sort', next);
    this.render();
  },

  /** Carica ordinamento salvato all'avvio della view. */
  async _loadSort() {
    if (this._sort !== undefined) return;
    try { this._sort = await DB.getSetting('contracts_sort', null); }
    catch { this._sort = null; }
  },

  /** Ritorna un array ordinato secondo this._sort. Se nessun sort attivo,
      mantiene l'ordine originale (per data firma desc come default). */
  _applySort(groups) {
    const s = this._sort;
    if (!s || !s.key) return groups;
    const getter = {
      name: g => (g.client && (g.client.brand || g.client.name) || '').toLowerCase(),
      areas: g => (g.areas && g.areas.size) || 0,
      stage: g => g.dominantStage || '',
      signed: g => g.lastSigned ? new Date(g.lastSigned).getTime() : 0,
      start: g => g.nextStart ? new Date(g.nextStart).getTime() : 0,
      monthly: g => g.monthly || 0,
    }[s.key];
    if (!getter) return groups;
    const dir = s.dir === 'desc' ? -1 : 1;
    return [...groups].sort((a, b) => {
      const va = getter(a), vb = getter(b);
      if (va < vb) return -1 * dir;
      if (va > vb) return  1 * dir;
      return 0;
    });
  },

  /** Vista Lista — tabella vera, sticky header, niente decorazione. */
  _listRowsHtml(groups) {
    const fmtDate = d => d ? new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
    const safe = s => String(s || '').replace(/[<>]/g, '');
    const rows = groups.map(g => {
      const c = g.client || {};
      const displayName = c.brand || c.name || '?';
      const initials = displayName.split(/\s+/).filter(Boolean).map(s => s[0]).slice(0, 2).join('').toUpperCase();
      const avatarBg = this._avatarColor(c.brand || c.name);
      const stageInfo = this.STAGE_META[g.dominantStage] || { label: g.dominantStage, color: '#6b7280' };
      const areas = Array.from(g.areas).map(a => {
        const m = this.AREA_META[a];
        return `<span class="contract-badge" style="background:${m.color}14;color:${m.color}" title="${m.label}">
          <span style="display:inline-block;width:5px;height:5px;border-radius:50%;background:${m.color}"></span>${m.label}
        </span>`;
      }).join('');
      const typeChipList = (() => {
        if (g.contractTypeAgg === 'mixed') {
          return `<span class="contract-type-chip contract-type-chip--mixed" title="Misto">↻◆</span>`;
        }
        const t = this.CONTRACT_TYPES[g.contractTypeAgg];
        if (!t) return '';
        return `<span class="contract-type-chip" style="border-color:${t.color}40;color:${t.color}" title="${t.label}">${t.icon}</span>`;
      })();
      const subline = [
        [c.city, c.prov ? '(' + c.prov + ')' : ''].filter(Boolean).join(' ').trim(),
        c.contact || ''
      ].filter(Boolean).join(' · ');
      // Brand: se presente, è il nome che l'operatore vede grosso. La ragione
      // sociale resta come "sub" sotto, in piccolo (gli operatori non la conoscono).
      const brand = c.brand ? String(c.brand).trim() : '';
      const aliases = Array.isArray(c.aliases) ? c.aliases.filter(Boolean) : [];
      const aliasChips = aliases.length
        ? `<span class="contract-alias-chips">${aliases.map(a => `<span class="contract-alias-chip">${safe(a)}</span>`).join('')}</span>`
        : '';
      const primaryName = brand || c.name || '— Cliente —';
      const secondaryLine = [
        brand ? safe(c.name) : '',
        subline
      ].filter(Boolean).join(' · ');
      return `
        <div class="contract-row" data-open-client="${g.key}" tabindex="0" role="button">
          <div class="contract-row__avatar" style="background:${avatarBg}">${initials}</div>
          <div class="contract-row__name">
            <b>${safe(primaryName)}</b>${aliasChips}
            <div class="contract-row__sub">${secondaryLine}</div>
          </div>
          <div class="contract-row__badges">${areas}${typeChipList}</div>
          <div class="contract-row__stage">
            <span class="contract-row__stage-dot" style="background:${stageInfo.color}"></span>${stageInfo.label}
          </div>
          <div class="contract-row__cell">${fmtDate(g.lastSigned)}</div>
          <div class="contract-row__cell ${g.nextStart ? '' : 'contract-row__cell--muted'}">${fmtDate(g.nextStart)}</div>
          <div class="contract-row__cell contract-row__money">${g.monthly > 0 ? State.formatEur(g.monthly) : '—'}</div>
        </div>
      `;
    }).join('');
    const sortKey = this._sort && this._sort.key;
    const sortDir = this._sort && this._sort.dir;
    const sortIcon = k => {
      if (sortKey !== k) return '';
      return sortDir === 'asc' ? ' <span class="sort-arrow">▲</span>' : ' <span class="sort-arrow">▼</span>';
    };
    const hdrCls = k => 'contract-list-header__cell contract-list-header__cell--sortable' +
      (sortKey === k ? ' is-active' : '');
    return `
      <div class="contract-list-header">
        <div></div>
        <div class="${hdrCls('name')}" data-sort-key="name">Cliente${sortIcon('name')}</div>
        <div class="${hdrCls('areas')}" data-sort-key="areas">Servizi${sortIcon('areas')}</div>
        <div class="${hdrCls('stage')}" data-sort-key="stage">Stato${sortIcon('stage')}</div>
        <div class="${hdrCls('signed')}" data-sort-key="signed">Firma${sortIcon('signed')}</div>
        <div class="${hdrCls('start')}" data-sort-key="start">Inizio${sortIcon('start')}</div>
        <div class="${hdrCls('monthly')}" data-sort-key="monthly">Canone${sortIcon('monthly')}</div>
      </div>
      ${rows}
    `;
  },

  /** Card cliente in modalità Grid (default) o Tile (compatta). */
  _cardHtml(g, mode = 'grid') {
    const c = g.client || {};
    const fmtDate = d => d ? new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
    const brand = c.brand ? String(c.brand).trim() : '';
    const aliases = Array.isArray(c.aliases) ? c.aliases.filter(Boolean) : [];
    // Brand è il nome di facciata. Se manca cade su ragione sociale.
    const displayName = brand || c.name || '— Cliente senza nome —';
    const avatarBg = this._avatarColor(brand || c.name);
    const stageInfo = this.STAGE_META[g.dominantStage] || { label: g.dominantStage, color: '#6b7280' };
    const initials = displayName.split(/\s+/).filter(Boolean).map(s => s[0]).slice(0, 2).join('').toUpperCase();
    const safe = s => String(s || '').replace(/[<>]/g, '');
    const aliasChips = aliases.length
      ? `<div class="contract-alias-chips contract-alias-chips--card">${aliases.map(a => `<span class="contract-alias-chip">${safe(a)}</span>`).join('')}</div>`
      : '';

    const areas = Array.from(g.areas).map(a => {
      const m = this.AREA_META[a];
      return `<span class="contract-badge" style="background:${m.color}14;color:${m.color}">
        <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${m.color}"></span>${m.label}
      </span>`;
    }).join('');
    // Chip tipo contratto (continuativo / una tantum / misto)
    const typeChip = (() => {
      if (g.contractTypeAgg === 'mixed') {
        return `<span class="contract-type-chip contract-type-chip--mixed" title="Cliente ha sia contratti continuativi che pratiche una tantum">↻◆ Misto</span>`;
      }
      const t = this.CONTRACT_TYPES[g.contractTypeAgg];
      if (!t) return '';
      return `<span class="contract-type-chip" style="border-color:${t.color}40;color:${t.color}" title="${t.label}">${t.icon} ${t.label}</span>`;
    })();

    const metaParts = [
      c.vat ? 'P.IVA ' + safe(c.vat) : '',
      [c.city, c.prov ? '(' + c.prov + ')' : ''].filter(Boolean).join(' ').trim()
    ].filter(Boolean).join(' · ');

    // Riga "secondaria": se ho un brand, la ragione sociale va qui sotto piccolina
    const subMetaTile = [
      brand ? safe(c.name) : '',
      safe([c.city, c.prov ? '(' + c.prov + ')' : ''].filter(Boolean).join(' '))
    ].filter(Boolean).join(' · ');

    if (mode === 'tile') {
      return `
        <div class="contract-card contract-card--tile" data-open-client="${g.key}" tabindex="0" role="button">
          <div class="contract-card__head">
            <div class="contract-card__avatar" style="background:${avatarBg}">${initials}</div>
            <div class="contract-card__head-text">
              <h3 class="contract-card__name">${safe(displayName)}</h3>
              <div class="contract-card__meta">${subMetaTile || '—'}</div>
            </div>
            <div class="contract-card__stage" title="${stageInfo.label}">
              <span class="contract-card__stage-dot" style="background:${stageInfo.color}"></span>
            </div>
          </div>
          ${aliasChips}
          <div class="contract-card__badges">${areas}${typeChip}</div>
          <div class="contract-card__tile-foot">
            <span>${g.contracts.length} contratt${g.contracts.length===1?'o':'i'}</span>
            <span>${g.monthly > 0 ? '<b>' + State.formatEur(g.monthly) + '</b>/mese' : '—'}</span>
          </div>
        </div>
      `;
    }

    // Grid (default) — meta nella card include ragione sociale sotto il brand
    const subMetaGrid = [
      brand ? safe(c.name) : '',
      metaParts
    ].filter(Boolean).join(' · ');

    return `
      <div class="contract-card" data-open-client="${g.key}" tabindex="0" role="button">
        <div class="contract-card__head">
          <div class="contract-card__avatar" style="background:${avatarBg}">${initials}</div>
          <div class="contract-card__head-text">
            <h3 class="contract-card__name">${safe(displayName)}</h3>
            <div class="contract-card__meta">${subMetaGrid || '—'}</div>
          </div>
          <div class="contract-card__head-right">
            <div class="contract-card__stage">
              <span class="contract-card__stage-dot" style="background:${stageInfo.color}"></span>${stageInfo.label}
            </div>
            <div class="contract-card__count">
              <b>${g.contracts.length}</b> ${g.contracts.length === 1 ? 'contratto' : 'contratti'}
            </div>
          </div>
        </div>
        <div class="contract-card__badges">${areas}${typeChip}</div>
        ${aliasChips}
        <div class="contract-card__grid">
          <div class="contract-card__field">
            <div class="contract-card__label">Firma</div>
            <div class="contract-card__value">${fmtDate(g.lastSigned)}</div>
          </div>
          <div class="contract-card__field">
            <div class="contract-card__label">Inizio</div>
            <div class="contract-card__value ${g.nextStart ? '' : 'contract-card__value--muted'}">${fmtDate(g.nextStart)}</div>
          </div>
          <div class="contract-card__field">
            <div class="contract-card__label">Canone</div>
            <div class="contract-card__value ${g.monthly > 0 ? '' : 'contract-card__value--muted'}">${g.monthly > 0 ? State.formatEur(g.monthly) : '—'}</div>
          </div>
        </div>
        ${(c.contact || c.email || c.phone) ? `
          <div class="contract-card__contacts">
            ${c.contact ? `<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>${safe(c.contact)}</span>` : ''}
            ${c.email   ? `<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg><a href="mailto:${c.email}" onclick="event.stopPropagation()">${safe(c.email)}</a></span>` : ''}
            ${c.phone   ? `<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg><a href="tel:${c.phone}" onclick="event.stopPropagation()">${safe(c.phone)}</a></span>` : ''}
          </div>
        ` : ''}
      </div>
    `;
  },

  // ===========================================================
  // Dettaglio cliente — shell con 3 tab: Anagrafica, Contratti, Attività
  // ===========================================================
  async _openClientDetail(key) {
    const groups = await this.aggregate();
    const g = groups.find(x => x.key === key);
    if (!g) return;
    const c = g.client || {};
    const overlay = document.createElement('div');
    overlay.className = 'rem-modal contract-modal';
    const safe = s => String(s == null ? '' : s).replace(/[<>]/g, '');

    const brandLine = c.brand
      ? `<div class="contract-modal__brand">${safe(c.brand)}</div><div class="contract-modal__ragione">${safe(c.name) || '—'}</div>`
      : `<div class="contract-modal__brand">${safe(c.name) || '—'}</div>`;

    overlay.innerHTML = `
      <div class="rem-modal__box contract-modal__box">
        <header class="contract-modal__head">
          ${brandLine}
          <button class="contract-modal__close" data-act="close" aria-label="Chiudi">×</button>
        </header>
        <nav class="contract-modal__tabs" role="tablist">
          <button class="contract-modal__tab is-active" data-tab="anagrafica" role="tab">Anagrafica</button>
          <button class="contract-modal__tab" data-tab="contratti" role="tab">Contratti <span class="contract-modal__tab-count">${g.contracts.length}</span></button>
          <button class="contract-modal__tab" data-tab="attivita" role="tab">Attività</button>
        </nav>
        <div class="contract-modal__body">
          <section class="contract-modal__panel is-active" data-panel="anagrafica">${this._renderAnagraficaPanel(c)}</section>
          <section class="contract-modal__panel" data-panel="contratti" hidden>${this._renderContrattiPanel(g)}</section>
          <section class="contract-modal__panel" data-panel="attivita" hidden><div class="contract-activity-loading">Caricamento storico…</div></section>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('[data-act="close"]').addEventListener('click', () => overlay.remove());

    // Switch tab
    overlay.querySelectorAll('.contract-modal__tab').forEach(t => {
      t.addEventListener('click', () => this._switchTab(overlay, t.dataset.tab, c));
    });

    // Wire dei form/handler dei due tab già montati
    this._wireAnagraficaPanel(overlay, c);
    this._wireContrattiPanel(overlay, g);
  },

  _switchTab(overlay, tabName, client) {
    overlay.querySelectorAll('.contract-modal__tab').forEach(t =>
      t.classList.toggle('is-active', t.dataset.tab === tabName));
    overlay.querySelectorAll('.contract-modal__panel').forEach(p => {
      const active = p.dataset.panel === tabName;
      p.classList.toggle('is-active', active);
      p.hidden = !active;
    });
    if (tabName === 'attivita') this._loadActivityFeed(overlay, client);
  },

  // ===========================================================
  // Tab Anagrafica — form di edit cliente
  // ===========================================================
  _renderAnagraficaPanel(c) {
    const safe = s => String(s == null ? '' : s).replace(/[<>]/g, '');
    const aliases = Array.isArray(c.aliases) ? c.aliases.filter(Boolean).join(', ') : '';
    return `
      <form class="contract-edit-form" data-form="anagrafica">
        <div class="contract-edit-form__row">
          <label>
            <span>Ragione sociale</span>
            <input name="name" type="text" value="${safe(c.name)}" placeholder="Es. Cold Company SRL">
          </label>
          <label>
            <span>P.IVA</span>
            <input name="vat" type="text" value="${safe(c.vat)}" placeholder="IT12345678901" readonly title="La P.IVA arriva da Fatture in Cloud, non modificabile qui">
          </label>
        </div>
        <div class="contract-edit-form__row">
          <label>
            <span>Brand</span>
            <input name="brand" type="text" value="${safe(c.brand)}" placeholder="Es. La Perla Del Mare">
          </label>
          <label>
            <span>Brand secondari <small>(separati da virgola)</small></span>
            <input name="aliases" type="text" value="${safe(aliases)}" placeholder="Bar Centrale, Bistrot Sole">
          </label>
        </div>
        <div class="contract-edit-form__row">
          <label>
            <span>Referente</span>
            <input name="contact" type="text" value="${safe(c.contact)}" placeholder="Nome cognome">
          </label>
          <label>
            <span>Telefono</span>
            <input name="phone" type="tel" value="${safe(c.phone)}" placeholder="+39 ...">
          </label>
        </div>
        <div class="contract-edit-form__row">
          <label>
            <span>Email</span>
            <input name="email" type="email" value="${safe(c.email)}" placeholder="info@cliente.it">
          </label>
          <label>
            <span>Indirizzo</span>
            <input name="addr" type="text" value="${safe(c.addr)}" placeholder="Via, numero">
          </label>
        </div>
        <div class="contract-edit-form__row">
          <label>
            <span>Città</span>
            <input name="city" type="text" value="${safe(c.city)}">
          </label>
          <label>
            <span>Provincia</span>
            <input name="prov" type="text" value="${safe(c.prov)}" maxlength="2" placeholder="PE">
          </label>
        </div>
        <fieldset class="contract-edit-form__fieldset">
          <legend>Cadenza social <small>(per Generatore PED)</small></legend>
          <div class="contract-edit-form__row">
            <label>
              <span>Pubblicazioni mensili totali</span>
              <input name="pubblicazioniMensili" type="number" min="0" max="200" step="1" value="${safe(c.pubblicazioniMensili || '')}" placeholder="Es. 12">
            </label>
            <label>
              <span>Tone of voice <small>(opzionale)</small></span>
              <input name="toneOfVoice" type="text" value="${safe(c.toneOfVoice || '')}" placeholder="Caldo, professionale, ispirazionale">
            </label>
          </div>
          <div class="contract-edit-form__row contract-edit-form__row--4">
            <label>
              <span>Post foto <small>/mese</small></span>
              <input name="nPostMese" type="number" min="0" max="100" step="1" value="${safe(c.nPostMese || '')}" placeholder="6">
            </label>
            <label>
              <span>Caroselli <small>/mese</small></span>
              <input name="nCaroselliMese" type="number" min="0" max="100" step="1" value="${safe(c.nCaroselliMese || '')}" placeholder="4">
            </label>
            <label>
              <span>Reel <small>/mese</small></span>
              <input name="nReelMese" type="number" min="0" max="100" step="1" value="${safe(c.nReelMese || '')}" placeholder="2">
            </label>
            <label>
              <span>Stories <small>/mese</small></span>
              <input name="nStoriesMese" type="number" min="0" max="500" step="1" value="${safe(c.nStoriesMese || '')}" placeholder="0">
            </label>
          </div>
          <p class="contract-edit-form__hint" style="margin-top:6px">
            Lascia vuoti i 4 dettagli se vuoi che il Generatore PED applichi la distribuzione default (50% foto · 20% reel · 30% caroselli) sul totale mensile. Le stories vivono in un flusso separato dal feed.
          </p>
        </fieldset>
        <fieldset class="contract-edit-form__fieldset contract-edit-form__fieldset--trello">
          <legend>Trello — Board del cliente <small>(Board lavorazioni, sync workitems)</small></legend>
          <div class="contract-edit-form__row contract-edit-form__row--trello">
            <label style="flex:1">
              <span>URL board Trello</span>
              <input name="trelloBoardUrl" type="url" value="${safe(c.trelloBoardUrl || '')}" placeholder="https://trello.com/b/abc12345/nome-board">
            </label>
            <button type="button" class="btn btn--secondary btn--sm" data-act="trello-verify">🔍 Verifica</button>
          </div>
          <div class="contract-trello-status" data-trello-status>
            ${c.trelloBoardId
              ? `<span class="contract-trello-status__ok">✓ Collegata a <b>${safe(c.trelloBoardName || c.trelloBoardId)}</b></span>`
              : '<span class="contract-trello-status__none">Nessuna board collegata. Incolla l\'URL e premi <b>Verifica</b>.</span>'}
          </div>
          <div class="contract-trello-map" data-trello-map ${c.trelloBoardId ? '' : 'hidden'}>
            <p class="contract-edit-form__hint" style="margin:8px 0 6px">Mappa le colonne della Board lavorazioni alle liste Trello (opzionale):</p>
            <div class="contract-edit-form__row contract-edit-form__row--4">
              <label><span>Da fare → lista</span><select name="trelloList_todo" data-trello-list></select></label>
              <label><span>In corso → lista</span><select name="trelloList_in_progress" data-trello-list></select></label>
              <label><span>Approvazione → lista</span><select name="trelloList_blocked" data-trello-list></select></label>
              <label><span>Fatto → lista</span><select name="trelloList_done" data-trello-list></select></label>
            </div>
          </div>
          <input type="hidden" name="trelloBoardId"   value="${safe(c.trelloBoardId   || '')}">
          <input type="hidden" name="trelloBoardName" value="${safe(c.trelloBoardName || '')}">
        </fieldset>
        <label class="contract-edit-form__full">
          <span>Note interne</span>
          <textarea name="notes" rows="3" placeholder="Annotazioni libere, condizioni particolari…">${safe(c.notes)}</textarea>
        </label>
        <div class="contract-edit-form__foot">
          <span class="contract-edit-form__hint">Le modifiche vengono registrate nella tab Attività.</span>
          <button type="submit" class="btn btn--primary btn--sm">Salva anagrafica</button>
        </div>
      </form>
    `;
  },

  _wireAnagraficaPanel(overlay, client) {
    const form = overlay.querySelector('[data-form="anagrafica"]');
    if (!form) return;
    // Pre-popola le select liste se la board è già collegata
    if (client.trelloBoardId) {
      this._loadTrelloListsInto(overlay, client.trelloBoardId, client.trelloListMap || {});
    }
    // Verifica board (bottone): fetch info dal backend e popola le select.
    const verifyBtn = form.querySelector('[data-act="trello-verify"]');
    if (verifyBtn) {
      verifyBtn.addEventListener('click', async () => {
        const url = (form.querySelector('[name="trelloBoardUrl"]').value || '').trim();
        const statusEl = form.querySelector('[data-trello-status]');
        if (!url) {
          statusEl.innerHTML = '<span class="contract-trello-status__err">⚠ Incolla prima l\'URL della board.</span>';
          return;
        }
        const ref = this._trelloShortFromUrl(url);
        if (!ref) {
          statusEl.innerHTML = '<span class="contract-trello-status__err">⚠ URL non valida. Deve essere tipo https://trello.com/b/abc12345/nome.</span>';
          return;
        }
        statusEl.innerHTML = '<span style="color:var(--ad-mute)">⏳ Verifica in corso…</span>';
        try {
          if (!window.Sync || !Sync.enabled() || !Sync._loadToken()) {
            throw new Error('Backend non collegato. Trello richiede il backend attivo.');
          }
          const info = await Sync._api('GET', '/trello/board/' + encodeURIComponent(ref) + '/info');
          form.querySelector('[name="trelloBoardId"]').value   = info.id || '';
          form.querySelector('[name="trelloBoardName"]').value = info.name || '';
          statusEl.innerHTML = `<span class="contract-trello-status__ok">✓ Connessione OK · <b>${info.name.replace(/[<>]/g,'')}</b> · ${info.lists.length} liste</span>`;
          this._populateTrelloListSelects(form, info.lists, client.trelloListMap || {});
          form.querySelector('[data-trello-map]').hidden = false;
        } catch (e) {
          statusEl.innerHTML = `<span class="contract-trello-status__err">✕ ${(e.message || e).toString().replace(/[<>]/g, '')}</span>`;
        }
      });
    }
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      // Helper: number da FormData (vuoto → null, NON 0, perché 0 esplicito è diverso da "non impostato")
      const num = (k) => {
        const v = fd.get(k);
        if (v == null || String(v).trim() === '') return null;
        const n = parseInt(v, 10);
        return Number.isFinite(n) && n >= 0 ? n : null;
      };
      const updates = {
        name: fd.get('name')?.trim() || '',
        brand: fd.get('brand')?.trim() || '',
        aliases: (fd.get('aliases') || '').split(',').map(s => s.trim()).filter(Boolean),
        contact: fd.get('contact')?.trim() || '',
        phone: fd.get('phone')?.trim() || '',
        email: fd.get('email')?.trim() || '',
        addr: fd.get('addr')?.trim() || '',
        city: fd.get('city')?.trim() || '',
        prov: fd.get('prov')?.trim() || '',
        notes: fd.get('notes') || '',
        // Cadenza social per Generatore PED
        pubblicazioniMensili: num('pubblicazioniMensili'),
        nPostMese:       num('nPostMese'),
        nCaroselliMese:  num('nCaroselliMese'),
        nReelMese:       num('nReelMese'),
        nStoriesMese:    num('nStoriesMese'),
        toneOfVoice:     fd.get('toneOfVoice')?.trim() || '',
        // Trello — collegamento board cliente (workload step 1A)
        trelloBoardUrl:  fd.get('trelloBoardUrl')?.trim() || '',
        trelloBoardId:   fd.get('trelloBoardId')?.trim() || '',
        trelloBoardName: fd.get('trelloBoardName')?.trim() || '',
        trelloListMap: {
          todo:        fd.get('trelloList_todo') || '',
          in_progress: fd.get('trelloList_in_progress') || '',
          blocked:     fd.get('trelloList_blocked') || '',
          done:        fd.get('trelloList_done') || '',
        },
      };
      const merged = Object.assign({}, client, updates);
      try {
        await DB.put('clients', merged);
        App._toast('Anagrafica aggiornata', 'success');
        // Ricarica lista situazione clienti (in background, senza chiudere il modal)
        this.render();
        // Aggiorna l'header del modal se il brand è cambiato
        const brandEl = overlay.querySelector('.contract-modal__brand');
        const ragEl = overlay.querySelector('.contract-modal__ragione');
        if (merged.brand) {
          if (brandEl) brandEl.textContent = merged.brand;
          if (ragEl) ragEl.textContent = merged.name || '—';
          else if (brandEl) {
            const next = document.createElement('div');
            next.className = 'contract-modal__ragione';
            next.textContent = merged.name || '—';
            brandEl.insertAdjacentElement('afterend', next);
          }
        } else {
          if (brandEl) brandEl.textContent = merged.name || '—';
          if (ragEl) ragEl.remove();
        }
        // Mantieni reference aggiornato per ricaricare attività se cambi tab
        Object.assign(client, merged);
      } catch (err) {
        App._toast('Errore: ' + (err.message || err), 'error');
      }
    });
  },

  // ===========================================================
  // Tab Contratti — lista + edit inline per ogni contratto
  // ===========================================================
  _renderContrattiPanel(g) {
    const safe = s => String(s == null ? '' : s).replace(/[<>]/g, '');
    const fmtDate = d => d ? new Date(d).toLocaleDateString('it-IT') : '—';
    const STAGES = ['firmato', 'in_produzione', 'completato'];

    // Toolbar in cima al tab: sempre presente, anche se 0 contratti
    const toolbar = `
      <div class="contract-edit-toolbar">
        <button class="btn btn--primary btn--sm" data-act="new-contract">+ Nuovo contratto</button>
        <span class="contract-edit-toolbar__hint">Crea un contratto vuoto associato a questo cliente.</span>
      </div>
    `;

    if (!g.contracts.length) {
      return toolbar + '<div class="contract-empty" style="margin-top:14px">Nessun contratto firmato per questo cliente. Usa <b>+ Nuovo contratto</b> per crearne uno o duplica un contratto esistente.</div>';
    }
    const blocks = g.contracts.map(q => {
      const totals = State.calcQuote(q);
      const areas = this._areasOf(q).map(a => {
        const m = this.AREA_META[a];
        return `<span class="contract-badge" style="background:${m.color}1a;color:${m.color}">${m.icon} ${m.label}</span>`;
      }).join('');
      const lines = (q.lines || []).map((l, idx) => `
        <div class="contract-line-edit" data-quote-id="${q.id}" data-line-index="${idx}">
          <input class="contract-line-edit__name" data-field="name" type="text" value="${safe(l.name)}" placeholder="Nome voce">
          <input class="contract-line-edit__net" data-field="net" type="number" step="0.01" value="${l.net != null ? l.net : ''}" placeholder="€ netto">
          <input class="contract-line-edit__qty" data-field="quantity" type="number" step="1" min="1" value="${l.quantity || 1}" title="Quantità">
          <input class="contract-line-edit__discount" data-field="discountPct" type="number" step="1" min="0" max="100" value="${l.discountPct || 0}" title="Sconto %">
          <span class="contract-line-edit__unit">${safe(l.udm || '')}</span>
        </div>
      `).join('');
      return `
        <div class="contract-edit-block" data-quote-id="${q.id}">
          <div class="contract-edit-block__head">
            <div>
              <b>#${q.number || q.id}</b> · ${safe(q.tag || (q.notes || '').slice(0, 50) || 'Senza titolo')}
              <div class="contract-edit-block__areas">${areas}</div>
            </div>
            <div class="contract-edit-block__totals">
              <div><b>${State.formatEur(totals.net)}</b> netto</div>
              ${totals.monthly > 0 ? `<div class="muted">${State.formatEur(totals.monthly)}/mese</div>` : ''}
            </div>
          </div>
          <div class="contract-edit-block__fields">
            <label>
              <span>Titolo</span>
              <input data-quote-id="${q.id}" data-field="tag" type="text" value="${safe(q.tag)}" placeholder="Titolo contratto">
            </label>
            <label>
              <span>Data firma</span>
              <input data-quote-id="${q.id}" data-field="signedAt" type="date" value="${q.signedAt ? new Date(q.signedAt).toISOString().slice(0,10) : ''}">
            </label>
            <label>
              <span>Data inizio</span>
              <input data-quote-id="${q.id}" data-field="expectedStartDate" type="date" value="${q.expectedStartDate || ''}">
            </label>
            <label>
              <span>Data fine</span>
              <input data-quote-id="${q.id}" data-field="expectedEndDate" type="date" value="${q.expectedEndDate || ''}">
            </label>
            <label>
              <span>Stato</span>
              <select data-quote-id="${q.id}" data-field="pipelineStage">
                ${STAGES.map(s => `<option value="${s}" ${q.pipelineStage===s?'selected':''}>${(this.STAGE_META[s]||{}).label||s}</option>`).join('')}
              </select>
            </label>
            <label>
              <span>Tipo</span>
              <select data-quote-id="${q.id}" data-field="contractType">
                ${Object.entries(this.CONTRACT_TYPES).map(([k, v]) => {
                  const sel = (this.contractTypeOf(q) === k) ? 'selected' : '';
                  return `<option value="${k}" ${sel}>${v.icon} ${v.label}</option>`;
                }).join('')}
              </select>
            </label>
          </div>
          <details class="contract-edit-block__lines">
            <summary>Voci del contratto (${(q.lines || []).length})</summary>
            <div class="contract-line-edit__head">
              <span>Nome voce</span>
              <span>Netto</span>
              <span>Qtà</span>
              <span>Sc%</span>
              <span>UdM</span>
            </div>
            ${lines || '<div class="muted" style="padding:8px">Nessuna voce.</div>'}
          </details>
          <div class="contract-edit-block__actions">
            <button class="btn btn--ghost btn--sm" data-act="save-contract" data-quote-id="${q.id}">Salva contratto</button>
            <button class="btn btn--ghost btn--sm" data-act="duplicate-contract" data-quote-id="${q.id}" title="Crea una copia di questo contratto come bozza">Duplica</button>
            <button class="btn btn--ghost btn--sm" data-act="open-quote" data-quote-id="${q.id}">Apri preventivo completo</button>
          </div>
        </div>
      `;
    }).join('');
    return toolbar + blocks;
  },

  _wireContrattiPanel(overlay, g) {
    // Salva contratto: raccoglie tutti gli input del blocco, applica le modifiche
    overlay.querySelectorAll('[data-act="save-contract"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const qid = btn.dataset.quoteId;
        const block = overlay.querySelector(`.contract-edit-block[data-quote-id="${qid}"]`);
        if (!block) return;
        const quote = g.contracts.find(x => String(x.id) === qid);
        if (!quote) return;
        // Carico la versione "viva" dal DB per non perdere campi non in form
        const fresh = await DB.get('quotes', parseInt(qid, 10)) || quote;
        // Campi top-level
        block.querySelectorAll('input[data-field], select[data-field]').forEach(inp => {
          if (inp.closest('.contract-line-edit')) return; // ignora i campi delle voci
          const f = inp.dataset.field;
          const v = inp.value;
          // signedAt: preserva ore originali se il giorno non è cambiato
          // (l'input type=date espone solo YYYY-MM-DD, riscriverlo brutalmente
          // azzera ore/minuti/secondi del record originale).
          if (f === 'signedAt') {
            if (!v) { fresh.signedAt = null; return; }
            const currentDay = fresh.signedAt
              ? new Date(fresh.signedAt).toISOString().slice(0, 10)
              : null;
            if (currentDay === v) return; // nessuna modifica reale
            // Giorno cambiato: salvo in ISO mettendo mezzogiorno locale per
            // evitare drift di fuso quando lo si legge altrove.
            fresh.signedAt = new Date(v + 'T12:00:00').toISOString();
            return;
          }
          if (f === 'expectedStartDate' || f === 'expectedEndDate') {
            fresh[f] = v || null;
            return;
          }
          // contractType: non sovrascrivere se il record non aveva il campo e il
          // valore selezionato corrisponde all'auto-detect (è solo il default UI).
          if (f === 'contractType') {
            if (!fresh.contractType) {
              const auto = this.contractTypeOf({ lines: fresh.lines });
              if (v === auto) return; // l'utente non ha cambiato dal default auto-detected
            }
            fresh[f] = v || null;
            return;
          }
          fresh[f] = v || (f === 'tag' ? '' : null);
        });
        // Voci: match per INDICE (le righe non hanno id stabili nel progetto)
        block.querySelectorAll('.contract-line-edit').forEach(row => {
          const idx = parseInt(row.dataset.lineIndex, 10);
          if (!Number.isInteger(idx)) return;
          if (!Array.isArray(fresh.lines)) return;
          const line = fresh.lines[idx];
          if (!line) return;
          row.querySelectorAll('input[data-field]').forEach(inp => {
            const f = inp.dataset.field;
            if (f === 'name') line[f] = inp.value;
            else line[f] = inp.value === '' ? null : Number(inp.value);
          });
        });
        try {
          await DB.put('quotes', fresh);
          App._toast('Contratto aggiornato', 'success');
          this.render();
        } catch (err) {
          App._toast('Errore: ' + (err.message || err), 'error');
        }
      });
    });
    overlay.querySelectorAll('[data-act="open-quote"]').forEach(b => b.addEventListener('click', () => {
      overlay.remove();
      App.openQuote(parseInt(b.dataset.quoteId, 10));
    }));

    // + Nuovo contratto: preventivo vuoto associato a questo cliente
    const newBtn = overlay.querySelector('[data-act="new-contract"]');
    if (newBtn) {
      newBtn.addEventListener('click', async () => {
        const client = g.client || {};
        const now = new Date().toISOString();
        const newQuote = {
          clientId: client.id,
          clientName: client.brand || client.name || '',
          clientSyncId: client.syncId,
          lines: [],
          contractType: 'continuativo',
          pipelineStage: 'bozza',
          status: 'bozza',
          tag: 'Nuovo contratto ' + (client.brand || client.name || ''),
          createdAt: now,
          updatedAt: now,
          createdBy: (State.currentUser && State.currentUser.username) || null,
        };
        try {
          const newId = await DB.put('quotes', newQuote);
          App._toast('Contratto creato — completa nell\'editor', 'success');
          overlay.remove();
          App.openQuote(typeof newId === 'number' ? newId : newQuote.id);
        } catch (err) {
          App._toast('Errore: ' + (err.message || err), 'error');
        }
      });
    }

    // Duplica contratto: copia righe + cliente, azzera date/stato, suffisso (copia)
    overlay.querySelectorAll('[data-act="duplicate-contract"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const qid = parseInt(btn.dataset.quoteId, 10);
        const original = await DB.get('quotes', qid);
        if (!original) return;
        // Deep copy via JSON, poi azzero i campi che non vanno propagati
        const copy = JSON.parse(JSON.stringify(original));
        delete copy.id;
        delete copy.syncId;
        delete copy.number;
        delete copy.signedAt;
        delete copy.expectedStartDate;
        delete copy.expectedEndDate;
        delete copy._deleted;
        delete copy._updatedAt;
        copy.pipelineStage = 'bozza';
        copy.status = 'bozza';
        copy.tag = ((original.tag || 'Senza titolo') + ' (copia)').slice(0, 200);
        const now = new Date().toISOString();
        copy.createdAt = now;
        copy.updatedAt = now;
        copy.createdBy = (State.currentUser && State.currentUser.username) || null;
        try {
          const newId = await DB.put('quotes', copy);
          App._toast('Contratto duplicato — apertura editor', 'success');
          overlay.remove();
          App.openQuote(typeof newId === 'number' ? newId : copy.id);
        } catch (err) {
          App._toast('Errore: ' + (err.message || err), 'error');
        }
      });
    });
  },

  // ===========================================================
  // Tab Attività — feed cronologico modifiche
  // ===========================================================
  async _loadActivityFeed(overlay, client) {
    const panel = overlay.querySelector('[data-panel="attivita"]');
    if (!panel) return;
    panel.innerHTML = '<div class="contract-activity-loading">Caricamento storico…</div>';

    // Recupera attività del cliente + di tutti i suoi contratti.
    // syncId è la chiave server-side; se manca (cliente solo locale), niente da chiedere.
    if (!window.Sync || !Sync.enabled() || !Sync._loadToken()) {
      panel.innerHTML = '<div class="contract-activity-loading">Storico disponibile solo con backend connesso.</div>';
      return;
    }
    try {
      const items = [];
      if (client.syncId) {
        const r = await Sync._api('GET', '/activity?entityType=client&entityId=' + encodeURIComponent(client.syncId));
        if (Array.isArray(r)) items.push(...r);
      }
      // Recupera anche per i quote syncId (i quote.id locali ≠ syncId server)
      const allQuotes = await DB.all('quotes');
      const quotesForClient = allQuotes.filter(q => !q._deleted && (
        (client.syncId && q.clientSyncId === client.syncId) ||
        (client.id != null && q.clientId === client.id) ||
        (client.name && q.clientName && String(q.clientName).trim().toLowerCase() === String(client.name).trim().toLowerCase())
      ));
      for (const q of quotesForClient) {
        if (!q.syncId) continue;
        const r = await Sync._api('GET', '/activity?entityType=quote&entityId=' + encodeURIComponent(q.syncId));
        if (Array.isArray(r)) {
          r.forEach(it => it._quoteRef = '#' + (q.number || q.id));
          items.push(...r);
        }
      }
      items.sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
      panel.innerHTML = this._renderActivityFeed(items);
    } catch (err) {
      panel.innerHTML = `<div class="contract-activity-loading">Errore: ${String(err.message || err).replace(/[<>]/g,'')}</div>`;
    }
  },

  _renderActivityFeed(items) {
    if (!items.length) {
      return '<div class="contract-activity-empty">Nessuna modifica registrata. Le attività compariranno qui quando l\'anagrafica o un contratto verrà modificato.</div>';
    }
    const safe = s => String(s == null ? '' : s).replace(/[<>]/g, '');
    const fmtVal = v => {
      if (v == null) return '<i class="muted">vuoto</i>';
      if (Array.isArray(v)) return v.length ? v.map(x => safe(x)).join(', ') : '<i class="muted">vuoto</i>';
      if (typeof v === 'object') return safe(JSON.stringify(v));
      return safe(String(v));
    };
    const fmtDateTime = ts => {
      try {
        const d = new Date(ts);
        return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
          ' · ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
      } catch { return safe(ts); }
    };
    // Formatta una data ISO o YYYY-MM-DD in "21/05/26" per il feed
    const fmtDate = d => {
      if (!d) return null;
      try {
        return new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
      } catch { return safe(d); }
    };
    // Render del campo modificato: gestisce sia anagrafica/contratto (field semplice)
    // sia voci del preventivo (field "line.*" + lineName + lineIndex)
    const renderChange = (it) => {
      // Aggiunta/rimozione voce intera
      if (it.field === 'line.added') {
        return `<b>Voce aggiunta</b>: <span class="contract-activity-item__new">${safe(it.lineName)}</span>`;
      }
      if (it.field === 'line.removed') {
        return `<b>Voce rimossa</b>: <span class="contract-activity-item__old">${safe(it.lineName)}</span>`;
      }
      // Modifica campo di una voce specifica
      if (it.field && it.field.startsWith('line.')) {
        const ref = it.lineName ? ` voce <i>«${safe(it.lineName)}»</i>` : '';
        return `<b>${safe(it.fieldLabel || it.field)}${ref}</b>: ` +
          `<span class="contract-activity-item__old">${fmtVal(it.oldValue)}</span> ` +
          `→ <span class="contract-activity-item__new">${fmtVal(it.newValue)}</span>`;
      }
      // Date: rendi human-readable invece di ISO
      if (it.field === 'signedAt' || it.field === 'expectedStartDate' || it.field === 'expectedEndDate') {
        return `<b>${safe(it.fieldLabel)}</b>: ` +
          `<span class="contract-activity-item__old">${fmtDate(it.oldValue) || '<i class="muted">vuoto</i>'}</span> ` +
          `→ <span class="contract-activity-item__new">${fmtDate(it.newValue) || '<i class="muted">vuoto</i>'}</span>`;
      }
      // Campo standard
      return `<b>${safe(it.fieldLabel || it.field)}</b>: ` +
        `<span class="contract-activity-item__old">${fmtVal(it.oldValue)}</span> ` +
        `→ <span class="contract-activity-item__new">${fmtVal(it.newValue)}</span>`;
    };
    return `
      <ol class="contract-activity-feed">
        ${items.map(it => {
          const icon = it.entityType === 'client' ? '◉' : '◆';
          const scope = it.entityType === 'client'
            ? 'Anagrafica'
            : ('Contratto ' + (it._quoteRef || ''));
          return `
            <li class="contract-activity-item">
              <div class="contract-activity-item__icon" aria-hidden="true">${icon}</div>
              <div class="contract-activity-item__body">
                <div class="contract-activity-item__meta">
                  <b>${safe(it.userName || it.userId || 'Sistema')}</b>
                  · ${fmtDateTime(it.ts)}
                  · <span class="contract-activity-item__scope">${scope}</span>
                </div>
                <div class="contract-activity-item__change">${renderChange(it)}</div>
              </div>
            </li>`;
        }).join('')}
      </ol>
    `;
  },

  // ===========================================================
  // Filtri toolbar
  // ===========================================================
  setAreaFilter(area) {
    this._activeAreaFilter = area;
    document.querySelectorAll('[data-contracts-filter]').forEach(b => {
      b.classList.toggle('is-active', b.dataset.contractsFilter === area);
    });
    this.render();
  },

  setTypeFilter(type) {
    this._activeTypeFilter = type;
    document.querySelectorAll('[data-contracts-type-filter]').forEach(b => {
      b.classList.toggle('is-active', b.dataset.contractsTypeFilter === type);
    });
    this.render();
  },

  // ===========================================================
  // TRELLO HELPERS — collegamento board cliente (workload step 1A)
  // ===========================================================
  /** Estrae shortLink/id da URL Trello (es. https://trello.com/b/abc12345/nome) */
  _trelloShortFromUrl(url) {
    if (!url) return null;
    const s = String(url);
    let m = s.match(/trello\.com\/invite\/b\/([A-Za-z0-9]{6,})/);
    if (m) return m[1];
    m = s.match(/trello\.com\/b\/([A-Za-z0-9]{6,})/);
    return m ? m[1] : null;
  },

  /** Carica le liste di una board già collegata e pre-popola le select */
  async _loadTrelloListsInto(overlay, boardId, listMap) {
    if (!window.Sync || !Sync.enabled() || !Sync._loadToken()) return;
    try {
      const info = await Sync._api('GET', '/trello/board/' + encodeURIComponent(boardId) + '/info');
      const form = overlay.querySelector('[data-form="anagrafica"]');
      if (form) this._populateTrelloListSelects(form, info.lists || [], listMap || {});
    } catch (e) {
      // Silenzioso: probabilmente backend offline o credenziali assenti, l'utente
      // riproverà con il bottone Verifica
      console.warn('[Trello] caricamento liste fallito:', e.message);
    }
  },

  /** Popola le 4 select (todo/in_progress/blocked/done) con le liste Trello */
  _populateTrelloListSelects(form, lists, currentMap) {
    const safe = s => String(s == null ? '' : s).replace(/[<>]/g, '');
    const opts = ['<option value="">— nessuna —</option>']
      .concat(lists.map(l => `<option value="${safe(l.id)}">${safe(l.name)}</option>`))
      .join('');
    form.querySelectorAll('[data-trello-list]').forEach(sel => {
      sel.innerHTML = opts;
    });
    // Pre-seleziona da map o auto-match per nome (Da fare/In corso/Approvazione/Fatto)
    const autoMatch = (statusKey, hints) => {
      if (currentMap[statusKey]) return currentMap[statusKey];
      for (const h of hints) {
        const found = lists.find(l => l.name.toLowerCase().includes(h.toLowerCase()));
        if (found) return found.id;
      }
      return '';
    };
    const map = {
      todo:        autoMatch('todo',        ['da fare', 'todo', 'to do', 'backlog']),
      in_progress: autoMatch('in_progress', ['in corso', 'in_progress', 'doing', 'working']),
      blocked:     autoMatch('blocked',     ['approvazione', 'review', 'attesa', 'blocked']),
      done:        autoMatch('done',        ['fatto', 'done', 'completato']),
    };
    Object.entries(map).forEach(([k, v]) => {
      const sel = form.querySelector(`[name="trelloList_${k}"]`);
      if (sel) sel.value = v;
    });
  },
};

window.Contracts = Contracts;
