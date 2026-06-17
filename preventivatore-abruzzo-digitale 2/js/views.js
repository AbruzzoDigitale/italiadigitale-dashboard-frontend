/* ============================================================
   VIEWS.JS — Rendering di tutte le viste dell'app
   ============================================================ */

const Views = {

  // ============================================================
  // DASHBOARD
  // ============================================================
  async renderDashboard() {
    const quotes = await DB.all('quotes');
    const clients = await DB.all('clients');
    const active = quotes.filter(q => q.status === 'bozza' || q.status === 'inviato').length;
    const last30 = Date.now() - 30 * 86400000;
    const accepted = quotes.filter(q => q.status === 'accettato' && new Date(q.createdAt).getTime() > last30).length;
    const pipelineValue = quotes
      .filter(q => q.status !== 'rifiutato')
      .reduce((s, q) => s + State.calcQuote(q).net, 0);

    // Set difensivo: i KPI default possono essere stati sostituiti dai
    // KPI personalizzati (renderCustomKpis), quindi questi id potrebbero
    // non esistere. Non deve mai bloccare il banner richieste sotto.
    const _setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    _setTxt('kpiActive', active);
    _setTxt('kpiAccepted', accepted);
    _setTxt('kpiValue', State.formatEur(pipelineValue));
    _setTxt('kpiClients', clients.length);
    _setTxt('dashUserName', State.currentUser ? State.currentUser.name : '');

    // Banner promemoria scaduti (solo admin)
    if (window.Reminders && window.Roles && Roles.isAdmin()) {
      try { await Reminders.renderDashboardBanner(); } catch (e) { console.warn('reminders banner:', e); }
    }

    // Banner richieste operatore (solo admin)
    const banner = document.getElementById('dashRequestsBanner');
    if (banner) {
      const pendings = quotes.filter(q => q.status === 'da_approvare');
      if (window.Roles && Roles.isAdmin() && pendings.length > 0) {
        banner.innerHTML = `
          <div class="requests-banner" onclick="App.navigate('requests')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            <div><b>${pendings.length}</b> richiest${pendings.length === 1 ? 'a' : 'e'} di preventivo in attesa di approvazione · click per vederle</div>
          </div>`;
      } else {
        banner.innerHTML = '';
      }
    }

    const recent = quotes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
    const recentBox = document.getElementById('dashRecentQuotes');
    if (recent.length === 0) {
      recentBox.innerHTML = `
        <div class="empty-state" style="border:1px dashed var(--ad-line);border-radius:var(--r-lg)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <h3>Nessun preventivo ancora</h3>
          <p>Crea il primo dalla schermata Pacchetti Social o dal Listino.</p>
        </div>`;
      return;
    }
    let html = '<table class="data-table"><thead><tr><th>N°</th><th>Cliente</th><th>Data</th><th>Totale</th><th>Stato</th></tr></thead><tbody>';
    for (const q of recent) {
      const client = clients.find(c => c.id === q.clientId);
      const t = State.calcQuote(q);
      html += `<tr onclick="App.openQuote(${q.id})">
        <td><b>${q.number}</b></td>
        <td>${client ? client.name : '<em style="color:var(--ad-mute)">— senza cliente —</em>'}</td>
        <td>${formatDate(q.date)}</td>
        <td><b>${State.formatEur(t.total)}</b></td>
        <td><span class="status-pill ${q.status}">${q.status}</span></td>
      </tr>`;
    }
    html += '</tbody></table>';
    recentBox.innerHTML = html;
  },

  // ============================================================
  // PACCHETTI SOCIAL
  // ============================================================
  renderSocialDeck() {
    const deck = document.getElementById('socialDeck');
    deck.innerHTML = SOCIAL_PACKAGES.map(p => this._packCardHtml(p)).join('');
    deck.querySelectorAll('.social-pack').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.id;
        const pack = SOCIAL_PACKAGES.find(x => x.id === id);
        this.openPackConfig(pack);
      });
    });
  },

  _packCardHtml(p) {
    const includedList = p.included.map(s => `<li>${s}</li>`).join('');
    const monthlyList = p.monthly.map(s => `<li>${s}</li>`).join('');
    return `
      <div class="social-pack social-pack--${p.accent}" data-id="${p.id}">
        <div class="social-pack__name">${p.name}</div>
        <div class="social-pack__desc">${p.tagline}</div>
        <div class="social-pack__group-title">Incluso per te:</div>
        <ul class="social-pack__list">${includedList}</ul>
        <div class="social-pack__group-title">Cosa realizziamo ogni mese:</div>
        <ul class="social-pack__list">${monthlyList}</ul>
        <div class="social-pack__price">
          €${p.price}
          <small>al mese</small>
          ${p.badge ? `<div class="social-pack__badge">${p.badge}</div>` : ''}
        </div>
      </div>`;
  },

  openPackConfig(pack) {
    State.packConfig = {
      pack: pack,
      months: pack.minMonths,
      billing: 'mensile',
      extras: [],
      discountPct: 0,
      discountEur: 0,
      notes: '',
    };
    document.getElementById('packConfigTitle').textContent = `Personalizza: ${pack.name}`;
    document.getElementById('packMonths').value = pack.minMonths;
    document.getElementById('packDiscountPct').value = 0;
    document.getElementById('packDiscountEur').value = 0;
    document.getElementById('packNotes').value = '';
    document.getElementById('packExtras').innerHTML = '<div style="color:var(--ad-mute);font-size:var(--fs-sm);font-style:italic">Nessun extra. Aggiungine uno se serve.</div>';
    document.getElementById('packConfigBlock').style.display = 'block';
    this.recalcPackConfig();
    document.getElementById('packConfigBlock').scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Highlight pack selezionato
    document.querySelectorAll('#socialDeck .social-pack').forEach(c => {
      c.classList.toggle('is-selected', c.dataset.id === pack.id);
    });
  },

  recalcPackConfig() {
    const cfg = State.packConfig;
    if (!cfg) return;
    const months = parseInt(document.getElementById('packMonths').value) || 1;
    const billing = document.getElementById('packBilling').value;
    const discPct = parseFloat(document.getElementById('packDiscountPct').value) || 0;
    const discEur = parseFloat(document.getElementById('packDiscountEur').value) || 0;
    cfg.months = months;
    cfg.billing = billing;
    cfg.discountPct = discPct;
    cfg.discountEur = discEur;
    cfg.notes = document.getElementById('packNotes').value;

    const baseTotal = cfg.pack.price * months;
    const extrasTotal = cfg.extras.reduce((s, e) => s + (e.net * e.qty), 0);
    // Strategia (€500) e Meta BM (€250 incluso/scontato 100%) sempre presenti
    const strategyPrice = 500;
    const metaBMPrice = 250;
    const subtotalWithAutoVoci = baseTotal + extrasTotal + strategyPrice + 0; // Meta BM scontato 100% = 0
    const discount = subtotalWithAutoVoci * (discPct / 100) + discEur;
    const total = Math.max(0, subtotalWithAutoVoci - discount);

    const summary = document.getElementById('packSummary');
    summary.innerHTML = `
      <div class="pack-config__row">
        <span>${cfg.pack.name} × ${months} mesi</span>
        <span>${State.formatEur(baseTotal)}</span>
      </div>
      <div class="pack-config__row">
        <span>Strategia social media (una tantum)</span>
        <span>${State.formatEur(strategyPrice)}</span>
      </div>
      <div class="pack-config__row" style="opacity:.7">
        <span>Config. Meta Business Manager <em style="color:var(--ad-cyan);font-style:normal;font-size:10px;text-transform:uppercase;letter-spacing:.1em;margin-left:6px">INCLUSO</em></span>
        <span style="text-decoration:line-through">${State.formatEur(metaBMPrice)}</span>
      </div>
      ${cfg.extras.map(e => `
        <div class="pack-config__row">
          <span style="font-size:11px">${e.name} × ${e.qty}</span>
          <span>${State.formatEur(e.net * e.qty)}</span>
        </div>`).join('')}
      ${discount > 0 ? `<div class="pack-config__row" style="color:var(--ad-pink)"><span>Sconto</span><span>-${State.formatEur(discount)}</span></div>` : ''}
    `;
    document.getElementById('packTotal').textContent = State.formatEur(total);
    cfg.total = total;
    cfg.subtotal = subtotalWithAutoVoci;
    cfg.discount = discount;
  },

  addPackExtra(product) {
    const cfg = State.packConfig;
    if (!cfg) return;
    cfg.extras.push({
      productId: product.id,
      name: product.name,
      net: product.net,
      qty: 1,
      udm: product.udm,
    });
    this._refreshPackExtras();
    this.recalcPackConfig();
  },

  _refreshPackExtras() {
    const cfg = State.packConfig;
    const box = document.getElementById('packExtras');
    if (!cfg || cfg.extras.length === 0) {
      box.innerHTML = '<div style="color:var(--ad-mute);font-size:var(--fs-sm);font-style:italic">Nessun extra. Aggiungine uno se serve.</div>';
      return;
    }
    box.innerHTML = cfg.extras.map((e, i) => `
      <div style="display:grid;grid-template-columns:1fr 80px 100px 32px;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--ad-line)">
        <div>
          <div style="font-weight:600;font-size:var(--fs-sm)">${e.name}</div>
          <div style="font-size:11px;color:var(--ad-mute)">${State.formatEur(e.net)} cad.</div>
        </div>
        <input type="number" min="1" value="${e.qty}" class="input" style="padding:6px 8px" onchange="Views._updateExtraQty(${i}, this.value)">
        <div style="text-align:right;font-weight:700;font-variant-numeric:tabular-nums">${State.formatEur(e.net * e.qty)}</div>
        <button onclick="Views._removeExtra(${i})" style="color:var(--ad-mute);padding:4px">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
        </button>
      </div>
    `).join('');
  },

  _updateExtraQty(i, val) {
    const v = parseInt(val) || 1;
    State.packConfig.extras[i].qty = v;
    this._refreshPackExtras();
    this.recalcPackConfig();
  },

  _removeExtra(i) {
    State.packConfig.extras.splice(i, 1);
    this._refreshPackExtras();
    this.recalcPackConfig();
  },

  /** Converte la pack config in un preventivo */
  packToQuote() {
    const cfg = State.packConfig;
    if (!cfg) return null;
    State.createNewQuote();
    const lines = [{
      productId: null,
      name: `Pacchetto Social Media ${cfg.pack.name}`,
      category: 'Social media management',
      desc: cfg.pack.tagline,
      net: cfg.pack.price,
      vat: 0.22,
      udm: 'Mese',
      quantity: cfg.months,
      discountPct: 0,
    }];
    for (const e of cfg.extras) {
      lines.push({
        productId: e.productId,
        name: e.name,
        category: 'Extra',
        net: e.net,
        vat: 0.22,
        udm: e.udm,
        quantity: e.qty,
        discountPct: 0,
      });
    }
    // Auto-aggiunta Strategia (€500) e Meta BM (€250 scontato 100%) per OGNI pacchetto social
    console.log('[packToQuote] Aggiungo Strategia e Meta BM per pacchetto:', cfg.pack && cfg.pack.name);
    if (cfg.pack) {
      const strategyProd = Listino.findByName('Strategia di social media marketing');
      const metaBMProd = Listino.findByName('Configurazione Meta Business manager');
      lines.push({
        productId: strategyProd ? strategyProd.id : null,
        name: 'Strategia di social media marketing',
        category: 'Consulenza',
        net: strategyProd ? strategyProd.net : 500,
        vat: 0.22,
        udm: 'Una tantum',
        quantity: 1,
        discountPct: 0,
        autoAdded: true,
      });
      lines.push({
        productId: metaBMProd ? metaBMProd.id : null,
        name: 'Configurazione Meta Business Manager (inclusa)',
        category: 'Configurazione social',
        net: metaBMProd ? metaBMProd.net : 250,
        vat: 0.22,
        udm: 'una tantum',
        quantity: 1,
        discountPct: 100,
        autoAdded: true,
        included: true,
      });
    }
    State.currentQuote.lines = lines;
    State.currentQuote.discountPct = cfg.discountPct;
    State.currentQuote.discountEur = cfg.discountEur;
    State.currentQuote.notes = cfg.notes;
    State.currentQuote.tag = `Pacchetto ${cfg.pack.name}`;
    return State.currentQuote;
  },

  // ============================================================
  // LISTINO COMPLETO
  // ============================================================
  state: { catFilter: 'Tutti', catSort: 'cat', catSearch: '' },

  renderCatalog() {
    const chips = document.getElementById('catChips');
    chips.innerHTML = Listino.categories.map(c =>
      `<div class="cat-chip ${c === this.state.catFilter ? 'is-active' : ''}" data-cat="${c}">${c}</div>`
    ).join('');
    chips.querySelectorAll('.cat-chip').forEach(c => {
      c.addEventListener('click', () => {
        this.state.catFilter = c.dataset.cat;
        this.renderCatalog();
      });
    });

    const list = Listino.sortBy(
      Listino.search(this.state.catSearch, this.state.catFilter),
      this.state.catSort
    );
    const grid = document.getElementById('catalogGrid');
    grid.innerHTML = list.map(p => `
      <div class="product-card ${State.inCart(p.id) ? 'is-in-cart' : ''}" data-id="${p.id}">
        <div class="product-card__cat">${p.category || 'Altro'}</div>
        <div class="product-card__name">${p.name}</div>
        <div class="product-card__desc">${(p.desc || '').replace(/\n/g, ' ').slice(0, 140)}</div>
        <div class="product-card__bottom">
          <div class="product-card__price">${State.formatEur(p.net)}<small>${p.udm ? '/' + p.udm.toLowerCase() : ' netto'}</small></div>
          <div class="product-card__add">+</div>
        </div>
      </div>
    `).join('');
    grid.querySelectorAll('.product-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = parseInt(card.dataset.id);
        const product = Listino.products.find(p => p.id === id);
        if (State.inCart(id)) State.removeFromCart(id);
        else State.addToCart(product);
        this.renderCatalog();
        this.updateCartCount();
      });
    });
  },

  updateCartCount() {
    const el = document.getElementById('cartCount');
    if (el) el.textContent = State.cart.length;
  },

  // ============================================================
  // EDITOR PREVENTIVO
  // ============================================================
  async renderQuoteEditor() {
    if (!State.currentQuote) State.createNewQuote();
    const q = State.currentQuote;

    // Title: se l'utente ha scritto un tag (es. "Social Media Marketing La Perla")
    // lo mostra come titolo principale, altrimenti torna al numero del preventivo
    const updateTitle = () => {
      const titleEl = document.getElementById('preventivoTitle');
      if (!titleEl) return;
      const tag = (q.tag || '').trim();
      if (tag) {
        titleEl.textContent = tag;
      } else {
        titleEl.textContent = q.id ? `Preventivo ${q.number}` : `Nuovo preventivo · ${q.number}`;
      }
    };
    updateTitle();
    // Riempi e ascolta il campo Titolo (campo .tag del preventivo)
    const tagInput = document.getElementById('quoteTag');
    if (tagInput) {
      tagInput.value = q.tag || '';
      // Onblur per evitare 1000 scritture DB durante la digitazione
      tagInput.oninput = () => { q.tag = tagInput.value; updateTitle(); };
      tagInput.onblur  = () => { State.saveQuote(); };
    }

    // Hint numero preventivo: se il record ha già un numero FiC definitivo
    // (ficNumber) lo mostriamo. Altrimenti chiamiamo il backend per il preview
    // del prossimo numero della numerazione principale di Fatture in Cloud.
    const hintEl = document.getElementById('preventivoNumberHint');
    if (hintEl) {
      if (q.ficNumber) {
        hintEl.textContent = '#' + q.ficNumber;
        hintEl.classList.remove('preventivo-number-hint--preview');
        hintEl.title = 'Numero assegnato da Fatture in Cloud';
      } else {
        hintEl.textContent = 'Bozza · ' + (q.number || '');
        hintEl.classList.remove('preventivo-number-hint--preview');
        hintEl.title = 'Numero locale. Il numero FiC viene assegnato al push.';
        // Tenta preview se Sync è attivo
        if (window.Sync && Sync.enabled() && Sync._loadToken()) {
          Sync._api('GET', '/fic/quotes/next-number').then(r => {
            if (r && r.next) {
              hintEl.textContent = '~#' + r.next + ' FiC';
              hintEl.classList.add('preventivo-number-hint--preview');
              hintEl.title = 'Numero indicativo: assegnato definitivamente da Fatture in Cloud al momento del push (ultimo emesso: #' + r.last + ')';
            }
          }).catch(() => { /* silenzioso: il preview è best-effort */ });
        }
      }
    }

    // 'Presentazione live' non serve quando l'admin sta completando una
    // richiesta arrivata da un operatore (è un flusso interno, non di
    // presentazione cliente). Si nasconde se il preventivo ha
    // requestedBy o se proviene da una richiesta in stato di lavorazione.
    const presentBtn = document.getElementById('presentQuoteBtn');
    if (presentBtn) {
      const isFromRequest = !!q.requestedBy || q.status === 'da_approvare' || q.status === 'in_revisione';
      presentBtn.style.display = isFromRequest ? 'none' : '';
    }

    // Client dropdown
    const clients = await DB.all('clients');
    const sel = document.getElementById('quoteClient');
    sel.innerHTML = '<option value="">— Seleziona cliente —</option>' +
      clients.map(c => `<option value="${c.id}" ${q.clientId === c.id ? 'selected' : ''}>${c.name}</option>`).join('');

    document.getElementById('quoteDate').value = q.date;
    document.getElementById('quoteNotes').value = q.notes || '';
    const appEl = document.getElementById('quoteAppuntiCommerciali');
    if (appEl) appEl.value = q.appuntiCommerciali || '';
    const briefEl = document.getElementById('quoteBriefOperativo');
    if (briefEl) briefEl.value = q.briefOperativo || '';
    document.getElementById('quoteGlobalDiscPct').value = q.discountPct || '';
    document.getElementById('quoteGlobalDiscEur').value = q.discountEur || '';

    // Cart → lines (se nuovo preventivo da carrello)
    if (q.lines.length === 0 && State.cart.length > 0) {
      q.lines = State.cart.map(c => ({
        productId: c.productId,
        name: c.name,
        category: c.category,
        net: c.net,
        vat: c.vat,
        udm: c.udm,
        quantity: c.quantity,
        discountPct: c.discountPct,
      }));
      State.clearCart();
      this.updateCartCount();
    }

    this.renderLines();
    this.recalcQuote();
  },

  renderLines() {
    const body = document.getElementById('lineItemsBody');
    const q = State.currentQuote;
    if (!q || q.lines.length === 0) {
      body.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <h3>Nessuna voce ancora</h3>
          <p>Aggiungi servizi dal listino o crea una voce libera.</p>
        </div>`;
      return;
    }
    body.innerHTML = q.lines.map((l, i) => `
      <div class="line-item">
        <div>
          <div class="line-item__cat">${l.category || ''}</div>
          <div class="line-item__name">${l.name}</div>
          ${l.udm ? `<div style="font-size:11px;color:var(--ad-mute)">unità: ${l.udm}</div>` : ''}
        </div>
        <input type="number" min="0" step="0.5" value="${l.quantity}" onchange="Views._updateLine(${i}, 'quantity', this.value)">
        <input type="number" min="0" step="0.01" value="${l.net.toFixed(2)}" onchange="Views._updateLine(${i}, 'net', this.value)">
        <input type="number" min="0" max="100" step="0.5" value="${l.discountPct || 0}" onchange="Views._updateLine(${i}, 'discountPct', this.value)">
        <button class="remove" onclick="Views._removeLine(${i})">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    `).join('');
  },

  _updateLine(i, field, value) {
    State.currentQuote.lines[i][field] = parseFloat(value) || 0;
    this.recalcQuote();
  },

  _removeLine(i) {
    State.currentQuote.lines.splice(i, 1);
    this.renderLines();
    this.recalcQuote();
  },

  recalcQuote() {
    const q = State.currentQuote;
    if (!q) return;
    q.discountPct = parseFloat(document.getElementById('quoteGlobalDiscPct').value) || 0;
    q.discountEur = parseFloat(document.getElementById('quoteGlobalDiscEur').value) || 0;
    const t = State.calcQuote(q);
    const el = id => document.getElementById(id);
    if (el('totOneTime')) el('totOneTime').textContent = State.formatEur(t.oneTime);
    if (el('totMonthly')) el('totMonthly').textContent = State.formatEur(t.monthly) + ' /mese';
    if (el('totSub')) el('totSub').textContent = State.formatEur(t.subtotal);
    if (el('totDisc')) el('totDisc').textContent = '-' + State.formatEur(t.totalDiscount || t.discount);
    if (el('totVat')) el('totVat').textContent = State.formatEur(t.vat);
    if (el('totFinal')) el('totFinal').textContent = State.formatEur(t.total);
  },

  // ============================================================
  // STORICO PREVENTIVI
  // ============================================================
  // ============================================================
  // RICHIESTE (workflow approvazione)
  // ============================================================
  async renderRequests() {
    const quotes = await DB.all('quotes');
    const clients = await DB.all('clients');
    const users = await DB.all('users');
    const isAdmin = window.Roles && Roles.isAdmin();
    const isOperator = window.Roles && Roles.isOperator();
    const titleEl = document.getElementById('requestsTitle');
    const leadEl = document.getElementById('requestsLead');
    const listEl = document.getElementById('requestsList');

    let filtered;
    if (isAdmin) {
      filtered = quotes.filter(q => q.status === 'da_approvare' || q.status === 'in_revisione');
      if (titleEl) titleEl.textContent = 'Richieste preventivo';
      if (leadEl)  leadEl.textContent = 'Richieste inviate dagli operatori, in attesa di approvazione.';
    } else if (isOperator) {
      const me = State.currentUser && State.currentUser.username;
      filtered = quotes.filter(q => q.requestedBy === me);
      if (titleEl) titleEl.textContent = 'Le mie richieste';
      if (leadEl)  leadEl.textContent = 'Tutte le richieste che hai inviato all\'admin con il loro stato.';
    } else {
      filtered = [];
    }
    filtered.sort((a, b) => new Date(b.requestedAt || b.createdAt) - new Date(a.requestedAt || a.createdAt));

    if (!listEl) return;
    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state" style="border:1px dashed var(--ad-line);border-radius:var(--r-lg);padding:40px 20px;text-align:center">
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" style="margin:0 auto 10px;display:block;color:var(--ad-mute)"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          <h3>Nessuna richiesta</h3>
          <p>${isAdmin ? 'Non ci sono richieste in attesa di approvazione.' : 'Non hai ancora inviato richieste.'}</p>
        </div>`;
      return;
    }

    listEl.innerHTML = filtered.map(q => {
      const client = clients.find(c => c.id === q.clientId);
      const requester = users.find(u => u.username === q.requestedBy);
      const t = State.calcQuote(q);
      const dateStr = formatDate(q.requestedAt || q.createdAt);
      const itemsCount = (q.lines || []).length;
      return `
        <div class="request-card">
          <div class="request-card__header">
            <div>
              <div class="request-card__number">${q.number}${q.tag ? ' — ' + q.tag : ''}</div>
              <div class="request-card__meta">
                ${client ? `<b>${client.name}</b>` : '<em>cliente non specificato</em>'}
                · ${itemsCount} ${itemsCount === 1 ? 'voce' : 'voci'}
                · richiesto da <b>${requester ? requester.name : (q.requestedBy || '—')}</b>
                · ${dateStr}
              </div>
            </div>
            <span class="status-pill ${q.status}">${q.status.replace('_', ' ')}</span>
          </div>
          ${q.notes ? `<div class="request-card__notes">${(q.notes || '').replace(/\n/g, '<br>')}</div>` : ''}
          <div class="request-card__lines">
            ${(q.lines || []).slice(0, 5).map(l => `<div class="request-card__line">${l.name}${l.quantity > 1 ? ` × ${l.quantity}` : ''}</div>`).join('')}
            ${(q.lines || []).length > 5 ? `<div class="request-card__line" style="font-style:italic;color:var(--ad-mute)">… e altre ${q.lines.length - 5} voci</div>` : ''}
          </div>
          <div class="request-card__actions">
            ${isAdmin ? `
              <button class="btn btn--primary btn--sm" onclick="App.openRequest(${q.id})">Apri e completa</button>
              <button class="btn btn--ghost btn--sm" onclick="App.rejectRequest(${q.id})">Rifiuta</button>
            ` : `
              ${q.status === 'da_approvare' ? `
                <button class="btn btn--secondary btn--sm" onclick="ConfigView._editRequest(${q.id})">Modifica</button>
                <button class="btn btn--ghost btn--sm" onclick="App.withdrawRequest(${q.id})">Annulla richiesta</button>
              ` : `
                <span style="color:var(--ad-mute);font-size:var(--fs-sm);font-style:italic">Stato: ${q.status.replace('_',' ')}</span>
              `}
            `}
          </div>
        </div>`;
    }).join('');
  },

  async renderQuotes() {
    const all = await DB.all('quotes');
    const clients = await DB.all('clients');
    const tbody = document.getElementById('quotesTbody');
    const search = (document.getElementById('quotesSearch').value || '').toLowerCase();
    const filter = document.getElementById('quotesFilter').value;

    let list = all;
    if (filter !== 'all') list = list.filter(q => q.status === filter);
    if (search) {
      list = list.filter(q => {
        const c = clients.find(x => x.id === q.clientId);
        const cname = c ? c.name.toLowerCase() : '';
        return q.number.toLowerCase().includes(search) ||
               cname.includes(search);
      });
    }
    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <h3>Nessun preventivo</h3>
        <p>Crea il primo dalla schermata "Pacchetti Social" o "Listino".</p>
      </div></td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(q => {
      const c = clients.find(x => x.id === q.clientId);
      const t = State.calcQuote(q);
      return `<tr>
        <td onclick="App.openQuote(${q.id})"><b>${q.number}</b></td>
        <td onclick="App.openQuote(${q.id})">${c ? c.name : '<em style="color:var(--ad-mute)">— senza —</em>'}</td>
        <td onclick="App.openQuote(${q.id})">${formatDate(q.date)}</td>
        <td onclick="App.openQuote(${q.id})"><b>${State.formatEur(t.total)}</b></td>
        <td onclick="App.openQuote(${q.id})"><span class="status-pill ${q.status}">${q.status}</span></td>
        <td style="text-align:right">
          <button class="row-action" title="Duplica" onclick="App.duplicateQuote(${q.id})">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
          <button class="row-action" title="Elimina" onclick="App.deleteQuote(${q.id})">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </td>
      </tr>`;
    }).join('');
  },

  // ============================================================
  // CLIENTI
  // ============================================================
  async renderClients() {
    const list = await DB.all('clients');
    const search = (document.getElementById('clientsSearch').value || '').toLowerCase();
    const filtered = list.filter(c =>
      !search ||
      (c.name || '').toLowerCase().includes(search) ||
      (c.vat || '').toLowerCase().includes(search) ||
      (c.city || '').toLowerCase().includes(search)
    );
    const tbody = document.getElementById('clientsTbody');
    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="7" r="4"/><path d="M5.5 21a8.38 8.38 0 0 1 13 0"/></svg>
        <h3>Nessun cliente in anagrafica</h3>
        <p>Aggiungi il primo cliente.</p>
      </div></td></tr>`;
      return;
    }
    tbody.innerHTML = filtered.map(c => `
      <tr onclick="App.editClient(${c.id})">
        <td><b>${c.name}</b>${c.contact ? `<div style="font-size:11px;color:var(--ad-mute)">${c.contact}</div>` : ''}</td>
        <td>${c.vat || '<span style="color:var(--ad-mute)">—</span>'}</td>
        <td>${c.email || '<span style="color:var(--ad-mute)">—</span>'}</td>
        <td>${c.city || ''} ${c.prov ? '(' + c.prov + ')' : ''}</td>
        <td style="text-align:right">
          <button class="row-action" onclick="event.stopPropagation();App.deleteClient(${c.id})">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
          </button>
        </td>
      </tr>
    `).join('');
  },

  // ============================================================
  // PRESENTAZIONE LIVE
  // ============================================================
  presentationDiscountPct: 0,

  openPresentation(fromQuote = false) {
    const panel = document.getElementById('presentation');
    panel.classList.add('is-active');
    document.body.style.overflow = 'hidden';
    this.presentationDiscountPct = 0;
    document.getElementById('presentationDiscount').value = 0;

    if (fromQuote && State.currentQuote) {
      // Modalità preventivo esistente
      document.getElementById('presentationSub').textContent = 'Anteprima del preventivo';
      document.getElementById('presentationDeck').innerHTML = this._renderQuotePresentation();
    } else {
      // Modalità scelta pacchetti
      document.getElementById('presentationSub').textContent = 'Durata minima 6 mesi · IVA esclusa';
      State.presentationSelection = new Set();
      document.getElementById('presentationDeck').innerHTML = SOCIAL_PACKAGES.map(p => this._packCardHtml(p)).join('');
      document.querySelectorAll('#presentationDeck .social-pack').forEach(card => {
card.addEventListener('click', () => {
          const id = card.dataset.id;
          if (State.presentationSelection.has(id)) {
            State.presentationSelection.delete(id);
          } else {
            State.presentationSelection.add(id);
          }
          card.classList.toggle('is-selected');
          this._updatePresentationTotal();
        });
      });
    }
  },

  _updatePresentationTotal() {
    const total = SOCIAL_PACKAGES
      .filter(p => State.presentationSelection.has(p.id))
      .reduce((s, p) => s + p.price, 0);
    const discount = parseFloat(document.getElementById('presentationDiscount').value) || 0;
    const net = total * (1 - discount / 100);
    document.getElementById('presentationTotal').textContent = State.formatEur(net);
  },

  // ============================================================
  // PRODUCT PICKER (selezione servizio dal listino)
  // ============================================================
  openProductPicker(callback) {
    this._pickerCallback = callback;
    document.getElementById('productPickerModal').classList.add('is-active');
    document.getElementById('pickerSearch').value = '';
    this.renderPicker('');
  },

  renderPicker(query) {
    const list = Listino.search(query, 'Tutti').slice(0, 50);
    const box = document.getElementById('pickerList');
    box.innerHTML = list.map(p => `
      <div style="padding:12px 16px;border-bottom:1px solid var(--ad-line);cursor:pointer;display:grid;grid-template-columns:1fr 100px;gap:12px;align-items:center" onclick="Views._pickProduct(${p.id})">
        <div>
          <div style="font-size:11px;color:var(--ad-mute);text-transform:uppercase;letter-spacing:var(--tracking-wider);font-weight:600">${p.category}</div>
          <div style="font-weight:600;margin-top:2px">${p.name}</div>
        </div>
        <div style="text-align:right;font-family:var(--font-display);font-weight:700">${State.formatEur(p.net)}</div>
      </div>
    `).join('');
    if (list.length === 0) box.innerHTML = '<div class="empty-state">Nessun risultato</div>';
  },

  _pickProduct(id) {
    const p = Listino.products.find(x => x.id === id);
if (this._pickerCallback) this._pickerCallback(p);
    document.getElementById('productPickerModal').classList.remove('is-active');
  },
};

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

window.Views = Views;
window.formatDate = formatDate;
