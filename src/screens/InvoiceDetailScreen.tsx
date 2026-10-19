import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Trash2,
  MessageCircle,
  Download,
  Bell,
  BadgeCheck,
  Link2,
  ChevronRight,
  CheckCircle2,
} from 'lucide-react';
import type { Business } from '@/lib/types';
import {
  fetchInvoiceDetail,
  markInvoicePaid,
  deleteInvoice,
} from '@/lib/invoiceOps';
import type { InvoiceDetailData } from '@/lib/invoiceOps';
import { formatINR, formatDate } from '@/lib/format';
import { openReminder, reminderTone } from '@/lib/reminders';
import { downloadInvoicePDF } from '@/lib/pdf';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { SkeletonLoader } from '@/components/ui/SkeletonLoader';
import { useToast } from '@/components/ui/Toast';
import { shareInvoiceOnWhatsApp } from '@/lib/whatsapp';
import { trustChipClass, computeTrustWithOutstanding } from '@/lib/trust';
import { useAllInvoices } from '@/hooks/useAllInvoices';
import { QrCard, PaidInFullCard, NoUpiCard } from '@/components/QrCard';
import { buildUPILink } from '@/lib/upi';

function statusChipInfo(status: string): { label: string; classes: string } {
  switch (status) {
    case 'paid':
      return { label: 'Paid', classes: 'bg-primary text-white' };
    case 'sent':
      return { label: 'Part paid', classes: 'bg-amber text-ink' };
    default:
      return { label: 'Pending', classes: 'bg-ink/10 text-muted' };
  }
}

function timeAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

export function InvoiceDetailScreen({
  invoiceId,
  business,
  onBack,
  onGoToSettings,
}: {
  invoiceId: string;
  business: Business;
  onBack: () => void;
  onGoToSettings?: () => void;
}) {
  const [detail, setDetail] = useState<InvoiceDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payBusy, setPayBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const toast = useToast();
  const { all } = useAllInvoices(business.id);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await fetchInvoiceDetail(invoiceId);
    if (err) setError(err);
    else setDetail(data);
    setLoading(false);
  }, [invoiceId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleMarkPaid(full: boolean) {
    if (!detail) return;
    const total = detail.invoice.total;
    const bal = total - detail.invoice.paid_amount;
    const amount = full ? bal : parseFloat(payAmount) || 0;
    if (amount <= 0) return;

    setPayBusy(true);
    const { error: err } = await markInvoicePaid(detail.invoice, amount);
    setPayBusy(false);
    if (err) {
      toast('error', 'Could not record the payment.');
      return;
    }
    setPayOpen(false);
    setPayAmount('');
    const nowFullyPaid = detail.invoice.paid_amount + amount >= total - 0.009;
    if (nowFullyPaid) {
      setCelebrate(true);
      window.setTimeout(() => setCelebrate(false), 2600);
      toast('success', 'Invoice paid in full!');
    } else {
      toast('success', 'Payment recorded.');
    }
    load();
  }

  async function handleWhatsApp() {
    if (!detail) return;
    await shareInvoiceOnWhatsApp(
      detail.invoice,
      detail.customer ?? {
        id: '',
        business_id: business.id,
        name: 'Customer',
        phone: null,
        created_at: '',
      },
      business
    );
    load();
  }

  async function handleDelete() {
    if (!detail) return;
    const { error: err } = await deleteInvoice(detail.invoice.id);
    if (err) {
      toast('error', 'Could not delete the invoice.');
      return;
    }
    toast('success', 'Invoice deleted.');
    onBack();
  }

  async function handleCopyLink() {
    if (!detail) return;
    const url = `${window.location.origin}/i/${detail.invoice.public_token}`;
    navigator.clipboard?.writeText(url).then(
      () => toast('success', 'Link copied.'),
      () => toast('error', 'Could not copy the link.')
    );
  }

  function handleRemind() {
    if (!detail?.customer) return;
    openReminder(detail.invoice, detail.customer, business);
  }

  async function handlePDF() {
    if (!detail) return;
    await downloadInvoicePDF({
      businessName: detail.business.name,
      businessUpi: detail.business.upi_id,
      customerName: detail.customer?.name ?? null,
      number: detail.invoice.number,
      status: detail.invoice.status,
      createdAt: detail.invoice.created_at,
      items: detail.items,
      total: detail.invoice.total,
      paidAmount: detail.invoice.paid_amount,
      notes: detail.invoice.notes,
    });
  }

  if (loading) {
    return (
      <div className="px-5 pt-2 pb-32 space-y-4">
        <SkeletonLoader className="h-10 w-40" />
        <SkeletonLoader className="h-40 rounded-card" />
        <SkeletonLoader className="h-64 rounded-card" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="px-5 pt-2 pb-32 text-center">
        <p className="text-muted mt-10">Invoice not found.</p>
        <Button variant="outline" className="mt-4" onClick={onBack}>
          Go back
        </Button>
      </div>
    );
  }

  const { invoice, customer, items } = detail;
  const balance = Math.max(0, invoice.total - invoice.paid_amount);
  const firstName = (customer?.name ?? 'Customer').split(' ')[0];
  const chip = statusChipInfo(invoice.status);
  const tone = reminderTone(invoice);

  // Trust chip for the customer's history row (plain computation: this sits
  // after the early returns, so a hook here would break React's rules)
  const name = (customer?.name ?? '').toLowerCase();
  const theirs = name
    ? all.filter((inv) => (inv.customer_name ?? '').toLowerCase() === name)
    : [];
  const trust = (() => {
    if (!name || theirs.length === 0) return { level: 'new' as const, label: 'New' };
    const paid = theirs.filter((inv) => inv.status === 'paid');
    const unpaid = theirs.filter((inv) => inv.status !== 'paid');
    return computeTrustWithOutstanding(
      paid.map((p) => ({ ...p, paid_at: p.paid_at ?? null })),
      unpaid
    );
  })();

  const upiId = detail.business.upi_id.trim();
  const businessName = detail.business.name;
  const upiLink = buildUPILink({
    upiId,
    payeeName: businessName,
    amount: balance,
    note: `Invoice INV-${String(invoice.number).padStart(4, '0')}`,
  });

  return (
    <div className="px-5 pt-2 pb-40 relative">
      {/* Top bar */}
      <div className="flex items-center gap-2 mb-5">
        <button
          onClick={onBack}
          aria-label="Go back"
          className="w-12 h-12 -ml-2 rounded-full flex items-center justify-center text-ink hover:bg-ink/5 transition duration-200"
        >
          <ArrowLeft size={22} />
        </button>
        <h1 className="font-display font-bold text-xl text-ink">
          INV-{String(invoice.number).padStart(4, '0')}
        </h1>
        <button
          onClick={() => setConfirmDelete(true)}
          aria-label="Delete invoice"
          className="ml-auto w-12 h-12 rounded-full flex items-center justify-center text-danger hover:bg-danger/10 transition duration-200"
        >
          <Trash2 size={22} />
        </button>
      </div>

      {celebrate && (
        <div className="fixed inset-0 z-50 pointer-events-none overflow-hidden" aria-hidden="true">
          {Array.from({ length: 24 }).map((_, i) => (
            <span
              key={i}
              className="absolute w-2.5 h-2.5 rounded-sm"
              style={{
                left: `${(i * 37) % 100}%`,
                top: '-5%',
                backgroundColor: ['#0B6B4F', '#C8F169', '#F59E0B'][i % 3],
                animation: `confetti-fall ${1.6 + (i % 5) * 0.25}s ease-in ${((i % 4) * 0.15)}s forwards`,
              }}
            />
          ))}
        </div>
      )}

      {/* Green gradient header card */}
      <Card className="p-0 mt-0 overflow-hidden">
        <div className="bg-gradient-to-b from-primary to-primary/80 p-5 text-white">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-display font-bold text-lg truncate">{detail.business.name}</p>
              {detail.business.phone && (
                <p className="text-sm text-white/80 mt-0.5">{detail.business.phone}</p>
              )}
            </div>
            <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-bold ${chip.classes}`}>
              {chip.label}
            </span>
          </div>
          <p className="text-sm text-white/80 mt-4">
            {balance > 0 ? 'Balance due' : 'Total paid'}
          </p>
          <p className="font-display font-extrabold text-5xl mt-1 tracking-tight">
            {formatINR(balance > 0 ? balance : invoice.total)}
          </p>
        </div>
        <div className="p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-ink truncate">
              Billed to <span className="font-medium">{customer?.name ?? 'Customer'}</span>
            </p>
            <p className="text-sm text-muted shrink-0">
              #{invoice.number} · {formatDate(invoice.created_at)}
            </p>
          </div>

          <div className="mt-4 space-y-3">
            {items.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-ink truncate">{item.name}</p>
                  <p className="text-sm text-muted">
                    {item.quantity} × {formatINR(item.unit_price)}
                  </p>
                </div>
                <span className="font-medium text-ink shrink-0">
                  {formatINR(item.quantity * item.unit_price)}
                </span>
              </div>
            ))}
          </div>

          <div className="border-t border-line mt-4 pt-4 space-y-2">
            <div className="flex justify-between">
              <span className="text-muted">Total</span>
              <span className="font-medium">{formatINR(invoice.total)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Paid</span>
              <span className="font-medium">{formatINR(invoice.paid_amount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium text-ink">Balance due</span>
              <span className="font-display font-extrabold text-2xl text-primary">
                {formatINR(balance)}
              </span>
            </div>
          </div>

          <button
            type="button"
            className="w-full flex items-center justify-between mt-4 pt-4 border-t border-line text-left"
          >
            <span className="text-sm text-muted">
              View {firstName}'s history
            </span>
            <span className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${trustChipClass(trust.level)}`}>
                {trust.label}
              </span>
              <ChevronRight size={16} className="text-muted" />
            </span>
          </button>
        </div>
      </Card>

      {/* SCAN TO PAY card */}
      {balance > 0 ? (
        upiId ? (
          <QrCard
            heading={`Scan to pay ${formatINR(balance)}`}
            upiId={upiId}
            upiLink={upiLink}
          />
        ) : (
          <NoUpiCard onClick={onGoToSettings} />
        )
      ) : (
        <PaidInFullCard />
      )}

      {/* Actions card */}
      <Card className="p-5 mt-4 space-y-3">
        <Button className="w-full min-h-[52px]" onClick={handleWhatsApp}>
          <MessageCircle size={18} /> Send on WhatsApp
        </Button>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" onClick={handlePDF} className="min-h-[48px]">
            <Download size={18} className="text-primary" /> PDF
          </Button>
          <Button variant="outline" onClick={handleCopyLink} className="min-h-[48px]">
            <Link2 size={18} className="text-primary" /> Copy link
          </Button>
        </div>
        {balance > 0 && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Button onClick={() => setPayOpen(true)} className="min-h-[48px]">
                <BadgeCheck size={18} /> Mark as paid
              </Button>
              <Button variant="outline" onClick={handleRemind} className="min-h-[48px]">
                <Bell size={18} className="text-amber" /> Remind · {tone} tone
              </Button>
            </div>
            <p className="text-xs text-muted">
              One-tap reminder: opens WhatsApp with a ready message. Not sent automatically.
            </p>
          </>
        )}
        <button
          type="button"
          className="w-full text-center text-sm text-primary font-medium min-h-[44px] flex items-center justify-center gap-1"
        >
          Open customer view <ChevronRight size={16} />
        </button>
      </Card>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center px-5" role="dialog" aria-modal="true">
          <Card className="w-full max-w-sm p-6">
            <h2 className="font-display font-bold text-lg text-ink">Delete invoice?</h2>
            <p className="text-muted text-sm mt-1 mb-5">
              This permanently removes the invoice and its items.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
              <Button variant="danger" className="flex-1" onClick={handleDelete}>
                Delete
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Payment sheet */}
      {payOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <button
            aria-label="Close"
            onClick={() => setPayOpen(false)}
            className="absolute inset-0 bg-ink/50"
          />
          <div className="relative w-full md:max-w-md bg-background rounded-t-card p-5 pt-safe pb-safe">
            <h2 className="font-display font-bold text-lg text-ink mb-4">Record payment</h2>
            <Input
              label="Amount received (₹)"
              type="number"
              inputMode="decimal"
              min="0"
              value={payAmount}
              placeholder={String(balance)}
              onChange={(e) => setPayAmount(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-3 mt-4">
              <Button variant="outline" onClick={() => setPayOpen(false)}>
                Cancel
              </Button>
              <Button loading={payBusy} onClick={() => handleMarkPaid(false)}>
                Save
              </Button>
            </div>
            <Button
              variant="outline"
              className="w-full mt-3"
              disabled={payBusy}
              onClick={() => handleMarkPaid(true)}
            >
              Mark full balance paid ({formatINR(balance)})
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

