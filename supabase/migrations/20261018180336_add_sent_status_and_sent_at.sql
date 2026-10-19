/*
# Add "sent" invoice status and sent_at timestamp

1. Plain-English explanation
   Invoices now track whether they were sent to the customer. A new
   "sent" status sits between "pending" and "paid", and a timestamp
   records when it was sent (shown as "Sent 2 days ago" in the app).
   Sent invoices still count as unpaid money owed.

2. Modified tables
   - `invoices`: new nullable column `sent_at` (timestamptz), set the first
     time the invoice is shared on WhatsApp.
   - `invoices`: the status check now allows 'pending', 'sent', 'paid'.

3. Security
   - No policy changes; existing owner-scoped RLS still applies.
*/

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sent_at timestamptz;

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('pending', 'sent', 'paid'));
