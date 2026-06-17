-- 1) Add fleet_pro to subscription_plan enum
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'subscription_plan' AND e.enumlabel = 'fleet_pro'
  ) THEN
    ALTER TYPE public.subscription_plan ADD VALUE 'fleet_pro';
  END IF;
END $$;

-- 2) Add stripe_customer_id on companies
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS stripe_customer_id text;

CREATE INDEX IF NOT EXISTS idx_companies_stripe_customer_id
  ON public.companies(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_companies_billing_subscription_id
  ON public.companies(billing_subscription_id);