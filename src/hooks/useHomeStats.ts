import { useMemo } from 'react';
import type { InvoiceWithCustomer } from '@/lib/types';

export interface HomeStats {
  pendingTotal: number;
  pendingCount: number;
  collectedThisMonth: number;
  invoicesThisMonth: number;
  slowestPayer: string | null;
  slowestPayerDays: number | null;
  atRiskAmount: number;
  atRiskCount: number;
  timeSavedMinutes: number;
}

export function useHomeStats(invoices: InvoiceWithCustomer[]): HomeStats {
  return useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    let pendingTotal = 0;
    let pendingCount = 0;
    let collectedThisMonth = 0;
    let invoicesThisMonth = 0;
    const payerDays: { name: string; days: number }[] = [];
    let atRiskAmount = 0;
    let atRiskCount = 0;

    for (const inv of invoices) {
      const created = new Date(inv.created_at);
      const outstanding = Math.max(0, inv.total - inv.paid_amount);

      if (inv.status !== 'paid') {
        pendingTotal += outstanding;
        pendingCount += 1;
        // risk: unpaid for more than 10 days
        const days = Math.floor((now.getTime() - created.getTime()) / 86400000);
        if (days > 10) {
          atRiskAmount += outstanding;
          atRiskCount += 1;
        }
      }

      if (inv.paid_at) {
        const paidDate = new Date(inv.paid_at);
        if (paidDate >= monthStart) {
          collectedThisMonth += Math.min(inv.paid_amount, inv.total);
        }
        payerDays.push({
          name: inv.customer_name ?? 'Unknown',
          days: Math.round((paidDate.getTime() - created.getTime()) / 86400000),
        });
      }

      if (created >= monthStart) invoicesThisMonth += 1;
    }

    const slowest = payerDays.length
      ? payerDays.reduce((a, b) => (b.days > a.days ? b : a))
      : null;

    return {
      pendingTotal,
      pendingCount,
      collectedThisMonth,
      invoicesThisMonth,
      slowestPayer: slowest?.name ?? null,
      slowestPayerDays: slowest?.days ?? null,
      atRiskAmount,
      atRiskCount,
      timeSavedMinutes: invoices.length * 5,
    };
  }, [invoices]);
}
