/* ============================================================
   CONFIGURATOR-VIEW.JS — Sprint 2.2
   ============================================================ */

const ConfigView = {

  render() {
    this._renderTabs();
    this._renderArea();
    this._renderCanvas();
    this._setupDropZone();
  },

  _renderTabs() {
    const tabs = document.getElementById('cfgTabs');
    if (!tabs) return;
    tabs.innerHTML = ConfiguratorData.areas.map(a => `
      <button class="cfg-tab ${a.id === Configurator.currentArea ? 'is-active' : ''}" data-area="${a.id}">
        <span class="cfg-tab__icon">${a.icon}</span>
        <span class="cfg-tab__name">${a.name}</span>
      </button>
    `).join('');
    tabs.querySelectorAll('.cfg-tab').forEach(t => {
      t.addEventListener('click', () => {
        Configurator.setArea(t.dataset.area);
        this._renderTabs();
        this._renderArea();
        this._renderCanvas();
      });
    });
  },

  _renderArea() {
    const palette = document.getElementById('cfgPalette');
    if (!palette) return;
    const area = ConfiguratorData.areas.find(a => a.id === Configurator.currentArea);
    if (!area) return;

    palette.innerHTML = `
      <div class="cfg-area-intro">
        <p>${area.desc}</p>
      </div>
      ${area.sections.map(sec => this._sectionHtml(sec)).join('')}
    `;

    palette.querySelectorAll('.cfg-box').forEach(el => {
      const isFamily = el.classList.contains('cfg-box--family');
      // Le card famiglia non sono draggable: si selezionano via picker
      if (!isFamily) {
        el.setAttribute('draggable', 'true');
        el.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/box-id', el.dataset.boxId);
          e.dataTransfer.effectAllowed = 'copy';
          el.classList.add('is-dragging');
        });
        el.addEventListener('dragend', () => el.classList.remove('is-dragging'));
        el.addEventListener('click', () => {
          Configurator.addBox(el.dataset.boxId);
          this._renderCanvas();
          this._refreshAddedState();
          this._refreshLocks();
        });
      } else {
        el.addEventListener('click', () => this._openFamilyPicker(el.dataset.familyId));
      }
    });

    this._refreshAddedState();
  },

  _sectionHtml(sec) {
    const hint = sec.requiredHint || sec.requiresHint;
    // ============================================================
    // FAMIGLIA: raggruppa box con stesso 'family' in un'unica card
    // (retrocompatibile: box senza 'family' resta autonomo)
    // ============================================================
    const groups = this._groupBoxesByFamily(sec.boxes);
    const boxesHtml = groups.map(g => {
      if (g.kind === 'family') return this._familyBoxHtml(g.family, g.variants);
      return this._boxHtml(g.box);
    }).join('');
    return `
      <div class="cfg-section ${sec.required ? 'cfg-section--required' : ''} ${sec.requiresBox ? 'cfg-section--locked-area' : ''}">
        <div class="cfg-section__header">
          <div class="cfg-section__icon">${sec.icon}</div>
          <div class="cfg-section__name">${sec.name}</div>
          ${sec.required ? `<div class="cfg-section__badge">Richiesto</div>` : ''}
          ${sec.requiresBox && !sec.hideRequiresBadge ? `<div class="cfg-section__badge cfg-section__badge--lock">Prerequisito</div>` : ''}
        </div>
        ${hint ? `<div class="cfg-section__hint">${hint}</div>` : ''}
        <div class="cfg-boxes">
          ${boxesHtml}
        </div>
      </div>
    `;
  },

  /** Raggruppa i box per chiave 'family'. Ritorna lista di gruppi:
   *  { kind: 'single', box }                 per box senza family
   *  { kind: 'family', family, variants }    per famiglie con N varianti
   */
  _groupBoxesByFamily(boxes) {
    const map = new Map(); // family-id -> { family, variants }
    const result = [];
    for (const box of boxes) {
      if (box.family) {
        if (!map.has(box.family)) {
          const fam = {
            kind: 'family',
            family: {
              id: box.family,
              label: box.familyLabel || box.label.replace(/\s*[×x]\s*\d+/i, '').trim(),
              icon: box.familyIcon || box.icon || '',
              period: box.period,
              desc: box.familyDesc || '',
            },
            variants: [],
          };
          map.set(box.family, fam);
          result.push(fam);
        }
        map.get(box.family).variants.push(box);
      } else {
        result.push({ kind: 'single', box });
      }
    }
    return result;
  },

  _familyBoxHtml(family, variants) {
    // Calcola range prezzi (min - max)
    const prices = variants.map(v => v.price).filter(p => p !== null && p !== undefined);
    let priceLabel;
    if (prices.length === 0) {
      priceLabel = `<span class="cfg-box__price-placeholder">€?</span>`;
    } else {
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      priceLabel = min === max ? `€${min}` : `€${min}–${max}`;
    }
    const periodIcon = family.period === 'monthly'
      ? `<span class="cfg-box__period-badge cfg-box__period-badge--monthly" title="Canone mensile">M</span>`
      : `<span class="cfg-box__period-badge cfg-box__period-badge--oneoff" title="Una tantum">·</span>`;
    const familyBadge = `<span class="cfg-box__family-badge" title="${variants.length} varianti disponibili">${variants.length} OPZIONI</span>`;

    return `
      <div class="cfg-box cfg-box--family" data-family-id="${family.id}">
        <div class="cfg-box__top">
          ${periodIcon}
          ${familyBadge}
        </div>
        <div class="cfg-box__label">${family.label}</div>
        ${family.desc ? `<div class="cfg-box__desc">${family.desc}</div>` : ''}
        <div class="cfg-box__price">
          ${priceLabel}
          <small>${family.period === 'monthly' ? '/mese' : 'una tantum'} · scegli al click</small>
        </div>
      </div>`;
  },

  /** Apre un piccolo overlay per scegliere la variante di una famiglia */
  _openFamilyPicker(familyId) {
    // Trovo la famiglia nelle aree
    let foundVariants = null;
    let foundFamily = null;
    for (const area of ConfiguratorData.areas) {
      for (const sec of area.sections) {
        const variants = sec.boxes.filter(b => b.family === familyId);
        if (variants.length > 0) {
          foundVariants = variants;
          foundFamily = {
            id: familyId,
            label: variants[0].familyLabel || variants[0].label.replace(/\s*[×x]\s*\d+/i, '').trim(),
          };
          break;
        }
      }
      if (foundVariants) break;
    }
    if (!foundVariants) return;

    // Crea overlay
    const overlay = document.createElement('div');
    overlay.className = 'cfg-family-picker';
    const op = window.Roles && Roles.isOperator();
    overlay.innerHTML = `
      <div class="cfg-family-picker__backdrop"></div>
      <div class="cfg-family-picker__modal">
        <div class="cfg-family-picker__header">
          <div>
            <div class="cfg-family-picker__title">${foundFamily.label}</div>
            <div class="cfg-family-picker__sub">Scegli la variante da aggiungere</div>
          </div>
          <button class="cfg-family-picker__close" aria-label="Chiudi">×</button>
        </div>
        <div class="cfg-family-picker__list">
          ${foundVariants.map(v => `
            <button class="cfg-variant" data-variant-id="${v.id}">
              <div class="cfg-variant__label">${v.variantLabel || v.label}</div>
              ${v.desc ? `<div class="cfg-variant__desc">${v.desc}</div>` : ''}
              ${op ? '' : `<div class="cfg-variant__price">${v.price != null ? '€' + v.price : '<em>€?</em>'}<small>${v.period === 'monthly' ? '/mese' : ''}</small></div>`}
            </button>
          `).join('')}
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('.cfg-family-picker__backdrop').addEventListener('click', close);
    overlay.querySelector('.cfg-family-picker__close').addEventListener('click', close);
    overlay.querySelectorAll('.cfg-variant').forEach(btn => {
      btn.addEventListener('click', () => {
        const vid = btn.dataset.variantId;
        Configurator.addBox(vid);
        close();
        this._renderCanvas();
        this._refreshAddedState();
        this._refreshLocks();
      });
    });
  },

  _boxHtml(box) {
    let displayPrice;
    if (box.isBundle && box.includes) {
      displayPrice = box.includes.reduce((s, i) => s + (i.price || 0), 0);
    } else {
      displayPrice = box.price;
    }
    const priceLabel = displayPrice !== null && displayPrice !== undefined
      ? `€${displayPrice}`
      : `<span class="cfg-box__price-placeholder">€?</span>`;

    const periodIcon = box.period === 'monthly'
      ? `<span class="cfg-box__period-badge cfg-box__period-badge--monthly" title="Canone mensile">M</span>`
      : `<span class="cfg-box__period-badge cfg-box__period-badge--oneoff" title="Una tantum">·</span>`;
    const bundleIcon = box.isBundle ? `<span class="cfg-box__bundle-badge" title="Bundle preconfigurato">BUNDLE</span>` : '';

    // Verifica se la box e disponibile (per requiresBox)
    const fullBox = ConfiguratorData.findBox(box.id);
    const isLocked = fullBox ? !Configurator.canAddBox(box.id) : false;

    return `
      <div class="cfg-box ${box.isBundle ? 'cfg-box--bundle' : ''} ${isLocked ? 'is-locked' : ''}" data-box-id="${box.id}" ${isLocked ? 'title="Aggiungi prima il prerequisito"' : ''}>
        <div class="cfg-box__top">
          ${periodIcon}
          ${bundleIcon}
          ${isLocked ? '<span class="cfg-box__lock" title="Bloccato">🔒</span>' : ''}
        </div>
        <div class="cfg-box__label">${box.label}</div>
        ${box.desc ? `<div class="cfg-box__desc">${box.desc}</div>` : ''}
        <div class="cfg-box__price">
          ${priceLabel}
          <small>${box.period === 'monthly' ? '/mese' : 'una tantum'}${box.note ? ' · ' + box.note : ''}</small>
        </div>
      </div>`;
  },

  _renderCanvas() {
    const items = Configurator.composition;
    const countEl = document.getElementById('cfgCount');
    if (countEl) countEl.textContent = items.length + (items.length === 1 ? ' voce' : ' voci');

    const itemsBox = document.getElementById('cfgItems');
    if (items.length === 0) {
      itemsBox.innerHTML = `
        <div class="cfg-canvas__empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="4" y="4" width="6" height="6" rx="1"/>
            <rect x="14" y="4" width="6" height="6" rx="1"/>
            <rect x="4" y="14" width="6" height="6" rx="1"/>
            <rect x="14" y="14" width="6" height="6" rx="1"/>
          </svg>
          <p>Trascina o clicca le box dalla tavolozza per comporre il preventivo</p>
        </div>`;
    } else {
      const state = Configurator.state();
      itemsBox.innerHTML = items.map((c, idx) => {
        const item = state.items[idx];
        if (!item) return '';
        const periodLabel = item.period === 'monthly' ? 'mensile' : 'una tantum';
        return `
          <div class="cfg-item ${item.isBundle ? 'cfg-item--bundle' : ''}">
            <div class="cfg-item__main">
              <div class="cfg-item__info">
                <div class="cfg-item__name">
                  ${item.label}${c.instances > 1 ? ' × ' + c.instances : ''}
                  <span class="cfg-item__tag cfg-item__tag--${item.period}">${periodLabel}</span>
                  ${item.isBundle ? '<span class="cfg-item__tag cfg-item__tag--bundle">bundle</span>' : ''}
                </div>
                <div class="cfg-item__meta">${item.sectionName} · €${item.subtotal}</div>
              </div>
              <div class="cfg-item__qty">
                <button onclick="ConfigView._dec('${c.boxId}')">−</button>
                <span>${c.instances}</span>
                <button onclick="ConfigView._inc('${c.boxId}')">+</button>
              </div>
              <button class="cfg-item__remove" onclick="ConfigView._rm('${c.boxId}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            ${item.isBundle && item.includes ? this._bundleIncludesHtml(c, item) : ''}
          </div>`;
      }).join('');
    }
    this._renderTotals();
  },

  _bundleIncludesHtml(compositionItem, bundleData) {
    return `
      <div class="cfg-item__includes">
        <div class="cfg-item__includes-label">Voci incluse</div>
        ${bundleData.includes.map(inc => {
          const swapId = compositionItem.swaps && compositionItem.swaps[inc.id];
          const swapOptions = inc.swappable ? ConfiguratorData.getSwapOptions(inc.group) : [];
          let displayed = inc;
          if (swapId) {
            const swapped = swapOptions.find(s => s.id === swapId);
            if (swapped) displayed = swapped;
          }
          return `
            <div class="cfg-include">
              <div class="cfg-include__name">${displayed.label}${displayed.note ? ' <small>(' + displayed.note + ')</small>' : ''}</div>
              <div class="cfg-include__price">€${displayed.price || 0}</div>
              ${inc.swappable && swapOptions.length > 1 ? `
                <select class="cfg-include__swap" onchange="ConfigView._onSwap('${compositionItem.boxId}', '${inc.id}', this.value)">
                  ${swapOptions.map(opt => `<option value="${opt.id}" ${(swapId || inc.id) === opt.id ? 'selected' : ''}>${opt.label} (€${opt.price})</option>`).join('')}
                </select>
              ` : ''}
            </div>`;
        }).join('')}
      </div>`;
  },

  _renderTotals() {
    const s = Configurator.state();
    const v = Configurator.validate();
    const box = document.getElementById('cfgTotals');
    if (!box) return;
    const isMenu = Configurator.currentArea === 'menu';
    const validationBlock = !v.valid
      ? `<div class="cfg-validation">
           <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
           <div><b>Composizione incompleta</b><div>Manca: ${v.missing.map(m => m.name).join(', ')}</div></div>
         </div>`
      : '';
    const durationControl = isMenu
      ? `<div class="field" style="grid-column:span 2">
           <label>Durata bundle</label>
           <div class="cfg-radio-group">
             <label class="cfg-radio"><input type="radio" name="cfgBilling" value="semestral" ${Configurator.menuBillingMode === 'semestral' ? 'checked' : ''}><span>Semestrale (6 mesi)</span></label>
             <label class="cfg-radio"><input type="radio" name="cfgBilling" value="annual" ${Configurator.menuBillingMode === 'annual' ? 'checked' : ''}><span>Annuale (12 mesi)</span></label>
           </div>
         </div>`
      : `<div class="field"><label>Mesi durata</label><input type="number" class="input" id="cfgMonths" min="1" max="24" step="1" value="${Configurator.months}"></div>`;
    let rows = '';
    if (s.monthly > 0) rows += `<div class="cfg-totals__row"><span>Canone mensile</span><b>€${s.monthly.toFixed(0)}/mese</b></div>`;
    if (s.oneoff > 0)  rows += `<div class="cfg-totals__row"><span>Una tantum</span><b>€${s.oneoff.toFixed(0)}</b></div>`;
    if (s.discount > 0) rows += `<div class="cfg-totals__row" style="color:var(--ad-pink)"><span>Sconto ${Configurator.discountPct}%</span><b>-€${s.discount.toFixed(0)}</b></div>`;
    box.innerHTML = `
      ${validationBlock}
      <div class="cfg-controls">
        ${durationControl}
        <div class="field"><label>Sconto %</label><input type="number" class="input" id="cfgDiscount" min="0" max="100" step="0.5" value="${Configurator.discountPct}"></div>
      </div>
      ${rows}
      <div class="cfg-totals__main"><span style="font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--ad-mute);font-weight:700">Totale netto</span><b>€${s.net.toFixed(0)}</b></div>
      <div class="cfg-actions">
        <button class="btn btn--magenta btn--lg cfg-cta" id="cfgCreateBtn" ${!v.valid ? 'disabled' : ''}>
          ${window.Roles && Roles.isOperator() ? 'Invia per approvazione' : 'Crea preventivo'}
        </button>
        <button class="btn btn--ghost btn--sm" onclick="ConfigView._reset()">Azzera composizione</button>
      </div>`;
    const m = document.getElementById('cfgMonths');
    const d = document.getElementById('cfgDiscount');
    if (m) m.addEventListener('input', (e) => { Configurator.months = parseInt(e.target.value) || 1; this._renderTotals(); });
    if (d) d.addEventListener('input', (e) => { Configurator.discountPct = parseFloat(e.target.value) || 0; this._renderTotals(); });
    document.querySelectorAll('input[name="cfgBilling"]').forEach(r => {
      r.addEventListener('change', (e) => { Configurator.menuBillingMode = e.target.value; this._renderTotals(); });
    });
    const createBtn = document.getElementById('cfgCreateBtn');
    if (createBtn) createBtn.addEventListener('click', () => this._toQuote());
  },

  _renderCanvas() {
    const items = Configurator.composition;
    const countEl = document.getElementById('cfgCount');
    if (countEl) countEl.textContent = items.length + (items.length === 1 ? ' voce' : ' voci');
    const itemsBox = document.getElementById('cfgItems');
    if (itemsBox) {
      if (items.length === 0) {
        itemsBox.innerHTML = `<div class="cfg-canvas__empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></svg><h3>Nessuna voce</h3><p>Aggiungi una card dalla palette per iniziare.</p></div>`;
      } else {
        itemsBox.innerHTML = items.map(it => this._itemHtml(it)).join('');
      }
    }
    this._renderTotals();
    this._refreshLocks();
    this._refreshAddedState();
  },

  _itemHtml(it) {
    const box = ConfiguratorData.findBox(it.boxId);
    if (!box) return '';
    const isBundle = box.isBundle && box.includes;
    const isOperator = window.Roles && Roles.isOperator();
    const swaps = it.swaps || {};

    // Calcola prezzo unitario (con swap applicati per bundle)
    let unitPrice = 0;
    if (isBundle) {
      unitPrice = box.includes.reduce((sum, inc) => {
        const effectiveId = swaps[inc.id] || inc.id;
        // Se swap: prendi prezzo dalle swapOptions del gruppo
        if (swaps[inc.id] && inc.group) {
          const swapOpts = ConfiguratorData.getSwapOptions(inc.group);
          const swapped = swapOpts.find(s => s.id === effectiveId);
          return sum + (swapped ? swapped.price : (inc.price || 0));
        }
        return sum + (inc.price || 0);
      }, 0);
    } else {
      unitPrice = box.price || 0;
    }
    const lineTotal = unitPrice * it.instances;

    // Rendering includes per bundle
    let includesHtml = '';
    if (isBundle) {
      includesHtml = `<div class="cfg-item__includes">` + box.includes.map(inc => {
        const effectiveId = swaps[inc.id] || inc.id;
        let effectiveLabel = inc.label;
        let effectivePrice = inc.price || 0;
        if (inc.swappable && inc.group) {
          const swapOpts = ConfiguratorData.getSwapOptions(inc.group);
          if (swaps[inc.id]) {
            const swapped = swapOpts.find(s => s.id === effectiveId);
            if (swapped) { effectiveLabel = swapped.label; effectivePrice = swapped.price; }
          }
          // Dropdown per scegliere alternativa (solo admin)
          const swapDropdown = !isOperator ? `
            <select class="cfg-include__swap" onchange="ConfigView._onSwap('${it.boxId}', '${inc.id}', this.value)">
              ${swapOpts.map(o => `<option value="${o.id}" ${effectiveId === o.id ? 'selected' : ''}>${o.label} — €${o.price}</option>`).join('')}
            </select>` : '';
          return `
            <div class="cfg-include">
              <span class="cfg-include__bullet">↳</span>
              <span class="cfg-include__label">${effectiveLabel}</span>
              ${swapDropdown}
              <span class="cfg-include__price">€${effectivePrice}</span>
            </div>`;
        }
        return `
          <div class="cfg-include">
            <span class="cfg-include__bullet">↳</span>
            <span class="cfg-include__label">${effectiveLabel}</span>
            <span class="cfg-include__price">€${effectivePrice}</span>
          </div>`;
      }).join('') + `</div>`;
    }

    return `
      <div class="cfg-item ${isBundle ? 'cfg-item--bundle' : ''}" data-item-id="${it.boxId}">
        <div class="cfg-item__main">
          <div class="cfg-item__info">
            <div class="cfg-item__name">${box.label}${it.instances > 1 ? ` × ${it.instances}` : ''}</div>
            ${!isOperator && unitPrice > 0 ? `<div class="cfg-item__meta">€${unitPrice}${box.period === 'monthly' ? '/mese' : ' una tantum'}${it.instances > 1 ? ` · totale €${lineTotal}` : ''}</div>` : ''}
          </div>
          <div class="cfg-item__qty">
            <button onclick="ConfigView._dec('${it.boxId}')">−</button>
            <span>${it.instances}</span>
            <button onclick="ConfigView._inc('${it.boxId}')">+</button>
          </div>
          <button class="cfg-item__remove" onclick="ConfigView._rm('${it.boxId}')" title="Rimuovi">×</button>
        </div>
        ${includesHtml}
      </div>`;
  },

  _onSwap(boxId, originalId, newId) {
if (Configurator.applySwap) {
      Configurator.applySwap(boxId, originalId, newId);
    } else {
      const item = Configurator.composition.find(c => c.boxId === boxId);
      if (item) { item.swaps = item.swaps || {}; item.swaps[originalId] = newId; }
    }
    this._renderCanvas();
  },

  _refreshLocks() {
    document.querySelectorAll('#cfgPalette .cfg-box').forEach(el => {
      const id = el.dataset.boxId;
      if (!id) return;
      const locked = !Configurator.canAddBox(id);
      el.classList.toggle('is-locked', locked);
    });
  },

  _refreshAddedState() {
    const ids = new Set(Configurator.composition.map(c => c.boxId));
    document.querySelectorAll('#cfgPalette .cfg-box').forEach(el => {
      el.classList.toggle('is-added', ids.has(el.dataset.boxId));
    });
  },

  _inc(id) { Configurator.changeInstances(id, +1); this._renderCanvas(); },
  _dec(id) { Configurator.changeInstances(id, -1); this._renderCanvas(); },
  _rm(id)  { Configurator.removeBox(id); this._renderCanvas(); },

  _reset() {
    if (!confirm('Azzerare tutta la composizione?')) return;
    Configurator.reset();
    this._renderCanvas();
  },

  async _toQuote() {
    const v = Configurator.validate();
    if (!v.valid) { App._toast('Manca: ' + v.missing.map(m => m.name).join(' + '), 'error'); return; }
    if (Configurator.composition.length === 0) { App._toast('Aggiungi almeno una box prima di creare il preventivo', 'error'); return; }
    // Per il nuovo flusso preview, tutti passano prima dall'editor preventivo.
    await Configurator.toQuote();
    App._toast('Composizione trasferita al preventivo', 'success');
  },

  /** Apre il modale operator in modalità EDIT (per modificare una richiesta esistente) */
  async _editRequest(quoteId) {
    const q = await DB.get('quotes', quoteId);
    if (!q) { App._toast('Richiesta non trovata', 'error'); return; }
    if (q.status !== 'da_approvare') { App._toast('La richiesta è già in lavorazione, non modificabile', 'error'); return; }
    // Carico la richiesta nel currentQuote e apro il modale in modalità edit
    State.currentQuote = q;
    await this._openOperatorSubmitModal({ editMode: true, quote: q });
  },

  /** Modale per operatore: seleziona cliente obbligatorio + note opzionali. Supporta edit. */
  async _openOperatorSubmitModal(opts = {}) {
    const editMode = !!opts.editMode;
    const existing = opts.quote || null;
    const clients = await DB.all('clients');

    // Pre-fill da quote esistente in caso di edit
    const preClient = existing ? existing.clientId : null;
    const preTitle  = existing ? (existing.tag || '') : '';
    const preNotes  = existing ? (existing.notes || '').replace(/\n\[Op\]\s*/g, '\n').trim() : '';

    const overlay = document.createElement('div');
    overlay.className = 'cfg-family-picker';
    overlay.innerHTML = `
      <div class="cfg-family-picker__backdrop"></div>
      <div class="cfg-family-picker__modal" style="max-width:560px">
        <div class="cfg-family-picker__header">
          <div>
            <div class="cfg-family-picker__title">${editMode ? 'Modifica richiesta' : 'Invia richiesta di preventivo'}</div>
            <div class="cfg-family-picker__sub">Compila i dati. Il cliente è obbligatorio.</div>
          </div>
          <button class="cfg-family-picker__close" aria-label="Chiudi">×</button>
        </div>
        <div style="padding:4px 0 0 0;overflow-y:auto">
          <div class="field" style="margin-bottom:14px">
            <label>Cliente *</label>
            <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
              <select class="input" id="opSubClient" style="flex:1">
                <option value="">— Seleziona cliente esistente —</option>
                ${clients.map(cl => `<option value="${cl.id}" ${preClient === cl.id ? 'selected' : ''}>${cl.name}${cl.vat ? ' · P.IVA ' + cl.vat : ''}</option>`).join('')}
              </select>
              <button type="button" class="btn btn--ghost btn--sm" id="opSubToggleNew" style="white-space:nowrap">+ Nuovo</button>
            </div>
          </div>

          <div id="opSubNewClientWrap" style="display:none;background:var(--ad-cream);border:1px solid var(--ad-line);border-radius:var(--r-md);padding:14px;margin-bottom:14px">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--ad-mute);font-weight:700;margin-bottom:10px">Nuovo cliente (verrà salvato in anagrafica)</div>
            <div class="field" style="margin-bottom:10px">
              <label>Nome / Ragione sociale *</label>
              <input class="input" id="opSubNewName" placeholder="es. Mario Rossi srl">
            </div>
            <div class="field" style="margin-bottom:10px">
              <label>Persona di riferimento</label>
              <input class="input" id="opSubNewContact" placeholder="es. Mario Rossi">
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
              <div class="field">
                <label>P. IVA</label>
                <input class="input" id="opSubNewVat" maxlength="11">
              </div>
              <div class="field">
                <label>Email</label>
                <input class="input" id="opSubNewEmail" type="email">
              </div>
            </div>
          </div>

          <div class="field" style="margin-bottom:14px">
            <label>Riferimento / titolo richiesta</label>
            <input class="input" id="opSubTitle" placeholder="es. Restyling sito + manutenzione" maxlength="120" value="${preTitle.replace(/"/g,'&quot;')}">
          </div>
          <div class="field" style="margin-bottom:14px">
            <label>Note per l'admin (opzionale)</label>
            <textarea class="textarea" id="opSubNotes" rows="3" placeholder="Aggiungi dettagli utili all approvazione...">${preNotes.replace(/</g,'&lt;')}</textarea>
          </div>
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px">
            <button class="btn btn--ghost btn--sm" id="opSubCancel">Annulla</button>
            <button class="btn btn--primary" id="opSubConfirm">${editMode ? 'Salva modifiche' : "Invia all'admin"}</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('.cfg-family-picker__backdrop').addEventListener('click', close);
    overlay.querySelector('.cfg-family-picker__close').addEventListener('click', close);
    overlay.querySelector('#opSubCancel').addEventListener('click', close);

    // Toggle nuovo cliente
    const toggleBtn = overlay.querySelector('#opSubToggleNew');
    const newWrap = overlay.querySelector('#opSubNewClientWrap');
    const clientSel = overlay.querySelector('#opSubClient');
    toggleBtn.addEventListener('click', () => {
      const open = newWrap.style.display === 'none';
      newWrap.style.display = open ? 'block' : 'none';
      toggleBtn.textContent = open ? '× Annulla nuovo' : '+ Nuovo';
      if (open) { clientSel.value = ''; clientSel.disabled = true; }
      else { clientSel.disabled = false; }
    });

    overlay.querySelector('#opSubConfirm').addEventListener('click', async () => {
      const title = (overlay.querySelector('#opSubTitle').value || '').trim();
      const notes = (overlay.querySelector('#opSubNotes').value || '').trim();
      let clientId = parseInt(overlay.querySelector('#opSubClient').value);

      // Se il form "Nuovo cliente" è aperto, crea il cliente al volo
      if (newWrap.style.display === 'block') {
        const newName = (overlay.querySelector('#opSubNewName').value || '').trim();
        if (!newName) { App._toast('Inserisci almeno Nome / Ragione sociale del nuovo cliente', 'error'); return; }
        const newClient = {
          name:    newName,
          contact: (overlay.querySelector('#opSubNewContact').value || '').trim(),
          vat:     (overlay.querySelector('#opSubNewVat').value || '').trim(),
          email:   (overlay.querySelector('#opSubNewEmail').value || '').trim(),
          createdBy: State.currentUser ? State.currentUser.username : null,
          createdAt: new Date().toISOString(),
          fromOperator: true,
        };
        clientId = await DB.put('clients', newClient);
        App._toast('Nuovo cliente salvato in anagrafica', 'success');
      }

      if (!clientId) { App._toast('Seleziona un cliente o inseriscine uno nuovo', 'error'); return; }

      // EDIT mode: aggiorna il preventivo esistente
      if (editMode && existing) {
        existing.clientId = clientId;
        if (title) existing.tag = title;
        existing.notes = notes ? '[Op] ' + notes : '';
        existing.requestedAt = new Date().toISOString();
        await DB.put('quotes', existing);
        close();
        App._toast('Richiesta aggiornata', 'success');
        await Views.renderRequests();
        await App._updateRequestsBadge();
        return;
      }

      // NEW mode: crea da composizione corrente
      Configurator._toQuoteLegacy();
      State.currentQuote.clientId = clientId;
      if (title) State.currentQuote.tag = title;
      State.currentQuote.notes = notes ? '[Op] ' + notes : '';
      State.currentQuote.status = 'da_approvare';
      State.currentQuote.requestedBy = State.currentUser ? State.currentUser.username : null;
      State.currentQuote.requestedAt = new Date().toISOString();
      await State.saveQuote();
      close();
      App._toast("Richiesta inviata all'admin", 'success');
      Configurator.reset();
      this._renderCanvas();
      await App._updateRequestsBadge();
      App.navigate('requests');
    });
  },

  _refreshLocks() {
    document.querySelectorAll('#cfgPalette .cfg-box').forEach(el => {
      const id = el.dataset.boxId;
      if (!id) return;
      const locked = !Configurator.canAddBox(id);
      el.classList.toggle('is-locked', locked);
    });
  },

  _refreshAddedState() {
    const ids = new Set(Configurator.composition.map(c => c.boxId));
    document.querySelectorAll('#cfgPalette .cfg-box').forEach(el => {
      el.classList.toggle('is-added', ids.has(el.dataset.boxId));
    });
  },

  _inc(id) { Configurator.changeInstances(id, +1); this._renderCanvas(); },
  _dec(id) { Configurator.changeInstances(id, -1); this._renderCanvas(); },
  _rm(id)  { Configurator.removeBox(id); this._renderCanvas(); },
  _reset() {
    if (!confirm('Azzerare tutta la composizione?')) return;
    Configurator.reset(); this._renderCanvas();
  },

_setupDropZone() {
    const canvas = document.getElementById('cfgCanvas');
    if (!canvas || canvas._dropBound) return;
    canvas._dropBound = true;
    canvas.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; canvas.classList.add('is-drag-over'); });
    canvas.addEventListener('dragleave', () => canvas.classList.remove('is-drag-over'));
    canvas.addEventListener('drop', (e) => {
      e.preventDefault();
      canvas.classList.remove('is-drag-over');
      const boxId = e.dataTransfer.getData('text/box-id');
      if (boxId) { Configurator.addBox(boxId); this._renderCanvas(); }
    });
  },
};

window.ConfigView = ConfigView;
