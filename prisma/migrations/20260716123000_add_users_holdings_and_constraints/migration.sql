-- User accounts and RBAC
CREATE TYPE "user_role" AS ENUM ('ADMIN', 'EDITOR', 'VIEWER');

CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "user_role" NOT NULL DEFAULT 'VIEWER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
CREATE INDEX "users_isActive_role_idx" ON "users"("isActive", "role");

ALTER TABLE "audit_logs"
  ADD COLUMN "requestId" TEXT,
  ALTER COLUMN "details" TYPE JSONB
    USING CASE
      WHEN "details" IS NULL THEN NULL
      ELSE jsonb_build_object('message', "details")
    END;

UPDATE "audit_logs" audit
SET "userId" = NULL
WHERE "userId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "users" users WHERE users."id" = audit."userId");

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "audit_logs_userId_createdAt_idx" ON "audit_logs"("userId", "createdAt");
CREATE INDEX "audit_logs_entityType_entityId_createdAt_idx"
  ON "audit_logs"("entityType", "entityId", "createdAt");

-- Per-MOL balances. Legacy assets.molId remains during Release A.
CREATE TABLE "asset_holdings" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "molId" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "asset_holdings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "asset_holdings" ("id", "assetId", "molId", "quantity", "createdAt", "updatedAt")
SELECT
  concat('holding_', md5(random()::text || clock_timestamp()::text || asset."id")),
  asset."id",
  asset."molId",
  asset."quantity",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "assets" asset;

CREATE UNIQUE INDEX "asset_holdings_assetId_molId_key"
  ON "asset_holdings"("assetId", "molId");
CREATE INDEX "asset_holdings_molId_assetId_idx"
  ON "asset_holdings"("molId", "assetId");

ALTER TABLE "asset_holdings"
  ADD CONSTRAINT "asset_holdings_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "asset_holdings_molId_fkey"
    FOREIGN KEY ("molId") REFERENCES "mols"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Query indexes
CREATE INDEX "operations_assetId_date_idx" ON "operations"("assetId", "date");
CREATE INDEX "operations_type_date_idx" ON "operations"("type", "date");
CREATE INDEX "tasks_projectId_parentId_idx" ON "tasks"("projectId", "parentId");
CREATE INDEX "employees_status_fullName_idx" ON "employees"("status", "fullName");
CREATE INDEX "personnel_actions_employeeId_date_idx" ON "personnel_actions"("employeeId", "date");
CREATE INDEX "vacations_employeeId_startDate_idx" ON "vacations"("employeeId", "startDate");

-- PostgreSQL treats NULL values as distinct in a normal unique index. Prevent
-- duplicate non-project finance cells without deleting or merging user data.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "finance_plan_entries"
    WHERE "projectId" IS NULL
    GROUP BY "employeeId", "year", "month", "type"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate finance plan cells without projectId must be resolved before migration';
  END IF;
END $$;

CREATE UNIQUE INDEX "finance_plan_entries_without_project_key"
  ON "finance_plan_entries"("employeeId", "year", "month", "type")
  WHERE "projectId" IS NULL;

-- Domain integrity constraints
ALTER TABLE "assets"
  ADD CONSTRAINT "assets_quantity_nonnegative" CHECK ("quantity" >= 0),
  ADD CONSTRAINT "assets_unitPrice_nonnegative" CHECK ("unitPrice" >= 0),
  ADD CONSTRAINT "assets_totalCost_nonnegative" CHECK ("totalCost" >= 0);

ALTER TABLE "asset_holdings"
  ADD CONSTRAINT "asset_holdings_quantity_nonnegative" CHECK ("quantity" >= 0);

ALTER TABLE "operations"
  ADD CONSTRAINT "operations_quantity_valid" CHECK (
    ("type" = 'STATUS_CHANGE' AND "quantity" >= 0)
    OR ("type" <> 'STATUS_CHANGE' AND "quantity" > 0)
  ),
  ADD CONSTRAINT "operations_unitPrice_nonnegative" CHECK ("unitPrice" >= 0),
  ADD CONSTRAINT "operations_totalCost_nonnegative" CHECK ("totalCost" >= 0);

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_level_range" CHECK ("level" BETWEEN 1 AND 3),
  ADD CONSTRAINT "tasks_progress_range" CHECK ("progress" BETWEEN 0 AND 100),
  ADD CONSTRAINT "tasks_date_range" CHECK ("startDate" IS NULL OR "endDate" IS NULL OR "startDate" <= "endDate");

ALTER TABLE "projects"
  ADD CONSTRAINT "projects_date_range" CHECK ("startDate" IS NULL OR "endDate" IS NULL OR "startDate" <= "endDate"),
  ADD CONSTRAINT "projects_plannedBudget_nonnegative" CHECK ("plannedBudget" >= 0),
  ADD CONSTRAINT "projects_actualBudget_nonnegative" CHECK ("actualBudget" >= 0);

ALTER TABLE "vacations"
  ADD CONSTRAINT "vacations_date_range" CHECK ("startDate" <= "endDate");

ALTER TABLE "employees"
  ADD CONSTRAINT "employees_contract_date_range"
  CHECK ("contractSignedDate" IS NULL OR "contractEndDate" IS NULL OR "contractSignedDate" <= "contractEndDate");

ALTER TABLE "salary_entries"
  ADD CONSTRAINT "salary_entries_amount_nonnegative" CHECK ("amount" >= 0);

ALTER TABLE "finance_plan_entries"
  ADD CONSTRAINT "finance_plan_entries_amount_nonnegative" CHECK ("amount" >= 0);
