-- CreateTable
CREATE TABLE "salary_entries" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "salary_entries_year_month_idx" ON "salary_entries"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "salary_entries_employeeId_year_month_key" ON "salary_entries"("employeeId", "year", "month");

-- AddForeignKey
ALTER TABLE "salary_entries" ADD CONSTRAINT "salary_entries_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
