-- DropForeignKey
ALTER TABLE "vacations" DROP CONSTRAINT "vacations_employeeId_fkey";

-- AlterTable
ALTER TABLE "staff_schedule" ALTER COLUMN "rate" SET DATA TYPE DECIMAL(5,2);

-- CreateIndex
CREATE INDEX "assets_molId_idx" ON "assets"("molId");

-- CreateIndex
CREATE INDEX "assets_groupId_idx" ON "assets"("groupId");

-- CreateIndex
CREATE INDEX "assets_status_idx" ON "assets"("status");

-- CreateIndex
CREATE INDEX "assets_isArchived_status_idx" ON "assets"("isArchived", "status");

-- CreateIndex
CREATE INDEX "assets_projectId_idx" ON "assets"("projectId");

-- AddForeignKey
ALTER TABLE "vacations" ADD CONSTRAINT "vacations_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
