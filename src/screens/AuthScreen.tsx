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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);

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
