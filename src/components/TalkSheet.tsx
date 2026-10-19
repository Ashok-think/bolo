import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, X, Send, Loader2, AlertCircle, ArrowLeft } from 'lucide-react';
import type { Business, Language } from '@/lib/types';
import type { ParsedInvoice } from '@/lib/parser';
import { converseTurn, emptyDraft, draftTotal, ruleBasedTurn } from '@/lib/converse';
import type { ConversationDraft, ConversationTurn } from '@/lib/converse';
import { startListenSession } from '@/lib/speech';
import type { ListenSession } from '@/lib/speech';
import { stopPlayback, speakReply } from '@/lib/geminiVoice';
import { setMicOpen } from '@/lib/voiceFeedback';
import { LANGUAGE_LABELS } from '@/lib/format';
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
  'no-speech': '',
  aborted: '',
};

const LISTEN_START_DELAY_MS = 150;
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
  onCompleted: (parsed: ParsedInvoice[], transcript: string, lang: Language) => void;
}) {
  const [lang, setLang] = useState<Language>(business.language);
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
  const modeRef = useRef<Mode>('listening');
  const draftRef = useRef(draft);
  const turnsRef = useRef(turns);
  const restartTimerRef = useRef<number | null>(null);
  const thinkingTimerRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const closingRef = useRef(false);
  const busyRef = useRef(false);
  const handleUtteranceRef = useRef<((text: string) => Promise<void>) | null>(null);
  const typedRef = useRef('');
  const typedEditedRef = useRef(false);

  draftRef.current = draft;
  turnsRef.current = turns;

  function setModeBoth(m: Mode) {
    modeRef.current = m;
    setMode(m);
  }

  const stopListening = useCallback(() => {
    setMicOpen(false);
    sessionRef.current?.stop();
    sessionRef.current = null;
    setListening(false);
  }, []);

  const scheduleRestartRef = useRef<(() => void) | null>(null);

  const finishWithTranscript = useCallback((text: string) => {
    setMicOpen(false);
    const clean = (typedEditedRef.current ? typedRef.current : text).trim();
    setListening(false);
    setLiveText('');
    typedRef.current = clean;
    setTyped(clean);
    if (clean) {
      typedEditedRef.current = false;
      setTurns((cur) => [...cur, { role: 'user', text: clean }]);
      void handleUtteranceRef.current?.(clean);
    } else {
      scheduleRestartRef.current?.();
    }
  }, []);

  const startBrowserFallback = useCallback(() => {
    if (closingRef.current || busyRef.current) return;
    setMicOpen(true);
    const session = startListenSession(lang, {
      onTranscript: (text) => {
        setLiveText(text);
        if (!typedEditedRef.current) {
          typedRef.current = text;
          setTyped(text);
        }
      },
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
    typedEditedRef.current = false;
    typedRef.current = '';
    setTyped('');
    startBrowserFallback();
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

    const priorDraft = draftRef.current;
    const priorTurns = turnsRef.current;
    const ruleResult = ruleBasedTurn(
      priorDraft,
      text,
      lang,
      customers.map((c) => c.name)
    );
    setDraft(ruleResult.draft);
    draftRef.current = ruleResult.draft;
    const ruleTurns = [...turnsRef.current, { role: 'bolo' as const, text: ruleResult.reply }];
    setTurns(ruleTurns);
    turnsRef.current = ruleTurns;
    setShowThinking(false);
    if (thinkingTimerRef.current) {
      window.clearTimeout(thinkingTimerRef.current);
      thinkingTimerRef.current = null;
    }

    // Text-only AI enhancement runs in the background; the usable rule result
    // is already visible and spoken while the request is pending.
    const aiController = new AbortController();
    let aiTimer: number | undefined;
    const aiTimeout = new Promise<null>((resolve) => {
      aiTimer = window.setTimeout(() => {
        aiController.abort();
        resolve(null);
      }, 5000);
    });
    const aiResultPromise = converseTurn(
      priorDraft,
      text,
      priorTurns,
      lang,
      customers.map((c) => c.name),
      aiController.signal
    );
    if (closingRef.current) {
      aiController.abort();
      if (aiTimer !== undefined) window.clearTimeout(aiTimer);
      busyRef.current = false;
      return;
    }
    setModeBoth('speaking');
    await speakReply(ruleResult.reply, lang);
    const aiResult = await Promise.race([aiResultPromise, aiTimeout]);
    if (aiTimer !== undefined) window.clearTimeout(aiTimer);
    if (aiResult?.source === 'ai' && !closingRef.current) {
      setDraft(aiResult.draft);
      draftRef.current = aiResult.draft;
      const updatedTurns = [...turnsRef.current];
      const lastBolo = updatedTurns.map((turn) => turn.role).lastIndexOf('bolo');
      if (lastBolo >= 0) updatedTurns[lastBolo] = { role: 'bolo', text: aiResult.reply };
      setTurns(updatedTurns);
      turnsRef.current = updatedTurns;
    }
    busyRef.current = false;
    if (closingRef.current) return;

    setModeBoth('idle');
    scheduleRestart();
  }

  handleUtteranceRef.current = handleUtterance;

  useEffect(() => {
    closingRef.current = false;
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
    onCompleted(list, transcriptSummary, lang);
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

        <div className="flex flex-wrap justify-center gap-2 px-5 py-2 border-b border-line">
          {(Object.keys(LANGUAGE_LABELS) as Language[]).map((language) => (
            <button key={language} onClick={() => setLang(language)} className={`shrink-0 min-h-[36px] px-3 rounded-full text-xs font-medium border ${lang === language ? 'bg-primary text-white border-primary' : 'bg-card border-line text-muted'}`}>
              {LANGUAGE_LABELS[language].label}
            </button>
          ))}
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
              onChange={(e) => { typedEditedRef.current = true; typedRef.current = e.target.value; setTyped(e.target.value); }}
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
