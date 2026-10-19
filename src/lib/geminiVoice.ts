// Bolo's voice: server-generated Gemini speech when available, with the
// browser's speechSynthesis as fallback.

import { speakAsync, stopSpeaking } from './voiceFeedback';
import { getAccessToken } from './converse';
import type { Language } from './types';

let audioEl: HTMLAudioElement | null = null;

/** Stop any playing reply audio and browser speech; safe any time. */
export function stopPlayback(): void {
  try {
    audioEl?.pause();
  } catch {
    // ignore
  }
  audioEl = null;
  stopSpeaking();
}

function pcmToWav(pcmBase64: string, sampleRate: number): Blob {
  const bin = atob(pcmBase64);
  const len = bin.length;
  const buffer = new ArrayBuffer(44 + len);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + len, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, len, true);
  for (let i = 0; i < len; i++) view.setUint8(44 + i, bin.charCodeAt(i));
  return new Blob([buffer], { type: 'audio/wav' });
}

function playBlob(blob: Blob): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value: boolean) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    try {
      // Device voice may still be talking from a fallback or confirmation;
      // it must never overlap the Gemini audio.
      try {
        window.speechSynthesis?.cancel();
      } catch {
        // ignore
      }
      const url = URL.createObjectURL(blob);
      const el = new Audio(url);
      audioEl = el;
      const guard = window.setTimeout(() => done(false), 6000);
      el.onended = () => {
        window.clearTimeout(guard);
        URL.revokeObjectURL(url);
        done(true);
      };
      el.onerror = () => {
        window.clearTimeout(guard);
        URL.revokeObjectURL(url);
        done(false);
      };
      void el.play().catch(() => {
        window.clearTimeout(guard);
        done(false);
      });
    } catch {
      done(false);
    }
  });
}

/**
 * Speak one reply. Tries the speak-reply server function (Gemini voice);
 * if unavailable, falls back to the device voice. Resolves true when the
 * reply finished playing.
 */
export async function speakReply(text: string, lang: Language): Promise<boolean> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 4500);
  try {
    const token = await Promise.race([
      getAccessToken(),
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 4500)),
    ]);
    if (token && !timedOut) {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/speak-reply`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            Apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ text, lang }),
          signal: controller.signal,
        }
      );
      if (res.ok && !timedOut) {
        const data = (await res.json().catch(() => null)) as
          | { pcm?: unknown; sampleRate?: unknown }
          | null;
        if (data && typeof data.pcm === 'string' && data.pcm.length > 0) {
          const wav = pcmToWav(data.pcm, typeof data.sampleRate === 'number' ? data.sampleRate : 24000);
          if (await playBlob(wav)) return true;
        }
      }
    }
  } catch {
    // fall through to device voice
  } finally {
    window.clearTimeout(timer);
  }
  return speakAsync(text, lang);
}
