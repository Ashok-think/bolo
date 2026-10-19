import { SPEECH_LOCALES } from './format';
import type { Language } from './types';

export const SILENCE_FINISH_MS = 3500;
export const RESTART_DELAY_MS = 150;

export type ListenState = 'listening' | 'still-listening' | 'stopped';
export type FinishReason = 'silence' | 'done' | 'error';

export interface ListenCallbacks {
  onTranscript: (text: string) => void;
  onStateChange: (state: ListenState) => void;
  onFinish: (text: string, reason: FinishReason) => void;
  onError: (code: string) => void;
}

export interface ListenSession {
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
  'not-allowed', 'service-not-allowed', 'audio-capture',
  'language-not-supported', 'language-not-available',
]);

/** Browser-only speech session. Each browser restart gets a fresh result map;
 * final words are committed once and interim words replace in place. */
export function startListenSession(
  language: Language,
  callbacks: ListenCallbacks
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
    const keys = [...new Set([...finals.keys(), ...interims.keys()])].sort((a, b) => a - b);
    return keys.map((i) => finals.get(i) ?? interims.get(i) ?? '').filter(Boolean).join(' ');
  };
  const composeText = () => [committed, composeSegment()].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  const clearSilence = () => {
    if (silenceTimer !== null) window.clearTimeout(silenceTimer);
    silenceTimer = null;
  };
  const armSilence = () => {
    clearSilence();
    silenceTimer = window.setTimeout(() => finish(composeText(), 'silence'), SILENCE_FINISH_MS);
  };
  const publish = (state: ListenState = 'still-listening') => {
    const text = composeText();
    if (text !== lastText) {
      lastText = text;
      callbacks.onTranscript(text);
    }
    callbacks.onStateChange(state);
  };
  const finish = (text: string, reason: FinishReason) => {
    if (!active) return;
    active = false;
    clearSilence();
    if (restartTimer !== null) window.clearTimeout(restartTimer);
    restartTimer = null;
    callbacks.onStateChange('stopped');
    try { recognition?.stop(); } catch { /* already stopped */ }
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
    rec.onresult = (event) => {
      if (!active || recognition !== rec) return;
      for (let i = event.resultIndex; i < event.results.length; i++) {
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
    };
    rec.onerror = (event) => {
      if (!active || recognition !== rec) return;
      callbacks.onError(event.error);
      if (FATAL_ERRORS.has(event.error)) finish(composeText(), 'error');
    };
    rec.onend = () => {
      if (!active || recognition !== rec) return;
      const segmentPart = composeSegment();
      if (segmentPart) committed = [committed, segmentPart].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
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
  callbacks.onStateChange('listening');
  armSilence();

  return {
    stop() {
      finish(composeText(), 'done');
    },
  };
}
