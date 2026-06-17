/* ============================================================
   SEED DEMO CONTRACTS — popola il backend con clienti e contratti
   fittizi marcati con _demo:true per testare la vista
   'Situazione clienti'. Tutto eliminabile con wipe-demo-contracts.js.

   Avvio:  node tools/seed-demo-contracts.js
   ============================================================ */

const BASE = process.env.PREV_BASE || 'http://localhost:4321';

async function api(method, path, token, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const t = await res.text();
  let json; try { json = t ? JSON.parse(t) : null; } catch { json = { raw: t }; }
  if (!res.ok) throw new Error('HTTP ' + res.status + ' su ' + path + ' — ' + JSON.stringify(json));
  return json;
}

// ---- Dataset ----
const today = new Date('2026-05-21');
const d = (offsetDays) => {
  const dt = new Date(today);
  dt.setDate(dt.getDate() + offsetDays);
  return dt.toISOString().slice(0, 10);
};
const isoNow = (offsetDays) => {
  const dt = new Date(today);
  dt.setDate(dt.getDate() + offsetDays);
  return dt.toISOString();
};

const CLIENTI = [
  { name: 'Bar Centrale Pescara',                contact: 'Marco Bianchi',     vat: '01112223334', email: 'info@barcentrale.it',          phone: '+39 085 234567', addr: 'Corso Umberto 12',     city: 'Pescara',        prov: 'PE', zip: '65121' },
  { name: 'Pizzeria Da Mario',                   contact: 'Mario Esposito',    vat: '01223334445', email: 'mario@pizzeriadamario.it',     phone: '+39 085 345678', addr: 'Via Roma 45',           city: 'Montesilvano',   prov: 'PE', zip: '65015' },
  { name: 'Studio Legale Rossi & Bianchi',       contact: 'Avv. Giulia Rossi', vat: '01334445556', email: 'info@studiolegalerossi.it',   phone: '+39 085 456789', addr: 'Piazza Salotto 8',      city: 'Pescara',        prov: 'PE', zip: '65122' },
  { name: 'Trattoria Borgo Antico',              contact: 'Anna Di Loreto',    vat: '01445556667', email: 'prenotazioni@borgoantico.it', phone: '+39 085 567890', addr: 'Via del Borgo 3',       city: 'Chieti',         prov: 'CH', zip: '66100' },
  { name: 'Fitness Club Energy',                 contact: 'Luca Marini',       vat: '01556667778', email: 'info@fitnessenergy.it',       phone: '+39 085 678901', addr: 'Viale Marconi 100',     city: 'Pescara',        prov: 'PE', zip: '65126' },
  { name: 'Hotel Riviera',                       contact: 'Sara Costantini',   vat: '01667778889', email: 'booking@hotelriviera.it',     phone: '+39 085 789012', addr: 'Lungomare Matteotti 4', city: 'Giulianova',     prov: 'TE', zip: '64021' },
  { name: 'Boutique Eleganza',                   contact: 'Federica Pasquali', vat: '01778889990', email: 'shop@boutiqueleganza.it',     phone: '+39 085 890123', addr: 'Via Trieste 22',        city: 'Teramo',         prov: 'TE', zip: '64100' },
  { name: 'Carrozzeria Vento',                   contact: 'Paolo Vento',       vat: '01889990001', email: 'paolo@carrozzeriavento.it',   phone: '+39 085 901234', addr: 'Zona Ind. Lotto 12',    city: 'San Giovanni T.', prov: 'TE', zip: '64020' },
  { name: 'Beauty Center Aura',                  contact: 'Chiara Lupinetti',  vat: '01990001112', email: 'info@beautyaura.it',          phone: '+39 085 012345', addr: 'Corso Vittorio Emanuele 56', city: 'Pescara',    prov: 'PE', zip: '65122' },
  { name: 'Studio Architetti Costruire',         contact: 'Arch. Filippo Tomei', vat: '01001112223', email: 'studio@costruire.it',        phone: '+39 085 123450', addr: 'Via Verrotti 18',       city: 'Pescara',        prov: 'PE', zip: '65123' },
];

// Helper per voci tipiche, marcate con area corretta
const SAMPLE_LINES = {
  social_visibility: () => [
    { area: 'social', name: 'SMM Meta Visibilità', net: 400, quantity: 6, vat: 0.22, udm: 'Mese', category: 'Social media management' },
    { area: 'social', name: 'Strategia di social media marketing', net: 500, quantity: 1, vat: 0.22, udm: 'cad', category: 'Strategia' },
  ],
  social_growth: () => [
    { area: 'social', name: 'Pacchetto Social Media Crescita', net: 850, quantity: 6, vat: 0.22, udm: 'Mese' },
  ],
  social_evolution: () => [
    { area: 'social', name: 'Pacchetto Social Media Evoluzione', net: 1200, quantity: 12, vat: 0.22, udm: 'Mese' },
  ],
  web_corporate: () => [
    { area: 'web', name: 'Sito Web Corporate (bundle)', net: 3000, quantity: 1, vat: 0.22, udm: 'cad' },
    { area: 'web', name: 'Manutenzione sito corporate',  net: 480,  quantity: 12, vat: 0.22, udm: 'Mese' },
  ],
  web_ecommerce: () => [
    { area: 'web', name: 'E-commerce WooCommerce (bundle)', net: 5300, quantity: 1, vat: 0.22, udm: 'cad' },
    { area: 'web', name: 'Manutenzione e-commerce WooCommerce', net: 960, quantity: 12, vat: 0.22, udm: 'Mese' },
  ],
  menu_basic: () => [
    { area: 'menu', name: 'Menu Digitale Gnammm', net: 250, quantity: 12, vat: 0.22, udm: 'Mese' },
  ],
  menu_marketing: () => [
    { area: 'menu', name: 'Menu Digitale Gnammm', net: 250, quantity: 12, vat: 0.22, udm: 'Mese' },
    { area: 'menu', name: 'Gnammm piano Marketing semestrale', net: 45, quantity: 12, vat: 0.22, udm: 'Mese' },
  ],
  grafica_brand: () => [
    { area: 'grafica', name: 'Brand Identity', net: 1200, quantity: 1, vat: 0.22, udm: 'cad', category: 'Grafica' },
    { area: 'grafica', name: 'Logo + manuale uso', net: 600, quantity: 1, vat: 0.22, udm: 'cad', category: 'Grafica' },
  ],
  grafica_locandine: () => [
    { area: 'grafica', name: 'Locandina eventi (pacchetto 10)', net: 300, quantity: 1, vat: 0.22, udm: 'cad', category: 'Grafica' },
  ],
};

// Ogni preventivo: { clientName, days from today, stage, kit, expectedStartOffset }
const PREVENTIVI = [
  { client: 'Bar Centrale Pescara',          signed: -15, stage: 'in_produzione', kit: 'social_growth',    start:  -10, num: '2026-0005' },
  { client: 'Pizzeria Da Mario',             signed: -12, stage: 'firmato',       kit: 'social_visibility',start:    0, num: '2026-0008' },
  { client: 'Pizzeria Da Mario',             signed: -12, stage: 'firmato',       kit: 'menu_marketing',   start:    7, num: '2026-0009' },
  { client: 'Studio Legale Rossi & Bianchi', signed: -22, stage: 'completato',   kit: 'web_corporate',    start:  -18, num: '2026-0003' },
  { client: 'Trattoria Borgo Antico',        signed:  -8, stage: 'in_produzione', kit: 'menu_basic',       start:   -3, num: '2026-0011' },
  { client: 'Trattoria Borgo Antico',        signed:  -8, stage: 'in_produzione', kit: 'social_visibility',start:   -3, num: '2026-0012' },
  { client: 'Fitness Club Energy',           signed:  -5, stage: 'firmato',       kit: 'social_evolution', start:    3, num: '2026-0014' },
  { client: 'Fitness Club Energy',           signed:  -5, stage: 'firmato',       kit: 'grafica_locandine',start:    3, num: '2026-0015' },
  { client: 'Hotel Riviera',                 signed: -18, stage: 'in_produzione', kit: 'web_corporate',    start:  -15, num: '2026-0004' },
  { client: 'Hotel Riviera',                 signed: -10, stage: 'firmato',       kit: 'social_growth',    start:    5, num: '2026-0010' },
  { client: 'Boutique Eleganza',             signed:  -3, stage: 'firmato',       kit: 'social_visibility',start:   10, num: '2026-0017' },
  { client: 'Carrozzeria Vento',             signed: -25, stage: 'completato',   kit: 'grafica_brand',    start:  -20, num: '2026-0002' },
  { client: 'Carrozzeria Vento',             signed: -20, stage: 'in_produzione', kit: 'web_corporate',    start:  -15, num: '2026-0006' },
  { client: 'Beauty Center Aura',            signed:  -7, stage: 'firmato',       kit: 'social_growth',    start:    7, num: '2026-0013' },
  { client: 'Beauty Center Aura',            signed:  -7, stage: 'firmato',       kit: 'menu_basic',       start:    7, num: '2026-0016' },
  { client: 'Studio Architetti Costruire',   signed: -30, stage: 'completato',   kit: 'web_ecommerce',    start:  -25, num: '2026-0001' },
  { client: 'Studio Architetti Costruire',   signed: -10, stage: 'firmato',       kit: 'grafica_brand',    start:    0, num: '2026-0018' },
];

(async () => {
  console.log('▶ Login backend a', BASE);
  const login = await api('POST', '/auth/login', null, { username: 'luigi', password: 'luigi2026' });
  const token = login.token;
  console.log('✓ Loggato come', login.user.username, '(' + login.user.role + ')');

  console.log('\n▶ Creo', CLIENTI.length, 'clienti demo…');
  const clientiByName = new Map();
  for (const c of CLIENTI) {
    const body = Object.assign({}, c, { _demo: true, fromFic: false });
    const r = await api('POST', '/clients', token, body);
    clientiByName.set(c.name, r);
    console.log('  ✓', c.name, '→ syncId', r.syncId);
  }

  console.log('\n▶ Creo', PREVENTIVI.length, 'preventivi demo (stato firmato/in_produzione/completato)…');
  let creati = 0;
  for (const p of PREVENTIVI) {
    const lines = SAMPLE_LINES[p.kit]();
    const totalNet = lines.reduce((s, l) => s + (l.net * (l.quantity || 1)), 0);
    const body = {
      number: p.num,
      date: d(p.signed),
      clientName: p.client,
      status: p.stage === 'completato' ? 'accettato' : (p.stage === 'in_produzione' ? 'inviato' : 'inviato'),
      pipelineStage: p.stage,
      lines,
      notes: '[Cliente demo per test layout Situazione clienti]',
      signedAt: isoNow(p.signed),
      expectedStartDate: d(p.start),
      createdBy: 'luigi',
      _demo: true,
    };
    await api('POST', '/quotes', token, body);
    creati++;
    console.log('  ✓', p.num, '·', p.client, '·', p.kit, '·', p.stage, '· firma', d(p.signed), '· inizio', d(p.start));
  }

  console.log('\n✅ Seed completato:', CLIENTI.length, 'clienti +', creati, 'contratti.');
  console.log('   Apri l\'app → Situazione clienti per vederli (potrebbe servire un F5 o aspettare 15s per il pull).');
  console.log('   Per cancellare TUTTO: node tools/wipe-demo-contracts.js');
})().catch(e => {
  console.error('\n❌ Errore:', e.message);
  process.exit(1);
});
