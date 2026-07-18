BEGIN;

ALTER TABLE "employees"
  ADD COLUMN "birthDate" TIMESTAMP(3),
  ADD COLUMN "education" TEXT,
  ADD COLUMN "managerId" TEXT,
  ADD COLUMN "qualification" TEXT;

ALTER TABLE "mols" ADD COLUMN "employeeId" TEXT;

CREATE TABLE "employee_skills" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "level" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "employee_skills_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "employee_skills_level_check" CHECK ("level" IS NULL OR "level" BETWEEN 1 AND 5)
);

CREATE TABLE "employee_certificates" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "issuer" TEXT,
  "number" TEXT,
  "issuedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "employee_certificates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "employee_certificates_date_check"
    CHECK ("issuedAt" IS NULL OR "expiresAt" IS NULL OR "expiresAt" >= "issuedAt")
);

CREATE INDEX "employee_skills_employeeId_idx" ON "employee_skills"("employeeId");
CREATE UNIQUE INDEX "employee_skills_employeeId_name_key" ON "employee_skills"("employeeId", "name");
CREATE INDEX "employee_certificates_employeeId_expiresAt_idx" ON "employee_certificates"("employeeId", "expiresAt");
CREATE INDEX "employees_managerId_idx" ON "employees"("managerId");
CREATE UNIQUE INDEX "mols_employeeId_key" ON "mols"("employeeId");

ALTER TABLE "mols"
  ADD CONSTRAINT "mols_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "employees"
  ADD CONSTRAINT "employees_managerId_fkey"
  FOREIGN KEY ("managerId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "employees"
  ADD CONSTRAINT "employees_manager_not_self_check"
  CHECK ("managerId" IS NULL OR "managerId" <> "id");
ALTER TABLE "employee_skills"
  ADD CONSTRAINT "employee_skills_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_certificates"
  ADD CONSTRAINT "employee_certificates_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "mols" AS m
SET "employeeId" = e."id"
FROM "employees" AS e
WHERE m."fullName" = e."fullName"
  AND m."departmentId" = e."departmentId"
  AND (SELECT COUNT(*) FROM "mols" AS m2
       WHERE m2."fullName" = m."fullName" AND m2."departmentId" = m."departmentId") = 1
  AND (SELECT COUNT(*) FROM "employees" AS e2
       WHERE e2."fullName" = e."fullName" AND e2."departmentId" = e."departmentId") = 1;

COMMIT;
