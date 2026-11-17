-- One-off repair for the LOCAL database only (2026-11-17).
--
-- The local travelapp database had lost its "Neighbourhood" (Areas) table,
-- while Prisma's _prisma_migrations record still listed both Areas
-- migrations as applied - so `prisma migrate status` reported "up to date"
-- and Prisma would never recreate it. This creates the table exactly as
-- those two migrations would have left it:
--   20260831175722_add_neighbourhood
--   20261117140000_add_neighbourhood_editor_fields
-- Safe to re-run: every statement is skipped if the thing already exists.
-- Touches no other table. Do NOT run against Neon.
--
-- Run from the repo root in PowerShell:
--   Get-Content server\repair-local-neighbourhood-table.sql | docker exec -i travel-app-db psql -U postgres -d travelapp

CREATE TABLE IF NOT EXISTS "Neighbourhood" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "cityId" INTEGER NOT NULL,
    "bestFor" TEXT,
    "eatDrink" TEXT,
    "gettingThere" TEXT,
    "headsUp" TEXT,
    "highlights" TEXT,
    "notes" TEXT,
    "photoUrl" TEXT,
    "status" "EntryStatus" NOT NULL DEFAULT 'DRAFT',
    "summary" TEXT,

    CONSTRAINT "Neighbourhood_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Neighbourhood_cityId_slug_key" ON "Neighbourhood"("cityId", "slug");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Neighbourhood_cityId_fkey'
    ) THEN
        ALTER TABLE "Neighbourhood" ADD CONSTRAINT "Neighbourhood_cityId_fkey"
            FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- Show the result so you can see it worked.
\d "Neighbourhood"
