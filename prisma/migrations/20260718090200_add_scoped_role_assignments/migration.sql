-- Keep users.role temporarily as a compatibility projection. Authorization
-- becomes assignment-based as soon as this migration is applied.
CREATE TYPE "app_role" AS ENUM (
    'ADMIN',
    'HR',
    'ACCOUNTANT',
    'PROJECT_MANAGER',
    'ASSET_CUSTODIAN',
    'DEPARTMENT_HEAD',
    'AUDITOR',
    'EMPLOYEE'
);

CREATE TYPE "scope_mode" AS ENUM ('NONE', 'ALL', 'ASSIGNED', 'SELF');

ALTER TABLE "users"
    ADD COLUMN "employeeId" TEXT,
    ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN "passwordChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE UNIQUE INDEX "users_employeeId_key" ON "users"("employeeId");

CREATE TABLE "user_role_assignments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "app_role" NOT NULL,
    "departmentScopeMode" "scope_mode" NOT NULL DEFAULT 'NONE',
    "projectScopeMode" "scope_mode" NOT NULL DEFAULT 'NONE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_role_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_department_scopes" (
    "id" TEXT NOT NULL,
    "roleAssignmentId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_department_scopes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_project_scopes" (
    "id" TEXT NOT NULL,
    "roleAssignmentId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_project_scopes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_role_assignments_userId_role_key"
    ON "user_role_assignments"("userId", "role");
CREATE INDEX "user_role_assignments_userId_role_idx"
    ON "user_role_assignments"("userId", "role");
CREATE UNIQUE INDEX "user_department_scopes_roleAssignmentId_departmentId_key"
    ON "user_department_scopes"("roleAssignmentId", "departmentId");
CREATE INDEX "user_department_scopes_departmentId_roleAssignmentId_idx"
    ON "user_department_scopes"("departmentId", "roleAssignmentId");
CREATE UNIQUE INDEX "user_project_scopes_roleAssignmentId_projectId_key"
    ON "user_project_scopes"("roleAssignmentId", "projectId");
CREATE INDEX "user_project_scopes_projectId_roleAssignmentId_idx"
    ON "user_project_scopes"("projectId", "roleAssignmentId");

ALTER TABLE "users"
    ADD CONSTRAINT "users_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "user_role_assignments"
    ADD CONSTRAINT "user_role_assignments_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_department_scopes"
    ADD CONSTRAINT "user_department_scopes_roleAssignmentId_fkey"
    FOREIGN KEY ("roleAssignmentId") REFERENCES "user_role_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_department_scopes"
    ADD CONSTRAINT "user_department_scopes_departmentId_fkey"
    FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_project_scopes"
    ADD CONSTRAINT "user_project_scopes_roleAssignmentId_fkey"
    FOREIGN KEY ("roleAssignmentId") REFERENCES "user_role_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_project_scopes"
    ADD CONSTRAINT "user_project_scopes_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Legacy ADMIN keeps unrestricted administration.
INSERT INTO "user_role_assignments" (
    "id", "userId", "role", "departmentScopeMode", "projectScopeMode", "updatedAt"
)
SELECT
    'legacy-' || MD5("id" || ':ADMIN'),
    "id",
    'ADMIN'::"app_role",
    'ALL'::"scope_mode",
    'ALL'::"scope_mode",
    CURRENT_TIMESTAMP
FROM "users"
WHERE "role" = 'ADMIN';

-- Legacy EDITOR was a global writer in every business module except users.
-- Multiple built-in assignments preserve that access without making it admin.
INSERT INTO "user_role_assignments" (
    "id", "userId", "role", "departmentScopeMode", "projectScopeMode", "updatedAt"
)
SELECT
    'legacy-' || MD5("id" || ':' || role_name),
    "id",
    role_name::"app_role",
    department_mode::"scope_mode",
    project_mode::"scope_mode",
    CURRENT_TIMESTAMP
FROM "users"
CROSS JOIN (
    VALUES
        ('HR', 'ALL', 'NONE'),
        ('ACCOUNTANT', 'ALL', 'ALL'),
        ('PROJECT_MANAGER', 'NONE', 'ALL'),
        ('ASSET_CUSTODIAN', 'ALL', 'NONE')
) AS legacy_roles(role_name, department_mode, project_mode)
WHERE "role" = 'EDITOR';

-- AUDITOR mirrors the previous global read-only business access. User
-- administration remains ADMIN-only.
INSERT INTO "user_role_assignments" (
    "id", "userId", "role", "departmentScopeMode", "projectScopeMode", "updatedAt"
)
SELECT
    'legacy-' || MD5("id" || ':AUDITOR'),
    "id",
    'AUDITOR'::"app_role",
    'ALL'::"scope_mode",
    'ALL'::"scope_mode",
    CURRENT_TIMESTAMP
FROM "users"
WHERE "role" = 'VIEWER';
