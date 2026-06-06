
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS truck_height_in numeric,
  ADD COLUMN IF NOT EXISTS truck_weight_lbs numeric,
  ADD COLUMN IF NOT EXISTS truck_length_ft numeric,
  ADD COLUMN IF NOT EXISTS truck_axles integer,
  ADD COLUMN IF NOT EXISTS truck_hazmat boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.favorite_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  label text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  address text NOT NULL,
  latitude double precision,
  longitude double precision,
  city text,
  state text,
  country text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.favorite_locations TO authenticated;
GRANT ALL ON public.favorite_locations TO service_role;

ALTER TABLE public.favorite_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own favorites select" ON public.favorite_locations
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own favorites insert" ON public.favorite_locations
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own favorites update" ON public.favorite_locations
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own favorites delete" ON public.favorite_locations
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
