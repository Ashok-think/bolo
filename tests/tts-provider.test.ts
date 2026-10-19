import test from 'node:test';
import assert from 'node:assert/strict';
import {generateVoice} from '../supabase/functions/_shared/tts.ts';
test('3.8 TTS uses verbatim text, metadata and explicit raw PCM', async () => {
  const original = globalThis.fetch;
  let url = '', request: any;
  globalThis.fetch = async (u, opts) => {
    url = String(u); request = JSON.parse(String(opts?.body));
    return Response.json({steps:[{type:'model_output',content:[{type:'audio',data:'AAAA'}]}]});
  };
  try {
    const audio = await generateVoice('test-only','gemini-3.8-flash-lite-tts','నమస్కారం',new AbortController().signal);
    assert.match(url,/\/interactions$/);
    assert.equal(request.input[0].content[0].text,'నమస్కారం');
    assert.equal(request.input[0].content[0].annotations[0].type,'speech_metadata');
    assert.equal(request.response_format.mime_type,'audio/l16');
    assert.equal(request.response_format.sample_rate,24000);
    assert.deepEqual(audio,{pcm:'AAAA',sampleRate:24000});
  } finally {globalThis.fetch=original;}
});
test('legacy TTS remains compatible with existing keys', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async u => {
    assert.match(String(u),/:generateContent$/);
    return Response.json({candidates:[{content:{parts:[{inlineData:{data:'AAAA'}}]}}]});
  };
  try {
    assert.equal((await generateVoice('test-only','gemini-2.5-flash-preview-tts','Hello',new AbortController().signal)).pcm,'AAAA');
  } finally {globalThis.fetch=original;}
});
