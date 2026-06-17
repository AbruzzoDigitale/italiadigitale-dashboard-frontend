/* ============================================================
   APP.JS — Bootstrap, router, event listeners
   ============================================================ */

const App = {

  async init() {
    // 1) PRIMA collego gli event listeners: cosi il login funziona anche se altro fallisce
    try { this._bindEvents(); } catch (e) { console.error('Bind events failed:', e); }

    // 2) Online status indicator
    window.addEventListener('online',  () => this._updateConnection());
    window.addEventListener('offline', () => this._updateConnection());
    try { this._updateConnection(); } catch (e) {}

    // 3) Service worker (silenzioso su file://)
    if ('serviceWorker' in navigator) {
      try {
        // Quando un nuovo SW prende il controllo, ricarico UNA volta
        // così l'app usa subito il codice aggiornato (no cache vecchia).
        let _swReloaded = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (_swReloaded) return;
          _swReloaded = true;
          location.reload();
        });
        // Listener per messaggi dal SW (es. "sw-updated" dopo l'activate).
        // Garantisce il reload anche quando controllerchange non parte
        // (es. prima installazione, edge case con MessageChannel).
        navigator.serviceWorker.addEventListener('message', (ev) => {
          if (ev.data && ev.data.type === 'sw-updated') {
            if (_swReloaded) return;
            _swReloaded = true;
            console.log('[sw] Aggiornato a', ev.data.version, '— reload');
            location.reload();
          }
        });
        const reg = await navigator.serviceWorker.register('sw.js');
        try { await reg.update(); } catch (e) {}
        // Se c'è un SW "waiting" (installato ma non ancora attivo),
        // forzalo ad attivarsi subito senza richiedere chiusura tab.
        if (reg.waiting) reg.waiting.postMessage({ type: 'skip-waiting' });
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (nw) nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              // Nuovo SW installato e c'è già un controller: aspetterebbe il
              // prossimo "free" tab. Forziamo lo skip.
              nw.postMessage({ type: 'skip-waiting' });
            }
          });
        });
      } catch (e) { /* file:// non supporta SW */ }
    }

    // 4) Carica listino — wrappato per non bloccare l'app se IDB fallisce
    try {
      await Listino.load();
    } catch (e) {
      console.error('Caricamento listino fallito:', e);
    }

    // 4b) Carica regole configuratore (flag manutenzione/gestione)
    try { if (window.Configurator && Configurator.loadRules) await Configurator.loadRules(); } catch (e) {}

    // 5) Restore session se valida
    let restored = false;
    try { restored = await State.restoreSession(); } catch (e) { console.warn('Restore session failed:', e); }
    if (restored) this.showApp();
    else this.showLogin();
  },

  _updateConnection() {
    const online = navigator.onLine;
    State.online = online;
    const pill = document.getElementById('connPill');
    const lbl = document.getElementById('connLabel');
    pill.classList.toggle('online', online);
    pill.classList.toggle('offline', !online);
    lbl.textContent = online ? 'Online' : 'Offline';
  },

  // ============================================================
  // ROUTER
  // ============================================================
  async navigate(view) {
    // 'profile' è stato accorpato in 'Personalizza' (view-brand)
    if (view === 'profile') view = 'brand';
    State.currentView = view;
    document.querySelectorAll('.nav-link').forEach(l => l.classList.toggle('is-active', l.dataset.view === view));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('is-active', v.id === `view-${view}`));
    // 'brand' è la vista Personalizza: attivo anche view-profile (Profilo)
    if (view === 'brand') {
      const vp = document.getElementById('view-profile');
      if (vp) vp.classList.add('is-active');
    }

    const titles = {
      dashboard:   ['Dashboard', 'Benvenuto in Abruzzo Digitale'],
      social:      ['Pacchetti Social Media', 'La prima cosa che ogni cliente ti chiede'],
      configurator: ['Configuratore Modulare', 'Componi un preventivo trascinando le box'],
      catalog:     ['Listino Servizi', '71 servizi · 21 categorie'],
      preventivo:  ['Editor Preventivo', 'Costruisci o modifica un preventivo'],
      requests:    ['Richieste', 'Workflow approvazione preventivi'],
      quotes:      ['Storico Preventivi', 'Tutti i tuoi preventivi'],
      pipeline:    ['Pipeline commerciale', 'Andamento dei preventivi nel funnel di vendita'],
      oracle:      ['Oracolo', 'Chiedi qualcosa ai tuoi dati'],
      contracts:   ['Situazione clienti', 'Contratti firmati e attivi'],
      'social-plan': ['Situazione operativa', 'Stato attività cliente × mese'],
      'ped-generator': ['Generatore PED', 'Produzione piani editoriali social step-by-step'],
      workload:    ['Workload', 'Timeline settimanale con carico orario degli operatori'],
      'operations-board': ['Board lavorazioni', 'Kanban delle lavorazioni per stato con badge peso ore'],
      'daily-todo': ['Attività del giorno', 'La tua to-do list di oggi'],
      clients:     ['Clienti', 'Anagrafica clienti agenzia'],
      brand:        ['Personalizza', 'Profilo, brand agenzia e schermata di login'],
      integrations: ['Integrazioni', 'Collegamenti ai servizi esterni'],
      settings:     ['Impostazioni', 'Configurazione preventivatore'],
    };
    if (titles[view]) {
      document.getElementById('topbarTitle').textContent = titles[view][0];
      document.getElementById('topbarSub').textContent = titles[view][1];
    }

    // Render specifico per vista
    if (view === 'dashboard') await Views.renderDashboard();
    else if (view === 'social') Views.renderSocialDeck();
    else if (view === 'catalog') Views.renderCatalog();
    else if (view === 'preventivo') await Views.renderQuoteEditor();
    else if (view === 'requests') await Views.renderRequests();
    else if (view === 'contracts' && window.Contracts) await Contracts.render();
    else if (view === 'social-plan' && window.SocialPlan) await SocialPlan.render();
    else if (view === 'ped-generator' && window.PedGenerator) await PedGenerator.render();
    else if (view === 'oracle' && window.Oracle) await Oracle.render();
    else if (view === 'quotes') await Views.renderQuotes();
    else if (view === 'pipeline' && window.Pipeline) await Pipeline.render();
    else if (view === 'workload' && window.Workload) await Workload.render();
    else if (view === 'operations-board' && window.OperationsBoard) await OperationsBoard.render();
    else if (view === 'daily-todo' && window.DailyTodo) await DailyTodo.render();
    else if (view === 'clients') await Views.renderClients();
    else if (view === 'settings') await this._loadSettings();
    // Sempre: aggiorna il badge richieste in nav
    await this._updateRequestsBadge();
  },

  async _updateRequestsBadge() {
    try {
      const badge = document.getElementById('navRequestsBadge');
      const bell = document.getElementById('notifBell');
      const bellDot = document.getElementById('notifBellDot');
      const quotes = await DB.all('quotes');
      const isAdmin = window.Roles && Roles.isAdmin();
      const isOperator = window.Roles && Roles.isOperator();
      let n = 0;
      if (isAdmin) {
        n = quotes.filter(q => q.status === 'da_approvare').length;
      } else if (isOperator) {
        const me = State.currentUser && State.currentUser.username;
        n = quotes.filter(q => q.requestedBy === me && q.status === 'da_approvare').length;
      }
      // Suono di notifica (solo admin, solo quando il conteggio AUMENTA).
      // Al primo giro impostiamo la baseline senza suonare.
      if (isAdmin) {
        if (this._lastRequestCount == null) this._lastRequestCount = n;
        else if (n > this._lastRequestCount) {
          this._playNotificationSound().catch(() => {});
        }
        this._lastRequestCount = n;
      }
      // Nav badge in sidebar
      if (badge) {
        if (n > 0) { badge.textContent = n; badge.style.display = 'inline-flex'; }
        else { badge.style.display = 'none'; }
      }
      // Campanello in topbar
      if (bell && bellDot) {
        if (n > 0) {
          bell.classList.add('has-notifications');
          bellDot.textContent = n;
          bellDot.style.display = 'inline-flex';
        } else {
          bell.classList.remove('has-notifications');
          bellDot.style.display = 'none';
        }
      }
    } catch (e) { console.warn('updateRequestsBadge failed:', e); }
  },

  async openRequest(id) {
    const q = await DB.get('quotes', id);
    if (!q) return;
    // Quando admin "apre e completa" una richiesta: cambia stato a in_revisione e va nell'editor
    q.status = 'in_revisione';
    q.approvedBy = State.currentUser ? State.currentUser.username : null;
    q.approvedAt = new Date().toISOString();
    await DB.put('quotes', q);
    State.currentQuote = q;
    this.navigate('preventivo');
  },

  async withdrawRequest(id) {
    if (!confirm('Annullare questa richiesta? Verrà rimossa dalla coda admin.')) return;
    const q = await DB.get('quotes', id);
    if (!q) return;
    // Cancello del tutto se non è ancora stata aperta dall'admin
    await DB.delete('quotes', id);
    this._toast('Richiesta annullata', 'success');
    await Views.renderRequests();
    await this._updateRequestsBadge();
  },

  async rejectRequest(id) {
    if (!confirm('Rifiutare questa richiesta? Lo stato passerà a "rifiutato".')) return;
    const q = await DB.get('quotes', id);
    if (!q) return;
    q.status = 'rifiutato';
    q.rejectedBy = State.currentUser ? State.currentUser.username : null;
    q.rejectedAt = new Date().toISOString();
    await DB.put('quotes', q);
    this._toast('Richiesta rifiutata', 'success');
    await Views.renderRequests();
    await this._updateRequestsBadge();
  },

  // ============================================================
  // LOGIN
  // ============================================================
  showLogin() {
    document.getElementById('loginScreen').classList.add('is-active');
    document.getElementById('app').style.display = 'none';
  },

  /** Sconnetti: torna al login per cambiare account (admin/operatore). */
  doLogout() {
    if (!confirm('Sconnettersi e tornare al login?')) return;
    try { State.logout(); } catch (e) {}
    try { if (window.Sync && Sync.logout) Sync.logout(); } catch (e) {}
    // Reset stato volatile e classi ruolo, così il prossimo login è pulito
    State.currentUser = null;
    State.currentQuote = null;
    State.cart = [];
    document.documentElement.classList.remove('role-operator', 'role-admin');
    const uf = document.getElementById('loginUser'); if (uf) uf.value = '';
    const pf = document.getElementById('loginPass'); if (pf) pf.value = '';
    this.showLogin();
    this._toast('Sconnesso', 'success');
  },

  showApp() {
    document.getElementById('loginScreen').classList.remove('is-active');
    document.getElementById('app').style.display = 'grid';
    const u = State.currentUser;
    if (u) {
      document.getElementById('userName').textContent = u.name;
      document.getElementById('userAvatar').textContent = u.name.charAt(0).toUpperCase();
      document.getElementById('dashUserName').textContent = u.name;
      // CRITICAL: applica subito la classe ruolo a <html> per attivare i CSS prezzi/totali
      document.documentElement.classList.toggle('role-operator', u.role === 'operator');
      document.documentElement.classList.toggle('role-admin',    u.role === 'admin');
      // CRITICAL: applica subito i permessi nav in modo SINCRONO (no IDB lookup) per operator default
      if (u.role === 'operator') {
        const DEFAULT_OP_VIEWS = ['dashboard', 'configurator', 'preventivo', 'requests'];
        document.querySelectorAll('.nav-link[data-view]').forEach(link => {
          link.style.display = DEFAULT_OP_VIEWS.includes(link.dataset.view) ? '' : 'none';
        });
        document.querySelectorAll('.dash-cta[data-go]').forEach(cta => {
          cta.style.display = DEFAULT_OP_VIEWS.includes(cta.dataset.go) ? '' : 'none';
        });
        // Badge ruolo
        const badge = document.getElementById('roleBadge');
        if (badge) { badge.textContent = 'Operatore'; badge.className = 'role-badge role-badge--operator'; }
      } else {
        const badge = document.getElementById('roleBadge');
        if (badge) { badge.textContent = 'Admin'; badge.className = 'role-badge role-badge--admin'; }
      }
    }
    // Chiama Roles.apply asincrono per override da permessi DB (se admin ha personalizzato)
    if (window.Roles && typeof Roles.apply === 'function') {
      try { Roles.apply().catch(e => console.warn('Roles.apply errore:', e)); } catch (e) { console.warn(e); }
    }
    // Badge richieste in sidebar
    this._updateRequestsBadge();
    this.navigate('dashboard');
  },

  /** Wrapper chiamato direttamente da onsubmit dell'HTML — non dipende da bind events */
  handleLoginFromForm() {
    try {
      const u = (document.getElementById('loginUser') || {}).value || '';
      const p = (document.getElementById('loginPass') || {}).value || '';
      console.log('[handleLoginFromForm] u=', u, 'p.length=', p.length);
      return this.handleLogin(u, p);
    } catch (e) {
      console.error('[handleLoginFromForm] errore:', e);
      const err = document.getElementById('loginError');
      if (err) { err.textContent = 'Errore: ' + e.message; err.style.display = 'block'; }
    }
  },

  async handleLogin(username, password) {
    const ok = await State.login(username, password);
    if (ok) {
      this.showApp();
      this._toast(`Benvenuto, ${State.currentUser.name}`, 'success');
    } else {
      document.getElementById('loginError').style.display = 'block';
      setTimeout(() => document.getElementById('loginError').style.display = 'none', 3000);
    }
  },

  // ============================================================
  // EVENTS
  // ============================================================
  _bindEvents() {

    // Login form (ridondante: il form ha gia onsubmit inline)
    try {
      const lf = document.getElementById('loginForm');
      if (lf) lf.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleLoginFromForm();
      });
    } catch (e) { console.warn('Bind login fallito:', e); }

    // Sidebar nav
    document.querySelectorAll('.nav-link[data-view]').forEach(link => {
      link.addEventListener('click', () => this.navigate(link.dataset.view));
    });
    // Dashboard CTAs
    document.querySelectorAll('[data-go]').forEach(el => {
      el.addEventListener('click', () => this.navigate(el.dataset.go));
    });

    // ---- Pack config ----
    ['packMonths', 'packBilling', 'packDiscountPct', 'packDiscountEur', 'packNotes'].forEach(id => {
      document.getElementById(id).addEventListener('input', () => Views.recalcPackConfig());
    });
    document.getElementById('packAddExtra').addEventListener('click', () => {
      Views.openProductPicker((product) => Views.addPackExtra(product));
    });
    document.getElementById('packCancel').addEventListener('click', () => {
      document.getElementById('packConfigBlock').style.display = 'none';
      State.packConfig = null;
      document.querySelectorAll('#socialDeck .social-pack').forEach(c => c.classList.remove('is-selected'));
    });
    document.getElementById('packCreateQuote').addEventListener('click', () => {
      const q = Views.packToQuote();
      if (!q) return;
      this._toast(`Pacchetto ${State.packConfig.pack.name} aggiunto al preventivo`, 'success');
      this.navigate('preventivo');
    });
    document.getElementById('socialCustomBtn').addEventListener('click', () => {
      // Apri config con un pacchetto custom virtuale
      const custom = {
        id: 'custom', name: 'Custom', accent: 'visibility', minMonths: 1,
        tagline: 'Pacchetto personalizzato. Parti da una base e costruisci la tua proposta.',
        price: 650, included: [], monthly: [],
      };
      Views.openPackConfig(custom);
    });
    document.getElementById('socialPresentBtn').addEventListener('click', () => {
      Views.openPresentation(false);
    });

    // ---- Catalog ----
    document.getElementById('catSearch').addEventListener('input', (e) => {
      Views.state.catSearch = e.target.value;
      Views.renderCatalog();
    });
    document.getElementById('catSort').addEventListener('change', (e) => {
      Views.state.catSort = e.target.value;
      Views.renderCatalog();
    });
    document.getElementById('goToQuoteFromCatalog').addEventListener('click', () => {
      if (State.cart.length === 0) {
        this._toast('Aggiungi prima dei servizi al preventivo', 'error');
        return;
      }
      State.createNewQuote();
      this.navigate('preventivo');
    });

    // ---- Preventivo editor ----
    document.getElementById('quoteClient').addEventListener('change', async (e) => {
      const id = parseInt(e.target.value) || null;
      State.currentQuote.clientId = id;
      // CRITICO: popoliamo anche clientName e clientSyncId. Il backend usa
      // questi due campi (non l'id IndexedDB) per agganciare il quote al cliente
      // in Situazione operativa, Oracolo, fatturazione. Senza di loro il quote
      // resta "orfano" e non appare nelle viste cross-modulo.
      if (id != null) {
        try {
          const c = await DB.get('clients', id);
          if (c) {
            State.currentQuote.clientName  = c.name || c.ragioneSociale || '';
            State.currentQuote.clientSyncId = c.syncId || null;
          }
        } catch (err) { console.warn('Lookup cliente fallito:', err); }
      } else {
        State.currentQuote.clientName  = '';
        State.currentQuote.clientSyncId = null;
      }
    });
    document.getElementById('quoteDate').addEventListener('change', (e) => {
      State.currentQuote.date = e.target.value;
    });
    document.getElementById('quoteNotes').addEventListener('input', (e) => {
      State.currentQuote.notes = e.target.value;
    });
    const appEl = document.getElementById('quoteAppuntiCommerciali');
    if (appEl) appEl.addEventListener('input', (e) => {
      State.currentQuote.appuntiCommerciali = e.target.value;
    });
    const briefEl = document.getElementById('quoteBriefOperativo');
    if (briefEl) briefEl.addEventListener('input', (e) => {
      State.currentQuote.briefOperativo = e.target.value;
    });
    ['quoteGlobalDiscPct', 'quoteGlobalDiscEur'].forEach(id => {
      document.getElementById(id).addEventListener('input', () => Views.recalcQuote());
    });
    document.getElementById('addLineBtn').addEventListener('click', () => {
      Views.openProductPicker((product) => {
        State.currentQuote.lines.push({
          productId: product.id,
          name: product.name,
          category: product.category,
          net: product.net,
          vat: product.vat,
          udm: product.udm,
          quantity: 1,
          discountPct: 0,
        });
        Views.renderLines();
        Views.recalcQuote();
      });
    });
    document.getElementById('newClientBtn').addEventListener('click', () => this.openClientModal());
    document.getElementById('newClientBtn2').addEventListener('click', () => this.openClientModal());

    document.getElementById('saveQuoteBtn').addEventListener('click', async () => {
      if (!State.currentQuote.clientId) {
        this._toast('Seleziona un cliente prima di salvare', 'error');
        return;
      }
      // Se operatore, marca come 'da_approvare'
      if (window.Roles && Roles.isOperator()) {
        State.currentQuote.status = 'da_approvare';
        State.currentQuote.requestedBy = State.currentUser.username;
      }
      await State.saveQuote();
      const msg = (window.Roles && Roles.isOperator()) ? 'Richiesta inviata all\'admin' : 'Preventivo salvato';
      this._toast(msg, 'success');
      this.navigate('quotes');
    });

    document.getElementById('presentQuoteBtn').addEventListener('click', () => {
      Views.openPresentation(true);
    });

    document.getElementById('sendToFicBtn').addEventListener('click', async () => {
      await this.sendQuoteToFic();
    });

    document.getElementById('exportPdfBtn').addEventListener('click', () => {
      window.print();
    });

    // ---- Storico ----
    document.getElementById('quotesSearch').addEventListener('input', () => Views.renderQuotes());
    document.getElementById('quotesFilter').addEventListener('change', () => Views.renderQuotes());

    // ---- Clienti ----
    document.getElementById('clientsSearch').addEventListener('input', () => Views.renderClients());
    document.getElementById('clientForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.saveClient();
    });

    // ---- Presentazione ----
    document.getElementById('presentationClose').addEventListener('click', () => Views.closePresentation());
    document.getElementById('presentationDiscount').addEventListener('input', () => Views._updatePresentationTotal());
    document.getElementById('presentationSave').addEventListener('click', () => this.savePresentationAsQuote());

    // ---- Modals ----
    document.querySelectorAll('[data-close-modal]').forEach(el => {
      el.addEventListener('click', () => {
        el.closest('.modal-overlay').classList.remove('is-active');
      });
    });
    document.getElementById('pickerSearch').addEventListener('input', (e) => {
      Views.renderPicker(e.target.value);
    });

    // ---- Settings ----
    document.getElementById('saveFicBtn').addEventListener('click', () => this.saveFicCredentials());
    const syncListinoBtn = document.getElementById('syncListinoBtn');
    if (syncListinoBtn) syncListinoBtn.addEventListener('click', () => this.syncListinoFromFic());
    const syncClientsBtn = document.getElementById('syncClientsFromFicBtn');
    if (syncClientsBtn) syncClientsBtn.addEventListener('click', () => this.syncClientsFromFic());

    // Situazione clienti: filtri area + ricerca + toggle vista
    document.querySelectorAll('[data-contracts-filter]').forEach(b => {
      b.addEventListener('click', () => window.Contracts && Contracts.setAreaFilter(b.dataset.contractsFilter));
    });
    document.querySelectorAll('[data-contracts-type-filter]').forEach(b => {
      b.addEventListener('click', () => window.Contracts && Contracts.setTypeFilter(b.dataset.contractsTypeFilter));
    });
    document.querySelectorAll('[data-view-mode]').forEach(b => {
      b.addEventListener('click', () => window.Contracts && Contracts.setViewMode(b.dataset.viewMode));
    });
    const cSearch = document.getElementById('contractsSearch');
    if (cSearch) cSearch.addEventListener('input', () => window.Contracts && Contracts.render());
    document.getElementById('saveAgencyBtn').addEventListener('click', () => this.saveAgencyData());
    const saveOpPermsBtn = document.getElementById('saveOperatorPermsBtn');
    if (saveOpPermsBtn) saveOpPermsBtn.addEventListener('click', () => this.saveOperatorPermissions());
    const saveRulesBtn = document.getElementById('saveConfigRulesBtn');
    if (saveRulesBtn) saveRulesBtn.addEventListener('click', () => this.saveConfigRules());
    const syncBtn = document.getElementById('syncBtn');
    if (syncBtn) syncBtn.addEventListener('click', () => this.syncListinoFromFic());
    const bell = document.getElementById('notifBell');
    if (bell) bell.addEventListener('click', async () => {
      if (window.Sync && Sync.refreshNow) { try { await Sync.refreshNow(); } catch (e) {} }
      this.navigate('requests');
    });

    // Menu utente: click sull'avatar apre dropdown (Personalizza / Disconnetti)
    this._bindUserMenu();
  },

  _bindUserMenu() {
    const chip = document.getElementById('userChip');
    const menu = document.getElementById('userMenu');
    if (!chip || !menu) return;
    const close = () => { menu.hidden = true; chip.classList.remove('is-open'); };
    const open  = () => { menu.hidden = false; chip.classList.add('is-open'); };
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.hidden ? open() : close();
    });
    chip.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); menu.hidden ? open() : close(); }
      if (e.key === 'Escape') close();
    });
    document.addEventListener('click', (e) => {
      if (!menu.hidden && !menu.contains(e.target) && !chip.contains(e.target)) close();
    });
    menu.querySelectorAll('[data-act]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        close();
        const act = btn.dataset.act;
        if (act === 'profile') this.navigate('brand');     // Personalizza (view unica)
        else if (act === 'logout') this.doLogout();
      });
    });
  },

  // ============================================================
  // CLIENT modal
  // ============================================================
  _editingClientId: null,
  openClientModal(client) {
    this._editingClientId = client ? client.id : null;
    document.getElementById('clientModalTitle').textContent = client ? 'Modifica cliente' : 'Nuovo cliente';
    const fields = ['cliName','cliContact','cliVat','cliCf','cliEmail','cliPhone','cliAddr','cliCity','cliZip','cliProv','cliSdi','cliPec'];
    const fkeys =  ['name','contact','vat','cf','email','phone','addr','city','zip','prov','sdi','pec'];
    fields.forEach((f, i) => {
      document.getElementById(f).value = client ? (client[fkeys[i]] || '') : '';
    });
    document.getElementById('clientModal').classList.add('is-active');
  },

  async saveClient() {
    const client = {
      name:    document.getElementById('cliName').value,
      contact: document.getElementById('cliContact').value,
      vat:     document.getElementById('cliVat').value,
      cf:      document.getElementById('cliCf').value,
      email:   document.getElementById('cliEmail').value,
      phone:   document.getElementById('cliPhone').value,
      addr:    document.getElementById('cliAddr').value,
      city:    document.getElementById('cliCity').value,
      zip:     document.getElementById('cliZip').value,
      prov:    document.getElementById('cliProv').value,
      sdi:     document.getElementById('cliSdi').value,
      pec:     document.getElementById('cliPec').value,
      updatedAt: new Date().toISOString(),
    };
    if (this._editingClientId) client.id = this._editingClientId;
    const id = await DB.put('clients', client);
    document.getElementById('clientModal').classList.remove('is-active');
    this._toast(this._editingClientId ? 'Cliente aggiornato' : 'Cliente creato', 'success');
    this._editingClientId = null;
    // Se siamo nell'editor preventivo, ricarica la dropdown
    if (State.currentView === 'preventivo') {
      await Views.renderQuoteEditor();
      State.currentQuote.clientId = id;
      document.getElementById('quoteClient').value = id;
    } else if (State.currentView === 'clients') {
      Views.renderClients();
    }
  },

  async editClient(id) {
    const c = await DB.get('clients', id);
    if (c) this.openClientModal(c);
  },

  async deleteClient(id) {
    if (!confirm('Eliminare questo cliente?')) return;
    await DB.delete('clients', id);
    this._toast('Cliente eliminato', 'success');
    Views.renderClients();
  },

  // ============================================================
  // QUOTE actions
  // ============================================================
  async openQuote(id) {
    await State.loadQuote(id);
    this.navigate('preventivo');
  },

  async duplicateQuote(id) {
    await State.duplicateQuote(id);
    this._toast('Preventivo duplicato', 'success');
    this.navigate('preventivo');
  },

  async deleteQuote(id) {
    if (!confirm('Eliminare questo preventivo?')) return;
    await DB.delete('quotes', id);
    this._toast('Preventivo eliminato', 'success');
    Views.renderQuotes();
  },

  async savePresentationAsQuote() {
    if (State.presentationSelection.size === 0 && !State.currentQuote) {
      this._toast('Seleziona almeno un pacchetto', 'error');
      return;
    }
    if (State.presentationSelection.size > 0) {
      State.createNewQuote();
      State.presentationSelection.forEach(id => {
        const p = SOCIAL_PACKAGES.find(x => x.id === id);
        if (p) State.currentQuote.lines.push({
          productId: null,
          name: `Pacchetto Social Media ${p.name}`,
          category: 'Social media management',
          net: p.price,
          vat: 0.22,
          udm: 'Mese',
          quantity: 6,
          discountPct: 0,
        });
      });
      const discPct = parseFloat(document.getElementById('presentationDiscount').value) || 0;
      State.currentQuote.discountPct = discPct;
    }
    Views.closePresentation();
    this.navigate('preventivo');
  },

  // ============================================================
  // FIC
  // ============================================================

  /** Sincronizza il listino dai prodotti di Fatture in Cloud:
      - aggiorna/aggiunge i prodotti locali (Listino.products)
      - tenta auto-match per nome con i box del configuratore
      - salva la mappa box→ficProductId (sincronizzata via backend)
      - aggiorna la vista catalogo se attiva. */
  async syncListinoFromFic() {
    this._toast('Sincronizzo il listino da Fatture in Cloud…', 'info');
    try {
      const ficProducts = await FIC.fetchProducts();
      if (!Array.isArray(ficProducts) || !ficProducts.length) {
        this._toast('Nessun prodotto restituito da Fatture in Cloud', 'error');
        return;
      }
      const r = await Listino.updateFromFic(ficProducts);
      let mappati = 0;
      let autoPop = 0;
      if (window.Configurator) {
        if (Configurator.autoMatchFromFic) {
          mappati = Configurator.autoMatchFromFic(ficProducts);
          if (mappati > 0) await DB.setSetting('configurator_fic_mapping', Configurator.buildFicMapping());
        }
        if (Configurator.populateFromListino) {
          autoPop = Configurator.populateFromListino(ficProducts);
        }
      }
      if (State.currentView === 'catalog' && Views.renderCatalog) Views.renderCatalog();
      if (State.currentView === 'configurator' && window.ConfigView) ConfigView.render();
      this._toast(`Listino sincronizzato: ${r.aggiornati} aggiornati, ${r.aggiunti} nuovi, ${mappati} voci configuratore collegate, ${autoPop} voci Grafica caricate`, 'success');
    } catch (e) {
      console.error('syncListinoFromFic:', e);
      this._toast('Errore sync listino: ' + (e.message || e), 'error');
    }
  },

  /** Sincronizza anagrafica clienti da Fatture in Cloud. */
  async syncClientsFromFic() {
    this._toast('Sincronizzo clienti da Fatture in Cloud…', 'info');
    try {
      if (!window.Sync || !Sync.enabled() || !Sync._loadToken()) {
        return this._toast('Backend non disponibile (rilogga)', 'error');
      }
      const ficClients = await Sync._api('GET', '/fic/clients');
      if (!Array.isArray(ficClients)) return this._toast('Risposta inattesa da FiC', 'error');
      const local = await DB.all('clients');
      const byVat = new Map(local.filter(c => c.vat).map(c => [String(c.vat).trim(), c]));
      const byName = new Map(local.map(c => [(c.name || '').toLowerCase().trim(), c]));
      let aggiunti = 0, aggiornati = 0;
      for (const f of ficClients) {
        const incoming = {
          ficId: f.id,
          name: f.name || '',
          vat: f.vat_number || '',
          cf: f.tax_code || '',
          addr: f.address_street || '',
          zip: f.address_postal_code || '',
          city: f.address_city || '',
          prov: f.address_province || '',
          email: f.email || '',
          pec: f.certified_email || '',
          sdi: f.ei_code || '',
          phone: f.phone || '',
          fromFic: true,
        };
        const match = (incoming.vat && byVat.get(String(incoming.vat).trim())) || byName.get(incoming.name.toLowerCase().trim());
        if (match) {
          Object.assign(match, incoming);
          await DB.put('clients', match);
          aggiornati++;
        } else {
          await DB.put('clients', incoming);
          aggiunti++;
        }
      }
      if (State.currentView === 'clients' && Views.renderClients) await Views.renderClients();
      this._toast(`Clienti sincronizzati: ${aggiornati} aggiornati, ${aggiunti} nuovi (totale FiC: ${ficClients.length})`, 'success');
    } catch (e) {
      console.error('syncClientsFromFic:', e);
      this._toast('Errore sync clienti: ' + (e.message || e), 'error');
    }
  },

  async sendQuoteToFic() {
    const statusEl = document.getElementById('ficActionStatus');
    const setStatus = (html, kind) => {
      if (!statusEl) return;
      const colors = { ok: 'var(--ad-success)', err: 'var(--ad-pink)', wait: 'var(--ad-mute)' };
      statusEl.innerHTML = `<div style="color:${colors[kind] || 'inherit'}">${html}</div>`;
    };

    if (!State.currentQuote || !State.currentQuote.clientId) {
      setStatus("⚠️ Seleziona un cliente prima di creare la bozza su Fatture in Cloud.", 'err');
      this._toast('Salva il preventivo con un cliente prima', 'error');
      return;
    }
    const usaProxy = FIC._proxyBase && FIC._proxyBase();
    if (!usaProxy) {
      const { token, companyId } = await FIC.getCredentials();
      if (!token || !companyId) {
        setStatus("⚠️ Token API non configurato e backend non disponibile.", 'err');
        this._toast('Configura prima il token API in Impostazioni (o avvia il backend)', 'error');
        this.navigate('settings');
        return;
      }
    }

    setStatus('⏳ Creazione bozza in corso su Fatture in Cloud…', 'wait');
    try {
      const client = await DB.get('clients', State.currentQuote.clientId);
      console.log('[fic] invio quote-draft', { proxy: !!usaProxy, lines: State.currentQuote.lines.length, client: client && client.name });
      const r = await FIC.createQuoteDraft(State.currentQuote, client);
      console.log('[fic] bozza creata', r);
      State.currentQuote.ficId = r.id;
      State.currentQuote.status = 'inviato';
      await State.saveQuote();
      const ficUrl = 'https://secure.fattureincloud.it/';
      setStatus(
        `✅ <b>Bozza creata su Fatture in Cloud</b><br>` +
        `ID FiC: <code>${r.id}</code> · Num: <code>${r.number || '—'}</code><br>` +
        `Oggetto: <em>${(r.subject || '').replace(/[<>]/g, '')}</em><br>` +
        `<a href="${ficUrl}" target="_blank" rel="noopener" style="color:var(--ad-success);text-decoration:underline">Apri Fatture in Cloud →</a>`,
        'ok'
      );
      this._toast('Bozza creata su Fatture in Cloud ✓', 'success');
    } catch (e) {
      console.error('[fic] errore createQuoteDraft:', e);
      const msg = (e && e.message) ? e.message : String(e);
      // Errori comuni con suggerimento operativo
      let hint = '';
      if (/unauthorized|401/i.test(msg)) hint = 'Il token JWT dell\'app è scaduto: rifai login.';
      else if (/sync-disabled|backend|fetch|NetworkError|Failed/i.test(msg)) hint = 'Backend non raggiungibile: controlla che node server.js sia attivo su :4321.';
      else if (/422|validation/i.test(msg)) hint = 'FiC ha rifiutato il payload: controlla che le voci abbiano nome e prezzo validi.';
      else if (/503|FiC non configurato/i.test(msg)) hint = 'Il backend non ha le credenziali FiC: aggiorna server/.env.';

      setStatus(
        `❌ <b>Errore creazione bozza</b><br>` +
        `<code style="font-size:11px">${msg.replace(/[<>]/g, '')}</code>` +
        (hint ? `<br><span style="opacity:.8">${hint}</span>` : ''),
        'err'
      );
      this._toast('Errore: ' + msg, 'error');
      // Il JSON di backup non si scarica più automaticamente (era confusionario):
      // se serve, è sempre disponibile cliccando "Esporta PDF" o duplicando il preventivo.
    }
  },

  // ============================================================
  // GESTIONE UTENTI (admin / super_admin)
  // ============================================================
  async _renderUsersList() {
    const el = document.getElementById('usersList');
    if (!el) return [];
    const meRole = State.currentUser && State.currentUser.role;
    const meUser = State.currentUser && State.currentUser.username;
    const isSuper = meRole === 'super_admin';

    let users = [];
    try {
      if (window.Sync && Sync.enabled() && Sync._loadToken()) {
        users = await Sync._api('GET', '/users');
      } else {
        users = await DB.all('users');     // fallback offline
      }
    } catch (e) {
      el.innerHTML = `<div style="color:var(--ad-pink);padding:8px 0">⚠️ Impossibile caricare utenti dal backend: ${e.message || e}</div>`;
      return [];
    }

    const roleBadge = (r) => {
      const map = { super_admin: ['Super Admin', '#7c3aed'], admin: ['Admin', '#0ea5e9'], operator: ['Operatore', '#6b7280'] };
      const [t, c] = map[r] || ['—', '#6b7280'];
      return `<span style="background:${c};color:#fff;padding:2px 8px;border-radius:6px;font-size:10px;font-weight:600;letter-spacing:.04em">${t}</span>`;
    };

    el.innerHTML = users.map(u => {
      const protetto = (u.username === 'luigi');
      const isMe = (u.username === meUser);
      const canEdit = isSuper || (u.role !== 'super_admin' && !protetto);
      const canDelete = canEdit && !isMe && !protetto;
      const canSuspend = canEdit && !isMe && !protetto;
      const suspendedBadge = u.suspended ? `<span style="background:#ef4444;color:#fff;padding:2px 8px;border-radius:6px;font-size:10px;font-weight:600;margin-left:6px">SOSPESO</span>` : '';
      return `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--ad-line);gap:10px;flex-wrap:wrap">
          <div style="flex:1;min-width:0">
            <div><b>${(u.name||'').replace(/[<>]/g,'')}</b> <span style="color:var(--ad-mute);font-size:var(--fs-sm)">(${u.username})</span> ${suspendedBadge}</div>
            <div style="margin-top:4px">${roleBadge(u.role)}${isMe ? ' <span style="color:var(--ad-mute);font-size:11px">· tu</span>' : ''}</div>
          </div>
          <div style="display:flex;gap:6px">
            ${canEdit ? `<button class="btn btn--ghost btn--sm" data-user-edit="${u.username}">Modifica</button>` : ''}
            ${canSuspend ? `<button class="btn btn--ghost btn--sm" data-user-suspend="${u.username}" data-suspended="${u.suspended ? 1 : 0}">${u.suspended ? 'Riattiva' : 'Sospendi'}</button>` : ''}
            ${canDelete ? `<button class="btn btn--ghost btn--sm" data-user-delete="${u.username}" style="color:#ef4444">Elimina</button>` : ''}
          </div>
        </div>
      `;
    }).join('');

    el.querySelectorAll('[data-user-edit]').forEach(b => b.addEventListener('click', () => this._openUserDialog(b.dataset.userEdit, users.find(u => u.username === b.dataset.userEdit))));
    el.querySelectorAll('[data-user-suspend]').forEach(b => b.addEventListener('click', async () => {
      const u = b.dataset.userSuspend;
      const isSuspended = b.dataset.suspended === '1';
      try {
        await Sync._api('PUT', '/users/' + encodeURIComponent(u), { suspended: !isSuspended });
        this._toast(isSuspended ? `Utente ${u} riattivato` : `Utente ${u} sospeso`, 'success');
        await this._renderUsersList();
      } catch (e) { this._toast('Errore: ' + (e.message || e), 'error'); }
    }));
    el.querySelectorAll('[data-user-delete]').forEach(b => b.addEventListener('click', async () => {
      const u = b.dataset.userDelete;
      if (!confirm(`Cancellare DEFINITIVAMENTE l'utente "${u}"?`)) return;
      try {
        await Sync._api('DELETE', '/users/' + encodeURIComponent(u));
        this._toast(`Utente ${u} eliminato`, 'success');
        await this._renderUsersList();
      } catch (e) { this._toast('Errore: ' + (e.message || e), 'error'); }
    }));

    // Pulsante "+ Aggiungi utente"
    const addBtn = document.getElementById('addUserBtn');
    if (addBtn && !addBtn.__bound) {
      addBtn.__bound = true;
      addBtn.addEventListener('click', () => this._openUserDialog(null, null));
    }
    return users;
  },

  /** Modale create/edit utente. */
  _openUserDialog(username, current) {
    const isNew = !username;
    const meRole = State.currentUser && State.currentUser.role;
    const isSuper = meRole === 'super_admin';
    const overlay = document.createElement('div');
    overlay.className = 'rem-modal';
    const u = current || { username: '', name: '', role: 'operator' };
    overlay.innerHTML = `
      <div class="rem-modal__box" style="max-width:480px">
        <h3>${isNew ? 'Nuovo utente' : 'Modifica utente'}</h3>
        <div class="field" style="margin-bottom:10px">
          <label>Username</label>
          <input class="input" id="udUser" value="${(u.username||'').replace(/"/g,'')}" ${isNew ? '' : 'readonly disabled'} placeholder="es. mario">
        </div>
        <div class="field" style="margin-bottom:10px">
          <label>Nome completo</label>
          <input class="input" id="udName" value="${(u.name||'').replace(/"/g,'')}" placeholder="es. Mario Rossi">
        </div>
        <div class="field" style="margin-bottom:10px">
          <label>Ruolo ${!isSuper ? '<span style="color:var(--ad-mute);font-size:11px">(solo super admin può cambiarlo)</span>' : ''}</label>
          <select class="input" id="udRole" ${!isSuper ? 'disabled' : ''}>
            <option value="operator"    ${u.role==='operator'?'selected':''}>Operatore</option>
            <option value="admin"       ${u.role==='admin'?'selected':''}>Admin</option>
            <option value="super_admin" ${u.role==='super_admin'?'selected':''}>Super Admin</option>
          </select>
        </div>
        <div class="field" style="margin-bottom:14px">
          <label>${isNew ? 'Password' : 'Nuova password (lascia vuoto per non cambiare)'}</label>
          <input class="input" type="password" id="udPwd" placeholder="${isNew ? 'min 4 caratteri' : '••••••••'}">
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn btn--ghost" data-act="close">Annulla</button>
          <button class="btn btn--primary" data-act="save">${isNew ? 'Crea utente' : 'Salva modifiche'}</button>
        </div>
        <div id="udStatus" style="margin-top:10px;font-size:var(--fs-sm);color:var(--ad-pink)"></div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('[data-act="close"]').addEventListener('click', () => overlay.remove());
    overlay.querySelector('[data-act="save"]').addEventListener('click', async () => {
      const username = (overlay.querySelector('#udUser').value || '').trim().toLowerCase();
      const name     = (overlay.querySelector('#udName').value || '').trim();
      const role     = overlay.querySelector('#udRole').value;
      const pwd      = overlay.querySelector('#udPwd').value;
      const status   = overlay.querySelector('#udStatus');
      try {
        if (isNew) {
          if (!username || !name || !pwd) { status.textContent = 'Username, nome e password obbligatori'; return; }
          await Sync._api('POST', '/users', { username, name, role, password: pwd });
          this._toast(`Utente ${username} creato`, 'success');
        } else {
          const body = { name };
          if (isSuper && role !== current.role) body.role = role;
          if (pwd) body.password = pwd;
          await Sync._api('PUT', '/users/' + encodeURIComponent(username), body);
          this._toast(`Utente ${username} aggiornato`, 'success');
        }
        overlay.remove();
        await this._renderUsersList();
      } catch (e) {
        let msg = e.message || String(e);
        try { msg = JSON.parse(msg).error || msg; } catch {}
        status.textContent = '❌ ' + msg;
      }
    });
  },

  async _loadSettings() {
    const { token, companyId } = await FIC.getCredentials();
    document.getElementById('ficToken').value = token || '';
    document.getElementById('ficCompany').value = companyId || '';

    // Provider email — popola e attiva il save al change
    const mailSel = document.getElementById('mailProviderSelect');
    if (mailSel) {
      const cur = await DB.getSetting('mail_provider', 'gmail');
      mailSel.value = cur || 'gmail';
      mailSel.onchange = async () => {
        await DB.setSetting('mail_provider', mailSel.value);
        const msg = document.getElementById('mailProviderStatus');
        if (msg) {
          const labels = {
            'default': 'Apriremo il client di sistema (Thunderbird, Apple Mail…) per ogni mail.',
            'gmail':   'Apriremo Gmail nel browser per ogni mail.',
            'smtp':    'SMTP automatico (in arrivo).',
          };
          msg.textContent = '✓ Salvato. ' + (labels[mailSel.value] || '');
          setTimeout(() => { if (msg.textContent.startsWith('✓ Salvato')) msg.textContent = ''; }, 4000);
        }
      };
    }

    // Carica utenti dal BACKEND (con CRUD, suspended, super_admin)
    const users = await this._renderUsersList();

    // ============================================================
    // Permessi operatori — render checklist per ogni operator
    // ============================================================
    try {
      if (typeof this._renderOperatorPermissions === 'function') {
        await this._renderOperatorPermissions(users);
      } else {
        // Stub temporaneo: la UI permessi operatori non è ancora ricostruita
        // (si può comunque agire da Roles.apply via DB.setSetting('operator_permissions')).
        const target = document.getElementById('operatorPermsList');
        if (target) target.innerHTML = '<div style="opacity:.7;font-size:var(--fs-sm)">UI permessi operatori in arrivo — per ora i permessi predefiniti coprono il caso d\'uso (Dashboard, Configuratore, Editor preventivo, Richieste).</div>';
      }
    } catch (e) { console.warn('renderOperatorPermissions:', e); }

    // ============================================================
    // Regole configuratore: leggi flag dal DB
    // ============================================================
    const rules = await DB.getSetting('configurator_rules', { webMaintRequired: true, socialGestionRequired: true });
    const webChk = document.getElementById('ruleWebMaintRequired');
    const socChk = document.getElementById('ruleSocialGestionRequired');
    if (webChk) webChk.checked = !!rules.webMaintRequired;
if (socChk) socChk.checked = !!rules.socialGestionRequired;
  },

  async saveConfigRules() {
    const webChk = document.getElementById('ruleWebMaintRequired');
    const socChk = document.getElementById('ruleSocialGestionRequired');
    const rules = {
      webMaintRequired: !!(webChk && webChk.checked),
      socialGestionRequired: !!(socChk && socChk.checked),
    };
    await DB.setSetting('configurator_rules', rules);
    if (window.Configurator) {
      Configurator.rules = Object.assign(Configurator.rules || {}, rules);
    }
    this._toast('Regole configuratore salvate', 'success');
  },

  async saveOperatorPermissions() {
    const rows = document.querySelectorAll('.operator-perms-row');
    const perms = {};
    rows.forEach(row => {
      const u = row.dataset.username;
      const checked = Array.from(row.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.dataset.view);
      perms[u] = checked;
    });
    await DB.setSetting('operator_permissions', perms);
    if (window.Roles) await Roles.apply();
    this._toast('Permessi operatori salvati', 'success');
  },

  async openQuote(id) {
    const q = await DB.get('quotes', id);
    if (!q) return;
    State.currentQuote = q;
    this.navigate('preventivo');
  },

  async saveFicCredentials() {
    const token = document.getElementById('ficToken').value;
    const companyId = document.getElementById('ficCompany').value;
    await FIC.saveCredentials(token, companyId);
    document.getElementById('ficStatus').innerHTML = '<span style="color:var(--ad-mute)">Test in corso...</span>';
    try {
      const r = await FIC.testConnection();
      document.getElementById('ficStatus').innerHTML = '<span style="color:var(--ad-success)">Connessione FiC OK</span>';
} catch (e) { console.warn('updateRequestsBadge failed:', e); }
  },

  /** Riproduce il suono di notifica nuove richieste.
      Se l'utente ha caricato un file custom (notif_sound dataURL) lo
      usa, altrimenti genera un beep "ding" via WebAudio (zero asset).
      Rispetta il flag notif_sound_enabled (default true per admin). */
  async _playNotificationSound() {
    try {
      const enabled = await DB.getSetting('notif_sound_enabled', true);
      if (!enabled) return;
      const custom = await DB.getSetting('notif_sound', null);
      if (custom && typeof custom === 'string' && custom.startsWith('data:')) {
        const audio = new Audio(custom);
        audio.volume = 0.7;
        await audio.play();
        return;
      }
      // Default beep "ding" generato via WebAudio (2 toni brevi)
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const now = ctx.currentTime;
      const beep = (freq, start, dur, gain) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0, now + start);
        g.gain.linearRampToValueAtTime(gain, now + start + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, now + start + dur);
        osc.connect(g); g.connect(ctx.destination);
        osc.start(now + start); osc.stop(now + start + dur + 0.05);
      };
      beep(880, 0,     0.16, 0.25); // primo "ding" alto
      beep(660, 0.18,  0.20, 0.20); // secondo "dong" più basso
      setTimeout(() => { try { ctx.close(); } catch {} }, 700);
    } catch (e) { console.warn('[notif] suono non riprodotto:', e); }
  },

  /** Apre la composizione di una mail rispettando la preferenza utente
      (setting "mail_provider"). Sostituisce gli mailto: hardcoded che
      su Windows aprivano Outlook anche se l'utente usava Thunderbird.
      Provider:
        - 'default' (default): usa mailto: → apre il client predefinito di sistema
        - 'gmail': apre l'editor Gmail web in nuova scheda
        - 'smtp': futuro — invio server-side via SMTP configurato in Impostazioni */
  async _openMail({ to = '', subject = '', body = '' } = {}) {
    let provider = 'default';
    try { provider = await DB.getSetting('mail_provider', 'gmail'); } catch {}
    const subj = encodeURIComponent(subject || '');
    const bod  = encodeURIComponent(body || '');
    const recipients = encodeURIComponent(to || '');
    if (provider === 'gmail') {
      // Compose Gmail "su the fly": apre il browser su mail.google.com/mail con
      // i parametri preriempiti. L'utente deve essere loggato a Gmail.
      const url = `https://mail.google.com/mail/?view=cm&fs=1&to=${recipients}&su=${subj}&body=${bod}`;
      window.open(url, '_blank', 'noopener');
      return;
    }
    if (provider === 'smtp') {
      // Stub: l'invio server-side automatico è una feature futura.
      this._toast('Invio SMTP automatico non ancora configurato — uso il client di sistema', 'info');
    }
    // Default: mailto → client predefinito di sistema (Thunderbird, Apple Mail, ecc.)
    const href = `mailto:${recipients}?subject=${subj}&body=${bod}`;
    window.open(href, '_blank');
  },

  _toast(message, type = 'info') {
    const container = document.getElementById('toasts');
    if (!container) { console.log('[toast]', message); return; }
    const el = document.createElement('div');
    el.className = 'toast toast--' + type;
    el.textContent = message;
    container.appendChild(el);
    // 4s di permanenza + 250ms di uscita: abbastanza tempo per leggerlo
    // senza che diventi rumore di fondo.
    setTimeout(() => { el.classList.add('is-leaving'); }, 4000);
    setTimeout(() => { el.remove(); }, 4300);
  },

};

window.App = App;
document.addEventListener('DOMContentLoaded', () => App.init());
