CREATE OR REPLACE FUNCTION public.is_company_read_only(_company uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.companies
    WHERE id = _company AND (
      subscription_status IN ('past_due','suspended','cancelled')
      OR (subscription_status = 'trial' AND billing_subscription_id IS NULL
          AND trial_ends_at IS NOT NULL AND trial_ends_at < now())
    ))
$$;