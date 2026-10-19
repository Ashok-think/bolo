import { useCallback, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface DemoItem {
  name: string;
  quantity: number;
  unit_price: number;
}

interface DemoInvoice {
  customerIndex: number;
  status: 'pending' | 'paid';
  items: DemoItem[];
  daysAgo: number;
}

const DEMO_CUSTOMERS = [
  { name: 'Ravi Kumar', phone: '+91 98765 43210' },
  { name: 'Priya Sharma', phone: '+91 87654 32109' },
  { name: 'Mohammed Irfan', phone: '+91 76543 21098' },
  { name: 'Sunita Devi', phone: '+91 65432 10987' },
  { name: 'Arjun Nair', phone: '+91 54321 09876' },
  { name: 'Kavitha Reddy', phone: '+91 43210 98765' },
];

const DEMO_INVOICES: DemoInvoice[] = [
  { customerIndex: 0, status: 'paid', items: [{ name: 'Shirt stitching', quantity: 2, unit_price: 450 }, { name: 'Trouser', quantity: 1, unit_price: 600 }], daysAgo: 20 },
  { customerIndex: 0, status: 'pending', items: [{ name: 'Blouse', quantity: 3, unit_price: 350 }], daysAgo: 4 },
  { customerIndex: 1, status: 'paid', items: [{ name: 'Math tuition', quantity: 4, unit_price: 800 }], daysAgo: 25 },
  { customerIndex: 1, status: 'pending', items: [{ name: 'Science tuition', quantity: 3, unit_price: 800 }], daysAgo: 3 },
  { customerIndex: 2, status: 'pending', items: [{ name: 'Pipe fitting', quantity: 1, unit_price: 2500 }], daysAgo: 8 },
  { customerIndex: 2, status: 'paid', items: [{ name: 'Tap repair', quantity: 1, unit_price: 800 }], daysAgo: 15 },
  { customerIndex: 3, status: 'paid', items: [{ name: 'Grocery supply', quantity: 1, unit_price: 4200 }], daysAgo: 30 },
  { customerIndex: 3, status: 'pending', items: [{ name: 'Monthly account', quantity: 1, unit_price: 3800 }], daysAgo: 2 },
  { customerIndex: 4, status: 'pending', items: [{ name: 'Electrical wiring', quantity: 1, unit_price: 6500 }], daysAgo: 6 },
  { customerIndex: 4, status: 'paid', items: [{ name: 'Switch repair', quantity: 3, unit_price: 200 }], daysAgo: 18 },
  { customerIndex: 5, status: 'paid', items: [{ name: 'Mehendi design', quantity: 1, unit_price: 1500 }], daysAgo: 12 },
  { customerIndex: 5, status: 'pending', items: [{ name: 'Bridal package', quantity: 1, unit_price: 8000 }], daysAgo: 1 },
];

export function useDemoData() {
  const [inserting, setInserting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDemoData = useCallback(
    async (businessId: string): Promise<boolean> => {
      setInserting(true);
      setError(null);

      const { data: maxRow } = await supabase
        .from('invoices')
        .select('number')
        .eq('business_id', businessId)
        .order('number', { ascending: false })
        .limit(1)
        .maybeSingle();

      let nextNumber = (maxRow?.number ?? 0) + 1;

      const { data: insertedCustomers, error: custError } = await supabase
        .from('customers')
        .insert(DEMO_CUSTOMERS.map((c) => ({ ...c, business_id: businessId })))
        .select('id');

      if (custError || !insertedCustomers) {
        setError(custError?.message ?? 'Could not create demo customers');
        setInserting(false);
        return false;
      }

      const now = Date.now();
      const invoiceRows = DEMO_INVOICES.map((demo) => {
        const total = demo.items.reduce((sum, it) => sum + it.quantity * it.unit_price, 0);
        return {
          business_id: businessId,
          customer_id: insertedCustomers[demo.customerIndex].id,
          number: nextNumber++,
          status: demo.status,
          total,
          paid_amount: demo.status === 'paid' ? total : 0,
          created_at: new Date(now - demo.daysAgo * 86400000).toISOString(),
          due_date: new Date(now + 7 * 86400000).toISOString().slice(0, 10),
        };
      });

      const { data: insertedInvoices, error: invError } = await supabase
        .from('invoices')
        .insert(invoiceRows)
        .select('id');

      if (invError || !insertedInvoices) {
        setError(invError?.message ?? 'Could not create demo invoices');
        setInserting(false);
        return false;
      }

      const itemRows = DEMO_INVOICES.flatMap((demo, i) =>
        demo.items.map((it) => ({
          invoice_id: insertedInvoices[i].id,
          name: it.name,
          quantity: it.quantity,
          unit_price: it.unit_price,
        }))
      );

      const { error: itemError } = await supabase.from('invoice_items').insert(itemRows);

      if (itemError) {
        setError(itemError.message);
        setInserting(false);
        return false;
      }

      setInserting(false);
      return true;
    },
    []
  );

  return { loadDemoData, inserting, error };
}
