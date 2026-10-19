-- Atomic shared daily AI budget, including attempts that fail at the provider.
CREATE OR REPLACE FUNCTION public.reserve_ai_call(p_user_id uuid, p_lang text DEFAULT 'en')
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE user_uses integer; global_uses integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('bolo_ai_daily_budget'));
  SELECT count(*) INTO global_uses FROM ai_parse_usage WHERE created_at >= date_trunc('day',now());
  SELECT count(*) INTO user_uses FROM ai_parse_usage WHERE user_id=p_user_id AND created_at >= date_trunc('day',now());
  IF user_uses>=40 OR global_uses>=1000 THEN RETURN false; END IF;
  INSERT INTO ai_parse_usage(user_id,lang) VALUES(p_user_id,left(coalesce(p_lang,'en'),12));
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.reserve_ai_call(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_call(uuid,text) TO service_role;

-- Only the explicitly disposable demo account can clear its own business.
CREATE OR REPLACE FUNCTION public.reset_demo_data(p_business_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL OR coalesce(auth.jwt()->>'email','') <> 'demo@bolo.app' OR NOT EXISTS(SELECT 1 FROM businesses WHERE id=p_business_id AND user_id=auth.uid()) THEN
    RAISE EXCEPTION 'Demo account only';
  END IF;
  DELETE FROM invoices WHERE business_id=p_business_id;
  DELETE FROM customers WHERE business_id=p_business_id;
  UPDATE businesses SET name='Bolo Demo',upi_id='',phone=NULL,language='en',qr_image_url=NULL WHERE id=p_business_id;
END; $$;
REVOKE ALL ON FUNCTION public.reset_demo_data(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reset_demo_data(uuid) TO authenticated;
