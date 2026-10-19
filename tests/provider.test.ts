import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProviderChain,
  callProviderChain,
} from '../supabase/functions/_shared/providerChain.ts';
const env: Record<string, string> = {
  GEMINI_API_KEY: 'test-only',
  GEMINI_MODEL: 'gemini-2.5-flash',
  AI_BASE_URL: 'https://example.test/v1',
  AI_API_KEY: 'test-only',
  AI_MODEL: 'gpt-5-mini',
};
(globalThis as any).Deno = { env: { get: (key: string) => env[key] } };
const body = (p: any) => ({
  model: p.model,
  messages: [
    { role: 'system', content: 'Extract invoice' },
    { role: 'user', content: 'Ravi, 3 shirts 200 each' },
  ],
  responseSchema: { type: 'OBJECT', properties: { ok: { type: 'BOOLEAN' } } },
  response_format: { type: 'json_object' },
  ...(p.supportsReasoningEffort ? { reasoning_effort: 'low' } : {}),
});
test('native Gemini uses server header, schema and no thinking; 429 uses fallback', async () => {
  const original = globalThis.fetch;
  const calls: { url: string; body: any; headers: any }[] = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({
      url: String(url),
      body: JSON.parse(String(opts?.body)),
      headers: opts?.headers,
    });
    return calls.length === 1
      ? new Response('', { status: 429 })
      : Response.json({
          choices: [{ message: { content: '```json\n{"ok":true}\n```' } }],
        });
  };
  try {
    const r = await callProviderChain(
      buildProviderChain(),
      body,
      (x) => ((x as any)?.ok === true ? true : null),
      'test',
    );
    assert.equal(r.value, true);
    assert.match(calls[0].url, /:generateContent$/);
    assert.equal(calls[0].headers['x-goog-api-key'], 'test-only');
    assert.equal(
      calls[0].body.generationConfig.responseMimeType,
      'application/json',
    );
    assert.equal(
      calls[0].body.generationConfig.thinkingConfig.thinkingBudget,
      0,
    );
    assert.equal(calls[1].body.reasoning_effort, 'low');
  } finally {
    globalThis.fetch = original;
  }
});
test('provider JSON body timeout aborts and tries the next provider', async () => {
  const original = globalThis.fetch;
  const originalTimer = globalThis.setTimeout;
  let calls = 0;
  let aborted = false;
  (globalThis as any).setTimeout = (fn: any, ms: number) =>
    originalTimer(fn, Math.min(ms, 10));
  globalThis.fetch = async (_url, opts) => {
    calls++;
    if (calls === 1)
      return {
        ok: true,
        json: () =>
          new Promise((_resolve, reject) =>
            opts?.signal?.addEventListener('abort', () => {
              aborted = true;
              reject(new Error('aborted'));
            }),
          ),
      } as Response;
    return Response.json({
      choices: [{ message: { content: '{"ok":true}' } }],
    });
  };
  try {
    const r = await callProviderChain(
      buildProviderChain(),
      body,
      (x) => ((x as any)?.ok === true ? true : null),
      'test',
    );
    assert.equal(aborted, true);
    assert.equal(r.value, true);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = original;
    globalThis.setTimeout = originalTimer;
  }
});
