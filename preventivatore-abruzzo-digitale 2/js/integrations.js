/* ============================================================
   INTEGRATIONS.JS — Hub credenziali servizi esterni
   - Luigi (admin) configura in autonomia: Trello, Adobe Sign, Gmail,
     Drive, WhatsApp.
   - Le credenziali NON entrano mai in IndexedDB: viaggiano dal form
     al backend (PUT /integrations/:name) e restano server-side.
   - Il client riceve solo flag 'configured' + nomi campi presenti.
   ============================================================ */

const Integrations = {

  STATUS_LABELS: {
    active:   { text: 'Attiva',           color: '#10b981' },
    scaffold: { text: 'Salva e attendi',  color: '#9ca3af' },
  },

  async _api(method, path, body) {
    if (!window.Sync || !Sync.enabled() || !Sync._loadToken()) {
      throw new Error('Backend non disponibile o sessione scaduta');
    }
    return Sync._api(method, path, body);
  },

  async fetchAll() {
    return this._api('GET', '/integrations');
  },

  // ===========================================================
  // RENDER vista hub
  // ===========================================================
  async render() {
    const root = document.getElementById('integrationsList');
    if (!root) return;
    if (!window.Roles || !Roles.isAdmin()) {
      root.innerHTML = `<div class="card" style="padding:18px">Solo l'admin può configurare le integrazioni.</div>`;
      return;
    }
    root.innerHTML = `<div class="card" style="padding:18px;opacity:.7">Caricamento…</div>`;

    // Diagnostica step-by-step: distinguo backend down vs token mancante
    if (!window.Sync || !Sync.enabled()) {
      root.innerHTML = `<div class="card" style="padding:18px;color:var(--ad-pink)">
        ⚠️ <b>Stai aprendo l'app via <code>file://</code></b><br>
        Il backend delle integrazioni richiede che l'app sia servita via http.<br><br>
        Doppio click su <b>AVVIA-WINDOWS.bat</b> e poi apri <b>http://localhost:8000</b>.
      </div>`;
      return;
    }

    // Backend acceso? Ping /health (no auth)
    let backendUp = false;
    try {
      const r = await fetch(Sync.baseUrl() + '/health');
      backendUp = r.ok;
    } catch { backendUp = false; }

    if (!backendUp) {
      root.innerHTML = `<div class="card" style="padding:18px;color:var(--ad-pink)">
        ⚠️ <b>Backend spento</b><br>
        Le finestre nere del backend e dello static server sembrano chiuse.<br><br>
        Soluzione: doppio click su <b>AVVIA-WINDOWS.bat</b> nella cartella del progetto<br>
        (puoi tenere aperta questa app, ricarica con F5 una volta partite le finestre).
        <br><br>
        <button class="btn btn--secondary btn--sm" onclick="Integrations.render()">🔁 Riprova</button>
      </div>`;
      return;
    }

    // Backend acceso ma token mancante → JWT scaduto
    if (!Sync._loadToken()) {
      root.innerHTML = `<div class="card" style="padding:18px;color:var(--ad-warning, #f59e0b)">
        🔑 <b>Sessione scaduta</b><br>
        Il token di sicurezza dell'app è scaduto (durata standard: 7 giorni).<br><br>
        Soluzione: clicca sull'avatar in alto a destra → <b>Disconnetti</b>, poi rifai login.
        <br><br>
        <button class="btn btn--secondary btn--sm" onclick="Integrations.render()">🔁 Riprova dopo login</button>
      </div>`;
      return;
    }

    let data;
    try {
      data = await this.fetchAll();
    } catch (e) {
      const msg = (e.message || String(e));
      const is401 = /401|unauthorized/i.test(msg);
      root.innerHTML = `<div class="card" style="padding:18px;color:var(--ad-pink)">
        ⚠️ ${is401 ? '<b>Sessione scaduta</b> — disconnetti e rifai login.' : '<b>Errore comunicazione backend</b>'}
        <br><code style="font-size:11px">${msg}</code>
      </div>`;
      return;
    }

    // Ordine card: prima le attive, poi quelle in scaffold/futuro.
    // Google copre già Drive — non c'è una integrazione "drive" separata.
    // Ordine: FiC + Trello sono attivi storici; Google (OAuth Gmail+Drive) e
    // Canva (OAuth Connect) i workhorse del PED; Google AI per il copy AI;
    // Adobe + WhatsApp future.
    const order = ['fic', 'trello', 'google', 'canva', 'google_ai', 'adobe_sign', 'whatsapp'];
    root.innerHTML = order.filter(k => data[k]).map(name => this._cardHtml(name, data[name])).join('');
    this._bindCards(data);
    this._bindGoogleOAuth();
    this._bindCanvaOAuth();
    this._bindGoogleAi();
  },

  _cardHtml(name, integ) {
    if (name === 'google')    return this._googleCardHtml(integ);
    if (name === 'canva')     return this._canvaCardHtml(integ);
    if (name === 'google_ai') return this._googleAiCardHtml(integ);

    const meta = this.STATUS_LABELS[integ.status] || this.STATUS_LABELS.active;
    const isFic = name === 'fic';
    const isScaffold = integ.status === 'scaffold';

    let statoIcon, statoText, statoColor;
    if (integ.configured && integ.last_status === 'ok')        { statoIcon = '✅'; statoText = 'Connessa';                statoColor = '#10b981'; }
    else if (integ.configured && integ.last_status === 'error'){ statoIcon = '⚠️'; statoText = 'Configurata, test fallito'; statoColor = '#f59e0b'; }
    else if (integ.configured && integ.last_status === 'pending'){ statoIcon = '🟡'; statoText = 'Credenziali salvate (attiva in Fase 2)'; statoColor = '#9ca3af'; }
    else if (integ.configured)                                  { statoIcon = '🟦'; statoText = 'Configurata, mai testata';  statoColor = '#3b82f6'; }
    else                                                        { statoIcon = '⚪'; statoText = 'Non configurata';             statoColor = '#9ca3af'; }

    const fieldsHtml = integ.fields.map(f => {
      const isSet = integ.fields_set.includes(f);
      // FiC è readonly dal .env
      const ro = isFic ? 'readonly disabled' : '';
      const placeholder = isSet
        ? '✓ già impostato — incolla un nuovo valore per sostituirlo (lascia vuoto per mantenere)'
        : `Incolla qui: ${f}`;
      const type = /token|secret|key|password/i.test(f) ? 'password' : 'text';
      return `
        <div class="field" style="margin-bottom:10px">
          <label style="font-size:12px;color:var(--ad-mute);display:flex;justify-content:space-between">
            <span><code>${f}</code></span>
            ${isSet ? '<span style="color:#10b981">✓ impostato</span>' : ''}
          </label>
          <input class="input" type="${type}" data-integ="${name}" data-field="${f}" placeholder="${placeholder}" ${ro} autocomplete="off">
        </div>
      `;
    }).join('');

    return `
      <div class="card integ-card" data-integ="${name}" style="padding:18px">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:6px">
          <div>
            <h3 class="card__title" style="margin:0">${integ.label}</h3>
            <p class="card__sub" style="margin:4px 0 0;font-size:var(--fs-sm)">${integ.desc}</p>
          </div>
          <div style="text-align:right;white-space:nowrap">
            <div style="font-size:var(--fs-sm);color:${statoColor};font-weight:600">${statoIcon} ${statoText}</div>
            ${integ.last_test ? `<div style="font-size:11px;color:var(--ad-mute);margin-top:2px">Ultimo test: ${new Date(integ.last_test).toLocaleString('it-IT')}</div>` : ''}
            ${integ.last_error ? `<div style="font-size:11px;color:var(--ad-pink);max-width:280px;margin-top:2px">${integ.last_error.slice(0, 140)}</div>` : ''}
          </div>
        </div>

        ${isFic ? `<div style="background:rgba(0,0,0,.04);padding:8px 12px;border-radius:8px;font-size:11px;margin:6px 0 12px">ℹ️ FiC è configurato via <code>server/.env</code> sul backend, non da qui.</div>` : ''}
        ${isScaffold ? `<div style="background:rgba(245,158,11,.1);padding:8px 12px;border-radius:8px;font-size:11px;margin:6px 0 12px;color:#92400e">🟡 Le credenziali si salvano già ma l'integrazione reale verrà attivata in Fase 2 (sviluppo dedicato). Puoi compilarle quando le hai pronte.</div>` : ''}

        <div style="margin-top:8px">${fieldsHtml}</div>

        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
          ${!isFic ? `<button class="btn btn--primary btn--sm" data-act="save"  data-integ="${name}">Salva</button>` : ''}
          <button class="btn btn--secondary btn--sm" data-act="test" data-integ="${name}">Test connessione</button>
          ${isFic ? `<button class="btn btn--secondary btn--sm" data-act="fic-sync-listino" title="Scarica i prodotti FiC e aggiorna il listino + mapping configuratore">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-3px"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            Sincronizza listino
          </button>` : ''}
          ${!isFic && integ.configured ? `<button class="btn btn--ghost btn--sm" data-act="reset" data-integ="${name}">Rimuovi credenziali</button>` : ''}
        </div>

        <div class="integ-status" data-integ-status="${name}" style="margin-top:10px;font-size:var(--fs-sm);min-height:20px"></div>
      </div>
    `;
  },

  /** Card dedicata Google (OAuth "Connetti con Google"). */
  _googleCardHtml(integ) {
    const credsOk = integ.fields_set.includes('client_id') && integ.fields_set.includes('client_secret');
    const oauthOk = !!integ.oauth_complete;

    let statoIcon = '⚪', statoText = 'Non configurata', statoColor = '#9ca3af';
    if (oauthOk && integ.last_status === 'ok') { statoIcon = '✅'; statoText = `Connesso${integ.connected_email ? ' (' + integ.connected_email + ')' : ''}`; statoColor = '#10b981'; }
    else if (oauthOk)                          { statoIcon = '🟦'; statoText = 'Account collegato (test pending)'; statoColor = '#3b82f6'; }
    else if (credsOk)                          { statoIcon = '🟡'; statoText = 'App configurata · clicca "Connetti"'; statoColor = '#f59e0b'; }

    return `
      <div class="card integ-card" data-integ="google" style="padding:18px">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:6px">
          <div>
            <h3 class="card__title" style="margin:0">${integ.label}</h3>
            <p class="card__sub" style="margin:4px 0 0;font-size:var(--fs-sm)">${integ.desc}</p>
          </div>
          <div style="text-align:right;white-space:nowrap">
            <div style="font-size:var(--fs-sm);color:${statoColor};font-weight:600">${statoIcon} ${statoText}</div>
            ${integ.connected_at ? `<div style="font-size:11px;color:var(--ad-mute);margin-top:2px">Collegato il ${new Date(integ.connected_at).toLocaleDateString('it-IT')}</div>` : ''}
          </div>
        </div>

        <details style="margin:10px 0 14px;background:rgba(0,0,0,.04);padding:10px 14px;border-radius:8px;font-size:12px">
          <summary style="cursor:pointer;font-weight:600">📖 Come ottenere client_id e client_secret (5 minuti)</summary>
          <ol style="margin:10px 0 0;padding-left:20px;line-height:1.7">
            <li>Apri <a href="https://console.cloud.google.com/" target="_blank" rel="noopener" style="color:#0066cc">Google Cloud Console</a> col tuo account.</li>
            <li>Crea un nuovo progetto (es. <i>"Abruzzo Digitale Preventivatore"</i>).</li>
            <li>Menu → <b>APIs &amp; Services → Library</b>: abilita <b>Gmail API</b> e <b>Google Drive API</b>.</li>
            <li>Menu → <b>APIs &amp; Services → OAuth consent screen</b>: tipo <i>External</i>, compila i campi base, aggiungi te stesso come <i>Test user</i>.</li>
            <li>Menu → <b>APIs &amp; Services → Credentials → + CREATE CREDENTIALS → OAuth client ID</b>.</li>
            <li>Application type: <b>Web application</b>. Authorized redirect URI:
              <code style="display:inline-block;padding:2px 6px;background:#fff;border-radius:4px;margin:2px 0">${((Sync.baseUrl() || 'http://localhost:4321')).replace(/\/\/localhost(:|\/)/, '//127.0.0.1$1')}/oauth/google/callback</code>
              <br><small style="color:#92400e">⚠ Usa <code>127.0.0.1</code>, non <code>localhost</code> (lo richiede anche Canva, teniamo tutto coerente).</small>
            </li>
            <li>Copia <b>Client ID</b> e <b>Client secret</b> nei campi qui sotto, clicca <b>Salva</b>, poi <b>Connetti il mio account Google</b>.</li>
          </ol>
        </details>

        <div class="field" style="margin-bottom:10px">
          <label style="font-size:12px;color:var(--ad-mute);display:flex;justify-content:space-between">
            <span><code>client_id</code></span>${integ.fields_set.includes('client_id') ? '<span style="color:#10b981">✓ impostato</span>' : ''}
          </label>
          <input class="input" type="text" data-integ="google" data-field="client_id" placeholder="${integ.fields_set.includes('client_id') ? '✓ già impostato — incolla per sostituirlo' : 'xxxx.apps.googleusercontent.com'}" autocomplete="off">
        </div>
        <div class="field" style="margin-bottom:10px">
          <label style="font-size:12px;color:var(--ad-mute);display:flex;justify-content:space-between">
            <span><code>client_secret</code></span>${integ.fields_set.includes('client_secret') ? '<span style="color:#10b981">✓ impostato</span>' : ''}
          </label>
          <input class="input" type="password" data-integ="google" data-field="client_secret" placeholder="${integ.fields_set.includes('client_secret') ? '✓ già impostato — incolla per sostituirlo' : 'GOCSPX-...'}" autocomplete="off">
        </div>

        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;align-items:center">
          <button class="btn btn--primary btn--sm" data-act="save" data-integ="google">1. Salva credenziali app</button>
          <button class="btn btn--secondary btn--sm" data-act="google-connect" ${credsOk ? '' : 'disabled title="Salva prima client_id e client_secret"'}>
            2. ${oauthOk ? 'Riconnetti' : 'Connetti il mio account Google'}
          </button>
          ${oauthOk ? `<button class="btn btn--ghost btn--sm" data-act="google-disconnect">Disconnetti account</button>` : ''}
          ${oauthOk ? `<button class="btn btn--ghost btn--sm" data-act="test" data-integ="google">Test</button>` : ''}
        </div>

        <div class="integ-status" data-integ-status="google" style="margin-top:10px;font-size:var(--fs-sm);min-height:20px">
          ${oauthOk
            ? `✅ Account collegato${integ.connected_email ? ' <b>' + integ.connected_email + '</b>' : ''} · ${integ.scopes_count || 0} permessi attivi (Gmail invio/letturа + Drive)`
            : credsOk
              ? '👉 Credenziali app salvate. Clicca <b>Connetti</b> per autorizzare il tuo account.'
              : '👉 Compila client_id e client_secret della tua app Google Cloud, poi clicca Salva.'}
        </div>
      </div>
    `;
  },

  // ===========================================================
  // CANVA — card dedicata (OAuth simile a Google, con PKCE)
  // ===========================================================
  _canvaCardHtml(integ) {
    const credsOk = integ.fields_set.includes('client_id') && integ.fields_set.includes('client_secret');
    const oauthOk = !!integ.oauth_complete;

    let statoIcon = '⚪', statoText = 'Non configurata', statoColor = '#9ca3af';
    if (oauthOk && integ.last_status === 'ok') { statoIcon = '✅'; statoText = `Connesso${integ.connected_account ? ' (' + integ.connected_account + ')' : ''}`; statoColor = '#10b981'; }
    else if (oauthOk)                          { statoIcon = '🟦'; statoText = 'Account collegato (test pending)'; statoColor = '#3b82f6'; }
    else if (credsOk)                          { statoIcon = '🟡'; statoText = 'App configurata · clicca "Connetti"'; statoColor = '#f59e0b'; }

    // Canva richiede 127.0.0.1 esplicito sui redirect locali (rifiuta "localhost")
    const backendUrlRaw = (window.Sync && Sync.baseUrl && Sync.baseUrl()) || 'http://localhost:4321';
    const backendUrl = backendUrlRaw.replace(/\/\/localhost(:|\/)/, '//127.0.0.1$1');

    return `
      <div class="card integ-card" data-integ="canva" style="padding:18px">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:6px">
          <div>
            <h3 class="card__title" style="margin:0">${integ.label}</h3>
            <p class="card__sub" style="margin:4px 0 0;font-size:var(--fs-sm)">${integ.desc}</p>
          </div>
          <div style="text-align:right;white-space:nowrap">
            <div style="font-size:var(--fs-sm);color:${statoColor};font-weight:600">${statoIcon} ${statoText}</div>
            ${integ.connected_at ? `<div style="font-size:11px;color:var(--ad-mute);margin-top:2px">Collegato il ${new Date(integ.connected_at).toLocaleDateString('it-IT')}</div>` : ''}
          </div>
        </div>

        <details style="margin:10px 0 14px;background:rgba(0,0,0,.04);padding:10px 14px;border-radius:8px;font-size:12px">
          <summary style="cursor:pointer;font-weight:600">📖 Come creare l'integrazione Canva (3 minuti)</summary>
          <ol style="margin:10px 0 0;padding-left:20px;line-height:1.7">
            <li>Vai su <a href="https://www.canva.com/developers/" target="_blank" rel="noopener" style="color:#0066cc">canva.com/developers</a> → header <b>"Your integrations"</b> (NON "Le tue app").</li>
            <li>Crea una <b>Public integration</b> (Private richiede Enterprise). Spunta "Canva developer terms".</li>
            <li>Nella pagina integration, sezione <b>Authentication</b>: aggiungi come <b>Authorized redirect URL</b>:
              <code style="display:inline-block;padding:2px 6px;background:#fff;border-radius:4px;margin:2px 0">${backendUrl}/oauth/canva/callback</code>
              <br><small style="color:#92400e">⚠ Usa <code>127.0.0.1</code>, NON <code>localhost</code>: Canva lo rifiuta.</small>
            </li>
            <li>Sezione <b>Scopes</b>: abilita <code>design:meta:read</code>, <code>design:content:read/write</code>, <code>asset:read/write</code>, <code>folder:read/write</code>, <code>brandtemplate:meta:read</code>, <code>brandtemplate:content:read</code>, <code>profile:read</code>.</li>
            <li>Copia <b>Client ID</b> e <b>Client secret</b> qui sotto, clicca <b>Salva</b>, poi <b>Connetti il mio account Canva</b>.</li>
          </ol>
        </details>

        <div class="field" style="margin-bottom:10px">
          <label style="font-size:12px;color:var(--ad-mute);display:flex;justify-content:space-between">
            <span><code>client_id</code></span>${integ.fields_set.includes('client_id') ? '<span style="color:#10b981">✓ impostato</span>' : ''}
          </label>
          <input class="input" type="text" data-integ="canva" data-field="client_id" placeholder="${integ.fields_set.includes('client_id') ? '✓ già impostato — incolla per sostituirlo' : 'OC-AZ...'}" autocomplete="off">
        </div>
        <div class="field" style="margin-bottom:10px">
          <label style="font-size:12px;color:var(--ad-mute);display:flex;justify-content:space-between">
            <span><code>client_secret</code></span>${integ.fields_set.includes('client_secret') ? '<span style="color:#10b981">✓ impostato</span>' : ''}
          </label>
          <input class="input" type="password" data-integ="canva" data-field="client_secret" placeholder="${integ.fields_set.includes('client_secret') ? '✓ già impostato — incolla per sostituirlo' : 'cnv_sk_...'}" autocomplete="off">
        </div>

        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;align-items:center">
          <button class="btn btn--primary btn--sm" data-act="save" data-integ="canva">1. Salva credenziali app</button>
          <button class="btn btn--secondary btn--sm" data-act="canva-connect" ${credsOk ? '' : 'disabled title="Salva prima client_id e client_secret"'}>
            2. ${oauthOk ? 'Riconnetti' : 'Connetti il mio account Canva'}
          </button>
          ${oauthOk ? `<button class="btn btn--ghost btn--sm" data-act="canva-disconnect">Disconnetti account</button>` : ''}
          ${oauthOk ? `<button class="btn btn--ghost btn--sm" data-act="test" data-integ="canva">Test</button>` : ''}
        </div>

        <div class="integ-status" data-integ-status="canva" style="margin-top:10px;font-size:var(--fs-sm);min-height:20px">
          ${oauthOk
            ? `✅ Account collegato${integ.connected_account ? ' <b>' + integ.connected_account + '</b>' : ''}. Il Generatore PED ora vede i tuoi design veri.`
            : credsOk
              ? '👉 Credenziali app salvate. Clicca <b>Connetti il mio account Canva</b> per autorizzare l\'app. Senza questo passaggio il Generatore PED resta sui mock.'
              : '👉 Compila client_id e client_secret della tua integrazione Canva, poi clicca Salva.'}
        </div>
      </div>
    `;
  },

  _bindCanvaOAuth() {
    const root = document.getElementById('integrationsList');
    if (!root) return;
    const btnConn = root.querySelector('[data-act="canva-connect"]');
    if (btnConn && !btnConn.disabled) {
      btnConn.addEventListener('click', () => this._startCanvaOAuth());
    }
    const btnDis = root.querySelector('[data-act="canva-disconnect"]');
    if (btnDis) {
      btnDis.addEventListener('click', async () => {
        if (!confirm('Disconnettere l\'account Canva? Le credenziali dell\'app restano salvate.')) return;
        try {
          await this._api('POST', '/oauth/canva/disconnect');
          App._toast && App._toast('Account Canva disconnesso', 'success');
          this.render();
        } catch (e) {
          App._toast && App._toast('Errore: ' + (e.message || e), 'error');
        }
      });
    }
  },

  async _startCanvaOAuth() {
    this._setStatus('canva', '⏳ Apertura popup Canva…', 'wait');
    try {
      const r = await this._api('POST', '/oauth/canva/init', {});
      const w = window.open(r.url, 'canva_oauth', 'width=560,height=720,menubar=no,toolbar=no,location=yes');
      if (!w) {
        this._setStatus('canva', '❌ Popup bloccato dal browser. Consenti i popup e riprova.', 'err');
        return;
      }
      const onMsg = (ev) => {
        if (!ev.data || ev.data.type !== 'canva-oauth') return;
        window.removeEventListener('message', onMsg);
        if (ev.data.ok) {
          this._setStatus('canva', '✅ ' + ev.data.msg, 'ok');
          App._toast && App._toast('Account Canva collegato', 'success');
          setTimeout(() => this.render(), 800);
        } else {
          this._setStatus('canva', '❌ ' + ev.data.msg, 'err');
        }
      };
      window.addEventListener('message', onMsg);
      const poll = setInterval(() => {
        if (w.closed) { clearInterval(poll); setTimeout(() => this.render(), 300); }
      }, 1000);
    } catch (e) {
      this._setStatus('canva', '❌ ' + (e.message || e), 'err');
    }
  },

  // ===========================================================
  // GOOGLE AI (GEMINI) — card con API key + bottone Test
  // ===========================================================
  _googleAiCardHtml(integ) {
    const apiKeySet = integ.fields_set.includes('api_key');
    const lastOk = integ.last_status === 'ok';
    let statoIcon = '⚪', statoText = 'Non configurata', statoColor = '#9ca3af';
    if (apiKeySet && lastOk)        { statoIcon = '✅'; statoText = `Attiva · ${integ.last_test ? new Date(integ.last_test).toLocaleDateString('it-IT') : 'OK'}`; statoColor = '#10b981'; }
    else if (apiKeySet && integ.last_status === 'error') { statoIcon = '⚠️'; statoText = 'Chiave configurata, ultimo test fallito'; statoColor = '#f59e0b'; }
    else if (apiKeySet)             { statoIcon = '🟦'; statoText = 'Chiave salvata, premi Test'; statoColor = '#3b82f6'; }

    return `
      <div class="card integ-card" data-integ="google_ai" style="padding:18px">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:6px">
          <div>
            <h3 class="card__title" style="margin:0">${integ.label}</h3>
            <p class="card__sub" style="margin:4px 0 0;font-size:var(--fs-sm)">${integ.desc}</p>
          </div>
          <div style="text-align:right;white-space:nowrap">
            <div style="font-size:var(--fs-sm);color:${statoColor};font-weight:600">${statoIcon} ${statoText}</div>
            ${integ.last_error ? `<div style="font-size:11px;color:var(--ad-pink);max-width:280px;margin-top:2px">${integ.last_error.slice(0, 140)}</div>` : ''}
          </div>
        </div>

        <details style="margin:10px 0 14px;background:rgba(0,0,0,.04);padding:10px 14px;border-radius:8px;font-size:12px">
          <summary style="cursor:pointer;font-weight:600">📖 Come ottenere la chiave Gemini (2 minuti, gratis)</summary>
          <ol style="margin:10px 0 0;padding-left:20px;line-height:1.7">
            <li>Apri <a href="https://aistudio.google.com/" target="_blank" rel="noopener" style="color:#0066cc">aistudio.google.com</a> col tuo account Google (stesso del progetto Cloud che hai creato per Drive/Gmail).</li>
            <li>In alto a sinistra click <b>Get API key</b> (o menu hamburger → API keys).</li>
            <li>Click <b>Create API key</b> → seleziona il progetto Google Cloud esistente.</li>
            <li>Si genera una chiave tipo <code>AIzaSy...</code> (~40 caratteri). Copiala subito.</li>
            <li>Incollala nel campo qui sotto, click <b>Salva</b>, poi <b>Test</b> per verificare.</li>
            <li>Tier free: 15 RPM, 1.500 chiamate/giorno su Gemini 2.5 Flash. Più che sufficiente per il PED.</li>
          </ol>
        </details>

        <div class="field" style="margin-bottom:10px">
          <label style="font-size:12px;color:var(--ad-mute);display:flex;justify-content:space-between">
            <span><code>api_key</code></span>${apiKeySet ? '<span style="color:#10b981">✓ impostata</span>' : ''}
          </label>
          <input class="input" type="password" data-integ="google_ai" data-field="api_key" placeholder="${apiKeySet ? '✓ già impostata — incolla per sostituirla' : 'AIzaSy...'}" autocomplete="off">
        </div>
        <div class="field" style="margin-bottom:10px">
          <label style="font-size:12px;color:var(--ad-mute);display:flex;justify-content:space-between">
            <span><code>model</code> (opzionale)</span>${integ.fields_set.includes('model') ? '<span style="color:#10b981">✓</span>' : '<span style="opacity:.6">default: gemini-2.5-flash</span>'}
          </label>
          <input class="input" type="text" data-integ="google_ai" data-field="model" placeholder="gemini-2.5-flash" autocomplete="off">
        </div>

        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;align-items:center">
          <button class="btn btn--primary btn--sm" data-act="save" data-integ="google_ai">Salva</button>
          <button class="btn btn--secondary btn--sm" data-act="llm-test" ${apiKeySet ? '' : 'disabled title="Salva prima la chiave"'}>Test connessione</button>
          ${apiKeySet ? `<button class="btn btn--ghost btn--sm" data-act="reset" data-integ="google_ai">Rimuovi chiave</button>` : ''}
        </div>

        <div class="integ-status" data-integ-status="google_ai" style="margin-top:10px;font-size:var(--fs-sm);min-height:20px">
          ${apiKeySet && lastOk
            ? '✅ Chiave attiva. Il Generatore PED userà questa per parsing strategia + generazione copy.'
            : apiKeySet
              ? '👉 Premi <b>Test connessione</b> per verificare la chiave.'
              : '👉 Incolla la chiave API ottenuta su aistudio.google.com.'}
        </div>
      </div>
    `;
  },

  _bindGoogleAi() {
    const root = document.getElementById('integrationsList');
    if (!root) return;
    const btnTest = root.querySelector('[data-act="llm-test"]');
    if (btnTest && !btnTest.disabled) {
      btnTest.addEventListener('click', async () => {
        this._setStatus('google_ai', '⏳ Chiamo Gemini con un prompt di test…', 'wait');
        try {
          const r = await this._api('POST', '/llm/test', {});
          this._setStatus('google_ai', `✅ Connessione OK · provider <b>${r.provider}</b> · modello <b>${r.model}</b>`, 'ok');
          App._toast && App._toast('Gemini attivo', 'success');
          setTimeout(() => this.render(), 600);
        } catch (e) {
          const msg = (e && e.message) || String(e);
          this._setStatus('google_ai', '❌ ' + msg, 'err');
        }
      });
    }
  },

  _bindGoogleOAuth() {
    const root = document.getElementById('integrationsList');
    if (!root) return;
    // Bottone Connetti
    const btnConn = root.querySelector('[data-act="google-connect"]');
    if (btnConn && !btnConn.disabled) {
      btnConn.addEventListener('click', () => this._startGoogleOAuth());
    }
    // Bottone Disconnetti
    const btnDis = root.querySelector('[data-act="google-disconnect"]');
    if (btnDis) {
      btnDis.addEventListener('click', async () => {
        if (!confirm('Vuoi disconnettere il tuo account Google? Le credenziali dell\'app restano salvate; solo il token utente viene revocato.')) return;
        try {
          await this._api('POST', '/oauth/google/disconnect');
          App._toast('Account Google disconnesso', 'success');
          this.render();
        } catch (e) {
          App._toast('Errore: ' + (e.message || e), 'error');
        }
      });
    }
  },

  async _startGoogleOAuth() {
    this._setStatus('google', '⏳ Apertura popup Google…', 'wait');
    try {
      const r = await this._api('POST', '/oauth/google/init', {});
      // Apro popup
      const w = window.open(r.url, 'google_oauth', 'width=520,height=640,menubar=no,toolbar=no,location=yes');
      if (!w) {
        this._setStatus('google', '❌ Popup bloccato dal browser. Consenti i popup per questo sito e riprova.', 'err');
        return;
      }
      // Ascolto postMessage dal callback
      const onMsg = (ev) => {
        if (!ev.data || ev.data.type !== 'google-oauth') return;
        window.removeEventListener('message', onMsg);
        if (ev.data.ok) {
          this._setStatus('google', '✅ ' + ev.data.msg, 'ok');
          App._toast('Account Google collegato', 'success');
          setTimeout(() => this.render(), 800);
        } else {
          this._setStatus('google', '❌ ' + ev.data.msg, 'err');
        }
      };
      window.addEventListener('message', onMsg);
      // Fallback: se il popup viene chiuso senza message, fai render dopo 60s
      const poll = setInterval(() => {
        if (w.closed) { clearInterval(poll); setTimeout(() => this.render(), 300); }
      }, 1000);
    } catch (e) {
      this._setStatus('google', '❌ ' + (e.message || e), 'err');
    }
  },

  _bindCards(data) {
    const root = document.getElementById('integrationsList');
    root.querySelectorAll('[data-act]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const act = btn.dataset.act;
        const name = btn.dataset.integ;
        if (act === 'save')  return this._onSave(name);
        if (act === 'test')  return this._onTest(name);
        if (act === 'reset') return this._onReset(name);
        if (act === 'fic-sync-listino') {
          if (!window.App || !App.syncListinoFromFic) return;
          this._setStatus('fic', '⏳ Sincronizzazione listino in corso…', 'wait');
          try { await App.syncListinoFromFic(); this._setStatus('fic', '✅ Listino sincronizzato (vedi toast per dettagli)', 'ok'); }
          catch (e) { this._setStatus('fic', '❌ ' + (e.message || e), 'err'); }
          return;
        }
      });
    });
  },

  _setStatus(name, html, kind) {
    const el = document.querySelector(`[data-integ-status="${name}"]`);
    if (!el) return;
    const colors = { ok: '#10b981', err: 'var(--ad-pink)', wait: 'var(--ad-mute)' };
    el.innerHTML = `<span style="color:${colors[kind] || 'inherit'}">${html}</span>`;
  },

  async _onSave(name) {
    const inputs = document.querySelectorAll(`input[data-integ="${name}"]`);
    const cfg = {};
    inputs.forEach(i => {
      const v = (i.value || '').trim();
      if (v) cfg[i.dataset.field] = v;
    });
    if (!Object.keys(cfg).length) {
      return this._setStatus(name, '⚠️ Nessun campo compilato.', 'err');
    }
    this._setStatus(name, '⏳ Salvataggio…', 'wait');
    try {
      const r = await this._api('PUT', '/integrations/' + name, { config: cfg });
      // Svuota gli input dopo save (i valori restano server-side)
      inputs.forEach(i => { i.value = ''; });
      this._setStatus(name,
        `✅ Salvato — campi presenti sul server: ${r.fields_set.map(f => '<code>' + f + '</code>').join(', ')}` +
        (r.configured ? ' · <b>Integrazione configurata</b>' : ' · <i>Mancano alcuni campi</i>'),
        'ok');
      App._toast('Credenziali salvate', 'success');
      // Ricarico per aggiornare status badge
      setTimeout(() => this.render(), 800);
    } catch (e) {
      this._setStatus(name, '❌ Errore: ' + (e.message || e), 'err');
    }
  },

  async _onTest(name) {
    this._setStatus(name, '⏳ Test in corso…', 'wait');
    try {
      const r = await this._api('POST', '/integrations/' + name + '/test', {});
      if (r.ok) {
        const info = r.info ? ` — ${typeof r.info === 'string' ? r.info : Object.entries(r.info).map(([k,v]) => `<b>${k}</b>: ${v}`).join(' · ')}` : '';
        this._setStatus(name, '✅ Connessione OK' + info, 'ok');
        App._toast('Test ' + name + ' OK', 'success');
      } else if (r.pending) {
        this._setStatus(name, '🟡 ' + (r.info || 'Credenziali salvate, attivazione backend richiesta'), 'wait');
      } else {
        this._setStatus(name, '❌ ' + (r.error || 'Errore sconosciuto'), 'err');
      }
      setTimeout(() => this.render(), 1000);
    } catch (e) {
      let msg = e.message || String(e);
      try { const parsed = JSON.parse(msg); msg = parsed.error || msg; } catch {}
      this._setStatus(name, '❌ ' + msg, 'err');
    }
  },

  async _onReset(name) {
    if (!confirm(`Rimuovere le credenziali di ${name} dal backend?`)) return;
    this._setStatus(name, '⏳ Cancellazione…', 'wait');
    try {
      await this._api('DELETE', '/integrations/' + name);
      App._toast('Credenziali rimosse', 'success');
      this.render();
    } catch (e) {
      this._setStatus(name, '❌ ' + (e.message || e), 'err');
    }
  },
};

window.Integrations = Integrations;
