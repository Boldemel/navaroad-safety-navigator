INSERT INTO public.role_default_permissions(role, permission) VALUES
  ('accountant','loads.view'),
  ('accountant','fuel.view'),
  ('accountant','fuel.manage'),
  ('accountant','expenses.view'),
  ('accountant','expenses.manage'),
  ('accountant','ifta.view'),
  ('accountant','ifta.manage'),
  ('accountant','documents.view')
ON CONFLICT DO NOTHING;