ALTER TABLE public.hazard_reports REPLICA IDENTITY FULL;
ALTER TABLE public.alerts REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.hazard_reports;
ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;