
-- ============================================================
-- 1) BACKFILL: ensure every existing user has a Company + membership + company_owner role
-- ============================================================
INSERT INTO public.companies(name, owner_id)
SELECT COALESCE(p.driver_name, split_part(u.email, '@', 1), 'Fleet') || '''s Fleet', u.id
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE NOT EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.user_id = u.id);

INSERT INTO public.company_members(company_id, user_id)
SELECT c.id, c.owner_id
FROM public.companies c
WHERE NOT EXISTS (
  SELECT 1 FROM public.company_members cm WHERE cm.company_id = c.id AND cm.user_id = c.owner_id
);

INSERT INTO public.company_member_roles(member_id, role)
SELECT cm.id, 'company_owner'::company_role
FROM public.company_members cm
JOIN public.companies c ON c.id = cm.company_id AND c.owner_id = cm.user_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.company_member_roles r WHERE r.member_id = cm.id AND r.role = 'company_owner'
);

-- ============================================================
-- 2) ROLE DEFAULT PERMISSIONS for new roles
-- ============================================================
INSERT INTO public.role_default_permissions(role, permission)
SELECT 'company_owner'::company_role, p
FROM unnest(ARRAY[
  'company.manage','members.manage',
  'loads.manage','loads.view',
  'routes.manage','routes.view',
  'inspections.manage','inspections.view',
  'maintenance.manage','maintenance.view',
  'documents.manage','documents.view',
  'fuel.manage','fuel.view',
  'expenses.manage','expenses.view',
  'ifta.manage','ifta.view',
  'hos.manage','hos.view',
  'drive'
]::app_permission[]) AS p
ON CONFLICT DO NOTHING;

INSERT INTO public.role_default_permissions(role, permission)
SELECT 'fleet_manager'::company_role, p
FROM unnest(ARRAY[
  'loads.manage','loads.view',
  'routes.manage','routes.view',
  'inspections.manage','inspections.view',
  'maintenance.manage','maintenance.view',
  'documents.manage','documents.view',
  'fuel.manage','fuel.view',
  'expenses.manage','expenses.view',
  'ifta.manage','ifta.view',
  'hos.manage','hos.view'
]::app_permission[]) AS p
ON CONFLICT DO NOTHING;

-- ============================================================
-- 3) HELPER: lookup user's primary company
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_user_company(_user uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT company_id FROM public.company_members WHERE user_id = _user ORDER BY created_at LIMIT 1
$$;

-- ============================================================
-- 4) ADD company_id to all operational tables (backfill, then NOT NULL + FK + index)
-- ============================================================
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'loads','inspections','maintenance_records','fuel_purchases','ifta_entries',
    'documents','saved_routes','trip_logs','expenses','duty_status_logs',
    'settlements','favorite_locations'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE', t);
    EXECUTE format('UPDATE public.%I SET company_id = public.get_user_company(user_id) WHERE company_id IS NULL', t);
    EXECUTE format('DELETE FROM public.%I WHERE company_id IS NULL', t);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN company_id SET NOT NULL', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_company ON public.%I(company_id)', t, t);
  END LOOP;
END$$;

-- hazard_reports: nullable (community feed stays public; companies may keep private notes)
ALTER TABLE public.hazard_reports ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_hazard_reports_company ON public.hazard_reports(company_id);

-- ============================================================
-- 5) RLS REWRITE: drop old user-only policies, add company-scoped ones
-- Pattern: members see own rows OR users with view perm see all company rows;
--          users mutate own rows OR users with manage perm mutate any company row.
-- ============================================================

-- LOADS
DROP POLICY IF EXISTS "own loads select" ON public.loads;
DROP POLICY IF EXISTS "own loads insert" ON public.loads;
DROP POLICY IF EXISTS "own loads update" ON public.loads;
DROP POLICY IF EXISTS "own loads delete" ON public.loads;
CREATE POLICY "company read loads" ON public.loads FOR SELECT TO authenticated USING (
  is_company_member(auth.uid(), company_id) AND (auth.uid() = user_id OR has_company_permission(auth.uid(), company_id, 'loads.view'))
);
CREATE POLICY "company insert loads" ON public.loads FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id AND is_company_member(auth.uid(), company_id)
);
CREATE POLICY "company update loads" ON public.loads FOR UPDATE TO authenticated USING (
  is_company_member(auth.uid(), company_id) AND (auth.uid() = user_id OR has_company_permission(auth.uid(), company_id, 'loads.manage'))
) WITH CHECK (
  is_company_member(auth.uid(), company_id) AND (auth.uid() = user_id OR has_company_permission(auth.uid(), company_id, 'loads.manage'))
);
CREATE POLICY "company delete loads" ON public.loads FOR DELETE TO authenticated USING (
  is_company_member(auth.uid(), company_id) AND (auth.uid() = user_id OR has_company_permission(auth.uid(), company_id, 'loads.manage'))
);

-- INSPECTIONS
DROP POLICY IF EXISTS "own inspections select" ON public.inspections;
DROP POLICY IF EXISTS "own inspections insert" ON public.inspections;
DROP POLICY IF EXISTS "own inspections update" ON public.inspections;
DROP POLICY IF EXISTS "own inspections delete" ON public.inspections;
CREATE POLICY "company read inspections" ON public.inspections FOR SELECT TO authenticated USING (
  is_company_member(auth.uid(), company_id) AND (auth.uid() = user_id OR has_company_permission(auth.uid(), company_id, 'inspections.view'))
);
CREATE POLICY "company insert inspections" ON public.inspections FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id AND is_company_member(auth.uid(), company_id)
);
CREATE POLICY "company update inspections" ON public.inspections FOR UPDATE TO authenticated USING (
  is_company_member(auth.uid(), company_id) AND (auth.uid() = user_id OR has_company_permission(auth.uid(), company_id, 'inspections.manage'))
) WITH CHECK (
  is_company_member(auth.uid(), company_id) AND (auth.uid() = user_id OR has_company_permission(auth.uid(), company_id, 'inspections.manage'))
);
CREATE POLICY "company delete inspections" ON public.inspections FOR DELETE TO authenticated USING (
  is_company_member(auth.uid(), company_id) AND (auth.uid() = user_id OR has_company_permission(auth.uid(), company_id, 'inspections.manage'))
);

-- MAINTENANCE
DROP POLICY IF EXISTS "own maint select" ON public.maintenance_records;
DROP POLICY IF EXISTS "own maint insert" ON public.maintenance_records;
DROP POLICY IF EXISTS "own maint update" ON public.maintenance_records;
DROP POLICY IF EXISTS "own maint delete" ON public.maintenance_records;
CREATE POLICY "company read maint" ON public.maintenance_records FOR SELECT TO authenticated USING (
  is_company_member(auth.uid(), company_id) AND (auth.uid() = user_id OR has_company_permission(auth.uid(), company_id, 'maintenance.view'))
);
CREATE POLICY "company insert maint" ON public.maintenance_records FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id AND is_company_member(auth.uid(), company_id)
);
CREATE POLICY "company update maint" ON public.maintenance_records FOR UPDATE TO authenticated USING (
  is_company_member(auth.uid(), company_id) AND (auth.uid() = user_id OR has_company_permission(auth.uid(), company_id, 'maintenance.manage'))
) WITH CHECK (
  is_company_member(auth.uid(), company_id) AND (auth.uid() = user_id OR has_company_permission(auth.uid(), company_id, 'maintenance.manage'))
);
CREATE POLICY "company delete maint" ON public.maintenance_records FOR DELETE TO authenticated USING (
  is_company_member(auth.uid(), company_id) AND (auth.uid() = user_id OR has_company_permission(auth.uid(), company_id, 'maintenance.manage'))
);

-- FUEL
DROP POLICY IF EXISTS "own fuel select" ON public.fuel_purchases;
DROP POLICY IF EXISTS "own fuel insert" ON public.fuel_purchases;
DROP POLICY IF EXISTS "own fuel update" ON public.fuel_purchases;
DROP POLICY IF EXISTS "own fuel delete" ON public.fuel_purchases;
CREATE POLICY "company read fuel" ON public.fuel_purchases FOR SELECT TO authenticated USING (
  is_company_member(auth.uid(), company_id) AND (auth.uid() = user_id OR has_company_permission(auth.uid(), company_id, 'fuel.view'))
);
CREATE POLICY "company insert fuel" ON public.fuel_purchases FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id AND is_company_member(auth.uid(), company_id)
);
CREATE POLICY "company update fuel" ON public.fuel_purchases FOR UPDATE TO authenticated USING (
  is_company_member(auth.uid(), company_id) AND (auth.uid() = user_id OR has_company_permission(auth.uid(), company_id, 'fuel.manage'))
) WITH CHECK (
  is_company_member(auth.uid(), company_id) AND (auth.uid() = user_id OR has_company_permission(auth.uid(), company_id, 'fuel.manage'))
);
CREATE POLICY "company delete fuel" ON public.fuel_purchases FOR DELETE TO authenticated USING (
  is_company_member(auth.uid(), company_id) AND (auth.uid() = user_id OR has_company_permission(auth.uid(), company_id, 'fuel.manage'))
);

-- IFTA
DROP POLICY IF EXISTS "own ifta select" ON public.ifta_entries;
DROP POLICY IF EXISTS "own ifta insert" ON public.ifta_entries;
DROP POLICY IF EXISTS "own ifta update" ON public.ifta_entries;
DROP POLICY IF EXISTS "own ifta delete" ON public.ifta_entries;
CREATE POLICY "company read ifta" ON public.ifta_entries FOR SELECT TO authenticated USING (
  is_company_member(auth.uid(), company_id) AND (auth.uid() = user_id OR has_company_permission(auth.uid(), company_id, 'ifta.view'))
);
CREATE POLICY "company insert ifta" ON public.ifta_entries FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id AND is_company_member(auth.uid(), company_id)
);
CREATE POLICY "company update ifta" ON public.ifta_entries FOR UPDATE TO authenticated USING (
  is_company_member(auth.uid(), company_id) AND (auth.uid() = user_id OR has_company_permission(auth.uid(), company_id, 'ifta.manage'))
) WITH CHECK (
  is_company_member(auth.uid(), company_id) AND (auth.uid() = user_id OR has_company_permission(auth.uid(), company_id, 'ifta.manage'))
);
CREATE POLICY "company delete ifta" ON public.ifta_entries FOR DELETE TO authenticated USING (
  is_company_member(auth.uid(), company_id) AND (auth.uid() = user_id OR has_company_permission(auth.uid(), company_id, 'ifta.manage'))
);

-- DOCUMENTS
DROP POLICY IF EXISTS "own docs select" ON public.documents;
DROP POLICY IF EXISTS "own docs insert" ON public.documents;
DROP POLICY IF EXISTS "own docs update" ON public.documents;
DROP POLICY IF EXISTS "own docs delete" ON public.documents;
CREATE POLICY "company read docs" ON public.documents FOR SELECT TO authenticated USING (
  is_company_member(auth.uid(), company_id) AND (auth.uid() = user_id OR has_company_permission(auth.uid(), company_id, 'documents.view'))
);
CREATE POLICY "company insert docs" ON public.documents FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id AND is_company_member(auth.uid(), company_id)
);
CREATE POLICY "company update docs" ON public.documents FOR UPDATE TO authenticated USING (
  is_company_member(auth.uid(), company_id) AND (auth.uid() = user_id OR has_company_permission(auth.uid(), company_id, 'documents.manage'))
) WITH CHECK (
  is_company_member(auth.uid(), company_id) AND (auth.uid() = user_id OR has_company_permission(auth.uid(), company_id, 'documents.manage'))
);
CREATE POLICY "company delete docs" ON public.documents FOR DELETE TO authenticated USING (
  is_company_member(auth.uid(), company_id) AND (auth.uid() = user_id OR has_company_permission(auth.uid(), company_id, 'documents.manage'))
);

-- SAVED ROUTES
DROP POLICY IF EXISTS "own routes" ON public.saved_routes;
CREATE POLICY "company read routes" ON public.saved_routes FOR SELECT TO authenticated USING (
  is_company_member(auth.uid(), company_id) AND (auth.uid() = user_id OR has_company_permission(auth.uid(), company_id, 'routes.view'))
);
CREATE POLICY "company insert routes" ON public.saved_routes FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id AND is_company_member(auth.uid(), company_id)
);
CREATE POLICY "company update routes" ON public.saved_routes FOR UPDATE TO authenticated USING (
  is_company_member(auth.uid(), company_id) AND (auth.uid() = user_id OR has_company_permission(auth.uid(), company_id, 'routes.manage'))
) WITH CHECK (
  is_company_member(auth.uid(), company_id) AND (auth.uid() = user_id OR has_company_permission(auth.uid(), company_id, 'routes.manage'))
);
CREATE POLICY "company delete routes" ON public.saved_routes FOR DELETE TO authenticated USING (
  is_company_member(auth.uid(), company_id) AND (auth.uid() = user_id OR has_company_permission(auth.uid(), company_id, 'routes.manage'))
);

-- TRIP LOGS
DROP POLICY IF EXISTS "own trips select" ON public.trip_logs;
DROP POLICY IF EXISTS "own trips insert" ON public.trip_logs;
DROP POLICY IF EXISTS "own trips update" ON public.trip_logs;
DROP POLICY IF EXISTS "own trips delete" ON public.trip_logs;
CREATE POLICY "company read trips" ON public.trip_logs FOR SELECT TO authenticated USING (
  is_company_member(auth.uid(), company_id) AND (auth.uid() = user_id OR has_company_permission(auth.uid(), company_id, 'routes.view'))
);
CREATE POLICY "company insert trips" ON public.trip_logs FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id AND is_company_member(auth.uid(), company_id)
);
CREATE POLICY "company update trips" ON public.trip_logs FOR UPDATE TO authenticated USING (
  is_company_member(auth.uid(), company_id) AND (auth.uid() = user_id OR has_company_permission(auth.uid(), company_id, 'routes.manage'))
) WITH CHECK (
  is_company_member(auth.uid(), company_id) AND (auth.uid() = user_id OR has_company_permission(auth.uid(), company_id, 'routes.manage'))
);
CREATE POLICY "company delete trips" ON public.trip_logs FOR DELETE TO authenticated USING (
  is_company_member(auth.uid(), company_id) AND (auth.uid() = user_id OR has_company_permission(auth.uid(), company_id, 'routes.manage'))
);

-- EXPENSES
DROP POLICY IF EXISTS "own expenses select" ON public.expenses;
DROP POLICY IF EXISTS "own expenses insert" ON public.expenses;
DROP POLICY IF EXISTS "own expenses update" ON public.expenses;
DROP POLICY IF EXISTS "own expenses delete" ON public.expenses;
CREATE POLICY "company read expenses" ON public.expenses FOR SELECT TO authenticated USING (
  is_company_member(auth.uid(), company_id) AND (auth.uid() = user_id OR has_company_permission(auth.uid(), company_id, 'expenses.view'))
);
CREATE POLICY "company insert expenses" ON public.expenses FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id AND is_company_member(auth.uid(), company_id)
);
CREATE POLICY "company update expenses" ON public.expenses FOR UPDATE TO authenticated USING (
  is_company_member(auth.uid(), company_id) AND (auth.uid() = user_id OR has_company_permission(auth.uid(), company_id, 'expenses.manage'))
) WITH CHECK (
  is_company_member(auth.uid(), company_id) AND (auth.uid() = user_id OR has_company_permission(auth.uid(), company_id, 'expenses.manage'))
);
CREATE POLICY "company delete expenses" ON public.expenses FOR DELETE TO authenticated USING (
  is_company_member(auth.uid(), company_id) AND (auth.uid() = user_id OR has_company_permission(auth.uid(), company_id, 'expenses.manage'))
);

-- DUTY STATUS (HOS)
DROP POLICY IF EXISTS "own duty select" ON public.duty_status_logs;
DROP POLICY IF EXISTS "own duty insert" ON public.duty_status_logs;
DROP POLICY IF EXISTS "own duty update" ON public.duty_status_logs;
DROP POLICY IF EXISTS "own duty delete" ON public.duty_status_logs;
CREATE POLICY "company read duty" ON public.duty_status_logs FOR SELECT TO authenticated USING (
  is_company_member(auth.uid(), company_id) AND (auth.uid() = user_id OR has_company_permission(auth.uid(), company_id, 'hos.view'))
);
CREATE POLICY "company insert duty" ON public.duty_status_logs FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id AND is_company_member(auth.uid(), company_id)
);
CREATE POLICY "company update duty" ON public.duty_status_logs FOR UPDATE TO authenticated USING (
  is_company_member(auth.uid(), company_id) AND (auth.uid() = user_id OR has_company_permission(auth.uid(), company_id, 'hos.manage'))
) WITH CHECK (
  is_company_member(auth.uid(), company_id) AND (auth.uid() = user_id OR has_company_permission(auth.uid(), company_id, 'hos.manage'))
);
CREATE POLICY "company delete duty" ON public.duty_status_logs FOR DELETE TO authenticated USING (
  is_company_member(auth.uid(), company_id) AND (auth.uid() = user_id OR has_company_permission(auth.uid(), company_id, 'hos.manage'))
);

-- SETTLEMENTS (uses expenses permissions)
DROP POLICY IF EXISTS "own settlements select" ON public.settlements;
DROP POLICY IF EXISTS "own settlements insert" ON public.settlements;
DROP POLICY IF EXISTS "own settlements update" ON public.settlements;
DROP POLICY IF EXISTS "own settlements delete" ON public.settlements;
CREATE POLICY "company read settlements" ON public.settlements FOR SELECT TO authenticated USING (
  is_company_member(auth.uid(), company_id) AND (auth.uid() = user_id OR has_company_permission(auth.uid(), company_id, 'expenses.view'))
);
CREATE POLICY "company insert settlements" ON public.settlements FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id AND is_company_member(auth.uid(), company_id)
);
CREATE POLICY "company update settlements" ON public.settlements FOR UPDATE TO authenticated USING (
  is_company_member(auth.uid(), company_id) AND (auth.uid() = user_id OR has_company_permission(auth.uid(), company_id, 'expenses.manage'))
) WITH CHECK (
  is_company_member(auth.uid(), company_id) AND (auth.uid() = user_id OR has_company_permission(auth.uid(), company_id, 'expenses.manage'))
);
CREATE POLICY "company delete settlements" ON public.settlements FOR DELETE TO authenticated USING (
  is_company_member(auth.uid(), company_id) AND (auth.uid() = user_id OR has_company_permission(auth.uid(), company_id, 'expenses.manage'))
);

-- FAVORITE LOCATIONS (uses routes permissions)
DROP POLICY IF EXISTS "own favorites select" ON public.favorite_locations;
DROP POLICY IF EXISTS "own favorites insert" ON public.favorite_locations;
DROP POLICY IF EXISTS "own favorites update" ON public.favorite_locations;
DROP POLICY IF EXISTS "own favorites delete" ON public.favorite_locations;
CREATE POLICY "company read favorites" ON public.favorite_locations FOR SELECT TO authenticated USING (
  is_company_member(auth.uid(), company_id) AND (auth.uid() = user_id OR has_company_permission(auth.uid(), company_id, 'routes.view'))
);
CREATE POLICY "company insert favorites" ON public.favorite_locations FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id AND is_company_member(auth.uid(), company_id)
);
CREATE POLICY "company update favorites" ON public.favorite_locations FOR UPDATE TO authenticated USING (
  is_company_member(auth.uid(), company_id) AND (auth.uid() = user_id OR has_company_permission(auth.uid(), company_id, 'routes.manage'))
) WITH CHECK (
  is_company_member(auth.uid(), company_id) AND (auth.uid() = user_id OR has_company_permission(auth.uid(), company_id, 'routes.manage'))
);
CREATE POLICY "company delete favorites" ON public.favorite_locations FOR DELETE TO authenticated USING (
  is_company_member(auth.uid(), company_id) AND (auth.uid() = user_id OR has_company_permission(auth.uid(), company_id, 'routes.manage'))
);

-- ============================================================
-- 6) UPDATE SIGNUP TRIGGER: new users become company_owner of a fresh company
-- ============================================================
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
  INSERT INTO public.company_member_roles(member_id, role) VALUES (new_member_id, 'company_owner');
  RETURN NEW;
END;
$$;
