import { SPEECH_LOCALES } from './format';
import type { Language } from './types';

export const SILENCE_FINISH_MS = 3500;
export const RESTART_DELAY_MS = 150;

export type ListenState = 'listening' | 'still-listening' | 'stopped';
export type FinishReason = 'silence' | 'done' | 'phrase' | 'error';

export interface ListenCallbacks {
  onTranscript: (text: string) => void;
  onStateChange: (state: ListenState) => void;
  onFinish: (text: string, reason: FinishReason) => void;
  onError: (code: string) => void;
}

export interface ListenSession {
  readonly active: boolean;
  stop: () => void;
  cancel: () => void;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
  resultIndex: number;
}

interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

type RecognitionCtor = new () => RecognitionLike;

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechSupported(): boolean {
  return getRecognitionCtor() !== null;
}

const FATAL_ERRORS = new Set([
  'not-allowed',
  'service-not-allowed',
  'audio-capture',
  'language-not-supported',
  'language-not-available',
]);

/** Browser-only speech session. Each browser restart gets a fresh result map;
 * final words are committed once and interim words replace in place. */
export function startListenSession(
  language: Language,
  callbacks: ListenCallbacks,
): ListenSession | null {
  const Ctor = getRecognitionCtor();
  if (!Ctor) return null;

  let active = true;
  let restartTimer: number | null = null;
  let silenceTimer: number | null = null;
  let committed = '';
  let recognition: RecognitionLike | null = null;
  let finals = new Map<number, string>();
  let interims = new Map<number, string>();
  let lastText = '';

  const composeSegment = () => {
    const keys = [...new Set([...finals.keys(), ...interims.keys()])].sort(
      (a, b) => a - b,
    );
    const parts = keys
      .map((i) => finals.get(i) ?? interims.get(i) ?? '')
      .filter(Boolean);
    const chunks: string[] = [];
    let growingSnapshots = false;
    const normal = (s: string) => s.toLocaleLowerCase().replace(/\s+/g, ' ').trim();
    for (const part of parts) {
      // Some Android engines put growing snapshots at successive result indexes:
      // "Ravi", "Ravi", "Ravi bought", "Ravi bought shirts".
      // Replace that growing prefix rather than billing it multiple times.
      const previous = chunks[chunks.length - 1];
      if (growingSnapshots && previous && normal(part) === normal(previous)) continue;
      if (previous && normal(part).startsWith(normal(previous) + ' ')) {
        growingSnapshots = true;
        const prefix = normal(previous);
        do { chunks.pop(); } while (chunks.length && normal(chunks[chunks.length - 1]) === prefix);
      } else if (previous && normal(part) !== normal(previous)) growingSnapshots = false;
      chunks.push(part);
    }
    return chunks.join(' ');
  };
  const composeText = () =>
    [committed, composeSegment()]
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  const clearSilence = () => {
    if (silenceTimer !== null) window.clearTimeout(silenceTimer);
    silenceTimer = null;
  };
  const armSilence = () => {
    clearSilence();
    silenceTimer = window.setTimeout(
      () => finish(composeText(), 'silence'),
      SILENCE_FINISH_MS,
    );
  };
  const publish = (state: ListenState = 'still-listening') => {
    const text = composeText();
    if (text !== lastText) {
      lastText = text;
      callbacks.onTranscript(text);
    }
    callbacks.onStateChange(state);
  };
  const cleanup = () => {
    active = false;
    clearSilence();
    if (restartTimer !== null) window.clearTimeout(restartTimer);
    restartTimer = null;
    if (recognition) {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.onstart = null;
      try {
        recognition.abort();
      } catch {
        /* already stopped */
      }
    }
  };
  const finish = (text: string, reason: FinishReason) => {
    if (!active) return;
    cleanup();
    callbacks.onStateChange('stopped');
    callbacks.onFinish(text.trim(), reason);
  };
  const startRecognition = () => {
    if (!active) return;
    const rec = new Ctor();
    recognition = rec;
    finals = new Map();
    interims = new Map();
    rec.lang = SPEECH_LOCALES[language] ?? 'en-IN';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onstart = () => {
      if (active) {
        callbacks.onStateChange('listening');
        if (silenceTimer === null) armSilence();
      }
    };
    rec.onresult = (event) => {
      if (!active || recognition !== rec) return;
      // results is the complete current snapshot. Rebuild so a shrinking or
      // revised interim list cannot leave stale words at old indexes.
      finals.clear();
      interims.clear();
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        const wordText = result[0]?.transcript?.trim() ?? '';
        if (result.isFinal) {
          interims.delete(i);
          if (wordText) finals.set(i, wordText);
        } else if (wordText) {
          interims.set(i, wordText);
        } else {
          interims.delete(i);
        }
      }
      publish();
      armSilence();
      const finalResult = event.results[event.results.length - 1];
      const ending = composeText().match(
        /(?:^|\s)(done|that's all|thats all|bas|ho gaya|ayipoyindi|అయిపోయింది)[.!]?$/iu,
      );
      if (finalResult?.isFinal && ending) {
        const text = composeText().slice(0, ending.index).trim();
        callbacks.onTranscript(text);
        finish(text, 'phrase');
      }
    };
    rec.onerror = (event) => {
      if (!active || recognition !== rec) return;
      callbacks.onError(event.error);
      if (FATAL_ERRORS.has(event.error)) finish(composeText(), 'error');
    };
    rec.onend = () => {
      if (!active || recognition !== rec) return;
      const segmentPart = composeSegment();
      if (segmentPart)
        committed = [committed, segmentPart]
          .filter(Boolean)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
      finals.clear();
      interims.clear();
      publish('listening');
      restartTimer = window.setTimeout(() => {
        restartTimer = null;
        if (active) startRecognition();
      }, RESTART_DELAY_MS);
    };
    try {
      // Called synchronously from the mic click handler for the initial engine start.
      rec.start();
    } catch {
      if (recognition === rec) recognition = null;
      callbacks.onError('start-failed');
      if (committed) finish(committed, 'error');
      else finish('', 'error');
    }
  };

  startRecognition();
  if (active) callbacks.onStateChange('listening');

  return {
    get active() {
      return active;
    },
    stop() {
      finish(composeText(), 'done');
    },
    cancel() {
      if (active) {
        cleanup();
        callbacks.onStateChange('stopped');
      }
    },
  };
}
