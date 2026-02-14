-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "notes" TEXT,
ADD COLUMN     "photos" TEXT[] DEFAULT ARRAY[]::TEXT[];
