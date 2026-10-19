import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { InvoiceWithCustomer } from '@/lib/types';

export function useInvoices(businessId: string | undefined) {
  const [invoices, setInvoices] = useState<InvoiceWithCustomer[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!businessId) {
      setInvoices([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('invoices')
      .select('*, customers(name)')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error || !data) {
      setInvoices([]);
      setLoading(false);
      return;
    }

    const mapped: InvoiceWithCustomer[] = data.map((row) => {
      const { customers, ...invoice } = row as typeof row & {
        customers: { name: string } | null;
      };
      return {
        ...invoice,
        total: Number(invoice.total),
        paid_amount: Number(invoice.paid_amount),
        customer_name: customers?.name ?? null,
      };
    });

    setInvoices(mapped);
    setLoading(false);
  }, [businessId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { invoices, loading, refresh };
}

export function useInvoiceStats(businessId: string | undefined) {
  const [pendingTotal, setPendingTotal] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!businessId) return;
    supabase
      .from('invoices')
      .select('status, total, paid_amount')
      .eq('business_id', businessId)
      .then(({ data }) => {
        let total = 0;
        let count = 0;
        for (const inv of data ?? []) {
          if (inv.status === 'paid') continue;
          total += Math.max(0, Number(inv.total) - Number(inv.paid_amount));
          count += 1;
        }
        setPendingTotal(total);
        setPendingCount(count);
      });
  }, [businessId]);

  return { pendingTotal, pendingCount };
}
