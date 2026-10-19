import { useEffect, useRef, useState } from 'react';
import { Mic, X, Send, Loader2, AlertCircle, ArrowLeft } from 'lucide-react';
import type { Business, Language } from '@/lib/types';
import type { ParsedInvoice } from '@/lib/parser';
import {
  converseTurn,
  emptyDraft,
  draftTotal,
  ruleBasedTurn,
  isClosingUtterance,
} from '@/lib/converse';
import type { ConversationDraft, ConversationTurn } from '@/lib/converse';
import { startListenSession } from '@/lib/speech';
import type { ListenSession } from '@/lib/speech';
import { stopPlayback, speakReply } from '@/lib/geminiVoice';
import { setMicOpen, speakRepliesEnabled } from '@/lib/voiceFeedback';
import { LANGUAGE_LABELS, VOICE_LANGUAGES, formatINR } from '@/lib/format';
import { Button } from '@/components/ui/Button';
type Mode = 'listening' | 'speaking' | 'thinking' | 'idle';
const EMPTY_MESSAGE =
  "I didn't hear anything. Tap the mic and speak right away, or type below.";
export function TalkSheet({
  business,
  customers,
  onClose,
  onCompleted,
}: {
  business: Business;
  customers: { name: string }[];
  onClose: () => void;
  onCompleted: (
    parsed: ParsedInvoice[],
    transcript: string,
    lang: Language,
  ) => void;
}) {
  const [lang, setLang] = useState<Language>(business.language);
  const [draft, setDraft] = useState<ConversationDraft>(emptyDraft());
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [liveText, setLiveText] = useState('');
  const [mode, setMode] = useState<Mode>('idle');
  const [listening, setListening] = useState(false);
  const [showThinking, setShowThinking] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [lastError, setLastError] = useState('none');
  const draftRef = useRef(draft);
  const turnsRef = useRef(turns);
  const sessionRef = useRef<ListenSession | null>(null);
  const recognitionTextRef = useRef('');
  const editBaseRef = useRef('');
  const editOffsetRef = useRef(0);
  const typedRef = useRef('');
  const typedEditedRef = useRef(false);
  const closingRef = useRef(false);
  const busyRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sequenceRef = useRef(0);
  const aiRef = useRef<AbortController | null>(null);
  const restartRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSubmittedRef = useRef('');
  function stopListening() {
    sessionRef.current?.cancel();
    sessionRef.current = null;
    setListening(false);
    setMicOpen(false);
  }
  function suspend() {
    sequenceRef.current++;
    aiRef.current?.abort();
    stopListening();
    stopPlayback();
    if (restartRef.current) clearTimeout(restartRef.current);
    busyRef.current = false;
    setShowThinking(false);
    setMode('idle');
  }
  function saveTurns(value: ConversationTurn[]) {
    turnsRef.current = value;
    setTurns(value);
  }
  function saveDraft(value: ConversationDraft) {
    draftRef.current = value;
    setDraft(value);
  }
  function startListening() {
    if (closingRef.current) return;
    suspend();
    setError(null);
    setLastError('none');
    setLiveText('');
    typedEditedRef.current = false;
    recognitionTextRef.current = '';
    typedRef.current = '';
    setTyped('');
    setMicOpen(true);
    const session = startListenSession(lang, {
      onTranscript(text) {
        setLiveText(text);
        recognitionTextRef.current = text;
        typedRef.current = typedEditedRef.current
          ? [
              editBaseRef.current,
              text.trim().split(/\s+/).slice(editOffsetRef.current).join(' '),
            ]
              .filter(Boolean)
              .join(' ')
          : text;
        setTyped(typedRef.current);
      },
      onStateChange(state) {
        setListening(state !== 'stopped');
      },
      onFinish(text, reason) {
        sessionRef.current = null;
        setMicOpen(false);
        setLiveText('');
        setListening(false);
        const clean = (typedEditedRef.current ? typedRef.current : text).trim();
        if (clean) void handleUtterance(clean, reason === 'phrase');
        else if (reason === 'phrase' && draftRef.current.items.length) {
          handleDone();
        } else {
          setError(EMPTY_MESSAGE);
          setMode('idle');
        }
      },
      onError(code) {
        setLastError(code);
        if (
          [
            'not-allowed',
            'service-not-allowed',
            'audio-capture',
            'language-not-supported',
          ].includes(code)
        )
          setError(
            'Microphone unavailable. Check browser permission or type below.',
          );
      },
    });
    if (!session) {
      setMicOpen(false);
      setError('Voice input is unavailable in this browser. Type below.');
      setMode('idle');
      return;
    }
    sessionRef.current = session.active ? session : null;
    if (session.active) setMode('listening');
  }
  async function handleUtterance(text: string, closeAfter = false) {
    if (closingRef.current) return;
    stopListening();
    stopPlayback();
    const seq = ++sequenceRef.current;
    busyRef.current = true;
    setError(null);
    setMode('thinking');
    setShowThinking(true);
    const priorDraft = draftRef.current;
    const priorTurns = turnsRef.current;
    const withUser = [...priorTurns, { role: 'user' as const, text }];
    const rules = ruleBasedTurn(
      priorDraft,
      text,
      lang,
      customers.map((c) => c.name),
    );
    saveDraft(rules.draft);
    saveTurns([...withUser, { role: 'bolo', text: rules.reply }]);
    lastSubmittedRef.current = text;
    typedRef.current = '';
    setTyped('');
    setLiveText('');
    const ctrl = new AbortController();
    aiRef.current = ctrl;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const indicator = setTimeout(() => setShowThinking(false), 1800);
    try {
      const ai = await Promise.race([
        converseTurn(
          priorDraft,
          text,
          priorTurns,
          lang,
          customers.map((c) => c.name),
          ctrl.signal,
        ),
        new Promise<null>((resolve) => {
          timeout = setTimeout(() => {
            ctrl.abort();
            resolve(null);
          }, 4500);
        }),
      ]);
      if (seq !== sequenceRef.current || closingRef.current) return;
      const result = ai?.source === 'ai' ? ai : rules;
      saveDraft(result.draft);
      saveTurns([...withUser, { role: 'bolo', text: result.reply }]);
      setShowThinking(false);
      if (speakRepliesEnabled()) {
        setMode('speaking');
        await speakReply(result.reply, lang);
      }
      if (seq !== sequenceRef.current || closingRef.current) return;
      if (
        (closeAfter || isClosingUtterance(text)) &&
        result.draft.customer &&
        result.draft.items.some((i) => i.unit_price > 0)
      ) {
        finishReview(result.draft, withUser);
        return;
      }
      setMode('idle');
      busyRef.current = false;
      restartRef.current = setTimeout(() => {
        if (seq === sequenceRef.current && !closingRef.current)
          startListening();
      }, 400);
    } catch {
      if (seq === sequenceRef.current) {
        setMode('idle');
        setError('Your draft is ready. Tap the mic to continue, or review it.');
      }
    } finally {
      if (timeout) clearTimeout(timeout);
      clearTimeout(indicator);
      if (seq === sequenceRef.current) {
        busyRef.current = false;
        setShowThinking(false);
      }
    }
  }
  function submitTyped() {
    const text = typedRef.current.trim() || typed.trim();
    if (!text || closingRef.current) return;
    suspend();
    void handleUtterance(text);
  }
  function finishReview(value: ConversationDraft, history = turnsRef.current) {
    if (!value.items.length && !value.customer) {
      setError(EMPTY_MESSAGE);
      return;
    }
    closingRef.current = true;
    suspend();
    onCompleted(
      [
        {
          customer: value.customer,
          items: value.items,
          advance: value.advance,
          notes: value.notes,
          ok: value.items.length > 0,
          source: 'rules',
        },
      ],
      history
        .filter((t) => t.role === 'user')
        .map((t) => t.text)
        .join('\n'),
      lang,
    );
    onClose();
  }
  function handleDone() {
    const text = typedRef.current.trim();
    stopListening();
    if (text && text !== lastSubmittedRef.current) {
      const result = ruleBasedTurn(
        draftRef.current,
        text,
        lang,
        customers.map((c) => c.name),
      );
      saveDraft(result.draft);
      const history = [...turnsRef.current, { role: 'user' as const, text }];
      saveTurns(history);
      finishReview(result.draft, history);
    } else finishReview(draftRef.current);
  }
  useEffect(() => {
    closingRef.current = false;
    const hide = () => suspend();
    const visibility = () => {
      if (document.hidden) hide();
    };
    window.addEventListener('pagehide', hide);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      closingRef.current = true;
      suspend();
      window.removeEventListener('pagehide', hide);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns, liveText]);
  const total = draftTotal(draft);
  const balance = Math.max(0, total - draft.advance);
  const statusText =
    mode === 'speaking'
      ? 'Speaking…'
      : listening
        ? 'Listening…'
        : mode === 'thinking'
          ? 'Working…'
          : 'Ready · tap mic';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-ink/50"
      />
      <div className="relative w-full md:max-w-md bg-background rounded-t-card pt-safe h-[92dvh] flex flex-col overflow-hidden">
        <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-line">
          <div className="flex items-center gap-1">
            <button
              onClick={onClose}
              aria-label="Back"
              className="w-9 h-9 rounded-full flex items-center justify-center text-muted hover:bg-ink/5 transition duration-200"
            >
              <ArrowLeft size={20} />
            </button>
            <span className="font-display font-bold text-lg text-ink">
              Talk to Bolo
            </span>
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
          {VOICE_LANGUAGES.map((language) => (
            <button
              key={language}
              disabled={listening || busyRef.current}
              onClick={() => setLang(language)}
              className={`shrink-0 min-h-[48px] px-3 rounded-full text-xs font-medium border ${lang === language ? 'bg-primary text-white border-primary' : 'bg-card border-line text-muted'}`}
            >
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
                  <li
                    key={i}
                    className="flex items-center justify-between text-sm"
                  >
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
              <span className="text-muted">
                Advance {formatINR(draft.advance)}
              </span>
              <span className="font-medium text-ink">
                Balance {formatINR(balance)}
              </span>
            </div>
          </div>
        </div>

        {/* Chat bubbles */}
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto px-5 py-4 space-y-2"
        >
          {turns.length === 0 && !liveText && (
            <p className="text-center text-muted text-sm mt-6 px-4">
              Just talk — "Ravi bought three shirts at 200 each", pause, then
              "advance 300".
            </p>
          )}
          {turns.map((t, i) => (
            <div
              key={i}
              className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'} bubble-in`}
            >
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
                <span
                  className="listen-bar inline-block w-1 h-3.5 rounded-full bg-white/90"
                  style={{ animationDelay: '0ms' }}
                />
                <span
                  className="listen-bar inline-block w-1 h-3.5 rounded-full bg-white/90"
                  style={{ animationDelay: '150ms' }}
                />
                <span
                  className="listen-bar inline-block w-1 h-3.5 rounded-full bg-white/90"
                  style={{ animationDelay: '300ms' }}
                />
                <span className="text-xs text-white italic ml-1">
                  I'm listening…
                </span>
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

        <div className="px-5 flex gap-2 flex-wrap">
          <button
            className="min-h-[48px] text-sm text-primary"
            onClick={() => {
              stopListening();
              typedEditedRef.current = true;
              typedRef.current =
                'Ravi Kumar, 3 shirts 200 each, 1 alteration 150, advance 300';
              setTyped(typedRef.current);
            }}
          >
            Try an example
          </button>
          {turns.some((t) => t.role === 'bolo') && (
            <button
              className="min-h-[48px] text-sm text-primary"
              onClick={() => {
                suspend();
                void speakReply(
                  [...turns].reverse().find((t) => t.role === 'bolo')!.text,
                  lang,
                );
              }}
            >
              Play reply
            </button>
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
                disabled={listening}
                className="w-12 h-12 rounded-full bg-primary flex items-center justify-center transition duration-200 active:scale-95 disabled:opacity-50"
              >
                <Mic size={18} className="text-white" />
              </button>
              <Button
                variant="outline"
                className="min-h-[40px] px-4"
                onClick={handleDone}
              >
                Done
              </Button>
            </div>
          </div>
          <p className="text-[11px] text-muted mb-2 break-words">
            engine: browser | status: {listening ? 'listening' : 'idle'} | last
            error: {lastError} | words:{' '}
            {typed.trim() ? typed.trim().split(/\s+/).length : 0}
          </p>
          <div className="flex gap-2">
            <input
              value={typed}
              onChange={(e) => {
                typedEditedRef.current = true;
                editBaseRef.current = e.target.value;
                editOffsetRef.current = recognitionTextRef.current.trim()
                  ? recognitionTextRef.current.trim().split(/\s+/).length
                  : 0;
                typedRef.current = e.target.value;
                setTyped(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitTyped();
              }}
              placeholder="Type instead…"
              className="min-w-0 flex-1 min-h-[48px] px-4 rounded-full border border-line bg-card text-ink placeholder:text-muted/60 focus:outline-none focus:border-primary transition duration-200"
            />
            <button
              onClick={submitTyped}
              aria-label="Send"
              disabled={!typed.trim()}
              className="w-12 h-12 rounded-full bg-primary flex items-center justify-center transition duration-200 active:scale-95 disabled:opacity-50"
            >
              <Send size={18} className="text-white" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
