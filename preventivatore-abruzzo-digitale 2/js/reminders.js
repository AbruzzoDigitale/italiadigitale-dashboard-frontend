/* ============================================================
   REMINDERS.JS — Promemoria della pipeline
   - Storage in DB.setSetting('reminders_list', [...])
     (no nuovo IndexedDB store → niente migrazione)
   - Banner in dashboard per i reminders scaduti
   - Prompt automatici alla transizione 'accettato' (invio
     contratto: 7gg / 14gg / custom) e 'perso' (follow-up 2 settimane)
   ============================================================ */

const Reminders = {

  async all() {
    const list = await DB.getSetting('reminders_list', []);
    return Array.isArray(list) ? list : [];
  },

  async _save(list) {
    await DB.setSetting('reminders_list', list);
  },

  /** Aggiunge un reminder. dueIn = giorni dal momento attuale. */
  async add(quoteId, type, dueInDays, message) {
    const list = await this.all();
    const due = new Date(Date.now() + dueInDays * 86400000);
    const item = {
      id: 'r_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      quoteId, type, message,
      dueAt: due.toISOString(),
      createdAt: new Date().toISOString(),
      createdBy: State.currentUser ? State.currentUser.username : null,
      status: 'pending',
    };
    list.push(item);
    await this._save(list);
    return item;
  },

  async markDone(id) {
    const list = await this.all();
    const it = list.find(x => x.id === id);
    if (!it) return;
    it.status = 'done';
    it.doneAt = new Date().toISOString();
    await this._save(list);
  },

  async remove(id) {
    const list = await this.all();
    const out = list.filter(x => x.id !== id);
    await this._save(out);
  },

  /** Reminders scaduti (pending e dueAt <= now). */
  async due() {
    const list = await this.all();
    const now = Date.now();
    return list.filter(r => r.status === 'pending' && new Date(r.dueAt).getTime() <= now);
  },

  /** Reminders attivi (pending), ordinati per scadenza. */
  async active() {
    const list = await this.all();
    return list
      .filter(r => r.status === 'pending')
      .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
  },

  // ===========================================================
  // Modale prompt — invio contratto (transizione 'accettato')
  // ===========================================================
  async promptInvioContrattoSlots(quoteId) {
    return new Promise((resolve) => {
      const q = document.createElement('div');
      q.className = 'rem-modal';
      q.innerHTML = `
        <div class="rem-modal__box">
          <h3>Promemoria invio contratto</h3>
          <p>Il preventivo è stato accettato. Quando vuoi essere ricordato di inviare il contratto da firmare al cliente?</p>
          <div class="rem-modal__slots">
            <button class="btn btn--secondary" data-d="7">Tra 7 giorni</button>
            <button class="btn btn--secondary" data-d="14">Tra 14 giorni</button>
            <button class="btn btn--secondary" data-d="21">Tra 21 giorni</button>
            <button class="btn btn--ghost" data-d="custom">Personalizzato…</button>
            <button class="btn btn--ghost" data-d="skip">Nessuno</button>
          </div>
        </div>
      `;
      document.body.appendChild(q);
      q.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-d]');
        if (!btn) return;
        let days = btn.dataset.d;
        if (days === 'skip') { q.remove(); return resolve(null); }
        if (days === 'custom') {
          const n = parseInt(prompt('Tra quanti giorni vuoi essere ricordato?', '10'), 10);
          if (!n || n < 1) { q.remove(); return resolve(null); }
          days = n;
        }
        const item = await Reminders.add(quoteId, 'invio_contratto', parseInt(days, 10),
          `Inviare contratto da firmare al cliente del preventivo #${quoteId}`);
        App._toast(`Promemoria invio contratto fissato tra ${days} giorni`, 'success');
        q.remove();
        resolve(item);
      });
    });
  },

  // ===========================================================
  // Modale prompt — follow-up perso (transizione 'perso')
  // ===========================================================
  async promptFollowUpPerso(quoteId) {
    return new Promise((resolve) => {
      const q = document.createElement('div');
      q.className = 'rem-modal';
      q.innerHTML = `
        <div class="rem-modal__box">
          <h3>Reminder follow-up trattativa persa</h3>
          <p>Vuoi che ti ricordi di richiamare il cliente per verificare l'andamento? (Standard: 2 settimane)</p>
          <div class="rem-modal__slots">
            <button class="btn btn--secondary" data-d="14">Tra 2 settimane (standard)</button>
            <button class="btn btn--secondary" data-d="30">Tra 1 mese</button>
            <button class="btn btn--ghost" data-d="custom">Personalizzato…</button>
            <button class="btn btn--ghost" data-d="skip">Nessuno</button>
          </div>
        </div>
      `;
      document.body.appendChild(q);
      q.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-d]');
        if (!btn) return;
        let days = btn.dataset.d;
        if (days === 'skip') { q.remove(); return resolve(null); }
        if (days === 'custom') {
          const n = parseInt(prompt('Tra quanti giorni?', '14'), 10);
          if (!n || n < 1) { q.remove(); return resolve(null); }
          days = n;
        }
        const item = await Reminders.add(quoteId, 'followup_perso', parseInt(days, 10),
          `Follow-up trattativa persa: chiedere al cliente l'andamento`);
        App._toast(`Follow-up fissato tra ${days} giorni`, 'success');
        q.remove();
        resolve(item);
      });
    });
  },

  // ===========================================================
  // Banner reminders scaduti in dashboard
  // ===========================================================
  async renderDashboardBanner() {
    const wrap = document.getElementById('dashRemindersBanner');
    if (!wrap) return;
    if (!window.Roles || !Roles.isAdmin()) { wrap.innerHTML = ''; return; }
    const due = await this.due();
    if (!due.length) { wrap.innerHTML = ''; return; }
    const quotes = await DB.all('quotes');
    const clients = await DB.all('clients');
    wrap.innerHTML = `
      <div class="rem-banner">
        <div class="rem-banner__head">
          <span class="rem-banner__icon">⏰</span>
          <b>${due.length} promemoria scadut${due.length === 1 ? 'o' : 'i'}</b>
        </div>
        <ul class="rem-banner__list">
          ${due.slice(0, 5).map(r => {
            const q = quotes.find(x => x.id === r.quoteId);
            const c = q ? clients.find(x => x.id === q.clientId) : null;
            const cli = (c && c.name) || (q && q.clientName) || '— cliente —';
            const ago = Reminders._humanDelta(new Date(r.dueAt), new Date());
            return `<li>
              <span><b>${cli}</b> · ${r.message || r.type} <span style="opacity:.6">(${ago})</span></span>
              <span class="rem-banner__actions">
                <button class="btn btn--ghost btn--sm" data-rem-open="${r.quoteId}">Apri</button>
                <button class="btn btn--ghost btn--sm" data-rem-done="${r.id}">Fatto</button>
                <button class="btn btn--ghost btn--sm" data-rem-snooze="${r.id}">+7gg</button>
              </span>
            </li>`;
          }).join('')}
        </ul>
        ${due.length > 5 ? `<div style="opacity:.7;font-size:11px;margin-top:6px">…e altri ${due.length - 5} da gestire.</div>` : ''}
      </div>
    `;
    wrap.querySelectorAll('[data-rem-open]').forEach(b =>
      b.addEventListener('click', () => App.navigate('pipeline').then(() => Pipeline.openDetail(parseInt(b.dataset.remOpen, 10)))));
    wrap.querySelectorAll('[data-rem-done]').forEach(b =>
      b.addEventListener('click', async () => { await Reminders.markDone(b.dataset.remDone); App._toast('Promemoria archiviato', 'success'); await Reminders.renderDashboardBanner(); }));
    wrap.querySelectorAll('[data-rem-snooze]').forEach(b =>
      b.addEventListener('click', async () => {
        const list = await Reminders.all();
        const it = list.find(x => x.id === b.dataset.remSnooze);
        if (!it) return;
        it.dueAt = new Date(Date.now() + 7 * 86400000).toISOString();
        await Reminders._save(list);
        App._toast('Rimandato di 7 giorni', 'success');
        await Reminders.renderDashboardBanner();
      }));
  },

  _humanDelta(due, now) {
    const ms = now - due;
    if (ms < 0) {
      const d = Math.ceil(-ms / 86400000);
      return d <= 1 ? 'oggi' : `tra ${d}gg`;
    }
    const d = Math.floor(ms / 86400000);
    if (d === 0) return 'scaduto oggi';
    if (d === 1) return 'scaduto ieri';
    return `scaduto da ${d}gg`;
  },
};

window.Reminders = Reminders;
