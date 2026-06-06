
-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  driver_name TEXT,
  truck_type TEXT,
  trailer_type TEXT,
  load_status TEXT DEFAULT 'empty',
  notify_email BOOLEAN DEFAULT true,
  notify_push BOOLEAN DEFAULT true,
  notify_sms BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Hazard reports
CREATE TABLE public.hazard_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID REFERENCES auth.users ON DELETE SET NULL,
  hazard_type TEXT NOT NULL,
  location TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  description TEXT,
  severity TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hazard_reports TO authenticated;
GRANT SELECT ON public.hazard_reports TO anon;
GRANT ALL ON public.hazard_reports TO service_role;
ALTER TABLE public.hazard_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hazards readable by all" ON public.hazard_reports FOR SELECT USING (true);
CREATE POLICY "auth can insert hazards" ON public.hazard_reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "owners update hazards" ON public.hazard_reports FOR UPDATE TO authenticated USING (auth.uid() = reporter_id);
CREATE POLICY "owners delete hazards" ON public.hazard_reports FOR DELETE TO authenticated USING (auth.uid() = reporter_id);

-- Alerts
CREATE TABLE public.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  location TEXT NOT NULL,
  message TEXT NOT NULL,
  recommended_action TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.alerts TO anon, authenticated;
GRANT ALL ON public.alerts TO service_role;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "alerts readable" ON public.alerts FOR SELECT USING (true);

-- Saved routes
CREATE TABLE public.saved_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  truck_type TEXT,
  trailer_type TEXT,
  safety_score INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_routes TO authenticated;
GRANT ALL ON public.saved_routes TO service_role;
ALTER TABLE public.saved_routes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own routes" ON public.saved_routes FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, driver_name) VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'driver_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Seed a few alerts
INSERT INTO public.alerts (alert_type, severity, location, message, recommended_action) VALUES
('high_wind', 'high', 'I-80 Wyoming, MP 200-250', 'Sustained 55+ mph crosswinds reported', 'High-profile vehicles seek alternate route or shelter'),
('road_closure', 'critical', 'I-70 Vail Pass, CO', 'Closed due to multi-vehicle accident', 'Use US-50 as alternate, expect 3hr delay'),
('severe_weather', 'high', 'I-90 South Dakota', 'Whiteout conditions, blizzard warning', 'Park at nearest TA/Loves and wait it out');
