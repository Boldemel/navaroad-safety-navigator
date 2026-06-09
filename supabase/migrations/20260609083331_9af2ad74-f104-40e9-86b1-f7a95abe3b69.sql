
-- 0. Clear plan_feature_access first to avoid remap collisions
DELETE FROM public.plan_feature_access;

-- 1. Replace subscription_plan enum
ALTER TABLE public.companies ALTER COLUMN subscription_plan DROP DEFAULT;
ALTER TABLE public.plan_feature_access ALTER COLUMN plan TYPE text USING plan::text;
ALTER TABLE public.companies ALTER COLUMN subscription_plan TYPE text USING subscription_plan::text;
UPDATE public.companies SET subscription_plan = 'owner_operator' WHERE subscription_plan = 'free_driver';
UPDATE public.companies SET subscription_plan = 'small_fleet'    WHERE subscription_plan = 'fleet';
DROP TYPE public.subscription_plan;
CREATE TYPE public.subscription_plan AS ENUM ('owner_operator', 'small_fleet', 'growth_fleet', 'enterprise');
ALTER TABLE public.plan_feature_access ALTER COLUMN plan TYPE public.subscription_plan USING plan::public.subscription_plan;
ALTER TABLE public.companies ALTER COLUMN subscription_plan TYPE public.subscription_plan USING subscription_plan::public.subscription_plan;
ALTER TABLE public.companies ALTER COLUMN subscription_plan SET DEFAULT 'owner_operator'::public.subscription_plan;

-- 2. Replace subscription_status enum
ALTER TABLE public.companies ALTER COLUMN subscription_status DROP DEFAULT;
ALTER TABLE public.companies ALTER COLUMN subscription_status TYPE text USING subscription_status::text;
UPDATE public.companies SET subscription_status = 'trial'     WHERE subscription_status IN ('trialing');
UPDATE public.companies SET subscription_status = 'cancelled' WHERE subscription_status IN ('canceled','expired');
DROP TYPE public.subscription_status;
CREATE TYPE public.subscription_status AS ENUM ('trial','active','past_due','suspended','cancelled');
ALTER TABLE public.companies ALTER COLUMN subscription_status TYPE public.subscription_status USING subscription_status::public.subscription_status;
ALTER TABLE public.companies ALTER COLUMN subscription_status SET DEFAULT 'trial'::public.subscription_status;

-- 3. Trial + billing columns
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS trial_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_method_on_file boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_method_brand text,
  ADD COLUMN IF NOT EXISTS payment_method_last4 text,
  ADD COLUMN IF NOT EXISTS billing_provider text,
  ADD COLUMN IF NOT EXISTS billing_customer_id text,
  ADD COLUMN IF NOT EXISTS billing_subscription_id text,
  ADD COLUMN IF NOT EXISTS read_only_at timestamptz,
  ADD COLUMN IF NOT EXISTS reactivated_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

UPDATE public.companies
  SET trial_started_at = COALESCE(trial_started_at, created_at),
      trial_ends_at    = COALESCE(trial_ends_at, created_at + interval '7 days'),
      subscription_status = 'trial'
  WHERE trial_ends_at IS NULL AND subscription_status NOT IN ('active','past_due','suspended','cancelled');

-- 4. Subscription plans catalog
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan public.subscription_plan NOT NULL UNIQUE,
  display_name text NOT NULL,
  description text,
  monthly_price_usd numeric(10,2) NOT NULL DEFAULT 0,
  annual_price_usd  numeric(10,2) NOT NULL DEFAULT 0,
  truck_limit integer,
  user_limit  integer,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  stripe_product_id text,
  stripe_monthly_price_id text,
  stripe_annual_price_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscription_plans TO authenticated;
GRANT ALL ON public.subscription_plans TO service_role;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone signed in can read active plans"
  ON public.subscription_plans FOR SELECT TO authenticated
  USING (is_active = true OR public.is_super_admin(auth.uid()));
CREATE POLICY "Super admins manage plans"
  ON public.subscription_plans FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
CREATE TRIGGER trg_subscription_plans_updated_at
  BEFORE UPDATE ON public.subscription_plans
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.subscription_plans (plan, display_name, description, monthly_price_usd, annual_price_usd, truck_limit, user_limit, features, sort_order) VALUES
  ('owner_operator','Owner Operator','For single-truck owner operators.',49,490,1,1,
   '["Route Analysis","Hazards & Alerts","Loads","Fuel Log","IFTA Mileage","Logbook & HOS","Driver Documents","Maintenance","Inspections","Expenses & Earnings","Fleet AI Assistant"]'::jsonb,1),
  ('small_fleet','Small Fleet','Up to 10 trucks with team management.',199,1990,10,NULL,
   '["Everything in Owner Operator","Multi-driver support","Company & Team Management","Dispatcher role","Safety Manager role","Accountant role","Fleet Profitability Analytics","Advanced Reporting"]'::jsonb,2),
  ('growth_fleet','Growth Fleet','Up to 50 trucks with advanced analytics.',499,4990,50,NULL,
   '["Everything in Small Fleet","Advanced AI Insights","Safety Performance Dashboard","Maintenance Analytics","Company-wide KPI Dashboard","Custom Reporting"]'::jsonb,3),
  ('enterprise','Enterprise','Unlimited trucks and users.',0,0,NULL,NULL,
   '["Unlimited trucks","Unlimited users","Multi-location support","API access","Custom integrations","Dedicated onboarding"]'::jsonb,4);

-- 5. plan_feature_access rows
INSERT INTO public.plan_feature_access (plan, feature_key, enabled, usage_limit) VALUES
  ('owner_operator','navigation',true,NULL),('owner_operator','hazard_reports',true,NULL),
  ('owner_operator','loads',true,NULL),('owner_operator','fuel_purchases',true,NULL),
  ('owner_operator','ifta_basic',true,NULL),('owner_operator','logbook_manual_hos',true,NULL),
  ('owner_operator','documents',true,NULL),('owner_operator','maintenance_records',true,NULL),
  ('owner_operator','maintenance_tasks',true,NULL),('owner_operator','inspections_dvir',true,NULL),
  ('owner_operator','expenses',true,NULL),('owner_operator','settlements',true,NULL),
  ('owner_operator','ai_assistant',true,200),('owner_operator','reports_export',true,NULL),
  ('owner_operator','trip_logs',true,NULL),('owner_operator','team_management',false,1),
  ('owner_operator','fleet_profitability',false,NULL),('owner_operator','advanced_reporting',false,NULL),
  ('owner_operator','live_fleet_map',false,NULL),('owner_operator','eld_integration',false,NULL),
  ('owner_operator','safety_dashboard',false,NULL),('owner_operator','maintenance_analytics',false,NULL),
  ('owner_operator','kpi_dashboard',false,NULL),('owner_operator','custom_reporting',false,NULL),
  ('owner_operator','api_access',false,NULL),
  ('small_fleet','navigation',true,NULL),('small_fleet','hazard_reports',true,NULL),
  ('small_fleet','loads',true,NULL),('small_fleet','fuel_purchases',true,NULL),
  ('small_fleet','ifta_basic',true,NULL),('small_fleet','logbook_manual_hos',true,NULL),
  ('small_fleet','documents',true,NULL),('small_fleet','maintenance_records',true,NULL),
  ('small_fleet','maintenance_tasks',true,NULL),('small_fleet','inspections_dvir',true,NULL),
  ('small_fleet','expenses',true,NULL),('small_fleet','settlements',true,NULL),
  ('small_fleet','ai_assistant',true,NULL),('small_fleet','reports_export',true,NULL),
  ('small_fleet','trip_logs',true,NULL),('small_fleet','team_management',true,NULL),
  ('small_fleet','fleet_profitability',true,NULL),('small_fleet','advanced_reporting',true,NULL),
  ('small_fleet','live_fleet_map',true,NULL),('small_fleet','eld_integration',true,NULL),
  ('small_fleet','safety_dashboard',false,NULL),('small_fleet','maintenance_analytics',false,NULL),
  ('small_fleet','kpi_dashboard',false,NULL),('small_fleet','custom_reporting',false,NULL),
  ('small_fleet','api_access',false,NULL),
  ('growth_fleet','navigation',true,NULL),('growth_fleet','hazard_reports',true,NULL),
  ('growth_fleet','loads',true,NULL),('growth_fleet','fuel_purchases',true,NULL),
  ('growth_fleet','ifta_basic',true,NULL),('growth_fleet','logbook_manual_hos',true,NULL),
  ('growth_fleet','documents',true,NULL),('growth_fleet','maintenance_records',true,NULL),
  ('growth_fleet','maintenance_tasks',true,NULL),('growth_fleet','inspections_dvir',true,NULL),
  ('growth_fleet','expenses',true,NULL),('growth_fleet','settlements',true,NULL),
  ('growth_fleet','ai_assistant',true,NULL),('growth_fleet','reports_export',true,NULL),
  ('growth_fleet','trip_logs',true,NULL),('growth_fleet','team_management',true,NULL),
  ('growth_fleet','fleet_profitability',true,NULL),('growth_fleet','advanced_reporting',true,NULL),
  ('growth_fleet','live_fleet_map',true,NULL),('growth_fleet','eld_integration',true,NULL),
  ('growth_fleet','safety_dashboard',true,NULL),('growth_fleet','maintenance_analytics',true,NULL),
  ('growth_fleet','kpi_dashboard',true,NULL),('growth_fleet','custom_reporting',true,NULL),
  ('growth_fleet','api_access',false,NULL),
  ('enterprise','navigation',true,NULL),('enterprise','hazard_reports',true,NULL),
  ('enterprise','loads',true,NULL),('enterprise','fuel_purchases',true,NULL),
  ('enterprise','ifta_basic',true,NULL),('enterprise','logbook_manual_hos',true,NULL),
  ('enterprise','documents',true,NULL),('enterprise','maintenance_records',true,NULL),
  ('enterprise','maintenance_tasks',true,NULL),('enterprise','inspections_dvir',true,NULL),
  ('enterprise','expenses',true,NULL),('enterprise','settlements',true,NULL),
  ('enterprise','ai_assistant',true,NULL),('enterprise','reports_export',true,NULL),
  ('enterprise','trip_logs',true,NULL),('enterprise','team_management',true,NULL),
  ('enterprise','fleet_profitability',true,NULL),('enterprise','advanced_reporting',true,NULL),
  ('enterprise','live_fleet_map',true,NULL),('enterprise','eld_integration',true,NULL),
  ('enterprise','safety_dashboard',true,NULL),('enterprise','maintenance_analytics',true,NULL),
  ('enterprise','kpi_dashboard',true,NULL),('enterprise','custom_reporting',true,NULL),
  ('enterprise','api_access',true,NULL);

-- 6. Helper functions
CREATE OR REPLACE FUNCTION public.is_company_read_only(_company uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.companies
    WHERE id = _company AND subscription_status IN ('past_due','suspended','cancelled'))
$$;

CREATE OR REPLACE FUNCTION public.company_has_feature(_company uuid, _feature text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT pfa.enabled FROM public.companies c
     JOIN public.plan_feature_access pfa ON pfa.plan = c.subscription_plan AND pfa.feature_key = _feature
     WHERE c.id = _company), false)
$$;

CREATE OR REPLACE FUNCTION public.current_trial_days_remaining(_company uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT GREATEST(0, CEIL(EXTRACT(EPOCH FROM (trial_ends_at - now())) / 86400))::int
  FROM public.companies WHERE id = _company
$$;

-- 7. Read-only enforcement trigger
CREATE OR REPLACE FUNCTION public.enforce_company_writable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_company uuid;
BEGIN
  IF public.is_super_admin(auth.uid()) THEN RETURN COALESCE(NEW, OLD); END IF;
  v_company := (CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END).company_id;
  IF v_company IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  IF public.is_company_read_only(v_company) THEN
    RAISE EXCEPTION 'Subscription is read-only. Reactivate billing to make changes.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$
DECLARE t text;
  tables text[] := ARRAY['loads','trip_logs','inspections','maintenance_records','maintenance_tasks',
    'documents','fuel_purchases','expenses','ifta_entries','duty_status_logs','settlements',
    'saved_routes','favorite_locations','hazard_reports','driver_eld_credentials','support_requests'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_enforce_writable ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_enforce_writable BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_company_writable()', t);
  END LOOP;
END $$;

-- 8. Signup trigger starts a 7-day trial
CREATE OR REPLACE FUNCTION public.provision_company_for_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_company_id uuid; new_member_id uuid; display_name text;
BEGIN
  display_name := COALESCE(NEW.raw_user_meta_data->>'driver_name', split_part(NEW.email, '@', 1), 'My Fleet');
  INSERT INTO public.companies(name, owner_id, subscription_plan, subscription_status, trial_started_at, trial_ends_at)
    VALUES (display_name || '''s Fleet', NEW.id, 'owner_operator', 'trial', now(), now() + interval '7 days')
    RETURNING id INTO new_company_id;
  INSERT INTO public.company_members(company_id, user_id) VALUES (new_company_id, NEW.id) RETURNING id INTO new_member_id;
  INSERT INTO public.company_member_roles(member_id, role) VALUES (new_member_id, 'company_owner');
  RETURN NEW;
END;
$$;
