/* ============================================================
   ORACLE.JS — Motore di ricerca interno su dati FiC + locali
   Riconoscimento intent via keyword italiani sul backend, qui
   solo UI: search box + FAQ + render dei risultati.
   ============================================================ */

const Oracle = {

  /** Domande frequenti suggerite nella schermata di apertura. */
  SUGGESTIONS: [
    { q: 'Valore medio dei servizi venduti',                   icon: '€', tag: 'Andamento' },
    { q: 'Prodotto più venduto',                                icon: '★', tag: 'Top voci' },
    { q: 'Fatture non saldate 2026',                            icon: '!', tag: 'Da incassare' },
    { q: 'Situazione cliente Bar Centrale',                     icon: '◉', tag: 'Cliente' },
    { q: 'Fatture Cold Company',                                icon: '€', tag: 'Per cliente' },
    { q: 'Pagamenti in arrivo sul conto',                       icon: '↓', tag: 'Conto' },
  ],

  _lastQuery: '',
  _busy: false,

  async render() {
    const root = document.getElementById('view-oracle');
    if (!root) return;
    // Resetta sempre alla home se non c'è ultima query
    this._renderHome();
  },

  _renderHome() {
    const root = document.getElementById('oracleBody');
    if (!root) return;
    const lastTxt = (this._lastQuery || '').replace(/"/g, '&quot;');
    root.innerHTML = `
      <div class="oracle-hero">
        <div class="oracle-mark" aria-hidden="true">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="9"/>
            <path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M5.6 18.4 18.4 5.6"/>
          </svg>
        </div>
        <h2>L'Oracolo</h2>
        <p>Chiedi qualunque cosa sui tuoi dati. Cerca per cliente, prodotto, periodo, stato.</p>
        <form class="oracle-search" id="oracleSearchForm">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" id="oracleInput" placeholder="Chiedi all'Oracolo…" autocomplete="off" spellcheck="false" value="${lastTxt}">
          <button class="oracle-btn" type="submit">Cerca</button>
        </form>
      </div>

      <div class="oracle-suggestions">
        <div class="oracle-suggestions__label">Domande frequenti</div>
        <div class="oracle-suggestions__list" id="oracleSuggestList">
          ${this.SUGGESTIONS.map((s, i) => `
            <button class="oracle-chip" data-q="${s.q.replace(/"/g,'&quot;')}" style="--i:${i}">
              <span class="oracle-chip__icon">${s.icon}</span>
              <span class="oracle-chip__q">${s.q}</span>
              <span class="oracle-chip__tag">${s.tag}</span>
            </button>
          `).join('')}
        </div>
      </div>

      <div id="oracleResult" class="oracle-result"></div>
    `;

    // Bind form
    const form = document.getElementById('oracleSearchForm');
    if (form) form.addEventListener('submit', (e) => { e.preventDefault(); this._submit(); });
    // Bind chip click
    document.querySelectorAll('#oracleSuggestList [data-q]').forEach(b => {
      b.addEventListener('click', () => {
        const input = document.getElementById('oracleInput');
        if (input) input.value = b.dataset.q;
        this._submit();
      });
    });

    // Auto focus
    setTimeout(() => {
      const input = document.getElementById('oracleInput');
      if (input) input.focus();
    }, 60);
  },

  async _submit() {
    if (this._busy) return;
    const input = document.getElementById('oracleInput');
    const out = document.getElementById('oracleResult');
    const query = (input && input.value || '').trim();
    if (!query) return;
    this._lastQuery = query;
    this._busy = true;
    out.innerHTML = `<div class="oracle-loading"><div class="oracle-spinner"></div><span>L'Oracolo sta consultando i registri…</span></div>`;

    try {
      if (!window.Sync || !Sync.enabled() || !Sync._loadToken()) {
        throw new Error('Backend non disponibile (rilogga per favore)');
      }
      const data = await Sync._api('POST', '/oracle/answer', { query });
      out.innerHTML = this._renderResult(data, query);
    } catch (e) {
      out.innerHTML = `<div class="oracle-error">⚠️ ${(e.message || e).toString().replace(/[<>]/g,'')}</div>`;
    } finally {
      this._busy = false;
    }
  },

  // ===========================================================
  // Render dei diversi intent
  // ===========================================================
  _renderResult(data, query) {
    const fmt = n => '€ ' + (Number(n) || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtDate = d => d ? new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
    const safe = s => String(s || '').replace(/[<>]/g, '');

    const header = (icon, title, sub) => `
      <header class="oracle-answer__head">
        <div class="oracle-answer__icon">${icon}</div>
        <div>
          <h3>${title}</h3>
          ${sub ? `<p>${sub}</p>` : ''}
        </div>
      </header>`;

    if (data.intent === 'empty') return '';
    if (data.intent === 'unknown') {
      return `
        <div class="oracle-answer">
          ${header('?', 'Non ho capito la domanda', 'Prova una di queste:')}
          <ul class="oracle-hints">
            <li>Fatture non saldate 2026</li>
            <li>Prodotto più venduto</li>
            <li>Situazione cliente Bar Centrale</li>
            <li>Valore medio servizi venduti</li>
          </ul>
        </div>`;
    }

    if (data.intent === 'avg_sold') {
      if (data.permissionMissing) {
        return `<div class="oracle-answer">${header('🔑', 'Permesso FiC mancante', safe(data.howto))}</div>`;
      }
      if (data.error) return `<div class="oracle-answer">${header('!', 'Errore', safe(data.error))}</div>`;
      const c = data.count || 0;
      const yr = data.year || new Date().getFullYear();
      return `
        <div class="oracle-answer">
          ${header('€', `Valore medio dei servizi venduti — ${yr}`, `Calcolato sulle <b>${c}</b> fatture emesse del ${yr} su Fatture in Cloud`)}
          <div class="oracle-metrics">
            <div class="oracle-metric">
              <div class="oracle-metric__label">Ticket medio (netto)</div>
              <div class="oracle-metric__value">${fmt(data.avgNet)}</div>
              <div class="oracle-metric__sub">media per fattura, IVA esclusa</div>
            </div>
            <div class="oracle-metric">
              <div class="oracle-metric__label">Ticket medio (lordo)</div>
              <div class="oracle-metric__value">${fmt(data.avgGross)}</div>
              <div class="oracle-metric__sub">media per fattura, IVA inclusa</div>
            </div>
            <div class="oracle-metric">
              <div class="oracle-metric__label">Fatturato ${yr} (netto)</div>
              <div class="oracle-metric__value">${fmt(data.totalNet)}</div>
              <div class="oracle-metric__sub">somma fatture emesse, imponibile</div>
            </div>
            <div class="oracle-metric">
              <div class="oracle-metric__label">Fatturato ${yr} (lordo)</div>
              <div class="oracle-metric__value">${fmt(data.totalGross)}</div>
              <div class="oracle-metric__sub">somma fatture emesse, totale</div>
            </div>
          </div>
        </div>`;
    }

    if (data.intent === 'top_product') {
      if (!data.items || !data.items.length) return this._noData('Nessun prodotto venduto nei preventivi.');
      const max = data.items[0].revenue || 1;
      return `
        <div class="oracle-answer">
          ${header('★', 'Top 10 prodotti per fatturato', 'Aggregato da tutte le righe preventivo')}
          <div class="oracle-ranking">
            ${data.items.map((it, i) => `
              <div class="oracle-rank-row">
                <div class="oracle-rank-num">${i + 1}</div>
                <div class="oracle-rank-name">${safe(it.name)}</div>
                <div class="oracle-rank-bar"><div class="oracle-rank-fill" style="width:${Math.round(it.revenue / max * 100)}%"></div></div>
                <div class="oracle-rank-revenue">${fmt(it.revenue)}</div>
                <div class="oracle-rank-count">${it.count}× · ${Math.round(it.qty)} unità</div>
              </div>
            `).join('')}
          </div>
        </div>`;
    }

    if (data.intent === 'client_status') {
      if (!data.found) {
        const permHint = data.ficPermissionMissing
          ? '<br><small style="opacity:.85">Nota: il token FiC non ha permesso di lettura clienti. Attiva <code>entities.clients:r</code> nel PAT su Fatture in Cloud.</small>'
          : '';
        return `
          <div class="oracle-answer">
            ${header('◉', 'Cliente non trovato', `Nessun match per "${safe(data.suggestion || query)}". Prova con un nome più preciso o un frammento più lungo.${permHint}`)}
          </div>`;
      }
      return `
        <div class="oracle-answer">
          ${header('◉', `Situazione cliente`, `${data.found} cliente${data.found === 1 ? '' : 'i'} trovato${data.found === 1 ? '' : 'i'}`)}
          ${data.results.map(r => `
            <div class="oracle-client-card">
              <div class="oracle-client-card__head">
                <h4>${safe(r.name)}${r._fromFic ? ' <span class="oracle-source-pill">da Fatture in Cloud</span>' : ''}</h4>
                <div class="oracle-client-card__meta">${r.vat ? 'P.IVA ' + safe(r.vat) + ' · ' : ''}${safe(r.city)}</div>
              </div>
              <div class="oracle-metrics">
                <div class="oracle-metric">
                  <div class="oracle-metric__label">Preventivi totali</div>
                  <div class="oracle-metric__value">${r.quotesCount}</div>
                </div>
                <div class="oracle-metric">
                  <div class="oracle-metric__label">Fatturato preventivi</div>
                  <div class="oracle-metric__value">${fmt(r.totalNet)}</div>
                </div>
                <div class="oracle-metric">
                  <div class="oracle-metric__label">Canone mensile</div>
                  <div class="oracle-metric__value">${r.totalMonthly > 0 ? fmt(r.totalMonthly) : '—'}</div>
                </div>
                <div class="oracle-metric">
                  <div class="oracle-metric__label">Ultima firma</div>
                  <div class="oracle-metric__value">${fmtDate(r.lastSigned)}</div>
                </div>
              </div>
              ${Object.keys(r.byStage).length ? `
                <div class="oracle-stage-breakdown">
                  ${Object.entries(r.byStage).map(([s, n]) => `<span class="oracle-stage-chip"><b>${n}</b> ${safe(s)}</span>`).join('')}
                </div>
              ` : ''}
              ${this._renderInvoicesBlock(r, fmt, fmtDate, safe)}
              <div class="oracle-contacts">
                ${r.contact ? `<span>👤 ${safe(r.contact)}</span>` : ''}
                ${r.email   ? `<span>✉️ <a href="mailto:${r.email}">${safe(r.email)}</a></span>` : ''}
                ${r.phone   ? `<span>☎ <a href="tel:${r.phone}">${safe(r.phone)}</a></span>` : ''}
              </div>
            </div>
          `).join('')}
        </div>`;
    }

    if (data.intent === 'client_invoices') {
      if (data.permissionMissing) {
        return `
          <div class="oracle-answer">
            ${header('🔑', 'Permesso FiC mancante', 'Attiva "Documenti emessi - Lettura" nel PAT di Fatture in Cloud, poi riprova.')}
          </div>`;
      }
      if (!data.found) {
        const permHint = data.ficPermissionMissing
          ? '<br><small style="opacity:.85">Nota: il token FiC non ha permesso di lettura clienti.</small>'
          : '';
        return `
          <div class="oracle-answer">
            ${header('€', 'Cliente non trovato per le fatture', `Nessun match per "${safe(data.suggestion || query)}". Prova un nome più preciso.${permHint}`)}
          </div>`;
      }
      const yr = data.year ? ` ${data.year}` : '';
      return `
        <div class="oracle-answer">
          ${header('€', `Fatture per cliente${yr}`, `${data.found} match${data.found === 1 ? '' : 'es'} su Fatture in Cloud`)}
          ${data.results.map(r => `
            <div class="oracle-client-card">
              <div class="oracle-client-card__head">
                <h4>${safe(r.name)} <span class="oracle-source-pill">da Fatture in Cloud</span></h4>
              </div>
              <div class="oracle-metrics">
                <div class="oracle-metric">
                  <div class="oracle-metric__label">Fatture totali</div>
                  <div class="oracle-metric__value">${r.invoicesCount}</div>
                </div>
                <div class="oracle-metric">
                  <div class="oracle-metric__label">Fatturato (lordo)</div>
                  <div class="oracle-metric__value">${fmt(r.totalGross)}</div>
                </div>
                <div class="oracle-metric">
                  <div class="oracle-metric__label">Aperte</div>
                  <div class="oracle-metric__value">${r.unpaidCount}${r.overdueCount ? ` <small style="color:#c0392b">(${r.overdueCount} scadute)</small>` : ''}</div>
                </div>
                <div class="oracle-metric">
                  <div class="oracle-metric__label">Da incassare</div>
                  <div class="oracle-metric__value">${fmt(r.totalDue)}</div>
                </div>
              </div>
              ${r.unpaid && r.unpaid.length ? `
                <div class="oracle-table-wrap">
                  <table class="oracle-table">
                    <thead><tr><th>Num</th><th>Data</th><th>Scadenza</th><th class="num">Totale</th><th class="num">Da pagare</th></tr></thead>
                    <tbody>
                      ${r.unpaid.map(i => `
                        <tr${i.overdue ? ' style="color:#c0392b"' : ''}>
                          <td>${i.number || '—'}</td>
                          <td>${fmtDate(i.date)}</td>
                          <td>${i.due_date ? fmtDate(i.due_date) : '—'}${i.overdue ? ' ⚠' : ''}</td>
                          <td class="num">${fmt(i.amount_gross)}</td>
                          <td class="num oracle-table__due">${fmt(i.amount_due)}</td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>
              ` : '<p class="oracle-empty">Nessuna fattura aperta per questo cliente.</p>'}
            </div>
          `).join('')}
        </div>`;
    }

    if (data.intent === 'unpaid_invoices') {
      if (data.permissionMissing) {
        return `
          <div class="oracle-answer">
            ${header('🔑', 'Permesso Fatture in Cloud mancante', 'Il token API non può leggere le fatture, solo i preventivi.')}
            <div class="oracle-permission-hint">
              <p><b>Come risolvere in 5 minuti:</b></p>
              <ol style="padding-left:20px;line-height:1.8">
                <li>Apri <a href="https://secure.fattureincloud.it/" target="_blank" rel="noopener">secure.fattureincloud.it</a></li>
                <li>Vai in <b>Impostazioni → Account → API Sviluppatori → Personal Access Token</b></li>
                <li>Trova il token usato dal preventivatore → <b>Modifica</b> (o Rigenera se non modificabile)</li>
                <li>Attiva il permesso <code>${safe(data.scope || 'issued_documents.invoices:r')}</code> ("Documenti emessi - Lettura")</li>
                <li>Salva. Se hai rigenerato il token, dallo a Luigi che lo aggiorna in <code>server/.env</code></li>
              </ol>
            </div>
          </div>`;
      }
      if (data.error) return `<div class="oracle-answer">${header('!', 'Errore', safe(data.error))}</div>`;
      const items = data.items || [];
      const yearLbl = data.year ? `del ${data.year}` : 'di tutti i periodi';
      return `
        <div class="oracle-answer">
          ${header('!', `Fatture non saldate ${yearLbl}`, `<b>${items.length}</b> fatture aperte · <b>${fmt(data.totalDue)}</b> ancora da incassare`)}
          ${items.length ? `
            <div class="oracle-table-wrap">
              <table class="oracle-table">
                <thead><tr><th>Num</th><th>Data</th><th>Scadenza</th><th>Cliente</th><th class="num">Totale</th><th class="num">Da pagare</th></tr></thead>
                <tbody>
                  ${items.map(i => `
                    <tr>
                      <td>${i.number || '—'}</td>
                      <td>${fmtDate(i.date)}</td>
                      <td>${i.due_date ? fmtDate(i.due_date) : '—'}</td>
                      <td>${safe(i.entity)}</td>
                      <td class="num">${fmt(i.amount_gross)}</td>
                      <td class="num oracle-table__due">${fmt(i.amount_due)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
            <div class="oracle-cross-check">
              <b>Check incrociato col conto:</b> chiedimi <em>"Pagamenti in arrivo sul conto"</em> per verificare se qualcuna è già stata pagata sul cashbook FiC ma non riconciliata.
            </div>
          ` : '<p class="oracle-empty">Nessuna fattura non saldata trovata.</p>'}
        </div>`;
    }

    if (data.intent === 'incoming_payments') {
      if (data.error) {
        return `
          <div class="oracle-answer">
            ${header('↓', 'Pagamenti in arrivo', 'Cross-check non ancora disponibile')}
            <div class="oracle-empty">
              ${safe(data.error)}<br>
              ${data.hint ? `<small style="opacity:.8">${safe(data.hint)}</small>` : ''}
            </div>
          </div>`;
      }
      const items = data.items || [];
      return `
        <div class="oracle-answer">
          ${header('↓', 'Movimenti in entrata (ultimi 30gg)', `<b>${items.length}</b> entrate · <b>${fmt(data.totalIn)}</b> incassati`)}
          ${items.length ? `
            <div class="oracle-table-wrap">
              <table class="oracle-table">
                <thead><tr><th>Data</th><th>Descrizione</th><th class="num">Importo</th></tr></thead>
                <tbody>
                  ${items.map(i => `
                    <tr>
                      <td>${fmtDate(i.date)}</td>
                      <td>${safe(i.description || i.notes)}</td>
                      <td class="num">${fmt(i.amount_in || i.amount)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : '<p class="oracle-empty">Nessun movimento in entrata.</p>'}
        </div>`;
    }

    return this._noData('Risposta non gestita.');
  },

  _noData(msg) {
    return `<div class="oracle-answer"><div class="oracle-empty">${msg}</div></div>`;
  },

  // Blocco "Fatture FiC" mostrato dentro la card client_status quando
  // il backend ha potuto arricchire i dati col cliente collegato a Fatture in Cloud.
  _renderInvoicesBlock(r, fmt, fmtDate, safe) {
    const inv = r.invoices;
    if (!inv) {
      // Cliente locale senza ficId: non possiamo leggere fatture
      if (!r.ficId) return '';
      return `<div class="oracle-invoices-block oracle-empty">Fatture FiC non disponibili.</div>`;
    }
    if (inv.permissionMissing) {
      return `<div class="oracle-invoices-block oracle-empty">🔑 Permesso lettura fatture FiC mancante (<code>${safe(inv.scope || 'issued_documents.invoices:r')}</code>).</div>`;
    }
    if (inv.error) {
      return `<div class="oracle-invoices-block oracle-empty">Errore lettura fatture FiC: ${safe(inv.error)}</div>`;
    }
    if (!inv.invoicesCount) {
      return `<div class="oracle-invoices-block oracle-empty">Nessuna fattura emessa per questo cliente su FiC.</div>`;
    }
    const overdueHtml = inv.overdueCount
      ? ` <small style="color:#c0392b">(${inv.overdueCount} ${inv.overdueCount === 1 ? 'scaduta' : 'scadute'})</small>`
      : '';
    return `
      <div class="oracle-invoices-block">
        <div class="oracle-invoices-block__title">Fatture su Fatture in Cloud</div>
        <div class="oracle-metrics">
          <div class="oracle-metric">
            <div class="oracle-metric__label">Fatture emesse</div>
            <div class="oracle-metric__value">${inv.invoicesCount}</div>
          </div>
          <div class="oracle-metric">
            <div class="oracle-metric__label">Fatturato (lordo)</div>
            <div class="oracle-metric__value">${fmt(inv.totalGross)}</div>
          </div>
          <div class="oracle-metric">
            <div class="oracle-metric__label">Aperte</div>
            <div class="oracle-metric__value">${inv.unpaidCount}${overdueHtml}</div>
          </div>
          <div class="oracle-metric">
            <div class="oracle-metric__label">Da incassare</div>
            <div class="oracle-metric__value">${fmt(inv.totalDue)}</div>
          </div>
        </div>
        ${inv.unpaid && inv.unpaid.length ? `
          <div class="oracle-table-wrap">
            <table class="oracle-table">
              <thead><tr><th>Num</th><th>Data</th><th>Scadenza</th><th class="num">Totale</th><th class="num">Da pagare</th></tr></thead>
              <tbody>
                ${inv.unpaid.map(i => `
                  <tr${i.overdue ? ' style="color:#c0392b"' : ''}>
                    <td>${i.number || '—'}</td>
                    <td>${fmtDate(i.date)}</td>
                    <td>${i.due_date ? fmtDate(i.due_date) : '—'}${i.overdue ? ' ⚠' : ''}</td>
                    <td class="num">${fmt(i.amount_gross)}</td>
                    <td class="num oracle-table__due">${fmt(i.amount_due)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : ''}
      </div>`;
  },
};

window.Oracle = Oracle;
