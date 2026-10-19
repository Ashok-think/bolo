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
