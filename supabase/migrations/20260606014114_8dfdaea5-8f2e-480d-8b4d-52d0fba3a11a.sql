ALTER TABLE public.hazard_reports REPLICA IDENTITY FULL;
ALTER TABLE public.alerts REPLICA IDENTITY FULL;

DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.hazard_reports;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;