
-- 1. Enums
CREATE TYPE public.subscription_plan AS ENUM ('free_driver', 'owner_operator', 'fleet');
CREATE TYPE public.subscription_status AS ENUM ('active', 'trialing', 'past_due', 'canceled', 'expired');

-- 2. Extend companies
ALTER TABLE public.companies
  ADD COLUMN subscription_plan public.subscription_plan NOT NULL DEFAULT 'free_driver',
  ADD COLUMN subscription_status public.subscription_status NOT NULL DEFAULT 'active',
  ADD COLUMN plan_start_date timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN plan_end_date timestamptz;

-- 3. Feature access matrix
CREATE TABLE public.plan_feature_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan public.subscription_plan NOT NULL,
  feature_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  usage_limit integer,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan, feature_key)
);

GRANT SELECT ON public.plan_feature_access TO authenticated;
GRANT ALL ON public.plan_feature_access TO service_role;

ALTER TABLE public.plan_feature_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read plan features"
  ON public.plan_feature_access FOR SELECT
  TO authenticated USING (true);

CREATE TRIGGER trg_plan_feature_access_updated_at
  BEFORE UPDATE ON public.plan_feature_access
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4. Seed feature matrix
-- Feature keys map to existing/planned modules. enabled=false means hidden/disabled later.
INSERT INTO public.plan_feature_access (plan, feature_key, enabled, usage_limit, notes) VALUES
  -- Free Driver: solo driver, basic compliance tools
  ('free_driver', 'navigation',            true,  NULL, 'Truck-safe navigation'),
  ('free_driver', 'hazard_reports',        true,  NULL, 'View & report road hazards'),
  ('free_driver', 'logbook_manual_hos',    true,  NULL, 'Manual HOS / duty status logs'),
  ('free_driver', 'inspections_dvir',      true,  NULL, 'Driver vehicle inspection reports'),
  ('free_driver', 'fuel_purchases',        true,  5,    'Up to 5 fuel entries / month'),
  ('free_driver', 'ifta_basic',            true,  NULL, 'Basic IFTA tracking from fuel/trips'),
  ('free_driver', 'expenses',              true,  10,   'Up to 10 expenses / month'),
  ('free_driver', 'documents',             true,  10,   'Up to 10 stored documents'),
  ('free_driver', 'trip_logs',             true,  NULL, 'Personal trip logging'),
  ('free_driver', 'loads',                 false, NULL, 'Load management — paid plans'),
  ('free_driver', 'settlements',           false, NULL, 'Settlements — paid plans'),
  ('free_driver', 'maintenance_records',   false, NULL, 'Maintenance ledger — paid plans'),
  ('free_driver', 'maintenance_tasks',     false, NULL, 'Defect → task workflow — paid plans'),
  ('free_driver', 'team_management',       false, NULL, 'Multi-user / team — paid plans'),
  ('free_driver', 'eld_integration',       false, NULL, 'ELD telematics — Fleet plan'),
  ('free_driver', 'live_fleet_map',        false, NULL, 'Live fleet map — Fleet plan'),
  ('free_driver', 'ai_assistant',          true,  20,   '20 AI messages / month'),
  ('free_driver', 'reports_export',        false, NULL, 'CSV/PDF export — paid plans'),

  -- Owner Operator: single-truck business, full self-management
  ('owner_operator', 'navigation',          true,  NULL, NULL),
  ('owner_operator', 'hazard_reports',      true,  NULL, NULL),
  ('owner_operator', 'logbook_manual_hos',  true,  NULL, NULL),
  ('owner_operator', 'inspections_dvir',    true,  NULL, NULL),
  ('owner_operator', 'fuel_purchases',      true,  NULL, 'Unlimited'),
  ('owner_operator', 'ifta_basic',          true,  NULL, NULL),
  ('owner_operator', 'expenses',            true,  NULL, 'Unlimited'),
  ('owner_operator', 'documents',           true,  NULL, 'Unlimited'),
  ('owner_operator', 'trip_logs',           true,  NULL, NULL),
  ('owner_operator', 'loads',               true,  NULL, 'Load management included'),
  ('owner_operator', 'settlements',         true,  NULL, 'Self-settlement reporting'),
  ('owner_operator', 'maintenance_records', true,  NULL, NULL),
  ('owner_operator', 'maintenance_tasks',   true,  NULL, NULL),
  ('owner_operator', 'team_management',     false, 1,    'Single seat'),
  ('owner_operator', 'eld_integration',     false, NULL, 'Fleet plan'),
  ('owner_operator', 'live_fleet_map',      false, NULL, 'Fleet plan'),
  ('owner_operator', 'ai_assistant',        true,  200,  '200 AI messages / month'),
  ('owner_operator', 'reports_export',      true,  NULL, NULL),

  -- Fleet: multi-truck operations, full feature set
  ('fleet', 'navigation',           true, NULL, NULL),
  ('fleet', 'hazard_reports',       true, NULL, NULL),
  ('fleet', 'logbook_manual_hos',   true, NULL, NULL),
  ('fleet', 'inspections_dvir',     true, NULL, NULL),
  ('fleet', 'fuel_purchases',       true, NULL, NULL),
  ('fleet', 'ifta_basic',           true, NULL, NULL),
  ('fleet', 'expenses',             true, NULL, NULL),
  ('fleet', 'documents',            true, NULL, NULL),
  ('fleet', 'trip_logs',            true, NULL, NULL),
  ('fleet', 'loads',                true, NULL, NULL),
  ('fleet', 'settlements',          true, NULL, NULL),
  ('fleet', 'maintenance_records',  true, NULL, NULL),
  ('fleet', 'maintenance_tasks',    true, NULL, NULL),
  ('fleet', 'team_management',      true, NULL, 'Unlimited seats (per add-on pricing later)'),
  ('fleet', 'eld_integration',      true, NULL, 'ELD telematics access'),
  ('fleet', 'live_fleet_map',       true, NULL, 'Live vehicle map'),
  ('fleet', 'ai_assistant',         true, NULL, 'Unlimited AI'),
  ('fleet', 'reports_export',       true, NULL, NULL);
