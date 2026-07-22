
-- Extend company_role enum with additional enterprise roles
ALTER TYPE public.company_role ADD VALUE IF NOT EXISTS 'fleet_administrator';
ALTER TYPE public.company_role ADD VALUE IF NOT EXISTS 'operations_manager';
ALTER TYPE public.company_role ADD VALUE IF NOT EXISTS 'recruiter';
ALTER TYPE public.company_role ADD VALUE IF NOT EXISTS 'human_resources';
ALTER TYPE public.company_role ADD VALUE IF NOT EXISTS 'compliance_manager';
ALTER TYPE public.company_role ADD VALUE IF NOT EXISTS 'billing_administrator';
ALTER TYPE public.company_role ADD VALUE IF NOT EXISTS 'customer_service';
ALTER TYPE public.company_role ADD VALUE IF NOT EXISTS 'driver_trainer';
ALTER TYPE public.company_role ADD VALUE IF NOT EXISTS 'shop_technician';
ALTER TYPE public.company_role ADD VALUE IF NOT EXISTS 'readonly_user';

-- Extend profiles with enterprise fields (all JSONB for future-ready extensibility)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS integrations jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS preferences  jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS permission_flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS certifications  jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_account_status_check
  CHECK (account_status IN ('active','inactive','suspended','pending','locked','password_expired'))
  NOT VALID;
