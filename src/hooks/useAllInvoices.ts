import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { InvoiceWithCustomer } from '@/lib/types';

interface AllInvoices {
  all: InvoiceWithCustomer[];
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useAllInvoices(businessId: string | undefined): AllInvoices {
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
      .order('created_at', { ascending: false });

    if (error || !data) {
      setInvoices([]);
      setLoading(false);
      return;
    }

    const mapped = data.map((row) => {
      const { customers, ...invoice } = row as typeof row & {
        customers: { name: string } | null;
      };
      return {
        ...invoice,
        total: Number(invoice.total),
        paid_amount: Number(invoice.paid_amount),
        customer_name: customers?.name ?? null,
      } as InvoiceWithCustomer;
    });

    setInvoices(mapped);
    setLoading(false);
  }, [businessId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { all: invoices, loading, refresh };
}
