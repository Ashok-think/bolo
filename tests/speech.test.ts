import test from 'node:test';
import assert from 'node:assert/strict';
import { startListenSession } from '../src/lib/speech.ts';
class Clock {
  now = 0;
  id = 0;
  jobs = new Map<number, { at: number; fn: () => void }>();
  setTimeout = (fn: () => void, ms: number) => {
    const id = ++this.id;
    this.jobs.set(id, { at: this.now + ms, fn });
    return id;
  };
  clearTimeout = (id: number) => {
    this.jobs.delete(id);
  };
  tick(ms: number) {
    const end = this.now + ms;
    for (;;) {
      const next = [...this.jobs.entries()]
        .filter(([, j]) => j.at <= end)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      this.jobs.delete(next[0]);
      this.now = next[1].at;
      next[1].fn();
    }
    this.now = end;
  }
}
class Recognition {
  static all: Recognition[] = [];
  lang = '';
  continuous = false;
  interimResults = false;
  onstart: any = null;
  onresult: any = null;
  onerror: any = null;
  onend: any = null;
  aborted = false;
  constructor() {
    Recognition.all.push(this);
  }
  start() {
    this.onstart?.();
  }
  stop() {}
  abort() {
    this.aborted = true;
  }
  result(text: string, final = false) {
    this.onresult?.({
      resultIndex: 0,
      results: [Object.assign([{ transcript: text }], { isFinal: final })],
    });
  }
}
function setup() {
  Recognition.all = [];
  const clock = new Clock();
  (globalThis as any).window = {
    SpeechRecognition: Recognition,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
  };
  let text = '';
  const finishes: string[] = [];
  const session = startListenSession('en', {
    onTranscript: (t) => {
      text = t;
    },
    onStateChange: () => {},
    onError: () => {},
    onFinish: (t) => finishes.push(t),
  })!;
  return {
    clock,
    session,
    get text() {
      return text;
    },
    finishes,
  };
}
test('two-second pause does not end; 3.5 seconds silence ends once', () => {
  const c = setup();
  Recognition.all[0].result('Ravi three shirts', true);
  c.clock.tick(2000);
  assert.equal(c.finishes.length, 0);
  Recognition.all[0].result('Ravi three shirts 200 each', true);
  c.clock.tick(3499);
  assert.equal(c.finishes.length, 0);
  c.clock.tick(1);
  assert.deepEqual(c.finishes, ['Ravi three shirts 200 each']);
});
test('interim replaces in place; restart keeps each segment once', () => {
  const c = setup();
  const r = Recognition.all[0];
  assert.equal(r.continuous, true);
  assert.equal(r.interimResults, true);
  r.result('Ravi');
  r.result('Ravi three shirts');
  r.result('Ravi three shirts', true);
  r.onend();
  c.clock.tick(150);
  Recognition.all[1].result('200 each');
  Recognition.all[1].result('200 each', true);
  assert.equal(c.text, 'Ravi three shirts 200 each');
  c.session.stop();
  assert.deepEqual(c.finishes, ['Ravi three shirts 200 each']);
});
test('cancel aborts recognition, clears timers and never submits', () => {
  const c = setup();
  const r = Recognition.all[0];
  r.result('Ravi');
  c.session.cancel();
  assert.equal(r.aborted, true);
  c.clock.tick(5000);
  assert.equal(c.finishes.length, 0);
  assert.equal(Recognition.all.length, 1);
});
test('finishing phrase ends final speech and is not an invoice item', () => {
  const c = setup();
  Recognition.all[0].result('Ravi three shirts done', true);
  assert.deepEqual(c.finishes, ['Ravi three shirts']);
});

test('fatal microphone error ends session and cannot restart itself', () => {
  const c = setup();
  Recognition.all[0].onerror({ error: 'not-allowed' });
  assert.equal(c.session.active, false);
  c.clock.tick(5000);
  assert.equal(Recognition.all.length, 1);
  assert.deepEqual(c.finishes, ['']);
});

test('Android growing snapshots at successive indexes do not multiply words', () => {
  const c = setup();
  const r = Recognition.all[0];
  const snapshots = ['Ravi', 'Ravi', 'Ravi bought', 'Ravi bought shirts', 'Ravi bought shirts', 'Ravi bought shirts 200 each', 'Ravi bought shirts 200 each'];
  r.onresult({ resultIndex: 0, results: snapshots.map(transcript =>
    Object.assign([{ transcript }], { isFinal: true })) });
  assert.equal(c.text, 'Ravi bought shirts 200 each');
  c.session.stop();
  assert.deepEqual(c.finishes, ['Ravi bought shirts 200 each']);
});

test('revised shrinking results remove stale interims without deleting spoken repetitions', () => {
  const c = setup();
  const r = Recognition.all[0];
  r.onresult({ resultIndex: 0, results: ['Ravi', 'wrong words'].map(transcript =>
    Object.assign([{ transcript }], { isFinal: false })) });
  r.result('Ravi three shirts', true);
  assert.equal(c.text, 'Ravi three shirts');
  r.result('Ravi Ravi three shirts', true);
  assert.equal(c.text, 'Ravi Ravi three shirts');
  r.onresult({ resultIndex: 0, results: ['one shirt 200', 'one shirt 200'].map(transcript =>
    Object.assign([{ transcript }], { isFinal: true })) });
  assert.equal(c.text, 'one shirt 200 one shirt 200');
  c.session.cancel();
});
