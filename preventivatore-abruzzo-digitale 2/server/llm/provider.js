/* ============================================================
   LLM PROVIDER — astrazione provider-agnostic
   Tutti i task LLM del Generatore PED passano da qui.
   Domani per aggiungere Claude/Opus basta implementare `anthropic.js`
   con la stessa shape e cambiare 1 riga di config.
   ============================================================ */

const gemini = require('./gemini');

/**
 * Carica la config del provider attivo dal DB.
 * Per ora solo Gemini (Google AI). In futuro: leggere setting
 * `llm_provider` e fare lo switch.
 */
function getActiveProvider(db) {
  // Soft-fail se l'integrazione non c'è: dico subito chi è il problema.
  const row = db.prepare('SELECT configured, config FROM integrations WHERE name = ?').get('google_ai');
  if (!row || !row.configured) {
    return { available: false, reason: 'Google AI non configurato (Integrazioni → Google AI)' };
  }
  let cfg = {};
  try { cfg = JSON.parse(row.config || '{}'); } catch {}
  if (!cfg.api_key) {
    return { available: false, reason: 'API key Gemini mancante (Integrazioni → Google AI → Salva)' };
  }
  return {
    available: true,
    name: 'gemini',
    apiKey: cfg.api_key,
    defaultModel: cfg.model || 'gemini-2.5-flash',
    impl: gemini,
  };
}

/* ===========================================================
   API ESPOSTE — usate dagli endpoint /ped/* del server
   =========================================================== */

/**
 * Test rapido di connessione: chiama il modello con un prompt minimal
 * e verifica che la risposta sia parseable. Usato da /llm/test.
 */
async function testConnection(db) {
  const p = getActiveProvider(db);
  if (!p.available) return { ok: false, reason: p.reason };
  try {
    const r = await p.impl.complete({
      apiKey: p.apiKey,
      model: p.defaultModel,
      system: 'Rispondi sempre in JSON valido.',
      user: 'Rispondi con: {"status":"ok","provider":"gemini"}',
      maxTokens: 60,
      jsonMode: true,
    });
    return { ok: true, provider: p.name, model: p.defaultModel, sample: r.text };
  } catch (e) {
    return { ok: false, reason: 'Errore chiamata: ' + (e.message || String(e)) };
  }
}

/**
 * Estrae i punti chiave da un testo strategia (markdown / plain).
 * Output: { tone, pillars[], target, frequency, warnings[] }
 */
async function extractStrategy(db, strategyText) {
  const p = getActiveProvider(db);
  if (!p.available) throw new Error(p.reason);
  const r = await _callWithLog(p, {
    apiKey: p.apiKey,
    model: p.defaultModel,
    system: `Sei un esperto di marketing digitale italiano. Analizza la strategia social fornita ed estrai i campi richiesti. Rispondi SOLO con un JSON valido nella forma esatta:
{"tone": string, "pillars": string[], "target": string, "frequency": string, "warnings": string[]}
- tone: tone of voice in 1-2 frasi
- pillars: 3-6 pillar tematici di contenuto (es. "Behind the scenes", "Prodotti", "Testimonianze", "Lifestyle locale")
- target: descrizione audience in 1-2 frasi
- frequency: cadenza pubblicazioni in 1 frase
- warnings: 0-3 dettagli mancanti o ambigui

IMPORTANTE: non includere markdown, code blocks, o preamble. Solo JSON puro.`,
    user: 'Strategia da analizzare:\n\n' + (strategyText || '(vuota)'),
    maxTokens: 800,
    jsonMode: true,
  }, 'extractStrategy');
  return safeJson(r.text, { tone: '', pillars: [], target: '', frequency: '', warnings: ['Output non parseable'] }, 'extractStrategy');
}

/**
 * Estrae lo stile dalle slide reference (pagine 13+ del template Canva).
 * Le slide vengono passate come array di stringhe (testo plain di ogni slide).
 * Output: { toneOfVoice, copyLength, structurePattern, emojiUsage, ctaPatterns[], avoidPhrases[] }
 */
async function extractStyleFromSlides(db, slideTexts) {
  const p = getActiveProvider(db);
  if (!p.available) throw new Error(p.reason);
  const slides = (slideTexts || []).filter(Boolean).slice(0, 20); // limit per token
  const r = await p.impl.complete({
    apiKey: p.apiKey,
    model: p.defaultModel,
    system: `Sei un analista di copywriting social italiano. Ti vengono date le slide di un piano editoriale già pubblicato. Estrai lo stile editoriale ricorrente.
Output JSON esatto:
{"toneOfVoice": string, "copyLength": "short|medium|long", "structurePattern": string, "emojiUsage": "none|light|moderate|heavy", "ctaPatterns": string[], "avoidPhrases": string[]}
- toneOfVoice: 1-2 frasi sul tono
- copyLength: lunghezza media post (short <200 char, medium 200-500, long >500)
- structurePattern: pattern ricorrente (es. "hook → claim → CTA", "domanda → benefit → CTA")
- emojiUsage: intensità uso emoji
- ctaPatterns: 2-5 CTA tipiche viste
- avoidPhrases: 0-3 frasi cliché da evitare se notate`,
    user: 'Slide reference (separate da ---):\n\n' + slides.join('\n---\n'),
    maxTokens: 800,
    jsonMode: true,
  });
  return safeJson(r.text, {
    toneOfVoice: 'Caldo, professionale',
    copyLength: 'medium',
    structurePattern: 'hook → claim → CTA',
    emojiUsage: 'light',
    ctaPatterns: [],
    avoidPhrases: [],
  });
}

/**
 * STEP 1 del nuovo flow: PIANIFICA il calendario editoriale del mese.
 * Gemini decide DOVE collocare ogni slot (tipo + pillar + tema + settimana)
 * usando la strategia + la cadenza cliente. NON sceglie ancora i media,
 * solo la struttura logica del piano.
 * Input: { strategy, cadenza, monthLabel, clientName }
 * Output: { slots: [{ slotIndex, type, pillar, theme, weekIndex, suggestedSubject }] }
 */
async function planEditorialCalendar(db, ctx) {
  const p = getActiveProvider(db);
  if (!p.available) throw new Error(p.reason);
  const totSlots = (ctx.cadenza.foto || 0) + (ctx.cadenza.reel || 0) + (ctx.cadenza.carosello || 0);
  const r = await _callWithLog(p, {
    apiKey: p.apiKey,
    model: p.defaultModel,
    system: `Sei un editorial planner italiano senior per ${ctx.clientName || 'il cliente'}. Pianifichi il calendario editoriale social del mese ${ctx.monthLabel}.

Cadenza target: ${ctx.cadenza.foto} post foto + ${ctx.cadenza.reel} reel + ${ctx.cadenza.carosello} caroselli = ${totSlots} slot totali.

Compito: assegna ad OGNI slot un pillar tematico della strategia + un tema specifico + la settimana del mese (1-4) di pubblicazione. Distribuisci i pillar in modo bilanciato (non 5 post sullo stesso pillar di fila). Alterna le settimane.

Output JSON ESATTO:
{"slots": [{"slotIndex": number, "type": "foto"|"reel"|"carosello", "pillar": string, "theme": string, "weekIndex": 1|2|3|4, "suggestedSubject": string, "reasoning": string}]}

- type: rispetta CADENZA (${ctx.cadenza.foto} foto, ${ctx.cadenza.reel} reel, ${ctx.cadenza.carosello} caroselli in tutto)
- pillar: deve venire dalla lista pillars della strategia
- theme: tema specifico per quel pillar (es. "lavorazione del legno", "presentazione prodotto X")
- suggestedSubject: cosa dovrebbe mostrare l'immagine/video (es. "primo piano artigiano al lavoro", "vista esterna stabilimento")
- reasoning: 1 frase sul perché questo post in questa posizione del piano

IMPORTANTE: solo JSON puro, nessun preamble, nessun markdown.`,
    user: `Strategia del cliente:\n${JSON.stringify(ctx.strategy || {}, null, 2)}\n\nGenera i ${totSlots} slot del piano.`,
    maxTokens: 2000,
    jsonMode: true,
  }, 'planEditorialCalendar');
  return safeJson(r.text, { slots: [] }, 'planEditorialCalendar');
}

/**
 * STEP 2: matcha un media reale a uno slot del piano. Usa il nome file e
 * il suggestedSubject del slot per trovare il match migliore nel pool.
 * Per ora matching testuale semplice (parole chiave). In futuro Gemini Vision.
 */
function matchMediaToSlot(slot, pool) {
  if (!pool || !pool.length) return null;
  const subject = String(slot.suggestedSubject || slot.theme || slot.pillar || '').toLowerCase();
  const keywords = subject.split(/\s+/).filter(w => w.length >= 4);
  // Score ogni media: +1 per keyword matchata nel filename
  const scored = pool.map(m => {
    const fname = String(m.name || '').toLowerCase();
    let score = 0;
    for (const kw of keywords) if (fname.includes(kw)) score++;
    return { media: m, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0] ? scored[0].media : pool[0];
}

/**
 * STEP 3: genera copy per UN post, ora con context arricchito (pillar, tema, reasoning).
 * Input: { strategy, style, slot, media, monthLabel, clientName }
 * Output: { headline, body, hashtags[], cta, mediaReasoning }
 *
 * Comportamento errori: se Gemini ritorna testo non parseable, lanciamo un
 * Error che viene catturato da /ped/briefs/generate e finisce in aiErrors —
 * meglio mostrare "errore Gemini" all'operatore che un copy placeholder
 * silenzioso che sembra reale.
 */
async function generatePostCopy(db, ctx) {
  const p = getActiveProvider(db);
  if (!p.available) throw new Error(p.reason);
  const slot = ctx.slot || {};
  const r = await _callWithLog(p, {
    apiKey: p.apiKey,
    model: p.defaultModel,
    system: `Sei un copywriter social senior italiano per ${ctx.clientName || 'il cliente'}. Genera SOLO il copy per UN post foto del PED ${ctx.monthLabel || ''}.

PILLAR DI RIFERIMENTO: ${slot.pillar || 'generico'}
TEMA: ${slot.theme || ''}
SOGGETTO SUGGERITO: ${slot.suggestedSubject || ''}

Vincoli stilistici:
- Tone of voice: ${(ctx.style && ctx.style.toneOfVoice) || 'professionale italiano'}
- Lunghezza: ${(ctx.style && ctx.style.copyLength) || 'medium'}
- Pattern struttura: ${(ctx.style && ctx.style.structurePattern) || 'hook → claim → CTA'}
- Emoji: ${(ctx.style && ctx.style.emojiUsage) || 'light'}

Output JSON ESATTO (no markdown, no preamble):
{"headline": string, "body": string, "hashtags": [string], "cta": string, "mediaReasoning": string}

- headline: prima riga forte (max 100 char), coerente col pillar
- body: testo principale post coerente con tema e tone (2-5 frasi)
- hashtags: 5-10 hashtag senza #, mix brand + tematici
- cta: 1 CTA breve allineata al pillar
- mediaReasoning: 1 frase sul perché questo media è adatto a questo slot`,
    user: `Strategia del cliente:\n${JSON.stringify(ctx.strategy || {}, null, 2)}\n\nMedia scelto per questo slot: "${(ctx.media && ctx.media.name) || 'foto generica'}" (dalla cartella ${(ctx.media && ctx.media.sourceFolder) || ''})`,
    maxTokens: 1500,                          // ⬆ era 700: troppo poco per JSON con body+hashtags+cta+reasoning
    jsonMode: true,
  }, 'generatePostCopy');
  const parsed = safeJsonStrict(r.text, ['headline', 'body'], 'generatePostCopy');
  // safeJsonStrict throw se parse fallisce o se mancano i campi obbligatori
  // (così l'errore è VISIBILE in aiErrors, non sepolto in un fallback "placeholder")
  return {
    headline: parsed.headline || '',
    body: parsed.body || '',
    hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : [],
    cta: parsed.cta || '',
    mediaReasoning: parsed.mediaReasoning || '',
  };
}

/**
 * Genera concept + caption per UN reel.
 * Output: { concept, hook, caption, hashtags[], soundtype }
 */
async function generateReelCaption(db, ctx) {
  const p = getActiveProvider(db);
  if (!p.available) throw new Error(p.reason);
  const slot = ctx.slot || {};
  const r = await _callWithLog(p, {
    apiKey: p.apiKey,
    model: p.defaultModel,
    system: `Sei un creator strategist italiano per Instagram/TikTok reel. Genera il pacchetto creativo per UN reel del PED ${ctx.monthLabel || ''} di ${ctx.clientName || 'il cliente'}.

PILLAR DI RIFERIMENTO: ${slot.pillar || 'generico'}
TEMA: ${slot.theme || ''}
SOGGETTO SUGGERITO: ${slot.suggestedSubject || ''}
Tone: ${(ctx.style && ctx.style.toneOfVoice) || 'professionale'}

Output JSON ESATTO (no markdown, no preamble):
{"concept": string, "hook": string, "caption": string, "hashtags": [string], "soundtype": string, "mediaReasoning": string}

- concept: idea reel in 1-2 frasi coerente col pillar
- hook: prime 2-3 secondi (max 80 char, deve trattenere)
- caption: caption Instagram (medium-long), coerente col tema
- hashtags: 5-10 hashtag senza #
- soundtype: "audio trend"|"voiceover"|"musica originale"|"silenzio + testo"
- mediaReasoning: 1 frase sul perché questo media è adatto a questo slot`,
    user: `Strategia:\n${JSON.stringify(ctx.strategy || {}, null, 2)}\n\nMedia scelto per questo slot: "${(ctx.media && ctx.media.name) || 'reel del brand'}" (dalla cartella ${(ctx.media && ctx.media.sourceFolder) || ''})`,
    maxTokens: 1500,                                                                      // ⬆ era 700
    jsonMode: true,
  }, 'generateReelCaption');
  const parsed = safeJsonStrict(r.text, ['concept', 'caption'], 'generateReelCaption');
  return {
    concept: parsed.concept || '',
    hook: parsed.hook || '',
    caption: parsed.caption || '',
    hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : [],
    soundtype: parsed.soundtype || '',
    mediaReasoning: parsed.mediaReasoning || '',
  };
}

// ---- helpers ----

/**
 * Variante STRICT: throw se non riesce a parsare o se mancano campi obbligatori.
 * Usata per generatePostCopy/generateReelCaption: meglio errore visibile in aiErrors
 * che un fallback placeholder che sembra un copy reale.
 */
function safeJsonStrict(text, requiredFields, label) {
  if (!text || !String(text).trim()) {
    throw new Error(`${label || 'safeJsonStrict'}: Gemini ha risposto VUOTO (possibile blocco safety o finishReason MAX_TOKENS)`);
  }
  let cleaned = String(text).trim();
  cleaned = cleaned.replace(/^```(?:json|JSON)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
  let parsed = null;
  try { parsed = JSON.parse(cleaned); } catch {}
  if (!parsed || typeof parsed !== 'object') {
    // Tentativo balanced-brace
    let depth = 0, start = -1, end = -1;
    for (let i = 0; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (ch === '{') { if (depth === 0) start = i; depth++; }
      else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (start >= 0 && end > start) {
      try { parsed = JSON.parse(cleaned.slice(start, end + 1)); } catch (e) {
        console.log(`[llm.${label}] parse fallito su slice:`, e.message, '— raw:', cleaned.slice(0, 500));
      }
    }
  }
  if (!parsed || typeof parsed !== 'object') {
    console.log(`[llm.${label}] raw (500 char):`, cleaned.slice(0, 500));
    throw new Error(`${label || 'safeJsonStrict'}: risposta Gemini non parseable come JSON (raw: "${cleaned.slice(0, 120)}…")`);
  }
  if (Array.isArray(requiredFields)) {
    const missing = requiredFields.filter(f => !parsed[f] || (typeof parsed[f] === 'string' && !parsed[f].trim()));
    if (missing.length) {
      throw new Error(`${label || 'safeJsonStrict'}: JSON parsato ma mancano campi obbligatori [${missing.join(', ')}] — keys ritornate: [${Object.keys(parsed).join(', ')}]`);
    }
  }
  return parsed;
}

function safeJson(text, fallback, label) {
  if (!text) {
    console.log(`[llm.safeJson] ${label || ''}: testo vuoto → fallback`);
    return fallback;
  }
  let cleaned = String(text).trim();
  // Strip markdown code blocks (```json ... ``` o ``` ... ```)
  cleaned = cleaned.replace(/^```(?:json|JSON)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
  // Tentativo 1: parse diretto
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {}
  // Tentativo 2: prima coppia di { ... } bilanciate (greedy)
  let depth = 0, start = -1, end = -1;
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch === '{') { if (depth === 0) start = i; depth++; }
    else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (start >= 0 && end > start) {
    const slice = cleaned.slice(start, end + 1);
    try { return JSON.parse(slice); } catch (e) {
      console.log(`[llm.safeJson] ${label || ''}: parse fallito su slice ${slice.length} char:`, e.message);
    }
  }
  console.log(`[llm.safeJson] ${label || ''}: nessun JSON valido → fallback. Raw text (primi 500 char):`, cleaned.slice(0, 500));
  return fallback;
}

// Wrapper per chiamare gemini con log dettagliato + intercetta truncation/safety
async function _callWithLog(p, opts, label) {
  console.log(`[llm.${label}] → modello: ${opts.model}, maxTok=${opts.maxTokens}, prompt user (primi 200): ${(opts.user || '').slice(0, 200)}`);
  try {
    const r = await p.impl.complete(opts);
    // Estrai finishReason e safety dal raw (utile per debugging copy mancanti)
    const finishReason = r.raw && r.raw.candidates && r.raw.candidates[0] && r.raw.candidates[0].finishReason;
    const safetyRatings = r.raw && r.raw.candidates && r.raw.candidates[0] && r.raw.candidates[0].safetyRatings;
    const usage = r.usage || (r.raw && r.raw.usageMetadata);
    console.log(`[llm.${label}] ← finishReason=${finishReason}, usage=${JSON.stringify(usage || {})}, text(400): ${(r.text || '').slice(0, 400)}`);
    // Se Gemini ha troncato per MAX_TOKENS → JSON quasi sicuramente rotto a metà.
    // Throw qui così il chiamante lo riporta come errore visibile in aiErrors.
    if (finishReason === 'MAX_TOKENS') {
      throw new Error(`${label}: risposta troncata da Gemini (finishReason=MAX_TOKENS). Aumenta maxTokens.`);
    }
    if (finishReason === 'SAFETY') {
      const blocked = (safetyRatings || []).filter(s => s.blocked).map(s => s.category).join(', ');
      throw new Error(`${label}: bloccata da Gemini safety filter (${blocked || 'unknown category'})`);
    }
    if (finishReason === 'RECITATION') {
      throw new Error(`${label}: bloccata da Gemini per recitation (output troppo simile a training data)`);
    }
    return r;
  } catch (e) {
    console.error(`[llm.${label}] ✗ errore:`, e.message);
    throw e;
  }
}

module.exports = {
  getActiveProvider,
  testConnection,
  extractStrategy,
  extractStyleFromSlides,
  planEditorialCalendar,
  matchMediaToSlot,
  generatePostCopy,
  generateReelCaption,
};
