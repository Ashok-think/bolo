import { authorizeAI, corsHeaders, json } from '../_shared/ai.ts';
import { generateVoice } from '../_shared/tts.ts';
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS')
    return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });
  try {
    const body = await req.json();
    const text =
      typeof body.text === 'string' ? body.text.trim().slice(0, 400) : '';
    if (!text) return json(400, { error: 'Nothing to speak' });
    const auth = await authorizeAI(req, body.lang);
    if (auth.error) return auth.error;
    const key = Deno.env.get('GEMINI_API_KEY');
    if (!key) return json(503, { error: 'Gemini voice is not configured' });
    const model =
      Deno.env.get('GEMINI_TTS_MODEL') || 'gemini-3.8-flash-lite-tts';
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 9000);
    try {
      return json(200, await generateVoice(key, model, text, abort.signal));
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return json(503, { error: 'Gemini voice unavailable' });
  }
});
