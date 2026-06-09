
-- 1. Profile additions
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS driver_id_number text,
  ADD COLUMN IF NOT EXISTS eld_system text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_key
  ON public.profiles (lower(username))
  WHERE username IS NOT NULL;

-- 2. ELD credentials table
CREATE TABLE IF NOT EXISTS public.driver_eld_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  eld_user_id text,
  eld_password text,
  eld_system text,
  visible_to_driver boolean NOT NULL DEFAULT false,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, company_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_eld_credentials TO authenticated;
GRANT ALL ON public.driver_eld_credentials TO service_role;

ALTER TABLE public.driver_eld_credentials ENABLE ROW LEVEL SECURITY;

-- Managers can do everything within their company
CREATE POLICY "Managers manage ELD credentials"
  ON public.driver_eld_credentials
  FOR ALL
  TO authenticated
  USING (public.has_company_permission(auth.uid(), company_id, 'members.manage'))
  WITH CHECK (public.has_company_permission(auth.uid(), company_id, 'members.manage'));

-- Drivers can read their own creds if the manager has shared them
CREATE POLICY "Drivers read own visible ELD credentials"
  ON public.driver_eld_credentials
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() AND visible_to_driver = true);

CREATE TRIGGER trg_driver_eld_credentials_updated_at
  BEFORE UPDATE ON public.driver_eld_credentials
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
