-- A) Platform roles: only super admins (or trusted server sessions) may grant/revoke super_admin.
DROP POLICY IF EXISTS "admins manage roles" ON public.user_roles;
CREATE POLICY "admins manage non-super roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND role <> 'super_admin')
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND role <> 'super_admin');
CREATE POLICY "super admins manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.protect_super_admin_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.app_role;
BEGIN
  r := CASE WHEN TG_OP = 'DELETE' THEN OLD.role ELSE NEW.role END;
  IF TG_OP = 'UPDATE' AND OLD.role = 'super_admin' THEN r := 'super_admin'; END IF;
  IF r = 'super_admin'
     AND auth.uid() IS NOT NULL
     AND COALESCE(auth.role(), '') <> 'service_role'
     AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform super admins can change super admin access' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
DROP TRIGGER IF EXISTS trg_protect_super_admin_role ON public.user_roles;
CREATE TRIGGER trg_protect_super_admin_role BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.protect_super_admin_role();

-- Members are only added through verified server functions; no direct client inserts of arbitrary users.
DROP POLICY IF EXISTS "fleet owners add members" ON public.company_members;

-- Duplicate fuel sync trigger (function is idempotent; keep one).
DROP TRIGGER IF EXISTS fuel_purchases_sync_downstream ON public.fuel_purchases;

-- C) Plan limits ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.company_limit_exempt(_company uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(auth.uid())
      OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = _company AND public.is_super_admin(c.owner_id))
$$;

CREATE OR REPLACE FUNCTION public.company_plan_limits(_company uuid)
RETURNS TABLE(truck_limit integer, user_limit integer) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT sp.truck_limit, sp.user_limit
  FROM public.companies c JOIN public.subscription_plans sp ON sp.plan = c.subscription_plan
  WHERE c.id = _company
$$;

CREATE OR REPLACE FUNCTION public.company_truck_units(_company uuid)
RETURNS TABLE(unit text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT upper(btrim(u)) FROM (
    SELECT vehicle_unit u FROM public.loads WHERE company_id = _company
    UNION ALL SELECT vehicle_unit FROM public.fuel_purchases WHERE company_id = _company
    UNION ALL SELECT vehicle_unit FROM public.inspections WHERE company_id = _company
    UNION ALL SELECT vehicle_unit FROM public.maintenance_records WHERE company_id = _company
    UNION ALL SELECT vehicle_unit FROM public.maintenance_tasks WHERE company_id = _company
    UNION ALL SELECT vehicle_unit FROM public.trip_logs WHERE company_id = _company
    UNION ALL SELECT vehicle_unit FROM public.duty_status_logs WHERE company_id = _company
    UNION ALL SELECT vehicle_unit FROM public.truck_availability_posts WHERE company_id = _company
    UNION ALL SELECT vehicle_unit FROM public.expenses WHERE company_id = _company
    UNION ALL SELECT vehicle_unit FROM public.settlements WHERE company_id = _company
    UNION ALL SELECT vehicle_unit FROM public.ifta_entries WHERE company_id = _company
  ) s WHERE u IS NOT NULL AND btrim(u) <> ''
$$;

CREATE OR REPLACE FUNCTION public.company_usage(_company uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'trucks_used', (SELECT count(*) FROM public.company_truck_units(_company)),
    'users_used', (SELECT count(*) FROM public.company_members WHERE company_id = _company),
    'truck_limit', (SELECT truck_limit FROM public.company_plan_limits(_company)),
    'user_limit', (SELECT user_limit FROM public.company_plan_limits(_company)),
    'exempt', public.company_limit_exempt(_company)
  )
  WHERE public.is_company_member(auth.uid(), _company) OR public.is_super_admin(auth.uid()) OR auth.uid() IS NULL
$$;

CREATE OR REPLACE FUNCTION public.enforce_truck_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE lim integer; used integer; u text;
BEGIN
  IF NEW.vehicle_unit IS NULL OR btrim(NEW.vehicle_unit) = '' OR NEW.company_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND upper(btrim(COALESCE(OLD.vehicle_unit,''))) = upper(btrim(NEW.vehicle_unit)) THEN RETURN NEW; END IF;
  SELECT truck_limit INTO lim FROM public.company_plan_limits(NEW.company_id);
  IF lim IS NULL OR public.company_limit_exempt(NEW.company_id) THEN RETURN NEW; END IF;
  u := upper(btrim(NEW.vehicle_unit));
  IF EXISTS (SELECT 1 FROM public.company_truck_units(NEW.company_id) t WHERE t.unit = u) THEN RETURN NEW; END IF;
  SELECT count(*) INTO used FROM public.company_truck_units(NEW.company_id);
  IF used >= lim THEN
    RAISE EXCEPTION 'PLAN_LIMIT_TRUCKS: Your plan allows up to % truck(s). Upgrade your plan to add truck "%".', lim, NEW.vehicle_unit
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['loads','fuel_purchases','inspections','maintenance_records','maintenance_tasks','trip_logs','duty_status_logs','truck_availability_posts','expenses','settlements','ifta_entries'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_enforce_truck_limit ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_enforce_truck_limit BEFORE INSERT OR UPDATE OF vehicle_unit ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_truck_limit()', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_user_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE lim integer; used integer;
BEGIN
  SELECT user_limit INTO lim FROM public.company_plan_limits(NEW.company_id);
  IF lim IS NULL OR public.company_limit_exempt(NEW.company_id) THEN RETURN NEW; END IF;
  SELECT count(*) INTO used FROM public.company_members WHERE company_id = NEW.company_id;
  IF used >= lim THEN
    RAISE EXCEPTION 'PLAN_LIMIT_USERS: Your plan allows up to % user(s). Upgrade your plan to add more team members.', lim
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_enforce_user_limit ON public.company_members;
CREATE TRIGGER trg_enforce_user_limit BEFORE INSERT ON public.company_members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_user_limit();

REVOKE EXECUTE ON FUNCTION public.company_truck_units(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.company_usage(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.company_usage(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.company_truck_units(uuid) TO service_role;