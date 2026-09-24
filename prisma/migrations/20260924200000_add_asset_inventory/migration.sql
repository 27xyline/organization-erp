CREATE TYPE "asset_inventory_status" AS ENUM ('IN_PROGRESS', 'COMPLETED');

CREATE TABLE "asset_inventories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "asset_inventory_status" NOT NULL DEFAULT 'IN_PROGRESS',
    "molId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "asset_inventories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "asset_inventory_entries" (
    "id" TEXT NOT NULL,
    "inventoryId" TEXT NOT NULL,
    "assetId" TEXT,
    "inventoryNumber" TEXT NOT NULL,
    "assetName" TEXT NOT NULL,
    "unitOfMeasure" TEXT NOT NULL,
    "expectedQuantity" DECIMAL(10,2) NOT NULL,
    "foundQuantity" DECIMAL(10,2),
    "note" TEXT,
    "scannedById" TEXT,
    "scannedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_inventory_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "asset_inventories_molId_status_createdAt_idx"
ON "asset_inventories"("molId", "status", "createdAt");

CREATE UNIQUE INDEX "asset_inventory_entries_inventoryId_inventoryNumber_key"
ON "asset_inventory_entries"("inventoryId", "inventoryNumber");

CREATE INDEX "asset_inventory_entries_inventoryId_scannedAt_idx"
ON "asset_inventory_entries"("inventoryId", "scannedAt");

ALTER TABLE "asset_inventories"
ADD CONSTRAINT "asset_inventories_molId_fkey"
FOREIGN KEY ("molId") REFERENCES "mols"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "asset_inventories"
ADD CONSTRAINT "asset_inventories_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "asset_inventory_entries"
ADD CONSTRAINT "asset_inventory_entries_inventoryId_fkey"
FOREIGN KEY ("inventoryId") REFERENCES "asset_inventories"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "asset_inventory_entries"
ADD CONSTRAINT "asset_inventory_entries_assetId_fkey"
FOREIGN KEY ("assetId") REFERENCES "assets"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "asset_inventory_entries"
ADD CONSTRAINT "asset_inventory_entries_scannedById_fkey"
FOREIGN KEY ("scannedById") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
