-- Run this once in Supabase (SQL Editor) after schema.sql.
-- Supabase exposes tables through a public API by default. Turning on Row Level Security
-- with no policies blocks that public API completely. Our backend connects as the database
-- owner (the "postgres" role), which bypasses RLS, so the app keeps working normally.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;
