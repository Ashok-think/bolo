import { SPEECH_LOCALES } from './format';
import type { Language } from './types';
let micActive = false;
let cancelPending: (() => void) | null = null;
let activeUtterance: SpeechSynthesisUtterance | null = null;
const get = (key: string, fallback: boolean) => {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === 'on';
  } catch {
    return fallback;
  }
};
const set = (key: string, on: boolean) => {
  try {
    localStorage.setItem(key, on ? 'on' : 'off');
  } catch {
    /* optional preference */
  }
};
export const speakConfirmationsEnabled = () =>
  get('bolo_speak_confirmations', true);
export const setSpeakConfirmations = (on: boolean) =>
  set('bolo_speak_confirmations', on);
export const speakRepliesEnabled = () => get('bolo_speak_replies', true);
export const setSpeakReplies = (on: boolean) => set('bolo_speak_replies', on);
export const geminiVoiceEnabled = () => get('bolo_gemini_voice', false);
export const setGeminiVoice = (on: boolean) => set('bolo_gemini_voice', on);
export const talkModeEnabled = () => get('bolo_talk_mode', false);
export const setTalkMode = (on: boolean) => set('bolo_talk_mode', on);
export function stopSpeaking() {
  cancelPending?.();
  cancelPending = null;
  activeUtterance = null;
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* unsupported */
  }
}
export function setMicOpen(open: boolean) {
  micActive = open;
  if (open) stopSpeaking();
}
export function speakAsync(text: string, language: Language): Promise<boolean> {
  stopSpeaking();
  return new Promise((resolve) => {
    if (
      micActive ||
      typeof window === 'undefined' ||
      !window.speechSynthesis ||
      !text.trim()
    )
      return resolve(false);
    const synth = window.speechSynthesis;
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cancelPending = null;
      activeUtterance = null;
      resolve(ok);
    };
    cancelPending = () => finish(false);
    const utter = new SpeechSynthesisUtterance(text);
    activeUtterance = utter;
    const voices = synth.getVoices();
    const locale = SPEECH_LOCALES[language];
    const voice =
      voices.find(
        (v) => v.lang.toLowerCase().replace('_', '-') === locale.toLowerCase(),
      ) ?? voices.find((v) => v.lang.toLowerCase().startsWith(language));
    // An empty list is normal while voices load; let the engine select by locale.
    if (voices.length && !voice) return finish(false);
    if (voice) utter.voice = voice;
    utter.lang = locale;
    timer = setTimeout(() => {
      finish(false);
      synth.cancel();
    }, 2000);
    utter.onstart = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        finish(false);
        synth.cancel();
      }, 30000);
    };
    utter.onend = () => finish(true);
    utter.onerror = () => finish(false);
    try {
      synth.speak(utter);
    } catch {
      finish(false);
    }
  });
}
export function speak(text: string, language: Language) {
  void speakAsync(text, language);
}
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', stopSpeaking);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopSpeaking();
  });
}
