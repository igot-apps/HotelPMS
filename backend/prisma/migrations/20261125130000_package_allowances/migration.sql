-- Standard: 10 rooms / 2 staff. Pro: 20 rooms / 4 staff.
-- Only touches the platform settings row; hotels keep the allowances they already have.
UPDATE "subscription_settings"
SET "config" = jsonb_set("config", '{packages}', (
  SELECT jsonb_agg(CASE
    WHEN p->>'code' = 'standard' THEN p || '{"rooms": 10, "staff": 2}'::jsonb
    WHEN p->>'code' = 'pro' THEN p || '{"rooms": 20, "staff": 4}'::jsonb
    ELSE p END ORDER BY ord)
  FROM jsonb_array_elements("config"->'packages') WITH ORDINALITY AS t(p, ord)
)), "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 1;
