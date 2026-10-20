import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { signInDemoAccount } from '@/lib/demoAccount';
import { BoloLogo } from '@/components/BoloLogo';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';

type Mode = 'signin' | 'signup';

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(() => {
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.slice(1));
    return query.has('error') || hash.has('error')
      ? 'Google sign-in was not completed. Try again or use email and password.'
      : null;
  });
  const [busy, setBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  const friendlyError = (raw: string): string => {
    if (raw.includes('Invalid login credentials')) return 'Wrong email or password. Try again.';
    if (raw.includes('already registered') || raw.includes('already been registered'))
      return 'This email already has an account. Sign in instead.';
    if (raw.includes('valid email')) return 'Please enter a valid email address.';
    return 'Something went wrong. Please try again.';
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === 'signup') {
      if (password.length < 6) {
        setError('Password must be at least 6 characters.');
        return;
      }
      if (password !== confirm) {
        setError('Passwords do not match.');
        return;
      }
    }

    setBusy(true);
    const { error: authError } =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    setBusy(false);

    if (authError) setError(friendlyError(authError.message));
  }

  async function handleDemo() {
    setError(null);
    setDemoBusy(true);
    const { error: demoError } = await signInDemoAccount();
    setDemoBusy(false);
    if (demoError) setError(demoError);
  }

  async function handleGoogle() {
    setError(null);
    // Google blocks OAuth inside Bolt's embedded preview.
    if (window.self !== window.top) {
      setError('Open the published app in a new tab to continue with Google.');
      return;
    }
    setGoogleBusy(true);
    try {
      const { error: googleError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/` },
      });
      if (googleError) {
        setError('Google sign-in could not start. Please try again or use email and password.');
      }
    } catch {
      setError('Google sign-in could not start. Check your connection and try again.');
    } finally {
      setGoogleBusy(false);
    }
  }

  const isSignin = mode === 'signin';

  return (
    <div className="min-h-screen flex items-center justify-center px-5 pt-safe pb-safe bg-background">
      <Card className="w-full max-w-sm p-7">
        <div className="flex flex-col items-center text-center mb-7">
          <BoloLogo size="lg" />
          <h1 className="font-display font-extrabold text-2xl text-ink mt-3">
            Just say it. Get paid.
          </h1>
          <p className="text-muted mt-1 text-sm">
            Speak a bill, get an invoice with a UPI QR code.
          </p>
        </div>

        <div className="flex bg-background rounded-full p-1 mb-6" role="tablist">
          {(['signin', 'signup'] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={`flex-1 min-h-[44px] rounded-full text-sm font-medium transition duration-200 ${
                mode === m ? 'bg-card shadow-card text-ink' : 'text-muted hover:text-ink'
              }`}
            >
              {m === 'signin' ? 'Sign In' : 'Sign Up'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="email"
            label="Email"
            placeholder="you@example.com"
            value={email}
            autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            type="password"
            label="Password"
            placeholder="••••••••"
            value={password}
            autoComplete={isSignin ? 'current-password' : 'new-password'}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {!isSignin && (
            <Input
              type="password"
              label="Confirm Password"
              placeholder="••••••••"
              value={confirm}
              autoComplete="new-password"
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          )}

          {error && <p className="text-sm text-danger">{error}</p>}

          <Button type="submit" loading={busy} className="w-full">
            {isSignin ? 'Sign In' : 'Create Account'}
          </Button>
        </form>

        <div className="flex items-center gap-3 my-5">
          <span className="flex-1 h-px bg-line" />
          <span className="text-xs text-muted">or</span>
          <span className="flex-1 h-px bg-line" />
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full mb-3"
          loading={googleBusy}
          disabled={busy || demoBusy}
          onClick={handleGoogle}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0">
            <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z" />
            <path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.58-4.12H3.08v2.59A10 10 0 0 0 12 22Z" />
            <path fill="#FBBC05" d="M6.42 13.92a6 6 0 0 1 0-3.84V7.49H3.08a10 10 0 0 0 0 9.02l3.34-2.59Z" />
            <path fill="#EA4335" d="M12 5.96c1.47 0 2.79.51 3.82 1.51l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.92 5.49l3.34 2.59A6 6 0 0 1 12 5.96Z" />
          </svg>
          Continue with Google
        </Button>

        <Button
          variant="outline"
          className="w-full"
          loading={demoBusy}
          onClick={handleDemo}
        >
          Try demo
        </Button>
      </Card>
    </div>
  );
}
