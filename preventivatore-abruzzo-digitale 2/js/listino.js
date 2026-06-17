/* ============================================================
   LISTINO.JS — Catalogo prodotti e pacchetti social media
   ============================================================ */

const SOCIAL_PACKAGES = [
  {
    id: 'visibility',
    name: 'Visibilità',
    tagline: "Per la costruzione di una presenza solida e riconoscibile con contenuti che catturano l'attenzione e posizionano il tuo brand nel cuore dei clienti.",
    price: 650,
    accent: 'visibility',
    minMonths: 6,
    included: [
      'Grafiche post e stories',
      'Configurazione Meta BM',
      'Configurazione Google My Business',
      'Shooting foto',
      'Riprese video',
    ],
    monthly: [
      'Studio visivo PED (Piano Editoriale)',
      '4-6 post fotografici/grafici',
      '1 Reel',
      '4-6 Stories',
      '1 Campagna META ADS (creatività incluse)',
    ],
    productCode: 'Pacchetto Social Media Visibilità',
  },
  {
    id: 'growth',
    name: 'Crescita',
    tagline: 'Per far passare il tuo brand da una presenza statica a una realtà capace di attrarre nuovi utenti e consolidare le relazioni esistenti.',
    price: 850,
    accent: 'growth',
    minMonths: 6,
    badge: 'Il più scelto',
    included: [
      'Grafiche post e stories',
      'Configurazione Meta BM',
      'Configurazione Google My Business',
      'Shooting foto',
      'Riprese video',
      '1 Reel brand extra',
    ],
    monthly: [
      'Studio visuale PED (Piano Editoriale)',
      '6-8 post fotografici/grafici',
      '1-2 Reel',
      '6-8 Stories',
      '2 Campagne META ADS (creatività incluse)',
    ],
    productCode: 'Pacchetto Social Media Crescita',
  },
  {
    id: 'evolution',
    name: 'Evoluzione',
    tagline: 'Per chi punta in alto: una strategia avanzata per trasformare il tuo business in un punto di riferimento sui social e non solo.',
    price: 1200,
    accent: 'evolution',
    minMonths: 6,
    included: [
      'Grafiche post e stories',
      'Configurazione Meta BM',
      'Configurazione Google My Business',
      'Shooting foto',
      'Riprese video',
      '1 Reel brand extra',
    ],
    monthly: [
      'Studio visuale PED (Piano Editoriale)',
      '6-8 post fotografici/grafici',
      '3-4 Reel',
      '8-10 Stories',
      '3 Campagne META ADS (creatività incluse)',
    ],
    productCode: 'Pacchetto Social Media Evoluzione',
  },
];

const Listino = {
  products: [],
  categories: [],

  async load() {
    const dbProducts = await DB.all('products');
    if (dbProducts && dbProducts.length > 0) {
      this.products = dbProducts;
    } else {
      let data;
      if (window.LISTINO_EMBEDDED) {
        data = window.LISTINO_EMBEDDED;
      } else {
        try {
          const res = await fetch('data/listino.json');
          data = await res.json();
        } catch (e) {
          console.error('Impossibile caricare il listino:', e);
          data = [];
        }
      }
      this.products = data.map((p, i) => ({
        id: i + 1,
        code: p.code,
        name: p.name,
        desc: p.desc,
        category: p.category || 'Altro',
        net: parseFloat(p.net) || 0,
        gross: parseFloat(p.gross) || 0,
        vat: parseFloat(p.vat) || 0.22,
        udm: p.udm || null,
      }));
      for (const p of this.products) await DB.put('products', p);
    }
    this._buildCategories();
    return this.products;
  },

  _buildCategories() {
    const set = new Set();
    this.products.forEach(p => set.add(p.category));
    this.categories = ['Tutti', ...Array.from(set).sort()];
  },

  search(query, category) {
    let list = this.products.slice();
    if (category && category !== 'Tutti') {
      list = list.filter(p => p.category === category);
    }
    if (query) {
      const q = query.toLowerCase();
      list = list.filter(p =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.desc || '').toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q)
      );
    }
    return list;
  },

  findByName(name) {
    return this.products.find(p => p.name === name);
  },

  sortBy(list, key) {
    const copy = list.slice();
    if (key === 'name') copy.sort((a, b) => a.name.localeCompare(b.name));
    else if (key === 'price-asc') copy.sort((a, b) => a.net - b.net);
    else if (key === 'price-desc') copy.sort((a, b) => b.net - a.net);
    else copy.sort((a, b) => (a.category || '').localeCompare(b.category || '') || a.name.localeCompare(b.name));
    return copy;
  },

  async updateFromFic(ficProducts) {
    let aggiornati = 0, aggiunti = 0;
    for (const fp of ficProducts) {
      const existing = this.products.find(p =>
        (p.ficProductId && p.ficProductId === fp.id) || p.name === fp.name
      );
      if (existing) {
        existing.ficProductId = fp.id;
        existing.name = fp.name;
        existing.desc = fp.description || existing.desc || '';
        existing.category = (fp.category && fp.category.name) || fp.category || existing.category || 'Altro';
        existing.net = fp.net_price != null ? Number(fp.net_price) : existing.net;
        existing.gross = fp.gross_price != null ? Number(fp.gross_price) : existing.gross;
        existing.udm = fp.measure || existing.udm || null;
        await DB.put('products', existing);
        aggiornati++;
      } else {
        const newP = {
          ficProductId: fp.id,
          name: fp.name,
          desc: fp.description || '',
          category: (fp.category && fp.category.name) || fp.category || 'Altro',
          net: Number(fp.net_price) || 0,
          gross: Number(fp.gross_price) || 0,
          vat: 0.22,
          udm: fp.measure || null,
        };
        const id = await DB.put('products', newP);
        this.products.push({ ...newP, id });
        aggiunti++;
      }
    }
    this._buildCategories();
    return { aggiornati, aggiunti, totale: this.products.length };
  },
};

window.Listino = Listino;
window.SOCIAL_PACKAGES = SOCIAL_PACKAGES;
