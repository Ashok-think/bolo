import { useEffect, useRef } from 'react';

const BAR_COUNT = 5;

/**
 * Live mic level meter: five bars driven by an AnalyserNode so the user can
 * see the microphone is picking up sound. Releases its own audio work on
 * unmount; the stream itself is owned by the caller.
 */
export function MicLevelMeter({ stream, active }: { stream: MediaStream | null; active: boolean }) {
  const barsRef = useRef<Array<HTMLSpanElement | null>>([]);

  useEffect(() => {
    if (!stream || !active) {
      barsRef.current.forEach((b) => b && (b.style.transform = 'scaleY(0.2)'));
      return;
    }
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    let raf = 0;

    const tick = () => {
      analyser.getByteFrequencyData(data);
      for (let i = 0; i < BAR_COUNT; i++) {
        const bar = barsRef.current[i];
        if (!bar) continue;
        // Sample different bands so the bars move independently.
        const start = Math.floor((i / BAR_COUNT) * data.length * 0.5);
        const end = Math.floor(((i + 1) / BAR_COUNT) * data.length * 0.5);
        let sum = 0;
        for (let j = start; j < end; j++) sum += data[j];
        const avg = end > start ? sum / (end - start) : 0;
        const level = Math.max(0.2, Math.min(1, avg / 140));
        bar.style.transform = `scaleY(${level})`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      try {
        source.disconnect();
      } catch {
        // ignore
      }
      void ctx.close().catch(() => undefined);
    };
  }, [stream, active]);

  return (
    <div className="flex items-end justify-center gap-1.5 h-8" aria-hidden="true">
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <span
          key={i}
          ref={(el) => {
            barsRef.current[i] = el;
          }}
          className="w-1.5 rounded-full bg-primary transition-transform duration-75"
          style={{ height: '100%', transform: 'scaleY(0.2)', transformOrigin: 'bottom' }}
        />
      ))}
    </div>
  );
}
