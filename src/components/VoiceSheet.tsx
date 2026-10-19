import { useEffect, useRef, useState } from 'react';
import { Mic, X, Keyboard, AlertCircle, MessageCircle, Check } from 'lucide-react';
import type { Business, Language } from '@/lib/types';
import { LANGUAGE_LABELS } from '@/lib/format';
import { startListenSession, isSpeechSupported } from '@/lib/speech';
import type { ListenSession } from '@/lib/speech';
import { Button } from '@/components/ui/Button';
import { MicLevelMeter } from '@/components/MicLevelMeter';

const LANGS = Object.keys(LANGUAGE_LABELS) as Language[];
const EMPTY_MESSAGE = "I didn't hear anything. Tap the mic and speak right away, or type below.";
export const EXAMPLE_SENTENCE = 'Ravi Kumar, 3 shirts stitching 200 each, 1 alteration 150, advance paid 300';

export function VoiceSheet({
  business,
  onClose,
  onParsed,
  onTalk,
}: {
  business: Business;
  onClose: () => void;
  onParsed: (transcript: string, lang: Language) => void;
  onTalk?: () => void;
}) {
  const supported = isSpeechSupported();
  const [lang, setLang] = useState<Language>(business.language);
  const [listening, setListening] = useState(false);
  const [text, setText] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastError, setLastError] = useState('none');
  const sessionRef = useRef<ListenSession | null>(null);
  const submittedRef = useRef(false);
  const textRef = useRef('');
  const editedRef = useRef(false);

  useEffect(() => {
    return () => {
      sessionRef.current?.stop();
      sessionRef.current = null;
    };
  }, []);

  function updateText(value: string) {
    textRef.current = value;
    setText(value);
  }

  function submit(value: string) {
    if (submittedRef.current) return;
    const clean = value.trim();
    if (!clean) {
      updateText(value);
      setListening(false);
      setMessage(EMPTY_MESSAGE);
      return;
    }
    submittedRef.current = true;
    sessionRef.current = null;
    setListening(false);
    setBusy(true);
    onParsed(clean, lang);
  }

  function finishListening() {
    const session = sessionRef.current;
    if (!session) return;
    sessionRef.current = null;
    session.stop();
  }

  function beginListening() {
    if (submittedRef.current || listening) return;
    setMessage(null);
    updateText('');
    editedRef.current = false;
    setLastError('none');
    const session = startListenSession(lang, {
      onTranscript: (value) => {
        if (!editedRef.current) updateText(value);
      },
      onStateChange: (state) => setListening(state !== 'stopped'),
      onFinish: (transcript) => {
        const edited = editedRef.current ? textRef.current : transcript;
        submit(edited);
      },
      onError: (code) => {
        setLastError(code || 'unknown');
        if (code === 'not-allowed' || code === 'service-not-allowed') {
          setMessage('Microphone access is blocked. Allow it in your browser settings, or type your bill below.');
        } else if (code === 'audio-capture') {
          setMessage("We couldn't find a working microphone. Check your microphone or type your bill below.");
        }
      },
    });
    if (!session) {
      setLastError('unsupported');
      setMessage('Voice input is not available in this browser. Type your bill below.');
      return;
    }
    sessionRef.current = session;
    setListening(true);
  }

  const meter = <MicLevelMeter stream={null} active={listening} />;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/50" />
      <div className="relative w-full md:max-w-md bg-background rounded-t-card pt-safe pb-safe max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 z-10 bg-background px-5 pt-4 pb-3 flex items-center justify-between">
          <span className="w-9" />
          <span className="font-display font-bold text-lg text-ink">Speak your bill</span>
          <button onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full flex items-center justify-center text-muted hover:bg-ink/5 transition duration-200">
            <X size={20} />
          </button>
        </div>

        <div className="px-5 pb-6">
          <div className="flex flex-wrap justify-center gap-2 pb-1 mb-4">
            {LANGS.map((language) => (
              <button key={language} onClick={() => setLang(language)} className={`shrink-0 min-h-[40px] px-4 rounded-full text-sm font-medium border transition duration-200 ${lang === language ? 'bg-primary text-white border-primary' : 'bg-card border-line text-muted hover:text-ink'}`}>
                {LANGUAGE_LABELS[language].label}
              </button>
            ))}
          </div>

          <div className="flex justify-center mb-5">
            <button onClick={() => { updateText('Ravi Kumar, 3 shirts stitching 200 each, 1 alteration 150, advance paid 300'); editedRef.current = true; setMessage(null); }} className="min-h-[40px] px-4 rounded-full bg-lime/40 text-ink text-sm font-medium transition duration-200 hover:bg-lime/60">
              Try an example
            </button>
          </div>

          {supported && (
            <div className="flex flex-col items-center">
              <div className="flex items-center gap-5 mb-3">
                <div className="relative w-24 h-24 sm:w-28 sm:h-28">
                  {listening && <span className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />}
                  <button onClick={listening ? finishListening : beginListening} aria-label={listening ? 'Done' : 'Start listening'} className={`relative w-24 h-24 sm:w-28 sm:h-28 rounded-full flex items-center justify-center shadow-mic transition duration-200 active:scale-95 ${listening ? 'bg-danger' : 'bg-primary'}`}>
                    {listening ? <Check size={36} className="text-white" /> : <Mic size={44} className="text-white" />}
                  </button>
                </div>
                {!listening && onTalk && (
                  <button onClick={onTalk} className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-card border-2 border-primary/40 flex flex-col items-center justify-center gap-1.5 transition duration-200 hover:border-primary active:scale-95">
                    <MessageCircle size={28} className="text-primary" />
                    <span className="text-xs font-bold text-primary leading-tight text-center">Talk to Bolo</span>
                  </button>
                )}
              </div>
              {listening && meter}
              <p className="w-full text-center text-[11px] leading-4 text-muted mt-1 mb-2 break-words">
                engine: browser | status: {listening ? 'listening' : 'idle'} | last error: {lastError} | words: {text.trim() ? text.trim().split(/\s+/).length : 0}
              </p>
              {listening && <Button variant="outline" className="w-full mb-3" onClick={finishListening}>Done</Button>}
            </div>
          )}

          {message && <div role="status" className="flex items-start gap-2 mt-2 mb-3 w-full p-3 rounded-2xl bg-danger/10"><AlertCircle size={18} className="text-danger shrink-0 mt-0.5" /><p className="text-sm text-ink">{message}</p></div>}
          {busy && <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary/10 mb-3" role="progressbar" aria-label="Preparing invoice"><div className="h-full w-1/3 rounded-full bg-primary animate-pulse" /></div>}

          <div className="mt-2">
            <textarea value={text} onChange={(event) => { editedRef.current = true; updateText(event.target.value); setMessage(null); }} rows={4} placeholder={listening ? 'Your words will appear here as you speak…' : 'Type your bill, or tap the mic and speak…'} className="w-full min-h-[112px] max-h-[180px] p-4 rounded-2xl border border-line bg-card text-ink placeholder:text-muted/60 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition duration-200 resize-y" />
            <Button className="w-full mt-3" disabled={!text.trim() || busy || submittedRef.current} onClick={() => { sessionRef.current?.stop(); sessionRef.current = null; submit(textRef.current); }}>
              <Keyboard size={17} className="mr-2" /> Review invoice
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
