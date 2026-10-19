import type { Business, Customer, Invoice } from './types';
import { formatINR } from './format';
import { updateInvoice } from './invoiceOps';

export async function shareInvoiceOnWhatsApp(
  invoice: Invoice,
  customer: Customer,
  business: Business
): Promise<void> {
  const message =
    `Hi ${customer.name}, your invoice #${invoice.number} from ${business.name} ` +
    `for ${formatINR(invoice.total)} is ready. Pay via UPI: ${business.upi_id}. ` +
    `View: https://bolo.app/invoice/${invoice.public_token}`;

  const phone = customer.phone ? customer.phone.replace(/[^0-9]/g, '') : '';
  const url = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`;

  window.open(url, '_blank', 'noopener,noreferrer');

  // Move pending -> sent when shared; never move a paid invoice backwards
  if (invoice.status === 'pending') {
    await updateInvoice(invoice.id, {
      status: 'sent',
      sent_at: new Date().toISOString(),
    });
  }
}
