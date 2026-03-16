-- CreateEnum
CREATE TYPE "employment_contract_type" AS ENUM ('PRIMARY', 'INTERNAL', 'EXTERNAL');

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "contractNumber" TEXT,
ADD COLUMN     "contractSignedDate" TIMESTAMP(3),
ADD COLUMN     "contractType" "employment_contract_type" NOT NULL DEFAULT 'PRIMARY';
