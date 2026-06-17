/* ============================================================
   STATE.JS — State management dell'app
   ============================================================ */

const State = {
  currentUser: null,
  currentView: 'dashboard',
  currentQuote: null,    // Preventivo in editing
  packConfig: null,      // Pacchetto in personalizzazione
  online: navigator.onLine,
  cart: [],              // Servizi aggiunti dal listino prima di andare in editor
  presentationSelection: new Set(),

  // ----- Utenti predefiniti -----
  defaultUsers: [
    { username: 'luigi',     password: 'luigi2026', name: 'Luigi',     role: 'admin' },
    { username: 'lisa',      password: 'lisa2026',  name: 'Lisa',      role: 'admin' },
    { username: 'team',      password: 'team2026',  name: 'Team',      role: 'admin' },
    { username: 'operatore', password: 'op2026',    name: 'Operatore', role: 'operator' },
  ],

  /** Login */
  async login(username, password) {
    console.log('[Login] Tentativo:', username);
    const cleanUser = String(username || '').trim().toLowerCase();
    const cleanPass = String(password || '').trim();
    let users = [];
    try {
      users = await DB.all('users');
    } catch (e) {
      console.error('[Login] DB.all failed, uso fallback in memoria:', e);
      users = [];
    }
    if (!users || users.length === 0) {
      // Seed iniziale utenti
      console.log('[Login] Seeding utenti default');
      try {
        for (const u of this.defaultUsers) await DB.put('users', u);
        users = await DB.all('users');
      } catch (e) {
        console.warn('[Login] Seed fallito, uso utenti default in memoria:', e);
        users = this.defaultUsers.slice();
      }
    }
    const found = users.find(u =>
      String(u.username).toLowerCase() === cleanUser &&
      String(u.password) === cleanPass
    );
    if (found) {
      console.log('[Login] OK:', found.name);
      this.currentUser = found;
      try {
        localStorage.setItem('ad_session', JSON.stringify({ username: found.username, ts: Date.now() }));
      } catch (e) { /* file:// puo bloccare localStorage in alcuni contesti */ }
      return true;
    }
    console.warn('[Login] Credenziali non valide. Utente cercato:', cleanUser, '| Utenti disponibili:', users.map(u => u.username));
    return false;
  },

  logout() {
    this.currentUser = null;
    localStorage.removeItem('ad_session');
  },

  /** Restore session */
  async restoreSession() {
    const raw = localStorage.getItem('ad_session');
    if (!raw) return false;
    try {
      const sess = JSON.parse(raw);
      // session valida 7 giorni
      if (Date.now() - sess.ts > 7 * 24 * 60 * 60 * 1000) return false;
      const users = await DB.all('users');
      const user = users.find(u => u.username === sess.username);
      if (user) { this.currentUser = user; return true; }
    } catch {}
    return false;
  },

  // ----- Quote management -----
  createNewQuote() {
    this.currentQuote = {
      number: this._nextQuoteNumber(),
      date: new Date().toISOString().slice(0, 10),
      clientId: null,
      lines: [],
      notes: '',
      discountPct: 0,
      discountEur: 0,
      status: 'bozza',
      createdBy: this.currentUser ? this.currentUser.username : null,
      createdAt: new Date().toISOString(),
    };
    return this.currentQuote;
  },

  _nextQuoteNumber() {
    const year = new Date().getFullYear();
    const existing = window._lastQuoteNum || 0;
    return `${year}-${String(existing + 1).padStart(4, '0')}`;
  },

  async loadQuote(id) {
    const q = await DB.get('quotes', id);
    if (q) this.currentQuote = q;
    return q;
  },

  async saveQuote() {
    if (!this.currentQuote) return null;
    this.currentQuote.updatedAt = new Date().toISOString();
    const id = await DB.put('quotes', this.currentQuote);
    if (!this.currentQuote.id) this.currentQuote.id = id;
    return id;
  },

  async duplicateQuote(id) {
    const original = await DB.get('quotes', id);
    if (!original) return null;
    const dup = { ...original };
    delete dup.id;
    dup.number = this._nextQuoteNumber();
    dup.date = new Date().toISOString().slice(0, 10);
    dup.status = 'bozza';
    dup.createdAt = new Date().toISOString();
    dup.createdBy = this.currentUser ? this.currentUser.username : null;
    dup.duplicatedFrom = original.number;
    this.currentQuote = dup;
    const newId = await this.saveQuote();
    return newId;
  },

  // ----- Cart (carrello servizi pre-preventivo) -----
  addToCart(product, quantity = 1) {
    const existing = this.cart.find(c => c.productId === product.id);
    if (existing) {
      existing.quantity += quantity;
    } else {
      this.cart.push({
        productId: product.id,
        name: product.name,
        category: product.category,
        net: product.net,
        vat: product.vat,
        udm: product.udm,
        quantity,
        discountPct: 0,
      });
    }
  },

  removeFromCart(productId) {
    this.cart = this.cart.filter(c => c.productId !== productId);
  },

  inCart(productId) {
    return this.cart.some(c => c.productId === productId);
  },

  clearCart() { this.cart = []; },

  // ----- Calcoli -----
  /** Calcola totali per una linea */
  calcLine(line) {
    const gross = (line.net || 0) * (line.quantity || 1);
    const discount = gross * ((line.discountPct || 0) / 100);
    return gross - discount;
  },

  /** Determina se una riga e mensile (canone) o una tantum */
  isMonthlyLine(line) {
    const u = String(line.udm || '').toLowerCase();
    return u === 'mese' || u === 'mesi' || u === 'mensile' || u === 'anno';
  },

  /** Calcola totali del preventivo corrente con split una tantum / mensile */
  calcQuote(quote = this.currentQuote) {
    if (!quote || !quote.lines) return { subtotal: 0, discount: 0, net: 0, vat: 0, total: 0, oneTime: 0, monthly: 0, lineDiscounts: 0 };
    let oneTime = 0, monthly = 0, lineDiscounts = 0;
    quote.lines.forEach(l => {
      const gross = (l.net || 0) * (l.quantity || 1);
      const lineDisc = gross * ((l.discountPct || 0) / 100);
      const netLine = gross - lineDisc;
      lineDiscounts += lineDisc;
      if (this.isMonthlyLine(l)) {
        // Per mensile, divido per la quantita (i mesi) per ottenere il canone unitario mensile
        monthly += netLine / (l.quantity || 1);
      } else {
        oneTime += netLine;
      }
    });
    const subtotal = quote.lines.reduce((sum, l) => sum + this.calcLine(l), 0);
    const discountFromPct = subtotal * ((quote.discountPct || 0) / 100);
    const discountTotal = discountFromPct + (quote.discountEur || 0);
    const net = Math.max(0, subtotal - discountTotal);
    const vat = net * 0.22;
    return {
      subtotal,
      discount: discountTotal,
      lineDiscounts,
      totalDiscount: lineDiscounts + discountTotal,
      net,
      vat,
      total: net + vat,
      oneTime,
      monthly,
    };
  },

  /** Format €valuta */
  formatEur(n) {
    return '€' + (n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },
};

window.State = State;
