DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'rvu_app') THEN
    RAISE EXCEPTION 'rvu_app role is missing; run db:bootstrap before db:migrate';
  END IF;
END $$;
GRANT USAGE ON SCHEMA platform TO rvu_app;
CREATE FUNCTION platform.current_practice_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.practice_id', true), '')::uuid
$$;
REVOKE ALL ON FUNCTION platform.current_practice_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.current_practice_id() TO rvu_app;
CREATE FUNCTION platform.enable_tenant_rls(p_schema text, p_table text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', p_schema, p_table);
  EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', p_schema, p_table);
  IF NOT EXISTS (SELECT FROM pg_policies WHERE schemaname = p_schema AND tablename = p_table AND policyname = 'tenant_isolation') THEN
    EXECUTE format('CREATE POLICY tenant_isolation ON %I.%I USING (practice_id = platform.current_practice_id()) WITH CHECK (practice_id = platform.current_practice_id())', p_schema, p_table);
  END IF;
END $$;
REVOKE ALL ON FUNCTION platform.enable_tenant_rls(text, text) FROM PUBLIC;
