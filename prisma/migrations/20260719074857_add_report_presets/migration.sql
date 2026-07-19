-- CreateTable
CREATE TABLE "report_presets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "metrics" TEXT[],
    "groupBy" TEXT,
    "filters" JSONB,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_presets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "report_presets_createdById_idx" ON "report_presets"("createdById");

-- AddForeignKey
ALTER TABLE "report_presets" ADD CONSTRAINT "report_presets_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
