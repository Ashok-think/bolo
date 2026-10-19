-- Additive migration: preserve the original RPC used by the published app.
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS client_request_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS invoices_client_request_id_idx ON public.invoices(client_request_id) WHERE client_request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_invoice_batched_v2(
  p_business_id uuid,
  p_customer_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_items jsonb,
  p_advance numeric,
  p_notes text,
  p_existing_customers jsonb,
  p_request_id uuid DEFAULT NULL
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
BEGIN
  -- Ownership re-check: the business must belong to the caller
  IF v_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.businesses
    WHERE id = p_business_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Business not found for caller';
  END IF;

  -- Lock this business to serialize invoice numbering and retries.
  PERFORM 1 FROM businesses WHERE id=p_business_id FOR UPDATE;
  IF p_request_id IS NOT NULL THEN
    SELECT * INTO v_invoice FROM invoices WHERE business_id=p_business_id AND client_request_id=p_request_id;
    IF FOUND THEN RETURN to_jsonb(v_invoice); END IF;
  END IF;
  IF coalesce(trim(p_customer_name),'')='' OR cardinality(regexp_split_to_array(trim(p_customer_name),'\s+'))>4 THEN RAISE EXCEPTION 'Add the customer name (up to 4 words)'; END IF;
  IF jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'Add 1 to 30 items'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_items) it WHERE coalesce(trim(it->>'name'),'')='' OR (it->>'quantity')::numeric<=0 OR (it->>'unit_price')::numeric<0) THEN RAISE EXCEPTION 'Check item names, quantities and prices'; END IF;
  IF p_advance<0 THEN RAISE EXCEPTION 'Advance cannot be negative'; END IF;
  IF v_customer_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM customers WHERE id=v_customer_id AND business_id=p_business_id) THEN RAISE EXCEPTION 'Customer does not belong to business'; END IF;
  IF v_customer_id IS NULL THEN
    SELECT id INTO v_customer_id FROM customers WHERE business_id=p_business_id AND lower(trim(name))=lower(trim(p_customer_name)) LIMIT 1;
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

  IF v_total IS NULL OR v_total<=0 OR v_total::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Check invoice total'; END IF;
  v_advance := LEAST(coalesce(p_advance,0), v_total);
  v_fully_paid := v_advance >= v_total - 0.009;

  INSERT INTO public.invoices (
    business_id, customer_id, number, status, total, paid_amount,
    paid_at, notes, due_date, client_request_id
  )
  VALUES (
    p_business_id, v_customer_id, v_number,
    CASE WHEN v_fully_paid THEN 'paid' ELSE 'pending' END,
    v_total, v_advance,
    CASE WHEN v_fully_paid THEN now() ELSE NULL END,
    nullif(trim(coalesce(p_notes, '')), ''),
    (now() + INTERVAL '7 days')::date, p_request_id
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

GRANT EXECUTE ON FUNCTION public.create_invoice_batched_v2(uuid,uuid,text,text,jsonb,numeric,text,jsonb,uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.create_invoice_batched_v2(uuid,uuid,text,text,jsonb,numeric,text,jsonb,uuid) FROM PUBLIC,anon;
