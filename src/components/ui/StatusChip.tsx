import type { Invoice } from '@/lib/types';

export type ChipState = 'not-sent' | 'sent' | 'part-paid' | 'paid';

/**
 * Resolve the display state of an invoice:
 * paid > part-paid > sent > not-sent.
 */
export function chipStateFor(invoice: Pick<Invoice, 'status' | 'paid_amount'>): ChipState {
  if (invoice.status === 'paid') return 'paid';
  if (invoice.paid_amount > 0) return 'part-paid';
  if (invoice.status === 'sent') return 'sent';
  return 'not-sent';
}

const CHIP_STYLES: Record<ChipState, { cls: string; label: string }> = {
  'not-sent': { cls: 'bg-ink/5 text-muted', label: 'Not sent' },
  sent: { cls: 'bg-blue-100 text-blue-700', label: 'Sent' },
  'part-paid': { cls: 'bg-amber/15 text-amber', label: 'Part paid' },
  paid: { cls: 'bg-primary-soft text-primary', label: 'Paid' },
};

export function StatusChip({ invoice }: { invoice: Pick<Invoice, 'status' | 'paid_amount'> }) {
  const state = chipStateFor(invoice);
  const { cls, label } = CHIP_STYLES[state];
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cls}`}
    >
      {label}
    </span>
  );
}
