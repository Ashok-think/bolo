import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, AlertTriangle, Sparkles, RefreshCw, MicOff, Loader2, ArrowLeft } from 'lucide-react';
import type { Business, Customer, Language } from '@/lib/types';
import { parseInvoiceTextInstant, runBackgroundAI, AI_TIMEOUT_MS } from '@/lib/parser';
import type { ParsedInvoice, ParsedItem } from '@/lib/parser';
import { createInvoice } from '@/lib/invoiceOps';
import { BoloLogo } from '@/components/BoloLogo';
import { formatINR } from '@/lib/format';
import { computeTrustWithOutstanding } from '@/lib/trust';
import type { TrustScore } from '@/lib/trust';
import { useLastPrices } from '@/hooks/useLastPrices';
import { useAllInvoices } from '@/hooks/useAllInvoices';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { speak, speakConfirmationsEnabled } from '@/lib/voiceFeedback';

export function ReviewScreen({
  business,
  customers,
  parsed,
  transcript,
  lang,
  onCreated,
  onPrefetchedBusiness,
  onBack,
}: {
  business: Business;
  customers: Customer[];
  parsed: ParsedInvoice;
  transcript: string;
  lang: Language;
  onCreated: (invoiceId: string) => void;
  onPrefetchedBusiness: (b: Business) => void;
  onBack: () => void;
}) {
  const { all } = useAllInvoices(business.id);
  const { priceFor } = useLastPrices(business.id);

  const [saidText, setSaidText] = useState(transcript);
  const [reParsing, setReParsing] = useState(false);
  const [aiUsed, setAiUsed] = useState(parsed.source === 'ai');
  const [aiImproved, setAiImproved] = useState(false);
  const [aiPending, setAiPending] = useState(false);
  const userEditedRef = useRef(false);

  const [customerName, setCustomerName] = useState(parsed.customer);
  const [items, setItems] = useState<ParsedItem[]>(() =>
    parsed.items.map((it) => ({ ...it }))
  );
  const [advance, setAdvance] = useState(parsed.advance ? String(parsed.advance) : '');
  const [notes, setNotes] = useState(parsed.notes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const transcriptEmpty = !transcript.trim();

  // Background AI: quietly fills fields the user hasn't touched, then shows
  // the "Improved with AI" chip. Any failure is silent. The AI window is
  // bounded; whichever provider answers first inside it wins.
  useEffect(() => {
    if (transcriptEmpty) return;
    let cancelled = false;
    void (async () => {
      setAiPending(true);
      const ai = await runBackgroundAI(
        transcript,
        lang,
        customers.map((c) => c.name),
        AI_TIMEOUT_MS
      );
      if (cancelled) return;
      setAiPending(false);
      if (!ai || userEditedRef.current) return;
      setAiUsed(true);
      setAiImproved(true);
      if (ai.customer) setCustomerName(ai.customer);
      if (ai.items.length > 0) setItems(ai.items.map((it) => ({ ...it })));
      setAdvance(ai.advance ? String(ai.advance) : '');
      setNotes(ai.notes);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const suggestions = useMemo(() => {
    const q = customerName.trim().toLowerCase();
    if (!q) return [];
    return customers
      .filter((c) => c.name.toLowerCase().includes(q) && c.name !== customerName)
      .slice(0, 4);
  }, [customerName, customers]);

  // Trust banner for risky customers (based on history for this name)
  const trust: TrustScore | null = useMemo(() => {
    const q = customerName.trim().toLowerCase();
    if (!q) return null;
    const theirs = all.filter(
      (inv) => (inv.customer_name ?? '').toLowerCase() === q
    );
    if (theirs.length === 0) return null;
    const paid = theirs.filter((inv) => inv.status === 'paid');
    const unpaid = theirs.filter((inv) => inv.status !== 'paid');
    const score = computeTrustWithOutstanding(
      paid.map((p) => ({ ...p, paid_at: p.paid_at ?? null })),
      unpaid
    );
    return score;
  }, [customerName, all]);

  const total = items.reduce((sum, it) => sum + it.quantity * it.unit_price, 0);
  const advanceNum = parseFloat(advance) || 0;
  const balance = Math.max(0, total - advanceNum);
  const customerMissing = !customerName.trim();
  const advanceTooBig = advanceNum > 0 && total > 0 && advanceNum > total;
  const highPricedItem = items.some((it) => it.unit_price > 20000);
  const [priceConfirmed, setPriceConfirmed] = useState(false);

  useEffect(() => {
    if (!highPricedItem) setPriceConfirmed(false);
  }, [highPricedItem]);

  function trackEdit() {
    userEditedRef.current = true;
  }

  function updateItem(i: number, patch: Partial<ParsedItem>) {
    trackEdit();
    setItems((cur) => cur.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  function addItem() {
    trackEdit();
    setItems((cur) => [...cur, { name: '', quantity: 1, unit_price: 0 }]);
  }

  function removeItem(i: number) {
    trackEdit();
    setItems((cur) => cur.filter((_, idx) => idx !== i));
  }

  async function handleReRead() {
    const text = saidText.trim();
    if (!text) return;
    trackEdit();
    setReParsing(true);
    const result = await parseInvoiceTextInstant(text, lang);
    setReParsing(false);
    setAiUsed(false);
    setCustomerName(result.customer);
    setItems(result.items.map((it) => ({ ...it })));
    setAdvance(result.advance ? String(result.advance) : '');
    setNotes(result.notes);
  }

  function handleItemNameChange(i: number, name: string) {
    trackEdit();
    const prevPrice = priceFor(name);
    setItems((cur) =>
      cur.map((it, idx) =>
        idx === i
          ? {
              ...it,
              name,
              unit_price: prevPrice !== undefined && it.unit_price === 0 ? prevPrice : it.unit_price,
            }
          : it
      )
    );
  }

  async function handleCreate() {
    setError(null);
    if (busy) return;
    if (customerMissing) return setError('Who is this bill for? Add a customer name.');
    if (items.length === 0 || total <= 0) return setError('Add at least one item with a price.');
    if (highPricedItem && !priceConfirmed) {
      return setError('Please confirm the high item price first.');
    }

    setBusy(true);
    onPrefetchedBusiness(business);
    const result = await createInvoice({
      businessId: business.id,
      customerId: null,
      customerName,
      customerPhone: null,
      items,
      advance: advanceNum,
      notes,
      existingCustomers: customers,
    });

    if (result.error || !result.invoice) {
      setBusy(false);
      setError(result.error ?? 'Could not create the invoice.');
      return;
    }
    toast('success', 'Added');
    if (speakConfirmationsEnabled()) {
      speak(
        `Invoice for ${customerName.trim()}, ${Math.round(total)} rupees, added.`,
        business.language
      );
    }
    onCreated(result.invoice.id);
  }

  return (
    <div className="px-5 pt-2 pb-40">
      <div className="flex items-center gap-1">
        <button
          onClick={onBack}
          aria-label="Back"
          className="w-9 h-9 rounded-full flex items-center justify-center text-muted hover:bg-ink/5 transition duration-200"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="font-display font-bold text-xl text-ink mb-1">Review invoice</h1>
      </div>
      {aiPending && (
        <div className="mt-2 mb-4" role="status" aria-live="polite">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary/10">
            <div className="h-full w-1/3 rounded-full bg-primary animate-pulse" />
          </div>
          <p className="mt-1 text-xs text-muted">Checking for a better match…</p>
        </div>
      )}
      <p className="text-sm text-muted mb-5">Check the details, then create it.</p>

      {transcriptEmpty ? (
        <Card className="p-4 mb-4">
          <div className="flex items-start gap-2">
            <MicOff size={18} className="text-muted shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-ink text-sm">
                We didn't hear anything. Check mic permission or type it instead.
              </p>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-muted flex items-center gap-1.5">
              You said:
              {aiUsed && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-lime/40 text-ink text-[11px] font-bold">
                  <Sparkles size={11} /> AI
                </span>
              )}
              {aiImproved && !aiUsed && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-lime/40 text-ink text-[11px] font-bold">
                  <Sparkles size={11} /> Improved with AI
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={handleReRead}
              disabled={reParsing || !saidText.trim()}
              className="min-h-[40px] px-3 rounded-full text-sm font-medium text-primary bg-primary-soft flex items-center gap-1.5 transition duration-200 hover:opacity-80 disabled:opacity-50"
            >
              <RefreshCw size={14} className={reParsing ? 'animate-spin' : ''} />
              Re-read
            </button>
          </div>
          <textarea
            value={saidText}
            onChange={(e) => setSaidText(e.target.value)}
            rows={2}
            className="w-full p-3 rounded-2xl border border-line bg-background text-ink focus:outline-none focus:border-primary transition duration-200 resize-none"
          />
        </Card>
      )}

      {parsed.ok === false && !transcriptEmpty && (
        <Card className="p-4 mb-4 bg-amber/10 border-amber/40">
          <p className="text-sm text-ink">
            We couldn't fully understand that. Fill in the details below or edit what you said and tap Re-read.
          </p>
        </Card>
      )}

      {/* Customer */}
      <Card className="p-4">
        <Input
          label="Customer"
          placeholder="Customer name"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          error={customerMissing ? 'Customer name is required' : null}
        />
        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {suggestions.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCustomerName(c.name)}
                className="min-h-[36px] px-3 rounded-full bg-primary-soft text-primary text-sm font-medium transition duration-200 hover:opacity-80"
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        {trust?.level === 'risky' && (
          <div className="flex items-start gap-2 mt-3 p-3 rounded-2xl bg-danger/10">
            <AlertTriangle size={18} className="text-danger shrink-0 mt-0.5" />
            <p className="text-sm text-ink">
              This customer often pays late. Ask for an advance?
            </p>
          </div>
        )}
      </Card>

      {/* Items */}
      <div className="mt-4 space-y-3">
        {items.map((item, i) => (
          <Card key={i} className="p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-muted">Item {i + 1}</span>
              <button
                type="button"
                onClick={() => removeItem(i)}
                aria-label={`Remove item ${i + 1}`}
                className="w-9 h-9 rounded-full flex items-center justify-center text-danger hover:bg-danger/10 transition duration-200"
              >
                <Trash2 size={17} />
              </button>
            </div>
            <div className="grid grid-cols-[1fr_72px_92px] gap-2">
              <Input
                placeholder="What did you sell?"
                value={item.name}
                onChange={(e) => handleItemNameChange(i, e.target.value)}
              />
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                placeholder="Qty"
                value={item.quantity || ''}
                onChange={(e) => updateItem(i, { quantity: parseFloat(e.target.value) || 0 })}
              />
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                placeholder="₹"
                value={item.unit_price || ''}
                onChange={(e) => updateItem(i, { unit_price: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </Card>
        ))}

        <button
          type="button"
          onClick={addItem}
          className="w-full min-h-[48px] rounded-2xl border-2 border-dashed border-line text-primary font-medium flex items-center justify-center gap-1.5 hover:bg-primary-soft/50 transition duration-200"
        >
          <Plus size={18} /> Add item
        </button>
      </div>

      {/* Advance + totals */}
      <Card className="p-4 mt-4">
        <Input
          label="Advance paid (₹)"
          type="number"
          inputMode="decimal"
          min="0"
          placeholder="0"
          value={advance}
          onChange={(e) => setAdvance(e.target.value)}
        />
        <div className="flex items-center justify-between mt-4">
          <span className="text-muted">Total</span>
          <span className="font-display font-bold text-ink">{formatINR(total)}</span>
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="font-medium text-ink">Balance due</span>
          <span className="font-display font-extrabold text-2xl text-primary">
            {formatINR(balance)}
          </span>
        </div>
      </Card>

      {advanceTooBig && (
        <Card className="p-4 mt-4 bg-amber/10 border-amber/40">
          <p className="text-sm text-ink">
            The advance ({formatINR(advanceNum)}) is more than the total ({formatINR(total)}). Check the amounts.
          </p>
        </Card>
      )}

      {highPricedItem && (
        <Card className="p-4 mt-4 bg-amber/10 border-amber/40">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-ink">Is this price right?</p>
              <p className="text-xs text-muted mt-0.5">
                One or more items cost over 20,000 rupees.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPriceConfirmed(true)}
              disabled={priceConfirmed}
              className="shrink-0 min-h-[40px] px-4 rounded-full bg-amber text-ink text-sm font-bold transition duration-200 hover:opacity-85 disabled:opacity-60"
            >
              {priceConfirmed ? 'Confirmed' : 'Confirm'}
            </button>
          </div>
        </Card>
      )}

      {/* Notes */}
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        placeholder="Notes (optional)"
        className="w-full mt-4 p-4 rounded-2xl border border-line bg-card text-ink placeholder:text-muted/60 focus:outline-none focus:border-primary transition duration-200 resize-none"
      />

      {error && <p className="text-sm text-danger mt-3">{error}</p>}

      {/* Saving overlay: animated logo pulse, all buttons disabled */}
      {busy && (
        <div className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm flex flex-col items-center justify-center gap-4" role="status" aria-live="polite">
          <span className="animate-pulse">
            <BoloLogo size="lg" />
          </span>
          <span className="inline-flex items-center gap-2 text-muted">
            <Loader2 size={16} className="animate-spin" />
            Creating your invoice...
          </span>
        </div>
      )}

      {/* Sticky create button */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur border-t border-line pb-safe">
        <div className="md:max-w-md md:mx-auto px-5 py-3">
          <Button className="w-full" loading={busy} disabled={customerMissing} onClick={handleCreate}>
            Create invoice · {formatINR(total)}
          </Button>
        </div>
      </div>
    </div>
  );
}
