
-- 1. Dispatch trip-status milestones on loads
ALTER TABLE public.loads
  ADD COLUMN IF NOT EXISTS dispatch_status text
    NOT NULL DEFAULT 'unassigned'
    CHECK (dispatch_status IN (
      'unassigned','assigned','accepted','driving_to_pickup',
      'loaded','in_transit','delivered','completed','cancelled'
    )),
  ADD COLUMN IF NOT EXISTS assigned_at         timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_at         timestamptz,
  ADD COLUMN IF NOT EXISTS pickup_arrived_at   timestamptz,
  ADD COLUMN IF NOT EXISTS loaded_at           timestamptz,
  ADD COLUMN IF NOT EXISTS in_transit_at       timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at        timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at        timestamptz;

CREATE INDEX IF NOT EXISTS idx_loads_company_dispatch_status
  ON public.loads (company_id, dispatch_status);

-- Backfill dispatch_status from existing status/driver_id
UPDATE public.loads SET dispatch_status = 'in_transit'
  WHERE dispatch_status = 'unassigned' AND status = 'in_transit';
UPDATE public.loads SET dispatch_status = 'delivered'
  WHERE dispatch_status = 'unassigned' AND status = 'delivered';
UPDATE public.loads SET dispatch_status = 'cancelled'
  WHERE dispatch_status = 'unassigned' AND status = 'cancelled';
UPDATE public.loads SET dispatch_status = 'assigned'
  WHERE dispatch_status = 'unassigned' AND driver_id IS NOT NULL AND status = 'planned';

-- 2. Register the Dispatch module across every existing plan
INSERT INTO public.plan_feature_access (plan, feature_key, enabled, usage_limit) VALUES
  ('owner_operator','dispatch',false,NULL),
  ('small_fleet','dispatch',true,NULL),
  ('growth_fleet','dispatch',true,NULL),
  ('enterprise','dispatch',true,NULL)
ON CONFLICT (plan, feature_key) DO UPDATE SET enabled = EXCLUDED.enabled;
