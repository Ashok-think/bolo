import { Mic, Receipt } from 'lucide-react';
import type { Business } from '@/lib/types';
import { useAllInvoices } from '@/hooks/useAllInvoices';
import { useHomeStats } from '@/hooks/useHomeStats';
import { useCountUp } from '@/hooks/useCountUp';
import { formatINR, formatDate, greeting, avatarColor } from '@/lib/format';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { StatusChip } from '@/components/ui/StatusChip';
import { InvoiceRowSkeleton } from '@/components/ui/SkeletonLoader';
import { Card } from '@/components/ui/Card';

export function HomeScreen({
  business,
  onOpenInvoice,
  onSeeAll,
  onNewBill,
  onFollowUp,
}: {
  business: Business;
  onOpenInvoice: (id: string) => void;
  onSeeAll: () => void;
  onNewBill: () => void;
  onFollowUp: () => void;
}) {
  const { all, loading } = useAllInvoices(business.id);
  const stats = useHomeStats(all);
  const animatedPending = useCountUp(stats.pendingTotal);

  const recent = all.slice(0, 8);

  return (
    <div className="px-5 pt-2 pb-32">
      <h1 className="font-display font-bold text-xl text-ink">
        {greeting()}, {business.name}
      </h1>

      {/* Hero card */}
      <Card className="mt-5 p-6 bg-gradient-to-b from-primary to-primary/80 border-primary relative overflow-hidden">
        <div
          className="absolute -right-8 -top-8 w-36 h-36 rounded-full bg-lime/20"
          aria-hidden="true"
        />
        <p className="text-white/80 text-sm font-medium">Pending money</p>
        <p className="font-display font-extrabold text-white text-5xl mt-2 tracking-tight break-all">
          {formatINR(Math.round(animatedPending))}
        </p>
        <span className="inline-flex items-center gap-1.5 mt-3 px-3 py-1 rounded-full bg-white/15 text-white text-xs font-medium">
          {stats.pendingCount} unpaid invoices
        </span>
        <div className="flex gap-3 mt-5">
          <button
            onClick={onNewBill}
            className="flex-1 min-h-[48px] rounded-full bg-lime text-ink font-display font-bold flex items-center justify-center gap-1.5 transition duration-200 active:scale-95 hover:opacity-90"
          >
            <Mic size={18} /> New bill
          </button>
          <button
            onClick={onFollowUp}
            className="flex-1 min-h-[48px] rounded-full bg-white/15 text-white font-display font-bold flex items-center justify-center transition duration-200 active:scale-95 hover:bg-white/25"
          >
            Follow up
          </button>
        </div>
      </Card>

      {/* Bento stats */}
      <div className="grid grid-cols-2 gap-3 mt-3">
        <Card className="p-4 bg-lime/25 border-lime/60">
          <p className="text-sm text-ink/70">Collected this month</p>
          <p className="font-display font-bold text-xl text-ink mt-1">
            {formatINR(stats.collectedThisMonth)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted">Invoices this month</p>
          <p className="font-display font-bold text-xl text-ink mt-1">
            {stats.invoicesThisMonth}
          </p>
          <p className="text-xs text-muted mt-0.5">{all.length} all time</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted">Slowest payer</p>
          <p className="font-medium text-ink mt-1 truncate">
            {stats.slowestPayer ?? '—'}
          </p>
          <p className="text-xs text-muted mt-0.5">
            {stats.slowestPayerDays !== null ? `${stats.slowestPayerDays} days to pay` : 'No payments yet'}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted">Risky customers</p>
          <p className="font-display font-bold text-xl text-danger mt-1">
            {formatINR(stats.atRiskAmount)}
          </p>
          <p className="text-xs text-muted mt-0.5">
            {stats.atRiskCount} unpaid over 10 days
          </p>
        </Card>
        <Card className="p-5 col-span-2 bg-ink text-white border-ink">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-white/70">Time saved with Bolo</p>
              <p className="font-display font-bold text-2xl mt-1">
                {stats.timeSavedMinutes >= 60
                  ? `${Math.floor(stats.timeSavedMinutes / 60)}h ${stats.timeSavedMinutes % 60}m`
                  : `${stats.timeSavedMinutes}m`}
              </p>
            </div>
            <span className="text-xs text-white/60 text-right max-w-[140px]">
              About 5 minutes saved per invoice you spoke instead of typing.
            </span>
          </div>
        </Card>
      </div>

      {/* First-run tip */}
      {all.length === 0 && !loading && (
        <Card className="p-4 mt-3 bg-lime/20 border-lime">
          <p className="text-sm text-ink">
            <span className="font-medium">Tip:</span> Tap the green mic and say: "Ravi, 3 shirts
            200 each, advance 300"
          </p>
        </Card>
      )}

      <div className="flex items-center justify-between mt-7 mb-3">
        <h2 className="font-display font-bold text-lg text-ink">Recent invoices</h2>
        <button
          onClick={onSeeAll}
          className="text-sm text-primary font-medium min-h-[48px] px-2"
        >
          By customer
        </button>
      </div>

      {loading ? (
        <div className="space-y-2.5">
          <InvoiceRowSkeleton />
          <InvoiceRowSkeleton />
          <InvoiceRowSkeleton />
        </div>
      ) : all.length === 0 ? (
        <Card className="p-8 flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-full bg-primary-soft flex items-center justify-center mb-4">
            <Receipt size={40} className="text-primary/60" />
          </div>
          <p className="font-display font-bold text-ink">No invoices yet</p>
          <p className="text-muted text-sm mt-1 mb-5">
            Your invoices will show up here.
          </p>
        </Card>
      ) : (
        <Card className="divide-y divide-line overflow-hidden">
          {recent.map((inv) => (
            <button
              key={inv.id}
              onClick={() => onOpenInvoice(inv.id)}
              className="w-full text-left p-4 flex items-center gap-3 hover:bg-ink/[0.03] transition duration-200"
            >
              <Avatar
                name={inv.customer_name ?? '?'}
                color={avatarColor(inv.customer_name ?? '?')}
                size={44}
              />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-ink truncate">
                  {inv.customer_name ?? 'Unknown customer'}
                </p>
                <p className="text-sm text-muted mt-0.5 truncate">
                  #{inv.number} · {formatDate(inv.created_at)}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className="font-display font-bold text-ink">
                  {formatINR(inv.total)}
                </span>
                <StatusChip invoice={inv} />
              </div>
            </button>
          ))}
        </Card>
      )}
    </div>
  );
}
