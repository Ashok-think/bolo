// Client-side voice recording: captures mic audio, encodes WAV, and
// auto-finishes after 1.5s of silence following speech (or 15s hard cap).

const SILENCE_MS = 900;
const MAX_MS = 10000;
const SPEECH_RMS = 0.012;

export interface VoiceRecording {
  stop: () => void;
  cancel: () => void;
}

export interface VoiceRecordingCallbacks {
  onFinish: (blob: Blob) => void;
  /** Called once the mic stream is open, for level meters. */
  onStream?: (stream: MediaStream) => void;
  onError: (code: 'not-allowed' | 'no-mic' | 'audio-capture') => void;
}

function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
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
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

export async function startVoiceRecording(
  cb: VoiceRecordingCallbacks
): Promise<VoiceRecording | null> {  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return null;

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    if (e instanceof DOMException) {
      if (e.name === 'NotAllowedError' || e.name === 'SecurityError') {
        cb.onError('not-allowed');
      } else if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError') {
        cb.onError('no-mic');
      } else {
        cb.onError('audio-capture');
      }
    } else {
      cb.onError('audio-capture');
    }
    return null;
  }
  if (cb.onStream) cb.onStream(stream);

  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const mute = ctx.createGain();
  mute.gain.value = 0;

  const chunks: Float32Array[] = [];
  let stopped = false;
  let finished = false;
  let hasSpeech = false;
  let lastVoiceAt = Date.now();
  const startAt = Date.now();

  function cleanup() {
    if (stopped) return;
    stopped = true;
    try {
      proc.disconnect();
      source.disconnect();
      mute.disconnect();
    } catch {
      // ignore
    }
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close().catch(() => undefined);
  }

  function finish() {
    if (finished) return;
    finished = true;
    const total = chunks.reduce((s, c) => s + c.length, 0);
    const merged = new Float32Array(total);
    let off = 0;
    for (const c of chunks) {
      merged.set(c, off);
      off += c.length;
    }
    cleanup();
    cb.onFinish(new Blob([encodeWav(merged, ctx.sampleRate)], { type: 'audio/wav' }));
  }

  proc.onaudioprocess = (e) => {
    if (stopped || finished) return;
    const input = e.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(input));
    let sum = 0;
    for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
    const rms = Math.sqrt(sum / input.length);
    const now = Date.now();
    if (rms > SPEECH_RMS) {
      hasSpeech = true;
      lastVoiceAt = now;
    }
    if (now - startAt > MAX_MS) {
      finish();
      return;
    }
    if (hasSpeech && now - lastVoiceAt > SILENCE_MS) finish();
  };

  source.connect(proc);
  proc.connect(mute);
  mute.connect(ctx.destination);

  return {
    stop: () => finish(),
    cancel: () => {
      finished = true;
      cleanup();
    },
  };
}

// Mic test: records for a fixed duration, exposing the raw stream so a UI
// level meter can render while it runs.

export interface MicTestHandle {
  stop: () => void;
}

export interface MicTestCallbacks {
  onFinish: (blob: Blob) => void;
  onError: (code: 'not-allowed' | 'no-mic' | 'audio-capture') => void;
}

export async function startMicTest(
  durationMs: number,
  cb: MicTestCallbacks,
  onStream?: (stream: MediaStream) => void
): Promise<MicTestHandle | null> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return null;

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    if (e instanceof DOMException) {
      if (e.name === 'NotAllowedError' || e.name === 'SecurityError') {
        cb.onError('not-allowed');
      } else if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError') {
        cb.onError('no-mic');
      } else {
        cb.onError('audio-capture');
      }
    } else {
      cb.onError('audio-capture');
    }
    return null;
  }
  if (onStream) onStream(stream);

  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);

  const chunks: Float32Array[] = [];
  let done = false;

  function finish() {
    if (done) return;
    done = true;
    try {
      proc.disconnect();
      source.disconnect();
    } catch {
      // ignore
    }
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close().catch(() => undefined);
    const total = chunks.reduce((s, c) => s + c.length, 0);
    const merged = new Float32Array(total);
    let off = 0;
    for (const c of chunks) {
      merged.set(c, off);
      off += c.length;
    }
    cb.onFinish(new Blob([encodeWav(merged, ctx.sampleRate)], { type: 'audio/wav' }));
  }

  proc.onaudioprocess = (e) => {
    if (done) return;
    chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
  };

  source.connect(proc);
  const mute = ctx.createGain();
  mute.gain.value = 0;
  proc.connect(mute);
  mute.connect(ctx.destination); // ScriptProcessor needs a live path; gain 0 keeps it silent

  const timer = window.setTimeout(finish, durationMs);
  return {
    stop: () => {
      window.clearTimeout(timer);
      finish();
    },
  };
}
