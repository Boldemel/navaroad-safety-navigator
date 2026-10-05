-- New self-signup owners get the app-recognized 'fleet_owner' role (the UI and module
-- registry treat fleet_owner as the owner role; 'company_owner' was not recognized).
CREATE OR REPLACE FUNCTION public.provision_company_for_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE new_company_id uuid; new_member_id uuid; display_name text;
BEGIN
  display_name := COALESCE(NEW.raw_user_meta_data->>'driver_name', split_part(NEW.email, '@', 1), 'My Fleet');
  INSERT INTO public.companies(name, owner_id, subscription_plan, subscription_status, trial_started_at, trial_ends_at)
    VALUES (display_name || '''s Fleet', NEW.id, 'owner_operator', 'trial', now(), now() + interval '7 days')
    RETURNING id INTO new_company_id;
  INSERT INTO public.company_members(company_id, user_id) VALUES (new_company_id, NEW.id) RETURNING id INTO new_member_id;
  INSERT INTO public.company_member_roles(member_id, role) VALUES (new_member_id, 'fleet_owner');
  RETURN NEW;
END;
$function$;

-- Backfill: existing company_owner members also get fleet_owner (additive).
INSERT INTO public.company_member_roles(member_id, role)
SELECT member_id, 'fleet_owner' FROM public.company_member_roles WHERE role = 'company_owner'
ON CONFLICT DO NOTHING;