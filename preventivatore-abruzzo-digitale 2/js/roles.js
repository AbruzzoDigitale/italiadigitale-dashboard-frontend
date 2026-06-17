/* ============================================================
   ROLES.JS — Permessi e ruoli (admin vs operator)
   v1.4.0: Sistema permessi configurabile per username
   ============================================================ */

const Roles = {
  DEFAULT_OPERATOR_VIEWS: ['dashboard', 'configurator', 'preventivo', 'requests', 'social-plan', 'ped-generator', 'workload', 'operations-board', 'daily-todo'],
  ADMIN_VIEWS: ['dashboard', 'social', 'configurator', 'catalog', 'preventivo', 'requests', 'quotes', 'pipeline', 'oracle', 'contracts', 'social-plan', 'ped-generator', 'workload', 'operations-board', 'daily-todo', 'clients', 'profile', 'brand', 'integrations', 'settings'],

  isAdmin() {
    return State.currentUser && (State.currentUser.role === 'admin' || State.currentUser.role === 'super_admin');
  },
  isSuperAdmin() {
    return State.currentUser && State.currentUser.role === 'super_admin';
  },
  isOperator() {
    return State.currentUser && State.currentUser.role === 'operator';
  },

  async getAllowedViews() {
    if (this.isAdmin()) return this.ADMIN_VIEWS.slice();
    if (!State.currentUser) return [];
    const perms = await DB.getSetting('operator_permissions', {});
    const userPerms = perms[State.currentUser.username];
    if (userPerms && Array.isArray(userPerms) && userPerms.length > 0) {
      return userPerms.slice();
    }
    return this.DEFAULT_OPERATOR_VIEWS.slice();
  },

  async apply() {
    const html = document.documentElement;
    html.classList.toggle('role-operator', this.isOperator());
    html.classList.toggle('role-admin', this.isAdmin());
    const allowed = await this.getAllowedViews();
    document.querySelectorAll('.nav-link[data-view]').forEach(link => {
      const view = link.dataset.view;
      link.style.display = allowed.includes(view) ? '' : 'none';
    });
    document.querySelectorAll('.dash-cta[data-go]').forEach(cta => {
      const view = cta.dataset.go;
      cta.style.display = allowed.includes(view) ? '' : 'none';
    });
    const badge = document.getElementById('roleBadge');
    if (badge) {
      if (this.isAdmin()) { badge.textContent = 'Admin'; badge.className = 'role-badge role-badge--admin'; }
      else if (this.isOperator()) { badge.textContent = 'Operatore'; badge.className = 'role-badge role-badge--operator'; }
      else { badge.style.display = 'none'; }
    }
    this._updateButtonLabels();
  },

  _updateButtonLabels() {
    const op = this.isOperator();
    const saveBtn = document.getElementById('saveQuoteBtn');
    if (saveBtn) saveBtn.textContent = op ? "Invia richiesta all'admin" : 'Salva preventivo';
    const sendFic = document.getElementById('sendToFicBtn');
    if (sendFic) sendFic.style.display = op ? 'none' : '';
    const presentBtn = document.getElementById('presentQuoteBtn');
    if (presentBtn) presentBtn.style.display = op ? 'none' : '';
    const exportPdf = document.getElementById('exportPdfBtn');
    if (exportPdf) exportPdf.style.display = op ? 'none' : '';
  },

  async seedDefaultOperator() {
    const users = await DB.all('users');
    const hasOperator = users.some(u => u.role === 'operator');
    if (!hasOperator) {
      await DB.put('users', { username: 'operatore', password: 'op2026', name: 'Operatore', role: 'operator' });
    }
    const refreshed = await DB.all('users');
    for (const u of refreshed) {
      if (!u.role) { u.role = 'admin'; await DB.put('users', u); }
    }
  },

  async setUserPermissions(username, views) {
    const perms = await DB.getSetting('operator_permissions', {});
    perms[username] = views;
    await DB.setSetting('operator_permissions', perms);
  },

  async getUserPermissions(username) {
    const perms = await DB.getSetting('operator_permissions', {});
    return perms[username] || this.DEFAULT_OPERATOR_VIEWS.slice();
  },

  getViewCatalog() {
    return [
      { id: 'dashboard',    label: 'Dashboard' },
      { id: 'social',       label: 'Pacchetti Social' },
      { id: 'configurator', label: 'Configuratore' },
      { id: 'catalog',      label: 'Listino Servizi' },
      { id: 'preventivo',   label: 'Editor Preventivo' },
      { id: 'requests',     label: 'Richieste' },
      { id: 'quotes',       label: 'Storico Preventivi' },
      { id: 'pipeline',     label: 'Pipeline commerciale' },
      { id: 'oracle',       label: 'Oracolo' },
      { id: 'contracts',    label: 'Situazione clienti' },
      { id: 'social-plan',  label: 'Situazione operativa' },
      { id: 'ped-generator', label: 'Generatore PED' },
      { id: 'workload',     label: 'Workload' },
      { id: 'operations-board', label: 'Board lavorazioni' },
      { id: 'daily-todo',   label: 'Attività del giorno' },
      { id: 'clients',      label: 'Clienti' },
      { id: 'brand',        label: 'Personalizza' },
      { id: 'settings',     label: 'Impostazioni' },
    ];
  },
};

window.Roles = Roles;
