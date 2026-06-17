/* ============================================================
   CONFIGURATOR.JS — Sprint 2.2
   - Periodo (monthly/oneoff) sui SINGOLI BOX, non più sezione
   - Bundle Start social (creazione contenuti una tantum)
   - Bundle web preconfigurati con includes[] e voci swappabili
   - Prezzi placeholder dove non noti
   ============================================================ */

const ConfiguratorData = {

  areas: [
    {
      id: 'social',
      name: 'Social Media',
      icon: '📱',
      desc: 'Componi il preventivo social. La sezione Gestione & Strategia è obbligatoria. Stories/Reels/ADS Meta richiedono una gestione SMM Meta (stesso vincolo per TikTok e LinkedIn).',
      sections: [
        {
          id: 'social-strategia',
          name: 'Gestione & Strategia',
          icon: '🎯',
          required: true,
          requiredHint: 'Aggiungi almeno una strategia. La "Strategia social media marketing" è la base consigliata per ogni pacchetto social.',
          boxes: [
            { id: 'strat-social-marketing', label: 'Strategia di social media marketing', price: 500, period: 'oneoff', desc: 'Strategia base - consigliata per ogni pacchetto social' },
            { id: 'strat-content',          label: 'Strategia di contenuti social',     price: 350, period: 'oneoff', desc: 'Piano editoriale + tone of voice' },
            { id: 'strat-meta-ads',         label: 'Strategia META ADS',              price: 350, period: 'oneoff', desc: 'Audit + struttura campagne ADS Meta' },
            { id: 'strat-linkedin-ads',     label: 'Strategia LinkedIn ADS',          price: 350, period: 'oneoff', desc: 'Audit + struttura campagne ADS LinkedIn' },
          ],
        },

        {
          id: 'meta',
          name: 'Meta — Facebook & Instagram',
          icon: 'f',
          boxes: [
            // Gestione
            { id: 'smm-meta-visibility',  label: 'SMM Meta Visibilità',  price: 400, period: 'monthly', desc: '4-6 post · Facebook + Instagram' },
            { id: 'smm-meta-crescita',    label: 'SMM Meta Crescita',    price: 550, period: 'monthly', desc: '6-8 post · Facebook + Instagram' },
            { id: 'smm-meta-evoluzione',  label: 'SMM Meta Evoluzione',  price: 70,  period: 'monthly', desc: '8-10 post · Facebook + Instagram' },
            // Campagne lancio
            { id: 'meta-lancio-base', label: 'Campagna lancio META base', price: 900,  period: 'oneoff', desc: '6 pubblicazioni (post e/o reel) · ADS Meta opzionale' },
            { id: 'meta-lancio-pro',  label: 'Campagna lancio META pro',  price: 1300, period: 'oneoff', desc: '9-12 pubblicazioni (post e/o reel) · ADS Meta opzionale' },
            // META ADS (famiglia) - richiede SMM Meta
            { id: 'meta-ads-1', family: 'meta-ads', familyLabel: 'META ADS', familyDesc: 'shooting escluso · pacchetto semestrale -10%', label: '× 1 campagna', variantLabel: '× 1 campagna', price: 200, period: 'monthly', requiresAnyBox: ['smm-meta-visibility','smm-meta-crescita','smm-meta-evoluzione','strat-social-marketing','strat-meta-ads'] },
            { id: 'meta-ads-2', family: 'meta-ads', familyLabel: 'META ADS', familyDesc: 'shooting escluso · pacchetto semestrale -10%', label: '× 2 campagne', variantLabel: '× 2 campagne', price: 350, period: 'monthly', requiresAnyBox: ['smm-meta-visibility','smm-meta-crescita','smm-meta-evoluzione','strat-social-marketing','strat-meta-ads'] },
            { id: 'meta-ads-3', family: 'meta-ads', familyLabel: 'META ADS', familyDesc: 'shooting escluso · pacchetto semestrale -10%', label: '× 3 campagne', variantLabel: '× 3 campagne', price: 450, period: 'monthly', requiresAnyBox: ['smm-meta-visibility','smm-meta-crescita','smm-meta-evoluzione','strat-social-marketing','strat-meta-ads'] },
            // Stories (famiglia) - richiede SMM Meta
            { id: 'meta-stories-5',  family: 'meta-stories', familyLabel: 'Stories Meta', label: '× 5 stories',  variantLabel: '× 5 stories',  price: 70,  period: 'monthly', requiresAnyBox: ['smm-meta-visibility','smm-meta-crescita','smm-meta-evoluzione'] },
            { id: 'meta-stories-10', family: 'meta-stories', familyLabel: 'Stories Meta', label: '× 10 stories', variantLabel: '× 10 stories', price: 120, period: 'monthly', requiresAnyBox: ['smm-meta-visibility','smm-meta-crescita','smm-meta-evoluzione'] },
            { id: 'meta-stories-15', family: 'meta-stories', familyLabel: 'Stories Meta', label: '× 15 stories', variantLabel: '× 15 stories', price: 180, period: 'monthly', requiresAnyBox: ['smm-meta-visibility','smm-meta-crescita','smm-meta-evoluzione'] },
            // Reels (famiglia) - richiede SMM Meta
            { id: 'meta-reels-12', family: 'meta-reels', familyLabel: 'Reels Meta', label: '1-2 reel', variantLabel: '1-2 reel', price: 250, period: 'monthly', requiresAnyBox: ['smm-meta-visibility','smm-meta-crescita','smm-meta-evoluzione'] },
            { id: 'meta-reels-23', family: 'meta-reels', familyLabel: 'Reels Meta', label: '2-3 reel', variantLabel: '2-3 reel', price: 450, period: 'monthly', requiresAnyBox: ['smm-meta-visibility','smm-meta-crescita','smm-meta-evoluzione'] },
            { id: 'meta-reels-34', family: 'meta-reels', familyLabel: 'Reels Meta', label: '3-4 reel', variantLabel: '3-4 reel', price: 550, period: 'monthly', requiresAnyBox: ['smm-meta-visibility','smm-meta-crescita','smm-meta-evoluzione'] },
            // Grafica Meta (famiglia) - locandine, non richiede prereq
            { id: 'meta-grafica-locandina',      family: 'meta-grafica', familyLabel: 'Locandina', label: 'Locandina classica', variantLabel: 'Locandina classica', price: 30,  period: 'oneoff' },
            { id: 'meta-grafica-locandina-ai',   family: 'meta-grafica', familyLabel: 'Locandina', label: 'Locandina AI',      variantLabel: 'Locandina AI',       price: 50,  period: 'oneoff' },
            { id: 'meta-grafica-locandina-anim', family: 'meta-grafica', familyLabel: 'Locandina', label: 'Locandina animata AI', variantLabel: 'Locandina animata AI', price: 120, period: 'oneoff' },
          ],
        },

        {
          id: 'tiktok',
          name: 'TikTok',
          icon: 'TT',
          boxes: [
            // Gestione
            { id: 'smm-tiktok-start', label: 'SMM Tik Tok Start', price: 350, period: 'monthly', desc: '1-2 post/carosello mensili' },
            { id: 'smm-tiktok-up',    label: 'SMM Tik Tok Up',    price: 500, period: 'monthly', desc: '2-4 post/carosello mensili' },
            // TikTok ADS (famiglia) - richiede SMM TikTok. Stessa struttura di META ADS.
            { id: 'tiktok-ads-1', family: 'tiktok-ads', familyLabel: 'Tik Tok ADS', familyDesc: 'shooting escluso · pacchetto semestrale -10%', label: '× 1 campagna',  variantLabel: '× 1 campagna',  price: 200, period: 'monthly', requiresAnyBox: ['smm-tiktok-start','smm-tiktok-up','strat-social-marketing'] },
            { id: 'tiktok-ads-2', family: 'tiktok-ads', familyLabel: 'Tik Tok ADS', familyDesc: 'shooting escluso · pacchetto semestrale -10%', label: '× 2 campagne', variantLabel: '× 2 campagne', price: 350, period: 'monthly', requiresAnyBox: ['smm-tiktok-start','smm-tiktok-up','strat-social-marketing'] },
            { id: 'tiktok-ads-3', family: 'tiktok-ads', familyLabel: 'Tik Tok ADS', familyDesc: 'shooting escluso · pacchetto semestrale -10%', label: '× 3 campagne', variantLabel: '× 3 campagne', price: 450, period: 'monthly', requiresAnyBox: ['smm-tiktok-start','smm-tiktok-up','strat-social-marketing'] },
            // Video TikTok (famiglia) - richiede SMM TikTok
            { id: 'tiktok-video-1', family: 'tiktok-video', familyLabel: 'Video TikTok', familyDesc: 'riprese + montaggio', label: '× 1', variantLabel: '× 1 video', price: 150, period: 'monthly', requiresAnyBox: ['smm-tiktok-start','smm-tiktok-up'] },
            { id: 'tiktok-video-2', family: 'tiktok-video', familyLabel: 'Video TikTok', familyDesc: 'riprese + montaggio', label: '× 2', variantLabel: '× 2 video', price: 300, period: 'monthly', requiresAnyBox: ['smm-tiktok-start','smm-tiktok-up'] },
            { id: 'tiktok-video-3', family: 'tiktok-video', familyLabel: 'Video TikTok', familyDesc: 'riprese + montaggio', label: '× 3', variantLabel: '× 3 video', price: 400, period: 'monthly', requiresAnyBox: ['smm-tiktok-start','smm-tiktok-up'] },
            { id: 'tiktok-video-4', family: 'tiktok-video', familyLabel: 'Video TikTok', familyDesc: 'riprese + montaggio', label: '× 4', variantLabel: '× 4 video', price: 500, period: 'monthly', requiresAnyBox: ['smm-tiktok-start','smm-tiktok-up'] },
          ],
        },

        {
          id: 'linkedin',
          name: 'LinkedIn',
          icon: 'in',
          boxes: [
            // Gestione
            { id: 'smm-linkedin-base', label: 'SMM Linkedin Base', price: 350, period: 'monthly', desc: '1-2 post editoriale/carosello mensili' },
            { id: 'smm-linkedin-pro',  label: 'SMM Linkedin Pro',  price: 500, period: 'monthly', desc: '2-4 post editoriale/carosello mensili' },
            // LinkedIn ADS (famiglia) - richiede SMM LinkedIn
            { id: 'linkedin-ads-1', family: 'linkedin-ads', familyLabel: 'LinkedIn ADS', familyDesc: 'shooting escluso', label: '× 1 campagna', variantLabel: '× 1 campagna', price: 250, period: 'monthly', requiresAnyBox: ['smm-linkedin-base','smm-linkedin-pro','strat-social-marketing','strat-linkedin-ads'] },
            { id: 'linkedin-ads-2', family: 'linkedin-ads', familyLabel: 'LinkedIn ADS', familyDesc: 'shooting escluso', label: '× 2 campagne', variantLabel: '× 2 campagne', price: 400, period: 'monthly', requiresAnyBox: ['smm-linkedin-base','smm-linkedin-pro','strat-social-marketing','strat-linkedin-ads'] },
            { id: 'linkedin-ads-3', family: 'linkedin-ads', familyLabel: 'LinkedIn ADS', familyDesc: 'shooting escluso', label: '× 3 campagne', variantLabel: '× 3 campagne', price: 500, period: 'monthly', requiresAnyBox: ['smm-linkedin-base','smm-linkedin-pro','strat-social-marketing','strat-linkedin-ads'] },
          ],
        },

        {
          id: 'social-setup',
          name: 'Setup & Shooting',
          icon: '⚙',
          boxes: [
            { id: 'shoot-foto',         label: 'Shooting Fotografico',                       price: 800, period: 'oneoff' },
            { id: 'shoot-video',        label: 'Riprese video',                              price: 700, period: 'oneoff' },
            { id: 'shoot-drone',        label: 'Riprese drone',                              price: 500, period: 'oneoff' },
            { id: 'setup-meta-bm',      label: 'Configurazione Meta Business manager',       price: 250, period: 'oneoff' },
            { id: 'setup-linkedin-bm',  label: 'Configurazione LinkedIn Business manager',   price: 250, period: 'oneoff' },
            { id: 'setup-tiktok-bm',    label: 'Configurazione Tik Tok Business manager',    price: 250, period: 'oneoff' },
            { id: 'create-fb-page',     label: 'Creazione pagina Facebook',                  price: 90,  period: 'oneoff' },
            { id: 'create-ig-profile',  label: 'Creazione pagina Instagram business',        price: 90,  period: 'oneoff' },
            { id: 'create-gmb',         label: 'Configurazione Google My Business',          price: 90,  period: 'oneoff' },
            { id: 'create-tt-profile',  label: 'Creazione profilo Tik Tok',                  price: 50,  period: 'oneoff' },
          ],
        },
      ],
    },

    {
      id: 'web',
      name: 'Web & E-commerce',
      icon: '🌐',
      desc: 'Bundle preconfigurati: includono già le voci principali dal listino. Puoi sostituire alcune voci (es. il piano hosting) dopo aver aggiunto il bundle.',
      sections: [
        {
          id: 'web-realizzazione',
          name: 'Bundle realizzazione',
          icon: '🛠',
          required: true,
          requiredHint: 'Seleziona il tipo di progetto da realizzare',
          boxes: [
            {
              id: 'bundle-site-corporate',
              label: 'Sito Web Corporate',
              isBundle: true,
              period: 'oneoff',
              desc: 'Bundle completo: design, sviluppo, SEO base, GDPR, Analytics',
              includes: [
                { id: 'dominio',           label: 'Dominio',                       price: 15,   swappable: false },
                { id: 'hosting-base',      label: 'Hosting Base',                  price: 150,  swappable: true,  group: 'hosting' },
                { id: 'ux-corporate',      label: 'Grafica e studio UX/UI Sito web corporate', price: 500,  swappable: false },
                { id: 'site-corporate',    label: 'Realizzazione sito web',                    price: 850,  swappable: false },
                { id: 'responsive-corp',   label: 'Ottimizzazione responsive sito corporate',  price: 300,  swappable: false },
                { id: 'gdpr',              label: 'GDPR (privacy + cookie)',       price: 500,  swappable: false },
                { id: 'analytics',         label: 'Google Analytics',              price: 120,  swappable: false },
                { id: 'search-console',    label: 'Google Search Console',         price: 120,  swappable: false },
                { id: 'seo-base',          label: 'SEO Base',                      price: 350,  swappable: false },
              ],
            },
            {
              id: 'bundle-ecommerce-woo',
              label: 'E-commerce WooCommerce',
              isBundle: true,
              period: 'oneoff',
              desc: 'Bundle completo per shop online su WordPress + WooCommerce',
              includes: [
                { id: 'dominio',           label: 'Dominio',                       price: 15,   swappable: false },
                { id: 'hosting-pro',       label: 'Hosting Pro',                   price: 300,  swappable: true,  group: 'hosting' },
                { id: 'ux-ecommerce',      label: 'Grafica e studio UX/UI Ecommerce',     price: 850,  swappable: false },
                { id: 'ecom-woo',          label: 'Realizzazione Ecommerce Woocommerce',  price: 2700, swappable: false },
                { id: 'responsive-ecom',   label: 'Ottimizzazione Responsive Ecommerce',  price: 450,  swappable: false },
                { id: 'gdpr',              label: 'GDPR (privacy + cookie)',       price: 500,  swappable: false },
                { id: 'analytics',         label: 'Google Analytics',              price: 120,  swappable: false },
                { id: 'search-console',    label: 'Google Search Console',         price: 120,  swappable: false },
                { id: 'seo-base',          label: 'SEO Base',                      price: 350,  swappable: false },
              ],
            },
            {
              id: 'bundle-ecommerce-shop',
              label: 'E-commerce Shopify',
              isBundle: true,
              period: 'oneoff',
              desc: 'Bundle completo su piattaforma Shopify',
              includes: [
                { id: 'dominio',           label: 'Dominio',                       price: 15,   swappable: false },
                { id: 'shopify-basic',     label: 'Shopify piano Basic',           price: 28,   swappable: true, group: 'shopify-plan', note: 'mensile' },
                { id: 'ux-ecommerce',      label: 'Grafica e studio UX/UI Ecommerce',          price: 850,  swappable: false },
                { id: 'ecom-shop',         label: 'Realizzazione ecommerce Shopify',           price: 1900, swappable: false },
                { id: 'responsive-shop',   label: 'Ottimizzazione Responsive ecommerce Shopify', price: 300, swappable: false },
                { id: 'gdpr',              label: 'GDPR',                          price: 500,  swappable: false },
                { id: 'analytics',         label: 'Google Analytics',              price: 120,  swappable: false },
                { id: 'seo-base',          label: 'SEO Base',                      price: 350,  swappable: false },
              ],
            },
            {
              id: 'bundle-landing',
              label: 'Landing page',
              isBundle: true,
              period: 'oneoff',
              desc: 'One-page focalizzata su una campagna o lancio',
              includes: [
                { id: 'dominio',         label: 'Dominio',                  price: 15,  swappable: false },
                { id: 'hosting-base',    label: 'Hosting Base',             price: 150, swappable: true, group: 'hosting' },
                { id: 'hero-grafica',    label: 'Grafica sezione Hero',     price: 450, swappable: false },
                { id: 'site-landing',    label: 'Realizzazione landing',    price: 500, swappable: false },
                { id: 'analytics',       label: 'Google Analytics',         price: 120, swappable: false },
              ],
            },
          ],
        },
        {
          id: 'web-manutenzione',
          name: 'Manutenzione & Aggiornamento',
          icon: '🔄',
          required: true,
          requiredHint: 'Aggiungi una manutenzione: protegge il sito e ne assicura le prestazioni',
          boxes: [
            { id: 'maint-site-corp', label: 'Aggiornamento e manutenzione sito web corporate', price: 480, period: 'monthly' },
            { id: 'maint-ecom-woo',  label: 'Aggiornamento e manutenzione ecommerce',         price: 960, period: 'monthly' },
            { id: 'maint-ecom-shop', label: 'Aggiornamento e manutenzione ecommerce Shopify', price: 500, period: 'monthly' },
          ],
        },
        {
          id: 'web-hosting-extra',
          name: 'Hosting extra & Servizi',
          icon: '🌍',
          boxes: [
            { id: 'hosting-evo',    label: 'Hosting Evo',          price: 450, period: 'monthly', desc: 'Upgrade hosting' },
            { id: 'hosting-cloud',  label: 'Hosting Cloud Base',   price: 110, period: 'monthly', desc: 'Upgrade a cloud' },
            { id: 'email-az',       label: 'Email aziendali',      price: 15,  period: 'monthly' },
            { id: 'menu-digitale',  label: 'Menu digitale',        price: 250, period: 'oneoff' },
            { id: 'multilingua',    label: 'Multilingua Ecommerce', price: 300, period: 'oneoff' },
          ],
        },
        {
          id: 'web-addon',
          name: 'Add-on opzionali',
          icon: '➕',
          boxes: [
            { id: 'klarna',         label: 'Configurazione Klarna',       price: 250, period: 'oneoff' },
            { id: 'scalapay',       label: 'Configurazione Scalapay',     price: 250, period: 'oneoff' },
            { id: 'mbway',          label: 'Configurazione Mbway',        price: 250, period: 'oneoff' },
            { id: 'data-entry',     label: 'Data entry prodotti ecommerce', price: 5, period: 'oneoff', note: 'cad' },
            { id: 'qr-code',        label: 'Realizzazione QR Code',       price: 15,  period: 'oneoff' },
            { id: 'qr-canone',      label: 'Canone mensile QR Code dinamico', price: 5, period: 'monthly' },
          ],
        },
      ],
    },
    {
      id: 'menu',
      name: 'Menu Digitale',
      icon: '🍽',
      desc: 'Servizio menu digitale con QR Code. I piani Marketing e Management sono disponibili solo se selezioni il Menu Digitale base.',
      durationField: true, // mostra selettore semestrale/annuale
      sections: [
        {
          id: 'menu-base',
          name: 'Menu Digitale',
          icon: '📋',
          boxes: [
            { id: 'menu-digitale-base', label: 'Menu Digitale Gnammm', price: 250, period: 'monthly', desc: 'Menu QR Code + interfaccia digitale (Gnammm)', requires: null },
          ],
        },
        {
          id: 'menu-piani',
          name: 'Piani',
          icon: '⭐',
          requiresBox: 'menu-digitale-base',
          hideRequiresBadge: true,
          boxes: [
            { id: 'menu-piano-marketing',      label: 'Gnammm piano Marketing semestrale',  price: 45, period: 'monthly', desc: 'Promozione e visibilita del menu — fatturazione semestrale', exclusiveGroup: 'menu-plan' },
            { id: 'menu-piano-marketing-ann',  label: 'Gnammm piano Marketing annuale',     price: 35, period: 'monthly', desc: 'Promozione e visibilita del menu — fatturazione annuale (sconto)', exclusiveGroup: 'menu-plan' },
            { id: 'menu-piano-management',     label: 'Gnammm piano Management semestrale', price: 80, period: 'monthly', desc: 'Gestione completa (upgrade del Marketing) — fatturazione semestrale', exclusiveGroup: 'menu-plan' },
            { id: 'menu-piano-management-ann', label: 'Gnammm piano Management annuale',    price: 70, period: 'monthly', desc: 'Gestione completa (upgrade del Marketing) — fatturazione annuale (sconto)', exclusiveGroup: 'menu-plan' },
          ],
        },
      ],
    },
  ],

  /** Alternative per sostituzione voci nei bundle */
  swapOptions: {
    hosting: [
      { id: 'hosting-base',  label: 'Hosting Base',         price: 150 },
      { id: 'hosting-pro',   label: 'Hosting Pro',          price: 300 },
      { id: 'hosting-evo',   label: 'Hosting Evo',          price: 450 },
      { id: 'hosting-cloud', label: 'Hosting Cloud Base',   price: 110, note: 'mensile' },
    ],
    'shopify-plan': [
      { id: 'shopify-basic', label: 'Shopify piano Basic', price: 28, note: 'mensile' },
    ],
  },

  findBox(boxId) {
    for (const area of this.areas) {
      for (const sec of area.sections) {
        const b = sec.boxes.find(x => x.id === boxId);
        if (b) return {
          ...b,
          areaId: area.id,
          areaName: area.name,
          sectionId: sec.id,
          sectionName: sec.name,
          required: !!sec.required,
        };
      }
    }
    return null;
  },

  getRequiredSections(areaId) {
    const area = this.areas.find(a => a.id === areaId);
    if (!area) return [];
    return area.sections.filter(s => s.required);
  },

  getSwapOptions(group) {
    return this.swapOptions[group] || [];
  },
};

const Configurator = {
  currentArea: 'social',
  composition: [],          // [{ boxId, instances, swaps?: { originalId: newId } }]
  months: 6,
  menuBillingMode: 'semestral', // 'semestral' o 'annual' per area menu
  discountPct: 0,
  // Regole configuratore (override admin via Impostazioni)
  rules: { webMaintRequired: true, socialGestionRequired: true },

  async loadRules() {
    try {
      const r = await DB.getSetting('configurator_rules', null);
      if (r && typeof r === 'object') this.rules = Object.assign(this.rules, r);
    } catch (e) { /* ignore */ }
    // Carica anche il mapping box → ficProductId (listino unico)
    try {
      const m = await DB.getSetting('configurator_fic_mapping', null);
      if (m && typeof m === 'object') this.applyFicMapping(m);
    } catch (e) { /* ignore */ }
  },

  /** Applica la mappa { boxId: ficProductId } direttamente su
      ConfiguratorData (così findBox() ritorna il box con ficProductId). */
  applyFicMapping(mapping) {
    for (const area of ConfiguratorData.areas) {
      for (const sec of area.sections) {
        for (const box of sec.boxes) {
          if (mapping[box.id] != null) box.ficProductId = mapping[box.id];
        }
      }
    }
  },

  /** Costruisce la mappa attuale leggendo da ConfiguratorData. */
  buildFicMapping() {
    const out = {};
    for (const area of ConfiguratorData.areas) {
      for (const sec of area.sections) {
        for (const box of sec.boxes) {
          if (box.ficProductId != null) out[box.id] = box.ficProductId;
        }
      }
    }
    return out;
  },

  /** Auto-match per nome: dato l'elenco prodotti FiC, prova ad
      assegnare ficProductId ai box per cui label (o familyLabel) combacia.
      Ritorna il numero di box matchati. */
  autoMatchFromFic(ficProducts) {
    if (!Array.isArray(ficProducts) || !ficProducts.length) return 0;
    const norm = s => String(s || '').toLowerCase().trim().replace(/\s+/g, ' ');
    const byName = new Map();
    for (const p of ficProducts) if (p && p.name) byName.set(norm(p.name), p.id);
    let n = 0;
    for (const area of ConfiguratorData.areas) {
      for (const sec of area.sections) {
        for (const box of sec.boxes) {
          if (box.ficProductId) continue;        // già mappato → non sovrascrivere
          const candidates = [box.label, box.familyLabel, box.name].filter(Boolean).map(norm);
          for (const c of candidates) {
            if (byName.has(c)) { box.ficProductId = byName.get(c); n++; break; }
          }
        }
      }
    }
    return n;
  },

  _bundlePrice(box, swaps) {
    if (!box.isBundle) return box.price || 0;
    if (!box.includes) return box.price || 0;
    let total = 0;
    for (const item of box.includes) {
      const swapId = swaps && swaps[item.id];
      if (swapId) {
        const swapList = ConfiguratorData.getSwapOptions(item.group);
        const swapped = swapList.find(s => s.id === swapId);
        total += swapped ? (swapped.price || 0) : (item.price || 0);
      } else {
        total += (item.price || 0);
      }
    }
    return total;
  },

  effectiveMonths() {
    if (this.currentArea === 'menu') {
      return this.menuBillingMode === 'annual' ? 12 : 6;
    }
    return this.months;
  },

  state() {
    let monthly = 0, oneoff = 0;
    const items = [];
    for (const item of this.composition) {
      const box = ConfiguratorData.findBox(item.boxId);
      if (!box) continue;
      const price = box.isBundle ? this._bundlePrice(box, item.swaps) : (box.price || 0);
      const subtotal = price * item.instances;
      if (box.period === 'monthly') monthly += subtotal;
      else oneoff += subtotal;
      items.push({ ...box, instances: item.instances, subtotal, swaps: item.swaps, computedPrice: price });
    }
    const months = this.effectiveMonths();
    const totalMonthly = monthly * months;
    const subtotal = totalMonthly + oneoff;
    const discount = subtotal * (this.discountPct / 100);
    const net = Math.max(0, subtotal - discount);
    return { items, monthly, oneoff, totalMonthly, subtotal, discount, net, vat: net * 0.22, total: net * 1.22, months };
  },

  validate() {
    let required = ConfiguratorData.getRequiredSections(this.currentArea);
    // Applica i flag: rimuovi sezioni richieste se disabilitate
    required = required.filter(req => {
      if (this.currentArea === 'web' && req.id === 'web-manutenzione' && !this.rules.webMaintRequired) return false;
      if (this.currentArea === 'social' && req.id === 'social-gestione' && !this.rules.socialGestionRequired) return false;
      return true;
    });
    const missing = [];
    for (const req of required) {
      const has = this.composition.some(c => {
        const b = ConfiguratorData.findBox(c.boxId);
        return b && b.sectionId === req.id;
      });
      if (!has) missing.push(req);
    }
    return { valid: missing.length === 0, missing };
  },

  setArea(areaId) { this.currentArea = areaId; },


  /** Verifica se una box puo essere aggiunta data la composizione attuale (dipendenze) */
  canAddBox(boxId) {
    const box = ConfiguratorData.findBox(boxId);
    if (!box) return false;
    const area = ConfiguratorData.areas.find(a => a.id === box.areaId);
    if (!area) return true;
    const sec = area.sections.find(s => s.id === box.sectionId);
    // requiresBox a livello SEZIONE
    if (sec && sec.requiresBox) {
      const has = this.composition.some(c => c.boxId === sec.requiresBox);
      if (!has) return false;
    }
    // requiresAnyBox a livello SEZIONE
    if (sec && Array.isArray(sec.requiresAnyBox) && sec.requiresAnyBox.length > 0) {
      const has = this.composition.some(c => sec.requiresAnyBox.includes(c.boxId));
      if (!has) return false;
    }
    // requiresAnyBox a livello BOX (per varianti famiglia in sezioni accorpate)
    if (Array.isArray(box.requiresAnyBox) && box.requiresAnyBox.length > 0) {
      const has = this.composition.some(c => box.requiresAnyBox.includes(c.boxId));
      if (!has) return false;
    }
    return true;
  },

  addBox(boxId) {
    if (!this.canAddBox(boxId)) {
      if (window.App) App._toast('Aggiungi prima il prerequisito di questa sezione', 'error');
      return false;
    }
    // Mutual exclusion: se la box ha un exclusiveGroup, rimuovo le altre dello stesso gruppo
    const box = ConfiguratorData.findBox(boxId);
    if (box && box.exclusiveGroup) {
      this.composition = this.composition.filter(c => {
        if (c.boxId === boxId) return true;
        const other = ConfiguratorData.findBox(c.boxId);
        return !(other && other.exclusiveGroup === box.exclusiveGroup);
      });
    }
    const existing = this.composition.find(c => c.boxId === boxId);
    if (existing) existing.instances += 1;
    else this.composition.push({ boxId, instances: 1, swaps: {} });
    return true;
  },

  removeBox(boxId) { this.composition = this.composition.filter(c => c.boxId !== boxId); },

  changeInstances(boxId, delta) {
    const item = this.composition.find(c => c.boxId === boxId);
    if (!item) return;
    item.instances = Math.max(1, item.instances + delta);
  },

  applySwap(boxId, originalId, newId) {
    const item = this.composition.find(c => c.boxId === boxId);
    if (!item) return;
    item.swaps = item.swaps || {};
    item.swaps[originalId] = newId;
  },

  reset() { this.composition = []; this.months = 6; this.discountPct = 0; },

  _buildPayload(items) {
    return {
      areaId: this.currentArea,
      composition: this.composition.map(item => ({
        boxId: item.boxId,
        instances: item.instances || 1,
        swaps: item.swaps || {},
      })),
      items: (items || []).map(it => ({
        id: it.id,
        serviceId: it.serviceId || null,
        label: it.label,
        areaId: it.areaId,
        sectionId: it.sectionId,
        sectionName: it.sectionName,
        period: it.period,
        isBundle: !!it.isBundle,
        price: it.price || 0,
        computedPrice: it.computedPrice || 0,
        desc: it.desc || null,
        family: it.family || null,
        exclusiveGroup: it.exclusiveGroup || null,
        includes: it.includes || [],
      })),
      swapOptions: ConfiguratorData.swapOptions || {},
    };
  },

  _toQuoteLegacy() {
    State.createNewQuote();
    const lines = [];
    for (const item of this.composition) {
      const box = ConfiguratorData.findBox(item.boxId);
      if (!box) continue;
      if (box.isBundle && box.includes) {
        // Espando le voci del bundle (eventualmente swappate)
        for (const inc of box.includes) {
          const swapId = item.swaps && item.swaps[inc.id];
          let voce = inc;
          if (swapId) {
            const swapList = ConfiguratorData.getSwapOptions(inc.group);
            const swapped = swapList.find(s => s.id === swapId);
            if (swapped) voce = swapped;
          }
          lines.push({
            productId: null,
            ficProductId: voce.ficProductId || box.ficProductId || null,
            area: box.areaId,
            name: voce.label,
            category: box.sectionName,
            net: voce.price || 0,
            vat: 0.22,
            udm: voce.note === 'mensile' ? 'Mese' : 'una tantum',
            quantity: voce.note === 'mensile' ? this.months : 1,
            discountPct: 0,
          });
        }
      } else {
        const months = box.period === 'monthly' ? this.effectiveMonths() : 1;
        lines.push({
          productId: null,
          ficProductId: box.ficProductId || null,
          area: box.areaId,
          name: box.label,
          category: box.sectionName,
          net: box.price || 0,
          vat: 0.22,
          udm: box.period === 'monthly' ? 'Mese' : 'una tantum',
          quantity: months * (item.instances || 1),
          discountPct: 0,
        });
      }
    }
    State.currentQuote.lines = lines;
    State.currentQuote.discountPct = this.discountPct;
    State.currentQuote.discountEur = 0;
    State.currentQuote.tag = 'Configuratore ' + this.currentArea;
  },

  async toQuote() {
    const payload = {
      company_id: State.currentUser && State.currentUser.companyId ? State.currentUser.companyId : null,
      client_id: null,
      date: null,
      tag: 'Configuratore ' + this.currentArea,
      notes: null,
      discount_pct: this.discountPct || 0,
      discount_eur: 0,
      fic_id: null,
      lines: null,
      configurator: this._buildPayload(this.state().items),
    };

    let preview = null;
    try {
      preview = await Sync._api('POST', '/api/v1/quotes/from-configurator/preview', payload);
    } catch (e) {
      this._toQuoteLegacy();
      if (window.App) App.navigate('preventivo');
      return;
    }

    State.createNewQuote();
    State.currentQuote.lines = preview && preview.lines ? preview.lines : [];
    State.currentQuote.configurator = preview ? preview.configurator : payload.configurator;
    State.currentQuote.discountPct = preview && typeof preview.discount_pct === 'number' ? preview.discount_pct : (this.discountPct || 0);
    State.currentQuote.discountEur = preview && typeof preview.discount_eur === 'number' ? preview.discount_eur : 0;
    State.currentQuote.tag = preview && preview.tag ? preview.tag : payload.tag;
    State.currentQuote.date = preview && preview.date ? preview.date : State.currentQuote.date;
    State.currentQuote._previewPayload = payload;
    State.currentQuote._previewTotals = preview && preview.totals ? preview.totals : null;

    if (window.App) App.navigate('preventivo');
  },
};

window.Configurator = Configurator;
