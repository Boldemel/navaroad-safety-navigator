
CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  category text NOT NULL,
  amount_usd numeric NOT NULL DEFAULT 0,
  vendor text,
  state_code text,
  notes text,
  receipt_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own expenses select" ON public.expenses FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own expenses insert" ON public.expenses FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own expenses update" ON public.expenses FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own expenses delete" ON public.expenses FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.fuel_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  purchase_date date NOT NULL DEFAULT CURRENT_DATE,
  state_code text NOT NULL,
  station_name text,
  gallons numeric NOT NULL DEFAULT 0,
  price_per_gallon numeric NOT NULL DEFAULT 0,
  total_cost_usd numeric NOT NULL DEFAULT 0,
  odometer integer,
  vehicle_unit text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fuel_purchases TO authenticated;
GRANT ALL ON public.fuel_purchases TO service_role;
ALTER TABLE public.fuel_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own fuel select" ON public.fuel_purchases FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own fuel insert" ON public.fuel_purchases FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own fuel update" ON public.fuel_purchases FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own fuel delete" ON public.fuel_purchases FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.duty_status_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  status text NOT NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  location text,
  vehicle_unit text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.duty_status_logs TO authenticated;
GRANT ALL ON public.duty_status_logs TO service_role;
ALTER TABLE public.duty_status_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own duty select" ON public.duty_status_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own duty insert" ON public.duty_status_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own duty update" ON public.duty_status_logs FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own duty delete" ON public.duty_status_logs FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER expenses_touch BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER fuel_touch BEFORE UPDATE ON public.fuel_purchases FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER duty_touch BEFORE UPDATE ON public.duty_status_logs FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.delete_current_user()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
  DELETE FROM public.user_roles            WHERE user_id = uid;
  DELETE FROM public.profiles              WHERE id      = uid;
  UPDATE public.hazard_reports SET reporter_id = NULL WHERE reporter_id = uid;
  DELETE FROM auth.users WHERE id = uid;
END;
$function$;
