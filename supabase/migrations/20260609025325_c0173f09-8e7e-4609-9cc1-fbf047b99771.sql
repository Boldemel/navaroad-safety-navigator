
-- Team onboarding: profile fields, audit log, manager access policies

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS employee_id text,
  ADD COLUMN IF NOT EXISTS assigned_truck text,
  ADD COLUMN IF NOT EXISTS assigned_trailer text,
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid;

-- Allow company managers to read & update profiles of users in the same company
CREATE OR REPLACE FUNCTION public.shares_company_with(_viewer uuid, _target uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_members a
    JOIN public.company_members b ON a.company_id = b.company_id
    WHERE a.user_id = _viewer AND b.user_id = _target
  )
$$;

CREATE OR REPLACE FUNCTION public.can_manage_user(_manager uuid, _target uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_members a
    JOIN public.company_members b ON a.company_id = b.company_id
    WHERE a.user_id = _manager
      AND b.user_id = _target
      AND public.has_company_permission(_manager, a.company_id, 'members.manage')
  )
$$;

DROP POLICY IF EXISTS "company managers read profiles" ON public.profiles;
CREATE POLICY "company managers read profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.shares_company_with(auth.uid(), id));

DROP POLICY IF EXISTS "company managers update profiles" ON public.profiles;
CREATE POLICY "company managers update profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id OR public.can_manage_user(auth.uid(), id))
  WITH CHECK (auth.uid() = id OR public.can_manage_user(auth.uid(), id));

-- Audit log
CREATE TABLE IF NOT EXISTS public.team_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  actor_user_id uuid,
  target_user_id uuid,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.team_audit_logs TO authenticated;
GRANT ALL ON public.team_audit_logs TO service_role;

ALTER TABLE public.team_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "managers read audit" ON public.team_audit_logs
  FOR SELECT TO authenticated
  USING (public.has_company_permission(auth.uid(), company_id, 'members.manage'));

CREATE POLICY "managers insert audit" ON public.team_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.has_company_permission(auth.uid(), company_id, 'members.manage'));

CREATE INDEX IF NOT EXISTS team_audit_company_idx ON public.team_audit_logs(company_id, created_at DESC);
