
-- 1. Super admin helper
CREATE OR REPLACE FUNCTION public.is_super_admin(_user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user AND role = 'super_admin')
$$;

-- 2. Super admin read policies on existing tables
CREATE POLICY "Super admins can view all companies"
  ON public.companies FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update any company"
  ON public.companies FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can view all company members"
  ON public.company_members FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can view all member roles"
  ON public.company_member_roles FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can view all profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- 3. plan_feature_access already readable by authenticated; allow super admins to modify
CREATE POLICY "Super admins can modify plan feature access"
  ON public.plan_feature_access FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- 4. Support requests
CREATE TABLE public.support_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  requester_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject text NOT NULL,
  body text NOT NULL,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','waiting_user','resolved','closed')),
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_requests TO authenticated;
GRANT ALL ON public.support_requests TO service_role;
ALTER TABLE public.support_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Requester can view own support requests"
  ON public.support_requests FOR SELECT TO authenticated
  USING (requester_user_id = auth.uid());

CREATE POLICY "Company members can view their company support requests"
  ON public.support_requests FOR SELECT TO authenticated
  USING (company_id IS NOT NULL AND public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Authenticated can create support requests"
  ON public.support_requests FOR INSERT TO authenticated
  WITH CHECK (requester_user_id = auth.uid());

CREATE POLICY "Super admins can view all support requests"
  ON public.support_requests FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update support requests"
  ON public.support_requests FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER touch_support_requests_updated_at
  BEFORE UPDATE ON public.support_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 5. Impersonation audit log (read-only view-as)
CREATE TABLE public.super_admin_impersonation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  reason text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
GRANT SELECT, INSERT, UPDATE ON public.super_admin_impersonation_log TO authenticated;
GRANT ALL ON public.super_admin_impersonation_log TO service_role;
ALTER TABLE public.super_admin_impersonation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view impersonation log"
  ON public.super_admin_impersonation_log FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can insert impersonation log"
  ON public.super_admin_impersonation_log FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()) AND admin_user_id = auth.uid());

CREATE POLICY "Super admins can end their impersonation sessions"
  ON public.super_admin_impersonation_log FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()) AND admin_user_id = auth.uid())
  WITH CHECK (public.is_super_admin(auth.uid()) AND admin_user_id = auth.uid());
