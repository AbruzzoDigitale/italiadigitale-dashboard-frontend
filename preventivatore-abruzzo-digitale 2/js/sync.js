/* ============================================================
   SYNC.JS — Sync ottimistico col backend (obiettivo 1, client)

   Principi:
   - IndexedDB resta la fonte di verità locale: l'app funziona
     identica a prima anche senza backend (file:// → sync OFF).
   - Auto-detect: se l'app gira su http(s) prova lo stesso host:4321;
     su file:// la sync è disattivata.
   - Login ibrido: al login locale OK, se il backend è raggiungibile
     ottiene anche un JWT; altrimenti prosegue solo in locale.
   - Conflitti: last-write-wins su updatedAt; soft-delete propagato.
   - Additivo: monkey-patch di DB.put/DB.delete e State.login, niente
     modifiche invasive ai file esistenti (stesso pattern di
     app-profile.js).
   ============================================================ */

const Sync = {
  PORT: 4321,
  _token: null,
  _starting: false,
  _applyingRemote: false,   // evita l'eco push↔pull durante il merge
  _timer: null,

  // ----- Configurazione / disponibilità -----
  baseUrl() {
    try {
      const override = localStorage.getItem('ad_backend_url');
      if (override) return override.replace(/\/$/, '');
    } catch {}
    const proto = location.protocol;
    if (proto !== 'http:' && proto !== 'https:') return null; // file:// → OFF
    return `${proto}//${location.hostname}:${this.PORT}`;
  },

  enabled() { return !!this.baseUrl(); },

  _loadToken() {
    if (this._token) return this._token;
    try { this._token = localStorage.getItem('ad_jwt') || null; } catch {}
    return this._token;
  },
  _saveToken(t) {
    this._token = t;
    try { t ? localStorage.setItem('ad_jwt', t) : localStorage.removeItem('ad_jwt'); } catch {}
  },

  async _api(method, path, body, opts) {
    const base = this.baseUrl();
    if (!base) throw new Error('sync-disabled');
    const headers = {};
    const tok = this._loadToken();
    if (tok) headers['Authorization'] = 'Bearer ' + tok;
    // Body raw (ArrayBuffer/Blob): per upload binari come xlsx. Salta JSON.stringify.
    const raw = opts && opts.rawBody;
    if (raw) {
      headers['Content-Type'] = (opts && opts.contentType) || 'application/octet-stream';
    } else if (body != null) {
      headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(base + path, {
      method,
      headers,
      body: raw ? body : (body != null ? JSON.stringify(body) : undefined),
    });
    if (res.status === 401) { this._saveToken(null); throw new Error('unauthorized'); }
    if (!res.ok) {
      // Provo a leggere il body con il messaggio di errore del backend
      let bodyMsg = '';
      try {
        const j = await res.clone().json();
        if (j && j.error) bodyMsg = ' — ' + j.error;
      } catch {}
      // 403 con messaggi che parlano di admin/super_admin = JWT vecchio o backend vecchio
      if (res.status === 403 && /admin|super_admin|ruolo/i.test(bodyMsg)) {
        bodyMsg += ' (suggerimento: riavvia AVVIA-WINDOWS.bat poi disconnetti e rilogga per aggiornare il token)';
      }
      throw new Error('http-' + res.status + bodyMsg);
    }
    return res.status === 204 ? null : res.json();
  },

  async reachable() {
    const base = this.baseUrl();
    if (!base) return false;
    try {
      const res = await fetch(base + '/health', { method: 'GET' });
      return res.ok;
    } catch { return false; }
  },

  // ----- Login ibrido -----
  async tryLogin(username, password) {
    if (!this.enabled()) return false;
    try {
      const out = await this._api('POST', '/auth/login', { username, password });
      if (out && out.token) { this._saveToken(out.token); return true; }
    } catch (e) { console.warn('[sync] login backend non riuscito (resto in locale):', e.message); }
    return false;
  },

  // Sconnessione: ferma il loop e scarta il token (le scritture in
  // outbox restano e partiranno al prossimo login col nuovo account).
  logout() {
    clearInterval(this._timer);
    this._timer = null;
    this._saveToken(null);
  },

  // ----- Outbox (scritture fatte offline, da rigiocare) -----
  async _outbox() { return (await DB.getSetting('sync_outbox', [])) || []; },
  async _setOutbox(arr) { await DB.setSetting('sync_outbox', arr); },
  async _enqueue(op) {
    const ob = await this._outbox();
    ob.push(op);
    await this._setOutbox(ob);
    this._flushSoon();
  },

  _flushSoon() {
    clearTimeout(this._flushT);
    this._flushT = setTimeout(() => this.flushOutbox().catch(() => {}), 400);
  },

  async flushOutbox() {
    if (!this.enabled() || !this._loadToken()) return;
    let ob = await this._outbox();
    if (!ob.length) return;
    const remaining = [];
    for (const op of ob) {
      try {
        if (op.type === 'quote')        await this._api('POST', '/quotes', op.payload);
        else if (op.type === 'client')  await this._api('POST', '/clients', op.payload);
        else if (op.type === 'quoteDelete') await this._api('DELETE', '/quotes/' + encodeURIComponent(op.syncId));
        else if (op.type === 'setting') await this._api('POST', '/settings', op.payload);
        else if (op.type === 'profile') await this._api('PUT', '/profile/me', op.payload);
      } catch (e) {
        if (e.message === 'sync-disabled' || e.message === 'unauthorized') { remaining.push(op); break; }
        // 403 = backend rifiuta definitivamente (chiave non in whitelist):
        // non rimetterlo in coda, altrimenti accumula per sempre.
        if (e.message === 'http-403' || /403/.test(e.message)) {
          console.warn('[sync] op scartata (403):', op.type, op.payload && op.payload.key);
          continue;
        }
        remaining.push(op); // errore di rete: riprova al prossimo giro
      }
    }
    await this._setOutbox(remaining);
  },

  // ----- Push (chiamati dai wrapper di DB) -----
  _ensureSyncId(obj, prefix) {
    if (!obj.syncId) obj.syncId = prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    obj.updatedAt = new Date().toISOString();
    return obj;
  },
  pushQuote(q)  { this._enqueue({ type: 'quote',  payload: q }).catch(() => {}); },
  pushClient(c) { this._enqueue({ type: 'client', payload: c }).catch(() => {}); },
  pushQuoteDelete(syncId) { this._enqueue({ type: 'quoteDelete', syncId }).catch(() => {}); },
  pushSetting(key, value) { this._enqueue({ type: 'setting', payload: { key, value } }).catch(() => {}); },
  pushProfile(profile)    { this._enqueue({ type: 'profile', payload: { profile } }).catch(() => {}); },

  // Scrive un setting SENZA innescare il push (per dati arrivati dal
  // backend). Usa il put grezzo: niente race sul flag condiviso.
  async _rawSetSetting(key, value) {
    const all = await DB.all('settings');
    const existing = all.find(s => s.key === key);
    if (existing) { existing.value = value; await this._origPut('settings', existing); }
    else { await this._origPut('settings', { key, value }); }
  },

  // Quali setting si sincronizzano (mai token/segreti, mai bookkeeping)
  settingSyncable(key) {
    if (typeof key !== 'string') return false;
    if (key.startsWith('brand_')) return true;
    if (key.startsWith('login_')) return true;
    if (key.startsWith('notif_')) return true;
    if (key.startsWith('template_')) return true;
    if (key.startsWith('template_')) return true;
    if (key.startsWith('automation_')) return true;
    return ['dashboard_kpis', 'configurator_rules', 'operator_permissions', 'configurator_fic_mapping'].includes(key);
  },

  // ----- Pull + merge (last-write-wins) -----
  async pullAll() {
    if (!this.enabled() || !this._loadToken()) return;
    const since = (await DB.getSetting('sync_since', '')) || '';
    const qs = since ? ('?since=' + encodeURIComponent(since)) : '';
    let maxTs = since;
    this._changed = 0;
    try {
      const [quotes, clients] = await Promise.all([
        this._api('GET', '/quotes' + qs).catch(() => []),
        this._api('GET', '/clients' + qs).catch(() => []),
      ]);
      this._applyingRemote = true;
      maxTs = await this._mergeStore('quotes', quotes, maxTs);
      maxTs = await this._mergeStore('clients', clients, maxTs);
      if (maxTs && maxTs !== since) await DB.setSetting('sync_since', maxTs);
    } finally {
      this._applyingRemote = false;
    }
    await this.pullSettings();
    await this.pullProfile();
    if (this._changed > 0) this._notifyChanged();
  },

  // ----- Settings (loghi brand, KPI, regole, permessi) -----
  async pullSettings() {
    const since = (await DB.getSetting('settings_since', '')) || '';
    const rows = await this._api('GET', '/settings' + (since ? '?since=' + encodeURIComponent(since) : '')).catch(() => []);
    if (!Array.isArray(rows) || !rows.length) return;
    let maxTs = since, brandTouched = false;
    for (const r of rows) {
      if (!r || !this.settingSyncable(r.key)) continue;
      await this._rawSetSetting(r.key, r.value);
      if ((r.updatedAt || '') > maxTs) maxTs = r.updatedAt || '';
      if (r.key.startsWith('brand_')) brandTouched = true;
      this._changed++;
    }
    if (maxTs && maxTs !== since) await DB.setSetting('settings_since', maxTs);
    if (brandTouched && window.Brand && Brand.applyLogos) { try { await Brand.applyLogos(); } catch {} }
  },

  // Endpoint pubblico /brand: applica i loghi anche PRIMA del login,
  // così la schermata di accesso mostra il logo in ogni finestra.
  async bootstrapBrand() {
    if (!this.enabled()) return;
    try {
      const base = this.baseUrl();
      const res = await fetch(base + '/brand');
      if (!res.ok) return;
      const map = await res.json();
      if (!map || typeof map !== 'object') return;
      for (const k of Object.keys(map)) {
        if (map[k] == null) continue;
        if (k.startsWith('brand_') || k.startsWith('login_')) await this._rawSetSetting(k, map[k]);
      }
      if (window.Brand && Brand.applyLogos) { try { await Brand.applyLogos(); } catch {} }
    } catch (e) { /* backend non raggiungibile: resta il placeholder */ }
  },

  // ----- Profilo utente (avatar/firma/nome) -----
  async pullProfile() {
    const out = await this._api('GET', '/profile/me').catch(() => null);
    if (!out || !out.profile) return;
    const since = (await DB.getSetting('profile_since', '')) || '';
    if (out.updatedAt && out.updatedAt <= since) return; // già applicato
    try {
      const users = await DB.all('users');
      const me = State.currentUser && users.find(u => u.username === State.currentUser.username);
      if (me) {
        Object.assign(me, out.profile);
        await this._origPut('users', me);   // put grezzo: nessun ripush
        State.currentUser = me;
        if (window.Profile && Profile.refreshTopbar) { try { await Profile.refreshTopbar(); } catch {} }
        this._changed++;
      }
      if (out.updatedAt) await DB.setSetting('profile_since', out.updatedAt);
    } catch (e) { console.warn('[sync] pullProfile:', e); }
  },

  // Dopo un pull con novità: aggiorna badge/campanello e ri-renderizza
  // la vista corrente (così le richieste arrivano subito all'admin).
  _notifyChanged() {
    try {
      if (!window.App) return;
      if (App._updateRequestsBadge) App._updateRequestsBadge();
      const v = window.State && State.currentView;
      if (v === 'dashboard' && window.Views && Views.renderDashboard) Views.renderDashboard();
      else if (v === 'requests' && window.Views && Views.renderRequests) Views.renderRequests();
      else if (v === 'quotes' && window.Views && Views.renderQuotes) Views.renderQuotes();
      else if (v === 'clients' && window.Views && Views.renderClients) Views.renderClients();
    } catch (e) { console.warn('[sync] notifyChanged:', e); }
  },

  // Forza subito flush + pull (usato da campanello / focus finestra)
  async refreshNow() {
    if (!this.enabled() || !this._loadToken()) return;
    try { await this.flushOutbox(); await this.pullAll(); } catch (e) {}
  },

  async _mergeStore(store, remoteList, maxTs) {
    if (!Array.isArray(remoteList) || !remoteList.length) return maxTs;
    const local = await DB.all(store);
    const bySync = new Map();
    local.forEach(l => { if (l.syncId) bySync.set(l.syncId, l); });

    for (const r of remoteList) {
      if (!r || !r.syncId) continue;
      const rTs = r._updatedAt || r.updatedAt || '';
      if (rTs > maxTs) maxTs = rTs;
      const l = bySync.get(r.syncId);

      if (!l) {
        if (r._deleted) continue;          // mai vista qui ed è cancellata → ignora
        const obj = { ...r };
        delete obj.id;                      // lascia che IndexedDB assegni l'id locale
        await DB.put(store, obj);
        this._changed++;
        continue;
      }

      const lTs = l.updatedAt || '';
      if (rTs <= lTs) continue;             // il locale è più recente o uguale → tiene

      if (r._deleted) {
        await DB.delete(store, l.id);
      } else {
        const merged = { ...r, id: l.id };  // mantiene la chiave locale di IndexedDB
        await DB.put(store, merged);
      }
      this._changed++;
    }
    return maxTs;
  },

  // ----- Avvio / loop -----
  async start() {
    if (this._starting || !this.enabled()) return;
    this._starting = true;
    try {
      if (!(await this.reachable())) return;     // backend giù → resta offline-first
      this._patchProfile();                      // push profilo su Profile.save
      await this._seedExistingLocal();           // dà un syncId ai dati locali pre-esistenti
      await this.flushOutbox();
      await this.pullAll();
      clearInterval(this._timer);
      this._timer = setInterval(() => {
        this.flushOutbox().then(() => this.pullAll()).catch(() => {});
      }, 15000);
      if (!this._listenersBound) {
        this._listenersBound = true;
        window.addEventListener('online', () => this.refreshNow());
        window.addEventListener('focus', () => this.refreshNow());
        document.addEventListener('visibilitychange', () => {
          if (!document.hidden) this.refreshNow();
        });
      }
    } catch (e) {
      console.warn('[sync] start interrotto:', e.message);
    } finally {
      this._starting = false;
    }
  },

  // Prima sincronizzazione: i preventivi/clienti già salvati in locale
  // (senza syncId) vengono marcati e messi in coda di push.
  async _seedExistingLocal() {
    if (await DB.getSetting('sync_seeded', false)) return;
    for (const store of ['quotes', 'clients']) {
      const items = await DB.all(store);
      for (const it of items) {
        if (it.syncId) continue;
        this._ensureSyncId(it, store === 'quotes' ? 'q' : 'c');
        await DB.put(store, it); // il wrapper accoda il push
      }
    }
    await DB.setSetting('sync_seeded', true);
  },

  // Wrappa Profile.save (definito in profile-brand.js, caricato dopo)
  // per spingere i campi profilo al backend dopo ogni salvataggio.
  _patchProfile() {
    if (!window.Profile || Profile.__syncPatched) return;
    Profile.__syncPatched = true;
    const origSave = Profile.save.bind(Profile);
    Profile.save = async (data) => {
      const r = await origSave(data);
      try {
        if (!Sync._applyingRemote && Sync.enabled() && State.currentUser) {
          const u = State.currentUser;
          Sync.pushProfile({
            name: u.name, role: u.role, avatar: u.avatar,
            signature: u.signature, signatureImage: u.signatureImage,
            phone: u.phone, title: u.title,
          });
        }
      } catch (e) { console.warn('[sync] pushProfile:', e); }
      return r;
    };
  },

  // ----- Monkey-patch additivo di DB e State -----
  install() {
    if (!window.DB || DB.__syncPatched) return;
    DB.__syncPatched = true;

    const origPut = DB.put.bind(DB);
    Sync._origPut = origPut;            // put "grezzo": non innesca mai push
    DB.put = async (store, obj) => {
      if ((store === 'quotes' || store === 'clients') && obj && !Sync._applyingRemote) {
        Sync._ensureSyncId(obj, store === 'quotes' ? 'q' : 'c');
      }
      const res = await origPut(store, obj);
      if (Sync.enabled()) {
        // quotes/clients: il merge da remoto passa da qui → serve il gate.
        if (!Sync._applyingRemote && store === 'quotes')  Sync.pushQuote(obj);
        if (!Sync._applyingRemote && store === 'clients') Sync.pushClient(obj);
        // settings: il pull da remoto usa _origPut (bypassa questa patch),
        // quindi qui arrivano SOLO scritture locali → sempre da pushare.
        if (store === 'settings' && obj && Sync.settingSyncable(obj.key)) Sync.pushSetting(obj.key, obj.value);
      }
      return res;
    };

    const origDelete = DB.delete.bind(DB);
    DB.delete = async (store, id) => {
      let syncId = null;
      if (store === 'quotes' && !Sync._applyingRemote) {
        try { const row = await DB.get(store, id); syncId = row && row.syncId; } catch {}
      }
      const res = await origDelete(store, id);
      if (syncId && !Sync._applyingRemote && Sync.enabled()) Sync.pushQuoteDelete(syncId);
      return res;
    };

    if (window.State && State.login && !State.__syncPatched) {
      State.__syncPatched = true;
      const origLogin = State.login.bind(State);
      State.login = async (username, password) => {
        const ok = await origLogin(username, password);
        if (ok && Sync.enabled()) {
          Sync.tryLogin(String(username || '').trim().toLowerCase(), String(password || '').trim())
            .then(authed => { if (authed) Sync.start(); });
        }
        return ok;
      };

      if (State.restoreSession && !State.__syncRestorePatched) {
        State.__syncRestorePatched = true;
        const origRestore = State.restoreSession.bind(State);
        State.restoreSession = async () => {
          const r = await origRestore();
          if (r && Sync.enabled() && Sync._loadToken()) Sync.start();
          return r;
        };
      }
    }
  },
};

window.Sync = Sync;
Sync.install();
// Loghi brand visibili in ogni finestra già nella schermata di login
// (endpoint pubblico /brand, nessun token richiesto).
Sync.bootstrapBrand();
