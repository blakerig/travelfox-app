/*
  Warnings:

  - You are about to drop the column `icon` on the `City` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "City" DROP COLUMN "icon";

-- AlterTable
ALTER TABLE "Entry" ADD COLUMN     "icon" TEXT;
