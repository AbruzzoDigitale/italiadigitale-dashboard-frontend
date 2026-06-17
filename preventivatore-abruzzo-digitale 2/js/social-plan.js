/* ============================================================
   SOCIAL-PLAN.JS — Piano editoriale social (matrice cliente × mese)
   Sostituisce e amplia il foglio Excel "Clienti social" di Mattia.
   - Empty state con Import Wizard (legge il .xlsx, abbina ai clienti FiC)
   - Vista Matrice: replica del foglio, edit inline degli stati
   - Side panel per il dettaglio singolo task (mese, brief, allegati)
   ============================================================ */

const SocialPlan = {

  /** Etichette stati: chiave snake_case server-side, label UI italiano. */
  STATUSES: [
    { key: 'da_fare',          label: 'Da fare',          color: '#9ca3af' },
    { key: 'pronto',           label: 'Pronto',           color: '#3b82f6' },
    { key: 'in_approvazione',  label: 'In approvazione',  color: '#f59e0b' },
    { key: 'revisione',        label: 'Revisione',        color: '#dc2626' },
    { key: 'approvato',        label: 'Approvato',        color: '#10b981' },
    { key: 'programmato',      label: 'Programmato',      color: '#8b5cf6' },
    { key: 'stand_by',         label: 'Stand by',         color: '#6b7280' },
    { key: 'lancio',           label: 'Lancio',           color: '#ec4899' },
    { key: 'finito',           label: 'Finito',           color: '#22c55e' },
  ],

  statusMeta(key) {
    return this.STATUSES.find(s => s.key === key) || { key, label: key, color: '#9ca3af' };
  },

  // ===========================================================
  // SIDE PANEL — dettaglio task cliente×mese
  // ===========================================================
  async _openTaskPanel(client, year, month, quoteSyncId) {
    const safe = s => String(s == null ? '' : s).replace(/[<>]/g, '');
    quoteSyncId = quoteSyncId || null;
    const qKey = quoteSyncId || '';
    const key = `${client.syncId}|${qKey}|${year}|${month}`;
    let task = this._tasksByKey.get(key);
    // Trova il contratto per mostrare il nome lavorazione nell'header
    const contract = (client.contracts || []).find(q => q.syncId === quoteSyncId) || null;

    // Se la cella era vuota, creo subito il task DA FARE (lazy)
    if (!task) {
      try {
        task = await Sync._api('POST', '/social/tasks', {
          clientSyncId: client.syncId,
          quoteSyncId: quoteSyncId,
          year, month,
          status: 'da_fare',
          assignedTo: client.defaultAssignee || (State.currentUser && State.currentUser.username) || 'mattia',
        });
        this._tasksByKey.set(key, task);
      } catch (e) {
        App._toast('Errore creazione task: ' + (e.message || e), 'error');
        return;
      }
    }

    // Modale centrata (stile rem-modal di Situazione clienti)
    const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
    const existing = document.getElementById('opTaskModal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'opTaskModal';
    overlay.className = 'rem-modal op-task-modal';
    overlay.innerHTML = `
      <div class="rem-modal__box op-task-modal__box">
        <header class="op-task-modal__head">
          <div>
            <div class="op-task-modal__eyebrow">${safe(monthLabel.toUpperCase())} · ${safe((client.areas || []).join(', ').toUpperCase())}${contract ? ' · ' + safe(contract.tag.toUpperCase()) : ''}</div>
            <h3>${safe(client.brand || client.name)}</h3>
            ${client.brand ? `<div class="op-task-modal__rs">${safe(client.name)}</div>` : ''}
            ${contract ? `<div class="op-task-modal__contract">Lavorazione: <b>${safe(contract.tag)}</b></div>` : ''}
          </div>
          <button class="contract-modal__close" data-act="close" aria-label="Chiudi">×</button>
        </header>
        <div class="op-task-modal__body">
          <div class="op-task-grid">
            <label class="op-task-field">
              <span>Stato</span>
              <select id="opTaskStatus">
                ${this.STATUSES.map(s => `<option value="${s.key}" ${task.status === s.key ? 'selected' : ''}>${safe(s.label)}</option>`).join('')}
              </select>
            </label>
            <label class="op-task-field">
              <span>Operatore</span>
              <input type="text" id="opTaskAssignee" value="${safe(task.assignedTo || '')}" placeholder="es. mattia">
            </label>
            <label class="op-task-field">
              <span>Scadenza (opzionale)</span>
              <input type="date" id="opTaskDue" value="${task.dueDate ? task.dueDate.slice(0, 10) : ''}">
            </label>
          </div>
          <label class="op-task-field op-task-field--full">
            <span>Annotazioni / Brief del mese</span>
            <textarea id="opTaskNotes" rows="5" placeholder="Es. Reel di Ferragosto, video shooting il 15, focus su prodotto X…">${safe(task.notes || '')}</textarea>
          </label>
          <div class="op-task-automations" id="opTaskAutomations" hidden></div>
        </div>
        <footer class="op-task-modal__foot">
          <button class="btn btn--ghost btn--sm" data-act="close">Annulla</button>
          <button class="btn btn--primary btn--sm" data-act="save">Salva modifiche</button>
        </footer>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelectorAll('[data-act="close"]').forEach(b => b.addEventListener('click', close));

    // Anteprima automatismi (mock): quando l'utente cambia lo stato dropdown,
    // mostriamo cosa accadrà al salvataggio.
    const statusSel = overlay.querySelector('#opTaskStatus');
    const automationsEl = overlay.querySelector('#opTaskAutomations');
    const renderAutomations = () => {
      const s = statusSel.value;
      const triggers = this._automationsFor(s);
      if (!triggers.length) { automationsEl.hidden = true; return; }
      automationsEl.hidden = false;
      automationsEl.innerHTML = `
        <div class="op-task-automations__title">Automatismi che partiranno al salvataggio</div>
        ${triggers.map(t => `<div class="op-task-automations__item">${t.icon} <b>${safe(t.title)}</b> · <span class="muted">${safe(t.desc)}</span></div>`).join('')}
      `;
    };
    statusSel.addEventListener('change', renderAutomations);
    renderAutomations();

    // Salva
    overlay.querySelector('[data-act="save"]').addEventListener('click', async () => {
      const oldStatus = task.status;
      const payload = {
        status: statusSel.value,
        assignedTo: overlay.querySelector('#opTaskAssignee').value.trim() || null,
        dueDate: overlay.querySelector('#opTaskDue').value || null,
        notes: overlay.querySelector('#opTaskNotes').value || null,
      };
      try {
        const updated = await Sync._api('PUT', '/social/tasks/' + task.id, payload);
        this._tasksByKey.set(key, updated);
        App._toast('Task aggiornata', 'success');
        // Trigger automatismi mock per cambi di stato significativi
        if (oldStatus !== updated.status) this._fireAutomations(updated, client);
        close();
        // Refresh matrice
        const root = document.getElementById('socialPlanRoot');
        if (root) this._renderPanel(root);
      } catch (e) {
        App._toast('Errore: ' + (e.message || e), 'error');
      }
    });
  },

  /** Descrizione degli automatismi attesi al cambio di stato. Mock per ora. */
  _automationsFor(status) {
    if (status === 'in_approvazione') {
      return [{
        icon: '📧',
        title: 'Email cliente con link Drive',
        desc: 'Verrà schedulata (ritardo configurabile, default 24h). Contenuto: link al file Drive del piano editoriale di questo mese.',
      }];
    }
    if (status === 'finito') {
      return [
        { icon: '✅', title: 'Card Trello aggiornata',           desc: 'La card del mese viene spostata su "Approvato".' },
        { icon: '✉️', title: 'Mail interna agli operativi',      desc: 'Mattia + Luigi ricevono conferma.' },
        { icon: '€',  title: 'Mese pronto per fatturazione',    desc: 'Apparirà in Situazione clienti con badge "Da fatturare".' },
      ];
    }
    return [];
  },

  /** Esegue gli automatismi al cambio di stato. Per ora solo toast mock. */
  _fireAutomations(task, client) {
    const triggers = this._automationsFor(task.status);
    if (!triggers.length) return;
    // Toast in sequenza (uno ogni 600ms così sono leggibili)
    triggers.forEach((t, i) => {
      setTimeout(() => {
        App._toast(`${t.icon} ${t.title} — mock`, 'info');
      }, i * 700 + 400);
    });
  },

  /** Rappresentazione testuale di un cliente per il combobox. */
  _labelOf(c) {
    if (!c) return '';
    const base = c.brand ? `${c.brand} · ${c.name}` : c.name;
    return c.source === 'fic' ? `${base}  [FiC]` : base;
  },

  /** Attiva il combobox: input testuale che filtra una lista a tendina.
      L'utente digita, vede risultati, clicca su uno per selezionarlo.
      Selezione → input.dataset.selectedKey aggiornato. */
  _wireCombobox(box, allClients) {
    const input = box.querySelector('.social-import__combo-input');
    const list = box.querySelector('.social-import__combo-list');
    const safe = s => String(s == null ? '' : s).replace(/[<>]/g, '');

    // Normalizza per match case-insensitive senza accenti
    const norm = s => String(s || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '');

    const renderList = (query) => {
      const q = norm(query.trim());
      let items;
      if (!q) {
        items = allClients.slice(0, 30); // mostra i primi 30 quando vuoto
      } else {
        items = allClients.filter(c => {
          const hay = norm([c.name, c.brand, c.vat].filter(Boolean).join(' '));
          return hay.includes(q);
        }).slice(0, 50);
      }
      if (!items.length) {
        list.innerHTML = '<li class="social-import__combo-empty">Nessun cliente trovato</li>';
      } else {
        list.innerHTML = items.map(c => `
          <li class="social-import__combo-item" data-key="${c.key}">
            <span class="social-import__combo-name">${safe(c.brand || c.name)}</span>
            ${c.brand ? `<span class="social-import__combo-meta">${safe(c.name)}</span>` : ''}
            ${c.source === 'fic' ? '<span class="social-import__combo-badge">FiC</span>' : ''}
          </li>
        `).join('') +
        // Riga sempre presente per "deselezionare"
        `<li class="social-import__combo-item social-import__combo-item--clear" data-key="">
          — Non importare —
        </li>`;
      }
      list.hidden = false;
    };

    input.addEventListener('focus', () => renderList(input.value));
    input.addEventListener('input', () => {
      // L'utente sta digitando: la selezione è fluida finché non clicca
      input.dataset.selectedKey = '';
      renderList(input.value);
    });
    input.addEventListener('blur', () => {
      // Lasciamo tempo al click di registrarsi
      setTimeout(() => { list.hidden = true; }, 180);
    });
    list.addEventListener('mousedown', (e) => {
      // mousedown invece di click così evitiamo che il blur dell'input chiuda la lista prima
      const li = e.target.closest('.social-import__combo-item');
      if (!li) return;
      const key = li.dataset.key;
      if (key) {
        const c = allClients.find(x => x.key === key);
        input.value = this._labelOf(c);
        input.dataset.selectedKey = key;
      } else {
        input.value = '';
        input.dataset.selectedKey = '';
      }
      list.hidden = true;
    });
  },

  _meta: null, // { statuses, clients } da /social/meta

  async render() {
    const root = document.getElementById('socialPlanRoot');
    if (!root) return;
    if (!window.Sync || !Sync.enabled() || !Sync._loadToken()) {
      root.innerHTML = '<div class="social-plan-empty">Il piano editoriale richiede il backend connesso. Effettua il login per accedere.</div>';
      return;
    }
    root.innerHTML = '<div class="social-plan-loading">Caricamento…</div>';
    // Carica sort persistito (best-effort, non blocca render)
    await this._loadSort();
    try {
      this._meta = await Sync._api('GET', '/social/meta');
    } catch (e) {
      root.innerHTML = `<div class="social-plan-empty">Errore caricamento: ${String(e.message || e).replace(/[<>]/g, '')}</div>`;
      return;
    }
    if (!this._meta.clients || !this._meta.clients.length) {
      this._renderEmpty(root);
    } else {
      this._renderMatrix(root);
    }
  },

  // ===========================================================
  // EMPTY STATE — invito a importare l'Excel
  // ===========================================================
  _renderEmpty(root) {
    root.innerHTML = `
      <div class="social-plan-empty">
        <div class="social-plan-empty__icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="4" width="18" height="18" rx="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
        </div>
        <h3>Nessuna situazione operativa</h3>
        <p>Importa il foglio Excel <i>Clienti social</i> per popolare la lista clienti e iniziare a tracciare gli stati delle attività mese per mese.</p>
        <label class="btn btn--primary" style="cursor:pointer">
          <input type="file" id="socialImportFile" accept=".xlsx" style="display:none">
          Importa da Excel
        </label>
      </div>
    `;
    const input = document.getElementById('socialImportFile');
    if (input) {
      input.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) await this._openImportWizard(file);
      });
    }
  },

  // ===========================================================
  // IMPORT WIZARD — 3 step: parse → abbina → conferma
  // ===========================================================
  async _openImportWizard(file) {
    const overlay = document.createElement('div');
    overlay.className = 'rem-modal social-import';
    overlay.innerHTML = `
      <div class="rem-modal__box social-import__box">
        <header class="social-import__head">
          <h3>Import piano editoriale</h3>
          <button class="contract-modal__close" data-act="close" aria-label="Chiudi">×</button>
        </header>
        <div class="social-import__body" id="socialImportBody">
          <div class="social-plan-loading">Parsing del file <i>${file.name.replace(/[<>]/g, '')}</i>…</div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('[data-act="close"]').addEventListener('click', () => overlay.remove());

    try {
      // STEP 1 — parsing del file
      const buf = await file.arrayBuffer();
      const parsed = await Sync._api('POST', '/social/import/parse', buf, {
        rawBody: true,
        contentType: 'application/octet-stream',
      });
      // Carico locali + FiC per il dropdown (FiC ha le ragioni sociali "vere",
      // locali possono avere brand commerciali già impostati).
      const localClients = await Sync._api('GET', '/clients');
      const ficClients = await Sync._api('GET', '/fic/clients').catch(() => []);
      // Normalizzo a un formato comune: {key, displayName, syncId|ficId, source}
      const allClients = [
        ...localClients.map(c => ({
          key: 'local:' + c.syncId,
          syncId: c.syncId,
          ficId: c.ficId || null,
          name: c.name,
          brand: c.brand || '',
          source: 'local',
        })),
        ...(Array.isArray(ficClients) ? ficClients : []).map(c => ({
          key: 'fic:' + c.id,
          syncId: null,
          ficId: c.id,
          name: c.name,
          brand: '',
          source: 'fic',
        })).filter(c => !localClients.find(l => l.ficId === c.ficId)), // dedup: se locale esiste già col ficId, salto
      ];
      const users = await Sync._api('GET', '/users');
      const operators = users.filter(u => u.role === 'operator' && !u.suspended);

      this._renderImportStep2(overlay, parsed, allClients, operators);
    } catch (e) {
      overlay.querySelector('#socialImportBody').innerHTML =
        `<div class="social-plan-empty">Errore: ${String(e.message || e).replace(/[<>]/g, '')}</div>`;
    }
  },

  /** Step 2: tabella di abbinamento. Per ogni nome del foglio, suggerisci
      automaticamente il cliente FiC più vicino e permetti override manuale. */
  _renderImportStep2(overlay, parsed, allClients, operators) {
    const safe = s => String(s == null ? '' : s).replace(/[<>]/g, '');

    // Normalizza un nome per il match auto-suggerimento
    const norm = s => String(s || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\b(srl|srls|s\.r\.l\.?|sas|snc|spa|s\.p\.a\.?|s\.n\.c\.?|s\.a\.s\.?)\b/gi, '')
      .replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();

    // Indice clienti normalizzato → cliente. Priorità ai locali, poi FiC.
    const indexByNorm = new Map();
    for (const c of allClients) {
      if (c.name) {
        const k = norm(c.name);
        if (!indexByNorm.has(k)) indexByNorm.set(k, c);
      }
      if (c.brand) {
        const k = norm(c.brand);
        if (!indexByNorm.has(k)) indexByNorm.set(k, c);
      }
    }

    // Mappa prefisso → username operatore (V → vincenzo, J → jessica).
    // Per ora questi utenti potrebbero non esistere → fallback a Mattia.
    const prefixToUser = {
      'V': operators.find(u => /vincenzo/i.test(u.name || u.username))?.username || 'mattia',
      'J': operators.find(u => /jessica/i.test(u.name || u.username))?.username || 'mattia',
    };

    // Unisci ricorsivi + stagionali, dedup per nome. Mappa al nuovo schema area+subtype:
    // Il file Excel di Mattia è solo Social (mensili/stagionali). Per Web servirà
    // un'aggiunta manuale nelle prossime sessioni.
    const rows = [];
    const seen = new Set();
    const enqueue = (items, subtype) => {
      for (const it of (items || [])) {
        if (seen.has(it.name.toLowerCase())) continue;
        seen.add(it.name.toLowerCase());
        const auto = indexByNorm.get(norm(it.name));
        rows.push({
          raw: it.raw,
          name: it.name,
          prefix: it.prefix,
          operativeArea: 'social',          // l'import dal foglio Excel è sempre Social
          operativeSubtype: subtype,        // 'mensili' | 'stagionali'
          suggestedClient: auto ? auto.key : '',
          isBrand: !!auto && norm(auto.name) !== norm(it.name),
          defaultAssignee: it.prefix ? (prefixToUser[it.prefix] || 'mattia') : 'mattia',
        });
      }
    };
    enqueue(parsed.ricorsivi,  'mensili');
    enqueue(parsed.stagionali, 'stagionali');

    const matched = rows.filter(r => r.suggestedClient).length;
    const orphans = rows.length - matched;

    // Render della tabella
    const body = overlay.querySelector('#socialImportBody');
    body.innerHTML = `
      <div class="social-import__stats">
        <span><b>${rows.length}</b> clienti dal foglio</span>
        <span class="ok">${matched} abbinati automaticamente</span>
        <span class="warn">${orphans} da abbinare a mano</span>
      </div>
      <p class="social-import__hint">Verifica i match auto, abbina manualmente i clienti orfani usando la search box. I clienti senza match resteranno fuori dal piano (puoi aggiungerli dopo).</p>
      <div class="social-import__table-wrap">
        <table class="social-import__table">
          <thead>
            <tr>
              <th style="width:30px"></th>
              <th>Nome dal foglio</th>
              <th>Area · Sotto-categoria</th>
              <th>Cliente del DB</th>
              <th>Operatore default</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r, i) => `
              <tr data-row="${i}" class="${r.suggestedClient ? 'is-matched' : 'is-orphan'}">
                <td><input type="checkbox" class="social-import__include" ${r.suggestedClient ? 'checked' : ''}></td>
                <td>
                  <b>${safe(r.name)}</b>
                  ${r.prefix ? `<span class="social-import__prefix">[${r.prefix}]</span>` : ''}
                </td>
                <td>
                  <select class="social-import__areasub">
                    <optgroup label="Social">
                      <option value="social/mensili"    ${r.operativeArea==='social'&&r.operativeSubtype==='mensili'?'selected':''}>Social · Mensili</option>
                      <option value="social/stagionali" ${r.operativeArea==='social'&&r.operativeSubtype==='stagionali'?'selected':''}>Social · Stagionali</option>
                    </optgroup>
                    <optgroup label="Web">
                      <option value="web/manutenzione" ${r.operativeArea==='web'&&r.operativeSubtype==='manutenzione'?'selected':''}>Web · Manutenzione</option>
                      <option value="web/siti"         ${r.operativeArea==='web'&&r.operativeSubtype==='siti'?'selected':''}>Web · Siti</option>
                    </optgroup>
                  </select>
                </td>
                <td>
                  <div class="social-import__combo" data-row="${i}">
                    <input type="text" class="social-import__combo-input" placeholder="Cerca cliente per nome, brand o P.IVA…" autocomplete="off"
                      value="${r.suggestedClient ? safe(this._labelOf(allClients.find(c => c.key === r.suggestedClient))) : ''}"
                      data-selected-key="${r.suggestedClient || ''}">
                    <ul class="social-import__combo-list" hidden></ul>
                  </div>
                </td>
                <td>
                  <select class="social-import__assignee">
                    ${operators.map(o => `<option value="${o.username}" ${o.username === r.defaultAssignee ? 'selected' : ''}>${safe(o.name || o.username)}</option>`).join('')}
                  </select>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <footer class="social-import__foot">
        <button class="btn btn--ghost" data-act="close">Annulla</button>
        <button class="btn btn--primary" data-act="apply">Importa selezionati</button>
      </footer>
    `;

    // Attiva combobox di ricerca per ogni riga
    body.querySelectorAll('.social-import__combo').forEach(box => {
      this._wireCombobox(box, allClients);
    });

    // Submit
    overlay.querySelector('[data-act="apply"]').addEventListener('click', async () => {
      const items = [];
      body.querySelectorAll('tbody tr').forEach(tr => {
        const include = tr.querySelector('.social-import__include').checked;
        const key = tr.querySelector('.social-import__combo-input').dataset.selectedKey;
        if (!include || !key) return;
        const sheetName = rows[parseInt(tr.dataset.row, 10)].name;
        const areasub = tr.querySelector('.social-import__areasub').value.split('/');
        // key è "local:<syncId>" oppure "fic:<id>". Il backend gestisce entrambi.
        const item = {
          operativeArea: areasub[0],
          operativeSubtype: areasub[1],
          defaultAssignee: tr.querySelector('.social-import__assignee').value,
          brand: sheetName,
        };
        if (key.startsWith('local:')) item.clientSyncId = key.slice(6);
        else if (key.startsWith('fic:')) item.ficId = parseInt(key.slice(4), 10);
        items.push(item);
      });
      if (!items.length) {
        App._toast('Nessun cliente selezionato', 'info');
        return;
      }
      try {
        const r = await Sync._api('POST', '/social/import/apply', { items });
        App._toast(`${r.applied} clienti importati nel piano editoriale`, 'success');
        overlay.remove();
        await this.render();
      } catch (e) {
        App._toast('Errore: ' + (e.message || e), 'error');
      }
    });
    overlay.querySelectorAll('[data-act="close"]').forEach(b =>
      b.addEventListener('click', () => overlay.remove()));
  },

  // ===========================================================
  // SHELL TAB — Tutti / Social / Web / Grafica / Consulenza / Scaduti
  // ===========================================================
  _activeArea: 'all',     // 'all' | 'social' | 'web' | 'grafica' | 'consulenza' | 'expired'
  _activeSubtype: null,   // null = sub-tab "Tutti" (di default)

  // Stato ordinamento (persistente in settings via _loadSort / _saveSort).
  // 3-state come Situazione clienti: none → asc → desc → none.
  _sortKey: null,
  _sortDir: null,

  async _loadSort() {
    try {
      const s = await DB.getSetting('social_plan_sort', null);
      if (s && (s.dir === 'asc' || s.dir === 'desc') && s.key) {
        this._sortKey = s.key;
        this._sortDir = s.dir;
      }
    } catch {}
  },
  async _saveSort() {
    try { await DB.setSetting('social_plan_sort', { key: this._sortKey, dir: this._sortDir }); }
    catch {}
  },
  _toggleSort(key) {
    // none → asc → desc → none → ...
    if (this._sortKey !== key) {
      this._sortKey = key;
      this._sortDir = 'asc';
    } else if (this._sortDir === 'asc') {
      this._sortDir = 'desc';
    } else {
      this._sortKey = null;
      this._sortDir = null;
    }
    this._saveSort();
  },

  /** Filtra E ordina i clienti per il tab/sub-tab + sort attivi. */
  _filterClients(clients) {
    const area = this._activeArea;
    let result;
    if (area === 'expired') result = clients.filter(c => c.isExpired);
    else if (area === 'all') result = clients.filter(c => !c.isExpired);
    else {
      const subtypeField = area === 'social' ? 'socialSubtype'
                         : area === 'web' ? 'webSubtype'
                         : area === 'grafica' ? 'graficaSubtype'
                         : area === 'consulenza' ? 'consulenzaSubtype'
                         : null;
      result = clients.filter(c => {
        if (c.isExpired) return false;
        if (!(c.areas || []).includes(area)) return false;
        if (this._activeSubtype && this._activeSubtype !== 'all' && subtypeField) {
          return c[subtypeField] === this._activeSubtype;
        }
        return true;
      });
    }
    // Applico sort se attivo
    if (this._sortKey && this._sortDir) {
      const STATUS_ORDER = { attivo: 0, sospeso: 1, terminato: 2 };
      const getKey = (c) => {
        if (this._sortKey === 'client') return (c.brand || c.name || '').toLowerCase();
        if (this._sortKey === 'status') return STATUS_ORDER[c.operativeStatus] ?? 99;
        return 0;
      };
      const dir = this._sortDir === 'asc' ? 1 : -1;
      result = result.slice().sort((a, b) => {
        const ka = getKey(a); const kb = getKey(b);
        if (ka < kb) return -1 * dir;
        if (ka > kb) return  1 * dir;
        // Tiebreaker: brand asc
        const na = (a.brand || a.name || '').toLowerCase();
        const nb = (b.brand || b.name || '').toLowerCase();
        return na.localeCompare(nb);
      });
    }
    return result;
  },

  _renderMatrix(root) {
    const safe = s => String(s == null ? '' : s).replace(/[<>]/g, '');
    const areas = this._meta.areas || [];
    const clients = this._meta.clients || [];

    // Counter per ogni tab principale
    const countAll      = clients.filter(c => !c.isExpired).length;
    const countExpired  = clients.filter(c => c.isExpired).length;
    const countByArea   = (a) => clients.filter(c => !c.isExpired && (c.areas || []).includes(a)).length;
    const needsContractCount = clients.filter(c => c.needsContract).length;

    // Lista completa tab principali (include speciali Tutti + Scaduti)
    const primaryTabs = [
      { key: 'all',     label: 'Tutti',      count: countAll, isSpecial: true },
      ...areas.map(a => ({ key: a.key, label: a.label, count: countByArea(a.key) })),
      { key: 'expired', label: 'Scaduti',    count: countExpired, isSpecial: true, isMuted: true },
    ];

    // Imposta sub-tab default solo per aree normali
    if (this._activeArea !== 'all' && this._activeArea !== 'expired') {
      const area = areas.find(a => a.key === this._activeArea);
      if (area && (!this._activeSubtype || !area.subtypes.find(s => s.key === this._activeSubtype))) {
        this._activeSubtype = (area.subtypes[0] && area.subtypes[0].key) || 'all';
      }
    } else {
      this._activeSubtype = null;
    }

    root.innerHTML = `
      <div class="social-plan-summary">
        <span><b>${countAll}</b> clienti attivi</span>
        ${areas.map(a => `<span><b>${countByArea(a.key)}</b> ${safe(a.label)}</span>`).join('')}
        ${countExpired > 0 ? `<span class="op-muted"><b>${countExpired}</b> scaduti</span>` : ''}
        ${needsContractCount > 0 ? `<span class="op-warn"><b>${needsContractCount}</b> senza contratto</span>` : ''}
      </div>
      <nav class="op-tabs op-tabs--primary" role="tablist">
        ${primaryTabs.map(t => `
          <button class="op-tab ${t.key === this._activeArea ? 'is-active' : ''} ${t.isMuted ? 'op-tab--muted' : ''}" data-area="${t.key}" role="tab">
            ${safe(t.label)}
            <span class="op-tab__count">${t.count}</span>
          </button>
        `).join('')}
      </nav>
      <nav class="op-tabs op-tabs--secondary" role="tablist" id="opSubTabs"></nav>
      <div id="opPanel" class="op-panel"></div>
      <div class="op-toolbar">
        ${needsContractCount > 0 && State.currentUser && (State.currentUser.role === 'admin' || State.currentUser.role === 'super_admin') ? `
          <button class="btn btn--primary btn--sm" data-act="bootstrap-contracts" title="Crea contratti placeholder per i clienti senza">
            ⚡ Sincronizza con Situazione clienti (${needsContractCount})
          </button>
        ` : ''}
      </div>
    `;

    // Bind tab primari
    root.querySelectorAll('.op-tab[data-area]').forEach(b => {
      b.addEventListener('click', () => {
        this._activeArea = b.dataset.area;
        this._activeSubtype = null;
        this._renderMatrix(root);
      });
    });

    // Bind bottone sincronizza
    const bootBtn = root.querySelector('[data-act="bootstrap-contracts"]');
    if (bootBtn) {
      bootBtn.addEventListener('click', async () => {
        if (!confirm(`Creerò un contratto placeholder per ogni cliente senza contratto attivo. Procedo?`)) return;
        bootBtn.disabled = true;
        bootBtn.textContent = 'Sincronizzo…';
        try {
          const r = await Sync._api('POST', '/social/bootstrap-contracts', {});
          App._toast(`${r.created} contratti placeholder creati`, 'success');
          await this.render();
        } catch (e) {
          App._toast('Errore: ' + (e.message || e), 'error');
          bootBtn.disabled = false;
          bootBtn.textContent = '⚡ Sincronizza con Situazione clienti';
        }
      });
    }

    this._renderSubTabs(root);
  },

  _renderSubTabs(root) {
    const safe = s => String(s == null ? '' : s).replace(/[<>]/g, '');
    const subTabsEl = root.querySelector('#opSubTabs');
    if (!subTabsEl) return;
    // Tab speciali (Tutti/Scaduti) non hanno sub-tab
    if (this._activeArea === 'all' || this._activeArea === 'expired') {
      subTabsEl.innerHTML = '';
      subTabsEl.style.display = 'none';
      this._renderPanel(root);
      return;
    }
    subTabsEl.style.display = '';
    const areas = this._meta.areas || [];
    const clients = this._meta.clients || [];
    const area = areas.find(a => a.key === this._activeArea);
    if (!area) return;
    const subtypeField = this._activeArea === 'social' ? 'socialSubtype'
                       : this._activeArea === 'web' ? 'webSubtype'
                       : this._activeArea === 'grafica' ? 'graficaSubtype'
                       : this._activeArea === 'consulenza' ? 'consulenzaSubtype'
                       : null;
    const inAreaActive = clients.filter(c => !c.isExpired && (c.areas || []).includes(area.key));
    subTabsEl.innerHTML = area.subtypes.map(st => {
      let n;
      if (st.key === 'all') n = inAreaActive.length;
      else n = subtypeField ? inAreaActive.filter(c => c[subtypeField] === st.key).length : 0;
      return `
        <button class="op-tab op-tab--sub ${st.key === this._activeSubtype ? 'is-active' : ''}" data-subtype="${st.key}" role="tab">
          ${safe(st.label)}
          <span class="op-tab__count">${n}</span>
        </button>
      `;
    }).join('') + `
      <button class="op-tab op-tab--sub op-tab--add" data-act="add-filter" title="Filtri personalizzati — disponibili a breve" disabled>
        + Filtro
      </button>
    `;
    subTabsEl.querySelectorAll('[data-subtype]').forEach(b => {
      b.addEventListener('click', () => {
        this._activeSubtype = b.dataset.subtype;
        this._renderSubTabs(root);
      });
    });
    this._renderPanel(root);
  },

  /** Anchor: mese iniziale della finestra calendario (Date primo del mese).
      Default: mese corrente. Navigabile con avanti/indietro. */
  _windowStart: null,
  _windowMonths: 6,   // numero di mesi mostrati nella matrice

  _ensureWindow() {
    if (this._windowStart) return;
    const now = new Date();
    this._windowStart = new Date(now.getFullYear(), now.getMonth(), 1);
  },

  _buildWindow() {
    this._ensureWindow();
    const months = [];
    for (let i = 0; i < this._windowMonths; i++) {
      const d = new Date(this._windowStart.getFullYear(), this._windowStart.getMonth() + i, 1);
      months.push({
        year: d.getFullYear(),
        month: d.getMonth() + 1,   // 1-12
        label: d.toLocaleDateString('it-IT', { month: 'short', year: '2-digit' }),
        isCurrent: (d.getFullYear() === new Date().getFullYear() && d.getMonth() === new Date().getMonth()),
      });
    }
    return months;
  },

  /** Cache dei task per cliente×mese del periodo corrente, indicizzata per chiave
      `${syncId}|${year}|${month}` → task object (o null se non esiste) */
  _tasksByKey: new Map(),

  async _loadTasksForWindow(clientSyncIds, months) {
    this._tasksByKey.clear();
    if (!clientSyncIds.length || !months.length) return;
    // Backend ritorna tutti i task: indicizzo per (client, quote, year, month).
    // I task vecchi senza quote_sync_id usano '' come segnaposto della chiave,
    // così la matrice li attribuisce alla riga "generica" del cliente.
    const tasks = await Sync._api('GET', '/social/tasks').catch(() => []);
    if (!Array.isArray(tasks)) return;
    for (const t of tasks) {
      const qKey = t.quoteSyncId || '';
      this._tasksByKey.set(`${t.clientSyncId}|${qKey}|${t.year}|${t.month}`, t);
    }
  },

  /** Panel: vista calendario matrice cliente × mese del sub-tab attivo. */
  async _renderPanel(root) {
    const safe = s => String(s == null ? '' : s).replace(/[<>]/g, '');
    const panel = root.querySelector('#opPanel');
    const clients = this._filterClients(this._meta.clients || []);
    if (!clients.length) {
      const areaLabel = this._activeArea === 'expired' ? 'Scaduti'
                      : this._activeArea === 'all' ? 'Tutti'
                      : (this._activeArea + (this._activeSubtype && this._activeSubtype !== 'all' ? ' · ' + this._activeSubtype : ''));
      panel.innerHTML = `<div class="op-panel-empty">
        Nessun cliente in <b>${safe(areaLabel)}</b>.
        ${this._activeArea === 'expired'
          ? 'I clienti scaduti compariranno qui quando i loro contratti passeranno a "Completato" o saranno cancellati.'
          : 'Conferma un contratto in Pipeline o usa il bottone "Sincronizza" per popolare la lista.'}
      </div>`;
      return;
    }

    panel.innerHTML = '<div class="op-cal-loading">Carico calendario…</div>';
    const months = this._buildWindow();
    await this._loadTasksForWindow(clients.map(c => c.syncId), months);

    // Lookup status per riga lavorazione: prima cerca per (cliente, quote, mese),
    // poi fallback ai task legacy senza quote_sync_id (li attribuisce al
    // PRIMO contratto del cliente, così non vengono persi).
    const statusOf = (clientSyncId, quoteSyncId, isFirstRow, year, month) => {
      let t = this._tasksByKey.get(`${clientSyncId}|${quoteSyncId || ''}|${year}|${month}`);
      if (!t && isFirstRow) {
        t = this._tasksByKey.get(`${clientSyncId}||${year}|${month}`); // legacy
      }
      return t ? t.status : null;
    };

    // "Cliente nuovo" = ha almeno un contratto firmato negli ultimi 7 giorni
    const NEW_WINDOW_DAYS = 7;
    const newCutoff = Date.now() - NEW_WINDOW_DAYS * 24 * 3600 * 1000;
    const isClientNew = (c) => {
      return (c.contracts || []).some(q => {
        if (!q.signedAt) return false;
        const t = new Date(q.signedAt).getTime();
        return isFinite(t) && t >= newCutoff;
      });
    };

    // Etichette + colori per la colonna Stato cliente
    const STATUS_META = {
      attivo:    { label: 'Attivo',    color: '#16a34a', dot: '●' },
      sospeso:   { label: 'Sospeso',   color: '#d97706', dot: '◐' },
      terminato: { label: 'Terminato', color: '#6b7280', dot: '○' },
    };

    // Espando ogni cliente in N righe (una per ciascun contratto attivo).
    // `groupIndex` ci serve per lo zebra-striping PER CLIENTE (non per riga).
    const rows = [];
    let gi = 0;
    for (const c of clients) {
      const isNew = isClientNew(c);
      if (!c.contracts || !c.contracts.length) {
        rows.push({ client: c, contract: null, contractIndex: 0, totalContracts: 0, isFirstRow: true, isNew, groupIndex: gi });
      } else {
        c.contracts.forEach((q, i) => {
          rows.push({ client: c, contract: q, contractIndex: i, totalContracts: c.contracts.length, isFirstRow: i === 0, isNew, groupIndex: gi });
        });
      }
      gi++;
    }

    panel.innerHTML = `
      <div class="op-cal-toolbar">
        <button class="btn btn--ghost btn--sm" data-act="prev-window" title="6 mesi precedenti">◀ Precedenti</button>
        <span class="op-cal-window">${months[0].label} → ${months[months.length - 1].label}</span>
        <button class="btn btn--ghost btn--sm" data-act="next-window" title="6 mesi successivi">Successivi ▶</button>
        <button class="btn btn--ghost btn--sm" data-act="today-window" title="Torna al mese corrente">Oggi</button>
        <span style="flex:1"></span>
        <span class="op-cal-legend">
          ${this.STATUSES.map(s => `<span class="op-cal-chip" style="background:${s.color}1a;color:${s.color};border-color:${s.color}40">${safe(s.label)}</span>`).join('')}
        </span>
      </div>
      <div class="op-cal-wrap">
        <table class="op-cal">
          <thead>
            <tr>
              <th class="op-cal__client op-cal__th-sortable ${this._sortKey === 'client' ? 'is-active' : ''}" data-sort="client">
                Cliente
                <span class="op-cal__th-arrow">${this._sortKey === 'client' ? (this._sortDir === 'asc' ? '▲' : '▼') : '⇅'}</span>
              </th>
              <th class="op-cal__contract">Lavorazione</th>
              <th class="op-cal__status op-cal__th-sortable ${this._sortKey === 'status' ? 'is-active' : ''}" data-sort="status">
                Stato
                <span class="op-cal__th-arrow">${this._sortKey === 'status' ? (this._sortDir === 'asc' ? '▲' : '▼') : '⇅'}</span>
              </th>
              ${months.map(m => `<th class="op-cal__month ${m.isCurrent ? 'is-current' : ''}">${safe(m.label.toUpperCase())}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => {
              const c = r.client;
              const q = r.contract;
              // Stato PER LAVORAZIONE (richiesta Luigi): se il contratto ha
              // un operativeStatus suo, vince. Altrimenti fallback su quello
              // del cliente (per i casi senza contratto).
              const lavorazioneStatus = (q && q.operativeStatus) || c.operativeStatus || 'attivo';
              const stMeta = STATUS_META[lavorazioneStatus];
              const qSyncId = q ? q.syncId : '';
              // Cliente cell solo sulla prima riga (rowspan visivo via classe)
              const clientCell = r.isFirstRow ? `
                <td class="op-cal__client ${r.isNew ? 'is-new' : ''}" ${r.totalContracts > 1 ? `rowspan="${r.totalContracts}"` : ''}>
                  <div class="op-cal__client-name">${safe(c.brand || c.name)}${r.isNew ? ' <span class="op-cal__new-badge">NUOVO</span>' : ''}</div>
                  ${c.brand ? `<div class="op-cal__client-rs">${safe(c.name)}</div>` : ''}
                  ${c.needsContract ? '<div class="op-cal__client-warn">⚠ senza contratto</div>' : ''}
                </td>` : '';
              // Stato PER OGNI RIGA (non più rowspan)
              const statusCell = `
                <td class="op-cal__status">
                  <span class="op-cal__status-chip" style="color:${stMeta.color};border-color:${stMeta.color}40;background:${stMeta.color}12">
                    <span class="op-cal__status-dot">${stMeta.dot}</span>
                    ${safe(stMeta.label)}
                  </span>
                </td>`;
              const contractCell = q ? `
                <td class="op-cal__contract">
                  <button class="op-cal__contract-btn" data-act="open-contract" data-client="${c.syncId}" title="Apri dettaglio contratti">
                    <span class="op-cal__contract-tag">${safe(q.tag)}</span>
                  </button>
                </td>
              ` : `<td class="op-cal__contract"><span class="op-cal__contract-empty">—</span></td>`;
              const groupCls = (r.groupIndex % 2 === 0) ? 'is-group-even' : 'is-group-odd';
              const lastInGroupCls = (r.contractIndex === (r.totalContracts - 1) || r.totalContracts === 0) ? 'is-group-last' : '';
              return `
              <tr data-client="${c.syncId}" data-quote="${qSyncId}" class="${groupCls} ${lastInGroupCls} ${r.isNew ? 'is-new-row' : ''} ${!r.isFirstRow ? 'is-subrow' : ''}" data-client-group="${c.syncId}">
                ${clientCell}
                ${contractCell}
                ${statusCell}
                ${months.map(m => {
                  const status = statusOf(c.syncId, qSyncId, r.isFirstRow, m.year, m.month);
                  const meta = status ? this.statusMeta(status) : null;
                  return `
                    <td class="op-cal__cell ${m.isCurrent ? 'is-current' : ''} ${status ? '' : 'is-empty'}"
                        data-client="${c.syncId}" data-quote="${qSyncId}" data-year="${m.year}" data-month="${m.month}">
                      ${meta ? `<span class="op-cal-chip" style="background:${meta.color}26;color:${meta.color};border-color:${meta.color}80">${safe(meta.label)}</span>` : '<span class="op-cal__plus">+</span>'}
                    </td>
                  `;
                }).join('')}
              </tr>
            `;}).join('')}
          </tbody>
        </table>
      </div>
    `;

    // Bind sort headers (3-state cycle)
    panel.querySelectorAll('.op-cal__th-sortable').forEach(th => {
      th.addEventListener('click', () => {
        this._toggleSort(th.dataset.sort);
        this._renderPanel(root);
      });
    });

    // Bind navigazione
    panel.querySelector('[data-act="prev-window"]').addEventListener('click', () => {
      this._windowStart = new Date(this._windowStart.getFullYear(), this._windowStart.getMonth() - this._windowMonths, 1);
      this._renderPanel(root);
    });
    panel.querySelector('[data-act="next-window"]').addEventListener('click', () => {
      this._windowStart = new Date(this._windowStart.getFullYear(), this._windowStart.getMonth() + this._windowMonths, 1);
      this._renderPanel(root);
    });
    panel.querySelector('[data-act="today-window"]').addEventListener('click', () => {
      this._windowStart = null;
      this._renderPanel(root);
    });

    // Bind click celle → side panel (passo anche quoteSyncId per separare
    // task per lavorazione)
    panel.querySelectorAll('.op-cal__cell').forEach(cell => {
      cell.addEventListener('click', () => {
        const client = clients.find(c => c.syncId === cell.dataset.client);
        const quoteSyncId = cell.dataset.quote || null;
        this._openTaskPanel(client, parseInt(cell.dataset.year, 10), parseInt(cell.dataset.month, 10), quoteSyncId);
      });
    });
    // Bind click colonna Contratto → modal dettaglio contratti del cliente
    panel.querySelectorAll('[data-act="open-contract"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const client = clients.find(c => c.syncId === btn.dataset.client);
        if (client) this._openContractsModal(client);
      });
    });
  },

  /** Modal con dettaglio dei contratti attivi del cliente. Stile coerente
      con Situazione clienti (rem-modal centrato). */
  _openContractsModal(client) {
    const safe = s => String(s == null ? '' : s).replace(/[<>]/g, '');
    const fmtDate = d => d ? new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
    const fmtEur = n => '€ ' + (Number(n) || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const stageMeta = (s) => {
      const map = { firmato: '#06b6d4', in_produzione: '#0891b2', completato: '#16a34a' };
      return map[s] || '#6b7280';
    };
    const contracts = client.contracts || [];
    const existing = document.getElementById('opContractsModal');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.id = 'opContractsModal';
    overlay.className = 'rem-modal op-task-modal';
    overlay.innerHTML = `
      <div class="rem-modal__box op-task-modal__box">
        <header class="op-task-modal__head">
          <div>
            <div class="op-task-modal__eyebrow">CONTRATTI ATTIVI · ${(client.areas || []).join(', ').toUpperCase()}</div>
            <h3>${safe(client.brand || client.name)}</h3>
            ${client.brand ? `<div class="op-task-modal__rs">${safe(client.name)}</div>` : ''}
          </div>
          <button class="contract-modal__close" data-act="close" aria-label="Chiudi">×</button>
        </header>
        <div class="op-task-modal__body">
          ${contracts.length === 0 ? '<p style="color:var(--ad-mute)">Nessun contratto attivo.</p>' : contracts.map(c => `
            <div class="op-contract-card">
              <div class="op-contract-card__head">
                <div>
                  <div class="op-contract-card__tag">${safe(c.tag)}</div>
                  ${c.number ? `<div class="op-contract-card__num">#${safe(c.number)}</div>` : ''}
                </div>
                <span class="op-contract-card__stage" style="color:${stageMeta(c.pipelineStage)};border-color:${stageMeta(c.pipelineStage)}40;background:${stageMeta(c.pipelineStage)}12">
                  ${safe(c.pipelineStage)}
                </span>
              </div>
              <div class="op-contract-card__grid">
                <div><span>Firma</span><b>${fmtDate(c.signedAt)}</b></div>
                <div><span>Inizio</span><b>${fmtDate(c.expectedStartDate)}</b></div>
                <div><span>Fine</span><b>${fmtDate(c.expectedEndDate)}</b></div>
                <div><span>Tipo</span><b>${safe(c.contractType || '—')}</b></div>
                <div><span>Voci</span><b>${c.linesCount}</b></div>
                <div><span>Canone</span><b>${c.monthly > 0 ? fmtEur(c.monthly) + '/mese' : '—'}</b></div>
                <div><span>Totale netto</span><b>${fmtEur(c.net)}</b></div>
              </div>
            </div>
          `).join('')}
        </div>
        <footer class="op-task-modal__foot">
          <button class="btn btn--ghost btn--sm" data-act="close">Chiudi</button>
        </footer>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelectorAll('[data-act="close"]').forEach(b => b.addEventListener('click', close));
  },
};

window.SocialPlan = SocialPlan;
