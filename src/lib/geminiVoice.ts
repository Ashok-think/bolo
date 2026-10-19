import { speakAsync, stopSpeaking, geminiVoiceEnabled } from './voiceFeedback';
import { getAccessToken } from './converse';
import type { Language } from './types';
let generation = 0;
let cancelAudio: (() => void) | null = null;
let controller: AbortController | null = null;
const cache = new Map<string, Blob>();
export interface VoiceResult {
  ok: boolean;
  engine: 'gemini' | 'browser' | 'none';
  reason: string;
}
export function stopPlayback() {
  generation++;
  controller?.abort();
  controller = null;
  cancelAudio?.();
  cancelAudio = null;
  stopSpeaking();
}
function pcmToWav(pcmBase64: string, sampleRate: number): Blob {
  const bin = atob(pcmBase64);
  const len = bin.length;
  const buffer = new ArrayBuffer(44 + len);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++)
      view.setUint8(offset + i, s.charCodeAt(i));
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
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      audio.pause();
      audio.src = '';
      URL.revokeObjectURL(url);
      cancelAudio = null;
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), 30000);
    cancelAudio = () => finish(false);
    audio.onended = () => finish(true);
    audio.onerror = () => finish(false);
    void audio.play().catch(() => finish(false));
  });
}
export async function speakReplyDetailed(
  text: string,
  lang: Language,
  useGemini = geminiVoiceEnabled(),
): Promise<VoiceResult> {
  stopPlayback();
  const id = generation;
  const key = lang + ':' + text;
  if (!useGemini) {
    const ok = await speakAsync(text, lang);
    return {
      ok,
      engine: ok ? 'browser' : 'none',
      reason: ok
        ? 'Device voice played.'
        : 'No matching voice, or playback blocked. Your reply is shown as text.',
    };
  }
  let blob = cache.get(key);
  if (!blob) {
    const abort = new AbortController();
    controller = abort;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const work = (async () => {
        const token = await getAccessToken();
        if (!token || abort.signal.aborted) return null;
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/speak-reply`,
          {
            method: 'POST',
            signal: abort.signal,
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
              Apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({ text, lang }),
          },
        );
        if (!res.ok) return null;
        const data = await res.json();
        return typeof data.pcm === 'string' && data.pcm
          ? pcmToWav(data.pcm, 24000)
          : null;
      })().catch(() => null);
      const result = await Promise.race([
        work,
        new Promise<null>((resolve) => {
          timer = setTimeout(() => {
            abort.abort();
            resolve(null);
          }, 12000);
        }),
      ]);
      if (result) {
        blob = result;
        if (cache.size > 12) cache.clear();
        cache.set(key, result);
      }
    } finally {
      if (timer) clearTimeout(timer);
      if (controller === abort) controller = null;
    }
  }
  if (id !== generation)
    return { ok: false, engine: 'none', reason: 'Stopped.' };
  if (blob) {
    const ok = await playBlob(blob);
    return {
      ok,
      engine: ok ? 'gemini' : 'none',
      reason: ok
        ? 'Gemini voice played.'
        : 'Audio is ready. Tap Play reply or Test voice again to allow playback.',
    };
  }
  const ok = await speakAsync(text, lang);
  return {
    ok,
    engine: ok ? 'browser' : 'none',
    reason: ok
      ? 'Gemini voice is unavailable; device voice played. Check AI in Settings.'
      : 'Gemini voice is unavailable. Check AI and deployed server functions in Settings.',
  };
}
export async function speakReply(
  text: string,
  lang: Language,
): Promise<boolean> {
  return (await speakReplyDetailed(text, lang)).ok;
}
