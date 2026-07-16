ALTER TABLE "employees"
ADD COLUMN "employmentRate" DECIMAL(5, 2) NOT NULL DEFAULT 1.00;

UPDATE "employees" AS employee
SET "employmentRate" = COALESCE(staff."rate", 1.00)
FROM "staff_schedule" AS staff
WHERE employee."staffScheduleId" = staff."id";
