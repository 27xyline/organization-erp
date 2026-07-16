DROP INDEX IF EXISTS "finance_plan_entries_employeeId_year_month_type_key";

CREATE INDEX IF NOT EXISTS "finance_plan_entries_employeeId_year_month_type_idx"
ON "finance_plan_entries"("employeeId", "year", "month", "type");

CREATE UNIQUE INDEX IF NOT EXISTS "finance_plan_entries_employeeId_year_month_type_projectId_key"
ON "finance_plan_entries"("employeeId", "year", "month", "type", "projectId");
