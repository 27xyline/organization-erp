CREATE TABLE "approval_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "approval_templates_name_key"
ON "approval_templates"("name");

CREATE INDEX "approval_templates_isActive_name_idx"
ON "approval_templates"("isActive", "name");

ALTER TABLE "approval_templates"
ADD CONSTRAINT "approval_templates_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
