
-- IFTA mileage entries
CREATE TABLE public.ifta_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  trip_log_id uuid,
  entry_date date NOT NULL DEFAULT current_date,
  state_code text NOT NULL,
  miles numeric NOT NULL DEFAULT 0,
  fuel_gallons numeric NOT NULL DEFAULT 0,
  fuel_cost_usd numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ifta_entries TO authenticated;
GRANT ALL ON public.ifta_entries TO service_role;
ALTER TABLE public.ifta_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ifta select" ON public.ifta_entries FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own ifta insert" ON public.ifta_entries FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own ifta update" ON public.ifta_entries FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own ifta delete" ON public.ifta_entries FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX idx_ifta_user_date ON public.ifta_entries(user_id, entry_date);

-- Document wallet
CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  doc_type text NOT NULL,
  title text NOT NULL,
  issuer text,
  doc_number text,
  issued_on date,
  expires_on date,
  notes text,
  file_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own docs select" ON public.documents FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own docs insert" ON public.documents FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own docs update" ON public.documents FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own docs delete" ON public.documents FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER documents_touch BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.touch_loads_updated_at();

-- Maintenance log
CREATE TABLE public.maintenance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  vehicle_unit text,
  service_type text NOT NULL,
  service_date date NOT NULL DEFAULT current_date,
  odometer integer,
  cost_usd numeric,
  vendor text,
  notes text,
  next_due_date date,
  next_due_odometer integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.maintenance_records TO authenticated;
GRANT ALL ON public.maintenance_records TO service_role;
ALTER TABLE public.maintenance_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own maint select" ON public.maintenance_records FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own maint insert" ON public.maintenance_records FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own maint update" ON public.maintenance_records FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own maint delete" ON public.maintenance_records FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER maintenance_touch BEFORE UPDATE ON public.maintenance_records FOR EACH ROW EXECUTE FUNCTION public.touch_loads_updated_at();

-- Update user deletion cleanup
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
  DELETE FROM public.favorite_locations    WHERE user_id = uid;
  DELETE FROM public.saved_routes          WHERE user_id = uid;
  DELETE FROM public.trip_logs             WHERE user_id = uid;
  DELETE FROM public.inspections           WHERE user_id = uid;
  DELETE FROM public.loads                 WHERE user_id = uid;
  DELETE FROM public.ifta_entries          WHERE user_id = uid;
  DELETE FROM public.documents             WHERE user_id = uid;
  DELETE FROM public.maintenance_records   WHERE user_id = uid;
  DELETE FROM public.user_roles            WHERE user_id = uid;
  DELETE FROM public.profiles              WHERE id      = uid;
  UPDATE public.hazard_reports SET reporter_id = NULL WHERE reporter_id = uid;
  DELETE FROM auth.users WHERE id = uid;
END;
$function$;
