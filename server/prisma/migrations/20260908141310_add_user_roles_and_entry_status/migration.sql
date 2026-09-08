-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'EDITOR', 'CREATOR');

-- CreateEnum
CREATE TYPE "EntryStatus" AS ENUM ('DRAFT', 'AWAITING_REVIEW', 'PUBLISHED');

-- AlterTable
ALTER TABLE "Entry" ADD COLUMN     "status" "EntryStatus" NOT NULL DEFAULT 'DRAFT';

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
