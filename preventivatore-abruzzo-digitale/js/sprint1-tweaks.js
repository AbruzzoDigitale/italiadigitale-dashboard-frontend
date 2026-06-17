/* ============================================================
   SPRINT 1.1 TWEAKS — Refinement features
   ============================================================ */

(function() {

  function whenReady(cb) {
    if (window.App && document.readyState !== 'loading') return setTimeout(cb, 100);
    document.addEventListener('DOMContentLoaded', () => setTimeout(cb, 200));
  }

  // ============================================================
  // 1) THEME (light/dark)
  // ============================================================
  const Theme = {
    async get() { return await DB.getSetting('theme', 'light'); },
    async set(value) {
      await DB.setSetting('theme', value);
      this.apply(value);
    },
    apply(value) {
      const html = document.documentElement;
      html.classList.toggle('theme-dark', value === 'dark');
    },
    async toggle() {
      const cur = await this.get();
      const next = cur === 'dark' ? 'light' : 'dark';
      await this.set(next);
      return next;
    },
  };
  window.Theme = Theme;

  // ============================================================
  // 2) Override Brand.applyLogos: sidebar usa SOLO il pittogramma
  // + favicon dinamica
  // ============================================================
  whenReady(async () => {
    if (window.Brand) {
      const originalApply = Brand.applyLogos.bind(Brand);
      Brand.applyLogos = async function() {
        const all = await Brand.getAll();
        // Sidebar: SOLO pittogramma (non lockup)
        Brand._setLogo('sidebarLogo', all.mark_dark);
        // Login: lockup verticale (fallback al pittogramma)
        Brand._setLogo('loginLogo', all.vert_dark || all.mark_dark);
        // Presentazione: lockup orizzontale (fallback al pittogramma)
        Brand._setLogo('presentationLogo', all.horiz_dark || all.mark_dark);
        // Favicon dinamica
        if (all.mark_dark || all.mark_light) {
          const favLink = document.querySelector('link[rel="icon"]');
          if (favLink) favLink.href = all.mark_light || all.mark_dark;
        }
      };
    }

    // Carica tema salvato
    const t = await Theme.get();
    Theme.apply(t);
    addThemeToggle();

    // Aggiungi handler "Indietro" per chiudere config pacchetto (se non c'e)
    setupBackToPackList();
  });

  // ============================================================
  // 3) Aggiungi pulsante toggle tema nel topbar
  // ============================================================
  function addThemeToggle() {
    const actions = document.querySelector('.topbar__actions');
    if (!actions || document.getElementById('themeToggle')) return;
    const btn = document.createElement('button');
    btn.id = 'themeToggle';
    btn.className = 'theme-toggle';
    btn.title = 'Cambia tema chiaro/scuro';
    btn.innerHTML = sunIcon();
    btn.addEventListener('click', async () => {
      const newTheme = await Theme.toggle();
      btn.innerHTML = newTheme === 'dark' ? moonIcon() : sunIcon();
      App._toast(`Tema ${newTheme === 'dark' ? 'scuro' : 'chiaro'} attivato`, '');
    });
    // Inserisco subito prima del wrapper della user-chip (figlio diretto di actions).
    // Fallback: prima della user-chip stessa, se per qualche motivo non c'è il wrapper.
    const wrap = actions.querySelector('.user-chip-wrap') || actions.querySelector('.user-chip');
    if (wrap && wrap.parentNode === actions) actions.insertBefore(btn, wrap);
    else actions.appendChild(btn);
    // Imposta icona corretta
    Theme.get().then(t => btn.innerHTML = t === 'dark' ? moonIcon() : sunIcon());
  }

  function sunIcon() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
  }
  function moonIcon() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  }

  // [Rimosso patch packToQuote: ora gestito direttamente in views.js]



  // ============================================================
  // 5) Helper "Indietro" per chiudere configuratore pacchetto
  // ============================================================
  function setupBackToPackList() {
    // gia gestito dal pulsante "Annulla"
  }

})();
