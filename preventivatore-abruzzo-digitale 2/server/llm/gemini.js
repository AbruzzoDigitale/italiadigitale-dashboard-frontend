/* ============================================================
   GEMINI ADAPTER — implementazione provider.js per Google AI Studio
   API key autenticata (no OAuth). Endpoint REST stabile.
   Docs: https://ai.google.dev/api/generate-content
   ============================================================ */

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Chiamata generica completion-style.
 * @param {Object} opts
 * @param {string} opts.apiKey     Gemini API key (AIza...)
 * @param {string} opts.model      Es. 'gemini-2.5-flash' o 'gemini-2.5-pro'
 * @param {string} opts.system     System instruction
 * @param {string} opts.user       User prompt
 * @param {number} opts.maxTokens  Limit output token (default 1024)
 * @param {boolean} opts.jsonMode  Forza risposta JSON (responseMimeType)
 * @returns {Promise<{text: string, raw: any, usage: any}>}
 */
async function complete(opts) {
  if (!opts.apiKey) throw new Error('Gemini: api_key mancante');
  const model = opts.model || 'gemini-2.5-flash';

  const generationConfig = {
    maxOutputTokens: opts.maxTokens || 1024,
    temperature: opts.temperature != null ? opts.temperature : 0.7,
  };
  if (opts.jsonMode) {
    generationConfig.responseMimeType = 'application/json';
  }

  const body = {
    systemInstruction: opts.system ? { parts: [{ text: opts.system }] } : undefined,
    contents: [{ role: 'user', parts: [{ text: opts.user || '' }] }],
    generationConfig,
  };

  const url = `${BASE_URL}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(opts.apiKey)}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = (json && json.error && json.error.message) || `HTTP ${r.status}`;
    throw new Error('Gemini API: ' + msg);
  }
  const text = (json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts &&
                json.candidates[0].content.parts[0] && json.candidates[0].content.parts[0].text) || '';
  return { text, raw: json, usage: json.usageMetadata };
}

module.exports = { complete };
