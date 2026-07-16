-- RedefineForeignKey
ALTER TABLE "finance_plan_entries" DROP CONSTRAINT "finance_plan_entries_projectId_fkey";

ALTER TABLE "finance_plan_entries" ADD CONSTRAINT "finance_plan_entries_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
