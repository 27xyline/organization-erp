BEGIN;

CREATE TYPE "time_entry_type" AS ENUM (
  'REGULAR',
  'VACATION',
  'SICK_LEAVE',
  'BUSINESS_TRIP',
  'OVERTIME'
);

CREATE TABLE "time_entries" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "projectId" TEXT,
  "taskId" TEXT,
  "workDate" DATE NOT NULL,
  "type" "time_entry_type" NOT NULL DEFAULT 'REGULAR',
  "hours" DECIMAL(5,2) NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "time_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "time_entries_hours_check" CHECK ("hours" > 0 AND "hours" <= 24)
);

CREATE INDEX "time_entries_workDate_employeeId_idx" ON "time_entries"("workDate", "employeeId");
CREATE INDEX "time_entries_projectId_workDate_idx" ON "time_entries"("projectId", "workDate");
CREATE INDEX "time_entries_taskId_workDate_idx" ON "time_entries"("taskId", "workDate");

ALTER TABLE "time_entries"
  ADD CONSTRAINT "time_entries_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "time_entries"
  ADD CONSTRAINT "time_entries_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "time_entries"
  ADD CONSTRAINT "time_entries_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
