
CREATE TABLE public.weigh_station_status (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  station_id text NOT NULL,
  station_name text,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  status text NOT NULL CHECK (status IN ('open','closed')),
  reporter_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '8 hours')
);

CREATE INDEX weigh_station_status_station_idx ON public.weigh_station_status (station_id, created_at DESC);
CREATE INDEX weigh_station_status_expires_idx ON public.weigh_station_status (expires_at);

GRANT SELECT, INSERT, DELETE ON public.weigh_station_status TO authenticated;
GRANT ALL ON public.weigh_station_status TO service_role;

ALTER TABLE public.weigh_station_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read weigh status"
  ON public.weigh_station_status FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "auth insert own weigh status"
  ON public.weigh_station_status FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "owner delete weigh status"
  ON public.weigh_station_status FOR DELETE
  TO authenticated
  USING (auth.uid() = reporter_id);

CREATE POLICY "mods delete weigh status"
  ON public.weigh_station_status FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));
