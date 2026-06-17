/* ============================================================
   WORKLOAD.JS — Timeline lavorazioni operatori (Vista A)
   Frontend-only: store IDB `workitems`.
   Specifica Tecnica v1.1 + team aziendali AD:
   - 3 sezioni: Board (founder) · Area Social · Area Web
   - Operatori multi-team (es. Mattia in social+web)
   - Multi-ruolo per operatore (workRoles[])
   - Avatar = foto profilo se presente, altrimenti iniziali colorate
   - Lane "Non assegnato" globale in cima
   ============================================================ */

const Workload = {

  AREAS: [
    { id: 'social',  label: 'Social',  color: '#c41284', icon: '📱' },
    { id: 'web',     label: 'Web',     color: '#2ec3f3', icon: '🌐' },
    { id: 'menu',    label: 'Menu',    color: '#fcd43c', icon: '🍽' },
    { id: 'grafica', label: 'Grafica', color: '#e91e8a', icon: '🎨' },
    { id: 'altro',   label: 'Altro',   color: '#6b6b6b', icon: '•'  },
  ],

  STATUSES: [
    { id: 'todo',        label: 'Da fare',     color: '#9ca3af' },
    { id: 'in_progress', label: 'In corso',    color: '#2563eb' },
    { id: 'blocked',     label: 'Bloccato',    color: '#dc2626' },
    { id: 'done',        label: 'Completata',  color: '#16a34a' },
    { id: 'cancelled',   label: 'Annullata',   color: '#6b6b6b' },
  ],

  /* Modalità di visualizzazione disponibili (selettore in toolbar).
     Persistenza in setting `workload_view_mode`. */
  VIEW_MODES: [
    { id: 'accordion',  label: 'Accordion',      icon: '☰', desc: 'Lista operatori con barra saturazione, espansione singola per il dettaglio (default raccomandato)' },
    { id: 'completa',   label: 'Vista completa', icon: '⊞', desc: 'Card per ogni lavorazione sulla griglia settimanale' },
    { id: 'heatmap',    label: 'Heatmap',        icon: '◫', desc: 'Riepilogo aggregato ore/task per cella' },
    { id: 'calendario', label: 'Calendario',     icon: '⏱', desc: 'Calendario verticale di un singolo operatore con blocchi orari' },
  ],

  /* Calendario Vista C — config orari */
  CAL_START_HOUR: 9,
  CAL_END_HOUR: 19,
  CAL_LUNCH_START: '13:00',
  CAL_LUNCH_END:   '14:00',
  CAL_DAILY_LIMIT_HOURS: 8,  // limite oltre cui scatta colore overload
  CAL_PX_PER_MINUTE: 1,      // 1px per minuto → 60px per ora; lunch 60px

  /* Palette cliente derivata da hash (per Vista C) */
  CLIENT_PALETTE: [
    { bg: '#CECBF6', fg: '#3C3489' }, // viola
    { bg: '#9FE1CB', fg: '#085041' }, // verde acqua
    { bg: '#FAC775', fg: '#633806' }, // ambra
    { bg: '#F4C0D1', fg: '#72243E' }, // rosa
    { bg: '#B6E0F4', fg: '#0E4A6E' }, // azzurro
    { bg: '#DCD0B4', fg: '#5A4317' }, // sabbia
  ],

  /* Team aziendali (sezioni della timeline, in ordine di visualizzazione) */
  TEAMS: [
    { id: 'board',               label: 'Board · Founder',               icon: '⚜', accent: '#1a1a1a' },
    { id: 'strategia_creativa',  label: 'Strategia & Direzione Creativa', icon: '✦', accent: '#F4C0D1' },
    { id: 'social',              label: 'Area Social',                   icon: '📱', accent: '#c41284' },
    { id: 'web',                 label: 'Area Web',                      icon: '🌐', accent: '#2ec3f3' },
  ],

  /* Ruoli azienda — chiave snake_case → palette + label */
  ROLE_PALETTE: {
    // Board / Founder (palette neutra scura)
    founder:              { bg: '#1a1a1a', fg: '#ffffff', label: 'Founder' },
    marketing_manager:    { bg: '#1a1a1a', fg: '#ffffff', label: 'Marketing Manager' },
    commerciale:          { bg: '#1a1a1a', fg: '#ffffff', label: 'Commerciale' },
    sales_manager:        { bg: '#1a1a1a', fg: '#ffffff', label: 'Sales Manager' },
    // Account / Creative direction (palette rosa)
    account:              { bg: '#F4C0D1', fg: '#72243E', label: 'Account' },
    direttore_creativo:   { bg: '#F4C0D1', fg: '#72243E', label: 'Direttore Creativo' },
    // Social (palette ambra)
    social_manager:       { bg: '#FAC775', fg: '#633806', label: 'Social Media Manager' },
    stagista_social:      { bg: '#FAC775', fg: '#633806', label: 'Stagista Social' },
    // Design (palette viola)
    graphic_designer:     { bg: '#CECBF6', fg: '#3C3489', label: 'Graphic Designer' },
    web_designer:         { bg: '#CECBF6', fg: '#3C3489', label: 'Web Designer' },
    // Developer (palette verde acqua)
    full_stack_developer: { bg: '#9FE1CB', fg: '#085041', label: 'Full Stack Developer' },
    // Legacy / generici
    designer:             { bg: '#CECBF6', fg: '#3C3489', label: 'Designer' },
    developer:            { bg: '#9FE1CB', fg: '#085041', label: 'Developer' },
    copy:                 { bg: '#FAC775', fg: '#633806', label: 'Copy' },
    admin:                { bg: '#1a1a1a', fg: '#ffffff', label: 'Admin' },
    operator:             { bg: '#e8e6e0', fg: '#1a1a1a', label: 'Operatore' },
    unassigned:           { bg: '#f5f4ef', fg: '#888780', label: 'Non assegnato' },
  },

  /* Seed team Abruzzo Digitale */
  TEAM_SEED: [
    // Esistenti: aggiorniamo workRoles/teams
    { username: 'luigi',    workRoles: ['marketing_manager', 'commerciale', 'sales_manager'], teams: ['board'],                  dailyCapacityHours: 8 },
    { username: 'mattia',   workRoles: ['account', 'direttore_creativo'],                     teams: ['strategia_creativa'],     dailyCapacityHours: 8 },
    // Nuovi
    { username: 'vincenzo', name: 'Vincenzo', password: 'changeme', role: 'operator', workRoles: ['social_manager', 'graphic_designer'], teams: ['social'],          dailyCapacityHours: 8 },
    { username: 'jessica',  name: 'Jessica',  password: 'changeme', role: 'operator', workRoles: ['social_manager', 'graphic_designer'], teams: ['social'],          dailyCapacityHours: 8 },
    { username: 'matteo',   name: 'Matteo',   password: 'changeme', role: 'operator', workRoles: ['web_designer'],                       teams: ['web'],             dailyCapacityHours: 8 },
    { username: 'orion',    name: 'Orion',    password: 'changeme', role: 'operator', workRoles: ['full_stack_developer'],               teams: ['web'],             dailyCapacityHours: 8 },
    { username: 'giulia',   name: 'Giulia',   password: 'changeme', role: 'operator', workRoles: ['stagista_social'],                    teams: ['social'],          dailyCapacityHours: 8 },
  ],

  // Stato interno
  _range: null,
  _operators: [],   // tutti gli operatori del team (con teams[].length > 0)
  _items: [],
  _clients: [],
  _thresholds: null,
  _viewMode: 'accordion',  // default raccomandato
  _calOperator: null,      // username operatore selezionato in Vista C
  _calDay: null,           // YYYY-MM-DD giorno selezionato in Vista C
  _accExpanded: null,      // username operatore espanso in Vista D
  _accDay: null,           // YYYY-MM-DD giorno in Vista D (default oggi)
  _accSort: 'default',     // 'default' | 'load' | 'name'
  _search: '',             // filtro live (title/cliente/operatore)

  // ===========================================================
  // ENTRY POINT
  // ===========================================================
  async render() {
    const root = document.getElementById('workloadRoot');
    if (!root) return;

    if (!this._range) this._range = this._weekRangeOf(new Date());
    await this._ensureTeamSeed();
    await this._loadData();
    await this._loadThresholds();
    await this._loadViewMode();

    if (this._operators.length === 0 && !(await this._hasUnassignedItems())) {
      root.innerHTML = `
        <div class="wl-empty">
          <div class="wl-empty__icon">👥</div>
          <h3>Nessun operatore configurato</h3>
          <p>Apri <b>⚙ Capacità</b> nella toolbar per assegnare ruoli e team agli utenti.</p>
        </div>`;
      return;
    }

    if (this._viewMode === 'accordion') {
      if (!this._accDay || !this._range.days.includes(this._accDay)) {
        const today = this._isoOf(new Date());
        this._accDay = this._range.days.includes(today) ? today : this._range.days[0];
      }
      root.innerHTML = `
        ${this._toolbarHtml()}
        ${this._accordionHtml()}
      `;
      this._bindToolbar();
      this._bindAccordion();
    } else if (this._viewMode === 'calendario') {
      if (!this._calOperator || !this._operators.find(o => o.username === this._calOperator)) {
        const me = State.currentUser;
        const defaultOp = (me && this._operators.find(o => o.username === me.username))
          || this._operators[0];
        this._calOperator = defaultOp ? defaultOp.username : null;
      }
      if (!this._calDay || !this._range.days.includes(this._calDay)) {
        const today = this._isoOf(new Date());
        this._calDay = this._range.days.includes(today) ? today : this._range.days[0];
      }
      root.innerHTML = `
        ${this._toolbarHtml()}
        ${this._calendarHtml()}
      `;
      this._bindToolbar();
      this._bindCalendar();
    } else {
      const gridHtml = this._viewMode === 'heatmap'
        ? this._gridHtmlHeatmap()
        : this._gridHtml();
      root.innerHTML = `
        ${this._toolbarHtml()}
        ${this._legendHtml()}
        <div class="wl-grid-wrap">
          ${gridHtml}
        </div>
        ${this._footerHtml()}
      `;
      this._bindToolbar();
      if (this._viewMode === 'heatmap') {
        this._bindHeatmapCells();
      } else {
        this._bindCards();
      }
    }
  },

  // ===========================================================
  // SEED TEAM ABRUZZO DIGITALE
  // Idempotente: ai primi accessi alla vista aggiorna gli
  // utenti esistenti + crea i nuovi se mancano. Marcatura via
  // setting per non ripetere update destructive ad ogni render.
  // ===========================================================
  async _ensureTeamSeed() {
    const seeded = await DB.getSetting('workload_team_seeded_v3', false);
    if (seeded) return;
    const usersRaw = await DB.all('users');

    // Mappa username → tutte le copie (per merge multi-record da sync)
    const byUsername = new Map();
    for (const u of usersRaw) {
      if (!u || !u.username) continue;
      const arr = byUsername.get(u.username) || [];
      arr.push(u);
      byUsername.set(u.username, arr);
    }

    for (const seed of this.TEAM_SEED) {
      const copies = byUsername.get(seed.username);
      if (copies && copies.length > 0) {
        // Aggiorna TUTTE le copie esistenti (per coerenza dopo dedup)
        for (const u of copies) {
          // Mantieni nome/password/role esistenti, sovrascrivi solo workRoles/teams/dailyCapacityHours
          u.workRoles         = seed.workRoles;
          u.workRole          = seed.workRoles[0]; // legacy
          u.teams             = seed.teams;
          if (u.dailyCapacityHours == null) u.dailyCapacityHours = seed.dailyCapacityHours;
          u.updatedAt = new Date().toISOString();
          await DB.put('users', u);
        }
      } else if (seed.name) {
        // Crea nuovo utente
        await DB.put('users', {
          username:           seed.username,
          name:               seed.name,
          password:           seed.password,
          role:               seed.role,
          workRoles:          seed.workRoles,
          workRole:           seed.workRoles[0],
          teams:              seed.teams,
          dailyCapacityHours: seed.dailyCapacityHours,
          createdAt:          new Date().toISOString(),
          updatedAt:          new Date().toISOString(),
        });
      }
    }
    // Cleanup account legacy non più nel team (Lisa, Team, operatore).
    // Vengono rimossi se: (a) non sono nel TEAM_SEED, (b) non hanno teams,
    // (c) non sono l'utente attualmente loggato.
    const seedUsernames = new Set(this.TEAM_SEED.map(s => s.username));
    const meUsername = State.currentUser && State.currentUser.username;
    const usersAfterSeed = await DB.all('users');
    for (const u of usersAfterSeed) {
      if (!u || !u.username) continue;
      if (seedUsernames.has(u.username)) continue;
      if (u.username === meUsername) continue;
      const hasTeams = Array.isArray(u.teams) && u.teams.length > 0;
      if (hasTeams) continue;
      // Eliminazione: include tutte le copie con quel username (dedup IDB)
      if (u.id != null) await DB.delete('users', u.id);
    }
    await DB.setSetting('workload_team_seeded_v3', true);
  },

  // ===========================================================
  // DATA
  // ===========================================================
  async _loadData() {
    const usersRaw = await DB.all('users');
    const me = State.currentUser;
    const isAdmin = window.Roles && Roles.isAdmin();

    // Dedup per username (in IDB possono esistere copie locali + sync)
    const usersMap = new Map();
    for (const u of usersRaw) {
      if (!u || !u.username) continue;
      const existing = usersMap.get(u.username);
      // Merge: prendi la copia più recente; se manca workRoles/teams ma
      // un'altra copia li ha, fai un merge difensivo
      if (!existing) {
        usersMap.set(u.username, u);
      } else {
        const newer = (u.updatedAt || '') > (existing.updatedAt || '') ? u : existing;
        const older = newer === u ? existing : u;
        // Backfill solo se la più recente non li ha
        if (!Array.isArray(newer.workRoles) || newer.workRoles.length === 0) {
          if (Array.isArray(older.workRoles) && older.workRoles.length > 0) newer.workRoles = older.workRoles;
        }
        if (!Array.isArray(newer.teams) || newer.teams.length === 0) {
          if (Array.isArray(older.teams) && older.teams.length > 0) newer.teams = older.teams;
        }
        if (newer.dailyCapacityHours == null && older.dailyCapacityHours != null) {
          newer.dailyCapacityHours = older.dailyCapacityHours;
        }
        if (!newer.avatar && older.avatar) newer.avatar = older.avatar;
        usersMap.set(u.username, newer);
      }
    }
    const users = [...usersMap.values()];

    // Operatori del team = quelli con almeno un team assegnato.
    // Esclude account legacy/test (Lisa, Team, "operatore" generico).
    let ops = users.filter(u => Array.isArray(u.teams) && u.teams.length > 0);
    ops.sort((a, b) => {
      if (me && a.username === me.username) return -1;
      if (me && b.username === me.username) return 1;
      return (a.name || a.username || '').localeCompare(b.name || b.username || '');
    });
    // Operatore non-admin vede SOLO la sua lane
    this._operators = isAdmin ? ops : ops.filter(u => me && u.username === me.username);

    this._clients = await DB.all('clients');

    const allItems = await DB.all('workitems');
    const { from, to } = this._range;
    let rangeItems = allItems.filter(w =>
      !w._deleted &&
      w.status !== 'cancelled' &&
      w.scheduledDate >= from && w.scheduledDate <= to
    );
    // Applica filtro search (live)
    if (this._search && this._search.trim()) {
      rangeItems = rangeItems.filter(w => this._matchSearch(w));
    }
    this._items = rangeItems;
  },

  /** Verifica se un workitem matcha la query di search (title/cliente/operatore) */
  _matchSearch(w) {
    const q = (this._search || '').trim().toLowerCase();
    if (!q) return true;
    const hay = [
      w.title || '',
      w.clientName || '',
      w.description || '',
      w.area || '',
    ].join(' ').toLowerCase();
    // Match anche su nome operatore
    const op = w.assignedTo ? this._operators.find(o => o.username === w.assignedTo) : null;
    const opName = op ? (op.name || op.username || '').toLowerCase() : '';
    return hay.includes(q) || opName.includes(q) || (w.assignedTo || '').toLowerCase().includes(q);
  },

  async _hasUnassignedItems() {
    const all = await DB.all('workitems');
    return all.some(w => !w._deleted && w.status !== 'cancelled' && !w.assignedTo);
  },

  async _loadThresholds() {
    this._thresholds = {
      warn:  Number(await DB.getSetting('workload_warning_pct',   90)) || 90,
      over:  Number(await DB.getSetting('workload_overload_pct', 100)) || 100,
      under: Number(await DB.getSetting('workload_underload_pct', 50)) || 50,
    };
  },

  async _loadViewMode() {
    // Default raccomandato dalla Specifica Tecnica: 'accordion' (Vista D)
    const v = await DB.getSetting('workload_view_mode', 'accordion');
    this._viewMode = this._validViewMode(v);
  },
  async _setViewMode(mode) {
    this._viewMode = this._validViewMode(mode);
    await DB.setSetting('workload_view_mode', this._viewMode);
  },
  _validViewMode(m) {
    return this.VIEW_MODES.some(v => v.id === m) ? m : 'accordion';
  },

  // ===========================================================
  // CAPACITÀ
  // ===========================================================
  _dailyCapacityOf(op) {
    if (!op) return 8;
    const v = Number(op.dailyCapacityHours);
    return (v > 0 && v <= 24) ? v : 8;
  },
  _weeklyCapacityOf(op) {
    return this._dailyCapacityOf(op) * 5;
  },
  _workRolesOf(op) {
    if (Array.isArray(op.workRoles) && op.workRoles.length > 0) return op.workRoles;
    if (op.workRole) return [op.workRole];
    if (op.role)     return [op.role];
    return ['operator'];
  },
  _teamsOf(op) {
    return Array.isArray(op.teams) ? op.teams : [];
  },
  /** Chiave palette dal primo workRole (per avatar) */
  _primaryRoleKey(op) {
    const roles = this._workRolesOf(op);
    const first = (roles[0] || '').toLowerCase();
    if (this.ROLE_PALETTE[first]) return first;
    if (first === 'super_admin') return 'admin';
    return first || 'operator';
  },
  _rolesLabel(op) {
    return this._workRolesOf(op)
      .map(r => (this.ROLE_PALETTE[r] && this.ROLE_PALETTE[r].label) || r)
      .join(' · ');
  },

  // ===========================================================
  // DATE
  // ===========================================================
  _isoOf(d) {
    const dt = (d instanceof Date) ? d : new Date(d);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },
  _weekRangeOf(refDate) {
    const d = new Date(refDate);
    const dow = d.getDay();
    const mondayOffset = (dow === 0 ? -6 : 1 - dow);
    const monday = new Date(d);
    monday.setDate(d.getDate() + mondayOffset);
    monday.setHours(0, 0, 0, 0);
    const days = [];
    for (let i = 0; i < 5; i++) {
      const cur = new Date(monday);
      cur.setDate(monday.getDate() + i);
      days.push(this._isoOf(cur));
    }
    return { from: days[0], to: days[days.length - 1], days };
  },
  _shiftRange(weeks) {
    const cur = new Date(this._range.from);
    cur.setDate(cur.getDate() + weeks * 7);
    this._range = this._weekRangeOf(cur);
  },
  _fmtDayHeader(iso) {
    const d = new Date(iso);
    const wd = d.toLocaleDateString('it-IT', { weekday: 'short' }).replace('.', '');
    return { weekday: wd.charAt(0).toUpperCase() + wd.slice(1), day: d.getDate(), month: d.toLocaleDateString('it-IT', { month: 'short' }).replace('.', '') };
  },
  _fmtRangeLabel() {
    const a = new Date(this._range.from);
    const b = new Date(this._range.to);
    const fmt = d => d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
    return `${fmt(a)} → ${fmt(b)} ${b.getFullYear()}`;
  },
  _isoWeek(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  },

  // ===========================================================
  // CARICO
  // ===========================================================
  _itemsOfCell(opUsername, day) {
    if (opUsername === '__unassigned__') {
      return this._items.filter(w => !w.assignedTo && w.scheduledDate === day);
    }
    return this._items.filter(w => w.assignedTo === opUsername && w.scheduledDate === day);
  },
  _hoursOfCell(opUsername, day) {
    return this._itemsOfCell(opUsername, day).reduce((s, w) => s + (Number(w.weightHours) || 0), 0);
  },
  _cellStatus(hours, capacity) {
    if (hours === 0) return 'empty';
    if (!capacity) return 'ok';
    const pct = (hours / capacity) * 100;
    const t = this._thresholds;
    if (pct > t.over)  return 'overload';
    if (pct >= t.warn) return 'warning';
    if (pct < t.under) return 'underload';
    return 'ok';
  },

  // ===========================================================
  // HTML
  // ===========================================================
  _toolbarHtml() {
    const isAdmin = window.Roles && Roles.isAdmin();
    const weekNum = this._isoWeek(new Date(this._range.from));
    const viewToggle = this.VIEW_MODES.map(v => `
      <button class="wl-view-btn ${this._viewMode === v.id ? 'is-active' : ''}" data-view-mode="${v.id}" title="${v.desc}">
        <span class="wl-view-btn__icon">${v.icon}</span>${v.label}
      </button>
    `).join('');
    return `
      <div class="wl-toolbar">
        <div class="wl-toolbar__left">
          <button class="btn btn--ghost btn--sm" data-act="prev"  title="Settimana precedente">‹</button>
          <span class="wl-week-label">Sett. ${weekNum}</span>
          <button class="btn btn--ghost btn--sm" data-act="next"  title="Settimana successiva">›</button>
          <button class="btn btn--ghost btn--sm" data-act="today" title="Torna a questa settimana">Oggi</button>
          <span class="wl-range">${this._fmtRangeLabel()}</span>
        </div>
        <div class="wl-toolbar__right">
          <div class="wl-search" role="search">
            <svg class="wl-search__icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="search" id="wlSearchInput" class="wl-search__input" placeholder="Cerca task, cliente, operatore…" value="${(this._search || '').replace(/"/g, '&quot;')}" autocomplete="off">
            ${this._search ? '<button class="wl-search__clear" data-act="search-clear" title="Pulisci ricerca">×</button>' : ''}
          </div>
          <div class="wl-view-toggle" role="group" aria-label="Modalità di visualizzazione">${viewToggle}</div>
          ${isAdmin ? `<button class="btn btn--ghost btn--sm" data-act="capacity" title="Team, ruoli e capacità operatori">⚙ Team & Capacità</button>` : ''}
          <button class="btn btn--primary btn--sm" data-act="new" title="Crea nuova lavorazione">+ Nuova lavorazione</button>
        </div>
      </div>
    `;
  },

  _legendHtml() {
    return `
      <div class="wl-legend">
        <span class="wl-legend__chip wl-legend__chip--ok"><span class="wl-legend__dot"></span>Sotto capacità</span>
        <span class="wl-legend__chip wl-legend__chip--warning"><span class="wl-legend__dot"></span>Vicino al limite</span>
        <span class="wl-legend__chip wl-legend__chip--overload"><span class="wl-legend__dot"></span>Overbooking</span>
        <span class="wl-legend__chip wl-legend__chip--underload"><span class="wl-legend__dot"></span>Sotto utilizzo</span>
      </div>
    `;
  },

  _gridHtml() {
    const isAdmin = window.Roles && Roles.isAdmin();
    const cols = this._range.days.length;
    const headerDays = this._range.days.map(iso => {
      const h = this._fmtDayHeader(iso);
      const isToday = iso === this._isoOf(new Date());
      return `
        <div class="wl-h-day ${isToday ? 'is-today' : ''}">
          <span class="wl-h-day__wd">${h.weekday}</span>
          <span class="wl-h-day__date">${h.day}</span>
          <small class="wl-h-day__mo">${h.month}</small>
        </div>`;
    }).join('');

    const unassignedLane = isAdmin ? this._unassignedLaneHtml() : '';

    // Raggruppa operatori per team (un op può apparire in più team)
    const sections = this.TEAMS.map(team => {
      const teamOps = this._operators.filter(o => this._teamsOf(o).includes(team.id));
      if (teamOps.length === 0) return '';
      const header = `
        <div class="wl-team-header" style="--wl-team:${team.accent};grid-column:1 / -1">
          <span class="wl-team-header__icon">${team.icon}</span>
          <span class="wl-team-header__label">${team.label}</span>
          <span class="wl-team-header__count">${teamOps.length} ${teamOps.length === 1 ? 'membro' : 'membri'}</span>
        </div>`;
      const lanes = teamOps.map(op => this._laneHtml(op)).join('');
      return header + lanes;
    }).join('');

    return `
      <div class="wl-grid" style="--wl-days:${cols}">
        <div class="wl-h-op">Operatore</div>
        ${headerDays}
        ${unassignedLane}
        ${sections}
      </div>
    `;
  },

  // ===========================================================
  // VISTA B — HEATMAP (riepilogo aggregato)
  // ===========================================================
  _gridHtmlHeatmap() {
    const isAdmin = window.Roles && Roles.isAdmin();
    const cols = this._range.days.length;
    const headerDays = this._range.days.map(iso => {
      const h = this._fmtDayHeader(iso);
      const isToday = iso === this._isoOf(new Date());
      return `
        <div class="wl-h-day ${isToday ? 'is-today' : ''}">
          <span class="wl-h-day__wd">${h.weekday}</span>
          <span class="wl-h-day__date">${h.day}</span>
          <small class="wl-h-day__mo">${h.month}</small>
        </div>`;
    }).join('');

    const unassignedLane = isAdmin ? this._unassignedLaneHtmlHeatmap() : '';

    const sections = this.TEAMS.map(team => {
      const teamOps = this._operators.filter(o => this._teamsOf(o).includes(team.id));
      if (teamOps.length === 0) return '';
      const header = `
        <div class="wl-team-header" style="--wl-team:${team.accent};grid-column:1 / -1">
          <span class="wl-team-header__icon">${team.icon}</span>
          <span class="wl-team-header__label">${team.label}</span>
          <span class="wl-team-header__count">${teamOps.length} ${teamOps.length === 1 ? 'membro' : 'membri'}</span>
        </div>`;
      const lanes = teamOps.map(op => this._heatmapLaneHtml(op)).join('');
      return header + lanes;
    }).join('');

    return `
      <div class="wl-grid wl-grid--heatmap" style="--wl-days:${cols}">
        <div class="wl-h-op">Operatore</div>
        ${headerDays}
        <div class="wl-h-total">Totale</div>
        ${unassignedLane}
        ${sections}
      </div>
    `;
  },

  _heatmapLaneHtml(op) {
    const cells = this._range.days.map(day => this._heatmapCellHtml(op, day)).join('');
    const rolesLabel = this._rolesLabel(op);
    // Conteggio task settimanali dell'operatore
    let weekTaskCount = 0;
    let weekHours = 0;
    for (const d of this._range.days) {
      const items = this._itemsOfCell(op.username, d);
      weekTaskCount += items.length;
      weekHours += items.reduce((s, w) => s + (Number(w.weightHours) || 0), 0);
    }
    const weeklyCap = this._weeklyCapacityOf(op);
    return `
      <div class="wl-lane-op">
        ${this._avatarHtml(op)}
        <div class="wl-lane-op__info">
          <div class="wl-lane-op__name">${(op.name || op.username || '—').replace(/[<>]/g, '')}</div>
          <div class="wl-lane-op__role" title="${rolesLabel.replace(/"/g, '&quot;')}">${rolesLabel}</div>
          <div class="wl-lane-op__cap">${weekTaskCount} ${weekTaskCount === 1 ? 'task' : 'task'} sett.</div>
        </div>
      </div>
      ${cells}
      <div class="wl-cell wl-cell--total">
        <div class="wl-heat__hours wl-heat__hours--total">${this._fmtH(weekHours)}h</div>
        <div class="wl-heat__meta">su ${weeklyCap}h</div>
      </div>
    `;
  },

  _unassignedLaneHtmlHeatmap() {
    const totalUnassigned = this._range.days.reduce((s, d) => s + this._hoursOfCell('__unassigned__', d), 0);
    const totalTasks = this._range.days.reduce((s, d) => s + this._itemsOfCell('__unassigned__', d).length, 0);
    const cells = this._range.days.map(day => this._heatmapCellHtml({ username: '__unassigned__', _unassigned: true }, day)).join('');
    return `
      <div class="wl-lane-op wl-lane-op--unassigned">
        <span class="wl-avatar wl-avatar--unassigned">?</span>
        <div class="wl-lane-op__info">
          <div class="wl-lane-op__name">Non assegnato</div>
          <div class="wl-lane-op__role">${totalTasks > 0 ? totalTasks + ' task da distribuire' : 'Vuoto'}</div>
        </div>
      </div>
      ${cells}
      <div class="wl-cell wl-cell--total">
        <div class="wl-heat__hours wl-heat__hours--total">${totalUnassigned > 0 ? this._fmtH(totalUnassigned) + 'h' : '—'}</div>
        <div class="wl-heat__meta">${totalTasks} task</div>
      </div>
    `;
  },

  _heatmapCellHtml(op, day) {
    const isUnassigned = op._unassigned || op.username === '__unassigned__';
    const items = this._itemsOfCell(op.username, day);
    const hours = items.reduce((s, w) => s + (Number(w.weightHours) || 0), 0);
    const capacity = isUnassigned ? 0 : this._dailyCapacityOf(op);
    const status = isUnassigned ? (items.length === 0 ? 'empty' : 'unassigned') : this._cellStatus(hours, capacity);
    const isToday = day === this._isoOf(new Date());
    const pct = capacity > 0 ? Math.round((hours / capacity) * 100) : null;
    const taskCount = items.length;

    if (items.length === 0 && !isUnassigned) {
      // Cella vuota: trattino centrato
      return `
        <div class="wl-cell wl-heat wl-heat--empty ${isToday ? 'is-today' : ''}" data-op="${op.username}" data-day="${day}">
          <div class="wl-heat__hours wl-heat__hours--empty">—</div>
          <div class="wl-heat__meta">0 task</div>
        </div>
      `;
    }

    const overload = status === 'overload';
    return `
      <div class="wl-cell wl-heat wl-heat--${status} ${isToday ? 'is-today' : ''}" data-op="${op.username}" data-day="${day}" title="${taskCount} task${pct != null ? ' · ' + pct + '%' : ''} — click per dettaglio">
        <div class="wl-heat__hours">${this._fmtH(hours)}h${overload ? ' ⚠' : ''}</div>
        <div class="wl-heat__meta">${taskCount} ${taskCount === 1 ? 'task' : 'task'}${pct != null ? ' · ' + pct + '%' : ''}</div>
      </div>
    `;
  },

  _bindHeatmapCells() {
    document.querySelectorAll('#workloadRoot .wl-heat:not(.wl-heat--empty)').forEach(cell => {
      cell.addEventListener('click', async () => {
        // Click cella heatmap → drill-down in Vista C calendario di quell'op×giorno
        const op = cell.dataset.op;
        const day = cell.dataset.day;
        if (op && op !== '__unassigned__') {
          this._calOperator = op;
          this._calDay = day;
          await this._setViewMode('calendario');
          await this.render();
        }
      });
    });
  },

  // ===========================================================
  // VISTA C — CALENDARIO SINGOLO OPERATORE
  // ===========================================================
  _calMinutesFromHHMM(hhmm) {
    if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return null;
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  },
  _calHHMMFromMinutes(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  },
  _calDayStart() { return this.CAL_START_HOUR * 60; },
  _calDayEnd()   { return this.CAL_END_HOUR * 60; },
  _calLunchStart() { return this._calMinutesFromHHMM(this.CAL_LUNCH_START); },
  _calLunchEnd()   { return this._calMinutesFromHHMM(this.CAL_LUNCH_END); },
  _calDurationMinOfItem(w) {
    return Math.max(10, Math.round((Number(w.weightHours) || 0.5) * 60));
  },
  /** Calcola layout giornaliero: per ogni item assegna { startMin, endMin }.
      Item con startTime esplicito → posizione fissa. Senza startTime →
      auto-stack dal mattino, skippando la pausa pranzo. */
  _calLayoutDay(items) {
    const layout = [];
    const dayStart = this._calDayStart();
    const dayEnd   = this._calDayEnd();
    const lunchS   = this._calLunchStart();
    const lunchE   = this._calLunchEnd();
    // 1) Item con startTime: posizione fissa (manuale)
    const fixed = items
      .filter(w => w.startTime)
      .map(w => {
        const startMin = this._calMinutesFromHHMM(w.startTime) || dayStart;
        const dur      = this._calDurationMinOfItem(w);
        return { item: w, startMin, endMin: startMin + dur };
      })
      .sort((a, b) => a.startMin - b.startMin);
    fixed.forEach(b => layout.push(b));
    // 2) Item senza startTime: auto-stack dopo l'ultimo libero, skippa lunch
    const unscheduled = items.filter(w => !w.startTime);
    let cursor = dayStart;
    const occupied = (start, end) => {
      // Considera fixed + lunch come ostacoli
      const blocks = [...layout.map(b => ({ s: b.startMin, e: b.endMin })),
                      { s: lunchS, e: lunchE }];
      return blocks.some(b => !(end <= b.s || start >= b.e));
    };
    const nextFreeFrom = (start, dur) => {
      let s = Math.max(start, dayStart);
      while (s + dur <= dayEnd + 240 /* permette overflow oltre limite */) {
        if (!occupied(s, s + dur)) return s;
        // Sposta cursor dopo il prossimo ostacolo
        const blocks = [...layout.map(b => ({ s: b.startMin, e: b.endMin })),
                        { s: lunchS, e: lunchE }]
          .filter(b => b.e > s)
          .sort((a, b) => a.s - b.s);
        if (blocks.length === 0) return s;
        s = blocks[0].e;
      }
      return s;
    };
    for (const w of unscheduled) {
      const dur = this._calDurationMinOfItem(w);
      const startMin = nextFreeFrom(cursor, dur);
      layout.push({ item: w, startMin, endMin: startMin + dur, auto: true });
      cursor = startMin + dur;
      if (cursor >= lunchS && cursor < lunchE) cursor = lunchE;
    }
    return layout.sort((a, b) => a.startMin - b.startMin);
  },
  /** Genera la palette cliente in modo deterministico dall'id/nome */
  _clientPaletteOf(clientKey) {
    if (!clientKey) return this.CLIENT_PALETTE[5]; // sabbia default
    const key = String(clientKey);
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
    const idx = Math.abs(h) % this.CLIENT_PALETTE.length;
    return this.CLIENT_PALETTE[idx];
  },
  _clientShortLabel(name) {
    if (!name) return '?';
    return name.split(/\s+/).slice(0, 2).map(p => p.toUpperCase()).join(' ').slice(0, 10);
  },

  _calendarHtml() {
    const op = this._operators.find(o => o.username === this._calOperator);
    if (!op) {
      return `<div class="wl-empty"><h3>Seleziona un operatore</h3><p>Nessun operatore disponibile per la vista calendario.</p></div>`;
    }
    return `
      ${this._calHeaderHtml(op)}
      ${this._calStripHtml(op)}
      ${this._calBodyHtml(op)}
      ${this._calLegendHtml(op)}
    `;
  },

  _calHeaderHtml(op) {
    const palette = this.ROLE_PALETTE[this._primaryRoleKey(op)] || this.ROLE_PALETTE.operator;
    const initials = (op.name || op.username || '?').split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();
    const dayItems = this._itemsOfCell(op.username, this._calDay);
    const totalH = dayItems.reduce((s, w) => s + (Number(w.weightHours) || 0), 0);
    const cap = this._dailyCapacityOf(op);
    const status = this._cellStatus(totalH, cap);
    const statusLabel = {
      overload:  'overbooking', warning: 'al limite',
      ok:        'in linea',    underload: 'scarico', empty: 'libero',
    }[status] || '';
    const statusClass = `wl-cal-status wl-cal-status--${status}`;
    const dayDate = new Date(this._calDay);
    const dayLabel = dayDate.toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'short' }).replace('.', '');
    const rolesLabel = this._rolesLabel(op);
    return `
      <div class="wl-cal-header">
        <div class="wl-cal-header__left">
          <button class="btn btn--ghost btn--sm" data-act="cal-op-prev" title="Operatore precedente">←</button>
          ${op.avatar
            ? `<span class="wl-avatar wl-avatar--lg wl-avatar--photo" style="background:${palette.bg}"><img src="${op.avatar}" alt=""></span>`
            : `<span class="wl-avatar wl-avatar--lg" style="background:${palette.bg};color:${palette.fg}">${initials}</span>`}
          <div class="wl-cal-header__info">
            <div class="wl-cal-header__name">${(op.name || op.username).replace(/[<>]/g,'')} · <span style="color:var(--ad-mute);font-weight:500">${rolesLabel.split(' · ')[0]}</span></div>
            <div class="wl-cal-header__meta">${dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1)} · ${dayItems.length} ${dayItems.length === 1 ? 'task' : 'task'} · ${this._fmtH(totalH)}h/${cap}h${statusLabel ? ` <span class="${statusClass}">${statusLabel}</span>` : ''}</div>
          </div>
          <button class="btn btn--ghost btn--sm" data-act="cal-op-next" title="Operatore successivo">→</button>
        </div>
        <div class="wl-cal-header__right">
          <button class="btn btn--ghost btn--sm" data-act="prev" title="Settimana precedente">‹</button>
          <button class="btn btn--ghost btn--sm" data-act="today" title="Torna a oggi">Oggi</button>
          <button class="btn btn--ghost btn--sm" data-act="next" title="Settimana successiva">›</button>
        </div>
      </div>
    `;
  },

  _calStripHtml(op) {
    const todayIso = this._isoOf(new Date());
    const cards = this._range.days.map(iso => {
      const h = this._fmtDayHeader(iso);
      const items = this._itemsOfCell(op.username, iso);
      const hours = items.reduce((s, w) => s + (Number(w.weightHours) || 0), 0);
      const cap = this._dailyCapacityOf(op);
      const status = this._cellStatus(hours, cap);
      const isSelected = iso === this._calDay;
      const isToday    = iso === todayIso;
      const metaCls    = `wl-cal-strip__meta wl-cal-strip__meta--${status}`;
      return `
        <button class="wl-cal-strip__day ${isSelected ? 'is-selected' : ''} ${isToday ? 'is-today' : ''}" data-cal-day="${iso}" type="button">
          <div class="wl-cal-strip__wd">${h.weekday}</div>
          <div class="wl-cal-strip__date">${h.day}</div>
          <div class="${metaCls}">${items.length === 0 ? '— · 0 task' : `${this._fmtH(hours)}h · ${items.length} task`}</div>
        </button>`;
    }).join('');
    return `<div class="wl-cal-strip">${cards}</div>`;
  },

  _calBodyHtml(op) {
    const items = this._itemsOfCell(op.username, this._calDay);
    const layout = this._calLayoutDay(items);
    const startMin = this._calDayStart();
    const endMin   = this._calDayEnd();
    const lunchS   = this._calLunchStart();
    const lunchE   = this._calLunchEnd();
    const cap      = this._dailyCapacityOf(op);
    const limitMin = startMin + cap * 60 + (lunchE - lunchS);  // include pausa pranzo nello scorrimento orario

    // Asse delle ore: ogni ora 60px (px-per-minuto = 1)
    const hourRows = [];
    for (let h = this.CAL_START_HOUR; h <= this.CAL_END_HOUR; h++) {
      const isOver = (h * 60) > limitMin;
      const isLunch = (h * 60) >= lunchS && (h * 60) < lunchE;
      hourRows.push(`<div class="wl-cal-hour ${isOver ? 'is-over' : ''} ${isLunch ? 'is-lunch' : ''}">${String(h).padStart(2,'0')}:00</div>`);
    }
    // Pausa pranzo come riga ridotta visiva: la lasciamo come ora normale ma marcata.
    // Box altezza totale = (endMin - startMin) px
    const bodyHeight = (endMin - startMin);
    const limitOffsetPx = limitMin - startMin;

    // Blocchi eventi
    const blocks = layout.map(b => {
      const top = Math.max(0, b.startMin - startMin);
      const height = Math.max(12, b.endMin - b.startMin);
      const w = b.item;
      const overLimit = (b.startMin >= limitMin);
      const palette = this._clientPaletteOf(w.clientId || w.clientName || 'no-client');
      const isUrgent = (this._dueClass(w.dueDate, w.status) === 'wl-due--urgent' || this._dueClass(w.dueDate, w.status) === 'wl-due--late');
      const clientShort = (w.clientName || '').toUpperCase();
      const durMin = b.endMin - b.startMin;
      const durLabel = durMin >= 60 ? `${Math.floor(durMin/60)}h${durMin % 60 ? ' ' + (durMin % 60) + 'm' : ''}` : `${durMin}m`;
      const tooManyLines = height < 30;
      return `
        <div class="wl-cal-block ${overLimit ? 'is-over-limit' : ''} ${isUrgent ? 'is-urgent' : ''} ${b.auto ? 'is-auto' : ''}"
             style="top:${top}px;height:${height}px;background:${overLimit ? '#F7C1C1' : palette.bg};color:${overLimit ? '#791F1F' : palette.fg}"
             data-id="${w.id}" data-syncid="${w.syncId || ''}"
             title="${clientShort ? '[' + clientShort + '] ' : ''}${(w.title||'').replace(/"/g,'&quot;')} · ${durLabel}${isUrgent ? ' 🚩' : ''}${b.auto ? ' · auto' : ''}">
          ${tooManyLines
            ? `<div class="wl-cal-block__short">${clientShort ? '[' + clientShort + '] ' : ''}${(w.title || '').replace(/[<>]/g,'')} · ${durLabel}</div>`
            : `<div class="wl-cal-block__head">${clientShort ? '[' + clientShort + '] ' : ''}· ${durLabel}${isUrgent ? ' 🚩' : ''}</div>
               <div class="wl-cal-block__title">${(w.title || '').replace(/[<>]/g,'')}</div>`}
        </div>
      `;
    }).join('');

    // Striscia pausa pranzo (dashed)
    const lunchTop = lunchS - startMin;
    const lunchHeight = lunchE - lunchS;

    return `
      <div class="wl-cal-body">
        <div class="wl-cal-axis">${hourRows.join('')}</div>
        <div class="wl-cal-events" style="height:${bodyHeight}px">
          <div class="wl-cal-lunch" style="top:${lunchTop}px;height:${lunchHeight}px">pausa pranzo</div>
          ${limitOffsetPx > 0 && limitOffsetPx < bodyHeight ? `<div class="wl-cal-limit" style="top:${limitOffsetPx}px">limite ${cap}h →</div>` : ''}
          ${blocks}
        </div>
      </div>
    `;
  },

  _calLegendHtml(op) {
    // Cliente attivi nella giornata + chip oltre limite
    const items = this._itemsOfCell(op.username, this._calDay);
    const byClient = new Map();
    for (const w of items) {
      const key = w.clientName || '— Senza cliente —';
      byClient.set(key, (byClient.get(key) || 0) + 1);
    }
    const chips = [...byClient.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => {
        const palette = this._clientPaletteOf(name);
        return `<span class="wl-cal-legend__chip" style="--chip-bg:${palette.bg}"><span class="wl-cal-legend__dot"></span>${name.replace(/[<>]/g,'')} (${count} ${count === 1 ? 'task' : 'task'})</span>`;
      }).join('');
    return `
      <div class="wl-cal-legend">
        ${chips || '<span class="wl-cal-legend__chip wl-cal-legend__chip--empty">Nessuna lavorazione per questo giorno.</span>'}
        <span class="wl-cal-legend__chip wl-cal-legend__chip--over"><span class="wl-cal-legend__dot wl-cal-legend__dot--over"></span>Oltre limite</span>
      </div>
    `;
  },

  _bindCalendar() {
    const root = document.getElementById('workloadRoot');
    if (!root) return;
    // Cambia operatore
    root.querySelector('[data-act="cal-op-prev"]')?.addEventListener('click', () => this._shiftCalOperator(-1));
    root.querySelector('[data-act="cal-op-next"]')?.addEventListener('click', () => this._shiftCalOperator(1));
    // Strip giorni
    root.querySelectorAll('[data-cal-day]').forEach(btn => {
      btn.addEventListener('click', async () => {
        this._calDay = btn.dataset.calDay;
        await this.render();
      });
    });
    // Click blocco → modale dettaglio
    root.querySelectorAll('.wl-cal-block').forEach(b => {
      b.addEventListener('click', () => {
        const id = parseInt(b.dataset.id, 10);
        if (id) this.openDetailModal(id);
      });
    });
  },
  _shiftCalOperator(dir) {
    if (this._operators.length === 0) return;
    const idx = this._operators.findIndex(o => o.username === this._calOperator);
    const next = (idx + dir + this._operators.length) % this._operators.length;
    this._calOperator = this._operators[next].username;
    this.render();
  },

  // ===========================================================
  // VISTA D — ACCORDION IBRIDO (default raccomandato)
  // ===========================================================
  _accordionHtml() {
    const isAdmin = window.Roles && Roles.isAdmin();
    // Header con sub-info giorno + sort + assegna
    const dayDate = new Date(this._accDay);
    const dayLabel = dayDate.toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'short' }).replace('.', '');
    const dayLabelCap = dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1);

    // Strip giorni veloce (orientato a Vista D: barra giorni piccola)
    const todayIso = this._isoOf(new Date());
    const stripDays = this._range.days.map(iso => {
      const h = this._fmtDayHeader(iso);
      const isSelected = iso === this._accDay;
      const isToday    = iso === todayIso;
      return `
        <button class="wl-acc-strip-day ${isSelected ? 'is-selected' : ''} ${isToday ? 'is-today' : ''}" data-acc-day="${iso}" type="button">
          <span class="wl-acc-strip-day__wd">${h.weekday}</span>
          <span class="wl-acc-strip-day__date">${h.day}</span>
        </button>`;
    }).join('');

    // Ordina operatori (per Vista D)
    const ops = this._operators.slice();
    if (this._accSort === 'load') {
      ops.sort((a, b) => {
        const la = this._hoursOfCell(a.username, this._accDay) / this._dailyCapacityOf(a);
        const lb = this._hoursOfCell(b.username, this._accDay) / this._dailyCapacityOf(b);
        return lb - la;
      });
    } else if (this._accSort === 'name') {
      ops.sort((a, b) => (a.name || a.username).localeCompare(b.name || b.username));
    }
    // 'default': mantieni ordine team-based (raggruppato)

    const lanes = ops.map(op => this._accLaneHtml(op, op.username === this._accExpanded)).join('');
    const unassignedRow = isAdmin ? this._accUnassignedHtml() : '';

    return `
      <div class="wl-acc-header">
        <div class="wl-acc-header__left">
          <h2 class="wl-acc-header__title">Workload team — vista ibrida</h2>
          <p class="wl-acc-header__sub">${dayLabelCap} · espandi un operatore per il dettaglio task</p>
        </div>
        <div class="wl-acc-header__right">
          <div class="wl-acc-strip">${stripDays}</div>
          <button class="btn btn--ghost btn--sm" data-act="acc-sort" title="Ordina per carico decrescente">⇅ ${this._accSort === 'load' ? '✓ ' : ''}Ordina per carico</button>
        </div>
      </div>

      <div class="wl-acc-list">
        ${lanes}
        ${unassignedRow}
      </div>

      <div class="wl-acc-footer-hint">
        ⓘ Espandi una sola persona alla volta per evitare lo scroll infinito. Per il dettaglio orario di una giornata usa la <b>vista Calendario</b>.
      </div>
    `;
  },

  _accLaneHtml(op, expanded) {
    const hours = this._hoursOfCell(op.username, this._accDay);
    const items = this._itemsOfCell(op.username, this._accDay);
    const cap = this._dailyCapacityOf(op);
    const status = this._cellStatus(hours, cap);
    const palette = this.ROLE_PALETTE[this._primaryRoleKey(op)] || this.ROLE_PALETTE.operator;
    const initials = (op.name || op.username || '?').split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();
    const rolesLabel = this._rolesLabel(op);
    const isPartTime = cap < 8;

    // Barra saturazione (clamp visivo al 100%, ma colore overload)
    const pct = cap > 0 ? Math.min(100, Math.round((hours / cap) * 100)) : 0;
    const barClass = `wl-acc-bar wl-acc-bar--${status}`;
    const limitMarkerPct = cap > 8 ? null : Math.round((8 / cap) * 100); // marker 8h se sotto

    const statusBadge = {
      ok:        { label: 'Disponibile', cls: 'ok' },
      warning:   { label: 'Al limite',   cls: 'warning' },
      overload:  { label: 'Overbook',    cls: 'overload' },
      underload: { label: 'Disponibile', cls: 'ok' },
      empty:     { label: 'Libero',      cls: 'empty' },
    }[status] || { label: '—', cls: 'empty' };

    const taskCountTxt = items.length === 0 ? '0 task' : `${items.length} ${items.length === 1 ? 'task' : 'task'}`;
    const loadTxt = `${this._fmtH(hours)}h / ${cap}h · ${taskCountTxt}${status === 'overload' || (status === 'warning' && items.length > 8) ? ' ⚠' : ''}`;
    const loadCls = `wl-acc-load wl-acc-load--${status}`;

    const caret = expanded ? '▴' : '▾';
    const expandedDetail = expanded ? this._accExpandedDetailHtml(op, items) : '';

    return `
      <div class="wl-acc-lane ${expanded ? 'is-expanded' : ''}" data-username="${op.username}">
        <div class="wl-acc-lane__row">
          <div class="wl-acc-lane__op">
            ${op.avatar
              ? `<span class="wl-avatar wl-avatar--photo" style="background:${palette.bg}"><img src="${op.avatar}" alt=""></span>`
              : `<span class="wl-avatar" style="background:${palette.bg};color:${palette.fg}">${initials}</span>`}
            <div>
              <div class="wl-acc-lane__name">${(op.name || op.username).replace(/[<>]/g, '')}</div>
              <div class="wl-acc-lane__role">${rolesLabel}${isPartTime ? ' · pt ' + cap + 'h' : ''}</div>
            </div>
          </div>
          <div class="wl-acc-lane__bar-wrap">
            <div class="wl-acc-lane__bar-head">
              <span class="wl-acc-lane__bar-label">Carico giornaliero</span>
              <span class="${loadCls}">${loadTxt}</span>
            </div>
            <div class="wl-acc-bar-track">
              <div class="${barClass}" style="width:${pct}%"></div>
              ${limitMarkerPct != null && limitMarkerPct < 100 ? `<div class="wl-acc-bar-marker" style="left:${limitMarkerPct}%" title="Limite 8h"></div>` : ''}
            </div>
          </div>
          <div class="wl-acc-lane__badge">
            <span class="wl-acc-badge wl-acc-badge--${statusBadge.cls}">${statusBadge.label}</span>
          </div>
          <button class="wl-acc-lane__toggle" type="button" data-act="acc-toggle" title="${expanded ? 'Collassa' : 'Espandi'}">${caret}</button>
        </div>
        ${expandedDetail}
      </div>
    `;
  },

  _accExpandedDetailHtml(op, items) {
    if (items.length === 0) {
      return `
        <div class="wl-acc-detail">
          <div class="wl-acc-empty">Nessuna lavorazione assegnata per questo giorno.</div>
          <div class="wl-acc-actions">
            <button class="btn btn--ghost btn--sm" data-act="acc-open-cal">↗ Apri vista calendario</button>
            <button class="btn btn--secondary btn--sm" data-act="acc-assign">+ Assegna task</button>
          </div>
        </div>
      `;
    }

    // Raggruppa per cliente
    const byClient = new Map();
    for (const w of items) {
      const key = w.clientName || '— Senza cliente —';
      if (!byClient.has(key)) byClient.set(key, []);
      byClient.get(key).push(w);
    }
    const MAX_PER_CLIENT = 4;

    const clientSections = [...byClient.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([clientName, tasks]) => {
        const totalH = tasks.reduce((s, w) => s + (Number(w.weightHours) || 0), 0);
        const palette = this._clientPaletteOf(clientName);
        const sortedByTime = tasks.slice().sort((a, b) => (a.startTime || '99:99').localeCompare(b.startTime || '99:99'));
        const shown = sortedByTime.slice(0, MAX_PER_CLIENT);
        const rest = sortedByTime.length - shown.length;
        const taskRows = shown.map(w => this._accTaskRowHtml(w)).join('');
        const moreRow = rest > 0
          ? `<div class="wl-acc-task wl-acc-task--more" data-act="acc-show-more">+${rest} altr${rest === 1 ? 'a task' : 'e task'} minor${rest === 1 ? 'e' : 'i'}</div>`
          : '';
        return `
          <div class="wl-acc-client">
            <div class="wl-acc-client__head">
              <span class="wl-acc-client__dot" style="background:${palette.bg}"></span>
              <span class="wl-acc-client__name">${clientName.replace(/[<>]/g, '')}</span>
              <span class="wl-acc-client__meta">· ${tasks.length} ${tasks.length === 1 ? 'task' : 'task'} · ${this._fmtH(totalH)}h</span>
            </div>
            <div class="wl-acc-tasks">
              ${taskRows}
              ${moreRow}
            </div>
          </div>
        `;
      }).join('');

    return `
      <div class="wl-acc-detail">
        ${clientSections}
        <div class="wl-acc-actions">
          <button class="btn btn--ghost btn--sm" data-act="acc-open-cal">↗ Apri vista calendario</button>
          <button class="btn btn--secondary btn--sm" data-act="acc-assign">+ Assegna task</button>
          <span class="wl-acc-sync-hint">Backend e sync Trello — prossimi step</span>
        </div>
      </div>
    `;
  },

  _accTaskRowHtml(w) {
    const isUrgent = (this._dueClass(w.dueDate, w.status) === 'wl-due--urgent' || this._dueClass(w.dueDate, w.status) === 'wl-due--late');
    const durMin = Math.max(0, Math.round((Number(w.weightHours) || 0) * 60));
    const durLabel = durMin >= 60
      ? `${Math.floor(durMin/60)}h${durMin % 60 ? ' ' + (durMin % 60) + 'm' : ''}`
      : `${durMin}m`;
    const start = w.startTime || '—';
    const statusIcon = {
      done:        '<span class="wl-acc-task__status wl-acc-task__status--done" title="Completata">✓</span>',
      in_progress: '<span class="wl-acc-task__status wl-acc-task__status--prog" title="In corso">●</span>',
      blocked:     '<span class="wl-acc-task__status wl-acc-task__status--blocked" title="Bloccata">⊘</span>',
      todo:        '<span class="wl-acc-task__status wl-acc-task__status--todo" title="Da fare">○</span>',
    }[w.status] || '<span class="wl-acc-task__status">○</span>';
    return `
      <div class="wl-acc-task ${isUrgent ? 'is-urgent' : ''}" data-id="${w.id}">
        <span class="wl-acc-task__title">${isUrgent ? '🚩 ' : ''}${(w.title || '— senza titolo —').replace(/[<>]/g, '')}</span>
        <span class="wl-acc-task__time">${start}</span>
        <span class="wl-acc-task__dur">${durLabel}</span>
        ${statusIcon}
      </div>
    `;
  },

  _accUnassignedHtml() {
    const items = this._itemsOfCell('__unassigned__', this._accDay);
    const totalH = items.reduce((s, w) => s + (Number(w.weightHours) || 0), 0);
    const projects = new Set(items.map(w => w.clientName || '— senza cliente —')).size;
    return `
      <div class="wl-acc-lane wl-acc-lane--unassigned" data-username="__unassigned__">
        <div class="wl-acc-lane__row">
          <div class="wl-acc-lane__op">
            <span class="wl-avatar wl-avatar--unassigned">?</span>
            <div>
              <div class="wl-acc-lane__name">Non assegnato</div>
              <div class="wl-acc-lane__role">Da distribuire</div>
            </div>
          </div>
          <div class="wl-acc-unassigned__meta">
            ${items.length > 0
              ? `<strong>${items.length} ${items.length === 1 ? 'task' : 'task'}</strong> in coda · <strong>${this._fmtH(totalH)}h</strong> total${totalH === 1 ? 'e' : 'i'} · ${projects} ${projects === 1 ? 'progetto' : 'progetti'}`
              : '<i>Nessuna task in coda di assegnazione.</i>'}
          </div>
          <div class="wl-acc-lane__badge">
            ${items.length > 0 ? '<button class="btn btn--secondary btn--sm" data-act="acc-assign-unassigned">Assegna →</button>' : ''}
          </div>
          <span class="wl-acc-lane__toggle wl-acc-lane__toggle--placeholder">·</span>
        </div>
      </div>
    `;
  },

  _bindAccordion() {
    const root = document.getElementById('workloadRoot');
    if (!root) return;
    // Strip giorni
    root.querySelectorAll('[data-acc-day]').forEach(btn => {
      btn.addEventListener('click', async () => {
        this._accDay = btn.dataset.accDay;
        await this.render();
      });
    });
    // Sort
    root.querySelector('[data-act="acc-sort"]')?.addEventListener('click', async () => {
      this._accSort = (this._accSort === 'load') ? 'default' : 'load';
      await this.render();
    });
    // Toggle accordion (click su intera riga o su caret)
    root.querySelectorAll('.wl-acc-lane:not(.wl-acc-lane--unassigned) .wl-acc-lane__row').forEach(row => {
      row.addEventListener('click', async (e) => {
        // ignora click su bottoni nested
        if (e.target.closest('[data-act]') && !e.target.closest('[data-act="acc-toggle"]')) return;
        const lane = row.closest('.wl-acc-lane');
        if (!lane) return;
        const username = lane.dataset.username;
        if (this._accExpanded === username) {
          this._accExpanded = null;
        } else {
          this._accExpanded = username;
        }
        await this.render();
      });
    });
    // Click su task → modale dettaglio
    root.querySelectorAll('.wl-acc-task[data-id]').forEach(t => {
      t.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(t.dataset.id, 10);
        if (id) this.openDetailModal(id);
      });
    });
    // Apri vista calendario per operatore espanso
    root.querySelectorAll('[data-act="acc-open-cal"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!this._accExpanded) return;
        this._calOperator = this._accExpanded;
        this._calDay = this._accDay;
        await this._setViewMode('calendario');
        await this.render();
      });
    });
    // + Assegna task per operatore espanso
    root.querySelectorAll('[data-act="acc-assign"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!this._accExpanded) return;
        this.openNewModal({ assignedTo: this._accExpanded, scheduledDate: this._accDay });
      });
    });
    // Assegna dalla riga Non assegnato (apre form senza assignedTo)
    root.querySelector('[data-act="acc-assign-unassigned"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openNewModal({ assignedTo: this._operators[0]?.username || '', scheduledDate: this._accDay });
    });
    // "+N altre task" → espandi limite (semplice: passa a Vista Calendario per quel op)
    root.querySelectorAll('[data-act="acc-show-more"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!this._accExpanded) return;
        this._calOperator = this._accExpanded;
        this._calDay = this._accDay;
        await this._setViewMode('calendario');
        await this.render();
      });
    });
  },

  _avatarHtml(op) {
    const palette = this.ROLE_PALETTE[this._primaryRoleKey(op)] || this.ROLE_PALETTE.operator;
    if (op.avatar) {
      return `<span class="wl-avatar wl-avatar--photo" style="background:${palette.bg}"><img src="${op.avatar}" alt="${(op.name || op.username || '').replace(/"/g,'&quot;')}"></span>`;
    }
    const initials = (op.name || op.username || '?').split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();
    return `<span class="wl-avatar" style="background:${palette.bg};color:${palette.fg}">${initials}</span>`;
  },

  _laneHtml(op) {
    const cells = this._range.days.map(day => this._cellHtml(op, day)).join('');
    const rolesLabel = this._rolesLabel(op);
    const weeklyCap = this._weeklyCapacityOf(op);
    const isPartTime = this._dailyCapacityOf(op) < 8;
    return `
      <div class="wl-lane-op">
        ${this._avatarHtml(op)}
        <div class="wl-lane-op__info">
          <div class="wl-lane-op__name">${(op.name || op.username || '—').replace(/[<>]/g, '')}</div>
          <div class="wl-lane-op__role" title="${rolesLabel.replace(/"/g, '&quot;')}">${rolesLabel}</div>
          <div class="wl-lane-op__cap">${weeklyCap}h/sett${isPartTime ? ' · part-time' : ''}</div>
        </div>
      </div>
      ${cells}
    `;
  },

  _unassignedLaneHtml() {
    const totalUnassigned = this._range.days.reduce((s, d) => s + this._hoursOfCell('__unassigned__', d), 0);
    const cells = this._range.days.map(day => this._cellHtml({ username: '__unassigned__', _unassigned: true }, day)).join('');
    return `
      <div class="wl-lane-op wl-lane-op--unassigned">
        <span class="wl-avatar wl-avatar--unassigned">?</span>
        <div class="wl-lane-op__info">
          <div class="wl-lane-op__name">Non assegnato</div>
          <div class="wl-lane-op__role">${totalUnassigned > 0 ? totalUnassigned.toFixed(1).replace('.0','') + 'h da distribuire' : 'Vuoto'}</div>
        </div>
      </div>
      ${cells}
    `;
  },

  _cellHtml(op, day) {
    const isUnassigned = op._unassigned || op.username === '__unassigned__';
    const items = this._itemsOfCell(op.username, day);
    const hours = items.reduce((s, w) => s + (Number(w.weightHours) || 0), 0);
    const capacity = isUnassigned ? 0 : this._dailyCapacityOf(op);
    const status = isUnassigned ? (items.length === 0 ? 'empty' : 'unassigned') : this._cellStatus(hours, capacity);
    const isToday = day === this._isoOf(new Date());
    const overload = status === 'overload';
    const hoursText = isUnassigned
      ? (hours > 0 ? `${this._fmtH(hours)}` : '')
      : `${this._fmtH(hours)}/${capacity}h${overload ? ' ⚠' : ''}`;
    return `
      <div class="wl-cell wl-cell--${status} ${isToday ? 'is-today' : ''}" data-op="${op.username}" data-day="${day}">
        <div class="wl-cell__items">
          ${items.map(w => this._cardHtml(w, status)).join('')}
        </div>
        <div class="wl-cell__foot">
          <span class="wl-cell__hours">${hoursText}</span>
          <button class="wl-cell__add" type="button" title="Aggiungi lavorazione" data-act="new-here" data-op="${op.username}" data-day="${day}">+</button>
        </div>
      </div>
    `;
  },

  _cardHtml(w, cellStatus) {
    const area = this.AREAS.find(a => a.id === w.area) || this.AREAS[this.AREAS.length - 1];
    const status = this.STATUSES.find(s => s.id === w.status) || this.STATUSES[0];
    const progress = Math.max(0, Math.min(100, Number(w.progress) || 0));
    const cardStateClass = `wl-card--state-${cellStatus || 'ok'}`;
    const dueCls = this._dueClass(w.dueDate, w.status);
    const dueShort = w.dueDate && (dueCls === 'wl-due--urgent' || dueCls === 'wl-due--late' || dueCls === 'wl-due--soon');
    return `
      <div class="wl-card ${cardStateClass} wl-card--${w.status} ${dueCls === 'wl-due--late' ? 'wl-card--late' : ''}" data-syncid="${w.syncId || ''}" data-id="${w.id}" draggable="true" title="${(w.clientName || '').replace(/"/g,'&quot;')} · ${(w.title || '').replace(/"/g,'&quot;')}${w.dueDate ? ' · ' + this._dueLabel(w.dueDate) : ''} · Trascina per spostare">
        <span class="wl-card__area" aria-hidden="true">${area.icon}</span>
        <span class="wl-card__text">
          <span class="wl-card__title">${(w.title || '— senza titolo —').replace(/[<>]/g, '')}</span>
          ${w.clientName ? `<small class="wl-card__client">${w.clientName.replace(/[<>]/g, '')}</small>` : ''}
        </span>
        ${dueShort ? `<span class="wl-card__due ${dueCls}" title="${this._dueLabel(w.dueDate)}">⏰</span>` : ''}
        <span class="wl-card__hours">${this._fmtH(w.weightHours)}h</span>
        ${progress > 0 && progress < 100 ? `<span class="wl-card__progress" title="${progress}% completato"><span class="wl-card__progress-fill" style="width:${progress}%"></span></span>` : ''}
      </div>
    `;
  },

  _footerHtml() {
    const today = this._isoOf(new Date());
    const isTodayInRange = this._range.days.includes(today);
    const uniqueOps = new Set(this._operators.map(o => o.username));
    let availableToday = 0;
    if (isTodayInRange) {
      for (const op of this._operators) {
        const cap = this._dailyCapacityOf(op);
        const used = this._hoursOfCell(op.username, today);
        availableToday += Math.max(0, cap - used);
      }
    }
    return `
      <div class="wl-footer">
        <span class="wl-footer__hint">ⓘ Le ore sono stimate. Click su card per dettaglio e edit.</span>
        <span class="wl-footer__stat">${uniqueOps.size} ${uniqueOps.size === 1 ? 'operatore' : 'operatori'} · ${isTodayInRange ? `${availableToday.toFixed(1).replace('.0','')}h disponibili oggi` : 'fuori settimana corrente'}</span>
      </div>
    `;
  },

  _fmtH(n) {
    const v = Number(n) || 0;
    return v.toFixed(1).replace(/\.0$/, '');
  },

  /** Etichetta scadenza: "Oggi" / "Domani" / "tra Ng" / "23 mag" / "scaduta -Ng" */
  _dueLabel(iso) {
    if (!iso) return '';
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const due   = new Date(iso); due.setHours(0, 0, 0, 0);
    const delta = Math.round((due - today) / 86400000);
    if (delta === 0)  return 'Scade oggi';
    if (delta === 1)  return 'Scade domani';
    if (delta === -1) return 'Scaduta ieri';
    if (delta > 1 && delta <= 7)  return `Scade tra ${delta}g`;
    if (delta < -1 && delta >= -7) return `Scaduta ${Math.abs(delta)}g fa`;
    // Date oltre 7g: mostra giorno+mese italiano
    return 'Scade ' + due.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' }).replace('.', '');
  },
  /** CSS class per scadenza: urgent (<=1g), soon (2-3g), late (passata), normale */
  _dueClass(iso, status) {
    if (!iso || status === 'done' || status === 'cancelled') return 'wl-due--ok';
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const due   = new Date(iso); due.setHours(0, 0, 0, 0);
    const delta = Math.round((due - today) / 86400000);
    if (delta < 0)  return 'wl-due--late';
    if (delta <= 1) return 'wl-due--urgent';
    if (delta <= 3) return 'wl-due--soon';
    return 'wl-due--ok';
  },

  // ===========================================================
  // BIND
  // ===========================================================
  _bindToolbar() {
    const root = document.getElementById('workloadRoot');
    if (!root) return;
    root.querySelector('[data-act="prev"]') ?.addEventListener('click', () => { this._shiftRange(-1); this.render(); });
    root.querySelector('[data-act="next"]') ?.addEventListener('click', () => { this._shiftRange(1);  this.render(); });
    root.querySelector('[data-act="today"]')?.addEventListener('click', () => { this._range = this._weekRangeOf(new Date()); this.render(); });
    root.querySelector('[data-act="new"]')  ?.addEventListener('click', () => this.openNewModal());
    root.querySelector('[data-act="capacity"]')?.addEventListener('click', () => this.openCapacityModal());
    root.querySelectorAll('[data-view-mode]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const mode = btn.dataset.viewMode;
        if (mode === this._viewMode) return;
        await this._setViewMode(mode);
        await this.render();
      });
    });
    root.querySelectorAll('[data-act="new-here"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const op = btn.dataset.op;
        const prefill = { scheduledDate: btn.dataset.day };
        if (op && op !== '__unassigned__') prefill.assignedTo = op;
        this.openNewModal(prefill);
      });
    });
    // Search input: debounce e re-render
    const searchInput = root.querySelector('#wlSearchInput');
    if (searchInput) {
      // mantieni focus dopo render: posiziona cursore in fondo
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
    root.querySelector('[data-act="search-clear"]')?.addEventListener('click', async () => {
      this._search = '';
      await this.render();
    });
  },

  _bindCards() {
    const isAdmin = window.Roles && Roles.isAdmin();
    document.querySelectorAll('#workloadRoot .wl-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = parseInt(card.dataset.id, 10);
        if (!id) return;
        this.openDetailModal(id);
      });
      // Drag start
      card.addEventListener('dragstart', (e) => {
        const id = card.dataset.id;
        e.dataTransfer.setData('text/wl-id', id);
        e.dataTransfer.effectAllowed = 'move';
        card.classList.add('is-dragging');
        document.body.classList.add('wl-dragging');
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('is-dragging');
        document.body.classList.remove('wl-dragging');
        document.querySelectorAll('#workloadRoot .wl-cell.is-drop-target').forEach(c => c.classList.remove('is-drop-target'));
      });
    });

    // Solo admin può ribilanciare con drag&drop (operatori non possono
    // cambiare assignedTo né data degli altri)
    if (!isAdmin) return;

    // Drop target sulle celle giorno×operatore
    document.querySelectorAll('#workloadRoot .wl-cell[data-op][data-day]').forEach(cell => {
      cell.addEventListener('dragover', (e) => {
        if (!e.dataTransfer.types.includes('text/wl-id')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        cell.classList.add('is-drop-target');
      });
      cell.addEventListener('dragleave', (e) => {
        if (cell.contains(e.relatedTarget)) return;
        cell.classList.remove('is-drop-target');
      });
      cell.addEventListener('drop', async (e) => {
        e.preventDefault();
        cell.classList.remove('is-drop-target');
        const id = parseInt(e.dataTransfer.getData('text/wl-id'), 10);
        if (!id) return;
        const targetOp  = cell.dataset.op === '__unassigned__' ? '' : cell.dataset.op;
        const targetDay = cell.dataset.day;
        await this._handleCardMove(id, targetOp, targetDay);
      });
    });
  },

  /** Gestisce uno spostamento drag&drop: chiede conferma (se non skip),
      applica il cambio scheduledDate / assignedTo, re-renderizza. */
  async _handleCardMove(workitemId, targetOp, targetDay) {
    const w = await DB.get('workitems', workitemId);
    if (!w) return;
    // No-op se lascia tutto identico
    const currentOp = w.assignedTo || '';
    if ((currentOp === targetOp) && (w.scheduledDate === targetDay)) return;

    const skip = !!(await DB.getSetting('workload_dnd_skip_confirm', false));
    if (!skip) {
      const ok = await this._confirmMove(w, targetOp, targetDay);
      if (!ok) return;
    }
    // Applica
    const fresh = await DB.get('workitems', workitemId);
    if (!fresh) return;
    const moved = (fresh.scheduledDate !== targetDay);
    fresh.scheduledDate = targetDay;
    fresh.assignedTo    = targetOp;
    fresh.updatedAt     = new Date().toISOString();
    if (moved) fresh.rolloverCount = (Number(fresh.rolloverCount) || 0) + 1;
    await DB.put('workitems', fresh);
    App._toast('Lavorazione spostata', 'success');
    await this.render();
  },

  /** Modale di conferma drag&drop con checkbox "non mostrare più".
      Restituisce Promise<bool>. */
  _confirmMove(w, targetOp, targetDay) {
    return new Promise((resolve) => {
      const opLabel = targetOp
        ? (this._operators.find(o => o.username === targetOp)?.name || targetOp)
        : 'Non assegnato';
      const fromOp = w.assignedTo
        ? (this._operators.find(o => o.username === w.assignedTo)?.name || w.assignedTo)
        : 'Non assegnato';
      const dayLabel = iso => {
        const d = new Date(iso);
        return d.toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'short' }).replace('.', '');
      };
      const opChanged   = ((w.assignedTo || '') !== (targetOp || ''));
      const dateChanged = (w.scheduledDate !== targetDay);

      const overlay = document.createElement('div');
      overlay.className = 'rem-modal wl-modal';
      overlay.innerHTML = `
        <div class="rem-modal__box wl-modal__box wl-dnd-confirm">
          <h3>Confermi lo spostamento?</h3>
          <p class="wl-dnd-confirm__title">${(w.title || '— senza titolo —').replace(/[<>]/g, '')}</p>
          <div class="wl-dnd-confirm__move">
            ${dateChanged ? `
              <div class="wl-dnd-confirm__row">
                <span class="wl-dnd-confirm__label">Giorno</span>
                <span class="wl-dnd-confirm__from">${dayLabel(w.scheduledDate)}</span>
                <span class="wl-dnd-confirm__arrow">→</span>
                <span class="wl-dnd-confirm__to">${dayLabel(targetDay)}</span>
              </div>` : ''}
            ${opChanged ? `
              <div class="wl-dnd-confirm__row">
                <span class="wl-dnd-confirm__label">Operatore</span>
                <span class="wl-dnd-confirm__from">${fromOp.replace(/[<>]/g, '')}</span>
                <span class="wl-dnd-confirm__arrow">→</span>
                <span class="wl-dnd-confirm__to">${opLabel.replace(/[<>]/g, '')}</span>
              </div>` : ''}
          </div>
          <label class="wl-dnd-confirm__skip">
            <input type="checkbox" id="wlDndSkip">
            <span>Non mostrare più questo messaggio (puoi riattivarlo in <b>⚙ Team &amp; Capacità</b>)</span>
          </label>
          <div class="wl-form__foot">
            <button type="button" class="btn btn--ghost" data-act="cancel">Annulla</button>
            <button type="button" class="btn btn--primary" data-act="confirm">Sposta</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      const close = (result) => {
        overlay.remove();
        resolve(result);
      };
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
      overlay.querySelector('[data-act="cancel"]').addEventListener('click', () => close(false));
      overlay.querySelector('[data-act="confirm"]').addEventListener('click', async () => {
        const skipNext = overlay.querySelector('#wlDndSkip').checked;
        if (skipNext) await DB.setSetting('workload_dnd_skip_confirm', true);
        close(true);
      });
      // Esc = annulla
      const onKey = (e) => {
        if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); close(false); }
        if (e.key === 'Enter')  { document.removeEventListener('keydown', onKey); overlay.querySelector('[data-act="confirm"]').click(); }
      };
      document.addEventListener('keydown', onKey);
    });
  },

  // ===========================================================
  // MODAL "TEAM & CAPACITÀ"
  // ===========================================================
  async openCapacityModal() {
    const usersRaw = await DB.all('users');
    const usersMap = new Map();
    for (const u of usersRaw) {
      if (!u || !u.username) continue;
      const existing = usersMap.get(u.username);
      if (!existing || (u.updatedAt || '') > (existing.updatedAt || '')) usersMap.set(u.username, u);
    }
    const users = [...usersMap.values()]
      .filter(u => u.role === 'operator' || u.role === 'admin' || u.role === 'super_admin')
      .sort((a, b) => (a.name || a.username).localeCompare(b.name || b.username));

    const allRoles = Object.keys(this.ROLE_PALETTE).filter(k => !['unassigned', 'operator', 'admin'].includes(k));
    const allTeams = this.TEAMS;

    const rows = users.map(u => {
      const cap = this._dailyCapacityOf(u);
      const userRoles = new Set(this._workRolesOf(u));
      const userTeams = new Set(this._teamsOf(u));
      const roleChips = allRoles.map(r => {
        const palette = this.ROLE_PALETTE[r];
        const sel = userRoles.has(r);
        return `<button type="button" class="wl-chip ${sel ? 'is-selected' : ''}" data-role="${r}" style="--chip-bg:${palette.bg};--chip-fg:${palette.fg}">${palette.label}</button>`;
      }).join('');
      const teamChips = allTeams.map(t => {
        const sel = userTeams.has(t.id);
        return `<button type="button" class="wl-chip ${sel ? 'is-selected' : ''}" data-team="${t.id}" style="--chip-bg:${t.accent};--chip-fg:#ffffff">${t.icon} ${t.label}</button>`;
      }).join('');
      const inTeam = userTeams.size > 0;
      const isMe = State.currentUser && State.currentUser.username === u.username;
      // Cestino: due semantiche
      // - se inTeam: "rimuovi dal team" (svuota teams)
      // - se !inTeam: "elimina utente dal sistema"
      // Disabled solo per l'utente loggato (non può eliminare sé stesso)
      const removeTitle = isMe
        ? 'Non puoi eliminare il tuo account loggato'
        : (inTeam ? 'Rimuovi dal team (svuota i team selezionati)' : 'Elimina account dal sistema');
      const removeAct = inTeam ? 'remove' : 'delete';
      return `
        <tr data-username="${u.username}">
          <td>
            <span class="wl-cap-name">
              ${this._avatarHtml(u).replace('wl-avatar', 'wl-avatar wl-avatar--mini')}
              <span class="wl-cap-name__col">
                <input type="text" class="input wl-cap-name-input" value="${(u.name || '').replace(/"/g, '&quot;')}" maxlength="60" title="Nome visualizzato">
                <small style="display:block;color:var(--ad-mute);margin-top:2px">${u.username}</small>
              </span>
            </span>
          </td>
          <td><div class="wl-cap-chips">${roleChips}</div></td>
          <td><div class="wl-cap-chips">${teamChips}</div></td>
          <td><input type="number" class="input wl-cap-input" min="0.5" max="24" step="0.5" value="${cap}"> <small style="color:var(--ad-mute)">h/g</small></td>
          <td style="text-align:center">
            <button type="button" class="wl-cap-remove ${!inTeam ? 'wl-cap-remove--delete' : ''}" data-act="${removeAct}" title="${removeTitle}" ${isMe ? 'disabled' : ''}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    const t = this._thresholds || { warn: 90, over: 100, under: 50 };
    const overlay = document.createElement('div');
    overlay.className = 'rem-modal wl-modal';
    overlay.innerHTML = `
      <div class="rem-modal__box wl-modal__box wl-modal__box--cap">
        <h3>Team, ruoli e capacità operatori</h3>
        <p style="margin:0 0 14px;color:var(--ad-mute);font-size:13px">Click su un chip per <b>aggiungere/rimuovere</b> il ruolo o il team. Un operatore può avere più ruoli (es. Social Media Manager + Graphic Designer) e appartenere a più team (es. Mattia in Social e Web).</p>
        <div style="overflow:auto;max-height:60vh">
          <table class="wl-cap-table">
            <thead>
              <tr>
                <th>Operatore</th>
                <th>Ruoli</th>
                <th>Team</th>
                <th>Capacità</th>
                <th style="text-align:center">Azioni</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>

        <hr style="border:0;border-top:1px dashed var(--ad-line);margin:18px 0">

        <h4 style="margin:0 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--ad-mute)">Soglie di carico (% della capacità)</h4>
        <div class="wl-form__row">
          <label>Sotto utilizzo ≤
            <input type="number" class="input" id="wlThUnder" min="0" max="100" step="5" value="${t.under}"> %
          </label>
          <label>Vicino al limite ≥
            <input type="number" class="input" id="wlThWarn" min="0" max="200" step="5" value="${t.warn}"> %
          </label>
          <label>Overbooking >
            <input type="number" class="input" id="wlThOver" min="0" max="300" step="5" value="${t.over}"> %
          </label>
        </div>

        <h4 style="margin:14px 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--ad-mute)">Comportamenti</h4>
        <label class="wl-cap-toggle">
          <input type="checkbox" id="wlDndAskAgain">
          <span>Chiedi conferma quando trascino una lavorazione tra giorni/operatori</span>
        </label>

        <div class="wl-form__foot" style="margin-top:14px">
          <button type="button" class="btn btn--ghost" data-act="cancel">Annulla</button>
          <button type="button" class="btn btn--primary" data-act="save">Salva</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('[data-act="cancel"]').addEventListener('click', close);

    // Stato iniziale toggle conferma DnD: checked = chiede conferma
    DB.getSetting('workload_dnd_skip_confirm', false).then(skip => {
      const cb = overlay.querySelector('#wlDndAskAgain');
      if (cb) cb.checked = !skip;
    });

    // Toggle chip
    overlay.querySelectorAll('.wl-chip').forEach(chip => {
      chip.addEventListener('click', () => chip.classList.toggle('is-selected'));
    });

    // Rimuovi dal team: svuota teams[] della riga (con conferma).
    // Non elimina l'utente dal DB — resta come account, esce solo dalla
    // vista Lavorazioni.
    overlay.querySelectorAll('[data-act="remove"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tr = btn.closest('tr');
        const username = tr.dataset.username;
        const displayName = tr.querySelector('.wl-cap-name-input').value || username;
        if (!confirm(`Rimuovere "${displayName}" dal team?\n\nLa persona uscirà dalla vista Lavorazioni ma il suo account resterà attivo. Puoi riassegnarla a un team in qualsiasi momento.`)) return;
        tr.querySelectorAll('[data-team].is-selected').forEach(c => c.classList.remove('is-selected'));
        btn.disabled = true;
        btn.title = 'Già rimosso (salva per confermare)';
        tr.style.opacity = '0.55';
      });
    });

    // Elimina utente dal sistema: per chi non ha team (account legacy/dismessi).
    // Marca la riga come "to-delete" — l'eliminazione effettiva avviene al
    // click Salva (così l'utente può annullare).
    overlay.querySelectorAll('[data-act="delete"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tr = btn.closest('tr');
        const username = tr.dataset.username;
        const displayName = tr.querySelector('.wl-cap-name-input').value || username;
        if (!confirm(`Eliminare definitivamente l'account "${displayName}" (${username}) dal sistema?\n\nL'account NON apparirà più nel login. Questa azione non è reversibile.`)) return;
        tr.dataset.toDelete = '1';
        btn.disabled = true;
        btn.title = 'Eliminazione confermata (salva per applicare)';
        tr.style.opacity = '0.35';
        tr.style.textDecoration = 'line-through';
      });
    });

    overlay.querySelector('[data-act="save"]').addEventListener('click', async () => {
      const rows = overlay.querySelectorAll('tbody tr');
      for (const tr of rows) {
        const username = tr.dataset.username;
        // Riga marcata per eliminazione: rimuovi TUTTE le copie con quel username
        if (tr.dataset.toDelete === '1') {
          const allUsers = await DB.all('users');
          for (const u of allUsers) {
            if (u && u.username === username && u.id != null) {
              await DB.delete('users', u.id);
            }
          }
          continue;
        }
        const cap = Number(tr.querySelector('.wl-cap-input').value) || 8;
        const nameNew = (tr.querySelector('.wl-cap-name-input').value || '').trim();
        const selectedRoles = [...tr.querySelectorAll('[data-role].is-selected')].map(c => c.dataset.role);
        const selectedTeams = [...tr.querySelectorAll('[data-team].is-selected')].map(c => c.dataset.team);
        const u = users.find(x => x.username === username);
        if (!u) continue;
        if (nameNew && nameNew !== u.name) u.name = nameNew;
        u.workRoles = selectedRoles;
        u.workRole  = selectedRoles[0] || u.workRole; // legacy primo
        u.teams = selectedTeams;
        u.dailyCapacityHours = cap;
        u.updatedAt = new Date().toISOString();
        await DB.put('users', u);
      }
      const tNew = {
        under: Number(overlay.querySelector('#wlThUnder').value) || 50,
        warn:  Number(overlay.querySelector('#wlThWarn').value)  || 90,
        over:  Number(overlay.querySelector('#wlThOver').value)  || 100,
      };
      await DB.setSetting('workload_underload_pct', tNew.under);
      await DB.setSetting('workload_warning_pct',   tNew.warn);
      await DB.setSetting('workload_overload_pct',  tNew.over);
      // Toggle conferma DnD
      const askAgain = overlay.querySelector('#wlDndAskAgain');
      if (askAgain) await DB.setSetting('workload_dnd_skip_confirm', !askAgain.checked);
      close();
      App._toast('Team, ruoli e capacità salvati', 'success');
      await this.render();
    });
  },

  // ===========================================================
  // MODAL NUOVA LAVORAZIONE
  // ===========================================================
  openNewModal(prefill = {}) {
    const today = this._isoOf(new Date());
    const defaults = {
      title: '',
      clientId: '',
      area: 'social',
      assignedTo: (this._operators[0] && this._operators[0].username) || '',
      scheduledDate: today,
      startTime: '',
      dueDate: '',
      weightHours: 1,
      description: '',
    };
    const v = Object.assign(defaults, prefill);
    const isAdmin = window.Roles && Roles.isAdmin();
    const clientOpts = this._clients
      .slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      .map(c => `<option value="${c.id}" ${String(c.id) === String(v.clientId) ? 'selected' : ''}>${(c.name || '').replace(/[<>]/g, '')}</option>`)
      .join('');
    const opOpts = [
      `<option value="" ${v.assignedTo === '' ? 'selected' : ''}>— Non assegnato —</option>`,
      ...this._operators
        .map(o => `<option value="${o.username}" ${o.username === v.assignedTo ? 'selected' : ''}>${(o.name || o.username).replace(/[<>]/g, '')}</option>`)
    ].join('');
    const areaOpts = this.AREAS
      .map(a => `<option value="${a.id}" ${a.id === v.area ? 'selected' : ''}>${a.icon} ${a.label}</option>`)
      .join('');

    const overlay = document.createElement('div');
    overlay.className = 'rem-modal wl-modal';
    overlay.innerHTML = `
      <div class="rem-modal__box wl-modal__box">
        <h3>Nuova lavorazione</h3>
        <form class="wl-form" id="wlNewForm">
          <label>Titolo
            <input class="input" name="title" required maxlength="120" placeholder="Es. Stories Meta — 5 post novembre" value="${v.title.replace(/"/g, '&quot;')}">
          </label>
          <div class="wl-form__row">
            <label>Cliente
              <select class="input" name="clientId">
                <option value="">— nessun cliente —</option>
                ${clientOpts}
              </select>
            </label>
            <label>Area
              <select class="input" name="area">${areaOpts}</select>
            </label>
          </div>
          <div class="wl-form__row">
            <label>Operatore
              <select class="input" name="assignedTo" ${isAdmin ? '' : 'disabled'}>${opOpts}</select>
            </label>
            <label>Giorno di lavoro
              <input class="input" type="date" name="scheduledDate" required value="${v.scheduledDate}">
            </label>
            <label>Ore stimate
              <input class="input" type="number" name="weightHours" min="0.25" max="24" step="0.25" required value="${v.weightHours}">
            </label>
          </div>
          <div class="wl-form__row">
            <label>Orario inizio (opz.)
              <input class="input" type="time" name="startTime" value="${v.startTime || ''}" min="08:00" max="20:00" title="Orario di inizio del blocco di lavoro nella giornata. Se vuoto, viene auto-impilato dopo gli altri task.">
            </label>
            <label>Scadenza (entro quando)
              <input class="input" type="date" name="dueDate" value="${v.dueDate || ''}" min="${v.scheduledDate}" title="Data entro cui la lavorazione deve essere completata (consegna al cliente / pubblicazione). Diversa dal giorno in cui viene eseguita.">
            </label>
          </div>
          <label>Descrizione (opzionale)
            <textarea class="input" name="description" rows="3" placeholder="Dettagli operativi…">${(v.description || '').replace(/[<>]/g, '')}</textarea>
          </label>
          <div class="wl-form__foot">
            <button type="button" class="btn btn--ghost" data-act="cancel">Annulla</button>
            <button type="submit" class="btn btn--primary">Crea lavorazione</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('[data-act="cancel"]').addEventListener('click', close);
    overlay.querySelector('#wlNewForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = new FormData(e.target);
      const clientIdRaw = data.get('clientId');
      const clientId = clientIdRaw ? parseInt(clientIdRaw, 10) : null;
      const client = clientId ? this._clients.find(c => c.id === clientId) : null;
      const assignedTo = isAdmin
        ? (data.get('assignedTo') || '')
        : (State.currentUser && State.currentUser.username) || '';
      const now = new Date().toISOString();
      const item = {
        syncId: 'wl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
        clientId,
        clientName: client ? client.name : '',
        title: (data.get('title') || '').toString().trim(),
        description: (data.get('description') || '').toString(),
        area: data.get('area') || 'altro',
        assignedTo,
        assignedBy: (State.currentUser && State.currentUser.username) || null,
        scheduledDate: data.get('scheduledDate'),
        originalDate: data.get('scheduledDate'),
        startTime: data.get('startTime') || null,
        dueDate: data.get('dueDate') || null,
        weightHours: Number(data.get('weightHours')) || 1,
        actualHours: null,
        status: 'todo',
        progress: 0,
        rolloverCount: 0,
        trello: { boardUrl: null, boardId: null, listName: null, cardId: null, cardUrl: null },
        source: 'manual',
        createdAt: now,
        createdBy: (State.currentUser && State.currentUser.username) || null,
        updatedAt: now,
        completedAt: null,
      };
      await DB.put('workitems', item);
      close();
      App._toast('Lavorazione creata', 'success');
      await this.render();
    });
    setTimeout(() => overlay.querySelector('input[name="title"]')?.focus(), 40);
  },

  // ===========================================================
  // MODAL DETTAGLIO
  // ===========================================================
  async openDetailModal(id) {
    const w = await DB.get('workitems', id);
    if (!w) return;
    const isAdmin = window.Roles && Roles.isAdmin();
    const isMine = State.currentUser && w.assignedTo === State.currentUser.username;
    const canEdit = isAdmin || isMine;

    const client = w.clientId ? this._clients.find(c => c.id === w.clientId) : null;
    const area = this.AREAS.find(a => a.id === w.area) || this.AREAS[this.AREAS.length - 1];
    const statusOpts = this.STATUSES
      .map(s => `<option value="${s.id}" ${s.id === w.status ? 'selected' : ''}>${s.label}</option>`).join('');
    const opOpts = [
      `<option value="" ${!w.assignedTo ? 'selected' : ''}>— Non assegnato —</option>`,
      ...this._operators
        .map(o => `<option value="${o.username}" ${o.username === w.assignedTo ? 'selected' : ''}>${(o.name || o.username).replace(/[<>]/g, '')}</option>`)
    ].join('');
    const progress = Math.max(0, Math.min(100, Number(w.progress) || 0));

    const overlay = document.createElement('div');
    overlay.className = 'rem-modal wl-modal';
    overlay.innerHTML = `
      <div class="rem-modal__box wl-modal__box wl-modal__box--detail">
        <div class="wl-detail__head" style="--wl-area:${area.color}">
          <div>
            <div class="wl-detail__client">${(client ? client.name : (w.clientName || '— cliente non specificato —')).replace(/[<>]/g, '')}</div>
            <div class="wl-detail__title">${area.icon} ${(w.title || '').replace(/[<>]/g, '')}</div>
            <div class="wl-detail__meta">
              ${area.label} · ${Number(w.weightHours || 0).toFixed(1).replace('.0','')}h · in carico a <b>${(w.assignedTo || 'Non assegnato').replace(/[<>]/g, '')}</b> · ${w.scheduledDate}
              ${w.dueDate ? ` · <span class="wl-due ${this._dueClass(w.dueDate, w.status)}">${this._dueLabel(w.dueDate)}</span>` : ''}
              ${w.rolloverCount > 0 ? ` · <span class="wl-rolled">⟳ riprogrammata ${w.rolloverCount}×</span>` : ''}
            </div>
          </div>
          <button class="btn btn--ghost btn--sm" data-act="close">Chiudi ✕</button>
        </div>

        <div class="wl-detail__body">
          ${w.description ? `<div class="wl-detail__desc">${w.description.replace(/[<>]/g, '')}</div>` : '<div class="wl-detail__desc wl-detail__desc--empty">— nessuna descrizione —</div>'}

          ${canEdit ? `
          <div class="wl-detail__edit">
            <div class="wl-form__row">
              <label>Stato
                <select class="input" id="wlEditStatus">${statusOpts}</select>
              </label>
              <label>Progresso
                <select class="input" id="wlEditProgress">
                  ${[0, 25, 50, 75, 100].map(p => `<option value="${p}" ${p === progress ? 'selected' : ''}>${p}%</option>`).join('')}
                </select>
              </label>
              ${isAdmin ? `
              <label>Operatore
                <select class="input" id="wlEditOperator">${opOpts}</select>
              </label>` : ''}
            </div>
            ${isAdmin ? `
            <div class="wl-form__row">
              <label>Giorno di lavoro
                <input class="input" type="date" id="wlEditDate" value="${w.scheduledDate}">
              </label>
              <label>Orario inizio
                <input class="input" type="time" id="wlEditStart" value="${w.startTime || ''}" title="Orario di inizio del blocco (usato dalla Vista Calendario)">
              </label>
              <label>Scadenza (entro)
                <input class="input" type="date" id="wlEditDue" value="${w.dueDate || ''}" title="Data entro cui la lavorazione deve essere consegnata">
              </label>
            </div>
            <div class="wl-form__row">
              <label>Ore stimate
                <input class="input" type="number" id="wlEditHours" min="0.25" step="0.25" value="${w.weightHours || 1}">
              </label>
              <label>Ore effettive (a chiusura)
                <input class="input" type="number" id="wlEditActual" min="0" step="0.25" value="${w.actualHours != null ? w.actualHours : ''}" placeholder="—">
              </label>
            </div>` : ''}
            <div class="wl-form__foot">
              ${isAdmin ? `<button class="btn btn--ghost" data-act="delete" title="Annulla la lavorazione (soft delete)">Annulla lavorazione</button>` : ''}
              <button class="btn btn--primary" data-act="save">Salva modifiche</button>
            </div>
            <div class="wl-detail__status" id="wlEditStatusMsg"></div>
          </div>
          ` : `<div class="wl-detail__readonly">Solo l'operatore assegnato o un admin possono modificare questa lavorazione.</div>`}
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('[data-act="close"]').addEventListener('click', close);

    if (canEdit) {
      overlay.querySelector('[data-act="save"]').addEventListener('click', async () => {
        const statusEl = overlay.querySelector('#wlEditStatus');
        const progEl   = overlay.querySelector('#wlEditProgress');
        const opEl     = overlay.querySelector('#wlEditOperator');
        const dateEl   = overlay.querySelector('#wlEditDate');
        const startEl  = overlay.querySelector('#wlEditStart');
        const dueEl    = overlay.querySelector('#wlEditDue');
        const hoursEl  = overlay.querySelector('#wlEditHours');
        const actualEl = overlay.querySelector('#wlEditActual');
        const fresh = await DB.get('workitems', id);
        if (!fresh) return;
        fresh.status = statusEl.value;
        fresh.progress = Number(progEl.value) || 0;
        if (opEl)     fresh.assignedTo = opEl.value;
        if (dateEl)   fresh.scheduledDate = dateEl.value || fresh.scheduledDate;
        if (startEl)  fresh.startTime = startEl.value || null;
        if (dueEl)    fresh.dueDate = dueEl.value || null;
        if (hoursEl)  fresh.weightHours = Number(hoursEl.value) || fresh.weightHours;
        if (actualEl) fresh.actualHours = actualEl.value === '' ? null : Number(actualEl.value);
        if (fresh.status === 'done') {
          fresh.progress = 100;
          if (!fresh.completedAt) fresh.completedAt = new Date().toISOString();
        } else {
          fresh.completedAt = null;
        }
        fresh.updatedAt = new Date().toISOString();
        await DB.put('workitems', fresh);
        const msg = overlay.querySelector('#wlEditStatusMsg');
        msg.textContent = '✓ Salvato';
        msg.style.color = 'var(--ad-success)';
        App._toast('Lavorazione aggiornata', 'success');
        await this.render();
        setTimeout(close, 600);
      });
      const delBtn = overlay.querySelector('[data-act="delete"]');
      if (delBtn) {
        delBtn.addEventListener('click', async () => {
          if (!confirm('Annullare questa lavorazione? Verrà nascosta dalla timeline.')) return;
          const fresh = await DB.get('workitems', id);
          if (!fresh) return;
          fresh.status = 'cancelled';
          fresh.updatedAt = new Date().toISOString();
          await DB.put('workitems', fresh);
          close();
          App._toast('Lavorazione annullata', 'success');
          await this.render();
        });
      }
    }
  },
};

window.Workload = Workload;
