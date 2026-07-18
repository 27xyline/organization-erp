BEGIN;

CREATE TYPE "task_priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "task_risk" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

ALTER TABLE "tasks"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "isMilestone" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "priority" "task_priority" NOT NULL DEFAULT 'MEDIUM',
  ADD COLUMN "risk" "task_risk" NOT NULL DEFAULT 'LOW';

CREATE TABLE "task_dependencies" (
  "id" TEXT NOT NULL,
  "predecessorId" TEXT NOT NULL,
  "successorId" TEXT NOT NULL,
  "lagDays" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_dependencies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "task_dependencies_not_self_check" CHECK ("predecessorId" <> "successorId"),
  CONSTRAINT "task_dependencies_lag_check" CHECK ("lagDays" >= 0)
);

CREATE TABLE "task_checklist_items" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "completed" BOOLEAN NOT NULL DEFAULT false,
  "order" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "task_checklist_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "task_checklist_items_order_check" CHECK ("order" >= 0)
);

CREATE TABLE "task_comments" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "task_comments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "task_dependencies_successorId_idx" ON "task_dependencies"("successorId");
CREATE UNIQUE INDEX "task_dependencies_predecessorId_successorId_key" ON "task_dependencies"("predecessorId", "successorId");
CREATE INDEX "task_checklist_items_taskId_order_idx" ON "task_checklist_items"("taskId", "order");
CREATE INDEX "task_comments_taskId_createdAt_idx" ON "task_comments"("taskId", "createdAt");
CREATE INDEX "task_comments_authorId_createdAt_idx" ON "task_comments"("authorId", "createdAt");

ALTER TABLE "task_dependencies"
  ADD CONSTRAINT "task_dependencies_predecessorId_fkey"
  FOREIGN KEY ("predecessorId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_dependencies"
  ADD CONSTRAINT "task_dependencies_successorId_fkey"
  FOREIGN KEY ("successorId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_checklist_items"
  ADD CONSTRAINT "task_checklist_items_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_comments"
  ADD CONSTRAINT "task_comments_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_comments"
  ADD CONSTRAINT "task_comments_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
