/* ============================================================
   DAILY-TODO.JS — Attività del giorno (vista personale operatore)
   Vista 100% personale: legge le proprie workitem del giorno
   corrente. Saluto, 4 metric card, In corso ora, Da fare oggi,
   Completate oggi, wrap-up giornaliero.
   ============================================================ */

const DailyTodo = {

  _items: [],         // task DELL'utente loggato (vista personale)
  _allTodayItems: [], // tutte le task di OGGI (per vista per-membro, admin)
  _operators: [],
  _clients: [],
  _showAllTodo: false,
  _todoShowLimit: 8,
  _viewMode: 'personal',     // 'personal' | 'team'
  _expandedMember: null,     // username espanso in team view
  _currentDay: null,         // YYYY-MM-DD giorno visualizzato (default oggi)
  _movedAway: [],            // task originalDate === currentDay ma scheduledDate diversa (storico spostamenti)

  // ===========================================================
  // ENTRY POINT
  // ===========================================================
  async render() {
    const root = document.getElementById('dailyTodoRoot');
    if (!root) return;
    if (!State.currentUser) {
      root.innerHTML = '<div class="dt-empty">⚠ Nessun utente loggato.</div>';
      return;
    }
    const isAdmin = window.Roles && Roles.isAdmin();
    // Non-admin: forza vista personale (non vedono il team)
    if (!isAdmin) this._viewMode = 'personal';
    // Inizializza giorno corrente se non già scelto
    if (!this._currentDay) this._currentDay = this._todayIso();

    await this._loadData();

    if (this._viewMode === 'team') {
      root.innerHTML = `
        ${this._viewToggleHtml()}
        ${this._teamViewHtml()}
        <div class="dt-footer">ⓘ Vista per membro: dettaglio task di oggi per ciascun operatore del team. Espandi per vedere la to-do completa.</div>
      `;
      this._bindToggle();
      this._bindTeamView();
    } else {
      root.innerHTML = `
        ${this._viewToggleHtml()}
        ${this._headerHtml()}
        ${this._metricsHtml()}
        ${this._inProgressHtml()}
        ${this._todoSectionHtml()}
        ${this._doneSectionHtml()}
        ${this._movedAwaySectionHtml()}
        ${this._isToday(this._currentDay) ? this._wrapupHtml() : ''}
        <div class="dt-footer">ⓘ Le task sono sincronizzate con la sezione <b>Workload</b> e la <b>Board lavorazioni</b>. ${this._isToday(this._currentDay) ? 'Spunta per completare.' : 'Stai consultando lo storico — torna a oggi per modificare.'}</div>
      `;
      this._bindToggle();
      this._bindEvents();
    }
  },

  // ===========================================================
  // DATA
  // ===========================================================
  _todayIso() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },
  _isToday(iso) { return iso === this._todayIso(); },
  _isPast(iso)  { return iso < this._todayIso(); },
  _shiftDay(delta) {
    const d = new Date(this._currentDay);
    d.setDate(d.getDate() + delta);
    this._currentDay = this._isoOfDate(d);
  },
  _isoOfDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },
  /** Label "Oggi · Mercoledì 27 maggio" / "Ieri · …" / "Lunedì 25 maggio" */
  _dayLabel(iso) {
    const d = new Date(iso);
    const long = d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }).replace('.', '');
    const cap = long.charAt(0).toUpperCase() + long.slice(1);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const ref = new Date(iso); ref.setHours(0, 0, 0, 0);
    const delta = Math.round((ref - today) / 86400000);
    if (delta === 0)  return `Oggi · ${cap}`;
    if (delta === -1) return `Ieri · ${cap}`;
    if (delta === 1)  return `Domani · ${cap}`;
    return cap;
  },
  async _loadData() {
    const me = State.currentUser.username;
    const day = this._currentDay || this._todayIso();
    const all = await DB.all('workitems');
    // Task DEL giorno selezionato (storico fedele alla data scheduledDate)
    const dayItems = all.filter(w =>
      !w._deleted &&
      w.scheduledDate === day &&
      w.status !== 'cancelled'
    );
    this._allTodayItems = dayItems;
    this._items = dayItems.filter(w => w.assignedTo === me);
    // Task ORIGINARIAMENTE di questo giorno ma riprogrammate altrove
    // (visibili nello storico per memoria, opacity ridotta + badge "→ spostata")
    this._movedAway = all.filter(w =>
      !w._deleted &&
      w.status !== 'cancelled' &&
      w.originalDate === day &&
      w.scheduledDate !== day
    );
    this._clients = await DB.all('clients');
    // Operatori dedup (per palette/avatar)
    const usersRaw = await DB.all('users');
    const map = new Map();
    for (const u of usersRaw) {
      if (!u || !u.username) continue;
      const ex = map.get(u.username);
      if (!ex || (u.updatedAt || '') > (ex.updatedAt || '')) map.set(u.username, u);
    }
    this._operators = [...map.values()];
    // Assicura che Workload abbia thresholds caricati (li usiamo per _cellStatus)
    if (window.Workload && typeof Workload._loadThresholds === 'function' && !Workload._thresholds) {
      await Workload._loadThresholds();
    }
  },

  /** Operatori effettivi del team (per vista 'team') — solo chi è nel team */
  _teamMembers() {
    return this._operators.filter(u => Array.isArray(u.teams) && u.teams.length > 0);
  },
  /** Task di oggi assegnate a un dato username */
  _itemsOf(username) {
    return this._allTodayItems.filter(w => w.assignedTo === username);
  },

  _fmtH(n) {
    const v = Number(n) || 0;
    return v.toFixed(1).replace(/\.0$/, '');
  },
  _fmtDur(hours) {
    const min = Math.round((Number(hours) || 0) * 60);
    if (min === 0) return '—';
    if (min < 60) return `${min}m`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  },
  _capacityToday() {
    const me = State.currentUser ? this._operators.find(o => o.username === State.currentUser.username) : null;
    if (!me) return 8;
    const c = Number(me.dailyCapacityHours);
    return (c > 0 && c <= 24) ? c : 8;
  },

  // ===========================================================
  // HTML
  // ===========================================================
  _viewToggleHtml() {
    const isAdmin = window.Roles && Roles.isAdmin();
    const isToday = this._isToday(this._currentDay);
    const totalTeam = this._allTodayItems.length;
    const movedAwayN = this._movedAway.length;
    const dayLabel = this._dayLabel(this._currentDay);
    return `
      <div class="dt-view-bar">
        <div class="dt-view-bar__info">
          <div class="dt-day-nav">
            <button class="dt-day-nav__btn" data-act="dt-day-prev" title="Giorno precedente">‹</button>
            <span class="dt-day-nav__label ${isToday ? '' : 'is-past'}">${dayLabel}</span>
            <button class="dt-day-nav__btn" data-act="dt-day-next" title="Giorno successivo" ${this._currentDay >= this._todayIso() ? 'disabled' : ''}>›</button>
            ${!isToday ? '<button class="dt-day-nav__today" data-act="dt-day-today" title="Torna a oggi">Oggi</button>' : ''}
          </div>
          ${this._viewMode === 'team'
            ? `<span class="dt-view-bar__meta">${totalTeam} ${totalTeam === 1 ? 'task' : 'task'} ${isToday ? 'oggi' : 'in questo giorno'} nel team${movedAwayN ? ` · ${movedAwayN} riprogrammat${movedAwayN === 1 ? 'a' : 'e'} altrove` : ''}</span>`
            : (movedAwayN ? `<span class="dt-view-bar__meta">${movedAwayN} task riprogrammat${movedAwayN === 1 ? 'a' : 'e'} altrove</span>` : '')}
        </div>
        ${isAdmin ? `
        <div class="dt-view-toggle" role="group" aria-label="Modalità di visualizzazione">
          <button class="dt-view-btn ${this._viewMode === 'personal' ? 'is-active' : ''}" data-act="dt-view-personal" title="La tua to-do personale">👤 La mia giornata</button>
          <button class="dt-view-btn ${this._viewMode === 'team' ? 'is-active' : ''}" data-act="dt-view-team" title="Lo stato delle to-do di tutto il team in questo giorno">👥 Per membro</button>
        </div>` : ''}
      </div>
    `;
  },

  _teamViewHtml() {
    const members = this._teamMembers().slice().sort((a, b) => (a.name || a.username).localeCompare(b.name || b.username));
    if (members.length === 0) {
      return '<div class="dt-empty">Nessun membro del team configurato. Vai in <b>Workload → ⚙ Team &amp; Capacità</b> per aggiungerli.</div>';
    }
    // Riga "Non assegnato" come fascia separata in fondo
    const unassignedItems = this._allTodayItems.filter(w => !w.assignedTo);
    const memberCards = members.map(m => this._teamMemberCardHtml(m)).join('');
    const unassignedCard = unassignedItems.length > 0 ? this._teamUnassignedHtml(unassignedItems) : '';
    return `
      <div class="dt-team-grid">
        ${memberCards}
        ${unassignedCard}
      </div>
    `;
  },

  _teamMemberCardHtml(op) {
    const items = this._itemsOf(op.username);
    const palette = (window.Workload && Workload.ROLE_PALETTE && Workload._primaryRoleKey)
      ? (Workload.ROLE_PALETTE[Workload._primaryRoleKey(op)] || Workload.ROLE_PALETTE.operator)
      : { bg: '#e8e6e0', fg: '#1a1a1a' };
    const initials = (op.name || op.username || '?').split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();
    const rolesLabel = (window.Workload && Workload._rolesLabel) ? Workload._rolesLabel(op) : (op.workRole || op.role || '');
    const cap = (window.Workload && Workload._dailyCapacityOf) ? Workload._dailyCapacityOf(op) : 8;

    const totalH = items.reduce((s, w) => s + (Number(w.weightHours) || 0), 0);
    const done = items.filter(w => w.status === 'done');
    const inProgress = items.filter(w => w.status === 'in_progress');
    const todo = items.filter(w => w.status === 'todo' || w.status === 'blocked');
    const pct = cap > 0 ? Math.min(100, Math.round((totalH / cap) * 100)) : 0;
    const status = (window.Workload && Workload._cellStatus) ? Workload._cellStatus(totalH, cap) : 'ok';
    const isExpanded = this._expandedMember === op.username;

    // Riga di sintesi: avatar + nome + barra + counters
    const counters = items.length === 0
      ? '<span class="dt-team-card__empty">Nessuna task oggi</span>'
      : `<span class="dt-team-counter dt-team-counter--done"  title="Completate">✓ ${done.length}</span>
         <span class="dt-team-counter dt-team-counter--prog"  title="In corso">▶ ${inProgress.length}</span>
         <span class="dt-team-counter dt-team-counter--todo"  title="Da fare">○ ${todo.length}</span>`;

    // Mini-task (collassato): max 3 task in cima per orario, poi "+N"
    const sortedAll = items.slice().sort((a, b) => (a.startTime || '99:99').localeCompare(b.startTime || '99:99'));
    const previewItems = sortedAll.filter(w => w.status !== 'done').slice(0, 3);
    const remaining = sortedAll.filter(w => w.status !== 'done').length - previewItems.length;
    const previewHtml = items.length === 0 ? '' : `
      <div class="dt-team-card__preview">
        ${previewItems.map(w => this._teamMiniRowHtml(w)).join('')}
        ${remaining > 0 ? `<div class="dt-team-mini dt-team-mini--more">+${remaining} altr${remaining === 1 ? 'a' : 'e'}</div>` : ''}
      </div>
    `;

    // Espanso: lista completa task con stesso layout di dt-task
    const expandedHtml = isExpanded ? `
      <div class="dt-team-card__expanded">
        ${inProgress.length > 0 ? `
          <div class="dt-team-section">
            <div class="dt-team-section__label"><span class="dt-section-dot" style="background:#378ADD"></span>In corso ora <span class="dt-section-count">${inProgress.length}</span></div>
            <div class="dt-list">${inProgress.map(w => this._taskRowHtml(w, { inProgress: true })).join('')}</div>
          </div>` : ''}
        ${todo.length > 0 ? `
          <div class="dt-team-section">
            <div class="dt-team-section__label"><span class="dt-section-dot" style="background:#888780"></span>Da fare <span class="dt-section-count">${todo.length}</span></div>
            <div class="dt-list">${todo.map(w => this._taskRowHtml(w)).join('')}</div>
          </div>` : ''}
        ${done.length > 0 ? `
          <div class="dt-team-section">
            <div class="dt-team-section__label"><span class="dt-section-dot" style="background:#639922"></span>Completate <span class="dt-section-count">${done.length}</span></div>
            <div class="dt-list">${done.map(w => this._taskRowHtml(w, { done: true })).join('')}</div>
          </div>` : ''}
        ${items.length === 0 ? '<div class="dt-empty">Nessuna lavorazione assegnata oggi.</div>' : ''}
      </div>
    ` : '';

    return `
      <div class="dt-team-card ${isExpanded ? 'is-expanded' : ''}" data-username="${op.username}">
        <div class="dt-team-card__row">
          ${op.avatar
            ? `<span class="dt-avatar dt-avatar--mid" style="background:${palette.bg}"><img src="${op.avatar}" alt=""></span>`
            : `<span class="dt-avatar dt-avatar--mid" style="background:${palette.bg};color:${palette.fg}">${initials}</span>`}
          <div class="dt-team-card__info">
            <div class="dt-team-card__name">${(op.name || op.username).replace(/[<>]/g, '')}</div>
            <div class="dt-team-card__role">${rolesLabel}</div>
          </div>
          <div class="dt-team-card__load">
            <div class="dt-team-card__load-head">
              <span class="dt-team-card__load-label">Carico</span>
              <span class="dt-team-card__load-val dt-team-card__load-val--${status}">${(window.Workload && Workload._fmtH ? Workload._fmtH(totalH) : totalH.toFixed(1))}h / ${cap}h</span>
            </div>
            <div class="dt-team-bar-track">
              <div class="dt-team-bar dt-team-bar--${status}" style="width:${pct}%"></div>
            </div>
          </div>
          <div class="dt-team-card__counters">${counters}</div>
          <button class="dt-team-card__toggle" type="button" data-act="dt-team-toggle" title="${isExpanded ? 'Collassa' : 'Espandi'}">${isExpanded ? '▴' : '▾'}</button>
        </div>
        ${!isExpanded ? previewHtml : ''}
        ${expandedHtml}
      </div>
    `;
  },

  _teamMiniRowHtml(w) {
    const palette = (window.Workload && Workload._clientPaletteOf)
      ? Workload._clientPaletteOf(w.clientName || 'no')
      : { bg: '#e8e6e0', fg: '#1a1a1a' };
    const isUrgent = (window.Workload && Workload._dueClass)
      ? (Workload._dueClass(w.dueDate, w.status) === 'wl-due--late' || Workload._dueClass(w.dueDate, w.status) === 'wl-due--urgent')
      : false;
    const time = w.startTime || '—';
    return `
      <div class="dt-team-mini ${isUrgent ? 'is-urgent' : ''}" data-id="${w.id}" data-act="dt-team-open" title="${(w.title || '').replace(/"/g,'&quot;')}">
        <span class="dt-team-mini__time">${time}</span>
        <span class="dt-team-mini__dot" style="background:${palette.bg}"></span>
        <span class="dt-team-mini__title">${isUrgent ? '🚩 ' : ''}${(w.title || '— senza titolo —').replace(/[<>]/g, '')}</span>
        <span class="dt-team-mini__dur">${this._fmtDur(w.weightHours)}</span>
      </div>
    `;
  },

  _teamUnassignedHtml(items) {
    const previewItems = items.slice(0, 3);
    const remaining = items.length - previewItems.length;
    const totalH = items.reduce((s, w) => s + (Number(w.weightHours) || 0), 0);
    return `
      <div class="dt-team-card dt-team-card--unassigned" data-username="__unassigned__">
        <div class="dt-team-card__row">
          <span class="dt-avatar dt-avatar--mid dt-avatar--unassigned">?</span>
          <div class="dt-team-card__info">
            <div class="dt-team-card__name">Non assegnato</div>
            <div class="dt-team-card__role">Da distribuire</div>
          </div>
          <div class="dt-team-card__load">
            <div class="dt-team-card__load-head">
              <span class="dt-team-card__load-label">Coda</span>
              <span class="dt-team-card__load-val" style="color:var(--ad-warning)">${this._fmtH ? this._fmtH(totalH) : totalH.toFixed(1)}h totali</span>
            </div>
          </div>
          <div class="dt-team-card__counters">
            <span class="dt-team-counter dt-team-counter--todo">○ ${items.length}</span>
          </div>
          <span class="dt-team-card__toggle dt-team-card__toggle--placeholder">·</span>
        </div>
        <div class="dt-team-card__preview">
          ${previewItems.map(w => this._teamMiniRowHtml(w)).join('')}
          ${remaining > 0 ? `<div class="dt-team-mini dt-team-mini--more">+${remaining} altr${remaining === 1 ? 'a' : 'e'}</div>` : ''}
        </div>
      </div>
    `;
  },

  _headerHtml() {
    const me = State.currentUser;
    const operator = this._operators.find(o => o.username === me.username) || me;
    const palette = (window.Workload && Workload.ROLE_PALETTE && Workload._primaryRoleKey)
      ? (Workload.ROLE_PALETTE[Workload._primaryRoleKey(operator)] || Workload.ROLE_PALETTE.operator)
      : { bg: '#e8e6e0', fg: '#1a1a1a' };
    const initials = (operator.name || operator.username || '?').split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();
    const isToday = this._isToday(this._currentDay);
    const refDate = new Date(this._currentDay);
    const dayLabel = refDate.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }).replace('.', '');
    const dayLabelCap = dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1);
    const hourNow = new Date().getHours();
    let greeting = 'Ciao';
    if (isToday) {
      if (hourNow < 12) greeting = 'Buongiorno';
      else if (hourNow < 18) greeting = 'Buon pomeriggio';
      else greeting = 'Buonasera';
    } else {
      greeting = 'Storico';
    }
    const nameShort = (operator.name || operator.username || '').split(/\s+/)[0];
    const totalTasks = this._items.length;
    const verb = isToday ? 'hai' : 'avevi';
    return `
      <div class="dt-header">
        ${operator.avatar
          ? `<span class="dt-avatar" style="background:${palette.bg}"><img src="${operator.avatar}" alt=""></span>`
          : `<span class="dt-avatar" style="background:${palette.bg};color:${palette.fg}">${initials}</span>`}
        <div>
          <h2 class="dt-greeting">${greeting} ${isToday ? nameShort.replace(/[<>]/g, '') + ' 👋' : '·  ' + nameShort.replace(/[<>]/g, '')}</h2>
          <p class="dt-meta">${dayLabelCap} · ${verb} <b>${totalTasks}</b> ${totalTasks === 1 ? 'attività' : 'attività'} in lista</p>
        </div>
      </div>
    `;
  },

  _metricsHtml() {
    const totalEst   = this._items.reduce((s, w) => s + (Number(w.weightHours) || 0), 0);
    const totalActual = this._items
      .filter(w => w.status === 'done')
      .reduce((s, w) => s + (Number(w.actualHours) || Number(w.weightHours) || 0), 0);
    const completedN = this._items.filter(w => w.status === 'done').length;
    const totalN = this._items.length;
    const cap = this._capacityToday();
    const isOver = totalEst > cap;
    // Prossima task = primo todo/in_progress non done con startTime >= ora oppure il primo todo
    const nowMin = (new Date()).getHours() * 60 + (new Date()).getMinutes();
    const remaining = this._items
      .filter(w => w.status !== 'done')
      .sort((a, b) => (a.startTime || '99:99').localeCompare(b.startTime || '99:99'));
    const nextTask = remaining.find(w => {
      const t = w.startTime;
      if (!t) return false;
      const [h, m] = t.split(':').map(Number);
      return (h * 60 + m) >= nowMin;
    }) || remaining[0] || null;
    const nextLabel = nextTask
      ? (nextTask.title || '— senza titolo —')
      : 'Nessuna in coda';
    const nextSub = nextTask && nextTask.startTime
      ? this._whenLabel(nextTask.startTime, nowMin)
      : (nextTask ? 'non pianificata' : '');
    return `
      <div class="dt-metrics">
        <div class="dt-metric">
          <div class="dt-metric__label">Carico stimato</div>
          <div class="dt-metric__value ${isOver ? 'dt-metric__value--danger' : 'dt-metric__value--success'}">${this._fmtH(totalEst)}h <small>/ ${cap}h</small></div>
        </div>
        <div class="dt-metric">
          <div class="dt-metric__label">Completate</div>
          <div class="dt-metric__value dt-metric__value--success">${completedN} <small>/ ${totalN}</small></div>
        </div>
        <div class="dt-metric">
          <div class="dt-metric__label">Ore tracciate</div>
          <div class="dt-metric__value">${this._fmtDur(totalActual)}</div>
        </div>
        <div class="dt-metric">
          <div class="dt-metric__label">Prossima task</div>
          <div class="dt-metric__value dt-metric__value--small">${nextLabel.replace(/[<>]/g, '')}<br><small>${nextSub}</small></div>
        </div>
      </div>
    `;
  },

  _whenLabel(hhmm, nowMin) {
    const [h, m] = hhmm.split(':').map(Number);
    const taskMin = h * 60 + m;
    const delta = taskMin - nowMin;
    if (delta < 0) return `alle ${hhmm} (in ritardo)`;
    if (delta === 0) return 'ora';
    if (delta < 60) return `tra ${delta} ${delta === 1 ? 'minuto' : 'minuti'}`;
    return `alle ${hhmm}`;
  },

  _inProgressHtml() {
    const inProg = this._items.filter(w => w.status === 'in_progress');
    if (inProg.length === 0) return '';
    return `
      <div class="dt-section-label">
        <span class="dt-section-dot" style="background:#378ADD"></span>
        In corso ora
        <span class="dt-section-count">${inProg.length}</span>
      </div>
      <div class="dt-list">
        ${inProg.map(w => this._taskRowHtml(w, { inProgress: true })).join('')}
      </div>
    `;
  },

  _todoSectionHtml() {
    let todos = this._items
      .filter(w => w.status === 'todo' || w.status === 'blocked')
      .sort((a, b) => (a.startTime || '99:99').localeCompare(b.startTime || '99:99'));
    const totalTodos = todos.length;
    if (totalTodos === 0) {
      return `
        <div class="dt-section-label">
          <span class="dt-section-dot" style="background:#888780"></span>
          Da fare oggi
          <span class="dt-section-count">0</span>
        </div>
        <div class="dt-empty">Nessuna lavorazione in coda per oggi. Quick-add qui sotto se vuoi aggiungerne una al volo.</div>
        ${this._quickAddHtml()}
      `;
    }
    const limited = !this._showAllTodo && totalTodos > this._todoShowLimit;
    const shown = limited ? todos.slice(0, this._todoShowLimit) : todos;
    return `
      <div class="dt-section-label">
        <span class="dt-section-dot" style="background:#888780"></span>
        Da fare oggi
        <span class="dt-section-count">${totalTodos}</span>
      </div>
      <div class="dt-list">
        ${shown.map(w => this._taskRowHtml(w)).join('')}
      </div>
      ${limited ? `
        <div style="text-align:center;padding:8px">
          <button class="btn btn--ghost btn--sm" data-act="dt-show-all">▾ Mostra altre ${totalTodos - this._todoShowLimit} attività</button>
        </div>` : (this._showAllTodo && totalTodos > this._todoShowLimit ? `
        <div style="text-align:center;padding:8px">
          <button class="btn btn--ghost btn--sm" data-act="dt-show-less">▴ Mostra meno</button>
        </div>` : '')}
      ${this._quickAddHtml()}
    `;
  },

  _doneSectionHtml() {
    const done = this._items
      .filter(w => w.status === 'done')
      .sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
    if (done.length === 0) return '';
    const totalActual = done.reduce((s, w) => s + (Number(w.actualHours) || Number(w.weightHours) || 0), 0);
    return `
      <div class="dt-section-label">
        <span class="dt-section-dot" style="background:#639922"></span>
        Completate oggi
        <span class="dt-section-count">${done.length}</span>
        <span class="dt-section-side">${this._fmtDur(totalActual)} tracciate</span>
      </div>
      <div class="dt-list">
        ${done.map(w => this._taskRowHtml(w, { done: true })).join('')}
      </div>
    `;
  },

  /** Sezione "Riprogrammate altrove": task il cui originalDate è il
      giorno selezionato ma scheduledDate è diversa (storico spostamenti). */
  _movedAwaySectionHtml() {
    const me = State.currentUser.username;
    const mine = this._movedAway.filter(w => w.assignedTo === me);
    if (mine.length === 0) return '';
    return `
      <div class="dt-section-label">
        <span class="dt-section-dot" style="background:#EF9F27"></span>
        Riprogrammate altrove
        <span class="dt-section-count">${mine.length}</span>
        <span class="dt-section-side">erano in coda per questo giorno</span>
      </div>
      <div class="dt-list">
        ${mine.map(w => this._movedRowHtml(w)).join('')}
      </div>
    `;
  },

  _movedRowHtml(w) {
    const palette = (window.Workload && Workload._clientPaletteOf)
      ? Workload._clientPaletteOf(w.clientName || 'no')
      : { bg: '#e8e6e0', fg: '#1a1a1a' };
    const clientTag = w.clientName
      ? `<span class="dt-tag" style="background:${palette.bg};color:${palette.fg}">${w.clientName.replace(/[<>]/g, '')}</span>`
      : `<span class="dt-tag dt-tag--empty">—</span>`;
    const targetLabel = this._dayLabel(w.scheduledDate).replace(/^[^·]+·\s*/, '');
    return `
      <div class="dt-task dt-task--moved" data-id="${w.id}" title="Spostata a ${targetLabel}">
        <span class="dt-check" style="opacity:0.3" title="Read-only (storico)">↻</span>
        <span class="dt-time">${w.originalDate}</span>
        <div class="dt-task__main">
          <div class="dt-task__title">${(w.title || '— senza titolo —').replace(/[<>]/g, '')}</div>
          <div class="dt-task__sub">${(w.clientName || '—').replace(/[<>]/g, '')} · <span class="dt-moved-arrow">→ spostata a ${targetLabel}</span></div>
        </div>
        ${clientTag}
        <span class="dt-dur">${this._fmtDur(w.weightHours)}</span>
        <span></span>
        <button class="dt-task__menu" type="button" data-act="dt-open" data-id="${w.id}" title="Dettagli">⋯</button>
      </div>
    `;
  },

  _taskRowHtml(w, opts = {}) {
    const inProg = !!opts.inProgress;
    const isDone = !!opts.done;
    const isUrgent = (window.Workload && Workload._dueClass)
      ? (Workload._dueClass(w.dueDate, w.status) === 'wl-due--late' || Workload._dueClass(w.dueDate, w.status) === 'wl-due--urgent')
      : false;
    const palette = (window.Workload && Workload._clientPaletteOf)
      ? Workload._clientPaletteOf(w.clientName || 'no')
      : { bg: '#e8e6e0', fg: '#1a1a1a' };
    const clientTag = w.clientName
      ? `<span class="dt-tag" style="background:${palette.bg};color:${palette.fg}">${w.clientName.replace(/[<>]/g, '')}</span>`
      : `<span class="dt-tag dt-tag--empty">—</span>`;
    const taskCode = w.taskCode || ('WL-' + String(w.id).padStart(3, '0'));
    const start = w.startTime || '—';
    const dur = this._fmtDur(w.weightHours);
    const actualLabel = isDone && w.actualHours != null
      ? `<span class="dt-actual ${this._actualClass(w.actualHours, w.weightHours)}">${this._fmtDur(w.actualHours)} reali</span>`
      : (isDone ? `<span class="dt-actual" style="color:var(--ad-mute)">— reali</span>` : '<span></span>');
    const inProgressBadge = inProg ? `<span class="dt-progress-badge">▶ In corso</span>` : actualLabel;
    const subline = isDone
      ? `${(w.clientName || '—')} · chiusa ${w.completedAt ? new Date(w.completedAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : ''}`
      : (inProg && w.startTime)
        ? `${(w.clientName || '—')} · ${taskCode} · iniziata alle ${w.startTime}`
        : `${(w.clientName || '—')} · ${taskCode}${w.dueDate && isUrgent ? ' · scadenza oggi' : ''}`;

    return `
      <div class="dt-task ${isDone ? 'is-done' : ''} ${isUrgent && !isDone ? 'is-urgent' : ''} ${inProg ? 'is-in-progress' : ''}" data-id="${w.id}">
        <button class="dt-check ${isDone ? 'is-checked' : ''}" type="button" data-act="dt-toggle-done" data-id="${w.id}" title="${isDone ? 'Riporta a Da fare' : 'Segna come completata'}">${isDone ? '✓' : ''}</button>
        <span class="dt-time">${start}</span>
        <div class="dt-task__main">
          <div class="dt-task__title">${isUrgent && !isDone ? '🚩 ' : ''}${(w.title || '— senza titolo —').replace(/[<>]/g, '')}</div>
          <div class="dt-task__sub">${subline.replace(/[<>]/g, '')}</div>
        </div>
        ${clientTag}
        <span class="dt-dur ${isUrgent && !isDone ? 'dt-dur--urgent' : ''}">${dur}</span>
        ${inProgressBadge}
        <button class="dt-task__menu" type="button" data-act="dt-open" data-id="${w.id}" title="Dettagli">⋯</button>
      </div>
    `;
  },

  _actualClass(actual, estimated) {
    if (!estimated) return '';
    const diff = (actual - estimated) / estimated;
    if (diff > 0.2)  return 'dt-actual--over';
    if (diff < -0.2) return 'dt-actual--under';
    return 'dt-actual--ok';
  },

  _quickAddHtml() {
    if (!this._isToday(this._currentDay)) return '';
    return `
      <form class="dt-quickadd" id="dtQuickAdd">
        <input type="text" id="dtQuickAddInput" placeholder="Aggiungi una task per oggi (premi Invio)…" maxlength="120" autocomplete="off">
        <button type="submit" class="btn btn--ghost btn--sm">+ Aggiungi</button>
      </form>
    `;
  },

  _wrapupHtml() {
    return `
      <div class="dt-wrapup">
        <div>
          <div class="dt-wrapup__title">Wrap-up giornaliero</div>
          <div class="dt-wrapup__sub">A fine giornata genera un report con cosa hai chiuso, cosa è rimasto aperto e le ore tracciate.</div>
        </div>
        <button class="btn btn--primary btn--sm" data-act="dt-wrapup">Genera wrap-up →</button>
      </div>
    `;
  },

  // ===========================================================
  // EVENTS
  // ===========================================================
  _bindToggle() {
    const root = document.getElementById('dailyTodoRoot');
    if (!root) return;
    root.querySelector('[data-act="dt-view-personal"]')?.addEventListener('click', async () => {
      if (this._viewMode === 'personal') return;
      this._viewMode = 'personal';
      await this.render();
    });
    root.querySelector('[data-act="dt-view-team"]')?.addEventListener('click', async () => {
      if (this._viewMode === 'team') return;
      this._viewMode = 'team';
      await this.render();
    });
    // Navigazione giorno (storico)
    root.querySelector('[data-act="dt-day-prev"]')?.addEventListener('click', async () => {
      this._shiftDay(-1);
      await this.render();
    });
    root.querySelector('[data-act="dt-day-next"]')?.addEventListener('click', async () => {
      // Limite: non oltre oggi
      if (this._currentDay >= this._todayIso()) return;
      this._shiftDay(1);
      await this.render();
    });
    root.querySelector('[data-act="dt-day-today"]')?.addEventListener('click', async () => {
      this._currentDay = this._todayIso();
      await this.render();
    });
  },

  _bindTeamView() {
    const root = document.getElementById('dailyTodoRoot');
    if (!root) return;
    // Toggle espansione membro (click su row o su caret)
    root.querySelectorAll('.dt-team-card:not(.dt-team-card--unassigned) .dt-team-card__row').forEach(row => {
      row.addEventListener('click', async (e) => {
        if (e.target.closest('[data-act]') && !e.target.closest('[data-act="dt-team-toggle"]')) return;
        const card = row.closest('.dt-team-card');
        const username = card.dataset.username;
        this._expandedMember = (this._expandedMember === username) ? null : username;
        await this.render();
      });
    });
    // Click su mini-task → modale dettaglio
    root.querySelectorAll('[data-act="dt-team-open"]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(el.dataset.id, 10);
        if (id && window.Workload) {
          Workload._operators = this._teamMembers();
          Workload._clients = this._clients;
          Workload.openDetailModal(id);
        }
      });
    });
    // Click su row task espansa
    root.querySelectorAll('.dt-team-card__expanded .dt-task').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('[data-act]')) return;
        const id = parseInt(row.dataset.id, 10);
        if (id && window.Workload) {
          Workload._operators = this._teamMembers();
          Workload._clients = this._clients;
          Workload.openDetailModal(id);
        }
      });
    });
    // Checkbox toggle done nelle card espanse
    root.querySelectorAll('.dt-team-card__expanded [data-act="dt-toggle-done"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id, 10);
        await this._toggleDone(id);
      });
    });
    // Menu ⋯ task espansa
    root.querySelectorAll('.dt-team-card__expanded [data-act="dt-open"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id, 10);
        if (id && window.Workload) {
          Workload._operators = this._teamMembers();
          Workload._clients = this._clients;
          Workload.openDetailModal(id);
        }
      });
    });
  },

  _bindEvents() {
    const root = document.getElementById('dailyTodoRoot');
    if (!root) return;
    // Toggle done
    root.querySelectorAll('[data-act="dt-toggle-done"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id, 10);
        await this._toggleDone(id);
      });
    });
    // Open detail
    root.querySelectorAll('[data-act="dt-open"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id, 10);
        if (id && window.Workload) {
          Workload._operators = this._operators.filter(u => Array.isArray(u.teams) && u.teams.length > 0);
          Workload._clients = this._clients;
          Workload.openDetailModal(id);
        }
      });
    });
    // Click su riga task → apri dettaglio
    root.querySelectorAll('.dt-task').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('[data-act]')) return;
        const id = parseInt(row.dataset.id, 10);
        if (id && window.Workload) {
          Workload._operators = this._operators.filter(u => Array.isArray(u.teams) && u.teams.length > 0);
          Workload._clients = this._clients;
          Workload.openDetailModal(id);
        }
      });
    });
    // Mostra altre / meno
    root.querySelector('[data-act="dt-show-all"]')?.addEventListener('click', async () => {
      this._showAllTodo = true; await this.render();
    });
    root.querySelector('[data-act="dt-show-less"]')?.addEventListener('click', async () => {
      this._showAllTodo = false; await this.render();
    });
    // Quick add
    const form = root.querySelector('#dtQuickAdd');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = form.querySelector('#dtQuickAddInput');
        const title = (input.value || '').trim();
        if (!title) return;
        await this._quickAdd(title);
        input.value = '';
      });
    }
    // Wrap-up
    root.querySelector('[data-act="dt-wrapup"]')?.addEventListener('click', () => this._generateWrapup());
  },

  async _toggleDone(id) {
    const fresh = await DB.get('workitems', id);
    if (!fresh) return;
    if (fresh.status === 'done') {
      fresh.status = 'todo';
      fresh.progress = 0;
      fresh.completedAt = null;
    } else {
      fresh.status = 'done';
      fresh.progress = 100;
      fresh.completedAt = new Date().toISOString();
      if (fresh.actualHours == null) fresh.actualHours = fresh.weightHours;
    }
    fresh.updatedAt = new Date().toISOString();
    await DB.put('workitems', fresh);
    App._toast(fresh.status === 'done' ? '✓ Task completata' : 'Task riaperta', 'success');
    await this.render();
  },

  async _quickAdd(title) {
    const now = new Date().toISOString();
    const me = State.currentUser;
    const item = {
      syncId: 'dt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      clientId: null,
      clientName: '',
      title,
      description: '',
      area: 'altro',
      assignedTo: me.username,
      assignedBy: me.username,
      scheduledDate: this._todayIso(),
      originalDate: this._todayIso(),
      startTime: null,
      dueDate: null,
      weightHours: 0.5,
      actualHours: null,
      status: 'todo',
      progress: 0,
      rolloverCount: 0,
      trello: { boardUrl: null, boardId: null, listName: null, cardId: null, cardUrl: null },
      source: 'manual',
      createdAt: now,
      createdBy: me.username,
      updatedAt: now,
      completedAt: null,
    };
    await DB.put('workitems', item);
    App._toast('Task aggiunta', 'success');
    await this.render();
  },

  _generateWrapup() {
    const todayLabel = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const done = this._items.filter(w => w.status === 'done');
    const open = this._items.filter(w => w.status !== 'done' && w.status !== 'cancelled');
    const totalEst = this._items.reduce((s, w) => s + (Number(w.weightHours) || 0), 0);
    const totalActual = done.reduce((s, w) => s + (Number(w.actualHours) || Number(w.weightHours) || 0), 0);
    const me = State.currentUser;
    const lines = [];
    lines.push(`WRAP-UP — ${(me.name || me.username)} — ${todayLabel}`);
    lines.push('');
    lines.push(`Totale task del giorno: ${this._items.length}`);
    lines.push(`Completate: ${done.length}`);
    lines.push(`Aperte/in corso: ${open.length}`);
    lines.push(`Carico stimato: ${this._fmtH(totalEst)}h · Ore tracciate: ${this._fmtDur(totalActual)}`);
    lines.push('');
    if (done.length) {
      lines.push('CHIUSE:');
      for (const w of done) {
        const cli = w.clientName ? `[${w.clientName}] ` : '';
        lines.push(`  ✓ ${cli}${w.title} (${this._fmtDur(w.weightHours)}${w.actualHours != null ? ` → ${this._fmtDur(w.actualHours)} reali` : ''})`);
      }
      lines.push('');
    }
    if (open.length) {
      lines.push('RIMASTE APERTE:');
      for (const w of open) {
        const cli = w.clientName ? `[${w.clientName}] ` : '';
        const st = w.status === 'in_progress' ? '▶' : (w.status === 'blocked' ? '⊘' : '○');
        lines.push(`  ${st} ${cli}${w.title} (${this._fmtDur(w.weightHours)})`);
      }
    }
    const txt = lines.join('\n');
    // Mostra modale con il wrap-up + bottoni copia/email
    const overlay = document.createElement('div');
    overlay.className = 'rem-modal wl-modal';
    overlay.innerHTML = `
      <div class="rem-modal__box wl-modal__box dt-wrapup-modal">
        <h3>Wrap-up del ${todayLabel}</h3>
        <textarea class="dt-wrapup-modal__txt" readonly>${txt.replace(/[<>]/g, '')}</textarea>
        <div class="wl-form__foot">
          <button class="btn btn--ghost" data-act="cancel">Chiudi</button>
          <button class="btn btn--secondary" data-act="copy">📋 Copia negli appunti</button>
          <button class="btn btn--primary" data-act="email">✉ Invia via email</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('[data-act="cancel"]').addEventListener('click', close);
    overlay.querySelector('[data-act="copy"]').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(txt); App._toast('Wrap-up copiato', 'success'); } catch {}
    });
    overlay.querySelector('[data-act="email"]').addEventListener('click', () => {
      const subject = `Wrap-up giornaliero ${todayLabel}`;
      const body = encodeURIComponent(txt);
      window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${body}`);
    });
  },
};

window.DailyTodo = DailyTodo;
