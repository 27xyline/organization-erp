-- CreateEnum
CREATE TYPE "asset_status" AS ENUM ('IN_STOCK', 'IN_USE', 'UNDER_REPAIR', 'PLANNED_FOR_DISPOSAL', 'PARTIALLY_DISPOSED', 'FULLY_DISPOSED');

-- CreateEnum
CREATE TYPE "operation_type" AS ENUM ('RECEIPT', 'TRANSFER', 'DISPOSAL', 'STATUS_CHANGE');

-- CreateTable
CREATE TABLE "mols" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "storageLocation" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mols_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "orderNumber" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "inventoryNumber" TEXT NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "unitOfMeasure" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "totalCost" DECIMAL(12,2) NOT NULL,
    "molId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "contractCode" TEXT,
    "internalFundingCode" TEXT,
    "isExistingAsset" BOOLEAN NOT NULL DEFAULT false,
    "recordingDate" TIMESTAMP(3) NOT NULL,
    "documentType" TEXT NOT NULL,
    "documentDetails" TEXT NOT NULL,
    "documentFiles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "asset_status" NOT NULL DEFAULT 'IN_STOCK',
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "plannedDisposalDate" TIMESTAMP(3),
    "plannedDisposalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operations" (
    "id" TEXT NOT NULL,
    "type" "operation_type" NOT NULL,
    "assetId" TEXT NOT NULL,
    "fromMolId" TEXT,
    "toMolId" TEXT,
    "quantity" DECIMAL(10,2) NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "totalCost" DECIMAL(12,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "documentType" TEXT NOT NULL,
    "documentDetails" TEXT NOT NULL,
    "documentFiles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "oldStatus" "asset_status",
    "newStatus" "asset_status",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mols_code_key" ON "mols"("code");

-- CreateIndex
CREATE UNIQUE INDEX "asset_groups_name_key" ON "asset_groups"("name");

-- CreateIndex
CREATE UNIQUE INDEX "asset_groups_code_key" ON "asset_groups"("code");

-- CreateIndex
CREATE UNIQUE INDEX "assets_inventoryNumber_key" ON "assets"("inventoryNumber");

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_molId_fkey" FOREIGN KEY ("molId") REFERENCES "mols"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "asset_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operations" ADD CONSTRAINT "operations_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operations" ADD CONSTRAINT "operations_fromMolId_fkey" FOREIGN KEY ("fromMolId") REFERENCES "mols"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operations" ADD CONSTRAINT "operations_toMolId_fkey" FOREIGN KEY ("toMolId") REFERENCES "mols"("id") ON DELETE SET NULL ON UPDATE CASCADE;
