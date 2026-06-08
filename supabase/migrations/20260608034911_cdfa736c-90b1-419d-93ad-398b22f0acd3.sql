CREATE TABLE public.settlements (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  load_id uuid REFERENCES public.loads(id) ON DELETE SET NULL,
  settlement_date date NOT NULL DEFAULT CURRENT_DATE,
  gross_pay_usd numeric NOT NULL DEFAULT 0,
  miles numeric,
  rate_per_mile numeric,
  deductions_usd numeric NOT NULL DEFAULT 0,
  deduction_notes text,
  payer text,
  reference_number text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.settlements TO authenticated;
GRANT ALL ON public.settlements TO service_role;

ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own settlements select" ON public.settlements FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own settlements insert" ON public.settlements FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own settlements update" ON public.settlements FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own settlements delete" ON public.settlements FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER settlements_touch_updated_at BEFORE UPDATE ON public.settlements FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX settlements_user_date_idx ON public.settlements(user_id, settlement_date DESC);

-- Also wire into delete_current_user
CREATE OR REPLACE FUNCTION public.delete_current_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  DELETE FROM public.favorite_locations    WHERE user_id = uid;
  DELETE FROM public.saved_routes          WHERE user_id = uid;
  DELETE FROM public.trip_logs             WHERE user_id = uid;
  DELETE FROM public.inspections           WHERE user_id = uid;
  DELETE FROM public.loads                 WHERE user_id = uid;
  DELETE FROM public.ifta_entries          WHERE user_id = uid;
  DELETE FROM public.documents             WHERE user_id = uid;
  DELETE FROM public.maintenance_records   WHERE user_id = uid;
  DELETE FROM public.expenses              WHERE user_id = uid;
  DELETE FROM public.fuel_purchases        WHERE user_id = uid;
  DELETE FROM public.duty_status_logs      WHERE user_id = uid;
  DELETE FROM public.settlements           WHERE user_id = uid;
  DELETE FROM public.user_roles            WHERE user_id = uid;
  DELETE FROM public.profiles              WHERE id      = uid;
  UPDATE public.hazard_reports SET reporter_id = NULL WHERE reporter_id = uid;
  DELETE FROM auth.users WHERE id = uid;
END;
$$;