BEGIN;

CREATE TYPE "procurement_status" AS ENUM (
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'CONTRACTED',
  'PARTIALLY_DELIVERED',
  'DELIVERED',
  'CAPITALIZED',
  'REJECTED',
  'CANCELLED'
);

CREATE TABLE "suppliers" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "taxId" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "address" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "procurement_requests" (
  "id" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" "procurement_status" NOT NULL DEFAULT 'DRAFT',
  "budgetLimit" DECIMAL(12,2) NOT NULL,
  "neededBy" DATE,
  "projectId" TEXT,
  "requestedById" TEXT NOT NULL,
  "approvalRequestId" TEXT,
  "documentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "procurement_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "procurement_requests_budget_check" CHECK ("budgetLimit" > 0)
);

CREATE TABLE "procurement_items" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "quantity" DECIMAL(10,2) NOT NULL,
  "unit" TEXT NOT NULL,
  "unitPrice" DECIMAL(12,2) NOT NULL,
  "groupId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "procurement_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "procurement_items_values_check" CHECK ("quantity" > 0 AND "unitPrice" > 0)
);

CREATE TABLE "procurement_contracts" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "signedAt" DATE NOT NULL,
  "deliveryDueAt" DATE NOT NULL,
  "documentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "procurement_contracts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "procurement_contracts_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "procurement_contracts_dates_check" CHECK ("deliveryDueAt" >= "signedAt")
);

CREATE TABLE "procurement_deliveries" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "receivedAt" DATE NOT NULL,
  "note" TEXT,
  "documentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "procurement_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "procurement_delivery_items" (
  "id" TEXT NOT NULL,
  "deliveryId" TEXT NOT NULL,
  "procurementItemId" TEXT NOT NULL,
  "quantity" DECIMAL(10,2) NOT NULL,
  "assetId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "procurement_delivery_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "procurement_delivery_items_quantity_check" CHECK ("quantity" > 0)
);

CREATE UNIQUE INDEX "suppliers_taxId_key" ON "suppliers"("taxId");
CREATE INDEX "suppliers_isActive_name_idx" ON "suppliers"("isActive", "name");
CREATE UNIQUE INDEX "procurement_requests_number_key" ON "procurement_requests"("number");
CREATE UNIQUE INDEX "procurement_requests_approvalRequestId_key" ON "procurement_requests"("approvalRequestId");
CREATE INDEX "procurement_requests_status_neededBy_idx" ON "procurement_requests"("status", "neededBy");
CREATE INDEX "procurement_requests_projectId_status_idx" ON "procurement_requests"("projectId", "status");
CREATE INDEX "procurement_requests_requestedById_createdAt_idx" ON "procurement_requests"("requestedById", "createdAt");
CREATE INDEX "procurement_requests_documentId_idx" ON "procurement_requests"("documentId");
CREATE INDEX "procurement_items_requestId_idx" ON "procurement_items"("requestId");
CREATE INDEX "procurement_items_groupId_idx" ON "procurement_items"("groupId");
CREATE UNIQUE INDEX "procurement_contracts_requestId_key" ON "procurement_contracts"("requestId");
CREATE UNIQUE INDEX "procurement_contracts_number_key" ON "procurement_contracts"("number");
CREATE INDEX "procurement_contracts_supplierId_idx" ON "procurement_contracts"("supplierId");
CREATE INDEX "procurement_contracts_deliveryDueAt_idx" ON "procurement_contracts"("deliveryDueAt");
CREATE INDEX "procurement_contracts_documentId_idx" ON "procurement_contracts"("documentId");
CREATE UNIQUE INDEX "procurement_deliveries_contractId_number_key" ON "procurement_deliveries"("contractId", "number");
CREATE INDEX "procurement_deliveries_requestId_receivedAt_idx" ON "procurement_deliveries"("requestId", "receivedAt");
CREATE INDEX "procurement_deliveries_documentId_idx" ON "procurement_deliveries"("documentId");
CREATE UNIQUE INDEX "procurement_delivery_items_assetId_key" ON "procurement_delivery_items"("assetId");
CREATE UNIQUE INDEX "procurement_delivery_items_deliveryId_procurementItemId_key"
  ON "procurement_delivery_items"("deliveryId", "procurementItemId");
CREATE INDEX "procurement_delivery_items_procurementItemId_idx"
  ON "procurement_delivery_items"("procurementItemId");

ALTER TABLE "procurement_requests"
  ADD CONSTRAINT "procurement_requests_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "procurement_requests"
  ADD CONSTRAINT "procurement_requests_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "procurement_requests"
  ADD CONSTRAINT "procurement_requests_approvalRequestId_fkey"
  FOREIGN KEY ("approvalRequestId") REFERENCES "approval_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "procurement_requests"
  ADD CONSTRAINT "procurement_requests_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "procurement_items"
  ADD CONSTRAINT "procurement_items_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "procurement_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "procurement_items"
  ADD CONSTRAINT "procurement_items_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "asset_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "procurement_contracts"
  ADD CONSTRAINT "procurement_contracts_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "procurement_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "procurement_contracts"
  ADD CONSTRAINT "procurement_contracts_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "procurement_contracts"
  ADD CONSTRAINT "procurement_contracts_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "procurement_deliveries"
  ADD CONSTRAINT "procurement_deliveries_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "procurement_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "procurement_deliveries"
  ADD CONSTRAINT "procurement_deliveries_contractId_fkey"
  FOREIGN KEY ("contractId") REFERENCES "procurement_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "procurement_deliveries"
  ADD CONSTRAINT "procurement_deliveries_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "procurement_delivery_items"
  ADD CONSTRAINT "procurement_delivery_items_deliveryId_fkey"
  FOREIGN KEY ("deliveryId") REFERENCES "procurement_deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "procurement_delivery_items"
  ADD CONSTRAINT "procurement_delivery_items_procurementItemId_fkey"
  FOREIGN KEY ("procurementItemId") REFERENCES "procurement_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "procurement_delivery_items"
  ADD CONSTRAINT "procurement_delivery_items_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
