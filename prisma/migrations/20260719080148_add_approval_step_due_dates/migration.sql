-- AlterTable
ALTER TABLE "approval_steps" ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "reminderSent" BOOLEAN NOT NULL DEFAULT false;
