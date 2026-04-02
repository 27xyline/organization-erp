-- CreateEnum
CREATE TYPE "finance_plan_type" AS ENUM ('OKLAD', 'NADBAVKA');

-- CreateTable
CREATE TABLE "finance_plan_entries" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "type" "finance_plan_type" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_plan_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "finance_plan_entries_year_month_type_idx" ON "finance_plan_entries"("year", "month", "type");

-- CreateIndex
CREATE UNIQUE INDEX "finance_plan_entries_employeeId_year_month_type_key" ON "finance_plan_entries"("employeeId", "year", "month", "type");

-- AddForeignKey
ALTER TABLE "finance_plan_entries" ADD CONSTRAINT "finance_plan_entries_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
