import { SPEECH_LOCALES } from './format';
import type { Language } from './types';

const PREF_KEY = 'bolo_speak_confirmations';

// While the microphone is open no TTS may run: it would leak into the mic.
let micActive = false;

export function setMicOpen(open: boolean): void {
  micActive = open;
  if (open) stopSpeaking();
}

export function speakConfirmationsEnabled(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setSpeakConfirmations(on: boolean): void {
  try {
    localStorage.setItem(PREF_KEY, on ? 'on' : 'off');
  } catch {
    // preference is best-effort; speech still works without it
  }
}

/** Stop all speech immediately; safe to call any time, never throws. */
export function stopSpeaking(): void {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    // ignore
  }
}

// Nothing keeps talking when the page is hidden or closed.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', stopSpeaking);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') stopSpeaking();
  });
}

/**
 * Speak text aloud with speechSynthesis. Resolves true from the utterance's
 * onend handler when the speech finished, false when speech is unavailable,
 * was cancelled, or the voice failed. Never queues more than one utterance:
 * the previous one is cancelled before the next starts. Never throws.
 */
export function speakAsync(text: string, language: Language): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    try {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        finish(false);
        return;
      }
      if (micActive) {
        finish(false);
        return;
 }
      const synth = window.speechSynthesis;
      const locale = SPEECH_LOCALES[language];
      const voices = synth.getVoices();
      const voice =
        voices.find((v) => v.lang.replace('_', '-') === locale) ??
        voices.find((v) => v.lang.toLowerCase().startsWith(language));
      const utter = new SpeechSynthesisUtterance(text);
      if (voice) {
        utter.voice = voice;
        utter.lang = voice.lang;
      } else {
        // No voice for this language — fall back to English delivery.
        utter.lang = 'en-IN';
      }
      const noStartGuard = window.setTimeout(() => finish(false), 5000);
      utter.onstart = () => window.clearTimeout(noStartGuard);
      utter.onend = () => finish(true);
      utter.onerror = () => finish(false);
      synth.cancel();
      synth.speak(utter);
    } catch {
      finish(false);
    }
  });
}

/** Fire-and-forget spoken confirmation; never throws, never blocks. */
export function speak(text: string, language: Language): void {
  void speakAsync(text, language);
}

const TALK_MODE_KEY = 'bolo_talk_mode';

/** Talk mode (turn-based conversation) is OFF by default. */
export function talkModeEnabled(): boolean {
  try {
    return localStorage.getItem(TALK_MODE_KEY) === 'on';
  } catch {
    return false;
  }
}

export function setTalkMode(on: boolean): void {
  try {
    localStorage.setItem(TALK_MODE_KEY, on ? 'on' : 'off');
  } catch {
    // preference is best-effort
  }
}
