-- Allow a user to delete their own profile
CREATE POLICY "own profile delete" ON public.profiles
  FOR DELETE TO authenticated
  USING (auth.uid() = id);

-- Security-definer helper that lets the signed-in user delete their own
-- auth.users row (cascades through profiles, user_roles, favorites, etc.
-- via ON DELETE CASCADE / RLS-owned rows). No one else can target another
-- user because we hard-code auth.uid().
CREATE OR REPLACE FUNCTION public.delete_current_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Best-effort cleanup of user-owned rows that don't cascade from auth.users.
  DELETE FROM public.favorite_locations WHERE user_id = uid;
  DELETE FROM public.saved_routes       WHERE user_id = uid;
  DELETE FROM public.user_roles         WHERE user_id = uid;
  DELETE FROM public.profiles           WHERE id      = uid;
  -- Detach hazard reports rather than delete them (community data).
  UPDATE public.hazard_reports SET reporter_id = NULL WHERE reporter_id = uid;

  DELETE FROM auth.users WHERE id = uid;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_current_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_current_user() TO authenticated;