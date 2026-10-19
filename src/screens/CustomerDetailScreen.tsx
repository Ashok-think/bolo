import { useMemo, useState } from 'react';
import { ArrowLeft, MessageCircle, Bell } from 'lucide-react';
import type { Business } from '@/lib/types';
import { useAllInvoices } from '@/hooks/useAllInvoices';
import { useCustomers } from '@/hooks/useCustomers';
import { formatINR, formatDate, avatarColor, initialsOf } from '@/lib/format';
import { computeTrustWithOutstanding, trustChipClass } from '@/lib/trust';
import { openReminder, remindersInEnglish } from '@/lib/reminders';
import { SkeletonLoader } from '@/components/ui/SkeletonLoader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusChip } from '@/components/ui/StatusChip';
import { Avatar } from '@/components/ui/Avatar';

export function CustomerDetailScreen({
  business,
  customerId,
  onBack,
}: {
  business: Business;
  customerId: string;
  onBack: () => void;
}) {
  const { all, loading } = useAllInvoices(business.id);
  const { customers } = useCustomers(business.id);
  const [confirmRemindAll, setConfirmRemindAll] = useState(false);

  const customer = customers.find((c) => c.id === customerId);
  const theirs = useMemo(
    () => all.filter((inv) => inv.customer_id === customerId),
    [all, customerId]
  );

  const trust = useMemo(() => {
    const paid = theirs.filter((inv) => inv.status === 'paid');
    const unpaid = theirs.filter((inv) => inv.status !== 'paid');
    return computeTrustWithOutstanding(paid, unpaid);
  }, [theirs]);

  const totalOwed = theirs
    .filter((inv) => inv.status !== 'paid')
    .reduce((sum, inv) => sum + Math.max(0, inv.total - inv.paid_amount), 0);

  function remindAll() {
    if (!customer) return;
    const pending = theirs.filter((inv) => inv.status !== 'paid' && inv.customer_id);
    // open the oldest pending reminder first; WhatsApp handles one tab reliably
    const oldest = pending[pending.length - 1];
    if (oldest && customer) {
      openReminder(oldest, customer, business);
    }
    setConfirmRemindAll(false);
  }

  if (loading) {
    return (
      <div className="px-5 pt-2 pb-32 space-y-4">
        <SkeletonLoader className="h-10 w-40" />
        <SkeletonLoader className="h-28 rounded-card" />
        <SkeletonLoader className="h-40 rounded-card" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="px-5 pt-2 pb-32 text-center">
        <p className="text-muted mt-10">Customer not found.</p>
        <Button variant="outline" className="mt-4" onClick={onBack}>
          Go back
        </Button>
      </div>
    );
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
        <h1 className="font-display font-bold text-xl text-ink">Customer</h1>
      </div>

      <Card className="p-5 flex items-center gap-4">
        <Avatar name={customer.name} color={avatarColor(customer.name)} size={56} />
        <div className="min-w-0 flex-1">
          <p className="font-display font-bold text-lg text-ink truncate">{customer.name}</p>
          <p className="text-sm text-muted truncate">{customer.phone ?? 'No phone'}</p>
        </div>
        <span
          className={`px-3 py-1 rounded-full text-xs font-medium shrink-0 ${trustChipClass(
            trust.level
          )}`}
        >
          {trust.label}
        </span>
      </Card>

      <Card className="p-5 mt-4">
        <p className="text-sm text-muted">Total owed</p>
        <p className="font-display font-extrabold text-4xl text-ink mt-1">
          {formatINR(totalOwed)}
        </p>
        {trust.avgDays !== null && (
          <p className="text-sm text-muted mt-2">
            Usually pays in about {Math.round(trust.avgDays)} days
            {trust.onTimeShare !== null
              ? ` · ${Math.round(trust.onTimeShare * 100)}% on time`
              : ''}
          </p>
        )}
      </Card>

      {totalOwed > 0 && (
        <Button
          variant="amber-outline"
          className="w-full mt-4"
          onClick={() => setConfirmRemindAll(true)}
        >
          <Bell size={18} /> Remind all
        </Button>
      )}

      {totalOwed > 0 && remindersInEnglish(business.language) && (
        <p className="text-xs text-muted mt-2 text-center">
          Reminders are in English for this language
        </p>
      )}

      <h2 className="font-display font-bold text-lg text-ink mt-6 mb-3">
        Invoices ({theirs.length})
      </h2>
      <div className="space-y-2.5">
        {theirs.map((inv) => (
          <Card key={inv.id} className="p-4 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-ink truncate">Invoice #{inv.number}</p>
              <p className="text-sm text-muted mt-0.5">{formatDate(inv.created_at)}</p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span className="font-display font-bold text-ink">{formatINR(inv.total)}</span>
              <StatusChip invoice={inv} />
            </div>
          </Card>
        ))}
        {theirs.length === 0 && (
          <p className="text-muted text-center py-6">No invoices for this customer yet.</p>
        )}
      </div>

      {confirmRemindAll && (
        <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center px-5">
          <Card className="w-full max-w-sm p-6">
            <div className="flex items-center gap-2 mb-2">
              <MessageCircle size={20} className="text-primary" />
              <h2 className="font-display font-bold text-lg text-ink">Send reminder?</h2>
            </div>
            <p className="text-muted text-sm mb-2">
              Opens WhatsApp with a polite message for {customer.name}. It's one tap — nothing is
              sent automatically.
            </p>
            {remindersInEnglish(business.language) && (
              <p className="text-xs text-muted mb-4">Reminders are in English for this language</p>
            )}
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setConfirmRemindAll(false)}
              >
                Cancel
              </Button>
              <Button className="flex-1" onClick={remindAll}>
                Open WhatsApp
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
