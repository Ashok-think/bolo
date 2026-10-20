// Rebundle authenticated AI access without app daily caps.
// Rebundle model-specific thinking: minimal on Flash-Lite; low on Gemini 3.8.
import { authorizeAI, corsHeaders, json } from '../_shared/ai.ts';
import {
  buildProviderChain,
  callProviderChain,
} from '../_shared/providerChain.ts';
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS')
    return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });
  try {
    const auth = await authorizeAI(req, 'health');
    if (auth.error) return auth.error;
    const configured = buildProviderChain();
    const results = await Promise.all(
      ['gemini', 'openai-compatible'].map(async (name) => {
        const p = configured.find((p) => p.name === name);
        if (!p)
          return { name, ok: false, reason: 'Not configured in Bolt secrets' };
        const r = await callProviderChain(
          [p],
          (p) => ({
            model: p.model,
            messages: [
              { role: 'system', content: 'Return JSON {"ok":true} only.' },
              { role: 'user', content: 'Check' },
            ],
            responseSchema: {
              type: 'OBJECT',
              properties: { ok: { type: 'BOOLEAN' } },
              required: ['ok'],
            },
            response_format: { type: 'json_object' },
            temperature: 0,
          }),
          (x) =>
            x && typeof x === 'object' && (x as { ok?: unknown }).ok === true
              ? true
              : null,
          'ai-health',
        );
        return {
          name,
          ok: r.value === true,
          reason: r.value ? 'Ready' : r.reason || 'Unavailable',
        };
      }),
    );
    return json(200, {
      providers: results,
      voiceConfigured: !!Deno.env.get('GEMINI_API_KEY'),
    });
  } catch {
    return json(500, { error: 'AI check unavailable' });
  }
});
