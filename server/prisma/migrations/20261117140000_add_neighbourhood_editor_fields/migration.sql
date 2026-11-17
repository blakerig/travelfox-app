-- AlterTable
ALTER TABLE "Neighbourhood" ADD COLUMN     "bestFor" TEXT,
ADD COLUMN     "eatDrink" TEXT,
ADD COLUMN     "gettingThere" TEXT,
ADD COLUMN     "headsUp" TEXT,
ADD COLUMN     "highlights" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "photoUrl" TEXT,
ADD COLUMN     "status" "EntryStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "summary" TEXT;

-- Backfill: Areas that already exist were visible to everyone before this
-- migration, so keep them visible. New Areas start as DRAFT (the default).
UPDATE "Neighbourhood" SET "status" = 'PUBLISHED';
