import test from 'node:test';
import assert from 'node:assert/strict';
const synth = {
  getVoices: () => [{ lang: 'en-IN' }],
  cancel: () => {},
  speak: (_u: any) => {},
};
(globalThis as any).window = {
  speechSynthesis: synth,
  addEventListener: () => {},
};
(globalThis as any).document = { addEventListener: () => {}, hidden: false };
(globalThis as any).SpeechSynthesisUtterance = class {
  constructor(public text: string) {}
  lang = '';
};
const { speakAsync, stopSpeaking, setMicOpen } =
  await import('../src/lib/voiceFeedback.ts');
test('cancel settles the pending speech promise even without engine callbacks', async () => {
  const pending = speakAsync('Hello', 'en');
  stopSpeaking();
  assert.equal(await pending, false);
});
test('missing local language voice degrades to text', async () => {
  assert.equal(await speakAsync('నమస్కారం', 'te'), false);
});
test('no speech output while microphone is open', async () => {
  setMicOpen(true);
  assert.equal(await speakAsync('Hello', 'en'), false);
  setMicOpen(false);
});
