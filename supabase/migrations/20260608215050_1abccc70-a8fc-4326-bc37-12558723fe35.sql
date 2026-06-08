
-- Status / priority enums
DO $$ BEGIN
  CREATE TYPE public.maintenance_task_status AS ENUM ('Open','InProgress','Completed','Cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.maintenance_task_priority AS ENUM ('Critical','High','Medium','Low');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Main table
CREATE TABLE IF NOT EXISTS public.maintenance_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,                 -- creator
  inspection_id uuid REFERENCES public.inspections(id) ON DELETE SET NULL,
  defect_key text,                       -- stable identifier within an inspection (for dedup)
  vehicle_unit text,
  trailer_unit text,
  driver_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  defect_category text,
  defect_description text NOT NULL,
  priority public.maintenance_task_priority NOT NULL DEFAULT 'Medium',
  status public.maintenance_task_status NOT NULL DEFAULT 'Open',
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  repair_notes text,
  repair_cost_usd numeric(12,2),
  repair_documentation_url text,
  completed_at timestamptz,
  maintenance_record_id uuid REFERENCES public.maintenance_records(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS maintenance_tasks_inspection_defect_key
  ON public.maintenance_tasks(inspection_id, defect_key)
  WHERE inspection_id IS NOT NULL AND defect_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS maintenance_tasks_company_status_idx
  ON public.maintenance_tasks(company_id, status);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.maintenance_tasks TO authenticated;
GRANT ALL ON public.maintenance_tasks TO service_role;

-- RLS
ALTER TABLE public.maintenance_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view maintenance tasks"
  ON public.maintenance_tasks FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Company members can insert maintenance tasks"
  ON public.maintenance_tasks FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Company members can update maintenance tasks"
  ON public.maintenance_tasks FOR UPDATE TO authenticated
  USING (public.is_company_member(auth.uid(), company_id))
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Company members can delete maintenance tasks"
  ON public.maintenance_tasks FOR DELETE TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_maintenance_tasks_updated_at ON public.maintenance_tasks;
CREATE TRIGGER trg_maintenance_tasks_updated_at
BEFORE UPDATE ON public.maintenance_tasks
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Sync from inspections: create/update one task per defect
CREATE OR REPLACE FUNCTION public.sync_tasks_from_inspection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item jsonb;
  idx int := 0;
  v_key text;
  v_desc text;
  v_cat text;
  v_pri public.maintenance_task_priority;
  v_keys text[] := ARRAY[]::text[];
BEGIN
  IF NOT NEW.defects_correction_required
     OR NEW.defects IS NULL
     OR jsonb_typeof(NEW.defects) <> 'array'
     OR jsonb_array_length(NEW.defects) = 0 THEN
    -- No qualifying defects: clean up any Open/InProgress tasks for this inspection
    DELETE FROM public.maintenance_tasks
      WHERE inspection_id = NEW.id AND status IN ('Open','InProgress');
    RETURN NEW;
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(NEW.defects) LOOP
    idx := idx + 1;
    v_key := COALESCE(NULLIF(item->>'id',''), NULLIF(item->>'key',''), 'defect_' || idx);
    v_desc := COALESCE(NULLIF(item->>'description',''), NULLIF(item->>'name',''), 'Defect ' || idx);
    v_cat  := NULLIF(item->>'category','');
    v_pri  := CASE lower(COALESCE(item->>'priority',''))
                WHEN 'critical' THEN 'Critical'::public.maintenance_task_priority
                WHEN 'high'     THEN 'High'::public.maintenance_task_priority
                WHEN 'low'      THEN 'Low'::public.maintenance_task_priority
                ELSE 'Medium'::public.maintenance_task_priority
              END;
    v_keys := v_keys || v_key;

    INSERT INTO public.maintenance_tasks
      (company_id, user_id, inspection_id, defect_key, vehicle_unit, trailer_unit,
       driver_id, defect_category, defect_description, priority)
    VALUES
      (NEW.company_id, NEW.user_id, NEW.id, v_key, NEW.vehicle_unit, NEW.trailer_unit,
       NEW.user_id, v_cat, v_desc, v_pri)
    ON CONFLICT (inspection_id, defect_key) DO UPDATE SET
      vehicle_unit       = EXCLUDED.vehicle_unit,
      trailer_unit       = EXCLUDED.trailer_unit,
      defect_category    = EXCLUDED.defect_category,
      defect_description = EXCLUDED.defect_description,
      -- Only adjust priority on still-open tasks
      priority           = CASE WHEN public.maintenance_tasks.status IN ('Open','InProgress')
                                THEN EXCLUDED.priority ELSE public.maintenance_tasks.priority END;
  END LOOP;

  -- Remove any non-completed tasks for defects that no longer exist
  DELETE FROM public.maintenance_tasks
    WHERE inspection_id = NEW.id
      AND status IN ('Open','InProgress')
      AND NOT (defect_key = ANY (v_keys));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_tasks_from_inspection ON public.inspections;
CREATE TRIGGER trg_sync_tasks_from_inspection
AFTER INSERT OR UPDATE ON public.inspections
FOR EACH ROW EXECUTE FUNCTION public.sync_tasks_from_inspection();

-- When a task is marked Completed, create a maintenance history record (idempotent)
CREATE OR REPLACE FUNCTION public.complete_task_to_maintenance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NEW.status = 'Completed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'Completed') THEN
    IF NEW.completed_at IS NULL THEN NEW.completed_at := now(); END IF;

    IF NEW.maintenance_record_id IS NULL THEN
      INSERT INTO public.maintenance_records
        (user_id, company_id, vehicle_unit, service_type, service_date,
         cost_usd, notes, receipt_url, driver_id)
      VALUES
        (NEW.user_id, NEW.company_id, NEW.vehicle_unit,
         COALESCE(NEW.defect_category, 'Defect repair') || ': ' || NEW.defect_description,
         NEW.completed_at::date,
         NEW.repair_cost_usd,
         NEW.repair_notes,
         NEW.repair_documentation_url,
         NEW.driver_id)
      RETURNING id INTO v_id;
      NEW.maintenance_record_id := v_id;
    ELSE
      UPDATE public.maintenance_records SET
        vehicle_unit = NEW.vehicle_unit,
        service_date = NEW.completed_at::date,
        cost_usd     = NEW.repair_cost_usd,
        notes        = NEW.repair_notes,
        receipt_url  = NEW.repair_documentation_url
      WHERE id = NEW.maintenance_record_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_complete_task_to_maintenance ON public.maintenance_tasks;
CREATE TRIGGER trg_complete_task_to_maintenance
BEFORE INSERT OR UPDATE ON public.maintenance_tasks
FOR EACH ROW EXECUTE FUNCTION public.complete_task_to_maintenance();
