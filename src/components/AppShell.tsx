import { useState } from 'react';
import { House, Mic, Settings, Users } from 'lucide-react';
import type { Business, Language } from '@/lib/types';
import { HomeScreen } from '@/screens/HomeScreen';
import { CustomersScreen } from '@/screens/CustomersScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { ReviewScreen } from '@/screens/ReviewScreen';
import { InvoiceDetailScreen } from '@/screens/InvoiceDetailScreen';
import { CustomerDetailScreen } from '@/screens/CustomerDetailScreen';
import { VoiceSheet } from '@/components/VoiceSheet';
import { TalkSheet } from '@/components/TalkSheet';
import type { ParsedInvoice } from '@/lib/parser';
import { parseWithRules } from '@/lib/parserRules';
import { useCustomers } from '@/hooks/useCustomers';
import { stopSpeaking } from '@/lib/voiceFeedback';

type Tab = 'home' | 'customers' | 'settings';
type View =
  | { name: 'tabs' }
  | { name: 'review'; parsed: ParsedInvoice; transcript: string; lang: Language }
  | { name: 'invoice'; id: string }
  | { name: 'customer'; id: string }
  | { name: 'settings' };

export function AppShell({ business: initialBusiness }: { business: Business }) {
  const [business, setBusiness] = useState<Business>(initialBusiness);
  const [tab, setTab] = useState<Tab>('home');
  const [view, setView] = useState<View>({ name: 'tabs' });
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [talkOpen, setTalkOpen] = useState(false);
  const [billQueue, setBillQueue] = useState<ParsedInvoice[]>([]);
  const { customers } = useCustomers(business.id);

  function handleParsed(transcript: string, lang: Language) {
    setVoiceOpen(false);
    const parsed: ParsedInvoice = { ...parseWithRules(transcript, lang), source: 'rules' };
    setView({ name: 'review', parsed, transcript, lang });
  }

  function handleTalkCompleted(parsedList: ParsedInvoice[], transcript: string, lang: Language) {
    setTalkOpen(false);
    const [first, ...rest] = parsedList;
    setBillQueue(rest);
    setView({ name: 'review', parsed: first, transcript, lang });
  }

  function handleCreated(invoiceId: string) {
    // One conversation can hold several bills; route to the next after one
    // is created.
    if (billQueue.length > 0) {
      const [next, ...rest] = billQueue;
      setBillQueue(rest);
      setView({ name: 'review', parsed: next, transcript: '', lang: view.name === 'review' ? view.lang : business.language });
      return;
    }
    setView({ name: 'invoice', id: invoiceId });
  }

  return (
    <div className="min-h-screen bg-background md:flex md:justify-center">
      <div className="w-full md:max-w-md md:border-x md:border-line md:min-h-screen">
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-background/90 backdrop-blur pt-safe">
          <div className="flex items-center justify-between px-5 h-14">
            <span className="font-display font-extrabold text-xl lowercase text-primary">
              bolo
            </span>
            <button
              onClick={() => setTab('settings')}
              aria-label="Settings"
              className="w-12 h-12 rounded-full flex items-center justify-center text-ink hover:bg-ink/5 transition duration-200"
            >
              <Settings size={22} />
            </button>
          </div>
        </header>

        <main>
          {view.name === 'review' && (
            <ReviewScreen
              business={business}
              customers={customers}
              parsed={view.parsed}
              transcript={view.transcript}
              lang={view.lang}
              onCreated={handleCreated}
              onPrefetchedBusiness={setBusiness}
              onBack={() => setView({ name: 'tabs' })}
            />
          )}
          {view.name === 'invoice' && (
            <InvoiceDetailScreen
              invoiceId={view.id}
              business={business}
              onBack={() => setView({ name: 'tabs' })}
              onGoToSettings={() => setView({ name: 'settings' })}
            />
          )}
          {view.name === 'customer' && (
            <CustomerDetailScreen
              business={business}
              customerId={view.id}
              onBack={() => setView({ name: 'tabs' })}
            />
          )}
          {view.name === 'settings' && (
            <SettingsScreen
              business={business}
              onBack={() => setView({ name: 'tabs' })}
              onBusinessUpdated={() => window.location.reload()}
            />
          )}
          {view.name === 'tabs' && (
            <>
              {tab === 'home' && (
                <HomeScreen
                  business={business}
                  onOpenInvoice={(id) => setView({ name: 'invoice', id })}
                  onSeeAll={() => setTab('customers')}
                  onNewBill={() => setVoiceOpen(true)}
                  onFollowUp={() => setTab('customers')}
                />
              )}
              {tab === 'customers' && (
                <CustomersScreen
                  business={business}
                  onOpenCustomer={(id) => setView({ name: 'customer', id })}
                />
              )}
              {tab === 'settings' && (
                <SettingsScreen
                  business={business}
                  onBack={() => setTab('home')}
                  onBusinessUpdated={setBusiness}
                />
              )}
            </>
          )}
        </main>

        {/* Bottom tab bar */}
        {view.name === 'tabs' && (
          <nav className="fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-line pb-safe">
            <div className="md:max-w-md md:mx-auto relative flex items-center justify-around h-16">
              <button
                onClick={() => setTab('home')}
                aria-label="Home"
                aria-current={tab === 'home'}
                className={`w-16 h-16 flex flex-col items-center justify-center gap-0.5 transition duration-200 ${
                  tab === 'home' ? 'text-primary' : 'text-muted'
                }`}
              >
                <House size={24} />
                <span className="text-xs font-medium">Home</span>
              </button>

              <button
                onClick={() => setVoiceOpen(true)}
                aria-label="Speak a bill"
                className="mic-pulse relative -mt-8 w-16 h-16 rounded-full bg-primary flex items-center justify-center shadow-mic transition duration-200 active:scale-95"
              >
                <Mic size={28} className="text-white relative z-10" />
              </button>

              <button
                onClick={() => setTab('customers')}
                aria-label="Customers"
                aria-current={tab === 'customers'}
                className={`w-16 h-16 flex flex-col items-center justify-center gap-0.5 transition duration-200 ${
                  tab === 'customers' ? 'text-primary' : 'text-muted'
                }`}
              >
                <Users size={24} />
                <span className="text-xs font-medium">Customers</span>
              </button>
            </div>
          </nav>
        )}

        {voiceOpen && (
          <VoiceSheet
            business={business}
            onClose={() => {
              stopSpeaking();
              setVoiceOpen(false);
            }}
            onParsed={handleParsed}
            onTalk={() => {
              stopSpeaking();
              setVoiceOpen(false);
              setTalkOpen(true);
            }}
          />
        )}

        {talkOpen && (
          <TalkSheet
            business={business}
            customers={customers}
            onClose={() => setTalkOpen(false)}
            onCompleted={handleTalkCompleted}
          />
        )}
      </div>
    </div>
  );
}
