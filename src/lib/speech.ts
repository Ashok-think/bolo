import { SPEECH_LOCALES } from './format';
import type { Language } from './types';

export const SILENCE_FINISH_MS = 3500;
export const RESTART_DELAY_MS = 150;

const FINISH_PHRASES = [
  'done',
  "that's all",
  'thats all',
  'bas',
  'ho gaya',
  'ayipoyindi',
  'అయిపోయింది',
];

export type ListenState = 'listening' | 'still-listening' | 'stopped';
export type FinishReason = 'silence' | 'done' | 'phrase' | 'error';

export interface ListenCallbacks {
  onTranscript: (text: string) => void;
  onStateChange: (state: ListenState) => void;
  onFinish: (text: string, reason: FinishReason) => void;
  onError: (code: string) => void;
}

export interface ListenSession {
  /** Finish the turn now (Done button / tap), keeping the transcript. */
  stop: () => void;
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

/**
 * Long-running listening turn: continuous recognition with interim results,
 * auto-restart when the browser cuts the session, a 3.5s silence finisher,
 * spoken finish phrases, and a manual Done stop. The transcript accumulates
 * from all results without losing or duplicating words.
 */
export function startListenSession(
  language: Language,
  callbacks: ListenCallbacks
): ListenSession | null {
  const Ctor = getRecognitionCtor();
  if (!Ctor) return null;

  let active = true; // session (turn) is still open
  let restartTimer: number | null = null;
  let silenceTimer: number | null = null;

  const finals = new Map<number, string>();
  const interims = new Map<number, string>();
  let lastText = '';

  function composeText(): string {
    const parts: string[] = [];
    const sizes = Math.max(finals.size, interims.size);
    for (let i = 0; i < Math.max(sizes, 0); i++) {
      const f = finals.get(i);
      if (f !== undefined) parts.push(f);
      else {
        const it = interims.get(i);
        if (it !== undefined) parts.push(it);
      }
    }
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }

  function clearSilence() {
    if (silenceTimer !== null) {
      window.clearTimeout(silenceTimer);
      silenceTimer = null;
    }
  }

  function armSilence() {
    clearSilence();
    silenceTimer = window.setTimeout(() => {
      if (active) finish(composeText(), 'silence');
    }, SILENCE_FINISH_MS);
  }

  function finish(text: string, reason: FinishReason) {
    if (!active) return;
    active = false;
    clearSilence();
    if (restartTimer !== null) {
      window.clearTimeout(restartTimer);
      restartTimer = null;
    }
    callbacks.onStateChange('stopped');
    try {
      rec.stop();
    } catch {
      // ignore
    }
    callbacks.onFinish(text, reason);
  }

  function restart() {
    if (!active) return;
    restartTimer = window.setTimeout(() => {
      restartTimer = null;
      if (!active) return;
      try {
        rec.start();
      } catch {
        // start() can throw if the engine still considers itself running;
        // try once more on the next end event.
      }
    }, RESTART_DELAY_MS);
  }

  const rec = new Ctor();
  rec.lang = SPEECH_LOCALES[language];
  rec.continuous = true;
  rec.interimResults = true;

  rec.onresult = (e) => {
    if (!active) return;
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const result = e.results[i];
      const transcript = result[0]?.transcript ?? '';
      if (result.isFinal) {
        interims.delete(i);
        finals.set(i, transcript);
      } else {
        interims.set(i, transcript);
      }
    }

    const text = composeText();
    if (text !== lastText) {
      lastText = text;
      callbacks.onTranscript(text);
      callbacks.onStateChange('still-listening');
      armSilence(); // reset the silence clock on every new word
    }

    // Spoken finish phrase ends the turn immediately.
    const lower = text.toLowerCase();
    for (const phrase of FINISH_PHRASES) {
      if (lower.endsWith(phrase)) {
        const stripped = text.slice(0, text.length - phrase.length).replace(/\s+$/, '');
        callbacks.onTranscript(stripped);
        finish(stripped, 'phrase');
        return;
      }
    }
  };

  rec.onerror = (e) => {
    if (!active) return;
    if (FATAL_ERRORS.has(e.error)) {
      callbacks.onError(e.error);
      finish(lastText, 'error');
      return;
    }
    // 'no-speech', 'network', 'aborted' — onend will restart and keep going.
  };

  rec.onend = () => {
    if (!active) return;
    // Browser ended recognition on its own; restart and keep the transcript.
    restart();
  };

  try {
    rec.start();
  } catch {
    return null;
  }

  callbacks.onStateChange('listening');
  armSilence();

  return {
    stop() {
      finish(lastText, 'done');
    },
  };
}
