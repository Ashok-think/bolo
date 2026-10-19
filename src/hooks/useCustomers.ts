import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { CustomerWithPending } from '@/lib/types';

export function useCustomers(businessId: string | undefined) {
  const [customers, setCustomers] = useState<CustomerWithPending[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!businessId) {
      setCustomers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [custRes, invRes] = await Promise.all([
      supabase.from('customers').select('*').order('name'),
      supabase
        .from('invoices')
        .select('customer_id, status, total, paid_amount')
        .eq('business_id', businessId),
    ]);

    if (custRes.error || invRes.error) {
      setCustomers([]);
      setLoading(false);
      return;
    }

    const pendingByCustomer = new Map<string, { amount: number; count: number }>();
    for (const inv of invRes.data ?? []) {
      if (inv.status === 'paid' || !inv.customer_id) continue;
      const outstanding = Math.max(0, Number(inv.total) - Number(inv.paid_amount));
      const cur = pendingByCustomer.get(inv.customer_id) ?? { amount: 0, count: 0 };
      cur.amount += outstanding;
      cur.count += 1;
      pendingByCustomer.set(inv.customer_id, cur);
    }

    const withPending: CustomerWithPending[] = (custRes.data ?? []).map((c) => {
      const p = pendingByCustomer.get(c.id);
      return { ...c, pending_amount: p?.amount ?? 0, pending_count: p?.count ?? 0 };
    });

    setCustomers(withPending);
    setLoading(false);
  }, [businessId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { customers, loading, refresh };
}
