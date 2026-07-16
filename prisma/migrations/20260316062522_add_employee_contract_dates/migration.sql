-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "contractEndDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "personnel_actions" ADD COLUMN     "newContractEndDate" TIMESTAMP(3),
ADD COLUMN     "oldContractEndDate" TIMESTAMP(3);
