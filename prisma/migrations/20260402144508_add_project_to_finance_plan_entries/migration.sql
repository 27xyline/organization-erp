-- AlterTable
ALTER TABLE "finance_plan_entries" ADD COLUMN     "projectId" TEXT;

-- AddForeignKey
ALTER TABLE "finance_plan_entries" ADD CONSTRAINT "finance_plan_entries_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
