
-- 1. Truck availability posts
CREATE TABLE public.truck_availability_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  vehicle_unit TEXT NOT NULL,
  driver_id UUID,
  available_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  available_to TIMESTAMPTZ,
  origin_city TEXT,
  origin_state TEXT,
  preferred_lanes TEXT,
  max_deadhead_mi INTEGER,
  equipment_type TEXT,
  trailer_type TEXT,
  min_rate_usd NUMERIC(10,2),
  min_rate_per_mile NUMERIC(6,3),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.truck_availability_posts TO authenticated;
GRANT ALL ON public.truck_availability_posts TO service_role;

ALTER TABLE public.truck_availability_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read truck posts"
  ON public.truck_availability_posts FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "members write truck posts"
  ON public.truck_availability_posts FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(auth.uid(), company_id) AND auth.uid() = user_id);

CREATE POLICY "members update truck posts"
  ON public.truck_availability_posts FOR UPDATE TO authenticated
  USING (public.is_company_member(auth.uid(), company_id))
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "members delete truck posts"
  ON public.truck_availability_posts FOR DELETE TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE INDEX idx_truck_posts_company_status ON public.truck_availability_posts(company_id, status);

CREATE TRIGGER truck_posts_touch BEFORE UPDATE ON public.truck_availability_posts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2. Dispatch communications (per load thread)
CREATE TABLE public.dispatch_communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  load_id UUID NOT NULL REFERENCES public.loads(id) ON DELETE CASCADE,
  author_id UUID NOT NULL,
  author_name TEXT,
  channel TEXT NOT NULL DEFAULT 'note',
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.dispatch_communications TO authenticated;
GRANT ALL ON public.dispatch_communications TO service_role;

ALTER TABLE public.dispatch_communications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read dispatch comms"
  ON public.dispatch_communications FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "members write dispatch comms"
  ON public.dispatch_communications FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(auth.uid(), company_id) AND auth.uid() = author_id);

CREATE POLICY "author or manager deletes dispatch comms"
  ON public.dispatch_communications FOR DELETE TO authenticated
  USING (
    public.is_company_member(auth.uid(), company_id) AND
    (author_id = auth.uid() OR public.has_company_permission(auth.uid(), company_id, 'members.manage'))
  );

CREATE INDEX idx_dispatch_comms_load ON public.dispatch_communications(load_id, created_at DESC);
