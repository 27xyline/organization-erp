BEGIN;

CREATE TYPE "payroll_adjustment_type" AS ENUM ('BONUS', 'ONE_TIME', 'DEDUCTION');
CREATE TYPE "payroll_period_status" AS ENUM ('OPEN', 'CLOSED');

CREATE TABLE "payroll_adjustments" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "projectId" TEXT,
  "year" INTEGER NOT NULL,
  "month" INTEGER NOT NULL,
  "type" "payroll_adjustment_type" NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "description" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payroll_adjustments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payroll_adjustments_period_check" CHECK ("year" BETWEEN 2000 AND 2100 AND "month" BETWEEN 1 AND 12),
  CONSTRAINT "payroll_adjustments_amount_check" CHECK ("amount" > 0)
);

CREATE TABLE "payroll_periods" (
  "id" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "month" INTEGER NOT NULL,
  "status" "payroll_period_status" NOT NULL DEFAULT 'OPEN',
  "closedAt" TIMESTAMP(3),
  "closedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payroll_periods_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payroll_periods_period_check" CHECK ("year" BETWEEN 2000 AND 2100 AND "month" BETWEEN 1 AND 12),
  CONSTRAINT "payroll_periods_close_consistent" CHECK (
    ("status" = 'OPEN' AND "closedAt" IS NULL AND "closedById" IS NULL) OR
    ("status" = 'CLOSED' AND "closedAt" IS NOT NULL AND "closedById" IS NOT NULL)
  )
);

CREATE INDEX "payroll_adjustments_year_month_employeeId_idx"
  ON "payroll_adjustments"("year", "month", "employeeId");
CREATE INDEX "payroll_adjustments_projectId_year_month_idx"
  ON "payroll_adjustments"("projectId", "year", "month");
CREATE UNIQUE INDEX "payroll_periods_year_month_key" ON "payroll_periods"("year", "month");
CREATE INDEX "payroll_periods_status_year_month_idx" ON "payroll_periods"("status", "year", "month");

ALTER TABLE "payroll_adjustments"
  ADD CONSTRAINT "payroll_adjustments_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payroll_adjustments"
  ADD CONSTRAINT "payroll_adjustments_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payroll_periods"
  ADD CONSTRAINT "payroll_periods_closedById_fkey"
  FOREIGN KEY ("closedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
