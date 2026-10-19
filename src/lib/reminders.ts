import type { Business, Customer, Invoice, Language } from './types';
import { formatINR } from './format';

export type ReminderTone = 'gentle' | 'firm' | 'final';

export function reminderTone(invoice: Invoice, asOf = new Date()): ReminderTone {
  const days = daysOverdue(invoice, asOf);
  if (days > 14) return 'final';
  if (days > 4) return 'firm';
  return 'gentle';
}

export function daysOverdue(invoice: Invoice, asOf = new Date()): number {
  const ref = invoice.due_date ? new Date(invoice.due_date) : new Date(invoice.created_at);
  return Math.max(0, Math.floor((asOf.getTime() - ref.getTime()) / 86400000));
}

const MESSAGES: Record<Language, Record<ReminderTone, string>> = {
  en: {
    gentle:
      'Hi {name}, a gentle reminder about invoice #{number} from {business} for {amount}. Pay via UPI: {upi}. Thank you!',
    firm:
      'Hi {name}, invoice #{number} from {business} ({amount}) is now {days} days overdue. Please pay soon via UPI: {upi}.',
    final:
      'Hi {name}, this is a final reminder for invoice #{number} from {business} ({amount}), {days} days overdue. Kindly settle it via UPI: {upi} today.',
  },
  hi: {
    gentle:
      'नमस्ते {name}, {business} का बिल #{number} ({amount}) के लिए छोटा रिमाइंडर। UPI से भुगतान करें: {upi}। धन्यवाद!',
    firm:
      'नमस्ते {name}, {business} का बिल #{number} ({amount}) {days} दिन से बाकी है। कृपया जल्दी UPI से भुगतान करें: {upi}।',
    final:
      'नमस्ते {name}, {business} का बिल #{number} ({amount}) {days} दिन से बाकी है। कृपया आज ही UPI से भुगतान करें: {upi}।',
  },
  te: {
    gentle:
      'నమస్కారం {name}, {business} బిల్లు #{number} ({amount}) గురించి చిన్న గుర్తు. UPI ద్వారా చెల్లించండి: {upi}. ధన్యవాదాలు!',
    firm:
      'నమస్కారం {name}, {business} బిల్లు #{number} ({amount}) {days} రోజులుగా బకాయి ఉంది. దయచేసి త్వరగా UPI ద్వారా చెల్లించండి: {upi}.',
    final:
      'నమస్కారం {name}, {business} బిల్లు #{number} ({amount}) {days} రోజులుగా బకాయి ఉంది. దయచేసి ఈరోజే UPI ద్వారా చెల్లించండి: {upi}.',
  },
  // Translations pending: these languages fall back to English wording for now.
  ta: {
    gentle:
      'Hi {name}, a gentle reminder about invoice #{number} from {business} for {amount}. Pay via UPI: {upi}. Thank you!',
    firm:
      'Hi {name}, invoice #{number} from {business} ({amount}) is now {days} days overdue. Please pay soon via UPI: {upi}.',
    final:
      'Hi {name}, this is a final reminder for invoice #{number} from {business} ({amount}), {days} days overdue. Kindly settle it via UPI: {upi} today.',
  },
  kn: {
    gentle:
      'Hi {name}, a gentle reminder about invoice #{number} from {business} for {amount}. Pay via UPI: {upi}. Thank you!',
    firm:
      'Hi {name}, invoice #{number} from {business} ({amount}) is now {days} days overdue. Please pay soon via UPI: {upi}.',
    final:
      'Hi {name}, this is a final reminder for invoice #{number} from {business} ({amount}), {days} days overdue. Kindly settle it via UPI: {upi} today.',
  },
  ml: {
    gentle:
      'Hi {name}, a gentle reminder about invoice #{number} from {business} for {amount}. Pay via UPI: {upi}. Thank you!',
    firm:
      'Hi {name}, invoice #{number} from {business} ({amount}) is now {days} days overdue. Please pay soon via UPI: {upi}.',
    final:
      'Hi {name}, this is a final reminder for invoice #{number} from {business} ({amount}), {days} days overdue. Kindly settle it via UPI: {upi} today.',
  },
  mr: {
    gentle:
      'Hi {name}, a gentle reminder about invoice #{number} from {business} for {amount}. Pay via UPI: {upi}. Thank you!',
    firm:
      'Hi {name}, invoice #{number} from {business} ({amount}) is now {days} days overdue. Please pay soon via UPI: {upi}.',
    final:
      'Hi {name}, this is a final reminder for invoice #{number} from {business} ({amount}), {days} days overdue. Kindly settle it via UPI: {upi} today.',
  },
  bn: {
    gentle:
      'Hi {name}, a gentle reminder about invoice #{number} from {business} for {amount}. Pay via UPI: {upi}. Thank you!',
    firm:
      'Hi {name}, invoice #{number} from {business} ({amount}) is now {days} days overdue. Please pay soon via UPI: {upi}.',
    final:
      'Hi {name}, this is a final reminder for invoice #{number} from {business} ({amount}), {days} days overdue. Kindly settle it via UPI: {upi} today.',
  },
  gu: {
    gentle:
      'Hi {name}, a gentle reminder about invoice #{number} from {business} for {amount}. Pay via UPI: {upi}. Thank you!',
    firm:
      'Hi {name}, invoice #{number} from {business} ({amount}) is now {days} days overdue. Please pay soon via UPI: {upi}.',
    final:
      'Hi {name}, this is a final reminder for invoice #{number} from {business} ({amount}), {days} days overdue. Kindly settle it via UPI: {upi} today.',
  },
};

/** Languages whose reminder templates are still pending translation. */
const TRANSLATIONS_PENDING: Language[] = ['ta', 'kn', 'ml', 'mr', 'bn', 'gu'];

export function remindersInEnglish(lang: Language): boolean {
  return TRANSLATIONS_PENDING.includes(lang);
}

export function reminderMessage(
  invoice: Invoice,
  customer: Customer,
  business: Business,
  tone: ReminderTone
): string {
  const lang = (business.language ?? 'en') as Language;
  const template = MESSAGES[lang][tone];
  return template
    .replace('{name}', customer.name)
    .replace('{number}', String(invoice.number))
    .replace('{business}', business.name)
    .replace('{amount}', formatINR(invoice.total - invoice.paid_amount))
    .replace('{days}', String(daysOverdue(invoice)))
    .replace('{upi}', business.upi_id);
}

/** One-tap reminder (not automatic): opens WhatsApp with a pre-written message. */
export function openReminder(invoice: Invoice, customer: Customer, business: Business): void {
  const tone = reminderTone(invoice);
  const message = reminderMessage(invoice, customer, business, tone);
  const phone = customer.phone ? customer.phone.replace(/[^0-9]/g, '') : '';
  const url = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}
