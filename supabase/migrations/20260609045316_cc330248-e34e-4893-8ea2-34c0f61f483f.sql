
CREATE OR REPLACE FUNCTION public.has_company_permission(_user uuid, _company uuid, _permission app_permission)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH sa AS (SELECT public.is_super_admin(_user) AS yes),
  me AS (
    SELECT id FROM public.company_members WHERE user_id = _user AND company_id = _company
  ),
  override AS (
    SELECT granted FROM public.company_member_permission_overrides o
    JOIN me ON me.id = o.member_id
    WHERE o.permission = _permission
  )
  SELECT CASE WHEN (SELECT yes FROM sa) THEN true
  ELSE COALESCE(
    (SELECT granted FROM override),
    EXISTS (
      SELECT 1
      FROM public.company_member_roles cmr
      JOIN me ON me.id = cmr.member_id
      JOIN public.role_default_permissions rdp ON rdp.role = cmr.role
      WHERE rdp.permission = _permission
    ),
    false
  ) END
$$;

CREATE POLICY "Super admins can delete any company"
  ON public.companies FOR DELETE
  TO authenticated
  USING (public.is_super_admin(auth.uid()));
