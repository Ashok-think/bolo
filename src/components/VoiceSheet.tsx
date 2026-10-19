import { useEffect, useRef, useState } from 'react';
import { Mic, X, Keyboard, AlertCircle, MessageCircle, Check, Loader2 } from 'lucide-react';
import type { Business, Language } from '@/lib/types';
import { LANGUAGE_LABELS } from '@/lib/format';
import { startListenSession, isSpeechSupported } from '@/lib/speech';
import type { ListenSession } from '@/lib/speech';
import { transcribeAudio } from '@/lib/converse';
import { startVoiceRecording } from '@/lib/audioInput';
import type { VoiceRecording } from '@/lib/audioInput';
import { setMicOpen } from '@/lib/voiceFeedback';
import { Button } from '@/components/ui/Button';
import { MicLevelMeter } from '@/components/MicLevelMeter';

const LANGS: Language[] = ['en', 'hi', 'te'];

const ERR = {
  blocked:
    'Microphone blocked, tap the lock icon in the address bar and allow it',
  noMic: 'No microphone found',
  noSpeech: 'No speech detected, speak right after tapping',
  offline: 'No internet',
  ai: 'The AI could not hear this, try again',
} as const;

export const EXAMPLE_SENTENCE =
  'Ravi Kumar, 3 shirts stitching 200 each, 1 alteration 150, advance paid 300';

type Engine = 'ai' | 'browser' | null;

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

  const [lang, setLang] = useState<Language>(business.language === 'en' || business.language === 'hi' || business.language === 'te' ? business.language : 'en');
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [engine, setEngine] = useState<Engine>(null);
  const [meterStream, setMeterStream] = useState<MediaStream | null>(null);

  const sessionRef = useRef<ListenSession | null>(null);
  const recordingRef = useRef<VoiceRecording | null>(null);
  const submittedRef = useRef(false);
  const retriedRef = useRef(false);

  useEffect(() => {
    return () => {
      // Closing the sheet releases the mic and never submits on unmount.
      submittedRef.current = true;
      recordingRef.current?.cancel();
      recordingRef.current = null;
      sessionRef.current?.stop();
      sessionRef.current = null;
      setMicOpen(false);
    };
  }, []);

  // Browser fallback: the browser's built-in recognition only.
  function beginBrowserSession() {
    if (submittedRef.current) return;
    setMicOpen(false);
    setMeterStream(null);
    setEngine('browser');
    const session = startListenSession(lang, {
      onTranscript: (text) => setTranscript(text),
      onStateChange: (state) => setListening(state !== 'stopped'),
      onFinish: (text) => {
        sessionRef.current = null;
        void submit(text, 'browser');
      },
      onError: (code) => {
        if (code === 'not-allowed' || code === 'service-not-allowed') setError(ERR.blocked);
        else if (code === 'audio-capture') setError(ERR.noMic);
        else setError(ERR.noSpeech);
      },
    });
    if (!session) {
      setError(ERR.blocked);
      return;
    }
    sessionRef.current = session;
    setListening(true);
  }

  function beginSession() {
    if (submittedRef.current) return;
    setError(null);
    setTranscript('');
    setMicOpen(true);

    // Primary path: record WAV and let the AI (Gemini) transcribe it. One
    // capture path at a time — the browser recognizer only runs on retry.
    void (async () => {
      const recording = await startVoiceRecording({
        onStream: (stream) => {
          setMeterStream(stream);
          setEngine('ai');
        },
        onFinish: (blob) => {
          recordingRef.current = null;
          setMeterStream(null);
          setListening(false);
          setTranscribing(true);
          void (async () => {
            const result = await transcribeAudio(blob, lang);
            if (submittedRef.current) return;
            setTranscribing(false);
            setMicOpen(false);
            if (result.ok) {
              void submit(result.text, 'ai');
            } else if (!retriedRef.current) {
              retriedRef.current = true;
              beginBrowserSession();
            } else {
              setError(result.code === 'offline' ? ERR.offline : ERR.ai);
            }
          })();
        },
        onError: (code) => {
          recordingRef.current = null;
          setMeterStream(null);
          setMicOpen(false);
          if (code === 'not-allowed') {
            setError(ERR.blocked);
          } else if (code === 'no-mic') {
            setError(ERR.noMic);
          } else if (!retriedRef.current) {
            retriedRef.current = true;
            beginBrowserSession();
          } else {
            setError(ERR.noMic);
          }
        },
      });
      if (recording) {
        recordingRef.current = recording;
        setListening(true);
      } else {
        beginBrowserSession();
      }
    })();
  }

  function finishListening() {
    recordingRef.current?.stop();
    sessionRef.current?.stop();
    sessionRef.current = null;
    setListening(false);
  }

  async function submit(text: string, usedEngine: Engine) {
    const clean = text.trim();
    if (submittedRef.current) return;
    if (!clean) {
      setError(usedEngine === 'browser' ? ERR.noSpeech : ERR.ai);
      return;
    }
    submittedRef.current = true;
    setListening(false);
    setBusy(true);
    onParsed(clean, lang);
  }

  const meter = (
    <MicLevelMeter stream={meterStream} active={listening && engine === 'ai'} />
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/50" />
      <div className="relative w-full md:max-w-md bg-background rounded-t-card pt-safe pb-safe max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-background px-5 pt-4 pb-3 flex items-center justify-between">
          <span className="w-9" />
          <span className="font-display font-bold text-lg text-ink">Speak your bill</span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 rounded-full flex items-center justify-center text-muted hover:bg-ink/5 transition duration-200"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-5 pb-6">
          {/* Language chips: flags and country codes removed */}
          <div className="flex flex-wrap gap-2 justify-center mb-5">
            {LANGS.map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`min-h-[40px] px-4 rounded-full text-sm font-medium border transition duration-200 ${
                  lang === l
                    ? 'bg-primary text-white border-primary'
                    : 'bg-card border-line text-muted hover:text-ink'
                }`}
              >
                {LANGUAGE_LABELS[l].label}
              </button>
            ))}
          </div>

          {/* Example chip */}
          <div className="flex justify-center mb-6">
            <button
              onClick={() => setTyped(EXAMPLE_SENTENCE)}
              className="min-h-[40px] px-4 rounded-full bg-lime/40 text-ink text-sm font-medium transition duration-200 hover:bg-lime/60"
            >
              Try an example
            </button>
          </div>

          {supported ? (
            <div className="flex flex-col items-center">
              {/* Mic + Talk */}
              <div className="flex items-center gap-6 mb-5">
                <div className="relative w-28 h-28">
                  {listening && (
                    <>
                      <span className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
                      <span
                        className="absolute inset-0 rounded-full bg-primary/20 animate-ping"
                        style={{ animationDelay: '300ms' }}
                      />
                    </>
                  )}
                  <button
                    onClick={listening ? finishListening : beginSession}
                    aria-label={listening ? 'Done' : 'Start listening'}
                    className={`relative w-28 h-28 rounded-full flex items-center justify-center shadow-mic transition duration-200 active:scale-95 ${
                      listening ? 'bg-danger' : 'bg-primary'
                    }`}
                  >
                    {listening ? (
                      <Check size={36} className="text-white" />
                    ) : (
                      <Mic size={44} className="text-white" />
                    )}
                  </button>
                </div>
                {!listening && onTalk && (
                  <button
                    onClick={onTalk}
                    className="w-28 h-28 rounded-full bg-card border-2 border-primary/40 flex flex-col items-center justify-center gap-1.5 transition duration-200 hover:border-primary active:scale-95"
                  >
                    <MessageCircle size={30} className="text-primary" />
                    <span className="text-xs font-bold text-primary leading-tight text-center">
                      Talk to Bolo
                    </span>
                  </button>
                )}
              </div>

              {/* Level meter while the mic is open */}
              {listening && meter}

              {/* Live transcript + visible listening state */}
              <div className="w-full min-h-[96px] bg-card border border-line rounded-2xl p-4 text-center flex flex-col items-center justify-center">
                {transcribing ? (
                  <>
                    <Loader2 size={18} className="animate-spin text-primary mb-2" />
                    <p className="text-muted">Understanding what you said…</p>
                  </>
                ) : transcript ? (
                  <p className="text-ink">{transcript}</p>
                ) : listening ? (
                  <p className="text-muted">Still listening…</p>
                ) : (
                  <p className="text-muted text-sm">
                    Tap the mic and say your bill, e.g. "Ravi 3 shirts 200 each"
                  </p>
                )}
                {engine && (
                  <p className="text-xs text-muted mt-2">
                    {engine === 'ai' ? 'AI listening' : 'Browser listening'}
                  </p>
                )}
              </div>

              {error && (
                <div className="flex items-start gap-2 mt-3 w-full p-3 rounded-2xl bg-danger/10">
                  <AlertCircle size={18} className="text-danger shrink-0 mt-0.5" />
                  <p className="text-sm text-ink">{error}</p>
                </div>
              )}

              {/* Done button always visible while listening */}
              {listening && (
                <Button variant="outline" className="w-full mt-4" onClick={finishListening}>
                  Done
                </Button>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <div className="w-full min-h-[96px] bg-card border border-line rounded-2xl p-4 text-center flex flex-col items-center justify-center mb-3">
                <p className="text-muted text-sm">
                  Voice input isn't available in this browser — please type your bill below.
                </p>
              </div>
            </div>
          )}

          {/* Typing box always visible so a bill can always be created */}
          <div className="mt-2">
            <textarea
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              rows={4}
              placeholder='e.g. "Ravi Kumar, 3 shirts stitching 200 each, advance paid 300"'
              className="w-full p-4 rounded-2xl border border-line bg-card text-ink placeholder:text-muted/60 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition duration-200 resize-none"
            />
            <Button
              className="w-full mt-3"
              disabled={!typed.trim() || busy || submittedRef.current}
              onClick={() => submit(typed, null)}
            >
              Review invoice
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
