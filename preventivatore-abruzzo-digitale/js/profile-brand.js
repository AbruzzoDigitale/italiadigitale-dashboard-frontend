/* ============================================================
   PROFILE-BRAND.JS — Profilo utente, Brand agenzia, KPI, Firma
   ============================================================ */

const Brand = {

  /** Slot logo previsti */
  SLOTS: [
    { key: 'mark_dark',   label: 'Simbolo (sfondo scuro)',  bg: 'dark',  context: 'sidebar, footer dark' },
    { key: 'mark_light',  label: 'Simbolo (sfondo chiaro)', bg: 'light', context: 'PDF intestazione' },
    { key: 'horiz_dark',  label: 'Lockup orizzontale (scuro)',  bg: 'dark',  context: 'login, presentazione' },
    { key: 'horiz_light', label: 'Lockup orizzontale (chiaro)', bg: 'light', context: 'preventivi PDF' },
    { key: 'vert_dark',   label: 'Lockup verticale (scuro)',  bg: 'dark',  context: 'splash, copertine' },
    { key: 'vert_light',  label: 'Lockup verticale (chiaro)', bg: 'light', context: 'documenti formali' },
    { key: 'hero',        label: 'Immagine hero dashboard',   bg: 'dark',  context: 'sfondo dashboard' },
  ],

  /** Carica le immagini brand dal DB e ritorna mappa { key: dataURL } */
  async getAll() {
    const out = {};
    for (const slot of this.SLOTS) {
      const val = await DB.getSetting('brand_' + slot.key, null);
      if (val) out[slot.key] = val;
    }
    return out;
  },

  async get(key) {
    return await DB.getSetting('brand_' + key, null);
  },

  async set(key, dataUrl) {
    await DB.setSetting('brand_' + key, dataUrl);
  },

  async clear(key) {
    await DB.setSetting('brand_' + key, null);
  },

  /** Legge File come dataURL */
  fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  /** Applica i loghi caricati a tutti gli slot DOM (sidebar, login, presentazione) */
  async applyLogos() {
    const all = await this.getAll();
    // Sidebar: SOLO pittogramma (mark_dark). Fallback: vert_dark, horiz_dark.
    this._setLogo('sidebarLogo', all.mark_dark || all.vert_dark || all.horiz_dark);
    // Login: lockup verticale dark (fallback al pittogramma)
    this._setLogo('loginLogo', all.vert_dark || all.mark_dark || all.horiz_dark);
    // Presentazione: lockup orizzontale dark
    this._setLogo('presentationLogo', all.horiz_dark || all.mark_dark || all.vert_dark);
    // Favicon: pittogramma chiaro su tab (preferibile mark_light)
    if (all.mark_light || all.mark_dark) {
      const fav = document.querySelector('link[rel="icon"]');
      if (fav) fav.href = all.mark_light || all.mark_dark;
    }
    // Testi schermata di login (settings sincronizzate)
    await this._applyLoginTexts();
  },

  async _applyLoginTexts() {
    const set = (id, val) => { const el = document.getElementById(id); if (el && val != null && val !== '') el.textContent = val; };
    try {
      set('loginTitle',    await DB.getSetting('login_title',    null));
      set('loginSubtitle', await DB.getSetting('login_subtitle', null));
      set('loginTagline',  await DB.getSetting('login_tagline',  null));
    } catch {}
  },

  _setLogo(containerId, dataUrl) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (dataUrl) {
      container.innerHTML = `<img src="${dataUrl}" alt="Abruzzo Digitale" class="brand-logo-runtime">`;
    }
    // Se non c'è dataUrl, lascia il placeholder che è già nel DOM
  },
};

// ============================================================
// PROFILE — dati utente personalizzati
// ============================================================
const Profile = {

  /** Carica profilo dell'utente corrente */
  async get() {
    if (!State.currentUser) return null;
    const users = await DB.all('users');
    return users.find(u => u.username === State.currentUser.username);
  },

  async save(data) {
    if (!State.currentUser) return;
    const user = await this.get();
    if (!user) return;
    Object.assign(user, data);
    await DB.put('users', user);
    State.currentUser = user;
  },

  async setAvatar(dataUrl) {
    await this.save({ avatar: dataUrl });
  },

  async setSignature(text, imageDataUrl = null) {
    await this.save({ signature: text, signatureImage: imageDataUrl });
  },

  async changePassword(oldPwd, newPwd) {
    const user = await this.get();
    if (!user || user.password !== oldPwd) return false;
    await this.save({ password: newPwd });
    return true;
  },

  /** Aggiorna avatar/nome nella topbar dopo save */
  async refreshTopbar() {
    const u = await this.get();
    if (!u) return;
    const av = document.getElementById('userAvatar');
    const name = document.getElementById('userName');
    if (name) name.textContent = u.name;
    if (av) {
      if (u.avatar) {
        av.innerHTML = `<img src="${u.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
      } else {
        av.textContent = (u.name || '?').charAt(0).toUpperCase();
      }
    }
    const dashUser = document.getElementById('dashUserName');
    if (dashUser) dashUser.textContent = u.name;
  },
};

// ============================================================
// KPI CONFIG — KPI selezionabili nella dashboard
// ============================================================
const KpiConfig = {

  AVAILABLE: [
    { id: 'active',       label: 'Preventivi attivi',      desc: 'In bozza o inviati',         default: true },
    { id: 'accepted',     label: 'Accettati 30gg',         desc: 'Negli ultimi 30 giorni',     default: true },
    { id: 'pipeline',     label: 'Valore pipeline',        desc: 'Somma netta in pipeline',    default: true },
    { id: 'clients',      label: 'Clienti totali',         desc: 'In anagrafica',              default: true },
    { id: 'conversion',   label: 'Conversion rate',        desc: '% preventivi accettati',     default: false },
    { id: 'avg_value',    label: 'Valore medio preventivo', desc: 'Media €',                   default: false },
    { id: 'sent_week',    label: 'Inviati 7gg',            desc: 'Ultima settimana',           default: false },
    { id: 'top_category', label: 'Top categoria',          desc: 'Servizio più venduto',       default: false },
  ],

  async getEnabled() {
    const saved = await DB.getSetting('dashboard_kpis', null);
    if (saved && Array.isArray(saved)) return saved;
    return this.AVAILABLE.filter(k => k.default).map(k => k.id);
  },

  async setEnabled(ids) {
    await DB.setSetting('dashboard_kpis', ids);
  },

  async toggle(id) {
    let enabled = await this.getEnabled();
    if (enabled.includes(id)) {
      enabled = enabled.filter(x => x !== id);
    } else {
      enabled.push(id);
    }
    await this.setEnabled(enabled);
    return enabled;
  },

  /** Calcola valore di un KPI */
  async compute(id) {
    const quotes = await DB.all('quotes');
    const clients = await DB.all('clients');
    const last30 = Date.now() - 30 * 86400000;
    const last7  = Date.now() - 7  * 86400000;
    switch (id) {
      case 'active':
        return { value: quotes.filter(q => q.status === 'bozza' || q.status === 'inviato').length, sub: 'in bozza o inviati' };
      case 'accepted':
        return { value: quotes.filter(q => q.status === 'accettato' && new Date(q.createdAt).getTime() > last30).length, sub: 'questo mese' };
      case 'pipeline': {
        const v = quotes.filter(q => q.status !== 'rifiutato').reduce((s, q) => s + State.calcQuote(q).net, 0);
        return { value: State.formatEur(v), sub: 'netto' };
      }
      case 'clients':
        return { value: clients.length, sub: 'totali' };
      case 'conversion': {
        const closed = quotes.filter(q => q.status === 'accettato' || q.status === 'rifiutato').length;
        const accepted = quotes.filter(q => q.status === 'accettato').length;
        const rate = closed > 0 ? Math.round((accepted / closed) * 100) : 0;
        return { value: rate + '%', sub: 'accettati/chiusi' };
      }
      case 'avg_value': {
        const arr = quotes.map(q => State.calcQuote(q).net).filter(v => v > 0);
        const avg = arr.length ? (arr.reduce((s, v) => s + v, 0) / arr.length) : 0;
        return { value: State.formatEur(avg), sub: 'medio' };
      }
      case 'sent_week':
        return { value: quotes.filter(q => q.status === 'inviato' && new Date(q.createdAt).getTime() > last7).length, sub: 'ultimi 7 giorni' };
      case 'top_category': {
        const counts = {};
        quotes.forEach(q => (q.lines || []).forEach(l => { counts[l.category] = (counts[l.category] || 0) + 1; }));
        const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
        return { value: top ? top[0] : '—', sub: top ? `${top[1]} voci` : 'nessun dato' };
      }
    }
    return { value: '—', sub: '' };
  },

  getMeta(id) {
    return this.AVAILABLE.find(k => k.id === id);
  },
};

window.Brand = Brand;
window.Profile = Profile;
window.KpiConfig = KpiConfig;
