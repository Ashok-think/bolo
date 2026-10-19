/*
# Create Bolo invoicing schema (businesses, customers, invoices, invoice_items)

1. Short title
   Multi-user voice-invoicing app schema with owner-scoped row level security.

2. Plain-English explanation
   Each signed-in user owns exactly one business. A business has customers,
   invoices, and invoice line items. Every user can only see and change their
   own business and everything under it. Sign-up/sign-in is handled by
   Supabase Auth (email + password, email confirmation off).

3. New tables
   - `businesses`: one per user — name, UPI ID, WhatsApp phone, voice language (en/hi/te).
   - `customers`: belongs to a business — name, phone.
   - `invoices`: belongs to a business, optionally linked to a customer —
     serial number, status (pending/paid), total, paid amount, notes,
     public share token, due date.
   - `invoice_items`: line items on an invoice — name, quantity, unit price.

4. Security
   - RLS enabled on all four tables.
   - Four separate policies per table (select / insert / update / delete),
     scoped TO authenticated, all checking the caller owns the business row
     via `auth.uid()`.
   - `businesses.user_id` defaults to `auth.uid()` so the onboarding insert
     works even if the client omits the owner column.

5. Notes
   - `businesses.user_id` is UNIQUE: one business per account.
   - Indexes on foreign-key and filter columns for list queries.
*/

CREATE TABLE IF NOT EXISTS businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  upi_id text NOT NULL,
  phone text,
  language text NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'hi', 'te')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  number integer NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  total numeric(10,2) NOT NULL DEFAULT 0,
  paid_amount numeric(10,2) NOT NULL DEFAULT 0,
  notes text,
  public_token uuid NOT NULL DEFAULT gen_random_uuid(),
  due_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, number)
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  name text NOT NULL,
  quantity numeric(10,2) NOT NULL DEFAULT 1,
  unit_price numeric(10,2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_customers_business ON customers(business_id);
CREATE INDEX IF NOT EXISTS idx_invoices_business ON invoices(business_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(business_id, status);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);

ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select own business" ON businesses;
DROP POLICY IF EXISTS "insert own business" ON businesses;
DROP POLICY IF EXISTS "update own business" ON businesses;
DROP POLICY IF EXISTS "delete own business" ON businesses;

CREATE POLICY "select own business" ON businesses FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert own business" ON businesses FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update own business" ON businesses FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete own business" ON businesses FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "select own customers" ON customers;
DROP POLICY IF EXISTS "insert own customers" ON customers;
DROP POLICY IF EXISTS "update own customers" ON customers;
DROP POLICY IF EXISTS "delete own customers" ON customers;

CREATE POLICY "select own customers" ON customers FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM businesses b WHERE b.id = customers.business_id AND b.user_id = auth.uid()));
CREATE POLICY "insert own customers" ON customers FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM businesses b WHERE b.id = customers.business_id AND b.user_id = auth.uid()));
CREATE POLICY "update own customers" ON customers FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM businesses b WHERE b.id = customers.business_id AND b.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM businesses b WHERE b.id = customers.business_id AND b.user_id = auth.uid()));
CREATE POLICY "delete own customers" ON customers FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM businesses b WHERE b.id = customers.business_id AND b.user_id = auth.uid()));

DROP POLICY IF EXISTS "select own invoices" ON invoices;
DROP POLICY IF EXISTS "insert own invoices" ON invoices;
DROP POLICY IF EXISTS "update own invoices" ON invoices;
DROP POLICY IF EXISTS "delete own invoices" ON invoices;

CREATE POLICY "select own invoices" ON invoices FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM businesses b WHERE b.id = invoices.business_id AND b.user_id = auth.uid()));
CREATE POLICY "insert own invoices" ON invoices FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM businesses b WHERE b.id = invoices.business_id AND b.user_id = auth.uid()));
CREATE POLICY "update own invoices" ON invoices FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM businesses b WHERE b.id = invoices.business_id AND b.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM businesses b WHERE b.id = invoices.business_id AND b.user_id = auth.uid()));
CREATE POLICY "delete own invoices" ON invoices FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM businesses b WHERE b.id = invoices.business_id AND b.user_id = auth.uid()));

DROP POLICY IF EXISTS "select own invoice items" ON invoice_items;
DROP POLICY IF EXISTS "insert own invoice items" ON invoice_items;
DROP POLICY IF EXISTS "update own invoice items" ON invoice_items;
DROP POLICY IF EXISTS "delete own invoice items" ON invoice_items;

CREATE POLICY "select own invoice items" ON invoice_items FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM invoices i
    JOIN businesses b ON b.id = i.business_id
    WHERE i.id = invoice_items.invoice_id AND b.user_id = auth.uid()
  ));
CREATE POLICY "insert own invoice items" ON invoice_items FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM invoices i
    JOIN businesses b ON b.id = i.business_id
    WHERE i.id = invoice_items.invoice_id AND b.user_id = auth.uid()
  ));
CREATE POLICY "update own invoice items" ON invoice_items FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM invoices i
    JOIN businesses b ON b.id = i.business_id
    WHERE i.id = invoice_items.invoice_id AND b.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM invoices i
    JOIN businesses b ON b.id = i.business_id
    WHERE i.id = invoice_items.invoice_id AND b.user_id = auth.uid()
  ));
CREATE POLICY "delete own invoice items" ON invoice_items FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM invoices i
    JOIN businesses b ON b.id = i.business_id
    WHERE i.id = invoice_items.invoice_id AND b.user_id = auth.uid()
  ));
