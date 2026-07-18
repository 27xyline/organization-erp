CREATE TYPE "notification_event_type" AS ENUM (
  'SYSTEM',
  'CONTRACT_EXPIRING',
  'TASK_OVERDUE',
  'ASSET_DISPOSAL_DUE',
  'BUDGET_OVERRUN'
);

CREATE TYPE "notification_channel" AS ENUM ('IN_APP', 'EMAIL');

CREATE TYPE "notification_outbox_status" AS ENUM (
  'PENDING',
  'PROCESSING',
  'SENT',
  'FAILED',
  'SKIPPED'
);

CREATE TABLE "notifications" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "eventType" "notification_event_type" NOT NULL,
  "channel" "notification_channel" NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "targetUrl" TEXT,
  "entityType" TEXT,
  "entityId" TEXT,
  "dedupeKey" TEXT NOT NULL,
  "readAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notifications_title_not_blank" CHECK (length(btrim("title")) > 0),
  CONSTRAINT "notifications_dedupe_key_not_blank" CHECK (length(btrim("dedupeKey")) > 0),
  CONSTRAINT "notifications_read_at_in_app_only" CHECK ("readAt" IS NULL OR "channel" = 'IN_APP')
);

CREATE TABLE "notification_preferences" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "eventType" "notification_event_type" NOT NULL,
  "channel" "notification_channel" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_outbox" (
  "id" TEXT NOT NULL,
  "notificationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "notification_outbox_status" NOT NULL DEFAULT 'PENDING',
  "payload" JSONB NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "notification_outbox_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notification_outbox_attempts_nonnegative" CHECK ("attempts" >= 0)
);

CREATE UNIQUE INDEX "notifications_userId_dedupeKey_channel_key"
  ON "notifications"("userId", "dedupeKey", "channel");
CREATE INDEX "notifications_userId_channel_deletedAt_readAt_createdAt_idx"
  ON "notifications"("userId", "channel", "deletedAt", "readAt", "createdAt");
CREATE INDEX "notifications_eventType_createdAt_idx"
  ON "notifications"("eventType", "createdAt");

CREATE UNIQUE INDEX "notification_preferences_userId_eventType_channel_key"
  ON "notification_preferences"("userId", "eventType", "channel");
CREATE INDEX "notification_preferences_userId_channel_idx"
  ON "notification_preferences"("userId", "channel");

CREATE UNIQUE INDEX "notification_outbox_notificationId_key"
  ON "notification_outbox"("notificationId");
CREATE INDEX "notification_outbox_status_availableAt_createdAt_idx"
  ON "notification_outbox"("status", "availableAt", "createdAt");
CREATE INDEX "notification_outbox_userId_createdAt_idx"
  ON "notification_outbox"("userId", "createdAt");

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notification_preferences"
  ADD CONSTRAINT "notification_preferences_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notification_outbox"
  ADD CONSTRAINT "notification_outbox_notificationId_fkey"
  FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "notification_outbox_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
