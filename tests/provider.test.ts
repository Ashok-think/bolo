import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProviderChain,
  buildTextProviderChain,
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

test('explicit Re-read uses compatible directly; normal parsing keeps Gemini first', async () => {
  const providers = buildTextProviderChain('openai-compatible');
  assert.deepEqual(buildTextProviderChain().map(p => p.name), ['gemini', 'openai-compatible']);
  assert.deepEqual(providers.map((p) => p.name), ['openai-compatible']);
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({choices: [{message: {content: '{"ok":true}'}}]});
  };
  try {
    const r = await callProviderChain(providers, body, x => (x as any)?.ok ? true : null, 'billing');
    assert.equal(r.providerName, 'openai-compatible');
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});
test('Qwen3.8 Omni uses text-only JSON mode with thinking disabled', async () => {
  const original = globalThis.fetch;
  let request: any;
  globalThis.fetch = async (_url, opts) => {
    request = JSON.parse(String(opts?.body));
    return Response.json({choices: [{message: {content: '{"ok":true}'}}]});
  };
  try {
    const p = {...buildTextProviderChain('openai-compatible')[0], model:'qwen3.8-omni-flash'};
    const r = await callProviderChain([p], body, x => (x as any)?.ok ? true : null, 'qwen');
    assert.equal(r.value, true);
    assert.deepEqual(request.modalities, ['text']);
    assert.equal(request.reasoning_effort, 'none');
    assert.equal(request.stream, false);
    assert.deepEqual(request.response_format, {type:'json_object'});
    assert.equal(request.responseSchema, undefined);
  } finally { globalThis.fetch = original; }
});

test('Gemini 3.8 uses supported low thinking, never minimal', async () => {
  const original = globalThis.fetch;
  let request: any;
  globalThis.fetch = async (_url, opts) => {
    request = JSON.parse(String(opts?.body));
    return Response.json({candidates:[{content:{parts:[{text:'{"ok":true}'}]}}]});
  };
  try {
    const p = {...buildProviderChain()[0], model:'gemini-3.8-flash'};
    const r = await callProviderChain([p], body, x => (x as any)?.ok ? true : null, 'gemini-3.8');
    assert.equal(r.value, true);
    assert.equal(request.generationConfig.thinkingConfig.thinkingLevel, 'low');
  } finally {globalThis.fetch = original;}
});
