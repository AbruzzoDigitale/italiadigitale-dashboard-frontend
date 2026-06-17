/* ============================================================
   APP-PROFILE.JS — Estensioni per Profilo, Brand agenzia, KPI, Firma
   Si attiva dopo App.init() senza modificare i file core
   ============================================================ */

(function() {

  // Aspetto che App sia disponibile
  function whenReady(cb) {
    if (window.App && document.readyState !== 'loading') return cb();
    document.addEventListener('DOMContentLoaded', () => setTimeout(cb, 50));
  }

  whenReady(async () => {
    if (!window.App) return;

    // ============================================================
    // 1) Estendo App.navigate per gestire profile e brand
    // ============================================================
    const originalNavigate = App.navigate.bind(App);
    App.navigate = async function(view) {
      await originalNavigate(view);
      // 'profile' è stato accorpato in 'brand' (Personalizza): apre entrambe.
      if (view === 'profile' || view === 'brand') {
        await renderProfileView();
        await renderBrandView();
        await renderLoginCustomization();
      }
      else if (view === 'dashboard') await renderCustomKpis();
      else if (view === 'configurator') {
        if (window.ConfigView) ConfigView.render();
      }
    };

    // Pre-popola i campi della sezione "Schermata di login"
    async function renderLoginCustomization() {
      const set = (id, fb) => {
        const el = document.getElementById(id);
        if (!el) return Promise.resolve();
        return DB.getSetting(id.replace('loginCustom', 'login_').toLowerCase(), null).then(v => {
          el.value = v != null && v !== '' ? v : '';
          el.placeholder = fb;
        });
      };
      await set('loginCustomTitle',    'ABRUZZO DIGITALE');
      await set('loginCustomSubtitle', 'Accedi al preventivatore');
      await set('loginCustomTagline',  'Cuore Abruzzese, Mente Digitale.');
      await renderNotificheSettings();
    }

    // Pre-popola i campi della sezione "Notifiche richieste"
    async function renderNotificheSettings() {
      const enabled = await DB.getSetting('notif_sound_enabled', true);
      const customSound = await DB.getSetting('notif_sound', null);
      const chk = document.getElementById('notifSoundEnabled');
      const status = document.getElementById('notifSoundStatus');
      if (chk) chk.checked = !!enabled;
      if (status) {
        if (customSound) {
          const kb = Math.round((customSound.length * 0.75) / 1024); // base64 → bytes
          status.textContent = `Suono personalizzato caricato (~${kb} KB).`;
        } else {
          status.textContent = 'Nessun file caricato — verrà usato il beep di default.';
        }
      }
    }

    // ============================================================
    // 2) Applica i logo brand quando l'utente fa login (showApp)
    // ============================================================
    const originalShowApp = App.showApp.bind(App);
    App.showApp = function() {
      originalShowApp();
      Brand.applyLogos();
      Profile.refreshTopbar();
      if (window.Roles) {
        Roles.seedDefaultOperator().then(async () => {
          await Roles.apply();
        });
      }
    };

    // Applico SEMPRE i loghi brand, anche senza sessione: così la
    // schermata di login mostra il logo caricato invece del placeholder.
    // (i brand_* stanno in IndexedDB settings, leggibili senza login)
    try { await Brand.applyLogos(); } catch (e) { console.warn('applyLogos init:', e); }
    if (State.currentUser) {
      await Profile.refreshTopbar();
    }

    // Avatar topbar: il dropdown utente è gestito direttamente da
    // App._bindUserMenu(). Nessuna re-bind qui (clonare il nodo
    // distruggerebbe i listener appena registrati).

    // ============================================================
    // 4) Binding handlers profilo
    // ============================================================
    bindProfileHandlers();
    bindBrandHandlers();
  });

  // ============================================================
  // PROFILE VIEW
  // ============================================================
  async function renderProfileView() {
    const u = await Profile.get();
    if (!u) return;
    document.getElementById('profileName').value = u.name || '';
    document.getElementById('profileRole').value = u.roleLabel || (u.role === 'admin' ? 'Admin' : 'Team');
    document.getElementById('profileEmail').value = u.email || '';
    document.getElementById('profilePhone').value = u.phone || '';
    document.getElementById('profileSignature').value = u.signature || '';

    // Avatar
    const avatarBig = document.getElementById('profileAvatarBig');
    const initial = document.getElementById('profileAvatarInitial');
    if (u.avatar) {
      // Sostituisco lo span iniziale con l'immagine
      initial.style.display = 'none';
      let img = avatarBig.querySelector('img');
      if (!img) {
        img = document.createElement('img');
        img.style.cssText = 'width:100%;height:100%;object-fit:cover';
        avatarBig.insertBefore(img, avatarBig.querySelector('label'));
      }
      img.src = u.avatar;
    } else {
      const img = avatarBig.querySelector('img');
      if (img) img.remove();
      initial.style.display = '';
      initial.textContent = (u.name || '?').charAt(0).toUpperCase();
    }

    document.getElementById('profileCardName').textContent = u.name || '';
    document.getElementById('profileCardRole').textContent = u.roleLabel || (u.role === 'admin' ? 'Admin' : 'Team');

    // Firma immagine
    const sigPreview = document.getElementById('signaturePreview');
    if (u.signatureImage) {
      sigPreview.style.display = 'block';
      sigPreview.innerHTML = `<img src="${u.signatureImage}" alt="firma">`;
    } else {
      sigPreview.style.display = 'none';
    }

    document.getElementById('passwordStatus').innerHTML = '';
    document.getElementById('oldPassword').value = '';
    document.getElementById('newPassword').value = '';
  }

  function bindProfileHandlers() {
    // Upload avatar
    const avatarInput = document.getElementById('profileAvatarInput');
    if (avatarInput) {
      avatarInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const dataUrl = await Brand.fileToDataUrl(file);
        await Profile.setAvatar(dataUrl);
        await renderProfileView();
        await Profile.refreshTopbar();
        App._toast('Foto profilo aggiornata', 'success');
      });
    }

    // Save dati personali
    const saveProfileBtn = document.getElementById('saveProfileBtn');
    if (saveProfileBtn) {
      saveProfileBtn.addEventListener('click', async () => {
        await Profile.save({
          name: document.getElementById('profileName').value,
          roleLabel: document.getElementById('profileRole').value,
          email: document.getElementById('profileEmail').value,
          phone: document.getElementById('profilePhone').value,
        });
        await Profile.refreshTopbar();
        await renderProfileView();
        App._toast('Dati personali salvati', 'success');
      });
    }

    // Save firma
    const saveSigBtn = document.getElementById('saveSignatureBtn');
    if (saveSigBtn) {
      saveSigBtn.addEventListener('click', async () => {
        const text = document.getElementById('profileSignature').value;
        const fileInput = document.getElementById('profileSignatureImg');
        const file = fileInput.files[0];
        let img = null;
        if (file) img = await Brand.fileToDataUrl(file);
        const current = await Profile.get();
        await Profile.setSignature(text, img || current.signatureImage);
        await renderProfileView();
        App._toast('Firma salvata', 'success');
      });
    }

    // Cambia password
    const cpBtn = document.getElementById('changePasswordBtn');
    if (cpBtn) {
      cpBtn.addEventListener('click', async () => {
        const oldP = document.getElementById('oldPassword').value;
        const newP = document.getElementById('newPassword').value;
        if (!oldP || !newP) {
          document.getElementById('passwordStatus').innerHTML =
            '<span style="color:var(--ad-danger)">Compila entrambi i campi</span>';
          return;
        }
        if (newP.length < 6) {
          document.getElementById('passwordStatus').innerHTML =
            '<span style="color:var(--ad-danger)">Nuova password troppo corta (min 6)</span>';
          return;
        }
        const ok = await Profile.changePassword(oldP, newP);
        if (ok) {
          document.getElementById('passwordStatus').innerHTML =
            '<span style="color:var(--ad-success)">✓ Password aggiornata</span>';
          document.getElementById('oldPassword').value = '';
          document.getElementById('newPassword').value = '';
          App._toast('Password cambiata', 'success');
        } else {
          document.getElementById('passwordStatus').innerHTML =
            '<span style="color:var(--ad-danger)">Password attuale errata</span>';
        }
      });
    }
  }

  // ============================================================
  // BRAND VIEW
  // ============================================================
  async function renderBrandView() {
    const slotsBox = document.getElementById('brandSlots');
    const all = await Brand.getAll();
    slotsBox.innerHTML = Brand.SLOTS.map(s => {
      const has = !!all[s.key];
      return `
        <div class="brand-slot ${has ? 'has-image' : ''}" data-slot="${s.key}">
          <div class="brand-slot__label">${s.label}</div>
          <div class="brand-slot__preview ${s.bg}">
            ${has ? `<img src="${all[s.key]}" alt="${s.label}">` : `<span class="placeholder">— ${s.context} —</span>`}
          </div>
          <div class="brand-slot__actions">
            <label class="btn btn--secondary btn--sm">
              ${has ? 'Sostituisci' : 'Carica'}
              <input type="file" accept="image/*" data-slot-upload="${s.key}">
            </label>
            ${has ? `<button class="btn btn--ghost btn--sm" data-slot-clear="${s.key}">Rimuovi</button>` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Bind upload
    slotsBox.querySelectorAll('input[data-slot-upload]').forEach(input => {
      input.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const key = e.target.dataset.slotUpload;
        const dataUrl = await Brand.fileToDataUrl(file);
        await Brand.set(key, dataUrl);
        App._toast(`Logo "${Brand.SLOTS.find(s => s.key === key).label}" salvato`, 'success');
        await renderBrandView();
        await Brand.applyLogos();
        await updateQuoteHeaderPreview();
      });
    });

    // Bind clear
    slotsBox.querySelectorAll('button[data-slot-clear]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const key = e.target.dataset.slotClear;
        if (!confirm('Rimuovere questo logo?')) return;
        await Brand.clear(key);
        await renderBrandView();
        await Brand.applyLogos();
        await updateQuoteHeaderPreview();
      });
    });

    // KPI config
    await renderKpiConfig();

    // Header anteprima
    await updateQuoteHeaderPreview();
  }

  async function updateQuoteHeaderPreview() {
    const all = await Brand.getAll();
    const target = document.getElementById('quoteHeaderPreviewLogo');
    if (!target) return;
    const logo = all.horiz_light || all.mark_light;
    if (logo) {
      target.innerHTML = `<img src="${logo}" alt="Abruzzo Digitale" style="height:100%">`;
    } else {
      target.innerHTML = '— carica il lockup orizzontale (versione chiara) per vedere l\'anteprima —';
    }
  }

  async function renderKpiConfig() {
    const enabled = await KpiConfig.getEnabled();
    const grid = document.getElementById('kpiConfigGrid');
    grid.innerHTML = KpiConfig.AVAILABLE.map(k => `
      <label class="kpi-config-item ${enabled.includes(k.id) ? 'is-active' : ''}" data-kpi="${k.id}">
        <input type="checkbox" ${enabled.includes(k.id) ? 'checked' : ''}>
        <div class="kpi-config-item__check"></div>
        <div>
          <div class="kpi-config-item__title">${k.label}</div>
          <div class="kpi-config-item__desc">${k.desc}</div>
        </div>
      </label>
    `).join('');
    grid.querySelectorAll('.kpi-config-item').forEach(item => {
      item.addEventListener('click', async (e) => {
        e.preventDefault();
        const id = item.dataset.kpi;
        await KpiConfig.toggle(id);
        await renderKpiConfig();
      });
    });
  }

  function bindBrandHandlers() {
    const saveKpiBtn = document.getElementById('saveKpiBtn');
    if (saveKpiBtn) {
      saveKpiBtn.addEventListener('click', async () => {
        App._toast('Configurazione KPI salvata', 'success');
      });
    }

    // ---- Notifiche richieste: toggle / upload custom / anteprima / reset ----
    const notifChk   = document.getElementById('notifSoundEnabled');
    const notifFile  = document.getElementById('notifSoundFile');
    const notifTest  = document.getElementById('notifSoundTest');
    const notifReset = document.getElementById('notifSoundReset');
    const notifStat  = document.getElementById('notifSoundStatus');

    if (notifChk) {
      notifChk.addEventListener('change', async () => {
        await DB.setSetting('notif_sound_enabled', !!notifChk.checked);
        App._toast(notifChk.checked ? 'Suono notifiche attivato' : 'Suono notifiche disattivato', 'success');
      });
    }
    if (notifFile) {
      notifFile.addEventListener('change', async (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        if (f.size > 1024 * 1024) { // 1 MB
          App._toast('File troppo grande (max 1 MB)', 'error');
          notifFile.value = '';
          return;
        }
        const reader = new FileReader();
        reader.onload = async () => {
          await DB.setSetting('notif_sound', reader.result);
          if (notifStat) notifStat.textContent = `Suono personalizzato caricato (~${Math.round(f.size/1024)} KB).`;
          App._toast('Suono personalizzato salvato', 'success');
        };
        reader.readAsDataURL(f);
      });
    }
    if (notifTest) {
      notifTest.addEventListener('click', async () => {
        // ignora il flag enabled per la sola anteprima
        const wasEnabled = await DB.getSetting('notif_sound_enabled', true);
        if (!wasEnabled) await DB.setSetting('notif_sound_enabled', true);
        await App._playNotificationSound();
        if (!wasEnabled) await DB.setSetting('notif_sound_enabled', false);
      });
    }
    if (notifReset) {
      notifReset.addEventListener('click', async () => {
        if (!confirm('Ripristinare il suono di default (beep)?')) return;
        await DB.setSetting('notif_sound', null);
        if (notifFile) notifFile.value = '';
        if (notifStat) notifStat.textContent = 'Nessun file caricato — verrà usato il beep di default.';
        App._toast('Suono ripristinato al default', 'success');
      });
    }

    // Salva i testi della schermata di login (titolo/sottotitolo/tagline).
    // Le chiavi 'login_*' sono sincronizzate via backend → appaiono in
    // ogni finestra, anche pre-login (endpoint pubblico /brand).
    const saveLoginBtn = document.getElementById('saveLoginCustomBtn');
    if (saveLoginBtn) {
      saveLoginBtn.addEventListener('click', async () => {
        const get = id => (document.getElementById(id) || {}).value || '';
        const t = get('loginCustomTitle').trim();
        const s = get('loginCustomSubtitle').trim();
        const g = get('loginCustomTagline').trim();
        // Stringa vuota → salva null (ripristina il default codificato in HTML)
        await DB.setSetting('login_title',    t || null);
        await DB.setSetting('login_subtitle', s || null);
        await DB.setSetting('login_tagline',  g || null);
        await Brand.applyLogos();   // riapplica subito i testi al DOM login
        const status = document.getElementById('loginCustomStatus');
        if (status) {
          status.textContent = 'Salvato. I testi appariranno al prossimo accesso (e nelle altre finestre).';
          setTimeout(() => { if (status) status.textContent = ''; }, 4000);
        }
        App._toast('Testi schermata login salvati', 'success');
      });
    }
  }

  // ============================================================
  // KPI nella dashboard: sostituisce i 4 KPI fissi con quelli scelti
  // ============================================================
  async function renderCustomKpis() {
    const enabled = await KpiConfig.getEnabled();
    if (!enabled || enabled.length === 0) return;
    const grid = document.querySelector('#view-dashboard .dash-grid');
    if (!grid) return;
    const cards = [];
    for (const id of enabled) {
      const meta = KpiConfig.getMeta(id);
      if (!meta) continue;
      const res = await KpiConfig.compute(id);
      cards.push(`
        <div class="kpi">
          <div class="kpi__label">${meta.label}</div>
          <div class="kpi__value">${res.value}</div>
          <div class="kpi__sub">${res.sub}</div>
        </div>
      `);
    }
    if (cards.length > 0) grid.innerHTML = cards.join('');
  }

  // ============================================================
  // FIRMA nei preventivi: aggiunta nella vista presentazione e PDF
  // ============================================================
  async function appendSignatureToPresentation() {
    const u = await Profile.get();
    if (!u || (!u.signature && !u.signatureImage)) return;
    const totalbar = document.querySelector('.presentation__totalbar');
    if (!totalbar) return;
    // Rimuovo eventuale firma precedente
    const existing = document.querySelector('.presentation__signature');
    if (existing) existing.remove();
    const sig = document.createElement('div');
    sig.className = 'presentation__signature';
    sig.style.cssText = 'margin-top:24px;padding:24px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:var(--r-xl);white-space:pre-line;font-size:var(--fs-sm);line-height:var(--lh-base)';
    let html = '';
    if (u.signature) html += `<div>${escapeHtml(u.signature)}</div>`;
    if (u.signatureImage) html += `<img src="${u.signatureImage}" style="max-height:80px;margin-top:12px" alt="firma">`;
    sig.innerHTML = html;
    totalbar.parentNode.insertBefore(sig, totalbar);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // Hook nella vista presentazione: la firma compare quando viene aperta
  whenReady(() => {
    if (!window.Views) return;
    const originalOpen = Views.openPresentation.bind(Views);
    Views.openPresentation = function(fromQuote) {
      originalOpen(fromQuote);
      if (fromQuote) setTimeout(appendSignatureToPresentation, 50);
    };
  });

})();
