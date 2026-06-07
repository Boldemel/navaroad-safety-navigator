DROP POLICY IF EXISTS "authenticated read driver names" ON public.profiles;
CREATE POLICY "users read own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);