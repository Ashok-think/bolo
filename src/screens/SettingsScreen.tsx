import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Upload,
  Volume2,
  VolumeX,
  Mic,
  Loader2,
  Play,
  AlertCircle,
} from 'lucide-react';
import type { Business, Language } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { useDemoData } from '@/hooks/useDemoData';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { LanguagePicker } from '@/components/LanguagePicker';
import { MicLevelMeter } from '@/components/MicLevelMeter';
import { useToast } from '@/components/ui/Toast';
import { isValidUpiId } from '@/lib/upi';
import { speakReplyDetailed, stopPlayback } from '@/lib/geminiVoice';
import { runBackgroundAI } from '@/lib/parser';
import { parseWithRules } from '@/lib/parserRules';
import { getAccessToken } from '@/lib/converse';
import {
  speakRepliesEnabled,
  setSpeakReplies,
  geminiVoiceEnabled,
  setGeminiVoice,
} from '@/lib/voiceFeedback';
import { startMicTest } from '@/lib/audioInput';
import {
  setMicOpen,
  speakConfirmationsEnabled,
  setSpeakConfirmations,
  talkModeEnabled,
  setTalkMode,
} from '@/lib/voiceFeedback';

export function SettingsScreen({
  business,
  onBack,
  onBusinessUpdated,
}: {
  business: Business;
  onBack: () => void;
  onBusinessUpdated: (b: Business) => void;
}) {
  const [name, setName] = useState(business.name);
  const [upiId, setUpiId] = useState(business.upi_id);
  const [phone, setPhone] = useState(business.phone ?? '');
  const [language, setLanguage] = useState<Language>(business.language);
  const [saving, setSaving] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const { loadDemoData, inserting, error: demoError } = useDemoData();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [replyOn, setReplyOn] = useState(speakRepliesEnabled);
  const [geminiOn, setGeminiOn] = useState(geminiVoiceEnabled);
  const [voiceStatus, setVoiceStatus] = useState('');
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [testText, setTestText] = useState(
    'Ravi Kumar, 3 shirts 200 each, 1 alteration 150, advance 300',
  );
  const [understanding, setUnderstanding] = useState('');
  const [understandingBusy, setUnderstandingBusy] = useState(false);
  const [healthBusy, setHealthBusy] = useState(false);
  const [health, setHealth] = useState<
    { name: string; ok: boolean; reason: string }[]
  >([]);
  const [isDemo, setIsDemo] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const disposedRef = useRef(false);
  const micHandleRef = useRef<{ stop: () => void } | null>(null);
  useEffect(() => {
    void supabase.auth
      .getUser()
      .then(({ data }) => setIsDemo(data.user?.email === 'demo@bolo.app'));
  }, []);
  const [speakOn, setSpeakOn] = useState(() => speakConfirmationsEnabled());
  const [talkModeOn, setTalkModeOn] = useState(() => talkModeEnabled());
  const [micTestState, setMicTestState] = useState<
    'idle' | 'recording' | 'ready' | 'playing' | 'error'
  >('idle');
  const [micTestError, setMicTestError] = useState<string | null>(null);
  const [micTestStream, setMicTestStream] = useState<MediaStream | null>(null);
  const micTestAudioRef = useRef<HTMLAudioElement | null>(null);
  const micTestUrlRef = useRef<string | null>(null);

  useEffect(() => {
    disposedRef.current = false;
    const stop = () => {
      stopPlayback();
      micHandleRef.current?.stop();
      setMicOpen(false);
      micTestAudioRef.current?.pause();
    };
    const visibility = () => {
      if (document.hidden) stop();
    };
    window.addEventListener('pagehide', stop);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      disposedRef.current = true;
      stop();
      if (micTestUrlRef.current) URL.revokeObjectURL(micTestUrlRef.current);
      window.removeEventListener('pagehide', stop);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);

  async function handleMicTest() {
    if (micTestState === 'recording' || micTestState === 'playing') return;
    if (micTestState === 'ready' && micTestUrlRef.current) {
      // Play back the last recording.
      setMicTestState('playing');
      const audio = new Audio(micTestUrlRef.current);
      micTestAudioRef.current = audio;
      audio.onended = () => setMicTestState('ready');
      audio.onerror = () => setMicTestState('ready');
      void audio.play().catch(() => setMicTestState('ready'));
      return;
    }
    setMicTestError(null);
    if (micTestUrlRef.current) {
      URL.revokeObjectURL(micTestUrlRef.current);
      micTestUrlRef.current = null;
    }
    stopPlayback();
    setMicOpen(true);
    setMicTestState('recording');
    const handle = await startMicTest(
      3000,
      {
        onFinish: (blob) => {
          setMicOpen(false);
          if (disposedRef.current) return;
          setMicTestStream(null);
          const url = URL.createObjectURL(blob);
          micTestUrlRef.current = url;
          setMicTestState('ready');
        },
        onError: () => {
          setMicOpen(false);
          if (disposedRef.current) return;
          setMicTestStream(null);
          setMicTestState('error');
          setMicTestError(
            'Microphone blocked, tap the lock icon in the address bar and allow it',
          );
        },
      },
      (stream) => {
        if (disposedRef.current) stream.getTracks().forEach((t) => t.stop());
        else setMicTestStream(stream);
      },
    );
    if (disposedRef.current) {
      handle?.stop();
      return;
    }
    micHandleRef.current = handle;
    if (!handle) {
      setMicOpen(false);
      setMicTestState('error');
    }
  }

  useEffect(() => {
    setName(business.name);
    setUpiId(business.upi_id);
    setPhone(business.phone ?? '');
    setLanguage(business.language);
  }, [business]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidUpiId(upiId)) {
      toast('error', 'Enter a valid UPI ID, e.g. name@upi');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('businesses')
      .update({
        name: name.trim(),
        upi_id: upiId.trim(),
        phone: phone.trim() || null,
        language,
      })
      .eq('id', business.id);
    setSaving(false);
    if (error) {
      toast('error', 'Could not save changes.');
    } else {
      // Refetch the saved row so every page sees fresh values, not local guesses.
      const { data } = await supabase
        .from('businesses')
        .select('*')
        .eq('id', business.id)
        .maybeSingle();
      if (data) onBusinessUpdated(data as Business);
      toast('success', 'Business details saved.');
    }
  }

  async function handleQrUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      toast('error', 'Please choose a PNG or JPG image.');
      return;
    }
    if (file.size > 1024 * 1024) {
      toast('error', 'Image must be under 1 MB.');
      return;
    }
    const path = `${business.user_id}/qr-${Date.now()}`;
    const { error: upErr } = await supabase.storage
      .from('payment-qr')
      .upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) {
      console.error('QR image upload failed:', upErr);
      toast('error', 'Could not upload the QR image.');
      return;
    }
    const { data: urlData } = supabase.storage
      .from('payment-qr')
      .getPublicUrl(path);
    const { error: dbErr } = await supabase
      .from('businesses')
      .update({ qr_image_url: urlData.publicUrl })
      .eq('id', business.id);
    if (dbErr) {
      console.error('Saving QR image URL failed:', dbErr);
      toast('error', 'Could not save the QR image.');
      return;
    }
    const { data } = await supabase
      .from('businesses')
      .select('*')
      .eq('id', business.id)
      .maybeSingle();
    if (data) onBusinessUpdated(data as Business);
    toast('success', 'Payment QR image saved.');
  }

  async function handleLoadDemo() {
    const ok = await loadDemoData(business.id);
    if (ok) {
      toast('success', 'Demo data loaded.');
    } else {
      toast('error', demoError ?? 'Could not load demo data.');
    }
  }

  async function handleCheckAI() {
    if (healthBusy) return;
    setHealthBusy(true);
    setHealth([]);
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 10000);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Sign in first.');
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-health`,
        {
          method: 'POST',
          signal: abort.signal,
          headers: {
            Authorization: `Bearer ${token}`,
            Apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          body: '{}',
        },
      );
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || 'Deploy ai-health through Bolt first.');
      setHealth(data.providers || []);
    } catch (e) {
      setHealth([
        {
          name: 'AI check',
          ok: false,
          reason:
            e instanceof Error && e.name !== 'AbortError'
              ? e.message
              : 'AI check timed out. Verify deployed functions and Bolt secrets.',
        },
      ]);
    } finally {
      clearTimeout(timer);
      setHealthBusy(false);
    }
  }
  async function handleUnderstanding() {
    if (understandingBusy || !testText.trim()) return;
    setUnderstandingBusy(true);
    try {
      const ai = await runBackgroundAI(testText, language);
      const parsed = ai || parseWithRules(testText, language);
      const total = parsed.items.reduce(
        (s, i) => s + i.quantity * i.unit_price,
        0,
      );
      setUnderstanding(
        `${ai ? 'AI understood' : 'Rules result (AI unavailable)'}\nCustomer: ${parsed.customer || 'Add the customer name'}\n${parsed.items.map((i) => `${i.quantity} × ${i.name} at ₹${i.unit_price}`).join('\n')}\nTotal: ₹${total} · Advance: ₹${parsed.advance} · Balance: ₹${Math.max(0, total - parsed.advance)}`,
      );
    } finally {
      setUnderstandingBusy(false);
    }
  }
  async function handleTestVoice() {
    if (voiceBusy) {
      stopPlayback();
      setVoiceBusy(false);
      return;
    }
    setVoiceBusy(true);
    setVoiceStatus('Preparing a voice sample. You can stop it at any time.');
    const text =
      language === 'hi'
        ? 'नमस्ते, मैं बोलो हूँ। आपका बिल तैयार है।'
        : language === 'te'
          ? 'నమస్కారం, నేను బోలో. మీ బిల్లు సిద్ధంగా ఉంది.'
          : 'Hello, I am Bolo. Your invoice is ready.';
    try {
      const result = await speakReplyDetailed(text, language, geminiOn);
      setVoiceStatus(result.reason);
    } finally {
      setVoiceBusy(false);
    }
  }
  async function handleResetDemo() {
    if (!isDemo || resetBusy) return;
    setResetBusy(true);
    const { error } = await supabase.rpc('reset_demo_data', {
      p_business_id: business.id,
    });
    setResetBusy(false);
    if (error)
      toast(
        'error',
        'Could not reset demo. Apply the P0 Bolt migration first.',
      );
    else {
      toast('success', 'Demo values cleared.');
      window.location.reload();
    }
  }

  async function handleSignOut() {
    setConfirmSignOut(false);
    await supabase.auth.signOut();
  }

  return (
    <div className="px-5 pt-2 pb-32">
      <div className="flex items-center gap-2 mb-5">
        <button
          onClick={onBack}
          aria-label="Go back"
          className="w-12 h-12 -ml-2 rounded-full flex items-center justify-center text-ink hover:bg-ink/5 transition duration-200"
        >
          <ArrowLeft size={22} />
        </button>
        <h1 className="font-display font-bold text-xl text-ink">Settings</h1>
      </div>

      <Card className="p-5">
        <form onSubmit={handleSave} className="space-y-4">
          <Input
            label="Business Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Input
            label="UPI ID"
            value={upiId}
            onChange={(e) => setUpiId(e.target.value)}
            required
            error={
              upiId && !isValidUpiId(upiId)
                ? 'Enter a valid UPI ID, e.g. name@upi'
                : null
            }
          />
          <Input
            label="WhatsApp Number"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <div>
            <span className="block text-sm font-medium text-ink mb-2">
              Language
            </span>
            <LanguagePicker value={language} onChange={setLanguage} />
            <p className="text-xs text-muted mt-2">
              Used for voice recognition and reminders only.
            </p>
          </div>
          <Button type="submit" loading={saving} className="w-full">
            Save
          </Button>
        </form>
      </Card>

      <Card className="p-5 mt-4">
        <h2 className="font-display font-bold text-ink">
          Your payment QR image
        </h2>
        <p className="text-sm text-muted mt-1 mb-4">
          Optional. If the automatic QR ever fails, customers see this image
          instead.
        </p>
        {business.qr_image_url && (
          <div className="mb-4 flex justify-center">
            <img
              src={business.qr_image_url}
              alt="Your payment QR"
              className="w-40 rounded-2xl border border-line"
            />
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={handleQrUpload}
        />
        <Button
          variant="outline"
          className="w-full"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload size={18} className="text-primary" /> Upload your own payment
          QR image
        </Button>
      </Card>

      <Card className="p-5 mt-4 space-y-3">
        <h2 className="font-display font-bold text-ink">AI and reply voice</h2>
        <p className="text-sm text-muted">
          Speech input uses your browser. AI understands the text; reply audio
          uses the voice you choose below.
        </p>
        <Button
          variant="outline"
          className="w-full"
          disabled={healthBusy}
          onClick={handleCheckAI}
        >
          {healthBusy ? 'Checking AI…' : 'Check AI'}
        </Button>
        {health.map((p) => (
          <p
            key={p.name}
            className={`text-sm ${p.ok ? 'text-primary' : 'text-danger'}`}
          >
            {p.ok ? '✓' : '✕'} {p.name}: {p.reason}
          </p>
        ))}
        <label className="flex gap-3 items-center min-h-[48px]">
          <input
            type="checkbox"
            checked={replyOn}
            onChange={(e) => {
              setReplyOn(e.target.checked);
              setSpeakReplies(e.target.checked);
              if (!e.target.checked) stopPlayback();
            }}
          />
          <Volume2 size={18} /> Speak replies
        </label>
        <div className="flex gap-2">
          <button
            className={`min-h-[48px] flex-1 rounded-full border ${!geminiOn ? 'bg-primary text-white' : 'border-line'}`}
            onClick={() => {
              setGeminiOn(false);
              setGeminiVoice(false);
            }}
          >
            Device voice
          </button>
          <button
            className={`min-h-[48px] flex-1 rounded-full border ${geminiOn ? 'bg-primary text-white' : 'border-line'}`}
            onClick={() => {
              setGeminiOn(true);
              setGeminiVoice(true);
            }}
          >
            Gemini voice
          </button>
        </div>
        <p className="text-xs text-muted">
          Gemini voice needs the deployed speak-reply function and a Gemini key
          in Bolt. Device voice is the default; if Gemini is unavailable, the
          reply remains visible and device voice is tried.
        </p>
        <Button variant="outline" className="w-full" onClick={handleTestVoice}>
          {voiceBusy ? 'Stop voice test' : 'Test voice'}
        </Button>
        {voiceStatus && (
          <p className="text-sm text-muted" role="status">
            {voiceStatus}
          </p>
        )}
        <label className="block text-sm font-medium">
          Test understanding
          <textarea
            aria-label="Test understanding text"
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
            className="mt-2 w-full p-3 border border-line rounded-2xl bg-background"
            rows={3}
          />
        </label>
        <Button
          variant="outline"
          className="w-full"
          disabled={understandingBusy || !testText.trim()}
          onClick={handleUnderstanding}
        >
          {understandingBusy ? 'Testing understanding…' : 'Test understanding'}
        </Button>
        {understanding && (
          <p className="whitespace-pre-wrap text-sm text-ink" role="status">
            {understanding}
          </p>
        )}
      </Card>

      <Card className="p-5 mt-4">
        <h2 className="font-display font-bold text-ink">Test microphone</h2>
        <p className="text-sm text-muted mt-1 mb-4">
          Records 3 seconds so you can check your mic works, then plays it back.
        </p>
        {micTestState === 'recording' && micTestStream && (
          <div className="mb-4">
            <MicLevelMeter stream={micTestStream} active />
            <p className="text-xs text-muted text-center mt-1">
              Recording… speak now
            </p>
          </div>
        )}
        {micTestError && (
          <div className="flex items-start gap-2 mb-3 p-3 rounded-2xl bg-danger/10">
            <AlertCircle size={18} className="text-danger shrink-0 mt-0.5" />
            <p className="text-sm text-ink">{micTestError}</p>
          </div>
        )}
        <Button
          variant="outline"
          className="w-full"
          onClick={handleMicTest}
          disabled={micTestState === 'recording' || micTestState === 'playing'}
        >
          {micTestState === 'recording' ? (
            <>
              <Loader2 size={18} className="animate-spin text-primary" />{' '}
              Recording…
            </>
          ) : micTestState === 'playing' ? (
            <>
              <Loader2 size={18} className="animate-spin text-primary" />{' '}
              Playing…
            </>
          ) : micTestState === 'ready' ? (
            <>
              <Play size={18} className="text-primary" /> Play recording back
            </>
          ) : (
            <>
              <Mic size={18} className="text-primary" /> Record 3 seconds
            </>
          )}
        </Button>
      </Card>

      <Card className="p-5 mt-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-display font-bold text-ink flex items-center gap-2">
              Speak confirmations
              {speakOn ? (
                <Volume2 size={18} className="text-primary" />
              ) : (
                <VolumeX size={18} className="text-muted" />
              )}
            </h2>
            <p className="text-sm text-muted mt-1">
              Bolo reads a short confirmation after each invoice is added.
            </p>
          </div>
          <button
            onClick={() => {
              const next = !speakOn;
              setSpeakOn(next);
              setSpeakConfirmations(next);
            }}
            role="switch"
            aria-checked={speakOn}
            aria-label="Speak confirmations"
            className={`shrink-0 w-12 h-7 rounded-full transition duration-200 relative ${
              speakOn ? 'bg-primary' : 'bg-line'
            }`}
          >
            <span
              className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition duration-200 ${
                speakOn ? 'left-[22px]' : 'left-0.5'
              }`}
            />
          </button>
        </div>
      </Card>

      <Card className="p-5 mt-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-display font-bold text-ink">Talk mode</h2>
            <p className="text-sm text-muted mt-1">
              Turn-based conversation where Bolo asks questions. Off by default
              — when off, the single-sentence voice flow is the default.
            </p>
          </div>
          <button
            onClick={() => {
              const next = !talkModeOn;
              setTalkModeOn(next);
              setTalkMode(next);
            }}
            role="switch"
            aria-checked={talkModeOn}
            aria-label="Talk mode"
            className={`shrink-0 w-12 h-7 rounded-full transition duration-200 relative ${
              talkModeOn ? 'bg-primary' : 'bg-line'
            }`}
          >
            <span
              className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition duration-200 ${
                talkModeOn ? 'left-[22px]' : 'left-0.5'
              }`}
            />
          </button>
        </div>
      </Card>

      <Card className="p-5 mt-4">
        <h2 className="font-display font-bold text-ink">Demo data</h2>
        {isDemo && (
          <>
            <p className="text-sm text-muted mt-2">
              Clear the sample customers and invoices in this shared demo
              account. The demo business details are reset too. Add a UPI ID
              before testing payment QR codes.
            </p>
            <Button
              variant="outline"
              className="w-full mt-3 mb-3"
              disabled={resetBusy}
              onClick={handleResetDemo}
            >
              {resetBusy ? 'Clearing demo…' : 'Clear demo values'}
            </Button>
          </>
        )}
        <p className="text-sm text-muted mt-1 mb-4">
          Adds 6 sample customers and 12 invoices so you can explore the app.
        </p>
        <Button
          variant="amber-outline"
          onClick={handleLoadDemo}
          loading={inserting}
          disabled={inserting}
          className="w-full"
        >
          Load Demo Data
        </Button>
      </Card>

      <Button
        variant="danger"
        onClick={() => setConfirmSignOut(true)}
        className="w-full mt-6"
      >
        Sign Out
      </Button>

      {confirmSignOut && (
        <div
          className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center px-5"
          role="dialog"
          aria-modal="true"
        >
          <Card className="w-full max-w-sm p-6">
            <h2 className="font-display font-bold text-lg text-ink">
              Sign out?
            </h2>
            <p className="text-muted text-sm mt-1 mb-5">
              You can sign back in anytime with your email and password.
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setConfirmSignOut(false)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                onClick={handleSignOut}
              >
                Sign Out
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
