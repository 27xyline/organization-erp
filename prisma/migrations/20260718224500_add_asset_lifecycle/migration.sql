BEGIN;

ALTER TYPE "notification_event_type" ADD VALUE IF NOT EXISTS 'ASSET_MAINTENANCE_DUE';

CREATE TYPE "asset_maintenance_type" AS ENUM (
  'INSPECTION',
  'CALIBRATION',
  'REPAIR',
  'SERVICE'
);

CREATE TYPE "asset_maintenance_status" AS ENUM (
  'PLANNED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELED'
);

CREATE TABLE "asset_maintenance" (
  "id" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "type" "asset_maintenance_type" NOT NULL,
  "status" "asset_maintenance_status" NOT NULL DEFAULT 'PLANNED',
  "title" TEXT NOT NULL,
  "description" TEXT,
  "scheduledDate" DATE NOT NULL,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "nextDueDate" DATE,
  "provider" TEXT,
  "cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "result" TEXT,
  "assetStatusBefore" "asset_status",
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "asset_maintenance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "asset_maintenance_cost_check" CHECK ("cost" >= 0)
);

CREATE INDEX "asset_maintenance_assetId_scheduledDate_idx"
  ON "asset_maintenance"("assetId", "scheduledDate");
CREATE INDEX "asset_maintenance_status_scheduledDate_idx"
  ON "asset_maintenance"("status", "scheduledDate");
CREATE INDEX "asset_maintenance_nextDueDate_idx"
  ON "asset_maintenance"("nextDueDate");

ALTER TABLE "asset_maintenance"
  ADD CONSTRAINT "asset_maintenance_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
