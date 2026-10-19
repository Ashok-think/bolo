/*
# Add business QR image upload support

1. Purpose
   - Lets a business upload their own payment QR image (PNG/JPG) and shows
     it as a fallback when a generated UPI QR fails.

2. Modified Tables
   - `businesses`: new nullable column `qr_image_url` (text) — public URL
     of the uploaded QR image in storage.

3. Storage
   - Creates a public bucket `payment-qr`.
   - Authenticated users may upload only into their own folder (first path
     segment equals their user id); everyone can read (public bucket).

4. Modified Functions
   - `get_invoice_by_token` now also returns `qr_image_url` so the public
     invoice page can show the uploaded QR as a fallback.

5. Security
   - Bucket upload restricted to the owner's folder via storage RLS.
   - Public read is intentional (QR images are shown on public invoice
     pages). No other storage paths are exposed.
*/

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS qr_image_url text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-qr', 'payment-qr', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "owner_upload_payment_qr" ON storage.objects;
CREATE POLICY "owner_upload_payment_qr"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'payment-qr'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "owner_update_payment_qr" ON storage.objects;
CREATE POLICY "owner_update_payment_qr"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'payment-qr'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "public_read_payment_qr" ON storage.objects;
CREATE POLICY "public_read_payment_qr"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'payment-qr');

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
    'qr_image_url', b.qr_image_url,
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