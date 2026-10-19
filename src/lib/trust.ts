import type { Invoice } from './types';

export type TrustLevel = 'reliable' | 'slow' | 'risky' | 'new';

export interface TrustScore {
  level: TrustLevel;
  avgDays: number | null;
  onTimeShare: number | null;
  label: string;
}

const CHIP_STYLES: Record<TrustLevel, string> = {
  reliable: 'bg-primary-soft text-primary',
  slow: 'bg-amber/15 text-amber',
  risky: 'bg-danger/10 text-danger',
  new: 'bg-ink/5 text-muted',
};

export function trustChipClass(level: TrustLevel): string {
  return CHIP_STYLES[level];
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

/**
 * Compute payment trust from paid invoices: average days between invoice
 * creation and payment. Very fast payments (<1 day) are treated as on-time.
 */
export function computeTrust(paidInvoices: Invoice[]): TrustScore {
  const withTiming = paidInvoices
    .filter((inv) => inv.paid_at)
    .map((inv) => daysBetween(new Date(inv.paid_at as string), new Date(inv.created_at)));

  if (withTiming.length === 0) {
    // look at history of never-paid invoices to detect risky
    return { level: 'new', avgDays: null, onTimeShare: null, label: 'New' };
  }

  const avgDays = withTiming.reduce((a, b) => a + b, 0) / withTiming.length;
  const onTime = withTiming.filter((d) => d <= 3).length;
  const onTimeShare = onTime / withTiming.length;

  let level: TrustLevel;
  if (avgDays <= 3) level = 'reliable';
  else if (avgDays <= 10) level = 'slow';
  else level = 'risky';

  return { level, avgDays, onTimeShare, label: capitalize(level) };
}

/** Trust for a customer who still has unpaid invoices that are getting old. */
export function computeTrustWithOutstanding(
  paidInvoices: Invoice[],
  unpaidInvoices: Invoice[]
): TrustScore {
  const base = computeTrust(paidInvoices);
  if (base.level !== 'new') return base;

  // Never paid anything yet — flag risky if they hold old unpaid invoices
  const now = Date.now();
  const hasOldUnpaid = unpaidInvoices.some(
    (inv) => now - new Date(inv.created_at).getTime() > 10 * 86400000
  );
  if (hasOldUnpaid) {
    return { level: 'risky', avgDays: null, onTimeShare: null, label: 'Risky' };
  }
  return base;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
