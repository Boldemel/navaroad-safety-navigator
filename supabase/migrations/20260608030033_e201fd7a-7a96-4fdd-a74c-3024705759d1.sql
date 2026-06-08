-- Inspections (DVIR)
CREATE TABLE public.inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  inspection_type text NOT NULL DEFAULT 'pre',
  vehicle_unit text,
  trailer_unit text,
  odometer integer,
  defects jsonb NOT NULL DEFAULT '[]'::jsonb,
  defects_correction_required boolean NOT NULL DEFAULT false,
  signature text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inspections TO authenticated;
GRANT ALL ON public.inspections TO service_role;

ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own inspections select" ON public.inspections FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own inspections insert" ON public.inspections FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own inspections update" ON public.inspections FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own inspections delete" ON public.inspections FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX inspections_user_created_idx ON public.inspections (user_id, created_at DESC);

-- Loads
CREATE TABLE public.loads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'planned',
  bol_number text,
  commodity text,
  weight_lbs numeric,
  shipper_name text,
  shipper_address text,
  consignee_name text,
  consignee_address text,
  pickup_at timestamptz,
  delivery_at timestamptz,
  rate_usd numeric,
  notes text,
  is_current boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.loads TO authenticated;
GRANT ALL ON public.loads TO service_role;

ALTER TABLE public.loads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own loads select" ON public.loads FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own loads insert" ON public.loads FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own loads update" ON public.loads FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own loads delete" ON public.loads FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX loads_user_created_idx ON public.loads (user_id, created_at DESC);
CREATE UNIQUE INDEX loads_one_current_per_user ON public.loads (user_id) WHERE is_current = true;

CREATE OR REPLACE FUNCTION public.touch_loads_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER loads_set_updated_at
BEFORE UPDATE ON public.loads
FOR EACH ROW EXECUTE FUNCTION public.touch_loads_updated_at();

-- Extend account deletion to wipe new tables
CREATE OR REPLACE FUNCTION public.delete_current_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  DELETE FROM public.favorite_locations WHERE user_id = uid;
  DELETE FROM public.saved_routes       WHERE user_id = uid;
  DELETE FROM public.trip_logs          WHERE user_id = uid;
  DELETE FROM public.inspections        WHERE user_id = uid;
  DELETE FROM public.loads              WHERE user_id = uid;
  DELETE FROM public.user_roles         WHERE user_id = uid;
  DELETE FROM public.profiles           WHERE id      = uid;
  UPDATE public.hazard_reports SET reporter_id = NULL WHERE reporter_id = uid;
  DELETE FROM auth.users WHERE id = uid;
END;
$function$;