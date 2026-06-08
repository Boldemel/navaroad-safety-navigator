CREATE TABLE public.ai_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('user','assistant','system')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_chat_messages_company_created_idx ON public.ai_chat_messages(company_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_chat_messages TO authenticated;
GRANT ALL ON public.ai_chat_messages TO service_role;
ALTER TABLE public.ai_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai chat read"
  ON public.ai_chat_messages FOR SELECT TO authenticated
  USING (
    is_company_member(auth.uid(), company_id)
    AND (
      has_company_role(auth.uid(), company_id, 'fleet_owner'::company_role)
      OR is_company_owner(auth.uid(), company_id)
      OR has_company_role(auth.uid(), company_id, 'fleet_manager'::company_role)
      OR has_company_role(auth.uid(), company_id, 'accountant'::company_role)
      OR has_company_role(auth.uid(), company_id, 'safety_manager'::company_role)
    )
  );

CREATE POLICY "ai chat insert"
  ON public.ai_chat_messages FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND is_company_member(auth.uid(), company_id)
    AND (
      has_company_role(auth.uid(), company_id, 'fleet_owner'::company_role)
      OR is_company_owner(auth.uid(), company_id)
      OR has_company_role(auth.uid(), company_id, 'fleet_manager'::company_role)
      OR has_company_role(auth.uid(), company_id, 'accountant'::company_role)
      OR has_company_role(auth.uid(), company_id, 'safety_manager'::company_role)
    )
  );

CREATE POLICY "ai chat delete"
  ON public.ai_chat_messages FOR DELETE TO authenticated
  USING (
    is_company_member(auth.uid(), company_id)
    AND (
      has_company_role(auth.uid(), company_id, 'fleet_owner'::company_role)
      OR is_company_owner(auth.uid(), company_id)
    )
  );