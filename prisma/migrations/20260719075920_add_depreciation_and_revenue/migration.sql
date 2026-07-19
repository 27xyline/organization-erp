-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "initialCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "usefulLifeMonths" INTEGER NOT NULL DEFAULT 60;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "actualRevenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "plannedRevenue" DECIMAL(12,2) NOT NULL DEFAULT 0;
