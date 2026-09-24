CREATE TABLE "asset_saved_views" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_saved_views_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "asset_saved_views_userId_name_key"
ON "asset_saved_views"("userId", "name");

CREATE INDEX "asset_saved_views_userId_updatedAt_idx"
ON "asset_saved_views"("userId", "updatedAt");

ALTER TABLE "asset_saved_views"
ADD CONSTRAINT "asset_saved_views_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
