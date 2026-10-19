import { authorizeAI, corsHeaders, json } from '../_shared/ai.ts';
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
      Deno.env.get('GEMINI_TTS_MODEL') || 'gemini-2.5-flash-preview-tts';
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 7000);
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': key,
          },
          signal: abort.signal,
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `Read warmly and naturally in the language of this text: ${text}`,
                  },
                ],
              },
            ],
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
              },
            },
          }),
        },
      );
      if (!res.ok)
        return json(503, {
          error:
            res.status === 429
              ? 'Gemini voice quota reached'
              : 'Gemini voice unavailable',
        });
      const data = await res.json();
      const audio = data?.candidates?.[0]?.content?.parts?.find(
        (p: { inlineData?: unknown }) => p.inlineData,
      )?.inlineData;
      if (typeof audio?.data !== 'string')
        return json(503, { error: 'No audio returned' });
      return json(200, { pcm: audio.data, sampleRate: 24000 });
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return json(503, { error: 'Gemini voice unavailable' });
  }
});
