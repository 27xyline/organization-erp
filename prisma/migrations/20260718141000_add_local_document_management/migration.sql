BEGIN;

CREATE TYPE "document_status" AS ENUM (
    'DRAFT',
    'IN_REVIEW',
    'APPROVED',
    'SIGNED',
    'ARCHIVED'
);

CREATE TYPE "document_category" AS ENUM (
    'GENERAL',
    'CONTRACT',
    'ORDER',
    'ACT',
    'INVOICE',
    'PERSONNEL',
    'PROJECT',
    'ASSET',
    'OTHER'
);

CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "document_category" NOT NULL DEFAULT 'GENERAL',
    "status" "document_status" NOT NULL DEFAULT 'DRAFT',
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "lockVersion" INTEGER NOT NULL DEFAULT 1,
    "projectId" TEXT,
    "employeeId" TEXT,
    "assetId" TEXT,
    "createdById" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "documents_title_not_blank" CHECK (LENGTH(BTRIM("title")) > 0),
    CONSTRAINT "documents_currentVersion_positive" CHECK ("currentVersion" > 0),
    CONSTRAINT "documents_lockVersion_positive" CHECK ("lockVersion" > 0),
    CONSTRAINT "documents_archive_consistent" CHECK (
        ("status" = 'ARCHIVED' AND "archivedAt" IS NOT NULL)
        OR ("status" <> 'ARCHIVED' AND "archivedAt" IS NULL)
    )
);

CREATE TABLE "document_versions" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "extension" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "sha256" TEXT NOT NULL,
    "comment" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "document_versions_number_positive" CHECK ("versionNumber" > 0),
    CONSTRAINT "document_versions_size_valid" CHECK (
        "sizeBytes" > 0 AND "sizeBytes" <= 104857600
    ),
    CONSTRAINT "document_versions_filename_not_blank" CHECK (
        LENGTH(BTRIM("originalFilename")) > 0
    ),
    CONSTRAINT "document_versions_mime_not_blank" CHECK (
        LENGTH(BTRIM("mimeType")) > 0
    ),
    CONSTRAINT "document_versions_extension_safe" CHECK (
        "extension" ~ '^[a-z0-9]{1,10}$'
    ),
    CONSTRAINT "document_versions_sha256_valid" CHECK (
        "sha256" ~ '^[0-9a-f]{64}$'
    ),
    CONSTRAINT "document_versions_storage_key_safe" CHECK (
        "storageKey" ~ '^[0-9a-f]{2}/[0-9a-f]{2}/[0-9a-f-]{36}$'
    )
);

CREATE UNIQUE INDEX "document_versions_storageKey_key"
    ON "document_versions"("storageKey");
CREATE UNIQUE INDEX "document_versions_documentId_versionNumber_key"
    ON "document_versions"("documentId", "versionNumber");
CREATE INDEX "document_versions_documentId_createdAt_idx"
    ON "document_versions"("documentId", "createdAt");
CREATE INDEX "document_versions_uploadedById_idx"
    ON "document_versions"("uploadedById");

CREATE INDEX "documents_status_updatedAt_idx"
    ON "documents"("status", "updatedAt");
CREATE INDEX "documents_category_updatedAt_idx"
    ON "documents"("category", "updatedAt");
CREATE INDEX "documents_projectId_idx" ON "documents"("projectId");
CREATE INDEX "documents_employeeId_idx" ON "documents"("employeeId");
CREATE INDEX "documents_assetId_idx" ON "documents"("assetId");
CREATE INDEX "documents_createdById_idx" ON "documents"("createdById");
CREATE INDEX "documents_archivedAt_updatedAt_idx"
    ON "documents"("archivedAt", "updatedAt");

ALTER TABLE "documents"
    ADD CONSTRAINT "documents_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "projects"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "documents_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "employees"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "documents_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "assets"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "documents_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "document_versions"
    ADD CONSTRAINT "document_versions_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "documents"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "document_versions_uploadedById_fkey"
    FOREIGN KEY ("uploadedById") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "prevent_document_version_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Document versions are immutable'
        USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "document_versions_immutable"
BEFORE UPDATE OR DELETE ON "document_versions"
FOR EACH ROW
EXECUTE FUNCTION "prevent_document_version_mutation"();

CREATE FUNCTION "ensure_document_current_version"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM "document_versions" version
        WHERE version."documentId" = NEW."id"
          AND version."versionNumber" = NEW."currentVersion"
    ) THEN
        RAISE EXCEPTION 'Current document version does not exist'
            USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "documents_current_version_exists"
AFTER INSERT OR UPDATE OF "currentVersion" ON "documents"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "ensure_document_current_version"();

COMMIT;
