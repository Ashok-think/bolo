export type Language = 'en' | 'hi' | 'te' | 'ta' | 'kn' | 'ml' | 'mr' | 'bn' | 'gu';

export type InvoiceStatus = 'pending' | 'sent' | 'paid';

export interface Business {
  id: string;
  user_id: string;
  name: string;
  upi_id: string;
  phone: string | null;
  language: Language;
  qr_image_url: string | null;
  created_at: string;
}

export interface Customer {
  id: string;
  business_id: string;
  name: string;
  phone: string | null;
  created_at: string;
}

export interface Invoice {
  id: string;
  business_id: string;
  customer_id: string | null;
  number: number;
  status: InvoiceStatus;
  total: number;
  paid_amount: number;
  paid_at: string | null;
  sent_at: string | null;
  notes: string | null;
  public_token: string;
  due_date: string | null;
  created_at: string;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  name: string;
  quantity: number;
  unit_price: number;
}

export interface InvoiceWithCustomer extends Invoice {
  customer_name: string | null;
}

export interface CustomerWithPending extends Customer {
  pending_amount: number;
  pending_count: number;
}
