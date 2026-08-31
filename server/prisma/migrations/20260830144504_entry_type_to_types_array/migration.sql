/*
  Warnings:

  - You are about to drop the column `type` on the `Entry` table. All the data in the column will be lost.

*/

-- Add the new column
ALTER TABLE "Entry" ADD COLUMN "types" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Carry every existing type value into the new array column
UPDATE "Entry" SET "types" = ARRAY["type"] WHERE "type" IS NOT NULL;

-- Now safe to drop the old column
ALTER TABLE "Entry" DROP COLUMN "type";