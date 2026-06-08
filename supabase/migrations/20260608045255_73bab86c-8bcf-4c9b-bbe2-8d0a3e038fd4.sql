
-- =========================================================
-- ENUMS
-- =========================================================
CREATE TYPE public.company_role AS ENUM (
  'fleet_owner',
  'dispatcher',
  'safety_manager',
  'maintenance_manager',
  'driver'
);

CREATE TYPE public.app_permission AS ENUM (
  'company.manage',
  'members.manage',
  'loads.manage',
  'loads.view',
  'routes.manage',
  'routes.view',
  'inspections.manage',
  'inspections.view',
  'maintenance.manage',
  'maintenance.view',
  'documents.manage',
  'documents.view',
  'fuel.manage',
  'fuel.view',
  'expenses.manage',
  'expenses.view',
  'ifta.manage',
  'ifta.view',
  'hos.manage',
  'hos.view',
  'drive'
);

-- =========================================================
-- TABLES
-- =========================================================
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.company_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id)
);
CREATE INDEX company_members_user_idx ON public.company_members(user_id);
CREATE INDEX company_members_company_idx ON public.company_members(company_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_members TO authenticated;
GRANT ALL ON public.company_members TO service_role;
ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.company_member_roles (
  member_id uuid NOT NULL REFERENCES public.company_members(id) ON DELETE CASCADE,
  role public.company_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (member_id, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_member_roles TO authenticated;
GRANT ALL ON public.company_member_roles TO service_role;
ALTER TABLE public.company_member_roles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.company_member_permission_overrides (
  member_id uuid NOT NULL REFERENCES public.company_members(id) ON DELETE CASCADE,
  permission public.app_permission NOT NULL,
  granted boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (member_id, permission)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_member_permission_overrides TO authenticated;
GRANT ALL ON public.company_member_permission_overrides TO service_role;
ALTER TABLE public.company_member_permission_overrides ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.role_default_permissions (
  role public.company_role NOT NULL,
  permission public.app_permission NOT NULL,
  PRIMARY KEY (role, permission)
);
GRANT SELECT ON public.role_default_permissions TO authenticated, anon;
GRANT ALL ON public.role_default_permissions TO service_role;
ALTER TABLE public.role_default_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "role defaults readable" ON public.role_default_permissions FOR SELECT USING (true);

-- =========================================================
-- SEED ROLE DEFAULT PERMISSIONS
-- =========================================================
INSERT INTO public.role_default_permissions(role, permission) VALUES
  -- Fleet Owner: everything
  ('fleet_owner','company.manage'),('fleet_owner','members.manage'),
  ('fleet_owner','loads.manage'),('fleet_owner','loads.view'),
  ('fleet_owner','routes.manage'),('fleet_owner','routes.view'),
  ('fleet_owner','inspections.manage'),('fleet_owner','inspections.view'),
  ('fleet_owner','maintenance.manage'),('fleet_owner','maintenance.view'),
  ('fleet_owner','documents.manage'),('fleet_owner','documents.view'),
  ('fleet_owner','fuel.manage'),('fleet_owner','fuel.view'),
  ('fleet_owner','expenses.manage'),('fleet_owner','expenses.view'),
  ('fleet_owner','ifta.manage'),('fleet_owner','ifta.view'),
  ('fleet_owner','hos.manage'),('fleet_owner','hos.view'),
  ('fleet_owner','drive'),
  -- Dispatcher
  ('dispatcher','loads.manage'),('dispatcher','loads.view'),
  ('dispatcher','routes.manage'),('dispatcher','routes.view'),
  ('dispatcher','hos.view'),
  -- Safety Manager
  ('safety_manager','inspections.manage'),('safety_manager','inspections.view'),
  ('safety_manager','documents.manage'),('safety_manager','documents.view'),
  ('safety_manager','hos.view'),('safety_manager','routes.view'),
  -- Maintenance Manager
  ('maintenance_manager','maintenance.manage'),('maintenance_manager','maintenance.view'),
  ('maintenance_manager','inspections.view'),
  -- Driver
  ('driver','drive'),
  ('driver','loads.view'),('driver','routes.view'),
  ('driver','inspections.manage'),('driver','inspections.view'),
  ('driver','fuel.manage'),('driver','fuel.view'),
  ('driver','expenses.manage'),('driver','expenses.view'),
  ('driver','documents.view'),
  ('driver','hos.manage'),('driver','hos.view'),
  ('driver','ifta.manage'),('driver','ifta.view');

-- =========================================================
-- SECURITY DEFINER HELPERS (avoid RLS recursion)
-- =========================================================
CREATE OR REPLACE FUNCTION public.is_company_member(_user uuid, _company uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.company_members WHERE user_id = _user AND company_id = _company)
$$;

CREATE OR REPLACE FUNCTION public.has_company_role(_user uuid, _company uuid, _role public.company_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_members cm
    JOIN public.company_member_roles cmr ON cmr.member_id = cm.id
    WHERE cm.user_id = _user AND cm.company_id = _company AND cmr.role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.has_company_permission(_user uuid, _company uuid, _permission public.app_permission)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (
    SELECT id FROM public.company_members WHERE user_id = _user AND company_id = _company
  ),
  override AS (
    SELECT granted FROM public.company_member_permission_overrides o
    JOIN me ON me.id = o.member_id
    WHERE o.permission = _permission
  )
  SELECT COALESCE(
    (SELECT granted FROM override),
    EXISTS (
      SELECT 1
      FROM public.company_member_roles cmr
      JOIN me ON me.id = cmr.member_id
      JOIN public.role_default_permissions rdp ON rdp.role = cmr.role
      WHERE rdp.permission = _permission
    ),
    false
  )
$$;

CREATE OR REPLACE FUNCTION public.is_company_owner(_user uuid, _company uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.companies WHERE id = _company AND owner_id = _user)
$$;

-- =========================================================
-- RLS POLICIES
-- =========================================================
-- companies
CREATE POLICY "members read company" ON public.companies FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), id));
CREATE POLICY "owners create company" ON public.companies FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "fleet owners update company" ON public.companies FOR UPDATE TO authenticated
  USING (public.is_company_owner(auth.uid(), id) OR public.has_company_role(auth.uid(), id, 'fleet_owner'))
  WITH CHECK (public.is_company_owner(auth.uid(), id) OR public.has_company_role(auth.uid(), id, 'fleet_owner'));
CREATE POLICY "owners delete company" ON public.companies FOR DELETE TO authenticated
  USING (public.is_company_owner(auth.uid(), id));

-- company_members
CREATE POLICY "members read member list" ON public.company_members FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "fleet owners add members" ON public.company_members FOR INSERT TO authenticated
  WITH CHECK (public.has_company_role(auth.uid(), company_id, 'fleet_owner') OR public.is_company_owner(auth.uid(), company_id));
CREATE POLICY "fleet owners remove members" ON public.company_members FOR DELETE TO authenticated
  USING (public.has_company_role(auth.uid(), company_id, 'fleet_owner') OR public.is_company_owner(auth.uid(), company_id));

-- company_member_roles
CREATE POLICY "members read roles" ON public.company_member_roles FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.id = member_id AND public.is_company_member(auth.uid(), cm.company_id)));
CREATE POLICY "fleet owners manage roles ins" ON public.company_member_roles FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.id = member_id AND (public.has_company_role(auth.uid(), cm.company_id, 'fleet_owner') OR public.is_company_owner(auth.uid(), cm.company_id))));
CREATE POLICY "fleet owners manage roles del" ON public.company_member_roles FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.id = member_id AND (public.has_company_role(auth.uid(), cm.company_id, 'fleet_owner') OR public.is_company_owner(auth.uid(), cm.company_id))));

-- company_member_permission_overrides
CREATE POLICY "self or owner read overrides" ON public.company_member_permission_overrides FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.id = member_id AND (cm.user_id = auth.uid() OR public.has_company_role(auth.uid(), cm.company_id, 'fleet_owner') OR public.is_company_owner(auth.uid(), cm.company_id))
  ));
CREATE POLICY "fleet owners write overrides ins" ON public.company_member_permission_overrides FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.id = member_id AND (public.has_company_role(auth.uid(), cm.company_id, 'fleet_owner') OR public.is_company_owner(auth.uid(), cm.company_id))));
CREATE POLICY "fleet owners write overrides upd" ON public.company_member_permission_overrides FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.id = member_id AND (public.has_company_role(auth.uid(), cm.company_id, 'fleet_owner') OR public.is_company_owner(auth.uid(), cm.company_id))));
CREATE POLICY "fleet owners write overrides del" ON public.company_member_permission_overrides FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.id = member_id AND (public.has_company_role(auth.uid(), cm.company_id, 'fleet_owner') OR public.is_company_owner(auth.uid(), cm.company_id))));

-- =========================================================
-- TRIGGERS
-- =========================================================
CREATE TRIGGER companies_touch_updated BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Auto-provision a personal company + fleet_owner role on signup
CREATE OR REPLACE FUNCTION public.provision_company_for_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_company_id uuid;
  new_member_id uuid;
  display_name text;
BEGIN
  display_name := COALESCE(NEW.raw_user_meta_data->>'driver_name', split_part(NEW.email, '@', 1), 'My Fleet');
  INSERT INTO public.companies(name, owner_id) VALUES (display_name || '''s Fleet', NEW.id) RETURNING id INTO new_company_id;
  INSERT INTO public.company_members(company_id, user_id) VALUES (new_company_id, NEW.id) RETURNING id INTO new_member_id;
  INSERT INTO public.company_member_roles(member_id, role) VALUES (new_member_id, 'fleet_owner');
  RETURN NEW;
END;
$$;

-- Chain after the existing handle_new_user trigger
CREATE TRIGGER on_auth_user_created_provision_company
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.provision_company_for_new_user();

-- =========================================================
-- BACKFILL existing users
-- =========================================================
DO $$
DECLARE
  u record;
  cid uuid;
  mid uuid;
  dname text;
BEGIN
  FOR u IN SELECT au.id, au.email, p.driver_name FROM auth.users au LEFT JOIN public.profiles p ON p.id = au.id LOOP
    IF NOT EXISTS (SELECT 1 FROM public.company_members WHERE user_id = u.id) THEN
      dname := COALESCE(u.driver_name, split_part(u.email, '@', 1), 'My Fleet');
      INSERT INTO public.companies(name, owner_id) VALUES (dname || '''s Fleet', u.id) RETURNING id INTO cid;
      INSERT INTO public.company_members(company_id, user_id) VALUES (cid, u.id) RETURNING id INTO mid;
      INSERT INTO public.company_member_roles(member_id, role) VALUES (mid, 'fleet_owner');
    END IF;
  END LOOP;
END $$;

-- Also extend delete_current_user to clean up companies the user owns alone
CREATE OR REPLACE FUNCTION public.delete_current_user()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  DELETE FROM public.favorite_locations    WHERE user_id = uid;
  DELETE FROM public.saved_routes          WHERE user_id = uid;
  DELETE FROM public.trip_logs             WHERE user_id = uid;
  DELETE FROM public.inspections           WHERE user_id = uid;
  DELETE FROM public.loads                 WHERE user_id = uid;
  DELETE FROM public.ifta_entries          WHERE user_id = uid;
  DELETE FROM public.documents             WHERE user_id = uid;
  DELETE FROM public.maintenance_records   WHERE user_id = uid;
  DELETE FROM public.expenses              WHERE user_id = uid;
  DELETE FROM public.fuel_purchases        WHERE user_id = uid;
  DELETE FROM public.duty_status_logs      WHERE user_id = uid;
  DELETE FROM public.settlements           WHERE user_id = uid;
  DELETE FROM public.user_roles            WHERE user_id = uid;
  DELETE FROM public.company_members       WHERE user_id = uid;
  DELETE FROM public.companies             WHERE owner_id = uid
    AND NOT EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.company_id = companies.id);
  DELETE FROM public.profiles              WHERE id      = uid;
  UPDATE public.hazard_reports SET reporter_id = NULL WHERE reporter_id = uid;
  DELETE FROM auth.users WHERE id = uid;
END;
$$;
