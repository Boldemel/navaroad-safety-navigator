
DROP VIEW IF EXISTS public.driver_public;

CREATE POLICY "authenticated read driver names" ON public.profiles
  FOR SELECT TO authenticated USING (true);
