import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Business, Language } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { LanguagePicker } from '@/components/LanguagePicker';
import { BoloLogo } from '@/components/BoloLogo';
import { useToast } from '@/components/ui/Toast';
import { isValidUpiId } from '@/lib/upi';

export function OnboardingScreen({
  onDone,
}: {
  onDone: (business: Business) => void;
}) {
  const [name, setName] = useState('');
  const [upiId, setUpiId] = useState('');
  const [phone, setPhone] = useState('');
  const [language, setLanguage] = useState<Language>('en');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError('Please enter your business name.');
    if (!isValidUpiId(upiId)) return setError('Enter a valid UPI ID, e.g. name@upi');

    setBusy(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setBusy(false);
      return setError('Session expired. Please sign in again.');
    }

    const { data, error: insertError } = await supabase
      .from('businesses')
      .insert({
        user_id: userData.user.id,
        name: name.trim(),
        upi_id: upiId.trim(),
        phone: phone.trim() || null,
        language,
      })
      .select()
      .single();

    setBusy(false);
    if (insertError || !data) {
      setError('Could not save your business. Please try again.');
      return;
    }
    toast('success', 'Welcome to Bolo!');
    onDone(data as Business);
  }

  return (
    <div className="min-h-screen bg-background px-5 pt-safe pb-safe flex items-center justify-center py-10">
      <Card className="w-full max-w-sm p-7">
        <div className="mb-6">
          <BoloLogo size="md" />
        </div>
        <h1 className="font-display font-extrabold text-2xl text-ink">Set up your business</h1>
        <p className="text-muted mt-1 mb-6">
          One minute setup and you can start billing by voice.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <Input
            label="Business Name"
            placeholder="e.g. Lakshmi Tailors"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Input
            label="UPI ID"
            placeholder="name@upi"
            value={upiId}
            onChange={(e) => setUpiId(e.target.value)}
            required
          />
          <Input
            label="WhatsApp Number"
            type="tel"
            placeholder="+91 98765 43210"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />

          <div>
            <span className="block text-sm font-medium text-ink mb-2">Language</span>
            <LanguagePicker value={language} onChange={setLanguage} />
            <p className="text-xs text-muted mt-2">
              Used for voice recognition and reminders only.
            </p>
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <Button type="submit" loading={busy} className="w-full">
            Start Billing
          </Button>
        </form>
      </Card>
    </div>
  );
}
