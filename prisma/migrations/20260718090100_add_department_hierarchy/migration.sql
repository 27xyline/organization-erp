BEGIN;

-- Create the normalized organization structure first. Legacy text columns stay
-- in place during the transition so existing exports and historical snapshots
-- keep their current representation.
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "headEmployeeId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "departments_parent_not_self" CHECK ("parentId" IS NULL OR "parentId" <> "id")
);

CREATE UNIQUE INDEX "departments_code_key" ON "departments"("code");
CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");
CREATE UNIQUE INDEX "departments_code_ci_key" ON "departments"(LOWER("code"));
CREATE UNIQUE INDEX "departments_name_ci_key" ON "departments"(LOWER("name"));
CREATE INDEX "departments_parentId_idx" ON "departments"("parentId");
CREATE INDEX "departments_headEmployeeId_idx" ON "departments"("headEmployeeId");
CREATE INDEX "departments_isActive_name_idx" ON "departments"("isActive", "name");

-- Backfill one department per distinct legacy name. Stable hash-based IDs and
-- codes make the migration deterministic without relying on extensions.
WITH legacy_values AS (
    SELECT BTRIM("department") AS "name"
    FROM "employees"
    WHERE NULLIF(BTRIM("department"), '') IS NOT NULL
    UNION ALL
    SELECT BTRIM("department") AS "name"
    FROM "staff_schedule"
    WHERE NULLIF(BTRIM("department"), '') IS NOT NULL
    UNION ALL
    SELECT BTRIM("department") AS "name"
    FROM "mols"
    WHERE NULLIF(BTRIM("department"), '') IS NOT NULL
),
legacy_departments AS (
    SELECT MIN("name") AS "name"
    FROM legacy_values
    GROUP BY LOWER("name")
)
INSERT INTO "departments" ("id", "code", "name", "updatedAt")
SELECT
    'dept_' || MD5(LOWER("name")),
    'DEP-' || UPPER(SUBSTRING(MD5(LOWER("name")) FROM 1 FOR 8)),
    "name",
    CURRENT_TIMESTAMP
FROM legacy_departments;

-- Old databases may contain an empty department string. Preserve those rows
-- under an explicit placeholder instead of losing data or aborting deployment.
-- A real legacy department may already use the default code or name, so choose
-- the first deterministic suffix that is free while keeping the stable ID used
-- by the relation backfill below.
DO $$
DECLARE
    suffix INTEGER := 0;
    candidate_code TEXT;
    candidate_name TEXT;
BEGIN
    IF EXISTS (
        SELECT 1 FROM "employees" WHERE NULLIF(BTRIM("department"), '') IS NULL
        UNION ALL
        SELECT 1 FROM "staff_schedule" WHERE NULLIF(BTRIM("department"), '') IS NULL
        UNION ALL
        SELECT 1 FROM "mols" WHERE NULLIF(BTRIM("department"), '') IS NULL
    ) THEN
        LOOP
            candidate_code := CASE
                WHEN suffix = 0 THEN 'DEP-UNASSIGNED'
                ELSE 'DEP-UNASSIGNED-' || suffix
            END;
            candidate_name := CASE
                WHEN suffix = 0 THEN 'Не указано'
                ELSE 'Не указано (импорт ' || suffix || ')'
            END;

            IF NOT EXISTS (
                SELECT 1
                FROM "departments"
                WHERE LOWER("code") = LOWER(candidate_code)
                   OR LOWER("name") = LOWER(candidate_name)
            ) THEN
                INSERT INTO "departments" ("id", "code", "name", "isActive", "updatedAt")
                VALUES ('dept_unassigned', candidate_code, candidate_name, false, CURRENT_TIMESTAMP);
                EXIT;
            END IF;

            suffix := suffix + 1;
        END LOOP;
    END IF;
END $$;

ALTER TABLE "employees" ADD COLUMN "departmentId" TEXT;
ALTER TABLE "staff_schedule" ADD COLUMN "departmentId" TEXT;
ALTER TABLE "mols" ADD COLUMN "departmentId" TEXT;

UPDATE "employees" entity
SET "departmentId" = department."id"
FROM "departments" department
WHERE LOWER(BTRIM(entity."department")) = LOWER(department."name");

UPDATE "staff_schedule" entity
SET "departmentId" = department."id"
FROM "departments" department
WHERE LOWER(BTRIM(entity."department")) = LOWER(department."name");

UPDATE "mols" entity
SET "departmentId" = department."id"
FROM "departments" department
WHERE LOWER(BTRIM(entity."department")) = LOWER(department."name");

UPDATE "employees" SET "departmentId" = 'dept_unassigned' WHERE "departmentId" IS NULL;
UPDATE "staff_schedule" SET "departmentId" = 'dept_unassigned' WHERE "departmentId" IS NULL;
UPDATE "mols" SET "departmentId" = 'dept_unassigned' WHERE "departmentId" IS NULL;

-- From this point forward the relation is authoritative. Canonicalize all
-- compatibility snapshots so old case/whitespace variants cannot drift.
UPDATE "employees" entity
SET "department" = department."name"
FROM "departments" department
WHERE entity."departmentId" = department."id";

UPDATE "staff_schedule" entity
SET "department" = department."name"
FROM "departments" department
WHERE entity."departmentId" = department."id";

UPDATE "mols" entity
SET "department" = department."name"
FROM "departments" department
WHERE entity."departmentId" = department."id";

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "employees" WHERE "departmentId" IS NULL)
       OR EXISTS (SELECT 1 FROM "staff_schedule" WHERE "departmentId" IS NULL)
       OR EXISTS (SELECT 1 FROM "mols" WHERE "departmentId" IS NULL) THEN
        RAISE EXCEPTION 'Department backfill left rows without a department';
    END IF;
END $$;

ALTER TABLE "employees" ALTER COLUMN "departmentId" SET NOT NULL;
ALTER TABLE "staff_schedule" ALTER COLUMN "departmentId" SET NOT NULL;
ALTER TABLE "mols" ALTER COLUMN "departmentId" SET NOT NULL;

CREATE INDEX "employees_departmentId_idx" ON "employees"("departmentId");
CREATE INDEX "staff_schedule_departmentId_idx" ON "staff_schedule"("departmentId");
CREATE INDEX "mols_departmentId_idx" ON "mols"("departmentId");

ALTER TABLE "departments"
    ADD CONSTRAINT "departments_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "departments"
    ADD CONSTRAINT "departments_headEmployeeId_fkey"
    FOREIGN KEY ("headEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "employees"
    ADD CONSTRAINT "employees_departmentId_fkey"
    FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "staff_schedule"
    ADD CONSTRAINT "staff_schedule_departmentId_fkey"
    FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "mols"
    ADD CONSTRAINT "mols_departmentId_fkey"
    FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Defense in depth for writes outside the application service. The advisory
-- transaction lock serializes hierarchy changes, while the recursive walk
-- rejects both direct and deep cycles.
CREATE FUNCTION "prevent_department_hierarchy_cycle"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    has_cycle BOOLEAN;
BEGIN
    PERFORM pg_advisory_xact_lock(904202607);
    IF NEW."parentId" IS NULL THEN
        RETURN NEW;
    END IF;
    IF NEW."parentId" = NEW."id" THEN
        RAISE EXCEPTION 'Department cannot be its own parent'
            USING ERRCODE = '23514';
    END IF;

    WITH RECURSIVE ancestors AS (
        SELECT department."id", department."parentId", ARRAY[department."id"] AS path
        FROM "departments" department
        WHERE department."id" = NEW."parentId"
        UNION ALL
        SELECT department."id", department."parentId", ancestors.path || department."id"
        FROM "departments" department
        JOIN ancestors ON department."id" = ancestors."parentId"
        WHERE NOT department."id" = ANY(ancestors.path)
    )
    SELECT EXISTS (
        SELECT 1 FROM ancestors WHERE "id" = NEW."id"
    ) INTO has_cycle;

    IF has_cycle THEN
        RAISE EXCEPTION 'Department hierarchy cycle detected'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "departments_prevent_hierarchy_cycle"
BEFORE INSERT OR UPDATE OF "parentId" ON "departments"
FOR EACH ROW
EXECUTE FUNCTION "prevent_department_hierarchy_cycle"();

COMMIT;
