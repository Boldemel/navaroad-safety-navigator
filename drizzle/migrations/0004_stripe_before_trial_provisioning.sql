-- New signups must NOT receive a usable local trial before Stripe Checkout.
-- Provision the company in a pre-checkout state: plan set, no trial dates,
-- read-only until the Stripe webhook records the real subscription/trial.
CREATE OR REPLACE FUNCTION public.provision_company_for_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE new_company_id uuid; new_member_id uuid; display_name text;
BEGIN
  display_name := COALESCE(NEW.raw_user_meta_data->>'driver_name', split_part(NEW.email, '@', 1), 'My Fleet');
  INSERT INTO public.companies(name, owner_id, subscription_plan, subscription_status, trial_started_at, trial_ends_at, read_only_at)
    VALUES (display_name || '''s Fleet', NEW.id, 'owner_operator', 'trial', NULL, NULL, now())
    RETURNING id INTO new_company_id;
  INSERT INTO public.company_members(company_id, user_id) VALUES (new_company_id, NEW.id) RETURNING id INTO new_member_id;
  INSERT INTO public.company_member_roles(member_id, role) VALUES (new_member_id, 'fleet_owner');
  RETURN NEW;
END;
$function$;

-- A trial without a Stripe subscription is read-only unless Stripe has set a
-- future trial end (i.e. the webhook recorded a real trialing subscription).
CREATE OR REPLACE FUNCTION public.is_company_read_only(_company uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.companies
    WHERE id = _company AND (
      subscription_status IN ('past_due','suspended','cancelled')
      OR (subscription_status = 'trial' AND billing_subscription_id IS NULL
          AND (trial_ends_at IS NULL OR trial_ends_at < now()))
    ))
$function$;