import { supabase } from './supabase';
import type { Business, Customer, Invoice, InvoiceItem } from './types';

export interface PaymentInput {
  amount: number;
}

/**
 * Record a payment on an invoice. Marks it paid when the balance reaches
 * zero, stamping paid_at for trust scoring.
 */
export async function markInvoicePaid(
  invoice: Invoice,
  amount: number,
): Promise<{ error: string | null }> {
  const paid = Math.min(invoice.total, invoice.paid_amount + amount);
  const fullyPaid = paid >= invoice.total - 0.009;

  const { error } = await supabase
    .from('invoices')
    .update({
      paid_amount: paid,
      status: fullyPaid ? 'paid' : 'pending',
      paid_at: fullyPaid ? new Date().toISOString() : null,
    })
    .eq('id', invoice.id);

  return { error: error?.message ?? null };
}

export async function deleteInvoice(
  invoiceId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('invoices')
    .delete()
    .eq('id', invoiceId);
  return { error: error?.message ?? null };
}

export async function updateInvoice(
  invoiceId: string,
  updates: Partial<
    Pick<
      Invoice,
      'status' | 'paid_amount' | 'paid_at' | 'sent_at' | 'notes' | 'due_date'
    >
  >,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('invoices')
    .update(updates)
    .eq('id', invoiceId);
  return { error: error?.message ?? null };
}

export async function createInvoice(input: {
  requestId?: string;
  businessId: string;
  customerId: string | null;
  customerName: string;
  customerPhone: string | null;
  items: { name: string; quantity: number; unit_price: number }[];
  advance: number;
  notes?: string;
  existingCustomers: Customer[];
}): Promise<{ invoice: Invoice | null; error: string | null }> {
  const {
    businessId,
    customerId,
    customerName,
    customerPhone,
    items,
    advance,
    notes,
    existingCustomers,
  } = input;

  // Single batched write: customer reuse/creation, invoice and items together
  const { data, error } = await supabase.rpc('create_invoice_batched', {
    p_request_id: input.requestId ?? crypto.randomUUID(),
    p_business_id: businessId,
    p_customer_id: customerId,
    p_customer_name: customerName,
    p_customer_phone: customerPhone,
    p_items: items,
    p_advance: advance,
    p_notes: notes || null,
    p_existing_customers: existingCustomers.map((c) => c.name),
  });

  if (error) return { invoice: null, error: error.message };
  if (!data || typeof data !== 'object') {
    return { invoice: null, error: 'Could not create invoice' };
  }

  const row = data as unknown as Record<string, unknown>;
  const invoice: Invoice = {
    id: String(row.id),
    business_id: String(row.business_id),
    customer_id: (row.customer_id as string) ?? null,
    number: Number(row.number),
    status: (row.status as Invoice['status']) ?? 'pending',
    total: Number(row.total),
    paid_amount: Number(row.paid_amount),
    paid_at: (row.paid_at as string) ?? null,
    sent_at: (row.sent_at as string) ?? null,
    notes: (row.notes as string) ?? null,
    public_token: String(row.public_token),
    due_date: (row.due_date as string) ?? null,
    created_at: String(row.created_at),
  };
  return { invoice, error: null };
}

export interface InvoiceDetailData {
  invoice: Invoice;
  customer: Customer | null;
  business: Business;
  items: InvoiceItem[];
}

export async function fetchInvoiceDetail(
  invoiceId: string,
): Promise<{ data: InvoiceDetailData | null; error: string | null }> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*, customers(*), businesses(*), invoice_items(*)')
    .eq('id', invoiceId)
    .maybeSingle();

  if (error || !data)
    return { data: null, error: error?.message ?? 'Invoice not found' };

  const { customers, businesses, invoice_items, ...invoice } =
    data as unknown as {
      customers: Customer | null;
      businesses: Business;
      invoice_items: InvoiceItem[];
    } & Invoice;

  return {
    data: {
      invoice: {
        ...invoice,
        total: Number(invoice.total),
        paid_amount: Number(invoice.paid_amount),
      },
      customer: customers,
      business: businesses,
      items: invoice_items.map((it) => ({
        ...it,
        quantity: Number(it.quantity),
        unit_price: Number(it.unit_price),
      })),
    },
    error: null,
  };
}

export async function fetchPublicInvoice(token: string): Promise<{
  data: {
    invoice: Omit<Invoice, 'business_id' | 'customer_id' | 'public_token'>;
    customer_name: string | null;
    business_name: string;
    upi_id: string;
    items: { name: string; quantity: number; unit_price: number }[];
  } | null;
  error: string | null;
}> {
  const { data, error } = await supabase.rpc('get_invoice_by_token', {
    p_token: token,
  });
  if (error || !data)
    return { data: null, error: error?.message ?? 'Invoice not found' };
  return { data: data as never, error: null };
}
