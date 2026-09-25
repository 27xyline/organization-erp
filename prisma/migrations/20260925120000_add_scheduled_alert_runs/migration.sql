CREATE TABLE "scheduled_alert_runs" (
  "key" TEXT NOT NULL,
  "lastStartedAt" TIMESTAMP(3),
  "lastSucceededAt" TIMESTAMP(3),
  "lastError" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "scheduled_alert_runs_pkey" PRIMARY KEY ("key")
);
