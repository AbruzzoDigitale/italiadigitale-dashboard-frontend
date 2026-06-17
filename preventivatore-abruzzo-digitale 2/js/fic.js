/* ============================================================
   FIC.JS — Integrazione Fatture in Cloud (Personal Access Token)
   ============================================================
   ATTENZIONE: la chiamata diretta browser→FiC è soggetta a CORS.
   Per uso produzione si consiglia un piccolo proxy server.
   Questa implementazione tenta la chiamata diretta e, in caso di
   blocco CORS, suggerisce all'utente di copiare manualmente il
   payload JSON nell'interfaccia FiC (workflow ibrido).
   ============================================================ */

const FIC = {
  BASE_URL: 'https://api-v2.fattureincloud.it',

  async getCredentials() {
    return {
      token:     await DB.getSetting('fic_token', ''),
      companyId: await DB.getSetting('fic_company', ''),
    };
  },

  async saveCredentials(token, companyId) {
    await DB.setSetting('fic_token', token);
    await DB.setSetting('fic_company', companyId);
  },

  /** Se il backend è disponibile e loggato, usiamo il proxy server
      (token/Company ID stanno lato server, non servono qui). */
  _proxyBase() {
    if (window.Sync && Sync.enabled && Sync.enabled() && Sync._loadToken && Sync._loadToken()) {
      return Sync.baseUrl();
    }
    return null;
  },

  async _proxy(method, path, body) {
    const base = this._proxyBase();
    const res = await fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + Sync._loadToken(),
      },
      body: body != null ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error((data && (data.error || JSON.stringify(data))) || ('HTTP ' + res.status));
    return data;
  },

  _headers(token) {
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
  },

  /** Test connessione: GET /user/info */
  async testConnection() {
    if (this._proxyBase()) {
      const r = await this._proxy('GET', '/fic/status');
      if (!r.configured) return { ok: false, error: 'FiC non configurato sul server (server/.env)' };
      return r.ok ? { ok: true, data: r.user } : { ok: false, error: 'FiC HTTP ' + r.status };
    }
    const { token } = await this.getCredentials();
    if (!token) throw new Error('Token non configurato');
    try {
      const res = await fetch(`${this.BASE_URL}/user/info`, {
        headers: this._headers(token),
        mode: 'cors',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return { ok: true, data: data.data };
    } catch (e) {
      if (e.message.includes('CORS') || e.name === 'TypeError') {
        return { ok: false, corsBlocked: true, error: 'Browser ha bloccato la chiamata (CORS). Considera un piccolo proxy server per uso completo.' };
      }
      return { ok: false, error: e.message };
    }
  },

  /** Lista prodotti da FiC */
  async fetchProducts() {
    if (this._proxyBase()) return await this._proxy('GET', '/fic/products');
    const { token, companyId } = await this.getCredentials();
    if (!token || !companyId) throw new Error('Token o Company ID mancante');
    const res = await fetch(`${this.BASE_URL}/c/${companyId}/products?per_page=100`, {
      headers: this._headers(token),
      mode: 'cors',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.data || [];
  },

  /** Crea cliente su FiC */
  async createClient(client) {
    if (this._proxyBase()) return await this._proxy('POST', '/fic/client', client);
    const { token, companyId } = await this.getCredentials();
    const body = {
      data: {
        type: 'company',
        name: client.name,
        vat_number: client.vat || '',
        tax_code: client.cf || '',
        address_street: client.addr || '',
        address_postal_code: client.zip || '',
        address_city: client.city || '',
        address_province: client.prov || '',
        country: 'Italia',
        email: client.email || '',
        certified_email: client.pec || '',
        ei_code: client.sdi || '',
        phone: client.phone || '',
      }
    };
    const res = await fetch(`${this.BASE_URL}/c/${companyId}/entities/clients`, {
      method: 'POST',
      headers: this._headers(token),
      mode: 'cors',
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()).data;
  },

  /** Crea bozza preventivo (issued_documents type=quote) */
  async createQuoteDraft(quote, client) {
    if (this._proxyBase()) return await this._proxy('POST', '/fic/quote-draft', { quote, client });
    const { token, companyId } = await this.getCredentials();
    const items = (quote.lines || []).map(l => ({
      product_id: null,
      code: '',
      name: l.name,
      description: l.desc || '',
      qty: l.quantity || 1,
      measure: l.udm || '',
      net_price: l.net || 0,
      vat: { id: 0, value: (l.vat || 0.22) * 100 },
      discount: l.discountPct || 0,
      discount_highlight: false,
      apply_withholding_taxes: false,
    }));
    const body = {
      data: {
        type: 'quote',
        entity: {
          id: client && client.ficId ? client.ficId : null,
          name: client ? client.name : 'Cliente',
          vat_number: client ? client.vat : '',
          tax_code: client ? client.cf : '',
          address_street: client ? client.addr : '',
          address_postal_code: client ? client.zip : '',
          address_city: client ? client.city : '',
          address_province: client ? client.prov : '',
          email: client ? client.email : '',
          certified_email: client ? client.pec : '',
          ei_code: client ? client.sdi : '',
        },
        date: quote.date,
        number: 0,
        numeration: '',
        subject: `Preventivo ${quote.number}`,
        visible_subject: '',
        notes: quote.notes || '',
        items_list: items,
        currency: { id: 'EUR' },
        language: { code: 'it', name: 'Italiano' },
        show_payment_method: false,
        show_payments: false,
        show_totals: 'all',
        e_invoice: false,
      },
    };
    const res = await fetch(`${this.BASE_URL}/c/${companyId}/issued_documents`, {
      method: 'POST',
      headers: this._headers(token),
      mode: 'cors',
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    return (await res.json()).data;
  },

  /** Workflow ibrido: scarica il JSON formattato per copia-incolla manuale */
  exportQuoteAsJson(quote, client) {
    const payload = {
      cliente: client,
      preventivo: quote,
      esportato: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `preventivo-${quote.number}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },
};

window.FIC = FIC;
