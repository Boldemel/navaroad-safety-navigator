
CREATE POLICY "hazard photos readable by all auth" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'hazard-photos');
CREATE POLICY "users upload hazard photos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'hazard-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "users delete own hazard photos" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'hazard-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
