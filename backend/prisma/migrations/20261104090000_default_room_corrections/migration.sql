ALTER TABLE "users" ALTER COLUMN "correctionPermissions"
SET DEFAULT '["undo-checkin","undo-checkout","restore","transfer"]'::jsonb;

-- Preserve requirements explicitly saved by a manager.
UPDATE "users" AS u
SET "correctionPermissions" = '["undo-checkin","undo-checkout","restore","transfer"]'::jsonb,
    "updatedAt" = CURRENT_TIMESTAMP
FROM "roles" AS r
WHERE u."roleId" = r."roleId" AND r."roleName" = 'Receptionist'
AND NOT EXISTS (
  SELECT 1 FROM "audit_logs" AS a
  WHERE a."entityType" = 'User' AND a."action" = 'CorrectionPermissionsChanged'
    AND a."newData"->>'userId' = u."userId"::text
);
