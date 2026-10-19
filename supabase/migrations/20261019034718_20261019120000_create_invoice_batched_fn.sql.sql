/*
# Batched invoice creation

1. Purpose
- Invoice saves previously needed four separate round trips (create customer,
  read next number, create invoice, create items). This adds one database
  function so the app can save a customer, an invoice and its items together
  in a single call and get the new invoice id back immediately.

2. New function
- `create_invoice_batched` (security definer, search_path pinned)
  - Arguments: `p_business_id` (uuid), `p_customer_id` (uuid, nullable — when
    null, a new customer row is created from `p_customer_name` and
    `p_customer_phone`), `p_customer_name` (text), `p_customer_phone`
    (text, nullable), `p_items` (jsonb array of { name, quantity,
    unit_price }), `p_advance` (numeric), `p_notes` (text, nullable),
    `p_existing_customers` (jsonb array of customer names already known, so
    an exact case-insensitive name match reuses the existing customer row
    without a lookup).
  - Returns the full new invoice row (`id`, `number`, `public_token`, etc.)
    as jsonb. Computes the next serial `number` per business, stamps
    `paid_at` when the advance covers the total, and sets a 7-day default
    due date.

3. Security
- The function runs as definer but re-checks ownership itself: it verifies
  the target business belongs to `auth.uid()` before any write, so callers
  can only create invoices for their own business.
- No RLS changes; all existing table policies remain.

4. Notes
- Idempotent: `CREATE OR REPLACE FUNCTION`.
- No destructive operations; no data changes.
*/

CREATE OR REPLACE FUNCTION public.create_invoice_batched(
  p_business_id uuid,
  p_customer_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_items jsonb,
  p_advance numeric,
  p_notes text,
  p_existing_customers jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_customer_id uuid := p_customer_id;
  v_number integer;
  v_total numeric;
  v_advance numeric;
  v_fully_paid boolean;
  v_invoice public.invoices;
  v_name text;
BEGIN
  -- Ownership re-check: the business must belong to the caller
  IF v_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.businesses
    WHERE id = p_business_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Business not found for caller';
  END IF;

  -- Reuse an existing customer by exact case-insensitive name match
  IF v_customer_id IS NULL THEN
    FOR v_name IN SELECT jsonb_array_elements_text(p_existing_customers)
    LOOP
      IF lower(trim(v_name)) = lower(trim(p_customer_name)) THEN
        SELECT id INTO v_customer_id FROM public.customers
        WHERE business_id = p_business_id
          AND lower(trim(name)) = lower(trim(p_customer_name))
        LIMIT 1;
        EXIT WHEN v_customer_id IS NOT NULL;
      END IF;
    END LOOP;
  END IF;

  -- Create a new customer row when no reuse was possible
  IF v_customer_id IS NULL THEN
    INSERT INTO public.customers (business_id, name, phone)
    VALUES (p_business_id, trim(p_customer_name), nullif(trim(coalesce(p_customer_phone, '')), ''))
    RETURNING id INTO v_customer_id;
  END IF;

  SELECT COALESCE(MAX(number), 0) + 1 INTO v_number
  FROM public.invoices WHERE business_id = p_business_id;

  SELECT SUM((it->>'quantity')::numeric * (it->>'unit_price')::numeric)
  INTO v_total
  FROM jsonb_array_elements(p_items) AS it;

  v_advance := LEAST(p_advance, v_total);
  v_fully_paid := v_advance >= v_total - 0.009;

  INSERT INTO public.invoices (
    business_id, customer_id, number, status, total, paid_amount,
    paid_at, notes, due_date
  )
  VALUES (
    p_business_id, v_customer_id, v_number,
    CASE WHEN v_fully_paid THEN 'paid' ELSE 'pending' END,
    v_total, v_advance,
    CASE WHEN v_fully_paid THEN now() ELSE NULL END,
    nullif(trim(coalesce(p_notes, '')), ''),
    (now() + INTERVAL '7 days')::date
  )
  RETURNING * INTO v_invoice;

  INSERT INTO public.invoice_items (invoice_id, name, quantity, unit_price)
  SELECT
    v_invoice.id,
    trim(it->>'name'),
    (it->>'quantity')::numeric,
    (it->>'unit_price')::numeric
  FROM jsonb_array_elements(p_items) AS it;

  RETURN to_jsonb(v_invoice);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_invoice_batched TO authenticated;
