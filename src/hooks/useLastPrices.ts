import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { InvoiceItem } from '@/lib/types';

/** Remembers the last unit price used for each item name (per business). */
export function useLastPrices(businessId: string | undefined) {
  const [lastPrices, setLastPrices] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    if (!businessId) return;
    supabase
      .from('invoice_items')
      .select('name, unit_price, invoices!inner(business_id, created_at)')
      .eq('invoices.business_id', businessId)
      .order('invoices.created_at', { ascending: false })
      .limit(200)
      .then(({ data }) => {
        const map = new Map<string, number>();
        for (const row of (data ?? []) as unknown as {
          name: string;
          unit_price: number;
        }[]) {
          const key = row.name.toLowerCase().trim();
          if (!map.has(key)) map.set(key, Number(row.unit_price));
        }
        setLastPrices(map);
      });
  }, [businessId]);

  const priceFor = useCallback(
    (name: string): number | undefined => lastPrices.get(name.toLowerCase().trim()),
    [lastPrices]
  );

  return { priceFor };
}
