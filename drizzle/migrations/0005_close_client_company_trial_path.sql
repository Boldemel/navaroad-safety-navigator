-- Company creation belongs to trusted signup/server provisioning, not client INSERTs.
DROP POLICY IF EXISTS "owners create company" ON public.companies;
CREATE POLICY "super admins create companies" ON public.companies
FOR INSERT TO authenticated
WITH CHECK (public.is_super_admin(auth.uid()));

-- Defense in depth: a nonprivileged INSERT must never mint local trial dates.
CREATE OR REPLACE FUNCTION public.protect_company_billing_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF auth.role() = 'service_role' OR v_uid IS NULL OR public.is_super_admin(v_uid) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.subscription_plan := 'owner_operator';
    NEW.subscription_status := 'trial';
    NEW.plan_start_date := now();
    NEW.plan_end_date := NULL;
    NEW.trial_started_at := NULL;
    NEW.trial_ends_at := NULL;
    NEW.payment_method_on_file := false;
    NEW.payment_method_brand := NULL;
    NEW.payment_method_last4 := NULL;
    NEW.billing_provider := NULL;
    NEW.billing_customer_id := NULL;
    NEW.billing_subscription_id := NULL;
    NEW.stripe_customer_id := NULL;
    NEW.read_only_at := now();
    NEW.reactivated_at := NULL;
    NEW.cancelled_at := NULL;
    RETURN NEW;
  END IF;

  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id
     OR NEW.subscription_plan IS DISTINCT FROM OLD.subscription_plan
     OR NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
     OR NEW.plan_start_date IS DISTINCT FROM OLD.plan_start_date
     OR NEW.plan_end_date IS DISTINCT FROM OLD.plan_end_date
     OR NEW.trial_started_at IS DISTINCT FROM OLD.trial_started_at
     OR NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at
     OR NEW.payment_method_on_file IS DISTINCT FROM OLD.payment_method_on_file
     OR NEW.payment_method_brand IS DISTINCT FROM OLD.payment_method_brand
     OR NEW.payment_method_last4 IS DISTINCT FROM OLD.payment_method_last4
     OR NEW.billing_provider IS DISTINCT FROM OLD.billing_provider
     OR NEW.billing_customer_id IS DISTINCT FROM OLD.billing_customer_id
     OR NEW.billing_subscription_id IS DISTINCT FROM OLD.billing_subscription_id
     OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
     OR NEW.read_only_at IS DISTINCT FROM OLD.read_only_at
     OR NEW.reactivated_at IS DISTINCT FROM OLD.reactivated_at
     OR NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.id IS DISTINCT FROM OLD.id
  THEN
    RAISE EXCEPTION 'Billing and ownership fields can only be changed by the billing system.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$function$;

-- Local future dates alone never qualify a trial for operational writes.
CREATE OR REPLACE FUNCTION public.is_company_read_only(_company uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.companies
    WHERE id = _company AND (
      subscription_status IN ('past_due','suspended','cancelled')
      OR (subscription_status = 'trial' AND (
        billing_subscription_id IS NULL
        OR trial_ends_at IS NULL
        OR trial_ends_at <= now()
      ))
    ))
$function$;