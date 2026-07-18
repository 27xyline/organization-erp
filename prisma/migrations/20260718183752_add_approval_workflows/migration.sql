BEGIN;

ALTER TYPE "notification_event_type" ADD VALUE IF NOT EXISTS 'APPROVAL_REQUESTED';
ALTER TYPE "notification_event_type" ADD VALUE IF NOT EXISTS 'APPROVAL_DECIDED';

-- CreateEnum
CREATE TYPE "approval_request_status" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "approval_step_status" AS ENUM ('WAITING', 'PENDING', 'APPROVED', 'REJECTED', 'SKIPPED');

-- CreateTable
CREATE TABLE "approval_requests" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "status" "approval_request_status" NOT NULL DEFAULT 'DRAFT',
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lockVersion" INTEGER NOT NULL DEFAULT 1,
    "requestedById" TEXT NOT NULL,
    "documentId" TEXT,
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "approval_requests_current_step_check" CHECK ("currentStep" >= 0),
    CONSTRAINT "approval_requests_lock_version_check" CHECK ("lockVersion" >= 1)
);

-- CreateTable
CREATE TABLE "approval_steps" (
    "id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "status" "approval_step_status" NOT NULL DEFAULT 'WAITING',
    "comment" TEXT,
    "decidedAt" TIMESTAMP(3),
    "requestId" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_steps_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "approval_steps_sequence_check" CHECK ("sequence" > 0)
);

-- CreateIndex
CREATE INDEX "approval_requests_requestedById_status_createdAt_idx" ON "approval_requests"("requestedById", "status", "createdAt");

-- CreateIndex
CREATE INDEX "approval_requests_status_dueAt_idx" ON "approval_requests"("status", "dueAt");

-- CreateIndex
CREATE INDEX "approval_requests_documentId_idx" ON "approval_requests"("documentId");

-- CreateIndex
CREATE INDEX "approval_requests_projectId_idx" ON "approval_requests"("projectId");

-- CreateIndex
CREATE INDEX "approval_requests_entityType_entityId_idx" ON "approval_requests"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "approval_steps_approverId_status_createdAt_idx" ON "approval_steps"("approverId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "approval_steps_requestId_status_idx" ON "approval_steps"("requestId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "approval_steps_requestId_sequence_key" ON "approval_steps"("requestId", "sequence");

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "approval_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
