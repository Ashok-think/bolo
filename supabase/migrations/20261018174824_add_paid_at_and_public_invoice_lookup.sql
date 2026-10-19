/*
# Add paid_at and secure public invoice lookup

1. Plain-English explanation
   Adds a timestamp for when an invoice was paid (used for payment-trust
   scoring) and a secure database function that lets anyone with a secret
   invoice link view exactly that one invoice — and nothing else — without
   signing in.

2. Modified tables
   - `invoices`: new nullable column `paid_at` (timestamptz), set when an
     invoice is fully paid.

3. New functions
   - `get_invoice_by_token(p_token uuid)` returns a single JSON object with
     the invoice, its line items, the customer name, and the business
     name/UPI id. SECURITY DEFINER so it can read through RLS, but it only
     ever returns the row matching the exact public token — no listing, no
     other data. Executable by anon and authenticated.

4. Security
   - The function pins `search_path` and takes a uuid token parameter.
   - anon users cannot read the underlying tables directly (RLS already
     restricts all policies to authenticated owners); the token lookup is
     the only public path.
*/

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid_at timestamptz;

CREATE OR REPLACE FUNCTION get_invoice_by_token(p_token uuid)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT json_build_object(
    'invoice', json_build_object(
      'id', i.id,
      'number', i.number,
      'status', i.status,
      'total', i.total,
      'paid_amount', i.paid_amount,
      'notes', i.notes,
      'created_at', i.created_at,
      'due_date', i.due_date,
      'paid_at', i.paid_at
    ),
    'customer_name', c.name,
    'business_name', b.name,
    'upi_id', b.upi_id,
    'items', (
      SELECT COALESCE(
        json_agg(json_build_object(
          'name', ii.name,
          'quantity', ii.quantity,
          'unit_price', ii.unit_price
        )),
        '[]'::json
      )
      FROM invoice_items ii
      WHERE ii.invoice_id = i.id
    )
  )
  FROM invoices i
  LEFT JOIN customers c ON c.id = i.customer_id
  JOIN businesses b ON b.id = i.business_id
  WHERE i.public_token = p_token
$$;

GRANT EXECUTE ON FUNCTION get_invoice_by_token(uuid) TO anon, authenticated;
