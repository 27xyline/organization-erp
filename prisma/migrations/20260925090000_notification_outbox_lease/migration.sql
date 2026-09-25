ALTER TABLE "notification_outbox"
  ADD COLUMN "claimToken" TEXT,
  ADD COLUMN "leaseExpiresAt" TIMESTAMP(3);

CREATE INDEX "notification_outbox_status_leaseExpiresAt_idx"
  ON "notification_outbox"("status", "leaseExpiresAt");
