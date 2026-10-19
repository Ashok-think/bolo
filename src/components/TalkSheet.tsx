import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, X, Send, Loader2, AlertCircle, ArrowLeft } from 'lucide-react';
import type { Business, Language } from '@/lib/types';
import type { ParsedInvoice } from '@/lib/parser';
import { converseTurn, emptyDraft, draftTotal, transcribeAudio } from '@/lib/converse';
import type { ConversationDraft, ConversationTurn } from '@/lib/converse';
import { startListenSession } from '@/lib/speech';
import type { ListenSession } from '@/lib/speech';
import { stopPlayback, speakReply } from '@/lib/geminiVoice';
import { setMicOpen } from '@/lib/voiceFeedback';
import { startVoiceRecording } from '@/lib/audioInput';
import type { VoiceRecording } from '@/lib/audioInput';
import { Button } from '@/components/ui/Button';
import { formatINR } from '@/lib/format';

const ERROR_MESSAGES: Record<string, string> = {
  'not-allowed':
    'Microphone access is blocked. Allow it in your browser settings, or type your answers instead.',
  'service-not-allowed':
    'Microphone access is blocked. Allow it in your browser settings, or type your answers instead.',
  'audio-capture':
    "We couldn't hear from your microphone. Check that it's plugged in, or type instead.",
  network: 'Voice input needs an internet connection. Check yours, or type instead.',
  transcribe: 'The AI could not hear this, try again.',
  'no-speech': '',
  aborted: '',
  speech:
    "Sorry, I couldn't speak that reply. You can still answer with the mic or type it.",
};

const LISTEN_START_DELAY_MS = 400;
const THINKING_INDICATOR_MS = 1500;

type Mode = 'listening' | 'speaking' | 'thinking' | 'idle' | 'error';

export function TalkSheet({
  business,
  customers,
  onClose,
  onCompleted,
}: {
  business: Business;
  customers: { name: string }[];
  onClose: () => void;
  onCompleted: (parsed: ParsedInvoice[], transcript: string) => void;
}) {
  const [lang] = useState<Language>(business.language);
  const [draft, setDraft] = useState<ConversationDraft>(emptyDraft());
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [liveText, setLiveText] = useState('');
  const [mode, setMode] = useState<Mode>('listening');
  const [listening, setListening] = useState(false);
  const [showThinking, setShowThinking] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [stashed, setStashed] = useState<ConversationDraft[]>([]);

  const sessionRef = useRef<ListenSession | null>(null);
  const recordingRef = useRef<VoiceRecording | null>(null);
  const modeRef = useRef<Mode>('listening');
  const draftRef = useRef(draft);
  const turnsRef = useRef(turns);
  const restartTimerRef = useRef<number | null>(null);
  const thinkingTimerRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const closingRef = useRef(false);
  const busyRef = useRef(false);
  const recordingFallbackRef = useRef(false);
  const handleUtteranceRef = useRef<((text: string) => Promise<void>) | null>(null);

  draftRef.current = draft;
  turnsRef.current = turns;

  function setModeBoth(m: Mode) {
    modeRef.current = m;
    setMode(m);
  }

  const stopListening = useCallback(() => {
    setMicOpen(false);
    recordingRef.current?.cancel();
    recordingRef.current = null;
    sessionRef.current?.stop();
    sessionRef.current = null;
    setListening(false);
  }, []);

  const scheduleRestartRef = useRef<(() => void) | null>(null);

  const finishWithTranscript = useCallback((text: string) => {
    const clean = text.trim();
    setListening(false);
    setLiveText('');
    if (clean) {
      setTurns((cur) => [...cur, { role: 'user', text: clean }]);
      void handleUtteranceRef.current?.(clean);
    } else {
      scheduleRestartRef.current?.();
    }
  }, []);

  const startBrowserFallback = useCallback(() => {
    if (closingRef.current || busyRef.current) return;
    const session = startListenSession(lang, {
      onTranscript: (text) => setLiveText(text),
      onStateChange: (state) => setListening(state !== 'stopped'),
      onFinish: (text) => {
        sessionRef.current = null;
        finishWithTranscript(text);
      },
      onError: (code) => {
        const msg = ERROR_MESSAGES[code];
        if (msg) setError(msg);
      },
    });
    if (!session) {
      setModeBoth('error');
      setError("This browser doesn't support voice input. Please type instead.");
      return;
    }
    sessionRef.current = session;
    setModeBoth('listening');
    setListening(true);
  }, [lang, finishWithTranscript]);

  const startListening = useCallback(() => {
    if (closingRef.current || busyRef.current) return;
    setError(null);
    setLiveText('');

    // Primary path: record the mic and send the audio to Gemini's audio
    // understanding (fixes Telugu/Hindi/mixed speech). The browser's built-in
    // recognition is the fallback when recording or transcription fails.
    void (async () => {
      const recording = await startVoiceRecording({
        onFinish: (blob) => {
          setMicOpen(false);
          recordingRef.current = null;
          setListening(false);
          setModeBoth('thinking');
          void (async () => {
            const result = await transcribeAudio(blob, lang);
            if (closingRef.current) return;
            if (result.ok) {
              finishWithTranscript(result.text);
            } else {
              setError(ERROR_MESSAGES.transcribe);
              setModeBoth('idle');
              scheduleRestartRef.current?.();
            }
          })();
        },
        onError: (code) => {
          setMicOpen(false);
          recordingRef.current = null;
          const msg = ERROR_MESSAGES[code];
          if (msg) setError(msg);
          startBrowserFallback();
        },
      });
      if (recording) {
        setMicOpen(true);
        recordingRef.current = recording;
        setModeBoth('listening');
        setListening(true);
      } else if (!recordingFallbackRef.current) {
        recordingFallbackRef.current = true;
        startBrowserFallback();
      }
    })();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, startBrowserFallback, finishWithTranscript]);

  const scheduleRestart = useCallback(() => {
    if (closingRef.current || busyRef.current) return;
    if (restartTimerRef.current) window.clearTimeout(restartTimerRef.current);
    restartTimerRef.current = window.setTimeout(() => {
      restartTimerRef.current = null;
      startListening();
    }, LISTEN_START_DELAY_MS);
  }, [startListening]);

  scheduleRestartRef.current = scheduleRestart;

  async function handleUtterance(text: string) {
    if (busyRef.current || closingRef.current) return;
    busyRef.current = true;
    setModeBoth('thinking');
    thinkingTimerRef.current = window.setTimeout(
      () => setShowThinking(true),
      THINKING_INDICATOR_MS
    );

    const result = await converseTurn(
      draftRef.current,
      text,
      turnsRef.current,
      lang,
      customers.map((c) => c.name)
    );

    if (thinkingTimerRef.current) {
      window.clearTimeout(thinkingTimerRef.current);
      thinkingTimerRef.current = null;
    }
    setShowThinking(false);
    const prev = draftRef.current;
    setDraft(result.draft);
    draftRef.current = result.draft;

    // The user moved on to a new bill while the old one was ready: set the
    // finished bill aside and keep the conversation going.
    if (
      result.ready &&
      prev.customer &&
      result.draft.customer !== prev.customer &&
      result.draft.items.length === 0 &&
      result.draft.advance === 0
    ) {
      setStashed((cur) => [...cur, prev]);
    }

    const withReply = [...turnsRef.current, { role: 'bolo' as const, text: result.reply }];
    setTurns(withReply);
    turnsRef.current = withReply;

    if (closingRef.current) return;
    setModeBoth('speaking');
    const ok = await speakReply(result.reply, lang);
    busyRef.current = false;
    if (closingRef.current) return;

    if (ok) {
      setModeBoth('idle');
      scheduleRestart();
    } else {
      setModeBoth('error');
      setError(ERROR_MESSAGES.speech);
    }
  }

  handleUtteranceRef.current = handleUtterance;

  useEffect(() => {
    const onHide = () => {
      closingRef.current = true;
      stopPlayback();
      stopListening();
    };
    window.addEventListener('pagehide', onHide);
    const onVis = () => {
      if (document.visibilityState === 'hidden') onHide();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('visibilitychange', onVis);
      closingRef.current = true;
      stopPlayback();
      stopListening();
      if (restartTimerRef.current) window.clearTimeout(restartTimerRef.current);
      if (thinkingTimerRef.current) window.clearTimeout(thinkingTimerRef.current);
      setMicOpen(false);
    };
  }, [stopListening]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns.length, showThinking, liveText]);

  function submitTyped() {
    const text = typed.trim();
    if (!text || busyRef.current || closingRef.current) return;
    setTyped('');
    stopListening();
    setTurns((cur) => [...cur, { role: 'user', text }]);
    void handleUtterance(text);
  }

  function buildParsed(d: ConversationDraft): ParsedInvoice {
    return {
      customer: d.customer,
      items: d.items.map((it) => ({ ...it })),
      advance: d.advance,
      notes: d.notes,
      ok: Boolean(d.customer) && d.items.length > 0,
      source: 'rules',
    };
  }

  function handleDone() {
    closingRef.current = true;
    stopPlayback();
    stopListening();
    if (restartTimerRef.current) window.clearTimeout(restartTimerRef.current);
    if (thinkingTimerRef.current) window.clearTimeout(thinkingTimerRef.current);
    const current = buildParsed(draftRef.current);
    const list: ParsedInvoice[] = [
      ...stashed.map((s) => buildParsed(s)).filter((p) => p.ok),
    ];
    if (list.length === 0 || current.ok) list.push(current);
    const transcriptSummary = turnsRef.current
      .filter((t) => t.role === 'user')
      .map((t) => t.text)
      .join('\n');
    onCompleted(list, transcriptSummary);
    onClose();
  }

  const total = draftTotal(draft);
  const balance = Math.max(0, total - draft.advance);
  const statusText =
    mode === 'speaking'
      ? 'Speaking…'
      : listening
        ? 'Listening…'
        : mode === 'thinking'
          ? 'Working…'
          : 'Paused';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/50" />
      <div className="relative w-full md:max-w-md bg-background rounded-t-card pt-safe h-[92vh] flex flex-col">
        <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-line">
          <div className="flex items-center gap-1">
            <button
              onClick={onClose}
              aria-label="Back"
              className="w-9 h-9 rounded-full flex items-center justify-center text-muted hover:bg-ink/5 transition duration-200"
            >
              <ArrowLeft size={20} />
            </button>
            <span className="font-display font-bold text-lg text-ink">Talk to Bolo</span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 rounded-full flex items-center justify-center text-muted hover:bg-ink/5 transition duration-200"
          >
            <X size={20} />
          </button>
        </div>

        {/* Live draft card, pinned at the top */}
        <div className="px-5 pt-3">
          <div className="rounded-2xl border-2 border-primary/30 bg-primary-soft/40 p-4">
            <span className="text-xs font-bold tracking-wide text-primary uppercase">
              Live draft
            </span>
            <div className="flex items-center justify-between mt-1">
              <span className="font-display font-bold text-ink truncate pr-2">
                {draft.customer || 'Add customer'}
              </span>
              <span className="font-display font-extrabold text-primary whitespace-nowrap">
                {formatINR(total)}
              </span>
            </div>
            {draft.items.length > 0 && (
              <ul className="mt-2 space-y-1">
                {draft.items.map((it, i) => (
                  <li key={i} className="flex items-center justify-between text-sm">
                    <span className="text-ink truncate pr-2">
                      {it.quantity} × {it.name}
                    </span>
                    <span className="text-muted whitespace-nowrap">
                      {formatINR(it.quantity * it.unit_price)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-primary/20 text-sm">
              <span className="text-muted">Advance {formatINR(draft.advance)}</span>
              <span className="font-medium text-ink">Balance {formatINR(balance)}</span>
            </div>
          </div>
        </div>

        {/* Chat bubbles */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
          {turns.length === 0 && !liveText && (
            <p className="text-center text-muted text-sm mt-6 px-4">
              Just talk — "Ravi bought three shirts at 200 each", pause, then "advance 300".
            </p>
          )}
          {turns.map((t, i) => (
            <div key={i} className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'} bubble-in`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                  t.role === 'user'
                    ? 'bg-primary text-white rounded-br-sm'
                    : 'bg-card border border-line text-ink rounded-bl-sm'
                }`}
              >
                {t.text}
              </div>
            </div>
          ))}
          {listening && (
            <div className="flex justify-end bubble-in">
              <div className="rounded-2xl px-4 py-3 bg-primary/40 flex items-center gap-1.5">
                <span className="listen-bar inline-block w-1 h-3.5 rounded-full bg-white/90" style={{ animationDelay: '0ms' }} />
                <span className="listen-bar inline-block w-1 h-3.5 rounded-full bg-white/90" style={{ animationDelay: '150ms' }} />
                <span className="listen-bar inline-block w-1 h-3.5 rounded-full bg-white/90" style={{ animationDelay: '300ms' }} />
                <span className="text-xs text-white italic ml-1">I'm listening…</span>
              </div>
            </div>
          )}
          {liveText && (
            <div className="flex justify-end bubble-in">
              <div className="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm bg-primary/40 text-white rounded-br-sm italic">
                {liveText}
              </div>
            </div>
          )}
          {showThinking && (
            <div className="flex justify-start bubble-in">
              <div className="bg-card border border-line rounded-2xl px-4 py-2.5 flex items-center gap-2">
                <Loader2 size={14} className="animate-spin text-muted" />
                <span className="text-xs text-muted">Thinking…</span>
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="border-t border-line px-5 py-3 pb-safe">
          {error && (
            <div className="flex items-start gap-2 mb-2 p-3 rounded-2xl bg-danger/10">
              <AlertCircle size={18} className="text-danger shrink-0 mt-0.5" />
              <p className="text-sm text-ink">{error}</p>
            </div>
          )}
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold tracking-wide text-primary uppercase">
              {statusText}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={startListening}
                aria-label="Start listening"
                disabled={busyRef.current || listening}
                className="w-10 h-10 rounded-full bg-primary flex items-center justify-center transition duration-200 active:scale-95 disabled:opacity-50"
              >
                <Mic size={18} className="text-white" />
              </button>
              <Button variant="outline" className="min-h-[40px] px-4" onClick={handleDone}>
                Done
              </Button>
            </div>
          </div>
          <div className="flex gap-2">
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitTyped();
              }}
              placeholder="Type instead…"
              className="flex-1 min-h-[44px] px-4 rounded-full border border-line bg-card text-ink placeholder:text-muted/60 focus:outline-none focus:border-primary transition duration-200"
            />
            <button
              onClick={submitTyped}
              aria-label="Send"
              disabled={!typed.trim()}
              className="w-11 h-11 rounded-full bg-primary flex items-center justify-center transition duration-200 active:scale-95 disabled:opacity-50"
            >
              <Send size={18} className="text-white" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
